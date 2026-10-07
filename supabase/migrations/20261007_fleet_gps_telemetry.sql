-- ==============================================================================
-- Migration: 20261007_fleet_gps_telemetry.sql
-- Description: Agrega columnas de telemetría GPS satelital en vivo a fleet_vehicles
--              y crea la tabla de bitácora histórica vehicle_gps_logs.
-- Ecosistema: FruFresco TMS / Apps-360 Telemetry Connector
-- ==============================================================================

-- 1. Asegurar columnas de telemetría en tiempo real en la tabla de flota de vehículos
ALTER TABLE public.fleet_vehicles 
ADD COLUMN IF NOT EXISTS last_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS last_longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS speed NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS heading NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS ignition_status BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS last_gps_sync TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tracking_source TEXT DEFAULT 'hardware_gps',
ADD COLUMN IF NOT EXISTS gps_imei TEXT;

-- 2. Crear tabla para almacenamiento histórico de bitácoras GPS (telemetría y auditoría de rutas)
CREATE TABLE IF NOT EXISTS public.vehicle_gps_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
    plate TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    speed NUMERIC DEFAULT 0,
    heading NUMERIC DEFAULT 0,
    ignition_status BOOLEAN DEFAULT true,
    tracking_source TEXT DEFAULT 'hardware_gps',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Índices de alto rendimiento para consultas por placa y rango de fechas
CREATE INDEX IF NOT EXISTS idx_vehicle_gps_logs_plate_date 
ON public.vehicle_gps_logs(plate, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_gps_logs_vehicle_id 
ON public.vehicle_gps_logs(vehicle_id);

-- 4. Seguridad de Nivel de Fila (RLS)
ALTER TABLE public.vehicle_gps_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'vehicle_gps_logs' AND policyname = 'Public read vehicle_gps_logs'
    ) THEN
        CREATE POLICY "Public read vehicle_gps_logs" 
        ON public.vehicle_gps_logs FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'vehicle_gps_logs' AND policyname = 'Service insert vehicle_gps_logs'
    ) THEN
        CREATE POLICY "Service insert vehicle_gps_logs" 
        ON public.vehicle_gps_logs FOR INSERT WITH CHECK (true);
    END IF;
END $$;
