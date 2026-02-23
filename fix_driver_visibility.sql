-- fix_driver_visibility.sql

-- 1. Asegurar que RLS esté activo pero con políticas permisivas para lectura
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas que podrían estar causando conflicto
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Drivers viewable by operation" ON public.profiles;

-- 3. Crear política de LECTURA TOTAL (Solución Definitiva para "Conductores Perdidos")
-- Esto permite que cualquier usuario (autenticado o anon) pueda ver la lista de conductores
CREATE POLICY "Public profiles are viewable by everyone" 
ON public.profiles FOR SELECT 
USING (true);

-- 4. Políticas de escritura (Mantener seguridad básica)
CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- 5. Asegurar Fleet Vehicles también sea visible
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Fleet vehicles are viewable by everyone" ON public.fleet_vehicles;

CREATE POLICY "Fleet vehicles are viewable by everyone" 
ON public.fleet_vehicles FOR SELECT 
USING (true);

-- 6. Política para permitir asignar conductores (Update en fleet_vehicles)
-- Idealmente restringido a admin, pero por ahora abierto a autenticados para evitar bloqueos
CREATE POLICY "Authenticated users can update fleet" 
ON public.fleet_vehicles FOR UPDATE 
USING (auth.role() = 'authenticated');

-- 7. Insertar política para insert en fleet_vehicles
CREATE POLICY "Authenticated users can insert fleet" 
ON public.fleet_vehicles FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');
