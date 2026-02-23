-- Solución Definitiva: Permitir lectura pública de Perfiles (Restaurar comportamiento original)
-- Esto permite que el usuario 'anon' (sin login) pueda ver los clientes, como funcionaba al principio.

-- 1. Eliminar políticas anteriores para evitar conflictos
DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Public profiles access" ON profiles;

-- 2. Crear política de acceso PÚBLICO (Anon + Authenticated)
CREATE POLICY "Public profiles access"
ON profiles FOR SELECT
TO public
USING (true);

-- 3. Confirmar que RLS sigue activo (es buena práctica mantenerlo activo pero con políticas claras)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
