-- Agregar columnas faltantes a la tabla orders para el modulo manual
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS origin_source TEXT DEFAULT 'phone'; -- phone, whatsapp, email
