DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'app_settings') THEN
        ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Allow public read access" ON public.app_settings;
        DROP POLICY IF EXISTS "Enable read for everyone" ON public.app_settings;
        DROP POLICY IF EXISTS "Allow public read" ON public.app_settings;
        CREATE POLICY "Allow public read" ON public.app_settings FOR SELECT USING (true);
        CREATE POLICY "Allow admins full access" ON public.app_settings FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- 2. PROFILES (Used by AuthContext)
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Los usuarios pueden ver su propio perfil" ON public.profiles;
        DROP POLICY IF EXISTS "Los administradores pueden ver todos los perfiles" ON public.profiles;
        DROP POLICY IF EXISTS "Allow users to read own profile" ON public.profiles;
        DROP POLICY IF EXISTS "Allow admins to see all profiles" ON public.profiles;
        CREATE POLICY "Allow users to read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    END IF;
END $$;

-- 3. TRANSPORT TABLES
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'routes') THEN
        ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public access to routes" ON public.routes;
        CREATE POLICY "Public access to routes" ON public.routes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'route_stops') THEN
        ALTER TABLE public.route_stops ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public access to stops" ON public.route_stops;
        CREATE POLICY "Public access to stops" ON public.route_stops FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. DELIVERY EVENTS
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'delivery_events') THEN
        ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public access to delivery_events" ON public.delivery_events;
        CREATE POLICY "Public access to delivery_events" ON public.delivery_events FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 5. FLEET AND MAINTENANCE
DO $$ BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fleet_vehicles') THEN
        ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public access to fleet_vehicles" ON public.fleet_vehicles;
        CREATE POLICY "Public access to fleet_vehicles" ON public.fleet_vehicles FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'maintenance_schedules') THEN
        ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public full access maintenance_schedules" ON public.maintenance_schedules;
        CREATE POLICY "Public full access maintenance_schedules" ON public.maintenance_schedules FOR ALL USING (true) WITH CHECK (true);
    END IF;

    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fleet_activity_logs') THEN
        ALTER TABLE public.fleet_activity_logs ENABLE ROW LEVEL SECURITY;
        DROP POLICY IF EXISTS "Public full access fleet_activity_logs" ON public.fleet_activity_logs;
        CREATE POLICY "Public full access fleet_activity_logs" ON public.fleet_activity_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 6. GRANT PERMISSIONS
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- 7. REFRESH CACHE
NOTIFY pgrst, 'reload schema';

