-- REPAIR SCRIPT FOR FRUFRESCO ADMIN ACCESS
-- Run this in the SQL Editor of your FruFresco Supabase project

-----------------------------------------------------------
-- 1. FIX RECURSIVE RLS POLICIES (Prevent loading errors)
-----------------------------------------------------------

-- Remove old complicated policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;

-- Simple and safe policies:
-- Anyone authenticated can read their own profile
CREATE POLICY "Allow users to read own profile" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (auth.uid() = id);

-- Admins can do everything (Check role WITHOUT recursion)
-- We use a subquery that ONLY looks at the role, but Supabase policies 
-- can be tricky with recursion. 
-- A safer way for now: Allow all authenticated users to SEE roles, 
-- but only owners/admins can UPDATE.
DROP POLICY IF EXISTS "Allow authenticated read all" ON public.profiles;
CREATE POLICY "Allow authenticated read all" 
ON public.profiles FOR SELECT 
TO authenticated 
USING (true);

-- Only admins and owners can update
CREATE POLICY "Allow owners and admins to update" 
ON public.profiles FOR UPDATE 
TO authenticated 
USING (auth.uid() = id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-----------------------------------------------------------
-- 2. ENSURE PROFILE EXISTS AND IS ADMIN
-----------------------------------------------------------

-- Re-assign your user as Admin (Replace with YOUR actual ID)
INSERT INTO public.profiles (id, role, contact_name, company_name)
VALUES ('77ef7895-cc19-4d3d-9f0b-774e9a032c6b', 'admin', 'Administrador Principal', 'FruFresco')
ON CONFLICT (id) DO UPDATE 
SET role = 'admin', company_name = 'FruFresco';

-----------------------------------------------------------
-- 3. VERIFY PERMISSIONS
-----------------------------------------------------------
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

NOTIFY pgrst, 'reload schema';
