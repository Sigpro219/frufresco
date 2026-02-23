-- Asegurar columnas extendidas en Profiles para B2B
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS contact_name TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS nit TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
