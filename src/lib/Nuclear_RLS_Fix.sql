-- NUCLEAR OPTION: DESACTIVACIÓN TOTAL DE RLS (DEBUGGING)
-- Ejecuta esto solo para probar si los errores desaparecen.

-- 1. Desactivar RLS en la tabla de PRODUCTOS
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;

-- 2. Desactivar RLS en la tabla de Storage Objects (donde se guardan las fotos)
-- Nota: Esto permitirá que cualquier persona (incluso sin login) pueda subir/ver.
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- 3. Asegurar que el bucket sea público
UPDATE storage.buckets SET public = true WHERE id = 'product-images';

-- 4. Por si acaso, dar todos los privilegios al rol publico y anonimo
GRANT ALL ON public.products TO anon, authenticated, postgres;
GRANT ALL ON storage.objects TO anon, authenticated, postgres;

-- NOTA IMPORTANTE:
-- Si después de ejecutar esto sigue saliendo "RLS Policy violation", 
-- significa que los scripts NO se están ejecutando en el mismo proyecto 
-- que la aplicación web. Por favor verifica que el URL en tu Dashboard 
-- de Supabase coincida con "kuxnixwoacwsotcilhuz".
