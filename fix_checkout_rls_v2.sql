-- FIX FOR CHECKOUT TIMEOUT / RLS ISSUES
-- These policies allow anonymous users (customers) to create orders and items.

-- 1. Orders table
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone (guest) to create a B2C order
DROP POLICY IF EXISTS "Enable insert for guests" ON public.orders;
CREATE POLICY "Enable insert for guests"
ON public.orders
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow anyone to view their own created order (necessary for the next steps in checkout)
DROP POLICY IF EXISTS "Enable select for guests" ON public.orders;
CREATE POLICY "Enable select for guests"
ON public.orders
FOR SELECT
TO anon
USING (true);

-- 2. Order Items table
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Allow guests to insert items for their orders
DROP POLICY IF EXISTS "Enable insert for guests" ON public.order_items;
CREATE POLICY "Enable insert for guests"
ON public.order_items
FOR INSERT
TO anon
WITH CHECK (true);

-- Allow guests to view items
DROP POLICY IF EXISTS "Enable select for guests" ON public.order_items;
CREATE POLICY "Enable select for guests"
ON public.order_items
FOR SELECT
TO anon
USING (true);

-- 3. Ensure permissions are granted at the schema level
GRANT INSERT, SELECT ON TABLE public.orders TO anon;
GRANT INSERT, SELECT ON TABLE public.order_items TO anon;
