-- Escenario 502: Kits GPS Portátiles Itinerantes (Flota Tercera) + Coexistencia Dual + Triggers de Liberación

CREATE TABLE IF NOT EXISTS public.portable_gps_kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL UNIQUE,
    imei TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL DEFAULT 'apps360' CHECK (provider IN ('apps360', 'webhook')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portable_gps_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow staff to manage portable_gps_kits" ON public.portable_gps_kits;
CREATE POLICY "Allow staff to manage portable_gps_kits"
ON public.portable_gps_kits
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'sys_admin', 'web_admin', 'operations', 'COORDINADOR DE OPERACIONES')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'sys_admin', 'web_admin', 'operations', 'COORDINADOR DE OPERACIONES')
    )
);

ALTER TABLE public.fleet_vehicles
    ADD COLUMN IF NOT EXISTS gps_kit_id UUID REFERENCES public.portable_gps_kits(id) ON DELETE SET NULL;

ALTER TABLE public.vehicle_gps_logs
    ADD COLUMN IF NOT EXISTS battery_level NUMERIC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_vehicles_gps_imei_unique
    ON public.fleet_vehicles (gps_imei)
    WHERE gps_imei IS NOT NULL AND gps_imei <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_fleet_vehicles_gps_kit_id_unique
    ON public.fleet_vehicles (gps_kit_id)
    WHERE gps_kit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_release_portable_gps_kit_on_route_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_norm_plate TEXT;
    v_has_other_active BOOLEAN;
BEGIN
    v_norm_plate := UPPER(TRIM(COALESCE(NEW.vehicle_plate, '')));
    IF v_norm_plate = '' THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.routes r
        WHERE r.id <> NEW.id
          AND UPPER(TRIM(COALESCE(r.vehicle_plate, ''))) = v_norm_plate
          AND r.status IN ('planning', 'planned', 'loading', 'rectified', 'in_transit', 'assigned')
    ) INTO v_has_other_active;

    IF NOT v_has_other_active THEN
        UPDATE public.fleet_vehicles
        SET
            gps_kit_id = NULL,
            gps_imei = NULL,
            last_gps_sync = CASE WHEN tracking_source = 'hardware_gps' THEN NULL ELSE last_gps_sync END
        WHERE UPPER(TRIM(COALESCE(plate, ''))) = v_norm_plate
          AND gps_kit_id IS NOT NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_portable_gps_kit_on_route_close ON public.routes;
CREATE TRIGGER trg_release_portable_gps_kit_on_route_close
    AFTER UPDATE OF status ON public.routes
    FOR EACH ROW
    WHEN (NEW.status IN ('completed', 'cancelled') AND OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION public.fn_release_portable_gps_kit_on_route_close();

CREATE OR REPLACE FUNCTION public.fn_cleanup_vehicle_before_kit_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.fleet_vehicles
    SET
        gps_kit_id = NULL,
        gps_imei = NULL,
        last_gps_sync = CASE WHEN tracking_source = 'hardware_gps' THEN NULL ELSE last_gps_sync END
    WHERE gps_kit_id = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_vehicle_before_kit_delete ON public.portable_gps_kits;
CREATE TRIGGER trg_cleanup_vehicle_before_kit_delete
    BEFORE DELETE ON public.portable_gps_kits
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_cleanup_vehicle_before_kit_delete();
