-- Fix logic bug in proc_log_audit where the modified user profile details were captured instead of the logged-in user profile details.
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
    -- Resolve authenticated session user (the person executing the transaction)
    v_user_id := auth.uid();
    
    -- ALWAYS resolve logged-in user profile details (auth.uid()) rather than target NEW row to avoid logic bug
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

    -- Fallback name
    IF v_user_name IS NULL THEN
        IF v_user_id IS NOT NULL THEN
            v_user_name := 'Authenticated User (' || v_user_id::text || ')';
        ELSE
            v_user_name := 'System / DB Direct';
        END IF;
    END IF;

    -- Verify that the collaborator_id exists in public.collaborators to prevent foreign key violations.
    IF v_collab_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.collaborators WHERE id = v_collab_id) THEN
            v_collab_id := NULL;
        END IF;
    END IF;

    -- Format action name
    v_action := TG_OP || '_' || TG_TABLE_NAME;
    
    -- Capture detail snapshot contextually with changes on UPDATE
    IF TG_TABLE_NAME = 'products' THEN
        v_module := 'PRODUCTS';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('sku', OLD.sku, 'name', OLD.name);
        ELSIF TG_OP = 'UPDATE' THEN
            v_details := jsonb_build_object(
                'sku', NEW.sku, 
                'name', NEW.name, 
                'changes', public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW))
            );
        ELSE
            v_details := jsonb_build_object('sku', NEW.sku, 'name', NEW.name);
        END IF;
    ELSIF TG_TABLE_NAME = 'profiles' THEN
        v_module := 'SECURITY';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('role', OLD.role, 'company_name', OLD.company_name, 'contact_name', OLD.contact_name);
        ELSIF TG_OP = 'UPDATE' THEN
            v_details := jsonb_build_object(
                'role', NEW.role, 
                'company_name', NEW.company_name, 
                'contact_name', NEW.contact_name, 
                'changes', public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW))
            );
        ELSE
            v_details := jsonb_build_object('role', NEW.role, 'company_name', NEW.company_name, 'contact_name', NEW.contact_name);
        END IF;
    ELSIF TG_TABLE_NAME = 'orders' THEN
        v_module := 'ORDERS';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('id', OLD.id, 'sequence_id', OLD.sequence_id, 'total_price', OLD.total_price, 'status', OLD.status);
        ELSIF TG_OP = 'UPDATE' THEN
            v_details := jsonb_build_object(
                'id', NEW.id, 
                'sequence_id', NEW.sequence_id, 
                'total_price', NEW.total_price, 
                'status', NEW.status, 
                'changes', public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW))
            );
        ELSE
            v_details := jsonb_build_object('id', NEW.id, 'sequence_id', NEW.sequence_id, 'total_price', NEW.total_price, 'status', NEW.status);
        END IF;
    ELSIF TG_TABLE_NAME = 'app_settings' THEN
        v_module := 'SETTINGS';
        IF TG_OP = 'DELETE' THEN
            v_details := jsonb_build_object('key', OLD.key, 'value', OLD.value);
        ELSIF TG_OP = 'UPDATE' THEN
            v_details := jsonb_build_object(
                'key', NEW.key, 
                'value', NEW.value, 
                'changes', public.jsonb_diff(to_jsonb(OLD), to_jsonb(NEW))
            );
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
