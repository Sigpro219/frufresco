-- Seed de Clientes Institucionales Ricos para pruebas de Búsqueda
-- Nota: Usamos ON CONFLICT DO NOTHING para no duplicar si se corre varias veces

INSERT INTO profiles (id, role, company_name, contact_name, contact_phone, address, nit, is_active)
VALUES 
-- 1. Restaurante Típico
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'client', 'Restaurante El Gran Chef', 'Carlos Martínez (Jefe Cocina)', '310 555 0101', 'Cra 15 # 93 - 60', '900.123.456-1', true),

-- 2. Sector Salud
('b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'client', 'Clínica del Norte - Servicios de Alimentación', 'Dra. Ana Fonseca', '601 255 4400', 'Autopista Norte # 120 - 10', '899.999.001-5', true),

-- 3. Educación / Casino
('c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'client', 'Colegio San Bartolomé (Casino)', 'Pedro Pablo Ramírez', '315 222 3344', 'Calle 170 # 50 - 20', '860.002.111-9', true),

-- 4. Hotelería
('d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a14', 'client', 'Hotel Estelar Bogotá', 'Chef Ejecutivo Juan Roa', '300 987 6543', 'Calle 100 # 14 - 10', '900.555.666-3', true),

-- 5. Cadena de Comida Rápida
('e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a15', 'client', 'Burger King - Zona T', 'Gerente de Turno', '601 611 2233', 'Cra 13 # 82 - 70', '901.200.300-8', true),

-- 6. Cadena Restaurantes
('f5eebc99-9c0b-4ef8-bb6d-6bb9bd380a16', 'client', 'Crepes & Waffles - Centro', 'Luz Marina Torres', '312 456 7890', 'Calle 10 # 5 - 20', '800.150.250-7', true),

-- 7. Catering Industrial
('16eebc99-9c0b-4ef8-bb6d-6bb9bd380a17', 'client', 'Sodexo (Planta Alpina)', 'Supervisora Logística', '320 888 7766', 'Km 3 Vía Sopó', '860.500.600-2', true),

-- 8. Pollo Asado
('27eebc99-9c0b-4ef8-bb6d-6bb9bd380a18', 'client', 'Restaurante La Brasa Roja - Salitre', 'Jorge Velásquez', '601 444 5566', 'Av. La Esperanza # 68 - 90', '890.100.200-4', true),

-- 9. Club Social
('38eebc99-9c0b-4ef8-bb6d-6bb9bd380a19', 'client', 'Club El Nogal', 'Jefe de Economato', '315 666 9988', 'Cra 7 # 78 - 50', '830.050.050-1', true),

-- 10. Panadería
('49eebc99-9c0b-4ef8-bb6d-6bb9bd380a20', 'client', 'Pan Pa'' Ya! - Usaquén', 'Maestro Panadero Luis', '311 333 4455', 'Calle 116 # 18 - 30', '900.333.444-6', true)

ON CONFLICT (id) DO UPDATE 
SET 
  company_name = EXCLUDED.company_name,
  contact_phone = EXCLUDED.contact_phone,
  address = EXCLUDED.address,
  nit = EXCLUDED.nit;
