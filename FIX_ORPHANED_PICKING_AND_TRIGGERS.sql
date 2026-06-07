-- FIX_ORPHANED_PICKING_AND_TRIGGERS.sql
-- Ejecuta este script en el SQL Editor de Supabase para reparar el inventario y prevenir desincronizaciones futuras.

-- 1. ACTUALIZAR EL TRIGGER DE MOVIMIENTOS PARA SOPORTAR INSERT, UPDATE Y DELETE
CREATE OR REPLACE FUNCTION trigger_update_inventory_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_qty_from DECIMAL;
    v_qty_to DECIMAL;
BEGIN
    -- PASO A: REVERTIR EL EFECTO DEL REGISTRO ANTERIOR SI ES UPDATE O DELETE
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        IF OLD.status_from IS NOT NULL AND OLD.status_from <> '' AND OLD.status_to IS NOT NULL AND OLD.status_to <> '' THEN
            IF OLD.status_from = OLD.status_to THEN
                v_qty_from := 0;
                v_qty_to := OLD.quantity;
            ELSE
                IF OLD.quantity < 0 THEN
                    v_qty_from := OLD.quantity;
                    v_qty_to := -OLD.quantity;
                ELSE
                    v_qty_from := -OLD.quantity;
                    v_qty_to := OLD.quantity;
                END IF;
            END IF;
        ELSIF OLD.status_from IS NOT NULL AND OLD.status_from <> '' THEN
            v_qty_from := OLD.quantity;
            v_qty_to := 0;
        ELSIF OLD.status_to IS NOT NULL AND OLD.status_to <> '' THEN
            v_qty_from := 0;
            v_qty_to := OLD.quantity;
        ELSE
            v_qty_from := 0;
            v_qty_to := 0;
        END IF;

        -- Revertir restando v_qty_from de status_from
        IF v_qty_from <> 0 THEN
            UPDATE inventory_stocks 
            SET quantity = inventory_stocks.quantity - v_qty_from,
                updated_at = now()
            WHERE product_id = OLD.product_id 
              AND warehouse_id = OLD.warehouse_id 
              AND status = OLD.status_from;
        END IF;

        -- Revertir restando v_qty_to de status_to
        IF v_qty_to <> 0 THEN
            UPDATE inventory_stocks 
            SET quantity = inventory_stocks.quantity - v_qty_to,
                updated_at = now()
            WHERE product_id = OLD.product_id 
              AND warehouse_id = OLD.warehouse_id 
              AND status = OLD.status_to;
        END IF;
    END IF;

    -- PASO B: APLICAR EL EFECTO DEL NUEVO REGISTRO SI ES INSERT O UPDATE
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.status_from IS NOT NULL AND NEW.status_from <> '' AND NEW.status_to IS NOT NULL AND NEW.status_to <> '' THEN
            IF NEW.status_from = NEW.status_to THEN
                v_qty_from := 0;
                v_qty_to := NEW.quantity;
            ELSE
                IF NEW.quantity < 0 THEN
                    v_qty_from := NEW.quantity;
                    v_qty_to := -NEW.quantity;
                ELSE
                    v_qty_from := -NEW.quantity;
                    v_qty_to := NEW.quantity;
                END IF;
            END IF;
        ELSIF NEW.status_from IS NOT NULL AND NEW.status_from <> '' THEN
            v_qty_from := NEW.quantity;
            v_qty_to := 0;
        ELSIF NEW.status_to IS NOT NULL AND NEW.status_to <> '' THEN
            v_qty_from := 0;
            v_qty_to := NEW.quantity;
        ELSE
            v_qty_from := 0;
            v_qty_to := 0;
        END IF;

        -- Aplicar sumando v_qty_from a status_from
        IF v_qty_from <> 0 THEN
            INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
            VALUES (NEW.product_id, NEW.warehouse_id, NEW.status_from, v_qty_from)
            ON CONFLICT (product_id, warehouse_id, status)
            DO UPDATE SET 
                quantity = inventory_stocks.quantity + v_qty_from,
                updated_at = now();
        END IF;

        -- Aplicar sumando v_qty_to a status_to
        IF v_qty_to <> 0 THEN
            INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
            VALUES (NEW.product_id, NEW.warehouse_id, NEW.status_to, v_qty_to)
            ON CONFLICT (product_id, warehouse_id, status)
            DO UPDATE SET 
                quantity = inventory_stocks.quantity + v_qty_to,
                updated_at = now();
        END IF;
    END IF;

    -- PASO C: AUTO-LIMPIEZA DE FILAS EN CERO DE ESTADOS TEMPORALES
    DELETE FROM inventory_stocks 
    WHERE quantity = 0 AND status <> 'available';

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Recrear el trigger para que escuche INSERT, UPDATE y DELETE
DROP TRIGGER IF EXISTS trg_update_inventory_stock ON inventory_movements;
CREATE TRIGGER trg_update_inventory_stock
AFTER INSERT OR UPDATE OR DELETE ON inventory_movements
FOR EACH ROW
EXECUTE FUNCTION trigger_update_inventory_stock();


-- 2. CREAR DISPARADOR DE BORRADO EN ORDER_ITEMS PARA CASCADA DE PICKING
CREATE OR REPLACE FUNCTION handle_order_item_deletion()
RETURNS TRIGGER AS $$
BEGIN
    -- Borrar automáticamente los movimientos de picking huérfanos
    DELETE FROM inventory_movements 
    WHERE reference_type = 'order_item' AND reference_id = OLD.id;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delete_picking_on_item_delete ON order_items;
CREATE TRIGGER trigger_delete_picking_on_item_delete
AFTER DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION handle_order_item_deletion();


-- 3. DEPURACIÓN CORRECTIVA: ELIMINAR MOVIMIENTOS HUÉRFANOS DE RESET PREVIOS
DELETE FROM inventory_movements
WHERE reference_type = 'order_item'
  AND reference_id NOT IN (SELECT id FROM order_items);


-- 4. RECALCULAR STOCK HISTÓRICO GLOBAL PARA ASEGURAR COHERENCIA ABSOLUTA
UPDATE inventory_stocks SET quantity = 0;

DO $$
DECLARE
    r RECORD;
    v_qty_from DECIMAL;
    v_qty_to DECIMAL;
BEGIN
    FOR r IN SELECT * FROM inventory_movements ORDER BY created_at ASC LOOP
        IF r.status_from IS NOT NULL AND r.status_from <> '' AND r.status_to IS NOT NULL AND r.status_to <> '' THEN
            IF r.status_from = r.status_to THEN
                v_qty_from := 0;
                v_qty_to := r.quantity;
            ELSE
                IF r.quantity < 0 THEN
                    v_qty_from := r.quantity;
                    v_qty_to := -r.quantity;
                ELSE
                    v_qty_from := -r.quantity;
                    v_qty_to := r.quantity;
                END IF;
            END IF;
        ELSIF r.status_from IS NOT NULL AND r.status_from <> '' THEN
            v_qty_from := r.quantity;
            v_qty_to := 0;
        ELSIF r.status_to IS NOT NULL AND r.status_to <> '' THEN
            v_qty_from := 0;
            v_qty_to := r.quantity;
        ELSE
            v_qty_from := 0;
            v_qty_to := 0;
        END IF;

        -- Aplicar a status_from
        IF v_qty_from <> 0 THEN
            INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
            VALUES (r.product_id, r.warehouse_id, r.status_from, v_qty_from)
            ON CONFLICT (product_id, warehouse_id, status)
            DO UPDATE SET 
                quantity = inventory_stocks.quantity + v_qty_from,
                updated_at = now();
        END IF;

        -- Aplicar a status_to
        IF v_qty_to <> 0 THEN
            INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
            VALUES (r.product_id, r.warehouse_id, r.status_to, v_qty_to)
            ON CONFLICT (product_id, warehouse_id, status)
            DO UPDATE SET 
                quantity = inventory_stocks.quantity + v_qty_to,
                updated_at = now();
        END IF;
    END LOOP;
END $$;

-- Depuración final de filas en cero no-principales
DELETE FROM inventory_stocks 
WHERE quantity = 0 AND status <> 'available';
