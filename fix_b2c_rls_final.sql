-- FIX DEFINITIVO PARA CHECKOUT B2C (GUEST CHECKOUT)
-- Este script permite que usuarios no registrados puedan crear pedidos y agregar items.

-- 1. Asegurar que RLS esté activo
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas que podrían estar bloqueando las inserciones de 'anon'
DROP POLICY IF EXISTS "Enable insert for users" ON orders;
DROP POLICY IF EXISTS "Enable insert for items" ON order_items;
DROP POLICY IF EXISTS "Public can insert orders" ON orders;
DROP POLICY IF EXISTS "Public can insert order_items" ON order_items;
DROP POLICY IF EXISTS "Allow public order insertion" ON orders;
DROP POLICY IF EXISTS "Allow public order_items insertion" ON order_items;

-- 3. Crear políticas para permitir inserciones PÚBLICAS (B2C)
-- Nota: 'TO public' cubre tanto a usuarios logueados como a invitados (anon)
CREATE POLICY "Enable public orders insert" 
ON orders FOR INSERT 
TO public 
WITH CHECK (true);

CREATE POLICY "Enable public order_items insert" 
ON order_items FOR INSERT 
TO public 
WITH CHECK (true);

-- 4. Permitir lectura pública de los pedidos (necesario para el .select() inmediato después del insert)
DROP POLICY IF EXISTS "Enable public orders select" ON orders;
CREATE POLICY "Enable public orders select" 
ON orders FOR SELECT 
TO public 
USING (true);

DROP POLICY IF EXISTS "Enable public order_items select" ON order_items;
CREATE POLICY "Enable public order_items select" 
ON order_items FOR SELECT 
TO public 
USING (true);

-- 5. Mantener políticas de Staff si ya existían (opcional, pero para no romper el admin)
DROP POLICY IF EXISTS "Staff can view all orders" ON orders;
CREATE POLICY "Staff can view all orders"
ON orders FOR SELECT
TO authenticated
USING (true);
