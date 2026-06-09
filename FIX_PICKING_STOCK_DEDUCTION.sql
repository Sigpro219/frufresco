-- FIX_PICKING_STOCK_DEDUCTION.sql
-- Ejecuta este script en el SQL Editor de Supabase para corregir el descuento automático de stock durante el picking.

-- 1. ACTUALIZAR LA FUNCIÓN DEL TRIGGER DE PICKING PARA INCLUIR EL ESTADO DE ORIGEN
CREATE OR REPLACE FUNCTION handle_picking_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
    default_warehouse_id UUID;
    diff DECIMAL;
    v_parent_id UUID;
    v_conversion_factor DECIMAL;
    v_final_product_id UUID;
    v_final_quantity DECIMAL;
BEGIN
    -- Obtener ID de la bodega principal
    SELECT id INTO default_warehouse_id FROM warehouses LIMIT 1;
    
    -- Calcular la diferencia de lo que se acaba de pickear (soporta ediciones)
    diff := COALESCE(NEW.picked_quantity, 0) - COALESCE(OLD.picked_quantity, 0);

    -- Solo actuar si hubo cambio en la cantidad pickeada
    IF diff <> 0 THEN
        
        -- EXCEPCIÓN: Rechazos (Calidad Roja) no restan stock comercial
        IF NEW.quality_status = 'red' THEN
            RETURN NEW;
        END IF;

        -- LÓGICA DE FRACCIONAMIENTO:
        -- Buscamos si el producto tiene un padre y su factor de conversión
        SELECT parent_id, COALESCE(web_conversion_factor, 1.0) 
        INTO v_parent_id, v_conversion_factor
        FROM products 
        WHERE id = NEW.product_id;

        -- Si tiene padre, el descuento se redirige al PADRE con el factor aplicado
        IF v_parent_id IS NOT NULL THEN
            v_final_product_id := v_parent_id;
            v_final_quantity := diff * v_conversion_factor;
        ELSE
            v_final_product_id := NEW.product_id;
            v_final_quantity := diff;
        END IF;

        -- Insertar movimiento de SALIDA redirigido especificando status_from = 'available'
        INSERT INTO inventory_movements (
            product_id,
            warehouse_id,
            quantity,
            type,
            reference_type,
            reference_id,
            notes,
            created_at,
            status_from,  -- Agregamos la columna de estado origen
            status_to     -- Aseguramos que destino sea NULL
        ) VALUES (
            v_final_product_id,
            default_warehouse_id,
            -v_final_quantity, -- Signo negativo para RESTAR del stock
            'exit',
            'order_item',
            NEW.id,
            CASE 
                WHEN v_parent_id IS NOT NULL THEN 'Fraccionamiento (Hijo: ' || NEW.product_id || ')'
                ELSE 'Salida automática picking'
            END,
            NOW(),
            'available', -- Descontamos del stock disponible
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asegurar que el trigger de picking esté activo
DROP TRIGGER IF EXISTS trigger_deduct_picking ON order_items;
CREATE TRIGGER trigger_deduct_picking
AFTER UPDATE OF picked_quantity, quality_status ON order_items
FOR EACH ROW
EXECUTE FUNCTION handle_picking_inventory_deduction();

COMMENT ON FUNCTION handle_picking_inventory_deduction() IS 'V3.2 - Automatiza el fraccionamiento y descuenta stock del padre especificando status_from como available.';


-- 2. RECALCULAR STOCK HISTÓRICO GLOBAL PARA DEJAR EL INVENTARIO EN EL ESTADO CORRECTO
UPDATE inventory_stocks SET quantity = 0;

DO $$
DECLARE
    r RECORD;
    v_qty_from DECIMAL;
    v_qty_to DECIMAL;
BEGIN
    FOR r IN SELECT * FROM inventory_movements ORDER BY created_at ASC LOOP
        -- Si es un movimiento de picking antiguo sin status_from, le asignamos 'available' temporalmente para el cálculo
        IF r.reference_type = 'order_item' AND (r.status_from IS NULL OR r.status_from = '') THEN
            r.status_from := 'available';
        END IF;

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
            -- Fallback
            IF r.type = 'exit' OR r.quantity < 0 THEN
                v_qty_from := r.quantity;
                v_qty_to := 0;
            ELSE
                v_qty_from := 0;
                v_qty_to := r.quantity;
            END IF;
        END IF;

        -- Aplicar a status_from
        IF v_qty_from <> 0 THEN
            INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
            VALUES (r.product_id, r.warehouse_id, COALESCE(r.status_from, 'available'), v_qty_from)
            ON CONFLICT (product_id, warehouse_id, status)
            DO UPDATE SET 
                quantity = inventory_stocks.quantity + v_qty_from,
                updated_at = now();
        END IF;

        -- Aplicar a status_to
        IF v_qty_to <> 0 THEN
            INSERT INTO inventory_stocks (product_id, warehouse_id, status, quantity)
            VALUES (r.product_id, r.warehouse_id, COALESCE(r.status_to, 'available'), v_qty_to)
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
