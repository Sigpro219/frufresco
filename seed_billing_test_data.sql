
-- GENERACIÓN DE DATA DE PRUEBA: PEDIDOS PENDIENTES POR FACTURAR

DO $$
DECLARE
    v_profile_id UUID;
    v_product_1 UUID;
    v_product_2 UUID;
    v_order_id UUID;
BEGIN
    -- 1. Obtener un perfil de cliente existente (o usar el primero disponible)
    SELECT id INTO v_profile_id FROM profiles WHERE role = 'b2b_client' LIMIT 1;
    
    -- Si no hay perfil B2B, creamos uno de prueba rápido
    IF v_profile_id IS NULL THEN
        INSERT INTO profiles (id, email, company_name, contact_name, role, nit, address)
        VALUES (uuid_generate_v4(), 'test_billing@frubana.com', 'Restaurante El Profe', 'Juan Perez', 'b2b_client', '900123456-1', 'Calle Falsa 123')
        RETURNING id INTO v_profile_id;
    END IF;

    -- 2. Obtener un par de productos para los pedidos
    SELECT id INTO v_product_1 FROM products LIMIT 1;
    SELECT id INTO v_product_2 FROM products OFFSET 1 LIMIT 1;

    -- 3. Crear 5 Pedidos en estado 'delivered' (Listos para facturar/cortar)
    FOR i IN 1..5 LOOP
        INSERT INTO orders (profile_id, status, total, delivery_date, delivery_slot, shipping_address, type)
        VALUES (v_profile_id, 'delivered', 0, CURRENT_DATE, CASE WHEN i % 2 = 0 THEN 'AM' ELSE 'PM' END, 'Sede Prueba ' || i, 'b2b_credit')
        RETURNING id INTO v_order_id;

        -- Agregar ítems a cada pedido
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES 
        (v_order_id, v_product_1, 10 + i, 2500),
        (v_order_id, v_product_2, 5, 4800);

        -- Actualizar el total del pedido
        UPDATE orders SET total = (10 + i) * 2500 + 5 * 4800 WHERE id = v_order_id;
    END LOOP;

    RAISE NOTICE '✅ Se han creado 5 pedidos en estado DELIVERED listos para facturar.';
END $$;

-- Limpiar cualquier relación previa para asegurar que aparezcan en el dashboard
UPDATE orders SET billing_cut_id = NULL WHERE status = 'delivered';
