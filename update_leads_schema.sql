-- Mejora de la tabla de Leads para CRM
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS business_type TEXT,
ADD COLUMN IF NOT EXISTS business_size TEXT,
ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS last_contact_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS next_contact_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS contact_count INT DEFAULT 0;

-- Actualizar comentarios para documentación
COMMENT ON COLUMN leads.business_type IS 'Sector del prospecto (Restaurante, Hotel, etc)';
COMMENT ON COLUMN leads.business_size IS 'Escala de operación capturada por el bot';
COMMENT ON COLUMN leads.next_contact_date IS 'Fecha programada para la siguiente acción comercial (Tarea)';
