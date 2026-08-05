-- Migration: Add auth event logging helper function & audit_logs RLS insert policy

-- 1. Helper RPC function to log authentication events safely (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.log_user_auth_event(
    p_action text,
    p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void AS $$
DECLARE
    v_user_id uuid;
    v_collab_id uuid;
    v_user_name text;
BEGIN
    v_user_id := auth.uid();
    
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

    -- Fallback name if profile name not found
    IF v_user_name IS NULL THEN
        IF v_user_id IS NOT NULL THEN
            v_user_name := 'Authenticated User (' || v_user_id::text || ')';
        ELSE
            v_user_name := COALESCE(p_details->>'email', 'Usuario');
        END IF;
    END IF;

    -- Verify collaborator_id existence
    IF v_collab_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.collaborators WHERE id = v_collab_id) THEN
            v_collab_id := NULL;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (collaborator_id, collaborator_name, action, module, details)
    VALUES (v_collab_id, v_user_name, p_action, 'SECURITY', p_details);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Grant execute permission to authenticated and anon roles
GRANT EXECUTE ON FUNCTION public.log_user_auth_event(text, jsonb) TO authenticated, anon;

-- 3. Allow authenticated users to INSERT into public.audit_logs directly if needed
DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);
