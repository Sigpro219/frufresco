-- PASO 1: Ejecutar este SQL en el Supabase CORE (kuxnixwoacwsotcilhuz)

CREATE TABLE IF NOT EXISTS fleet_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_name TEXT NOT NULL,
  tenant_slug TEXT UNIQUE NOT NULL,
  supabase_url TEXT NOT NULL,
  service_role_key TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial')),
  subscription_start TIMESTAMPTZ DEFAULT now(),
  subscription_duration_months INTEGER DEFAULT 12,
  subscription_end TIMESTAMPTZ,
  branding_config JSONB DEFAULT '{}'::jsonb,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Función para calcular automáticamente la fecha de fin basada en duración
CREATE OR REPLACE FUNCTION set_subscription_end() 
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.subscription_end IS NULL THEN
    NEW.subscription_end := NEW.subscription_start + (NEW.subscription_duration_months || ' months')::interval;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_set_subscription_end ON fleet_tenants;
CREATE TRIGGER tr_set_subscription_end
BEFORE INSERT OR UPDATE ON fleet_tenants
FOR EACH ROW EXECUTE FUNCTION set_subscription_end();

-- Comentario de seguridad: Esta tabla solo debe existir en el CORE.
COMMENT ON TABLE fleet_tenants IS 'Master controller for all SaaS instances (Tenants)';
