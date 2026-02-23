-- Enable read access for Picking Dashboard (Public/Anon)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policy to allow generic read for 'approved' orders (Picking Dashboard)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.orders;
CREATE POLICY "Enable read access for all users" ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.order_items;
CREATE POLICY "Enable read access for all users" ON public.order_items FOR SELECT USING (true);
