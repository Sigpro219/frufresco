-- AMPLIACIÓN DE DATOS DE PROVEEDORES
-- Ejecuta este script para permitir capturar NIT y Teléfono al crear proveedores.

ALTER TABLE public.providers 
ADD COLUMN IF NOT EXISTS tax_id TEXT, -- CC o NIT
ADD COLUMN IF NOT EXISTS contact_phone TEXT; -- Asegurar que existe si no estaba
