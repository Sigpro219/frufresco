-- ============================================================================
-- MIGRACIÓN CANÓNICA SDD v1.9.208 (DEBT-001): DEDUCCIÓN Y AJUSTE ATÓMICO DE INVENTARIO (P0)
-- Patrón: Zero-Downtime Expand & Fallback (100% Idempotente)
-- Propósito:
--   1. Erradicar condiciones de carrera (Race Conditions) en actualización de `inventory_stocks`
--      mediante bloqueo pesimista de fila (`FOR UPDATE`).
--   2. Proveer `adjust_inventory_stock_atomic` para ajustes/mermas/entradas unitarias en 1 viaje de red.
--   3. Proveer `deduct_inventory_atomic` para deducción transaccional de múltiples SKUs por orden.
-- ============================================================================

BEGIN;

-- 1. Función RPC para ajuste o deducción atómica de un SKU en una bodega (con bloqueo FOR UPDATE)
CREATE OR REPLACE FUNCTION public.adjust_inventory_stock_atomic(
    p_product_id UUID,
    p_warehouse_id UUID,
    p_delta NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stock_id UUID;
    v_current_qty NUMERIC;
    v_new_qty NUMERIC;
BEGIN
    IF p_product_id IS NULL OR p_warehouse_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'product_id and warehouse_id are required');
    END IF;

    -- Bloqueo pesimista de fila (FOR UPDATE) para impedir lecturas sucias concurrentes
    SELECT id, COALESCE(quantity, 0)
    INTO v_stock_id, v_current_qty
    FROM public.inventory_stocks
    WHERE product_id = p_product_id
      AND warehouse_id = p_warehouse_id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;

    IF v_stock_id IS NOT NULL THEN
        v_new_qty := GREATEST(0, v_current_qty + COALESCE(p_delta, 0));
        UPDATE public.inventory_stocks
        SET quantity = v_new_qty,
            updated_at = now()
        WHERE id = v_stock_id;
    ELSE
        v_current_qty := 0;
        v_new_qty := GREATEST(0, COALESCE(p_delta, 0));
        INSERT INTO public.inventory_stocks (product_id, warehouse_id, quantity, status, updated_at)
        VALUES (p_product_id, p_warehouse_id, v_new_qty, 'available', now())
        RETURNING id INTO v_stock_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'stock_id', v_stock_id,
        'previous_quantity', v_current_qty,
        'new_quantity', v_new_qty
    );
END;
$$;

-- 2. Función RPC para deducción masiva atómica por pedido (DEBT-001 Blueprint)
CREATE OR REPLACE FUNCTION public.deduct_inventory_atomic(
    p_order_id UUID,
    p_warehouse_id UUID,
    p_items JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_stock_id UUID;
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_processed INTEGER := 0;
BEGIN
    FOR v_item IN
        SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity NUMERIC)
    LOOP
        SELECT id, COALESCE(quantity, 0)
        INTO v_stock_id, v_current_stock
        FROM public.inventory_stocks
        WHERE product_id = v_item.product_id
          AND (p_warehouse_id IS NULL OR warehouse_id = p_warehouse_id)
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
        FOR UPDATE;

        IF v_stock_id IS NOT NULL THEN
            v_new_stock := GREATEST(0, v_current_stock - COALESCE(v_item.quantity, 0));
            UPDATE public.inventory_stocks
            SET quantity = v_new_stock,
                updated_at = now()
            WHERE id = v_stock_id;
            v_processed := v_processed + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'processed_items', v_processed
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.adjust_inventory_stock_atomic(UUID, UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_inventory_atomic(UUID, UUID, JSONB) TO authenticated, service_role;

COMMIT;
