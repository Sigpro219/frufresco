-- SCRIPT DE PRUEBA: CARGA MASIVA DE PEDIDOS Y AJUSTE DE CONSOLIDACIÓN
-- Ejecuta esto en el Editor SQL de Supabase para simular la operación de hoy

-- 1. IDENTIFICAR PRODUCTOS (Asegúrate de tener estos IDs o cámbialos por los tuyos)
-- Aquí simulamos la creación de ítems para un pedido B2C (Hogar) y un pedido B2B (Restaurante)

-- 2. INSERTAR PEDIDO HOGAR (B2C)
DO $$
DECLARE
    order_id_b2c UUID;
    tomate_id UUID;
    cebolla_id UUID;
BEGIN
    -- Obtenemos IDs de productos reales (buscamos por nombre aproximado)
    SELECT id INTO tomate_id FROM products WHERE name ILIKE '%Tomate%' LIMIT 1;
    SELECT id INTO cebolla_id FROM products WHERE name ILIKE '%Cebolla%' LIMIT 1;

    -- Validar que existan los productos
    IF tomate_id IS NULL OR cebolla_id IS NULL THEN
        RAISE NOTICE 'No se encontraron productos para la prueba B2C';
    ELSE
        -- Crear cabecera de pedido B2C (Para MAÑANA)
        INSERT INTO orders (customer_name, total, status, delivery_date, type, shipping_address)
        VALUES ('Prueba Hogar - Calle 80', 45000, 'approved', (CURRENT_DATE + INTERVAL '1 day'), 'b2c_wompi', 'Calle Falsa 123')
        RETURNING id INTO order_id_b2c;

        -- Insertar ítems Hogar
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES 
        (order_id_b2c, tomate_id, 5, 3000),   -- 5 kg Tomate
        (order_id_b2c, cebolla_id, 2, 2500);  -- 2 kg Cebolla
        
        RAISE NOTICE 'Pedido B2C Creado con ID: %', order_id_b2c;
    END IF;
END $$;


-- 3. INSERTAR PEDIDO INSTITUCIONAL (B2B)
DO $$
DECLARE
    order_id_b2b UUID;
    tomate_id UUID;
    papa_id UUID;
BEGIN
    SELECT id INTO tomate_id FROM products WHERE name ILIKE '%Tomate%' LIMIT 1;
    SELECT id INTO papa_id FROM products WHERE name ILIKE '%Papa%' LIMIT 1;

    IF tomate_id IS NULL OR papa_id IS NULL THEN
        RAISE NOTICE 'No se encontraron productos para la prueba B2B';
    ELSE
        -- Crear cabecera B2B (Para MAÑANA)
        INSERT INTO orders (customer_name, total, status, is_b2b, delivery_date, type, shipping_address)
        VALUES ('Restaurante El Gourmet', 250000, 'pending_approval', true, (CURRENT_DATE + INTERVAL '1 day'), 'b2b_credit', 'Av Siempre Viva 742')
        RETURNING id INTO order_id_b2b;

        -- Insertar ítems B2B (Cantidades mayores)
        INSERT INTO order_items (order_id, product_id, quantity, unit_price)
        VALUES 
        (order_id_b2b, tomate_id, 20, 2400),  -- 20 kg Tomate
        (order_id_b2b, papa_id, 50, 1800);    -- 50 kg Papa
        
        RAISE NOTICE 'Pedido B2B Creado con ID: %', order_id_b2b;
    END IF;
END $$;

-- 4. VERIFICACIÓN:
-- Al ejecutar los bloques anteriores, ahora puedes ir a /ops/compras
-- y darle a "Sincronizar". 
-- El Tomate debería consolidarse en 25 kg (5 del hogar + 20 del restaurante).
-- La Cebolla y la Papa aparecerán como tareas individuales.
