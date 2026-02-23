-- CONFIGURACIÓN DE ALMACENAMIENTO PARA IMÁGENES DE PRODUCTOS

-- 1. Crear el bucket 'product-images' si no existe
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Política para permitir que cualquier persona vea las imágenes (Público)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-images' );

-- 3. Política para permitir que solo administradores autenticados suban imágenes
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'product-images' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- 4. Política para permitir que administradores actualicen o borren imágenes
DROP POLICY IF EXISTS "Admins can update or delete product images" ON storage.objects;
CREATE POLICY "Admins can update or delete product images"
ON storage.objects FOR ALL
TO authenticated
USING (
    bucket_id = 'product-images' AND
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);
