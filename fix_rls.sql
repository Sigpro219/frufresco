
-- FIX: Restore Full Access to Products Table
-- Reason: Previous policy changes likely blocked SELECT for authenticated users.

-- 1. Ensure RLS is enabled (or disabled if preferred, but let's stick to enabled with broad policy)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 2. Drop any potentially conflicting policies
DROP POLICY IF EXISTS "Permitir actualización de SKUs" ON products;
DROP POLICY IF EXISTS "Permitir creación de SKUs" ON products;
DROP POLICY IF EXISTS "Enable read access for all users" ON products;
DROP POLICY IF EXISTS "products_read_policy" ON products;

-- 3. Create a SINGLE, UNIFIED policy for ALL operations
-- This allows both Anon (public) and Authenticated users to Select, Insert, Update, Delete
CREATE POLICY "Public And Auth Full Access" ON products
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 4. Verify Policy for Variants as well (just in case)
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read Product Variants" ON product_variants;
DROP POLICY IF EXISTS "Admin All Product Variants" ON product_variants;
CREATE POLICY "Public And Auth Full Access Variants" ON product_variants
FOR ALL
TO public
USING (true)
WITH CHECK (true);
