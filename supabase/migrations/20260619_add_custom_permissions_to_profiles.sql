-- Add custom_permissions column to public.profiles if it does not exist
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS custom_permissions TEXT[] DEFAULT '{}';

-- Helper function to validate hierarchical permissions in DB policies
CREATE OR REPLACE FUNCTION public.has_hierarchical_permission(
    user_id UUID, 
    required_perm TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    user_perms TEXT[];
    p TEXT;
BEGIN
    -- Retrieve custom_permissions from profiles table
    SELECT custom_permissions INTO user_perms FROM public.profiles WHERE id = user_id;
    
    IF user_perms IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Evaluate matches (direct, global, or wildcard namespace)
    FOREACH p IN ARRAY user_perms LOOP
        -- Direct match or superuser wildcard
        IF p = '*' OR p = required_perm THEN
            RETURN TRUE;
        END IF;
        
        -- Wildcard prefix match (e.g., 'ops.compras.*' allows 'ops.compras.category:TOMATE')
        IF p LIKE '%*' AND LEFT(required_perm, LENGTH(p) - 1) = LEFT(p, LENGTH(p) - 1) THEN
            RETURN TRUE;
        END IF;

        -- Exact namespace match (e.g., 'ops.compras' allows 'ops.compras.category:TOMATE')
        IF required_perm LIKE p || '.%' OR required_perm LIKE p || ':%' THEN
            RETURN TRUE;
        END IF;
    END LOOP;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
