-- Script Todo En Uno: Crear Columna + Numerar Existentes

-- 1. Intentar agregar la columna (si no existe)
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS sequence_id SERIAL;

-- 2. Numerar los pedidos existentes ordenados por fecha
WITH sequences AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_seq
  FROM orders
)
UPDATE orders
SET sequence_id = sequences.new_seq
FROM sequences
WHERE orders.id = sequences.id;

-- 3. Sincronizar el contador para el futuro
SELECT setval('orders_sequence_id_seq', (SELECT COALESCE(MAX(sequence_id), 0) + 1 FROM orders));
