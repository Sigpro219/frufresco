-- Ensure product_conversions can be read by anyone
ALTER TABLE public.product_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view conversions" ON public.product_conversions;
CREATE POLICY "Anyone can view conversions" ON public.product_conversions FOR SELECT USING (true);
