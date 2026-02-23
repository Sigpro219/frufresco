-- Migration to separate clients from employees
-- These were previously registered as drivers or other roles but represent business accounts

-- 1. Identify and migrate B2B clients
UPDATE profiles
SET role = 'b2b_client'
WHERE company_name IN (
    'Restaurante El Gran Chef',
    'Hotel Estelar Bogotá',
    'Clínica del Norte - Servicios de Alimentación',
    'Burger King - Zona T',
    'Club El Nogal',
    'Restaurante La Brasa Roja - Salitre',
    'Frubana Test Client',
    'Crepes & Waffles - Centro',
    'Pan Pa'' Ya! - Usaquén',
    'Sodexo (Planta Alpina)'
);

-- Note: 'Colegio San Bartolomé (Casino)' was mentioned. If we want to be safe, we check names.
UPDATE profiles
SET role = 'b2b_client'
WHERE contact_name = 'Pedro Pablo Ramírez' AND company_name = 'Colegio San Bartolomé (Casino)';

-- 2. Delete or Archieve remaining test employees if requested (Manual step or via UI)
-- The user asked to "borrar los que tenemos" in TH. 
-- We will implement a "Limpiar Lista" button in the UI for safety.
