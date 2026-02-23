-- Asegurar acceso PÚBLICO TOTAL de lectura a la tabla profiles
-- Esto es necesario para que el panel de administración pueda listar nombres de clientes

-- 1. Habilitar RLS (si no lo estaba)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas conflictivas (limpieza)
DROP POLICY IF EXISTS "Public profiles access" ON profiles;
DROP POLICY IF EXISTS "Allow public read access" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;

-- 3. Crear NUEVA política permisiva
CREATE POLICY "Public Read Access"
ON profiles
FOR SELECT
USING (true); -- Permitir a TODO el mundo leer

-- 4. Verificar grants
GRANT SELECT ON profiles TO anon, authenticated, service_role;
