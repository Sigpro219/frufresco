-- Agregar la columna para la capacidad de canastillas
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS max_crates_capacity INTEGER DEFAULT 0;
la primer imagen es como se ve el header del cliente
la segunda es la versión nuestra, me gustaría que luciera más como la del cliente, revisa el comportamiento del logo