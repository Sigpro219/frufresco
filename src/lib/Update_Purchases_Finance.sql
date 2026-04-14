-- ENRIQUECIMIENTO FINANCIERO PARA MÓDULO DE COMPRAS
-- Soporte para modelo de costeo Crédito vs Contado y seguimiento de proveedores especializados

-- 1. Definir tipo de pago
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method_type') THEN
        CREATE TYPE payment_method_type AS ENUM ('cash', 'credit');
    END IF;
END $$;

-- 2. Añadir campos a la tabla de compras
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS payment_method payment_method_type DEFAULT 'cash',
ADD COLUMN IF NOT EXISTS raw_data_source TEXT, -- Para identificar si viene de 'Excel Oct 2025', etc.
ADD COLUMN IF NOT EXISTS is_pre_digital_entry BOOLEAN DEFAULT false; -- Marca para datos históricos cargados vía script

-- 3. Identificación de proveedores estratégicos (Ginger)
ALTER TABLE public.providers 
ADD COLUMN IF NOT EXISTS is_specialized_credit BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Registrar a GINGER como proveedor estratégico si no existe
INSERT INTO public.providers (name, is_specialized_credit, category, notes)
VALUES ('GINGER Y GINGER', true, 'Especializado', 'Proveedor estratégico de crédito para SKUs específicos')
ON CONFLICT DO NOTHING;

-- 5. Crear tabla para sugerencias del Agente Predictivo (Opcional, para no ensuciar Products)
CREATE TABLE IF NOT EXISTS public.price_suggestions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    suggested_base_price DECIMAL NOT NULL,
    algorithm_used TEXT DEFAULT 'exponential_smoothing_v1',
    reasoning TEXT, -- Ej: 'Price drop detected -3%', 'Seasonal harvest alert'
    status TEXT DEFAULT 'pending', -- pending, applied, rejected
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.price_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access price_suggestions" ON public.price_suggestions FOR ALL USING (true) WITH CHECK (true);
