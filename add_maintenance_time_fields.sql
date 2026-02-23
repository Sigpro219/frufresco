-- ADD FIELDS FOR TIME-BASED MAINTENANCE (SOAT, TECNOMECÁNICA)
ALTER TABLE public.maintenance_schedules ADD COLUMN IF NOT EXISTS task_type TEXT DEFAULT 'km'; -- 'km' o 'date'
ALTER TABLE public.maintenance_schedules ADD COLUMN IF NOT EXISTS interval_months INTEGER;
ALTER TABLE public.maintenance_schedules ADD COLUMN IF NOT EXISTS last_performed_date DATE;
ALTER TABLE public.maintenance_schedules ADD COLUMN IF NOT EXISTS next_due_date DATE;

-- ASEGURAR QUE TAREAS EXISTENTES SEAN DE TIPO KM
UPDATE public.maintenance_schedules SET task_type = 'km' WHERE task_type IS NULL;
