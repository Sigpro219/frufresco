-- MODIFICACIONES PARA MÓDULO 3.7: CARGUE DE PEDIDOS (CEREBRO OPERATIVO)

-- 1. ASEGURAR COLUMNAS EN ORDERS
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS origin_source TEXT DEFAULT 'web';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS external_id TEXT; -- Para ID de pedido web
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS assigned_route_id UUID; -- Para el planeador inteligente
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS evidence_url TEXT; -- Para adjuntos (WhatsApp/Email)

-- 2. ACTUALIZAR ESTADO INICIAL
-- Aseguramos que 'para_compra' sea un estado válido si usas un check constraint.
-- Por ahora asumimos que es texto libre o que el check permite este valor.
-- Muchas tablas en este proyecto usan estados como 'approved', 'pending_approval'.
-- Actualizaremos el flujo para que el primer estado operativo sea 'para_compra'.

-- 3. TABLA DE MATRIZ DE CONVERSIÓN (LOS "CABLES")
CREATE TABLE IF NOT EXISTS product_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_base_id UUID REFERENCES products(id) ON DELETE CASCADE,
    commercial_name TEXT NOT NULL, -- Ej: 'Verde', 'Pintón', 'Maduro'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TABLA DE AUDITORÍA DE PEDIDOS (PARA MODIFICACIONES/CANCELACIONES)
CREATE TABLE IF NOT EXISTS order_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    changed_by UUID REFERENCES auth.users(id),
    change_type TEXT NOT NULL, -- 'modification', 'cancellation', 'status_change'
    old_data JSONB,
    new_data JSONB,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POLÍTICAS RLS BÁSICAS
ALTER TABLE product_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Read Conversions" ON product_conversions FOR SELECT USING (true);
CREATE POLICY "Admin All Conversions" ON product_conversions FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE order_audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin Read Audit" ON order_audit_logs FOR SELECT USING (auth.role() = 'authenticated');

-- Notificación
SELECT 'Esquema de Cargue de Pedidos preparado' as result;
