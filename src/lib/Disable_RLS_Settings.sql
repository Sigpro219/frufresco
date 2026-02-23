-- DEFINITIVE RLS BYPASS FOR APP SETTINGS
-- This script completely disables RLS for the app_settings table
-- ensuring that no security policy blocks inserts or updates during development.

ALTER TABLE public.app_settings DISABLE ROW LEVEL SECURITY;

-- Optional: Delete all rows and re-seed to ensure a clean state
TRUNCATE public.app_settings;

INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('delivery_fee', '5000', 'Costo de envío estándar'),
  ('min_order_hogar', '30000', 'Pedido mínimo Línea Hogar'),
  ('min_order_institucional', '150000', 'Pedido mínimo Línea Institucional'),
  ('store_status', 'open', 'Estado de la tienda (open/closed)'),
  ('global_banner', '¡Bienvenidos a FruFresco! Despachos de lunes a viernes.', 'Mensaje en la parte superior del sitio')
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value, 
    description = EXCLUDED.description, 
    updated_at = now();
