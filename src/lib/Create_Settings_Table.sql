-- FRUBANA EXPRESS - APP SETTINGS TABLE
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text,
  description text,
  updated_at timestamp with time zone DEFAULT now()
);

-- Default values
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('delivery_fee', '5000', 'Costo de envío estándar'),
  ('min_order_hogar', '30000', 'Pedido mínimo Línea Hogar'),
  ('min_order_institucional', '150000', 'Pedido mínimo Línea Institucional'),
  ('store_status', 'open', 'Estado de la tienda (open/closed)'),
  ('global_banner', '¡Bienvenidos a FruFresco! Despachos de lunes a viernes.', 'Mensaje en la parte superior del sitio')
ON CONFLICT (key) DO NOTHING;

-- Grant access (since we have RLS bypass in dev, this is for future)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read access" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Allow admin full access" ON public.app_settings FOR ALL TO authenticated USING (true);
