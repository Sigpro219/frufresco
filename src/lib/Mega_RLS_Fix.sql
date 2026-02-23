-- MEGA FIX: PERMISOS DEFINITIVOS DE ADMINISTRADOR
-- Este script resuelve los errores de RLS en las tablas y en storage
-- mediante una función de seguridad definida.

-- 1. Crear función para verificar si un usuario es admin (Bypass RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Corregir permisos en la tabla de PRODUCTOS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can do everything on products" ON public.products;
DROP POLICY IF EXISTS "Cualquiera puede ver productos" ON public.products;

-- Cualquiera puede ver productos (Catalogo)
CREATE POLICY "Cualquiera puede ver productos" 
ON public.products FOR SELECT 
USING (true);

-- Solo administradores pueden INSERTAR, ACTUALIZAR o BORRAR
CREATE POLICY "Admins can manage products"
ON public.products FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());


-- 3. Corregir permisos en STORAGE (Imágenes)
-- Asegurar que el bucket existe y es público
UPDATE storage.buckets SET public = true WHERE id = 'product-images';

-- Eliminar políticas viejas
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update or delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated management" ON storage.objects;

-- Política de lectura pública
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'product-images' );

-- Política de gestión para administradores
CREATE POLICY "Admins can manage storage"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'product-images' AND public.is_admin() )
WITH CHECK ( bucket_id = 'product-images' AND public.is_admin() );
