
-- SEED TRANSPORT MAINTENANCE DATA
-- Populates maintenance_schedules for existing fleet vehicles

DO $$
BEGIN
    -- Add maintenance tasks to ALL vehicles
    INSERT INTO maintenance_schedules (vehicle_id, task_name, task_type, interval_km, next_due_km, is_urgent, status)
    SELECT 
        id, 
        'Cambio de Aceite', 
        'km', 
        5000, 
        current_odometer + FLOOR(RANDOM() * 2000) - 500, -- Some overdue, some upcoming
        false,
        'active'
    FROM fleet_vehicles
    ON CONFLICT DO NOTHING;

    INSERT INTO maintenance_schedules (vehicle_id, task_name, task_type, interval_days, next_due_date, is_urgent, status)
    SELECT 
        id, 
        'Revisión Técnico Mecánica', 
        'date', 
        365, 
        CURRENT_DATE + FLOOR(RANDOM() * 60) - 10, -- Some overdue, some upcoming
        false,
        'active'
    FROM fleet_vehicles
    ON CONFLICT DO NOTHING;

    -- Mark some as urgent manually for testing UI
    UPDATE maintenance_schedules 
    SET is_urgent = true 
    WHERE next_due_km < (SELECT current_odometer FROM fleet_vehicles WHERE id = maintenance_schedules.vehicle_id)
    OR next_due_date < CURRENT_DATE;

END $$;
