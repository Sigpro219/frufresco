-- FIX: Ensure Leads Table has coordinates and public RLS access
-- Reason: LeadGenBot captures Lat/Lng for expansion zones, but columns were missing.
-- Also, unauthenticated users need permission to insert their data.

-- 1. Add missing coordinate columns to leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. Ensure RLS is enabled for leads
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing insertion policies to avoid conflicts
DROP POLICY IF EXISTS "Enable insert for all users" ON leads;
DROP POLICY IF EXISTS "Public insert leads" ON leads;
DROP POLICY IF EXISTS "Anon can insert leads" ON leads;

-- 4. Create policy for PÚBLICO (Anon + Auth) to INSERT only
-- This allows the LeadGenBot to work for unauthenticated visitors
CREATE POLICY "Public and Anon Insert Leads"
ON leads FOR INSERT 
TO public
WITH CHECK (true);

-- 5. Create policy for Authenticated users to view/manage leads
DROP POLICY IF EXISTS "Authenticated users view leads" ON leads;
CREATE POLICY "Authenticated users view leads"
ON leads FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users update leads" ON leads;
CREATE POLICY "Authenticated users update leads"
ON leads FOR UPDATE
TO authenticated
USING (true);

-- Verify
COMMENT ON COLUMN leads.latitude IS 'Latitud capturada por el mapa del LeadGenBot';
COMMENT ON COLUMN leads.longitude IS 'Longitud capturada por el mapa del LeadGenBot';
