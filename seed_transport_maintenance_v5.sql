
-- FIX AND SEED MAINTENANCE DATA (V5 - CONSTRAINT FIX)
-- 1. Add missing properties
ALTER TABLE maintenance_schedules 
ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false;

ALTER TABLE maintenance_schedules 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

ALTER TABLE maintenance_schedules 
ADD COLUMN IF NOT EXISTS interval_days INTEGER DEFAULT 0;

-- 2. Now run the seed logic
DO $$
BEGIN
    -- Add maintenance tasks to ALL vehicles (KM based)
    -- Ensure interval_days has a value (0)
    INSERT INTO maintenance_schedules (vehicle_id, task_name, task_type, interval_km, next_due_km, interval_days, is_urgent, status)
    SELECT 
        id, 
        'Cambio de Aceite', 
        'km', 
        5000, 
        current_odometer + FLOOR(RANDOM() * 2000) - 500,
        0, -- Default for KM tasks
        false,
        'active'
    FROM fleet_vehicles
    ON CONFLICT DO NOTHING;

    -- Add maintenance tasks (Date based)
    -- FIX: Provide 0 for interal_km to satisfy NOT NULL constraint
    INSERT INTO maintenance_schedules (vehicle_id, task_name, task_type, interval_km, next_due_km, interval_days, next_due_date, is_urgent, status)
    SELECT 
        id, 
        'Revisión Técnico Mecánica', 
        'date', 
        0, -- Default for Date tasks (Satisfies NOT NULL)
        0, -- Default for next_due_km
        365, 
        CURRENT_DATE + (FLOOR(RANDOM() * 60) - 10)::INTEGER, 
        false,
        'active'
    FROM fleet_vehicles
    ON CONFLICT DO NOTHING;

    -- 3. Update Urgency
    UPDATE maintenance_schedules ms
    SET is_urgent = true
    FROM fleet_vehicles fv
    WHERE ms.vehicle_id = fv.id
    AND ms.task_type = 'km'
    AND ms.next_due_km < fv.current_odometer;

    UPDATE maintenance_schedules
    SET is_urgent = true
    WHERE task_type = 'date'
    AND next_due_date < CURRENT_DATE;

END $$;
