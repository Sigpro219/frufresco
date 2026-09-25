-- Migration: Add 'COORDINADOR ADMINISTRATIVO' and Super Admin wildcard permissions to 'Admins can manage all orders' policy on public.orders.
-- Fixes RLS violation error (42501) when administrative coordinators (e.g. Julissa Arévalo) approve and create orders from email drafts.

-- 1. Drop existing policy
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;

-- 2. Create updated policy for all actions (SELECT, INSERT, UPDATE, DELETE)
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
          'COORDINADOR DE OPERACIONES'::text
        ])
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
          'COORDINADOR DE OPERACIONES'::text
        ])
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
