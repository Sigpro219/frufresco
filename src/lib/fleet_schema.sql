-- FLUOTA Y CONDUCTORES (EXTENSIÓN)

-- 1. Tabla de Vehículos
CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plate TEXT UNIQUE NOT NULL,
    brand TEXT,
    model TEXT,
    vehicle_type TEXT DEFAULT 'Furgón',
    capacity_kg NUMERIC DEFAULT 1000,
    status TEXT CHECK (status IN ('available', 'on_route', 'maintenance', 'inactive')) DEFAULT 'available',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Vincular Rutas a Vehículos (Foreign Key)
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES public.fleet_vehicles(id);

-- 3. RLS para Vehículos
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Enable all access for authenticated users' AND tablename = 'fleet_vehicles') THEN
        CREATE POLICY "Enable all access for authenticated users" ON public.fleet_vehicles FOR ALL USING (auth.role() = 'authenticated');
    END IF;
END $$;

-- 4. Datos iniciales de flota
INSERT INTO public.fleet_vehicles (plate, brand, model, vehicle_type, capacity_kg, status)
VALUES 
('ABC-123', 'Chevrolet', 'NKR', 'Camión', 3500, 'available'),
('XYZ-789', 'Hino', 'Dutro', 'Furgón', 4500, 'available'),
('FRU-101', 'Foton', 'Miler', 'NPR', 2500, 'available')
ON CONFLICT (plate) DO NOTHING;
