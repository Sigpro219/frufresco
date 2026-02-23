
-- REPAIR_INVENTORY_SYSTEM.sql
-- Run this in the Supabase SQL Editor to fully initialize the inventory module.

-- 0. Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Warehouses Table
CREATE TABLE IF NOT EXISTS warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    location TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed initial warehouse
INSERT INTO warehouses (name, location)
SELECT 'Bodega Principal Bogotá', 'Calle 13 # 45-67'
WHERE NOT EXISTS (SELECT 1 FROM warehouses);

-- 2. Inventory Stocks Table (Updated with status)
CREATE TABLE IF NOT EXISTS inventory_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) DEFAULT 0,
    min_stock_level DECIMAL(10,2) DEFAULT 0,
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'returned', 'in_process')),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, warehouse_id, status)
);

-- 3. Inventory Movements Table
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    warehouse_id UUID REFERENCES warehouses(id) ON DELETE CASCADE,
    quantity DECIMAL(10,2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('entry', 'exit', 'adjustment', 'transfer')),
    status_from TEXT DEFAULT 'available',
    status_to TEXT DEFAULT 'available',
    reference_type TEXT, -- e.g. 'order', 'purchase', 'manual'
    reference_id UUID,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

-- 4. Inventory Random Tasks (Blind Count)
CREATE TABLE IF NOT EXISTS inventory_random_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheduled_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'alerted')),
    assigned_to UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Inventory Task Details
CREATE TABLE IF NOT EXISTS inventory_task_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID REFERENCES inventory_random_tasks(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    warehouse_id UUID REFERENCES warehouses(id),
    expected_qty DECIMAL(10,2),
    actual_qty DECIMAL(10,2),
    difference_qty DECIMAL(10,2),
    difference_percent DECIMAL(10,2),
    captured_at TIMESTAMPTZ,
    captured_by UUID REFERENCES auth.users(id)
);

-- 6. System Configuration for Inventory
CREATE TABLE IF NOT EXISTS inventory_settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed defaults
INSERT INTO inventory_settings (key, value)
VALUES 
('daily_random_count', '5'),
('alert_threshold_percent', '5.0')
ON CONFLICT (key) DO NOTHING;

-- 7. RPC Function for movements
CREATE OR REPLACE FUNCTION handle_inventory_movement(
    p_product_id UUID,
    p_warehouse_id UUID,
    p_quantity DECIMAL,
    p_type TEXT, -- entry, exit, adjustment, transfer
    p_status_from TEXT DEFAULT 'available',
    p_status_to TEXT DEFAULT 'available',
    p_notes TEXT DEFAULT '',
    p_reference_type TEXT DEFAULT 'manual',
    p_reference_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_movement_id UUID;
BEGIN
    INSERT INTO inventory_movements (
        product_id, warehouse_id, quantity, type, 
        status_from, status_to, notes, reference_type, reference_id
    )
    VALUES (
        p_product_id, p_warehouse_id, p_quantity, p_type,
        p_status_from, p_status_to, p_notes, p_reference_type, p_reference_id
    )
    RETURNING id INTO v_movement_id;

    IF p_status_from IS NOT NULL AND p_status_from <> '' THEN
        INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
        VALUES (p_product_id, p_warehouse_id, p_status_from, -p_quantity)
        ON CONFLICT (product_id, warehouse_id, status)
        DO UPDATE SET 
            quantity = inventory_stocks.quantity - p_quantity,
            updated_at = now();
    END IF;

    IF p_status_to IS NOT NULL AND p_status_to <> '' THEN
        INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
        VALUES (p_product_id, p_warehouse_id, p_status_to, p_quantity)
        ON CONFLICT (product_id, warehouse_id, status)
        DO UPDATE SET 
            quantity = inventory_stocks.quantity + p_quantity,
            updated_at = now();
    END IF;

    RETURN v_movement_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger for Blind Counts differences
CREATE OR REPLACE FUNCTION calculate_inventory_diff()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.actual_qty IS NOT NULL THEN
        NEW.difference_qty = NEW.actual_qty - NEW.expected_qty;
        IF NEW.expected_qty != 0 THEN
            NEW.difference_percent = (ABS(NEW.difference_qty) / NEW.expected_qty) * 100;
        ELSE
            NEW.difference_percent = 100;
        END IF;
        NEW.captured_at = now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_calc_inv_diff ON inventory_task_items;
CREATE TRIGGER trigger_calc_inv_diff
BEFORE UPDATE ON inventory_task_items
FOR EACH ROW
EXECUTE FUNCTION calculate_inventory_diff();

-- 9. Security Policies (RLS)
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_random_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_task_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_settings ENABLE ROW LEVEL SECURITY;

-- Permissive policies for development
CREATE POLICY "Public read warehouses" ON warehouses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read stocks" ON inventory_stocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read movements" ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read tasks" ON inventory_random_tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read items" ON inventory_task_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Public read settings" ON inventory_settings FOR SELECT TO authenticated USING (true);

-- Admin full access
CREATE POLICY "Admin full warehouses" ON warehouses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full stocks" ON inventory_stocks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full movements" ON inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full tasks" ON inventory_random_tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full items" ON inventory_task_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admin full settings" ON inventory_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 10. Initial Stock seeding for existing products
DO $$
DECLARE
    main_wh UUID;
BEGIN
    SELECT id INTO main_wh FROM warehouses LIMIT 1;
    IF main_wh IS NOT NULL THEN
        INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
        SELECT id, main_wh, 'available', 0
        FROM products
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
