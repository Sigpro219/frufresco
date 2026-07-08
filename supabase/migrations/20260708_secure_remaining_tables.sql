-- Migration: Enable Row Level Security (RLS) on remaining business-critical tables
-- Target Tables: collaborators, providers, fleet_vehicles, pricing_models, pricing_rules, cash_movements, cash_budgets, billing_invoices, billing_cuts, billing_returns

-- =========================================================================
-- 0. Clean up any existing policies on these target tables
-- =========================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('collaborators', 'providers', 'fleet_vehicles', 'pricing_models', 'pricing_rules', 'cash_movements', 'cash_budgets', 'billing_invoices', 'billing_cuts', 'billing_returns')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- =========================================================================
-- 1. Table: collaborators
-- =========================================================================
ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage collaborators"
ON public.collaborators FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text,
    'LIDER DE CARTERA'::text
  ])
);

CREATE POLICY "Allow user to view own collaborator details"
ON public.collaborators FOR SELECT
TO authenticated
USING (
  id = (SELECT collaborator_id FROM public.profiles WHERE id = auth.uid())
);

-- =========================================================================
-- 2. Table: providers
-- =========================================================================
ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage providers"
ON public.providers FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE INVENTARIO'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE INVENTARIO'::text
  ])
);

-- =========================================================================
-- 3. Table: fleet_vehicles
-- =========================================================================
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage fleet_vehicles"
ON public.fleet_vehicles FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text,
    'COORDINADOR DE OPERACIONES'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text,
    'COORDINADOR DE OPERACIONES'::text
  ])
);

-- =========================================================================
-- 4. Table: pricing_models
-- =========================================================================
ALTER TABLE public.pricing_models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage pricing_models"
ON public.pricing_models FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
);

CREATE POLICY "Allow authenticated read to pricing_models"
ON public.pricing_models FOR SELECT
TO authenticated, anon
USING (true);

-- =========================================================================
-- 5. Table: pricing_rules
-- =========================================================================
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage pricing_rules"
ON public.pricing_rules FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
);

CREATE POLICY "Allow authenticated read to pricing_rules"
ON public.pricing_rules FOR SELECT
TO authenticated, anon
USING (true);

-- =========================================================================
-- 6. Table: cash_movements
-- =========================================================================
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage cash_movements"
ON public.cash_movements FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text,
    'LIDER DE CARTERA'::text
  ])
);

-- =========================================================================
-- 7. Table: cash_budgets
-- =========================================================================
ALTER TABLE public.cash_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage cash_budgets"
ON public.cash_budgets FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text,
    'LIDER DE CARTERA'::text
  ])
);

-- =========================================================================
-- 8. Table: billing_invoices
-- =========================================================================
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage billing_invoices"
ON public.billing_invoices FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
);

CREATE POLICY "Allow clients to view own billing_invoices"
ON public.billing_invoices FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = billing_invoices.order_id
      AND o.profile_id = auth.uid()
  )
);

-- =========================================================================
-- 9. Table: billing_cuts
-- =========================================================================
ALTER TABLE public.billing_cuts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage billing_cuts"
ON public.billing_cuts FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
);

-- =========================================================================
-- 10. Table: billing_returns
-- =========================================================================
ALTER TABLE public.billing_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage billing_returns"
ON public.billing_returns FOR ALL
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
)
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text,
    'LIDER DE CARTERA'::text
  ])
);

CREATE POLICY "Allow clients to manage own returns"
ON public.billing_returns FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = billing_returns.order_id
      AND o.profile_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = billing_returns.order_id
      AND o.profile_id = auth.uid()
  )
);

-- =========================================================================
-- 11. Add user-level SELECT policies to orders and order_items
-- =========================================================================
DROP POLICY IF EXISTS "Allow clients to view own orders" ON public.orders;
CREATE POLICY "Allow clients to view own orders"
ON public.orders FOR SELECT
TO authenticated
USING (
  profile_id = auth.uid()
);

DROP POLICY IF EXISTS "Allow clients to view own order items" ON public.order_items;
CREATE POLICY "Allow clients to view own order items"
ON public.order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.profile_id = auth.uid()
        OR public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
          'admin'::text, 
          'sys_admin'::text, 
          'web_admin'::text, 
          'operations'::text, 
          'GESTION DE PEDIDOS'::text, 
          'LIDER DE INVENTARIO'::text, 
          'COORDINADOR DE OPERACIONES'::text, 
          'LIDER DE CARTERA'::text
        ])
      )
  )
);
