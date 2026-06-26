-- Create or update the audit function to capture mutations dynamically.
CREATE OR REPLACE FUNCTION public.proc_log_audit()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id uuid;
    v_collab_id uuid;
    v_user_name text;
    v_action text;
    v_module text;
    v_details jsonb;
BEGIN
    -- Resolve authenticated session user
    v_user_id := auth.uid();
    
    -- Cross-reference profile details or use parameters directly to avoid transaction recursion on same table
    IF TG_TABLE_NAME = 'profiles' THEN
        IF TG_OP = 'DELETE' THEN
            v_user_name := COALESCE(OLD.contact_name, OLD.company_name, OLD.email, v_user_id::text);
            v_collab_id := OLD.collaborator_id;
        ELSE
            v_user_name := COALESCE(NEW.contact_name, NEW.company_name, NEW.email, v_user_id::text);
            v_collab_id := NEW.collaborator_id;
        END IF;
    ELSIF v_user_id IS NOT NULL THEN
        SELECT 
            COALESCE(contact_name, company_name, email, v_user_id::text),
            collaborator_id
        INTO 
            v_user_name,
            v_collab_id
        FROM public.profiles
        WHERE id = v_user_id;
    END IF;

    -- Fallback name
    IF v_user_name IS NULL THEN
        IF v_user_id IS NOT NULL THEN
            v_user_name := 'Authenticated User (' || v_user_id::text || ')';
        ELSE
            v_user_name := 'System / DB Direct';
        END IF;
    END IF;

    -- Verify that the collaborator_id exists in public.collaborators to prevent foreign key violations.
    -- If it does not exist, safe fallback to NULL.
    IF v_collab_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.collaborators WHERE id = v_collab_id) THEN
            v_collab_id := NULL;
        END IF;
    END IF;

    -- Format action name
    v_action := TG_OP || '_' || TG_TABLE_NAME;
    
    -- Capture detail snapshot contextually
    IF TG_TABLE_NAME = 'products' THEN
        v_module := 'PRODUCTS';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('sku', OLD.sku, 'name', OLD.name);
        ELSE
            v_details := jsonb_build_object('sku', NEW.sku, 'name', NEW.name);
        END IF;
    ELSIF TG_TABLE_NAME = 'profiles' THEN
        v_module := 'SECURITY';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('role', OLD.role, 'company_name', OLD.company_name, 'contact_name', OLD.contact_name);
        ELSE
            v_details := jsonb_build_object('role', NEW.role, 'company_name', NEW.company_name, 'contact_name', NEW.contact_name);
        END IF;
    ELSIF TG_TABLE_NAME = 'orders' THEN
        v_module := 'ORDERS';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('id', OLD.id, 'sequence_id', OLD.sequence_id, 'total_price', OLD.total_price, 'status', OLD.status);
        ELSE
            v_details := jsonb_build_object('id', NEW.id, 'sequence_id', NEW.sequence_id, 'total_price', NEW.total_price, 'status', NEW.status);
        END IF;
    ELSIF TG_TABLE_NAME = 'app_settings' THEN
        v_module := 'SETTINGS';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('key', OLD.key, 'value', OLD.value);
        ELSE
            v_details := jsonb_build_object('key', NEW.key, 'value', NEW.value);
        END IF;
    ELSE
        v_module := 'SYSTEM';
        v_details := '{}'::jsonb;
    END IF;

    -- Safely insert the log entry
    INSERT INTO public.audit_logs (collaborator_id, collaborator_name, action, module, details)
    VALUES (v_collab_id, v_user_name, v_action, v_module, v_details);

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop triggers if they already exist to ensure clean setup
DROP TRIGGER IF EXISTS trg_audit_products ON public.products;
DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
DROP TRIGGER IF EXISTS trg_audit_app_settings ON public.app_settings;

-- Create Triggers
CREATE TRIGGER trg_audit_products
AFTER INSERT OR UPDATE OR DELETE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.proc_log_audit();

CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.proc_log_audit();

CREATE TRIGGER trg_audit_orders
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.proc_log_audit();

CREATE TRIGGER trg_audit_app_settings
AFTER INSERT OR UPDATE OR DELETE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.proc_log_audit();

-- Configure RLS for audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND (profiles.role IN ('admin', 'sys_admin') OR public.has_hierarchical_permission(auth.uid(), 'admin.dashboard.audit'))
        )
    );
