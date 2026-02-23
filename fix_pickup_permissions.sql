-- Habilitar RLS en la tabla purchases
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Política de lectura pública/autenticada para evitar errores de permisos en development
DROP POLICY IF EXISTS "Enable read access for all users" ON purchases;
CREATE POLICY "Enable read access for all users" ON purchases FOR SELECT USING (true);

-- Política de actualización para usuarios autenticados (o todos si se prefiere evitar bloqueos)
DROP POLICY IF EXISTS "Enable update for all users" ON purchases;
CREATE POLICY "Enable update for all users" ON purchases FOR UPDATE USING (true);

-- Verificar si products necesita políticas también
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public products access" ON products;
CREATE POLICY "Public products access" ON products FOR SELECT USING (true);

-- Notificar
SELECT 'Permisos de Recogida actualizados correctamente' as result;
