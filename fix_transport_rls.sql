
-- FIX TRANSPORT RLS POLICIES
-- Ensure public read access for authenticated users to view transport data

-- 1. Enable RLS (Safety Check)
ALTER TABLE fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies
DROP POLICY IF EXISTS "Public read access for authenticated users" ON fleet_vehicles;
DROP POLICY IF EXISTS "Public read access for authenticated users" ON maintenance_schedules;
DROP POLICY IF EXISTS "Public read access for authenticated users" ON routes;
DROP POLICY IF EXISTS "Enable read access for all users" ON fleet_vehicles;

-- 3. Create Permissive Policies for Dashboard Viewing
-- Allow ANY authenticated user to SELECT (view) transport data
CREATE POLICY "Enable read access for all users" 
ON fleet_vehicles FOR SELECT 
TO authenticated, anon 
USING (true);

CREATE POLICY "Enable read access for all users" 
ON maintenance_schedules FOR SELECT 
TO authenticated, anon 
USING (true);

CREATE POLICY "Enable read access for all users" 
ON routes FOR SELECT 
TO authenticated, anon 
USING (true);
