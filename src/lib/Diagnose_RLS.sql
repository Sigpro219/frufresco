-- DIAGNÓSTICO DE PERMISOS
-- Ejecuta esto en el SQL Editor y mira los resultados para entender por qué falla el RLS.

-- 1. Ver qué ID tiene tu usuario actual (si lo ejecutas desde el editor, a veces sale vacío)
-- Pero esto nos dirá quiénes están en la tabla de perfiles actualmente.
SELECT id, role, company_name FROM public.profiles;

-- 2. Verificar si la función is_admin() existe y qué devuelve
-- (Nota: Esto no funcionará bien en el editor SQL para tu sesión de navegador, 
-- pero nos asegura que la lógica está ahí).
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name = 'is_admin';

-- 3. ¿ESTADO DE EMERGENCIA? 
-- Si quieres forzar que TODO usuario autenticado pueda crear productos mientras arreglamos el rol:
-- Descomenta las siguientes líneas y ejecútalas:

/*
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Temp bypass for all authenticated" 
ON public.products FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can manage storage" ON storage.objects;
CREATE POLICY "Temp bypass storage for all authenticated" 
ON storage.objects FOR ALL 
TO authenticated 
USING (bucket_id = 'product-images') 
WITH CHECK (bucket_id = 'product-images');
*/
