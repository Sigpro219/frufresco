-- Arreglar el tipo ENUM user_role para permitir 'client'
-- Diagnóstico: El error "invalid input value for enum user_role: client" indica que 'client' no es válido.

-- 1. Opción segura: Agregar el valor al enum existente (Postgres)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client';

-- NOTA: Si esto falla porque "user_role" no es un tipo, sino un check constraint, entonces:
-- ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
-- ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'user', 'client', 'staff'));
