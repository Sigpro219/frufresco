ALTER TABLE purchases 
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Notificar a PostgREST para que refresque el esquema
NOTIFY pgrst, 'reload config';
