-- Synchro de base de datos para la Torre de Control de Transporte
-- Asegura que las tablas tengan las columnas necesarias para Google Magic y KPIs

-- 1. Actualizar tabla de RUTAS
ALTER TABLE routes 
ADD COLUMN IF NOT EXISTS is_optimized BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS theoretical_distance_km DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS theoretical_duration_min INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS logic_parameters_snapshot JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS stops_count INTEGER DEFAULT 0;

-- 2. Asegurar columnas de Kilometraje en VEHÍCULOS
ALTER TABLE fleet_vehicles
ADD COLUMN IF NOT EXISTS avg_daily_km DECIMAL(10,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_odometer_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Tabla de HISTORIAL DE MANTENIMIENTO (Si no existe)
CREATE TABLE IF NOT EXISTS maintenance_history_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vehicle_id UUID REFERENCES fleet_vehicles(id),
    schedule_id UUID REFERENCES maintenance_schedules(id),
    task_name TEXT NOT NULL,
    performed_date DATE NOT NULL,
    performed_km INTEGER NOT NULL,
    performed_by_driver_id UUID REFERENCES profiles(id),
    next_due_date DATE,
    next_due_km INTEGER,
    attachments TEXT[] DEFAULT '{}',
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Parámetros Logísticos Globales
CREATE TABLE IF NOT EXISTS logistic_parameters (
    id TEXT PRIMARY KEY, -- 'b2b_kg_min', 'b2c_kg_min', etc.
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed básico de parámetros si están vacíos
INSERT INTO logistic_parameters (id, value, description)
VALUES 
('b2b_kg_min', '10', 'Eficiencia de descarga B2B en kg/min'),
('b2c_kg_min', '5', 'Eficiencia de descarga B2C en kg/min'),
('base_setup_time', '5', 'Tiempo base por parada en minutos')
ON CONFLICT (id) DO NOTHING;
