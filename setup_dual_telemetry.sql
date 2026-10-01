-- ==============================================================================
-- FRUFRESCO ERP/TMS - MIGRACIÓN TELEMETRÍA DUAL (SDD v1.9.75)
-- Soporte para Hardware GPS Fijo (apps-360.online) y Tracker Móvil Resiliente
-- ==============================================================================

-- 1. Ampliar fleet_vehicles con atributos canónicos de telemetría
ALTER TABLE public.fleet_vehicles 
  ADD COLUMN IF NOT EXISTS last_latitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS last_longitude numeric(10, 7),
  ADD COLUMN IF NOT EXISTS speed numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heading numeric(5, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ignition_status boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_gps_sync timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS gps_imei text,
  ADD COLUMN IF NOT EXISTS tracking_source text DEFAULT 'hardware_gps';

-- 2. Crear tabla de auditoría histórica (Miga de pan) con ciclo de retención
CREATE TABLE IF NOT EXISTS public.vehicle_gps_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
  plate text NOT NULL,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  speed numeric(5, 2) DEFAULT 0,
  heading numeric(5, 2) DEFAULT 0,
  accuracy numeric(6, 2),
  battery_level numeric(4, 1),
  ignition_status boolean DEFAULT true,
  tracking_source text DEFAULT 'hardware_gps',
  created_at timestamptz DEFAULT now()
);

-- 3. Índices de alta velocidad para consultas operativas y purga nocturna
CREATE INDEX IF NOT EXISTS idx_vehicle_gps_logs_created_at ON public.vehicle_gps_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_vehicle_gps_logs_plate ON public.vehicle_gps_logs(plate);

-- 4. Función de Purga Automática (48 Horas)
CREATE OR REPLACE FUNCTION public.purge_stale_gps_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_rows integer;
BEGIN
  DELETE FROM public.vehicle_gps_logs
  WHERE created_at < NOW() - INTERVAL '48 hours';
  GET DIAGNOSTICS deleted_rows = ROW_COUNT;
  RETURN deleted_rows;
END;
$$;

-- 5. Comentarios de documentación de esquema
COMMENT ON TABLE public.vehicle_gps_logs IS 'Bitácora temporal de miga de pan satelital/móvil con política de retención automática de 48 horas (SDD v1.9.75).';
