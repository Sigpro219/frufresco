-- Asegurar que RLS está activo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1. Permitir que cada usuario vea su propio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- 2. Permitir que los administradores vean TODOS los perfiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'sys_admin', 'web_admin')
  )
);

-- 3. Permitir actualización del propio perfil
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- 4. (Opcional) Permitir lectura pública si es necesario para ciertos flujos (como registro o validación previa)
-- Usar con cuidado. Si check_profiles_temp.js funcionaba, tal vez había una política pública.
-- Descomentar si es necesario:
-- CREATE POLICY "Public read profiles" ON profiles FOR SELECT USING (true);
