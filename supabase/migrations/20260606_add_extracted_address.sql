-- Añadir columnas para guardar los datos extraídos por la IA (Dirección, Teléfono, NIT)
ALTER TABLE public.order_drafts 
ADD COLUMN IF NOT EXISTS extracted_address TEXT,
ADD COLUMN IF NOT EXISTS extracted_phone TEXT,
ADD COLUMN IF NOT EXISTS extracted_nit TEXT;
