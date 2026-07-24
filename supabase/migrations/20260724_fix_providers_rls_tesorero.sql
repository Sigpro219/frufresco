-- Migration: Allow all staff, commercial, treasury, and procurement team full access to providers table
-- Target Table: providers

DROP POLICY IF EXISTS "Allow staff to manage providers" ON public.providers;

CREATE POLICY "Allow staff to manage providers"
ON public.providers FOR ALL
TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
  auth.uid() IS NOT NULL
)
WITH CHECK (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) NOT IN ('b2b_client', 'b2c_client') OR
  auth.uid() IS NOT NULL
);

-- Update system_roles setting in app_settings to include procurement & providers permissions for TESORERO
DO $$
DECLARE
    roles_json jsonb;
    updated_roles jsonb;
BEGIN
    SELECT value::jsonb INTO roles_json FROM public.app_settings WHERE key = 'system_roles';
    IF roles_json IS NOT NULL THEN
        SELECT jsonb_agg(
            CASE 
                WHEN elem->>'value' = 'TESORERO' THEN
                    jsonb_set(
                        elem, 
                        '{permissions}', 
                        (COALESCE(elem->'permissions', '[]'::jsonb) || '["admin.procurement.providers", "admin.procurement.providers.view", "admin.procurement.providers.edit", "admin.procurement", "admin.procurement.treasury", "admin.procurement.cash"]'::jsonb)
                    )
                ELSE elem 
            END
        ) INTO updated_roles FROM jsonb_array_elements(roles_json) elem;

        UPDATE public.app_settings SET value = updated_roles::text WHERE key = 'system_roles';
    END IF;
END $$;
