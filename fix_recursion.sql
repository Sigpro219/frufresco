-- Función segura para verificar si el usuario es admin sin causar recursión
-- SECURITY DEFINER hace que la función se ejecute con los permisos del creador,
-- saltándose las políticas RLS que causan el bucle infinito.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'sys_admin', 'web_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asegurar que RLS está activo
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 1. Permitir que cada usuario vea su propio perfil
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" 
ON profiles FOR SELECT 
USING (auth.uid() = id);

-- 2. Permitir que los administradores vean TODOS los perfiles (usando la función segura)
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" 
ON profiles FOR SELECT 
USING (public.is_admin());

-- 3. Permitir actualización del propio perfil
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" 
ON profiles FOR UPDATE 
USING (auth.uid() = id);

-- 4. Permitir a admins actualizar cualquier perfil
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
CREATE POLICY "Admins can update all profiles" 
ON profiles FOR UPDATE 
USING (public.is_admin());
