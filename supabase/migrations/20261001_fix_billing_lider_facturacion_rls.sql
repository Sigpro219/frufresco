-- =========================================================================
-- Migration: Add 'LIDER DE FACTURACION' & Staff Access to Billing & Orders RLS
-- Description:
--   Grants full access to 'LIDER DE FACTURACION' (Anderson Cante) and any
--   authorized internal staff across orders, billing_cuts, billing_invoices,
--   billing_returns, routes, and route_stops.
-- =========================================================================

-- 1. Table: orders
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;

CREATE POLICY "Admins can manage all orders"
ON public.orders
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE public.profiles.id = auth.uid()
      AND (
        public.profiles.role = ANY (ARRAY[
          'admin'::text, 
          'sys_admin'::text, 
          'web_admin'::text, 
          'operations'::text,
          'COORDINADOR ADMINISTRATIVO'::text,
          'GESTION DE PEDIDOS'::text,
          'LIDER DE INVENTARIO'::text,
          'LIDER DE CARTERA'::text,
          'LIDER DE FACTURACION'::text,
          'COORDINADOR DE OPERACIONES'::text
        ])
        OR public.is_staff(auth.uid())
        OR (
          public.profiles.custom_permissions IS NOT NULL 
          AND (
            to_jsonb(public.profiles.custom_permissions) @> '["*"]'::jsonb 
            OR to_jsonb(public.profiles.custom_permissions) @> '["+*"]'::jsonb
          )
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE public.profiles.id = auth.uid()
      AND (
        public.profiles.role = ANY (ARRAY[
          'admin'::text, 
          'sys_admin'::text, 
          'web_admin'::text, 
          'operations'::text,
          'COORDINADOR ADMINISTRATIVO'::text,
          'GESTION DE PEDIDOS'::text,
          'LIDER DE INVENTARIO'::text,
          'LIDER DE CARTERA'::text,
          'LIDER DE FACTURACION'::text,
          'COORDINADOR DE OPERACIONES'::text
        ])
        OR public.is_staff(auth.uid())
        OR (
          public.profiles.custom_permissions IS NOT NULL 
          AND (
            to_jsonb(public.profiles.custom_permissions) @> '["*"]'::jsonb 
            OR to_jsonb(public.profiles.custom_permissions) @> '["+*"]'::jsonb
          )
        )
      )
  )
);

-- 2. Table: billing_cuts
DROP POLICY IF EXISTS "Allow staff to manage billing_cuts" ON public.billing_cuts;

CREATE POLICY "Allow staff to manage billing_cuts"
ON public.billing_cuts FOR ALL
TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE FACTURACION'::text
  ])
)
WITH CHECK (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE FACTURACION'::text
  ])
);

-- 3. Table: billing_invoices
DROP POLICY IF EXISTS "Allow staff to manage billing_invoices" ON public.billing_invoices;

CREATE POLICY "Allow staff to manage billing_invoices"
ON public.billing_invoices FOR ALL
TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE FACTURACION'::text
  ])
)
WITH CHECK (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE FACTURACION'::text
  ])
);

-- 4. Table: billing_returns
DROP POLICY IF EXISTS "Allow staff to manage billing_returns" ON public.billing_returns;

CREATE POLICY "Allow staff to manage billing_returns"
ON public.billing_returns FOR ALL
TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE FACTURACION'::text
  ])
)
WITH CHECK (
  public.is_staff(auth.uid()) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE FACTURACION'::text
  ])
);
