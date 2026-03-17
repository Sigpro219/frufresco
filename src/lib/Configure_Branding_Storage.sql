-- CONFIGURACIÓN DE ALMACENAMIENTO PARA BRANDING (LOGOS Y HERO)

-- 1. Crear el bucket 'branding' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Asegurar que sea público
UPDATE storage.buckets SET public = true WHERE id = 'branding';

-- 3. Eliminar políticas anteriores si existen
DROP POLICY IF EXISTS "Public Access Branding" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated branding uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated branding management" ON storage.objects;

-- 4. Política para acceso público (Lectura)
CREATE POLICY "Public Access Branding"
ON storage.objects FOR SELECT
USING ( bucket_id = 'branding' );

-- 5. Política para subida (Autenticados)
CREATE POLICY "Allow authenticated branding uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'branding' );

-- 6. Política para gestión total (Autenticados)
CREATE POLICY "Allow authenticated branding management"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'branding' );
