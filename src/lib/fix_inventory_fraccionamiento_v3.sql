-- CORRECCIÓN V3.1: Fraccionamiento e Inteligencia de Jerarquía (Signos Corregidos)
-- Redirige la deducción de inventario al PADRE si existe, usando el factor de conversión.
-- Asegura que las salidas comerciales RESTEN del stock físico.

-- 1. Función mejorada para manejar el descuento por item pickeado
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
    -- diff positivo = se pickeó más (salida)
    -- diff negativo = se corrigió a menos (devolución)
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
        -- Si no tiene padre, se queda en el producto original (factor 1.0)
        IF v_parent_id IS NOT NULL THEN
            v_final_product_id := v_parent_id;
            -- Si vendí 1 bolsa de 250g (0.25 Kg), la magnitud es 0.25
            v_final_quantity := diff * v_conversion_factor;
        ELSE
            v_final_product_id := NEW.product_id;
            v_final_quantity := diff;
        END IF;

        -- Insertar movimiento de SALIDA redirigido
        -- USAMOS -v_final_quantity porque el trigger 'update_inventory_on_movement' 
        -- hace una suma (stock + quantity). Para restar, quantity debe ser negativa.
        INSERT INTO inventory_movements (
            product_id,
            warehouse_id,
            quantity,
            type,
            reference_type,
            reference_id,
            notes,
            created_at
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
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Asegurar que el trigger esté activo
DROP TRIGGER IF EXISTS trigger_deduct_picking ON order_items;

CREATE TRIGGER trigger_deduct_picking
AFTER UPDATE OF picked_quantity, quality_status ON order_items
FOR EACH ROW
EXECUTE FUNCTION handle_picking_inventory_deduction();

COMMENT ON FUNCTION handle_picking_inventory_deduction() IS 'V3.1 - Automatiza el fraccionamiento: descuenta stock del padre usando el factor de conversión del hijo, con signos corregidos para resta física.';
