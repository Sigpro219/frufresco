-- Asegurar que las políticas de RLS permitan el borrado
-- Nota: Esto asume que el usuario es admin o que estamos en un entorno de desarrollo con políticas abiertas

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_conversions ENABLE ROW LEVEL SECURITY;

-- Política para borrar productos (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'products' AND policyname = 'Enable delete for all users'
    ) THEN
        CREATE POLICY "Enable delete for all users" ON products FOR DELETE USING (true);
    END IF;
END $$;

-- Política para borrar conversiones (si no existe)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'product_conversions' AND policyname = 'Enable delete for all users'
    ) THEN
        CREATE POLICY "Enable delete for all users" ON product_conversions FOR DELETE USING (true);
    END IF;
END $$;

-- Opcional: Si quieres que el borrado sea automático en cascada en el futuro:
-- ALTER TABLE product_conversions 
-- DROP CONSTRAINT IF EXISTS product_conversions_product_id_fkey,
-- ADD CONSTRAINT product_conversions_product_id_fkey 
-- FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
