-- MÓDULO 2: ESQUEMA DE COMPRAS Y ABASTECIMIENTO

-- 1. Tabla de Proveedores (Maestro de Abastos)
CREATE TABLE IF NOT EXISTS providers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    location TEXT, -- Ej: Bodega 4, Puesto 12
    contact_phone TEXT,
    category TEXT, -- Frutas, Verduras, etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Consolidado de Necesidades (Lo que el sistema pide comprar)
CREATE TABLE IF NOT EXISTS procurement_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id),
    total_requested DECIMAL NOT NULL DEFAULT 0,
    total_purchased DECIMAL DEFAULT 0,
    unit TEXT, -- kg, unidad, etc.
    delivery_date DATE NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, partial, completed, substituted
    original_product_id UUID REFERENCES products(id), -- Para trazabilidad en caso de sustitución
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Registro de Compras (Lo que el comprador efectivamente hace)
CREATE TABLE IF NOT EXISTS purchases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES procurement_tasks(id),
    product_id UUID REFERENCES products(id),
    provider_id UUID REFERENCES providers(id),
    quantity DECIMAL NOT NULL,
    unit_price DECIMAL NOT NULL,
    total_cost DECIMAL NOT NULL,
    voucher_image_url TEXT,
    buyer_id UUID REFERENCES profiles(id),
    pickup_location TEXT, -- Dónde recoger la mercancía
    estimated_pickup_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Datos Iniciales de Prueba (Proveedores)
INSERT INTO providers (name, location, category) VALUES 
('Don Mario - Frutas Especiales', 'Bodega 12, Puesto 45', 'Frutas'),
('Verduras El Primo', 'Bodega 4, Puesto 102', 'Verduras'),
('Distribuidora La Granja', 'Bodega 8, Puesto 22', 'Lácteos'),
('Puesto de Doña Luz', 'Pasillo 3, Local 15', 'Frutas')
ON CONFLICT DO NOTHING;

-- RLS Básico para Operaciones
ALTER TABLE providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

-- Por ahora, acceso abierto para facilitar el desarrollo según política previa
CREATE POLICY "Acceso total para desarrollo" ON providers FOR ALL USING (true);
CREATE POLICY "Acceso total para desarrollo" ON procurement_tasks FOR ALL USING (true);
CREATE POLICY "Acceso total para desarrollo" ON purchases FOR ALL USING (true);
