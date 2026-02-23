-- NUCLEAR RLS FIX FOR APP SETTINGS
-- This script ensures that authenticated users (Admins) have TOTAL access
-- to the app_settings table, avoiding the "new row violates RLS" error.

-- 1. First, make sure the table is prepared for inserts
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow public read access" ON public.app_settings;
DROP POLICY IF EXISTS "Allow admin full access" ON public.app_settings;
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.app_settings;

-- 3. Create a clean, definitive policy for all operations
CREATE POLICY "Enable all for authenticated users" 
ON public.app_settings 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 4. Ensure public can still read (for the storefront/banner)
CREATE POLICY "Enable read for everyone" 
ON public.app_settings 
FOR SELECT 
USING (true);

-- 5. Helpful check: ensure the sequence (if any) or PK is ready
-- (For this table, 'key' is text and manually provided, so no sequence needed)
