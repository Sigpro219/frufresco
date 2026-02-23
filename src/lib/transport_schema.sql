-- 1. Actualizar la tabla de vehículos con campos de control de kilometraje
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS current_odometer INTEGER DEFAULT 0;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS avg_daily_km FLOAT DEFAULT 0;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS last_odometer_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Crear tabla para el cronograma de mantenimientos
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
    task_name TEXT NOT NULL, 
    task_type TEXT DEFAULT 'km', -- 'km' o 'date'
    interval_km INTEGER,
    interval_months INTEGER,
    last_performed_km INTEGER,
    last_performed_date DATE,
    next_due_km INTEGER NOT NULL,
    next_due_date DATE,
    is_urgent BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Crear tabla para los registros (Logs) de actividad de la flota
CREATE TABLE IF NOT EXISTS public.fleet_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
    driver_id UUID REFERENCES public.profiles(id),
    activity_type TEXT NOT NULL, -- 'route', 'workshop', 'parking', 'fuel'
    start_km INTEGER NOT NULL,
    end_km INTEGER,
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    notes TEXT
);

-- 4. Habilitar RLS (Seguridad) para las nuevas tablas
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_activity_logs ENABLE ROW LEVEL SECURITY;

-- 5. Crear políticas de acceso público (para desarrollo)
CREATE POLICY "Public full access maintenance_schedules" ON public.maintenance_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access fleet_activity_logs" ON public.fleet_activity_logs FOR ALL USING (true) WITH CHECK (true);

-- 6. Insertar algunos mantenimientos base para los 8 camiones (ejemplo inicial)
-- Nota: Esto asume que los IDs de los vehículos ya existen. En la práctica se hará desde la UI.
-- 7. Crear tabla para el historial detallado de mantenimientos con evidencias
CREATE TABLE IF NOT EXISTS public.maintenance_history_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID REFERENCES public.fleet_vehicles(id) ON DELETE CASCADE,
    schedule_id UUID REFERENCES public.maintenance_schedules(id) ON DELETE SET NULL,
    task_name TEXT NOT NULL,
    performed_date DATE NOT NULL,
    performed_km INTEGER NOT NULL,
    performed_by_driver_id UUID REFERENCES public.profiles(id),
    next_due_date DATE,
    next_due_km INTEGER,
    attachments TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.maintenance_history_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public full access maintenance_history_logs" ON public.maintenance_history_logs FOR ALL USING (true) WITH CHECK (true);
