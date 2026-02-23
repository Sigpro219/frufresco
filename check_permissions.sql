-- check_permissions.sql

-- 1. Verificar si RLS está activo en las tablas críticas
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('routes', 'route_stops', 'delivery_events', 'fleet_vehicles', 'profiles');

-- 2. Listar las políticas actuales (RLS Policies)
SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('routes', 'route_stops', 'delivery_events', 'fleet_vehicles', 'profiles');

-- 3. Intentar leer un registro (Si esto falla, es RLS o tabla vacía)
-- Esto debe ejecutarse desde el usuario de la aplicación para ser válido
SELECT 'routes' as table_name, count(*) FROM routes;
SELECT 'route_stops' as table_name, count(*) FROM route_stops;
SELECT 'fleet_vehicles' as table_name, count(*) FROM fleet_vehicles;

-- 4. Verificar roles de usuario
SELECT * FROM auth.users LIMIT 5; -- Solo visible si eres superadmin/service_role
