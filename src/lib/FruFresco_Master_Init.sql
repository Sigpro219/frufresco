-- RE-INITIALIZATION SCRIPT FOR TENANT #1 (FRUFRESCO)
-- Run this in the SQL Editor of your NEW Supabase project to fix Auth/Branding

-----------------------------------------------------------
-- 1. PROFILES TABLE (Required for Login)
-----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'b2b_client',
    contact_name TEXT,
    company_name TEXT,
    price_list_id TEXT,
    address_main TEXT,
    specialty TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
CREATE POLICY "Admins can manage all profiles" ON public.profiles FOR ALL TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'web_admin', 'sys_admin'))
);

-----------------------------------------------------------
-- 2. APP SETTINGS (Branding & Global Config)
-------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
    key text PRIMARY KEY,
    value text,
    description text,
    updated_at timestamp with time zone DEFAULT now()
);

-- FruFresco Defaults
INSERT INTO public.app_settings (key, value, description)
VALUES 
    ('app_name', 'FruFresco', 'Nombre oficial de la aplicación'),
    ('app_short_name', 'FRUFRESCO', 'Nombre corto para UI/Headers'),
    ('app_logo_url', '', 'URL del logo principal'),
    ('app_logosymbol_url', '', 'URL del logosímbolo'),
    ('footer_description', 'Tu despensa gourmet del campo a la ciudad.', 'Descripción en el pie de página'),
    ('delivery_fee', '5000', 'Costo de envío estándar'),
    ('min_order_hogar', '30000', 'Pedido mínimo Línea Hogar'),
    ('min_order_institucional', '150000', 'Pedido mínimo Línea Institucional'),
    ('store_status', 'open', 'Estado de la tienda'),
    ('global_banner', '¡Paraíso de frescura! Despachos de lunes a viernes.', 'Mensaje superior')
ON CONFLICT (key) DO UPDATE SET 
    value = EXCLUDED.value;

-- RLS for App Settings
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access" ON public.app_settings;
CREATE POLICY "Allow public read access" ON public.app_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow admin full access" ON public.app_settings;
CREATE POLICY "Allow admin full access" ON public.app_settings FOR ALL TO authenticated USING (true);

-----------------------------------------------------------
-- 3. STORAGE BUCKETS
-----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for storage
DROP POLICY IF EXISTS "Public Access Branding" ON storage.objects;
CREATE POLICY "Public Access Branding" ON storage.objects FOR SELECT USING ( bucket_id = 'branding' );
DROP POLICY IF EXISTS "Allow authenticated management" ON storage.objects;
CREATE POLICY "Allow authenticated management" ON storage.objects FOR ALL TO authenticated USING ( bucket_id = 'branding' );

-----------------------------------------------------------
-- 4. GRANT PERMISSIONS
-----------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
