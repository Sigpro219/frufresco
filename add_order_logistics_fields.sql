
-- AGREGAR CAMPOS OPERATIVOS A PEDIDOS
-- Fecha: 19 de Marzo 2026

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS needs_crates BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS document_type TEXT DEFAULT 'invoice' CHECK (document_type IN ('invoice', 'remission')),
ADD COLUMN IF NOT EXISTS remission_with_prices BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.orders.needs_crates IS 'Copia de la preferencia del cliente al momento del pedido: indica si requiere canastillas';
COMMENT ON COLUMN public.orders.document_type IS 'Copia de la preferencia del cliente: factura o remisión';
COMMENT ON COLUMN public.orders.remission_with_prices IS 'Copia de la preferencia del cliente: mostrar precios en remisión';
