-- MASTER INITIALIZATION SCRIPT FOR TENANT #1 (FRUFRESCO)
-- Run this in the SQL Editor of your NEW Supabase project

-----------------------------------------------------------
-- 1. APP SETTINGS TABLE
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);

-- Default Branding & Config for FruFresco
INSERT INTO public.app_settings (key, value, description)
VALUES 
    ('app_name', 'FruFresco', 'Nombre oficial de la aplicación'),
    ('app_short_name', 'FRUFRESCO', 'Nombre corto para UI/Headers'),
    ('app_logo_url', '', 'URL del logo principal (se cargará después)'),
    ('app_logosymbol_url', '', 'URL del logosímbolo (se cargará después)'),
    ('footer_description', 'Tu despensa gourmet del campo a la ciudad.', 'Descripción en el pie de página'),
    ('delivery_fee', '5000', 'Costo de envío estándar'),
    ('min_order_hogar', '30000', 'Pedido mínimo Línea Hogar'),
    ('min_order_institucional', '150000', 'Pedido mínimo Línea Institucional'),
    ('store_status', 'open', 'Estado de la tienda (open/closed)'),
    ('global_banner', '¡Bienvenidos a FruFresco! Despachos de lunes a viernes.', 'Mensaje superior')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value,
    description = EXCLUDED.description;

-- Grant access
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.app_settings;
CREATE POLICY "Allow public read access" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin full access" ON public.app_settings;
CREATE POLICY "Allow admin full access" ON public.app_settings FOR ALL TO authenticated USING (true);

-----------------------------------------------------------
-- 2. STORAGE CONFIGURATION
-----------------------------------------------------------
-- Create 'branding' bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Ensure public access
UPDATE storage.buckets SET public = true WHERE id = 'branding';

-- Storage Policies
DROP POLICY IF EXISTS "Public Access Branding" ON storage.objects;
CREATE POLICY "Public Access Branding"
ON storage.objects FOR SELECT
USING ( bucket_id = 'branding' );

DROP POLICY IF EXISTS "Allow authenticated branding uploads" ON storage.objects;
CREATE POLICY "Allow authenticated branding uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'branding' );

DROP POLICY IF EXISTS "Allow authenticated branding management" ON storage.objects;
CREATE POLICY "Allow authenticated branding management"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'branding' );
