-- CREACIÓN DE USUARIO ADMINISTRADOR
-- 1. Ve a "Authentication" -> "Users" en Supabase.
-- 2. Haz clic en "Add User" -> "Create new user".
-- 3. Usa un correo (ej: admin@frufresco.com) y una contraseña.
-- 4. Una vez creado, copia el "User ID" (UUID).
-- 5. Pega el UUID abajo y ejecuta este script en el SQL Editor:

INSERT INTO profiles (id, role, contact_name, company_name)
VALUES 
  ('f767f05e-a4da-41d9-8582-fd68d0f81e61', 'admin', 'Administrador Principal', 'FruFresco Corporativo')
ON CONFLICT (id) DO UPDATE 
SET role = 'admin';
