-- MODALIDAD DESARROLLO: Abrir acceso público a tablas clave para fluidez de pruebas
-- ATENCIÓN: Solo usar en etapa de desarrollo/testing masivo

-- 1. Habilitar acceso a app_settings para configuración global
ALTER TABLE app_settings DISABLE ROW LEVEL SECURITY;
GRANT ALL ON app_settings TO anon;
GRANT ALL ON app_settings TO authenticated;

-- 2. Habilitar acceso a products para catálogo
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
GRANT ALL ON products TO anon;
GRANT ALL ON products TO authenticated;

-- 3. Habilitar acceso a orders y order_items para flujo de pedidos
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
GRANT ALL ON orders TO anon;
GRANT ALL ON orders TO authenticated;

ALTER TABLE order_items DISABLE ROW LEVEL SECURITY;
GRANT ALL ON order_items TO anon;
GRANT ALL ON order_items TO authenticated;

-- 4. Habilitar acceso a profiles (si es necesario para el B2B)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
GRANT ALL ON profiles TO anon;
GRANT ALL ON profiles TO authenticated;

-- 5. Habilitar acceso a procurement_tasks y proveedores (Compras)
ALTER TABLE procurement_tasks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON procurement_tasks TO anon;
GRANT ALL ON procurement_tasks TO authenticated;

ALTER TABLE providers DISABLE ROW LEVEL SECURITY;
GRANT ALL ON providers TO anon;
GRANT ALL ON providers TO authenticated;

ALTER TABLE product_conversions DISABLE ROW LEVEL SECURITY;
GRANT ALL ON product_conversions TO anon;
GRANT ALL ON product_conversions TO authenticated;

-- 6. Habilitar acceso a Tablas de Inventario y Bodegas
ALTER TABLE inventory_stocks DISABLE ROW LEVEL SECURITY;
GRANT ALL ON inventory_stocks TO anon;
GRANT ALL ON inventory_stocks TO authenticated;

ALTER TABLE inventory_movements DISABLE ROW LEVEL SECURITY;
GRANT ALL ON inventory_movements TO anon;
GRANT ALL ON inventory_movements TO authenticated;

ALTER TABLE warehouses DISABLE ROW LEVEL SECURITY;
GRANT ALL ON warehouses TO anon;
GRANT ALL ON warehouses TO authenticated;

-- 7. Habilitar acceso a Tablas de Rutas y Vehiculos
ALTER TABLE routes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON routes TO anon;
GRANT ALL ON routes TO authenticated;

ALTER TABLE route_stops DISABLE ROW LEVEL SECURITY;
GRANT ALL ON route_stops TO anon;
GRANT ALL ON route_stops TO authenticated;

ALTER TABLE delivery_zones DISABLE ROW LEVEL SECURITY;
GRANT ALL ON delivery_zones TO anon;
GRANT ALL ON delivery_zones TO authenticated;

-- Notificación de éxito
SELECT '✅ RLS Desactivado para Orders, Products, Settings y Profiles. Acceso público habilitado.' as status;
