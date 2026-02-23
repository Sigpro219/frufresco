-- Migration: Create Logistic Parameters for Optimizer Control Panel

CREATE TABLE IF NOT EXISTS logistic_parameters (
    id TEXT PRIMARY KEY, -- 'b2b_kg_min', 'b2c_kg_min', 'base_setup_time'
    value DECIMAL NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial values
INSERT INTO logistic_parameters (id, value, description) VALUES 
('b2b_kg_min', 10.0, 'Kilogramos por minuto para clientes institucionales'),
('b2c_kg_min', 5.0, 'Kilogramos por minuto para hogares'),
('base_setup_time', 5.0, 'Tiempo base de parqueo/entrega en minutos')
ON CONFLICT (id) DO UPDATE SET 
    description = EXCLUDED.description;

-- Grant permissions (RLS)
ALTER TABLE logistic_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for authenticated" ON logistic_parameters
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow update for authenticated admins" ON logistic_parameters
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
