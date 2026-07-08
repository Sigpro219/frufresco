-- Create helper function jsonb_diff to calculate field-level differences
CREATE OR REPLACE FUNCTION public.jsonb_diff(val_old jsonb, val_new jsonb)
RETURNS jsonb AS $$
DECLARE
    key_name text;
    old_val jsonb;
    new_val jsonb;
    result jsonb := '{}'::jsonb;
BEGIN
    FOR key_name IN SELECT jsonb_object_keys(val_new) LOOP
        old_val := val_old -> key_name;
        new_val := val_new -> key_name;
        IF old_val IS DISTINCT FROM new_val THEN
            -- Exclude system fields and credentials
            IF key_name NOT IN ('updated_at', 'created_at', 'fts', 'password', 'encrypted_password', 'raw_app_meta_data', 'raw_user_meta_data') THEN
                result := jsonb_set(result, ARRAY[key_name], jsonb_build_object('old', old_val, 'new', new_val));
            END IF;
        END IF;
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update proc_log_audit function to capture changes on UPDATE
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
