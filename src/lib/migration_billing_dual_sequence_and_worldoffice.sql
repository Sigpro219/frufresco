-- MIGRATION: DUAL BILLING SEQUENCES, WORLD OFFICE DESKTOP INTEGRATION & SUCURSAL DOCUMENT REQUIREMENT
-- Contract: SPEC.md v1.9.31 (COM-26, COM-27, COM-28, COM-29, COM-30)

-- 1. Iniciar o actualizar llaves de secuencia en app_settings
INSERT INTO public.app_settings (key, value, description)
VALUES 
  ('billing_invoice_prefix', 'SETT', 'Prefijo oficial DIAN para Facturas de Venta en World Office'),
  ('billing_invoice_next_number', '10001', 'Próximo consecutivo numérico disponible para Facturas de Venta'),
  ('billing_nc_prefix', 'NC-SETT', 'Prefijo oficial DIAN para Notas Crédito en World Office'),
  ('billing_nc_next_number', '501', 'Próximo consecutivo numérico disponible para Notas Crédito'),
  ('billing_resolution_number', '18764000001', 'Número de Resolución de Facturación Electrónica DIAN'),
  ('billing_resolution_date', '2026-01-01', 'Fecha de expedición de la resolución DIAN'),
  ('billing_range_from', '10001', 'Rango autorizado inicial DIAN'),
  ('billing_range_to', '30000', 'Rango autorizado final DIAN')
ON CONFLICT (key) DO NOTHING;

-- 2. Agregar columna document_requirement a profiles (Sucursales B2B)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'document_requirement'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN document_requirement TEXT DEFAULT 'remision_post_entrega' 
        CHECK (document_requirement IN ('remision_post_entrega', 'factura_pre_despacho'));
    END IF;
END $$;

-- 3. Extender billing_invoices para trazabilidad de Notas Crédito y Prefijos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'billing_invoices' AND column_name = 'is_credit_note'
    ) THEN
        ALTER TABLE public.billing_invoices ADD COLUMN is_credit_note BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'billing_invoices' AND column_name = 'parent_invoice_id'
    ) THEN
        ALTER TABLE public.billing_invoices ADD COLUMN parent_invoice_id UUID REFERENCES public.billing_invoices(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'billing_invoices' AND column_name = 'invoice_prefix'
    ) THEN
        ALTER TABLE public.billing_invoices ADD COLUMN invoice_prefix TEXT DEFAULT 'SETT';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'billing_invoices' AND column_name = 'invoice_number_raw'
    ) THEN
        ALTER TABLE public.billing_invoices ADD COLUMN invoice_number_raw INTEGER;
    END IF;
END $$;
