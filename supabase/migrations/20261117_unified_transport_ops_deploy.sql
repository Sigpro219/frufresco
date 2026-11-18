-- Migración Zero-Downtime: Acople Unificado Transporte + Despachos + /ops/* (SDD Escenario 468)
-- 1. Tabla maestra de Turnos Operativos (Ciclo de Vida Diario + Modo Espejo vs Digital Nativo)
CREATE TABLE IF NOT EXISTS public.operational_shifts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_date date NOT NULL UNIQUE,
    mode text NOT NULL DEFAULT 'manual_mirror' CHECK (mode IN ('manual_mirror', 'digital_native')),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_by uuid NULL,
    closed_by uuid NULL,
    closed_at timestamptz NULL,
    notes text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Completar columnas faltantes en asset_movements para Kardex de Canastillas (4 Actores)
ALTER TABLE public.asset_movements
    ADD COLUMN IF NOT EXISTS order_id uuid NULL,
    ADD COLUMN IF NOT EXISTS profile_id uuid NULL,
    ADD COLUMN IF NOT EXISTS movement_type text NULL,
    ADD COLUMN IF NOT EXISTS delivered_qty numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS received_qty numeric DEFAULT 0,
    ADD COLUMN IF NOT EXISTS balance_after numeric NULL,
    ADD COLUMN IF NOT EXISTS evidence_url text NULL;

-- 3. Persistir ETAs de Google Route Optimization API en route_stops
ALTER TABLE public.route_stops
    ADD COLUMN IF NOT EXISTS estimated_arrival text NULL;

-- 4. Trazabilidad RCA e Idempotencia en billing_returns & customer_service_pqrs
ALTER TABLE public.billing_returns
    ADD COLUMN IF NOT EXISTS defect_category_l1 text NULL,
    ADD COLUMN IF NOT EXISTS defect_subtype_l2 text NULL,
    ADD COLUMN IF NOT EXISTS imputed_responsible text NULL,
    ADD COLUMN IF NOT EXISTS source text NULL,
    ADD COLUMN IF NOT EXISTS dedup_key text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_returns_dedup_key
    ON public.billing_returns (dedup_key)
    WHERE dedup_key IS NOT NULL;

ALTER TABLE public.customer_service_pqrs
    ADD COLUMN IF NOT EXISTS defect_category_l1 text NULL,
    ADD COLUMN IF NOT EXISTS defect_subtype_l2 text NULL,
    ADD COLUMN IF NOT EXISTS imputed_responsible text NULL;
