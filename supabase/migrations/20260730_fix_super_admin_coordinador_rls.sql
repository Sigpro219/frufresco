-- Migration: Fix Super Admin & Coordinador Administrativo RLS Access across all system tables
-- Target Tables: profiles, purchases, inventory_movements, inventory_stocks, warehouses, routes, route_stops

-- 1. Helper function to check if a user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    u_role TEXT;
    u_perms JSONB;
BEGIN
    SELECT role, to_jsonb(custom_permissions) INTO u_role, u_perms 
    FROM public.profiles 
    WHERE id = user_id;
    
    IF u_role IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Super admins by role
    IF u_role IN ('sys_admin', 'admin', 'web_admin') THEN
        RETURN TRUE;
    END IF;
    
    -- Super admins by wildcard permission '*' or '+*'
    IF u_perms IS NOT NULL AND (u_perms @> '["*"]'::jsonb OR u_perms @> '["+*"]'::jsonb) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Enhanced function to check if user is staff (internal employee)
CREATE OR REPLACE FUNCTION public.is_staff(user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    user_role TEXT;
BEGIN
    IF public.is_super_admin(user_id) THEN
        RETURN TRUE;
    END IF;
    
    SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
    IF user_role IS NULL THEN
        RETURN FALSE;
    END IF;
    
    RETURN user_role NOT IN ('b2b_client', 'b2c_client', 'client');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Update get_my_profile_role function
CREATE OR REPLACE FUNCTION public.get_my_profile_role(user_id UUID)
RETURNS TEXT AS $$
DECLARE
    user_role TEXT;
BEGIN
    SELECT role INTO user_role FROM public.profiles WHERE id = user_id;
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Update Policies for Table: profiles
DROP POLICY IF EXISTS "Allow staff to select all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Allow staff to manage profiles" ON public.profiles;

CREATE POLICY "Allow staff to select all profiles" 
ON public.profiles FOR SELECT 
TO authenticated, anon
USING (
  public.is_staff(auth.uid()) OR
  auth.uid() = id
);

CREATE POLICY "Allow staff to manage profiles" 
ON public.profiles FOR ALL 
TO authenticated
USING (
  public.is_staff(auth.uid()) OR
  auth.uid() = id
)
WITH CHECK (
  public.is_staff(auth.uid()) OR
  auth.uid() = id
);

-- 5. Update Policies for Table: purchases
DROP POLICY IF EXISTS "Allow staff to manage purchases" ON public.purchases;
CREATE POLICY "Allow staff to manage purchases" 
ON public.purchases FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()));

-- 6. Update Policies for Table: inventory_movements
DROP POLICY IF EXISTS "Allow staff to manage inventory_movements" ON public.inventory_movements;
CREATE POLICY "Allow staff to manage inventory_movements" 
ON public.inventory_movements FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()));

-- 7. Update Policies for Table: inventory_stocks
DROP POLICY IF EXISTS "Allow staff to manage inventory_stocks" ON public.inventory_stocks;
CREATE POLICY "Allow staff to manage inventory_stocks" 
ON public.inventory_stocks FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()));

-- 8. Update Policies for Table: routes
DROP POLICY IF EXISTS "Allow drivers to see assigned routes" ON public.routes;
DROP POLICY IF EXISTS "Allow staff to manage routes" ON public.routes;

CREATE POLICY "Allow drivers to see assigned routes" 
ON public.routes FOR SELECT 
TO authenticated
USING (
  driver_id = auth.uid() OR
  public.is_staff(auth.uid())
);

CREATE POLICY "Allow staff to manage routes" 
ON public.routes FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()));

-- 9. Update Policies for Table: route_stops
DROP POLICY IF EXISTS "Allow drivers to see assigned stops" ON public.route_stops;
DROP POLICY IF EXISTS "Allow drivers to update assigned stops" ON public.route_stops;
DROP POLICY IF EXISTS "Allow staff to insert/delete stops" ON public.route_stops;

CREATE POLICY "Allow drivers to see assigned stops" 
ON public.route_stops FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_stops.route_id 
      AND r.driver_id = auth.uid()
  ) OR
  public.is_staff(auth.uid())
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
  public.is_staff(auth.uid())
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.routes r
    WHERE r.id = route_stops.route_id 
      AND r.driver_id = auth.uid()
  ) OR
  public.is_staff(auth.uid())
);

CREATE POLICY "Allow staff to insert/delete stops" 
ON public.route_stops FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()));

-- 10. Update Policies for Table: warehouses
DROP POLICY IF EXISTS "Allow staff to manage warehouses" ON public.warehouses;
CREATE POLICY "Allow staff to manage warehouses" 
ON public.warehouses FOR ALL 
TO authenticated
USING (public.is_staff(auth.uid()));
