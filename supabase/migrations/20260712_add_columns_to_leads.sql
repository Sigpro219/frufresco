ALTER TABLE leads ADD COLUMN IF NOT EXISTS status text DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS nit bigint;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS municipality text;

COMMENT ON COLUMN leads.status IS 'Estado del prospecto (new, contacted, converted, rejected)';
COMMENT ON COLUMN leads.nit IS 'NIT o cédula del prospecto comercial';
COMMENT ON COLUMN leads.address IS 'Dirección exacta del establecimiento del prospecto';
COMMENT ON COLUMN leads.municipality IS 'Municipio o ciudad del prospecto para validación de zona';

-- Habilitar inserciones públicas para el rol anon (chatbot)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable public insert for anonymous leads" 
ON public.leads 
FOR INSERT 
TO anon 
WITH CHECK (true);
