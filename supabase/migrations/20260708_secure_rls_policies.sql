-- Migration: Enable Row Level Security (RLS) and define secure policies
-- Target Tables: profiles, routes, route_stops, purchases, inventory_movements, inventory_stocks, warehouses

-- =========================================================================
-- Helper: Security Definer function to get user role without RLS recursion
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_my_profile_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 0. Drop ALL existing policies on these tables to clean up security leaks
-- =========================================================================
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN ('profiles', 'routes', 'route_stops', 'purchases', 'inventory_movements', 'inventory_stocks', 'warehouses')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- =========================================================================
-- 1. Table: profiles
-- =========================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow users to select own profile" 
ON public.profiles FOR SELECT 
TO authenticated, anon
USING (auth.uid() = id);

CREATE POLICY "Allow staff to select all profiles" 
ON public.profiles FOR SELECT 
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'LIDER DE INVENTARIO'::text, 
    'COORDINADOR DE OPERACIONES'::text, 
    'LIDER DE CARTERA'::text
  ])
);

CREATE POLICY "Allow users to update own profile" 
ON public.profiles FOR UPDATE 
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

CREATE POLICY "Allow staff to manage profiles" 
ON public.profiles FOR ALL 
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
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
WITH CHECK (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'LIDER DE INVENTARIO'::text, 
    'COORDINADOR DE OPERACIONES'::text, 
    'LIDER DE CARTERA'::text
  ])
);


-- =========================================================================
-- 2. Table: routes
-- =========================================================================
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow drivers to see assigned routes" 
ON public.routes FOR SELECT 
TO authenticated
USING (
  driver_id = auth.uid() OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text
  ])
);

CREATE POLICY "Allow staff to manage routes" 
ON public.routes FOR ALL 
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text
  ])
);


-- =========================================================================
-- 3. Table: route_stops
-- =========================================================================
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow drivers to see assigned stops" 
ON public.route_stops FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_stops.route_id 
      AND r.driver_id = auth.uid()
  ) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text
  ])
);

CREATE POLICY "Allow drivers to update assigned stops" 
ON public.route_stops FOR UPDATE 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_stops.route_id 
      AND r.driver_id = auth.uid()
  ) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text
  ])
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_stops.route_id 
      AND r.driver_id = auth.uid()
  ) OR
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text
  ])
);

CREATE POLICY "Allow staff to insert/delete stops" 
ON public.route_stops FOR ALL 
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'web_admin'::text, 
    'operations'::text, 
    'GESTION DE PEDIDOS'::text, 
    'COORDINADOR DE OPERACIONES'::text
  ])
);


-- =========================================================================
-- 4. Table: purchases
-- =========================================================================
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage purchases" 
ON public.purchases FOR ALL 
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
);


-- =========================================================================
-- 5. Table: inventory_movements
-- =========================================================================
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage inventory_movements" 
ON public.inventory_movements FOR ALL 
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
);


-- =========================================================================
-- 6. Table: inventory_stocks
-- =========================================================================
ALTER TABLE public.inventory_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow staff to manage inventory_stocks" 
ON public.inventory_stocks FOR ALL 
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
);


-- =========================================================================
-- 7. Table: warehouses
-- =========================================================================
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated select warehouses" 
ON public.warehouses FOR SELECT 
TO authenticated
USING (true);

CREATE POLICY "Allow staff to manage warehouses" 
ON public.warehouses FOR ALL 
TO authenticated
USING (
  public.get_my_profile_role(auth.uid()) = ANY (ARRAY[
    'admin'::text, 
    'sys_admin'::text, 
    'operations'::text
  ])
);
