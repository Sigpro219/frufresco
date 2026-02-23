-- Mantenimiento: Recalcular la numeración de pedidos existentes
-- 1. Asignar números consecutivos a los pedidos ya creados, ordenados por fecha
WITH sequences AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as new_seq
  FROM orders
)
UPDATE orders
SET sequence_id = sequences.new_seq
FROM sequences
WHERE orders.id = sequences.id;

-- 2. Sincronizar el contador automático para que continúe desde el último número
SELECT setval('orders_sequence_id_seq', (SELECT MAX(sequence_id) FROM orders));
