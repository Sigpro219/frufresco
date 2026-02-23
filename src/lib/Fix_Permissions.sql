-- SOLUCIÓN AL BLOQUEO DE LOGIN (POLÍTICAS RLS)
-- Ejecuta esto en el SQL Editor para liberar los permisos de lectura

-- 1. Asegurar que RLS esté activo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas previas si existen (limpieza)
DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON profiles;
DROP POLICY IF EXISTS "Los administradores pueden ver todos los perfiles" ON profiles;

-- 3. Crear política: "Permitir que cada usuario lea su propio perfil"
CREATE POLICY "Los usuarios pueden ver su propio perfil" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- 4. Re-insertar al administrador por si hubo algun error previo
INSERT INTO profiles (id, role, contact_name, company_name)
VALUES 
  ('f767f05e-a4da-41d9-8582-fd68d0f81e61', 'admin', 'Administrador Principal', 'FruFresco Corporativo')
ON CONFLICT (id) DO UPDATE 
SET role = 'admin';

-- 5. Dar permisos publicos de lectura a productos (necesario para el catalogo)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Cualquiera puede ver productos" ON products;
CREATE POLICY "Cualquiera puede ver productos" ON products FOR SELECT USING (true);
