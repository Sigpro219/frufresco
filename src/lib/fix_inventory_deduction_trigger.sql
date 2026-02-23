-- 1. Función para manejar la deducción de inventario
CREATE OR REPLACE FUNCTION handle_order_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
    order_item RECORD;
    default_warehouse_id UUID;
BEGIN
    -- Solo proceder si el estado cambia a 'approved' (o el estado final de venta)
    -- Y si el estado anterior NO era 'approved' (evitar duplicados)
    IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
        
        -- Obtener ID de la bodega principal (Asumimos bodega única o principal por ahora)
        SELECT id INTO default_warehouse_id FROM warehouses LIMIT 1;
        
        IF default_warehouse_id IS NULL THEN
            RAISE EXCEPTION 'No warehouse found for inventory deduction';
        END IF;

        -- Iterar sobre los items de la orden
        FOR order_item IN 
            SELECT * FROM order_items WHERE order_id = NEW.id
        LOOP
            -- Insertar movimiento de SALIDA (EXIT)
            -- Esto disparará el trigger 'update_inventory_on_movement' existente
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
                order_item.product_id,
                default_warehouse_id,
                order_item.quantity, -- Cantidad a descontar
                'exit',              -- Tipo salida
                'order',             -- Referencia orden
                NEW.id,
                'Salida automática por aprobación de orden #' || NEW.sequence_id,
                NOW()
            );
        END LOOP;
        
        -- Opcional: Loguear en consola de Postgres
        RAISE NOTICE 'Inventario descontado para Orden %', NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Crear el Trigger en la tabla orders
DROP TRIGGER IF EXISTS trigger_deduct_inventory ON orders;

CREATE TRIGGER trigger_deduct_inventory
AFTER UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_order_inventory_deduction();

-- 3. Comentario de documentación
COMMENT ON TRIGGER trigger_deduct_inventory ON orders IS 'Descuenta inventario automáticamente cuando una orden pasa a estado approved';
