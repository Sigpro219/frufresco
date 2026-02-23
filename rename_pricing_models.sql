-- ACTUALIZAR NOMBRES DE MODELOS A NUEVA NOMENCLATURA (A, B, C, D)

UPDATE pricing_models SET name = 'Modelo A1', description = 'Restaurante Grande (Alta Rotación)' WHERE name = 'Restaurante Grande';
UPDATE pricing_models SET name = 'Modelo A2', description = 'Restaurante Pequeño (Estándar)' WHERE name = 'Restaurante Pequeño';

UPDATE pricing_models SET name = 'Modelo B1', description = 'Colegios (Contratos Anuales)' WHERE name = 'Colegio';

UPDATE pricing_models SET name = 'Modelo C1', description = 'Hoteles (Premium / Entrega Nocturna)' WHERE name = 'Hotel';

UPDATE pricing_models SET name = 'Modelo D1', description = 'Ancianatos (Presupuesto Ajustado)' WHERE name = 'Ancianato';
