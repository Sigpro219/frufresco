-- SOPORTE DE VARIANTES ESTILO SHOPIFY
-- Ejecuta esto en el SQL Editor para habilitar las columnas de variantes

-- 1. Añadir columnas a la tabla 'products'
-- variants: Almacena las combinaciones finales (ej: [{id: 'v1', options: {Talla: 'M', Color: 'Rojo'}, price: 5000}])
-- options_config: Almacena la estructura (ej: [{name: 'Talla', values: ['S', 'M']}, {name: 'Color', values: ['Rojo']}])
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS variants jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS options_config jsonb DEFAULT '[]'::jsonb;

-- 2. Asegurar que las políticas RLS permitan editar estas nuevas columnas
-- (Ya deberías tener permisos si ejecutaste Admin_Write_Access.sql, 
-- pero esto no sobra)
DROP POLICY IF EXISTS "Admins can update variants" ON products;
CREATE POLICY "Admins can update variants" 
ON products FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
