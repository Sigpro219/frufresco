-- Enhanced Inventory Schema for Frubana Express (v2)

-- 1. Update Stocks table to support status
ALTER TABLE inventory_stocks DROP CONSTRAINT IF EXISTS inventory_stocks_product_id_warehouse_id_key;
ALTER TABLE inventory_stocks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'available' CHECK (status IN ('available', 'returned', 'in_process'));

-- Unique constraint must now include status
ALTER TABLE inventory_stocks ADD CONSTRAINT inventory_stocks_product_warehouse_status_key UNIQUE(product_id, warehouse_id, status);

-- 2. Update Movements table
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS status_from TEXT DEFAULT 'available';
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS status_to TEXT DEFAULT 'available';

-- 3. Inventory Random Tasks (Blind Count)
CREATE TABLE IF NOT EXISTS inventory_random_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    scheduled_date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'alerted')),
    assigned_to UUID REFERENCES auth.users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Inventory Task Details (The actual blind results)
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

-- 5. System Configuration for Inventory
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

-- 6. Trigger to calculate differences automatically
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

CREATE TRIGGER trigger_calc_inv_diff
BEFORE UPDATE ON inventory_task_items
FOR EACH ROW
EXECUTE FUNCTION calculate_inventory_diff();
