
-- AGREGAR CAMPOS OPERATIVOS A PERFILES (INSTITUCIONALES Y CONSUMIDORES)
-- Fecha: 19 de Marzo 2026

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS needs_crates BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'invoice' CHECK (document_type IN ('invoice', 'remission')),
ADD COLUMN IF NOT EXISTS remission_with_prices BOOLEAN DEFAULT true;

-- Comentario: Estos campos permiten filtrar la carga y el tipo de documento en el checkout y logística.
COMMENT ON COLUMN public.profiles.needs_crates IS 'Indica si el cliente requiere la entrega en canastillas (logística retornable)';
COMMENT ON COLUMN public.profiles.document_type IS 'Tipo de documento preferido: factura o remisión';
COMMENT ON COLUMN public.profiles.remission_with_prices IS 'Si es remisión, indica si debe mostrar precios al cliente';
