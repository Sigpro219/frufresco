-- DESARROLLO SIN RESTRICCIONES (OPEN ACCESS)
-- Ejecuta este script para deshabilitar RLS y roles temporalmente.

-- 1. DESACTIVAR RLS EN TODAS LAS TABLAS CLAVE
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
-- Nota: Para storage.objects usamos políticas de "permiso total" ya que 
-- ALTER TABLE en tablas de sistema puede fallar por falta de permisos de owner.

-- 2. LIMPIEZA TOTAL DE POLÍTICAS (INGLÉS Y ESPAÑOL)
-- Productos
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Cualquiera puede ver productos" ON public.products;
DROP POLICY IF EXISTS "Permiso total temporal productos" ON public.products;
DROP POLICY IF EXISTS "final_products_access" ON public.products;
DROP POLICY IF EXISTS "USANDO ( verdadero )" ON public.products;
DROP POLICY IF EXISTS "CON CHEQUE ( verdadero )" ON public.products;

-- Storage (Fotos)
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage storage" ON storage.objects;
DROP POLICY IF EXISTS "Permiso total temporal fotos" ON storage.objects;
DROP POLICY IF EXISTS "Ver fotos publicamente" ON storage.objects;
DROP POLICY IF EXISTS "final_storage_access" ON storage.objects;
DROP POLICY IF EXISTS "public_view_images" ON storage.objects;

-- Perfiles
DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Los administradores pueden ver todos los perfiles" ON public.profiles;

-- 3. HABILITAR ACCESO TOTAL EN STORAGE (YA QUE NO PODEMOS HACER DISABLE RLS)
-- Permitimos TODO a TODOS los usuarios (incluso anónimos para probar rápido)
CREATE POLICY "open_access_all" ON storage.objects FOR ALL TO public USING (true) WITH CHECK (true);

-- 4. OTORGAR PERMISOS DE TABLA
GRANT ALL ON public.products TO anon, authenticated, postgres;
GRANT ALL ON public.profiles TO anon, authenticated, postgres;
GRANT ALL ON storage.objects TO anon, authenticated, postgres;
GRANT ALL ON storage.buckets TO anon, authenticated, postgres;

-- 5. ASEGURAR QUE EL BUCKET SEA PUBLICO
UPDATE storage.buckets SET public = true WHERE id = 'product-images';
