-- =====================================================================
-- TRIGGER DE SINCRONIZACIÓN EN TIEMPO REAL: inventory_movements <-> inventory_stocks
-- FruFresco - Motor de Inventarios
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sync_inventory_stock_on_movement()
RETURNS TRIGGER AS $$
DECLARE
    target_status TEXT;
    delta_qty NUMERIC;
BEGIN
    target_status := COALESCE(NEW.status_to, 'available');

    IF NEW.type = 'entry' THEN
        delta_qty := ABS(COALESCE(NEW.quantity, 0));
    ELSIF NEW.type = 'exit' THEN
        delta_qty := -ABS(COALESCE(NEW.quantity, 0));
    ELSIF NEW.type = 'adjustment' THEN
        delta_qty := COALESCE(NEW.quantity, 0);
    ELSE
        delta_qty := COALESCE(NEW.quantity, 0);
    END IF;

    INSERT INTO public.inventory_stocks (
        product_id,
        warehouse_id,
        status,
        quantity,
        min_stock_level,
        updated_at
    )
    VALUES (
        NEW.product_id,
        NEW.warehouse_id,
        target_status,
        GREATEST(0, delta_qty),
        0,
        NOW()
    )
    ON CONFLICT (product_id, warehouse_id, status)
    DO UPDATE SET
        quantity = GREATEST(0, public.inventory_stocks.quantity + delta_qty),
        updated_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_inventory_stock_movement ON public.inventory_movements;

CREATE TRIGGER trg_sync_inventory_stock_movement
AFTER INSERT ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_stock_on_movement();
