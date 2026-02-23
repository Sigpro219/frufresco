-- RPC Function to record inventory movements and update stocks accurately
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
    -- 1. Record the movement
    INSERT INTO inventory_movements (
        product_id, warehouse_id, quantity, type, 
        status_from, status_to, notes, reference_type, reference_id
    )
    VALUES (
        p_product_id, p_warehouse_id, p_quantity, p_type,
        p_status_from, p_status_to, p_notes, p_reference_type, p_reference_id
    )
    RETURNING id INTO v_movement_id;

    -- 2. Update status_from stock (subtract)
    IF p_status_from IS NOT NULL AND p_status_from <> '' THEN
        INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
        VALUES (p_product_id, p_warehouse_id, p_status_from, -p_quantity)
        ON CONFLICT (product_id, warehouse_id, status)
        DO UPDATE SET 
            quantity = inventory_stocks.quantity - p_quantity,
            updated_at = now();
    END IF;

    -- 3. Update status_to stock (add)
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
