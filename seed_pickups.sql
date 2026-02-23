-- Create 5 demo tasks for "Recogida" (Pending Pickup)
-- We need valid product IDs. Let's create dummy products first to be safe, or use existing ones if known.
-- To be safe, I'll insert products if they don't exist and get their IDs.

DO $$
DECLARE
    prod_limon UUID;
    prod_carne UUID;
    prod_leche UUID;
    prod_arroz UUID;
    prod_jabon UUID;
BEGIN
    -- 1. Create or Get Products
    INSERT INTO products (name, category, unit_of_measure) VALUES ('Limón Tahití', 'Frutas', 'Kg') ON CONFLICT DO NOTHING;
    SELECT id INTO prod_limon FROM products WHERE name = 'Limón Tahití' LIMIT 1;

    INSERT INTO products (name, category, unit_of_measure) VALUES ('Carne de Res Molida', 'Carnes', 'Kg') ON CONFLICT DO NOTHING;
    SELECT id INTO prod_carne FROM products WHERE name = 'Carne de Res Molida' LIMIT 1;

    INSERT INTO products (name, category, unit_of_measure) VALUES ('Leche Entera 1L', 'Lácteos', 'Unidad') ON CONFLICT DO NOTHING;
    SELECT id INTO prod_leche FROM products WHERE name = 'Leche Entera 1L' LIMIT 1;

    INSERT INTO products (name, category, unit_of_measure) VALUES ('Arroz Blanco Premium', 'Abarrotes', 'Bulto') ON CONFLICT DO NOTHING;
    SELECT id INTO prod_arroz FROM products WHERE name = 'Arroz Blanco Premium' LIMIT 1;
    
    INSERT INTO products (name, category, unit_of_measure) VALUES ('Jabón Líquido', 'Abarrotes', 'Litro') ON CONFLICT DO NOTHING;
    SELECT id INTO prod_jabon FROM products WHERE name = 'Jabón Líquido' LIMIT 1;

    -- 2. Create Purchases (Tasks) in 'pending_pickup' status
    -- Task 1: Limón
    INSERT INTO purchases (product_id, quantity, purchase_unit, status, estimated_pickup_time, pickup_location)
    VALUES (prod_limon, 10, 'Kg', 'pending_pickup', NOW(), 'Pasillo Frutas - Bodega 3');

    -- Task 2: Carne
    INSERT INTO purchases (product_id, quantity, purchase_unit, status, estimated_pickup_time, pickup_location)
    VALUES (prod_carne, 5, 'Kg', 'pending_pickup', NOW(), 'Cuarto Frío Carnes');

    -- Task 3: Leche
    INSERT INTO purchases (product_id, quantity, purchase_unit, status, estimated_pickup_time, pickup_location)
    VALUES (prod_leche, 24, 'Unidad', 'pending_pickup', NOW(), 'Zona Lácteos');

    -- Task 4: Arroz (Partial Example - simulating a task that was partially picked up before? No, let's start fresh pending)
    INSERT INTO purchases (product_id, quantity, purchase_unit, status, estimated_pickup_time, pickup_location)
    VALUES (prod_arroz, 2, 'Bulto', 'pending_pickup', NOW(), 'Estantería 4B');

    -- Task 5: Jabón
    INSERT INTO purchases (product_id, quantity, purchase_unit, status, estimated_pickup_time, pickup_location)
    VALUES (prod_jabon, 5, 'Litro', 'pending_pickup', NOW(), 'Aseo y Limpieza');

END $$;
