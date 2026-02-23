
-- SEED INVENTORY DATA
-- Populates the inventory_stocks table with initial data for existing products

DO $$
DECLARE
    main_wh UUID;
BEGIN
    -- 1. Get the main warehouse ID (or create one if missing)
    SELECT id INTO main_wh FROM warehouses LIMIT 1;
    
    IF main_wh IS NULL THEN
        INSERT INTO warehouses (name, location) VALUES ('Bodega Principal', 'Calle 13') RETURNING id INTO main_wh;
    END IF;

    -- 2. Insert stock for ALL existing products
    INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity, min_stock_level, updated_at)
    SELECT 
        id, 
        main_wh, 
        'available', 
        FLOOR(RANDOM() * 500) + 50, -- Random stock between 50 and 550
        20, -- Default min stock
        NOW()
    FROM products
    ON CONFLICT (product_id, warehouse_id, status) 
    DO UPDATE SET quantity = EXCLUDED.quantity;

    -- 3. Create some dummy movements for the movements tab
    INSERT INTO inventory_movements (product_id, warehouse_id, quantity, type, status_from, status_to, notes)
    SELECT 
        id, 
        main_wh, 
        10, 
        'entry', 
        'available', 
        'available', 
        'Carga Inicial Automática'
    FROM products
    LIMIT 10;

END $$;
