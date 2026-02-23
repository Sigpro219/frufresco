-- SOLUCIÓN AL ERROR DE PERMISOS (RLS) EN STORAGE
-- Este script simplifica la política para que cualquier usuario autenticado 
-- pueda subir imágenes al bucket 'product-images' mientras resolvemos 
-- posibles problemas de caché en la tabla de perfiles.

-- 1. Asegurar que el bucket sea público
UPDATE storage.buckets SET public = true WHERE id = 'product-images';

-- 2. Eliminar políticas restrictivas anteriores
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update or delete product images" ON storage.objects;

-- 3. Crear política simplificada (Permitir a todos los AUTENTICADOS por ahora)
-- Esto verifica si el usuario ha iniciado sesión.
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'product-images' );

-- 4. Permitir actualizar y borrar
CREATE POLICY "Allow authenticated management"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'product-images' );

-- NOTA: Una vez verifiques que esto funciona, podemos volver a restringir 
-- solo a 'admin' si es necesario, pero esto eliminará el bloqueo actual.
