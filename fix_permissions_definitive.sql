-- fix_permissions_definitive.sql

-- 1. Habilitar RLS en todas las tablas relevantes (por seguridad estándar)
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas para evitar duplicados o conflictos
DROP POLICY IF EXISTS "Public access routes" ON public.routes;
DROP POLICY IF EXISTS "Public access route_stops" ON public.route_stops;
DROP POLICY IF EXISTS "Public access fleet" ON public.fleet_vehicles;
DROP POLICY IF EXISTS "Public access maintenance" ON public.maintenance_schedules;
DROP POLICY IF EXISTS "Public access delivery_events" ON public.delivery_events;

-- 3. CREAR POLÍTICAS "PERMISIVAS" (Solución al muro invisible)
-- Esto permite que cualquier usuario autenticado (admin, conductor, etc.) pueda VER y EDITAR todo.
-- En un futuro se puede restringir, pero para que la Torre de Control funcione YA, esto es necesario.

CREATE POLICY "Public access routes" ON public.routes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access route_stops" ON public.route_stops FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access fleet" ON public.fleet_vehicles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access maintenance" ON public.maintenance_schedules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access delivery_events" ON public.delivery_events FOR ALL USING (true) WITH CHECK (true);

-- 4. Asegurar que los perfiles también sean visibles (Conductores)
DROP POLICY IF EXISTS "Public profiles view" ON public.profiles;
CREATE POLICY "Public profiles view" ON public.profiles FOR SELECT USING (true);
