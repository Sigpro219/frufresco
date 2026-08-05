-- Migration: Hardening Audit Logs Security & Immutability

-- 1. Enforce strict Append-Only immutability on public.audit_logs
CREATE OR REPLACE FUNCTION public.proc_prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit log entries are strictly immutable and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_update_delete ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_update_delete
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.proc_prevent_audit_modification();

-- 2. Hardened RPC function for authentication events
CREATE OR REPLACE FUNCTION public.log_user_auth_event(
    p_action text,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void AS $$
DECLARE
    v_user_id uuid;
    v_collab_id uuid;
    v_user_name text;
    v_safe_action text;
BEGIN
    v_user_id := auth.uid();
    
    -- Validate action to prevent parameter tampering
    IF p_action NOT IN ('LOGIN', 'LOGOUT', 'USER_LOGIN', 'USER_LOGOUT') THEN
        v_safe_action := 'AUTH_EVENT';
    ELSE
        v_safe_action := p_action;
    END IF;

    -- Resolve user name authoritatively from session profiles table
    IF v_user_id IS NOT NULL THEN
        SELECT 
            COALESCE(contact_name, company_name, email, v_user_id::text),
            collaborator_id
        INTO 
            v_user_name,
            v_collab_id
        FROM public.profiles
        WHERE id = v_user_id;
    END IF;

    IF v_user_name IS NULL THEN
        IF v_user_id IS NOT NULL THEN
            v_user_name := 'Authenticated User (' || v_user_id::text || ')';
        ELSE
            v_user_name := 'Usuario Desconocido';
        END IF;
    END IF;

    IF v_collab_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.collaborators WHERE id = v_collab_id) THEN
            v_collab_id := NULL;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (collaborator_id, collaborator_name, action, module, details)
    VALUES (v_collab_id, v_user_name, v_safe_action, 'SECURITY', p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permission
GRANT EXECUTE ON FUNCTION public.log_user_auth_event(text, jsonb) TO authenticated, anon;

-- Remove direct INSERT policy on audit_logs from clients
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
