-- ==============================================================================
-- MIGRACIÓN: HISTORIAL DE MEDIOS DE PAGO PARA CLIENTES HOGAR Y B2B EN FRUFRESCO
-- ==============================================================================

-- 1. Agregar columna de Medio de Pago Preferido en profiles si no existe
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS preferred_payment_method VARCHAR(50) DEFAULT 'wompi';

-- 2. Crear tabla dedicada para registro y auditoría de transacciones de pago
CREATE TABLE IF NOT EXISTS public.client_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'wompi', -- 'wompi', 'contra_entrega', 'transferencia', 'efectivo', 'datafono'
    payment_status VARCHAR(50) NOT NULL DEFAULT 'approved', -- 'approved', 'pending', 'declined', 'voided'
    transaction_id VARCHAR(100), -- ID Wompi (ej: '12345-16789') o # de comprobante
    payment_channel VARCHAR(50), -- 'CARD', 'PSE', 'NEQUI', 'BANCOLOMBIA_COLLECT', 'CASH', 'DATAPHONE'
    evidence_url TEXT, -- Foto de comprobante o voucher si aplica
    notes TEXT, -- Observaciones o detalle de la transacción
    created_by VARCHAR(100) DEFAULT 'admin'
);

-- Si la tabla ya existía con NUMERIC(12,2), ampliamos el tipo a NUMERIC sin restricción de dígitos
ALTER TABLE public.client_payments ALTER COLUMN amount TYPE NUMERIC;

-- 3. Índices de alta velocidad para carga instantánea
CREATE INDEX IF NOT EXISTS idx_client_payments_profile_id ON public.client_payments(profile_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_order_id ON public.client_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_client_payments_created_at ON public.client_payments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_payments_method ON public.client_payments(payment_method);

-- 4. Habilitar seguridad por fila (RLS)
ALTER TABLE public.client_payments ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de acceso seguras para administradores y usuarios autenticados
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'client_payments' AND policyname = 'Permitir lectura para autenticados'
    ) THEN
        CREATE POLICY "Permitir lectura para autenticados" ON public.client_payments
            FOR SELECT USING (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'client_payments' AND policyname = 'Permitir insercion para autenticados'
    ) THEN
        CREATE POLICY "Permitir insercion para autenticados" ON public.client_payments
            FOR INSERT WITH CHECK (auth.role() = 'authenticated');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'client_payments' AND policyname = 'Permitir actualizacion para autenticados'
    ) THEN
        CREATE POLICY "Permitir actualizacion para autenticados" ON public.client_payments
            FOR UPDATE USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- 6. Migrar pedidos históricos existentes para que tengan su registro de pago
INSERT INTO public.client_payments (profile_id, order_id, amount, payment_method, payment_status, notes, created_at)
SELECT 
    o.profile_id,
    o.id,
    COALESCE(o.total, 0),
    COALESCE(o.payment_method, 'contra_entrega'),
    CASE 
        WHEN o.payment_status IN ('approved', 'Pagado', 'Aprobado_Simulado') THEN 'approved'
        ELSE 'pending'
    END,
    COALESCE(o.admin_notes, 'Migrado desde pedido histórico'),
    o.created_at
FROM public.orders o
WHERE o.profile_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.client_payments cp WHERE cp.order_id = o.id
  );
