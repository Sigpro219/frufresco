-- CORRECCIÓN V2: Trigger en order_items (Granular)
-- Soluciona el problema de actualizaciones de estado y evita doble descuento en rechazos.

-- 1. Función para manejar el descuento por item pickeado
CREATE OR REPLACE FUNCTION handle_picking_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
    default_warehouse_id UUID;
    diff DECIMAL;
BEGIN
    -- Obtener ID de la bodega principal
    SELECT id INTO default_warehouse_id FROM warehouses LIMIT 1;
    
    -- Calcular la diferencia de lo que se acaba de pickear
    -- (Soporta correcciones: si cambié de 0 a 10, diff=10. Si cambié de 10 a 8, diff=-2)
    diff := COALESCE(NEW.picked_quantity, 0) - COALESCE(OLD.picked_quantity, 0);

    -- Solo actuar si hubo cambio en la cantidad pickeada
    IF diff <> 0 THEN
        
        -- EXCEPCIÓN: Si el item está marcado como RECHAZADO (Red), no lo descontamos como venta/salida.
        -- La App de Picking ya inserta un movimiento de "Ajuste/Daño" para estos casos.
        -- Si descontáramos aquí también, duplicaríamos la salida.
        IF NEW.quality_status = 'red' THEN
            RETURN NEW;
        END IF;

        -- Insertar movimiento de SALIDA (EXIT) o DEVOLUCIÓN (si diff es negativo)
        -- inventory_movements maneja signos: 'exit' resta.
        -- Si diff es positivo (pickeé más), insertamos 'exit' con cantidad positiva (Resta stock).
        -- Si diff es negativo (corregí hacia abajo), insertamos 'exit' con cantidad negativa (Suma stock/Devuelve).
        -- O mejor: Usamos 'adjustment' si es negativo? No, 'exit' con negativo es válido para reversión.
        
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
            NEW.product_id,
            default_warehouse_id,
            diff,              -- Cantidad (Positiva = Salida, Negativa = Devolución)
            'exit',            -- Tipo salida comercial
            'order_item',      -- Referencia item
            NEW.id,
            'Salida automática por picking (Item ' || NEW.id || ')',
            NOW()
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Limpieza de intentos anteriores
DROP TRIGGER IF EXISTS trigger_deduct_inventory ON orders; -- Eliminar el v1 si existe
DROP TRIGGER IF EXISTS trigger_deduct_picking ON order_items;

-- 3. Crear el Trigger en order_items
CREATE TRIGGER trigger_deduct_picking
AFTER UPDATE OF picked_quantity, quality_status ON order_items
FOR EACH ROW
EXECUTE FUNCTION handle_picking_inventory_deduction();

-- 4. Comentario
COMMENT ON TRIGGER trigger_deduct_picking ON order_items IS 'Descuenta inventario en tiempo real al actualizar la cantidad pickeada, ignorando rechazos';
