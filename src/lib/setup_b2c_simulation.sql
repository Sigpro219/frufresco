-- Migration to standardize B2C Clients in the profiles table
-- 1. Ensure the 'b2c_client' role exists in the Enum
-- NOTE: If this fails, run only this line: ALTER TYPE user_role ADD VALUE 'b2c_client';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'b2c_client';

-- 2. Ensure columns exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'municipality') THEN
        ALTER TABLE profiles ADD COLUMN municipality TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'department') THEN
        ALTER TABLE profiles ADD COLUMN department TEXT;
    END IF;
END $$;

-- 2. Clean existing B2C clients to avoid duplicates during this simulation
DELETE FROM profiles WHERE role = 'b2c_client';

-- 3. Load 30 simulated B2C clients
INSERT INTO profiles (
    id, 
    contact_name, 
    phone, 
    email, 
    address, 
    city, 
    municipality, 
    department, 
    role, 
    created_at
) VALUES 
(gen_random_uuid(), 'Carlos Rodríguez', '3101234567', 'carlos.rod@email.com', 'Calle 100 #15-30 Apt 402', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '10 days'),
(gen_random_uuid(), 'Ana María Londoño', '3119876543', 'ana.m@email.com', 'Carrera 7 #127-50', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '5 days'),
(gen_random_uuid(), 'Juan Pablo Duarte', '3005554433', 'jp.duarte@email.com', 'Calle 80 #90-12', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '20 days'),
(gen_random_uuid(), 'Martha Cecilia Restrepo', '3203214567', 'mrestrepo@email.com', 'Transversal 23 #97-45', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '2 days'),
(gen_random_uuid(), 'Ricardo Sanabria', '3157778899', 'rsanabria@email.com', 'Calle 134 #58-20', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '15 days'),
(gen_random_uuid(), 'Elena Gómez', '3104561234', 'elena.g@email.com', 'Carrera 15 #85-10', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '8 days'),
(gen_random_uuid(), 'Andrés Salazar', '3126549870', 'andres.sal@email.com', 'Calle 170 #45-12', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '12 days'),
(gen_random_uuid(), 'Sonia Beltrán', '3012345678', 'sbeltran@email.com', 'Carrera 58 #137-45', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '3 days'),
(gen_random_uuid(), 'Fernando Torres', '3145678901', 'ftorres@email.com', 'Calle 45 #13-22', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '18 days'),
(gen_random_uuid(), 'Claudia Patricia Hoyos', '3187654321', 'claudia.hoyos@email.com', 'Carrera 11 #93-50', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '1 day'),
(gen_random_uuid(), 'Jorge Iván Duque', '3109998877', 'jduque@email.com', 'Calle 26 #68-15', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '25 days'),
(gen_random_uuid(), 'Beatriz Elena Cano', '3214567890', 'beatriz.cano@email.com', 'Avenida Pepe Sierra #19-45', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '7 days'),
(gen_random_uuid(), 'Mauricio Giraldo', '3111112233', 'mgiraldo@email.com', 'Calle 147 #12-30', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '14 days'),
(gen_random_uuid(), 'Patricia Angulo', '3166667788', 'p.angulo@email.com', 'Carrera 53 #102-15', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '9 days'),
(gen_random_uuid(), 'Luis Fernando Mejía', '3177778822', 'lf.mejia@email.com', 'Calle 116 #45-30', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '6 days'),
(gen_random_uuid(), 'Sandra Milena Toro', '3102223344', 's.toro@email.com', 'Carrera 23 #124-56', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '11 days'),
(gen_random_uuid(), 'Gustavo Petro Jr', '3001110000', 'gpetro@email.com', 'Calle 10 #5-20', 'Chía', 'Chía', 'Cundinamarca', 'b2c_client', NOW() - interval '4 days'),
(gen_random_uuid(), 'Paola Andrea Rojas', '3123334455', 'projas@email.com', 'Carrera 7 #180-20', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '13 days'),
(gen_random_uuid(), 'Santiago Espitia', '3154445566', 'sespitia@email.com', 'Calle 63 #24-15', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '19 days'),
(gen_random_uuid(), 'Mónica Lucía Vargas', '3185556677', 'mvargas@email.com', 'Carrera 9 #145-20', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '16 days'),
(gen_random_uuid(), 'Felipe Bernal', '3106667788', 'fbernal@email.com', 'Calle 106 #54-12', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '21 days'),
(gen_random_uuid(), 'Isabel Cristina Ortiz', '3117778899', 'iortiz@email.com', 'Carrera 13 #45-10', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '17 days'),
(gen_random_uuid(), 'Oscar Alberto Jaramillo', '3128889900', 'ojaramillo@email.com', 'Calle 53 #21-12', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '22 days'),
(gen_random_uuid(), 'Diana Marcela Peña', '3139990011', 'dpena@email.com', 'Carrera 50 #120-15', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '23 days'),
(gen_random_uuid(), 'Gabriel García', '3140001122', 'ggarcia@email.com', 'Calle 72 #10-15', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '24 days'),
(gen_random_uuid(), 'Natalia Sofía Rincón', '3151112233', 'nrincon@email.com', 'Carrera 15 #118-20', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '26 days'),
(gen_random_uuid(), 'Víctor Hugo Lesmes', '3162223344', 'vlesmes@email.com', 'Calle 127 #25-30', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '27 days'),
(gen_random_uuid(), 'Lucía Fernanda Rico', '3173334455', 'lrico@email.com', 'Carrera 11 #110-45', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '28 days'),
(gen_random_uuid(), 'Alberto Martínez', '3184445566', 'amartinez@email.com', 'Calle 140 #19-20', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '29 days'),
(gen_random_uuid(), 'Carmen Julia Ossa', '3195556677', 'cossa@email.com', 'Carrera 7 #155-30', 'Bogotá', 'Bogotá', 'Cundinamarca', 'b2c_client', NOW() - interval '30 days');

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
