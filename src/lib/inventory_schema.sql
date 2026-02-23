-- Inventory Module Schema for Frubana Express

-- 1. Warehouses Table
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial warehouse if none exists
INSERT INTO warehouses (name, location)
SELECT 'Bodega Principal Bogotá', 'Calle 13 # 45-67'
WHERE NOT EXISTS (SELECT 1 FROM warehouses);

-- 2. Inventory Stocks Table (Current quantity)
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) DEFAULT 0,
    min_stock_level DECIMAL(10,2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, warehouse_id)
);

-- 3. Inventory Movements Table (Log of changes)
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment', 'transfer')),
    reference_type TEXT, -- e.g. 'order', 'purchase', 'manual'
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 4. Automatically initialize stock for existing products in the first warehouse
DO $$
DECLARE
    first_warehouse_id UUID;
BEGIN
    SELECT id INTO first_warehouse_id FROM warehouses LIMIT 1;
    
    INSERT INTO inventory_stocks (product_id, warehouse_id, quantity)
    SELECT id, first_warehouse_id, 0
    FROM products
    ON CONFLICT DO NOTHING;
END $$;

-- 5. Helper function to update stock on movement
CREATE OR REPLACE FUNCTION update_inventory_on_movement()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO inventory_stocks (product_id, warehouse_id, quantity)
    VALUES (NEW.product_id, NEW.warehouse_id, NEW.quantity)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET 
        quantity = inventory_stocks.quantity + EXCLUDED.quantity,
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_inventory_movement
AFTER INSERT ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION update_inventory_on_movement();

-- 6. Grant permissions
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access for authenticated users" ON warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read access for authenticated users" ON inventory_stocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read access for authenticated users" ON inventory_movements FOR SELECT TO authenticated USING (true);

-- Admin write policies
CREATE POLICY "Admin write access" ON warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin write access" ON inventory_stocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin write access" ON inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
