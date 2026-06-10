-- FIX_PICKING_NO_REDIRECTION.sql
-- Ejecuta este script en el SQL Editor de Supabase para desactivar la redirección al padre y descontar directamente del SKU alistado.

CREATE OR REPLACE FUNCTION handle_picking_inventory_deduction()
RETURNS TRIGGER AS $$
DECLARE
    default_warehouse_id UUID;
    diff DECIMAL;
BEGIN
    -- Obtener ID de la bodega principal
    SELECT id INTO default_warehouse_id FROM warehouses LIMIT 1;
    
    -- Calcular la diferencia de lo que se acaba de alistar (soporta ediciones y correcciones)
    diff := COALESCE(NEW.picked_quantity, 0) - COALESCE(OLD.picked_quantity, 0);

    -- Solo actuar si hubo cambio en la cantidad alistada
    IF diff <> 0 THEN
        
        -- EXCEPCIÓN: Rechazos (Calidad Roja) no restan stock comercial
        IF NEW.quality_status = 'red' THEN
            RETURN NEW;
        END IF;

        -- Insertar movimiento de SALIDA para el SKU real vendido (sea hijo o padre directo)
        -- Cumple con la regla de negocio: Compras, Alistas y Descuentas por SKU Hijo directamente
        INSERT INTO inventory_movements (
            product_id,
            warehouse_id,
            quantity,
            type,
            reference_type,
            reference_id,
            notes,
            created_at,
            status_from,  
            status_to     
        ) VALUES (
            NEW.product_id, -- Siempre descontamos directamente del SKU de la orden (sin redirección)
            default_warehouse_id,
            -diff, -- Signo negativo para RESTAR del stock
            'exit',
            'order_item',
            NEW.id,
            'Salida automática picking (Gestión directa por SKU)',
            NOW(),
            'available', -- Descontamos del stock disponible
            NULL
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION handle_picking_inventory_deduction() IS 'V4.0 - Descuenta directamente el SKU hijo al pickear, desactivando redirección al padre.';
