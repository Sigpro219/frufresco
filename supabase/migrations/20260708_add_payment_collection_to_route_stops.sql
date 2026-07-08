-- Migration: Add payment collection columns to route_stops
-- Date: 2026-07-08

ALTER TABLE IF EXISTS route_stops
ADD COLUMN IF NOT EXISTS collected_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS collected_method TEXT; -- 'efectivo', 'transferencia', 'none'

COMMENT ON COLUMN route_stops.collected_amount IS 'Monto real cobrado por el conductor para este stop de entrega';
COMMENT ON COLUMN route_stops.collected_method IS 'Metodo de cobro utilizado por el conductor: efectivo, transferencia o none';
