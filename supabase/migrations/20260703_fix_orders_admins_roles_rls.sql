-- Migration: Update 'Admins can manage all orders' policy on public.orders to include backoffice roles like 'GESTION DE PEDIDOS', 'LIDER DE INVENTARIO', 'LIDER DE CARTERA', and 'COORDINADOR DE OPERACIONES'.
-- This fixes the issue where staff members with non-admin roles (e.g. Olga Ramos) couldn't insert orders due to lack of SELECT permission when RETURNING is executed in Supabase Client.

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
      AND public.profiles.role = ANY (ARRAY[
        'admin'::text, 
        'sys_admin'::text, 
        'web_admin'::text, 
        'operations'::text,
        'GESTION DE PEDIDOS'::text,
        'LIDER DE INVENTARIO'::text,
        'LIDER DE CARTERA'::text,
        'COORDINADOR DE OPERACIONES'::text
      ])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = ANY (ARRAY[
        'admin'::text, 
        'sys_admin'::text, 
        'web_admin'::text, 
        'operations'::text,
        'GESTION DE PEDIDOS'::text,
        'LIDER DE INVENTARIO'::text,
        'LIDER DE CARTERA'::text,
        'COORDINADOR DE OPERACIONES'::text
      ])
  )
);
