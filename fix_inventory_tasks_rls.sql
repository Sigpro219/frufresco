
-- FIX FULL INVENTORY RLS (AUDITS & TASKS)
-- Allow creating and viewing audit tasks

-- 1. inventory_random_tasks
ALTER TABLE inventory_random_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON inventory_random_tasks;
DROP POLICY IF EXISTS "Enable insert access for all users" ON inventory_random_tasks;

CREATE POLICY "Enable read access for all users" 
ON inventory_random_tasks FOR SELECT 
TO authenticated, anon 
USING (true);

CREATE POLICY "Enable insert access for all users" 
ON inventory_random_tasks FOR INSERT 
TO authenticated, anon 
WITH CHECK (true);

-- 2. inventory_task_items
ALTER TABLE inventory_task_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all users" ON inventory_task_items;
DROP POLICY IF EXISTS "Enable insert access for all users" ON inventory_task_items;

CREATE POLICY "Enable read access for all users" 
ON inventory_task_items FOR SELECT 
TO authenticated, anon 
USING (true);

CREATE POLICY "Enable insert access for all users" 
ON inventory_task_items FOR INSERT 
TO authenticated, anon 
WITH CHECK (true);

-- 3. inventory_movements (Allow inserts for adjustments)
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable insert access for all users" ON inventory_movements;
CREATE POLICY "Enable insert access for all users" 
ON inventory_movements FOR INSERT 
TO authenticated, anon 
WITH CHECK (true);

-- 4. inventory_stocks (Allow updates for adjustments)
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable update access for all users" ON inventory_stocks;
CREATE POLICY "Enable update access for all users" 
ON inventory_stocks FOR UPDATE 
TO authenticated, anon 
USING (true)
WITH CHECK (true);
