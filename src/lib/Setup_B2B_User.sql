-- PASO 1: Ve a Authentication -> Users en tu panel de Supabase.
-- PASO 2: Haz clic en "Add User" -> "Create new user".
-- PASO 3: Crea el usuario con el correo y contraseña que prefieras.
-- PASO 4: Copia el "User ID" (UUID) que se generó.
-- PASO 5: Pega ese ID abajo y ejecuta este script en el SQL Editor.

-- Reemplaza 'TU_USER_ID_AQUÍ' con el UUID copiado
INSERT INTO profiles (id, role, company_name)
VALUES ('TU_USER_ID_AQUÍ', 'b2b_client', 'Frubana Test Client')
ON CONFLICT (id) DO UPDATE 
SET role = 'b2b_client';
