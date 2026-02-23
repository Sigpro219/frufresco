-- ACTUALIZACIÓN DE IMÁGENES (USANDO CARPETA PUBLIC)
-- Esto asegura que las fotos carguen instantáneamente desde el servidor de Next.js

UPDATE products SET image_url = '/aguacate_hass.png' WHERE name ILIKE '%Aguacate%';
UPDATE products SET image_url = '/leche_entera.png' WHERE name ILIKE '%Leche%';
UPDATE products SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Lulo_fruit.jpg' WHERE name ILIKE '%Lulo%';
UPDATE products SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/2/2b/Blackberries_%28Rubus_fruticosus%29.jpg' WHERE name ILIKE '%Mora%';
UPDATE products SET image_url = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Patates.jpg' WHERE name ILIKE '%Papa%';
UPDATE products SET image_url = 'https://images.unsplash.com/photo-1518977676601-b53f82a6b6dc?auto=format&fit=crop&w=800&q=80' WHERE name ILIKE '%Tomate%';
