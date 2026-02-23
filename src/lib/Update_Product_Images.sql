-- ACTUALIZACIÓN DE IMÁGENES (VERSIÓN URL PÚBLICA)
-- Copia y pega esto en el SQL Editor de Supabase

-- Aguacate Hass
UPDATE products 
SET image_url = 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=800&q=80' 
WHERE name ILIKE '%Aguacate%';

-- Leche Entera (Asumiendo que existe o se agregará)
UPDATE products 
SET image_url = 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=800&q=80' 
WHERE name ILIKE '%Leche%';

-- Lulo
UPDATE products 
SET image_url = 'https://images.wikimedia.org/wikipedia/commons/a/ac/Lulo_fruit.jpg' 
WHERE name ILIKE '%Lulo%';

-- Mora
UPDATE products 
SET image_url = 'https://images.wikimedia.org/wikipedia/commons/2/2b/Blackberries_%28Rubus_fruticosus%29.jpg' 
WHERE name ILIKE '%Mora%';

-- Papa Pastusa
UPDATE products 
SET image_url = 'https://images.wikimedia.org/wikipedia/commons/a/ab/Patates.jpg' 
WHERE name ILIKE '%Papa%';
