-- Habilitar acceso de lectura a la tabla PROFILES para usuarios autenticados (Staff/Admins)
-- Esto permite que el Admin busque clientes en la base de datos.

-- 1. Asegurar que RLS esté activo (buena práctica)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Crear política para permitir SELECT a todos los usuarios autenticados
-- (En producción podrías restringirlo más a solo rol='admin', pero para operar ahora esto desbloquea).
DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;

CREATE POLICY "Staff can view all profiles"
ON profiles FOR SELECT
TO authenticated
USING (true);

-- (Opcional) Si la app corre sin loguearse a veces, podrías necesitar 'anon' también, pero asumo que el Admin se loguea.
