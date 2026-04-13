-- MASTER DATA SCHEMA FOR DELTA CORETECH
-- UNIFYING ZETICAS (CORE), FRUFRESCO (VESSEL), AND TEEP-OEE (HARDWARE)

-- 1. SAAS GOVERNANCE
-----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- Logical URL ID (e.g., app.deltacoretech.com/frufresco)
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  branding_config JSONB DEFAULT '{
    "primary_color": "#0F172A",
    "accent_color": "#10B981",
    "logo_url": null,
    "hero_image": null
  }',
  active_modules JSONB DEFAULT '{
    "commercial": true,
    "ops_admin": true,
    "logistics": false,
    "industrial_oee": false
  }',
  external_mappings JSONB DEFAULT '{}' -- For ERP/API integration IDs
);

-- USER ROLES & ORGANIZATION AFFILIATION
CREATE TABLE IF NOT EXISTS organization_members (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'operator', 'commercial', 'driver')),
  permissions JSONB DEFAULT '{}',
  UNIQUE(organization_id, user_id)
);

-- 2. UNIFIED CLIENT MASTER (Commercial/CRM)
-----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  company_name TEXT NOT NULL,
  identification_number TEXT, -- NIT / RUT
  parent_id UUID REFERENCES clients(id) ON DELETE SET NULL, -- FruFresco Hierarchy
  delivery_zone_id UUID, -- Logistics link
  commercial_status TEXT DEFAULT 'lead' CHECK (commercial_status IN ('lead', 'active', 'inactive', 'prospective')),
  billing_details JSONB DEFAULT '{}', -- Zeticas Billing Logic
  contact_data JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE
);

-- 3. UNIFIED PRODUCT MASTER (Master Data)
-----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS master_products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  unit_of_measure TEXT,
  base_price NUMERIC(15,2) DEFAULT 0,
  min_inventory_level NUMERIC(15,2) DEFAULT 0, -- Zeticas/OEE Alert Logic
  capabilities JSONB DEFAULT '[]', -- ['IS_MANUFACTURED', 'IS_PERISHABLE', 'IS_SERVICE']
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  UNIQUE(organization_id, sku)
);

-- 4. THE INGESTION LAYER (Input Router)
-----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incoming_orders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  source TEXT DEFAULT 'web' CHECK (source IN ('web', 'manual', 'api', 'import')),
  external_reference_id TEXT, -- ERP ID
  client_id UUID REFERENCES clients(id),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'validating', 'processing', 'queued', 'error')),
  payload JSONB NOT NULL, -- Raw data from source
  logic_overrides JSONB DEFAULT '{}'
);

-- ENABLE RLS ON ALL TABLES
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_orders ENABLE ROW LEVEL SECURITY;

-- UNIVERSAL TENANT ISOLATION POLICY
-- (One policy to rule them all, applied with organization_id check)
CREATE POLICY "Tenant Isolation Policy" ON organizations USING (id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Tenant Isolation Policy" ON clients USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Tenant Isolation Policy" ON master_products USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
CREATE POLICY "Tenant Isolation Policy" ON incoming_orders USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));
