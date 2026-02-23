-- FIX RLS FOR ORDERS INSERT
-- Allow authenticated users to INSERT their own orders
DROP POLICY IF EXISTS "Enable insert for users" ON orders;
CREATE POLICY "Enable insert for users" ON orders
    FOR INSERT 
    TO authenticated
    WITH CHECK (auth.uid() = profile_id);

-- Also ensure they can insert items
DROP POLICY IF EXISTS "Enable insert for items" ON order_items;
CREATE POLICY "Enable insert for items" ON order_items
    FOR INSERT 
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM orders 
            WHERE orders.id = order_items.order_id 
            AND orders.profile_id = auth.uid()
        )
    );
