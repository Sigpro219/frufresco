-- Migration: Add client credit dossiers table
CREATE TABLE IF NOT EXISTS client_credit_dossiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
    
    -- Request Header Info
    agencia BOOLEAN DEFAULT FALSE,
    supermercado BOOLEAN DEFAULT FALSE,
    ciudad VARCHAR(255),
    cupo_solicitado NUMERIC DEFAULT 0,
    plazo_solicitado INTEGER DEFAULT 0,
    fecha_solicitud DATE DEFAULT CURRENT_DATE,
    tipo_solicitud VARCHAR(50) DEFAULT 'creacion', -- 'creacion' or 'actualizacion'
    
    -- Basic Information
    razon_social VARCHAR(255),
    nombre_comercial VARCHAR(255),
    nit VARCHAR(50),
    direccion VARCHAR(255),
    ciudad_info VARCHAR(255),
    departamento_info VARCHAR(255),
    telefono VARCHAR(50),
    actividad_economica_principal VARCHAR(255),
    ciiu_principal VARCHAR(50),
    actividad_economica_secundaria VARCHAR(255),
    ciiu_secundario VARCHAR(50),
    rep_legal_nombre VARCHAR(255),
    rep_legal_identificacion VARCHAR(50),
    rep_legal_direccion VARCHAR(255),
    rep_legal_telefono VARCHAR(50),
    rep_legal_celular VARCHAR(50),
    rep_legal_email VARCHAR(255),
    rep_legal_es_pep BOOLEAN DEFAULT FALSE,
    
    -- Branch Info
    sucursales_a_crear JSONB DEFAULT '[]'::jsonb,
    
    -- Contacts (Compras, Contabilidad, Oficial Cumplimiento)
    contactos JSONB DEFAULT '[]'::jsonb,
    
    -- Shareholders
    participacion_accionaria JSONB DEFAULT '[]'::jsonb,
    
    -- International Operations
    realiza_operaciones_internacionales BOOLEAN DEFAULT FALSE,
    operaciones_internacionales_detalle JSONB DEFAULT '{}'::jsonb,
    tiene_productos_financieros_internacionales BOOLEAN DEFAULT FALSE,
    productos_financieros_internacionales_detalle JSONB DEFAULT '{}'::jsonb,
    
    -- Financial & Tax Information
    tipo_contribuyente VARCHAR(50) DEFAULT 'persona_juridica', -- 'persona_natural' or 'persona_juridica'
    clase_contribuyente JSONB DEFAULT '{}'::jsonb,
    codigo_ica VARCHAR(50),
    fecha_corte_financiero VARCHAR(50),
    ingresos_mensuales NUMERIC DEFAULT 0,
    egresos_mensuales NUMERIC DEFAULT 0,
    otros_ingresos NUMERIC DEFAULT 0,
    otros_ingresos_concepto VARCHAR(255),
    activo NUMERIC DEFAULT 0,
    pasivo NUMERIC DEFAULT 0,
    patrimonio NUMERIC DEFAULT 0,
    
    -- Electronic Invoicing
    responsable_factura_nombre VARCHAR(255),
    responsable_factura_email VARCHAR(255),
    responsable_factura_telefono VARCHAR(50),
    
    -- References
    referencias_comerciales JSONB DEFAULT '[]'::jsonb,
    referencias_personales JSONB DEFAULT '[]'::jsonb,
    
    -- Commercial Negociation
    condiciones_pago JSONB DEFAULT '{}'::jsonb,
    plazo_pago_dias INTEGER DEFAULT 0,
    negociacion_observaciones TEXT,
    negociacion_dias_pago_soporte TEXT,
    negociacion_seccion VARCHAR(255),
    negociacion_responsable VARCHAR(255),
    declaracion_origen_fondos_fuentes TEXT,
    
    -- Exclusivo Empresa (Administrative approval)
    credito_aprobado BOOLEAN DEFAULT FALSE,
    cupo_aprobado NUMERIC DEFAULT 0,
    plazo_aprobado INTEGER DEFAULT 0,
    vo_bo VARCHAR(255),
    autorizacion_gerencia VARCHAR(255),
    observaciones_director TEXT,
    concepto_coordinador TEXT,
    
    -- Promissory Note & Instructions Letter Info
    pagare_numero VARCHAR(100),
    pagare_acreedor VARCHAR(255) DEFAULT 'INVESTMENTS CORTES S.A.S.',
    pagare_ciudad_firma VARCHAR(255) DEFAULT 'Cali',
    pagare_fecha_firma DATE DEFAULT CURRENT_DATE,
    pagare_firma_deudor JSONB DEFAULT '{}'::jsonb,
    pagare_firma_codeudor JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE client_credit_dossiers ENABLE ROW LEVEL SECURITY;

-- Policy to allow authenticated users to perform all operations
DROP POLICY IF EXISTS "Allow authenticated full access to credit dossiers" ON client_credit_dossiers;
CREATE POLICY "Allow authenticated full access to credit dossiers" 
ON client_credit_dossiers 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Policy to allow anonymous read access (required for printing / reading profiles)
DROP POLICY IF EXISTS "Allow anonymous read access to credit dossiers" ON client_credit_dossiers;
CREATE POLICY "Allow anonymous read access to credit dossiers" 
ON client_credit_dossiers 
FOR SELECT 
TO anon 
USING (true);

