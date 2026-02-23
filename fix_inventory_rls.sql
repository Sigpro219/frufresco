
-- FIX INVENTORY RLS POLICIES
-- Ensure public read access for authenticated users to view inventory data

-- 1. Enable RLS (Safety Check)
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing restrictive policies
DROP POLICY IF EXISTS "Public read access for authenticated users" ON inventory_stocks;
DROP POLICY IF EXISTS "Public read access for authenticated users" ON inventory_movements;
DROP POLICY IF EXISTS "Enable read access for all users" ON inventory_stocks;

-- 3. Create Permissive Policies for Dashboard Viewing
-- Allow ANY authenticated user to SELECT (view) inventory
CREATE POLICY "Enable read access for all users" 
ON inventory_stocks FOR SELECT 
TO authenticated, anon 
USING (true);

CREATE POLICY "Enable read access for all users" 
ON inventory_movements FOR SELECT 
TO authenticated, anon 
USING (true);

-- 4. Verify Warehouses Access too
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read access for authenticated users" ON warehouses;
CREATE POLICY "Enable read access for all users" 
ON warehouses FOR SELECT 
TO authenticated, anon 
USING (true);
