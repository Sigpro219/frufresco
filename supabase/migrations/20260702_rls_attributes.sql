-- Enable RLS on product_attributes_master
ALTER TABLE product_attributes_master ENABLE ROW LEVEL SECURITY;

-- Drop old conflicting policies if any
DROP POLICY IF EXISTS "Enable read access for all users" ON product_attributes_master;
DROP POLICY IF EXISTS "Allow authenticated users all access to product_attributes_master" ON product_attributes_master;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON product_attributes_master;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON product_attributes_master;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON product_attributes_master;

-- Create comprehensive policy for authenticated users (all operations: SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Allow authenticated users all access to product_attributes_master" 
ON product_attributes_master
FOR ALL 
TO authenticated
USING (true)
WITH CHECK (true);

-- Create policy for anonymous (unauthenticated) users to read (SELECT) attributes if needed
CREATE POLICY "Allow anon read access to product_attributes_master"
ON product_attributes_master
FOR SELECT
TO anon
USING (true);
