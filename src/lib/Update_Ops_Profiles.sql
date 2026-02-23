-- AJUSTE DE PERFILES PARA OPERACIÓN
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialty TEXT; -- Ej: 'Frutas', 'Verduras', 'Lácteos'

-- Asignar especialidad al usuario admin para pruebas
UPDATE profiles 
SET specialty = 'Frutas' 
WHERE role = 'admin';

-- Mejorar la tabla de tareas para evitar duplicados por día
ALTER TABLE procurement_tasks ADD COLUMN IF NOT EXISTS batch_date DATE DEFAULT CURRENT_DATE;
-- Evitar insertar el mismo producto dos veces para el mismo día de entrega
-- ALTER TABLE procurement_tasks ADD CONSTRAINT unique_product_delivery UNIQUE (product_id, delivery_date); 
-- (Comentado por si se requiere flexibilidad, pero se manejará por código)
