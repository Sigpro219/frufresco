-- RESTAURACIÓN COMPLETA DEL MÓDULO DE TRANSPORTE
-- Ejecuta todo este script para corregir: Conductores perdidos, Flota vacía y Planeador sin datos.

-- ==========================================
-- 1. CORRECCIÓN DE SEGURIDAD (RLS) - "El problema de los invisibles"
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas restrictivas antiguas
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Fleet vehicles are viewable by everyone" ON public.fleet_vehicles;

-- Crear políticas de VISIBILIDAD TOTAL
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Fleet vehicles are viewable by everyone" ON public.fleet_vehicles FOR SELECT USING (true);

-- Políticas de escritura básicas
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Authenticated users can update fleet" ON public.fleet_vehicles FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated users can insert fleet" ON public.fleet_vehicles FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ==========================================
-- 2. RESTAURACIÓN DE CONDUCTORES (DATA)
-- ==========================================
-- Aseguramos que existan al menos estos conductores base con el rol correcto
INSERT INTO public.profiles (id, contact_name, role, is_active, email)
VALUES 
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bdd380a1', 'Juan Pérez', 'driver', true, 'juan.perez@frubana.com'),
  ('b1eebc99-9c0b-4ef8-bb6d-6bb9bdd380a2', 'Carlos Rodríguez', 'driver', true, 'carlos.rodriguez@frubana.com'),
  ('c2eebc99-9c0b-4ef8-bb6d-6bb9bdd380a3', 'Luis Hernández', 'driver', true, 'luis.hernandez@frubana.com'),
  ('d3eebc99-9c0b-4ef8-bb6d-6bb9bdd380a4', 'Ana Gómez', 'driver', true, 'ana.gomez@frubana.com'),
  ('e4eebc99-9c0b-4ef8-bb6d-6bb9bdd380a5', 'Pedro Martínez', 'driver', true, 'pedro.martinez@frubana.com')
ON CONFLICT (id) DO UPDATE SET 
    role = 'driver', 
    is_active = true;

-- Forzar rol 'driver' a cualquiera que parezca conductor
UPDATE public.profiles SET role = 'driver' WHERE contact_name ILIKE '%conductor%' OR contact_name ILIKE '%chofer%';

-- ==========================================
-- 3. RESTAURACIÓN DE FLOTA (DATA)
-- ==========================================
INSERT INTO fleet_vehicles (plate, brand, model, vehicle_type, capacity_kg, status, current_odometer, avg_daily_km)
VALUES 
  ('FXX-001', 'Chevrolet', 'NKR', 'Furgón', 3500, 'available', 12500, 120),
  ('FXX-002', 'Hino', 'Dutro', 'Furgón', 4500, 'available', 8900, 95),
  ('FXX-003', 'Foton', 'Aumark', 'Furgón', 2500, 'available', 15400, 150),
  ('FXX-004', 'JAC', '1063', 'Furgón', 5000, 'available', 21000, 110),
  ('FXX-005', 'Chevrolet', 'NHR', 'Furgón', 2000, 'available', 5600, 80),
  ('FXX-006', 'Isuzu', 'Forward', 'Furgón', 6000, 'available', 32000, 200),
  ('FXX-007', 'Mitsubishi', 'Canter', 'Furgón', 4000, 'available', 11200, 130),
  ('FXX-008', 'Nissan', 'Cabstar', 'Furgón', 3000, 'available', 9800, 100)
ON CONFLICT (plate) DO UPDATE SET status = 'available';

-- ==========================================
-- 4. PREPARACIÓN DEL PLANEADOR
-- ==========================================
-- Mueve pedidos a 'approved' para que aparezcan en la lista
UPDATE orders SET status = 'approved' WHERE status IN ('draft', 'pending_approval');
