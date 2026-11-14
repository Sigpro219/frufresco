-- Migration: Create public.inventory_gate_overrides (SDD v1.9.412 - Escenario 457)
-- Auditoría de lanzamientos de emergencia cuando la última jornada operada previa carece de cierre oficial sellado.

CREATE TABLE IF NOT EXISTS public.inventory_gate_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_operation_date DATE NOT NULL,
    pending_closing_date DATE NULL,
    source_kind TEXT NOT NULL CHECK (source_kind IN ('official_closing', 'unclosed_counts', 'reopened_closing', 'excel_baseline', 'none')),
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 8),
    authorized_by UUID NULL,
    authorized_by_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_gate_overrides_target_date
    ON public.inventory_gate_overrides (target_operation_date DESC, created_at DESC);

ALTER TABLE public.inventory_gate_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read inventory_gate_overrides" ON public.inventory_gate_overrides;
CREATE POLICY "Allow read inventory_gate_overrides"
    ON public.inventory_gate_overrides
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow authorized insert inventory_gate_overrides" ON public.inventory_gate_overrides;
CREATE POLICY "Allow authorized insert inventory_gate_overrides"
    ON public.inventory_gate_overrides
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND (
                  p.role IN ('admin', 'sys_admin', 'supervisor')
                  OR COALESCE(p.custom_permissions, ARRAY[]::text[]) && ARRAY['*', 'admin.orders', 'admin.inventory']
              )
        )
    );

COMMENT ON TABLE public.inventory_gate_overrides IS 'Registro inmutable de autorizaciones de emergencia al lanzar operación (para_compra) sin cierre oficial previo.';
