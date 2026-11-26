-- Escenario 499: Ampliar política SELECT de cash_budgets para compradores y roles operativos en /ops/compras
-- Mantiene intacta la política FOR ALL existente ("Allow staff to manage cash_budgets")
-- y agrega acceso de lectura explícito para LIDER DE INVENTARIO, COORDINADOR DE OPERACIONES y TESORERO.

DROP POLICY IF EXISTS "Allow buyers and ops staff to read cash_budgets" ON public.cash_budgets;

CREATE POLICY "Allow buyers and ops staff to read cash_budgets"
ON public.cash_budgets FOR SELECT
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text,
    'sys_admin'::text,
    'web_admin'::text,
    'operations'::text,
    'LIDER DE CARTERA'::text,
    'LIDER DE INVENTARIO'::text,
    'COORDINADOR DE OPERACIONES'::text,
    'TESORERO'::text
  ])
);
