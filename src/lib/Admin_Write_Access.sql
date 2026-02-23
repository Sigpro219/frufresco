-- PERMISOS TOTALES PARA EDICIÓN ADMINISTRATIVA
-- Ejecuta esto en el SQL Editor para permitir que los administradores editen productos

-- 1. Habilitar permisos de escritura para la tabla 'products'
DROP POLICY IF EXISTS "Admins can do everything on products" ON products;
DROP POLICY IF EXISTS "Permitir update a administradores" ON products;

-- 3. Crear política para que usuarios autenticados con rol 'admin' puedan hacer TODO
CREATE POLICY "Admins can do everything on products" 
ON products FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- 4. Temporalmente, si el login aún da problemas, habilitar permiso publico de update (Opcional/Pruebas)
-- Descomenta las lineas de abajo si prefieres probar sin login estricto:
-- DROP POLICY IF EXISTS "Public update for testing" ON products;
-- CREATE POLICY "Public update for testing" ON products FOR UPDATE USING (true);
