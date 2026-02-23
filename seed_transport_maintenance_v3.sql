
-- FIX AND SEED MAINTENANCE DATA (V3)
-- 1. Add missing column if it doesn't exist
ALTER TABLE maintenance_schedules 
ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;

-- 2. Add status column if it doesn't exist
ALTER TABLE maintenance_schedules 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- 3. Add interval_days column if it doesn't exist (CRITICAL FIX)
ALTER TABLE maintenance_schedules 
ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0;

-- 4. Now run the seed logic
DO $$
BEGIN
    -- Add maintenance tasks to ALL vehicles (KM based)
    INSERT INTO maintenance_schedules (vehicle_id, task_name, task_type, interval_km, next_due_km, is_urgent, status)
    SELECT 
        id, 
        'Cambio de Aceite', 
        'km', 
        5000, 
        current_odometer + FLOOR(RANDOM() * 2000) - 500, -- Some overdue (-500), some upcoming
        false,
        'active'
    FROM fleet_vehicles
    ON CONFLICT DO NOTHING;

    -- Add maintenance tasks (Date based)
    INSERT INTO maintenance_schedules (vehicle_id, task_name, task_type, interval_days, next_due_date, is_urgent, status)
    SELECT 
        id, 
        'Revisión Técnico Mecánica', 
        'date', 
        365, 
        CURRENT_DATE + FLOOR(RANDOM() * 60) - 10, -- Some overdue (-10), some upcoming
        false,
        'active'
    FROM fleet_vehicles
    ON CONFLICT DO NOTHING;

    -- 5. Calculate Urgency correctly
    -- Update based on KM
    UPDATE maintenance_schedules ms
    SET is_urgent = true
    FROM fleet_vehicles fv
    WHERE ms.vehicle_id = fv.id
    AND ms.task_type = 'km'
    AND ms.next_due_km < fv.current_odometer;

    -- Update based on Date
    UPDATE maintenance_schedules
    SET is_urgent = true
    WHERE task_type = 'date'
    AND next_due_date < CURRENT_DATE;

END $$;
