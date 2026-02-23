-- 1. Agregar columnas de estado y calidad a 'purchases'
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_pickup'; -- pending_pickup, partial_pickup, picked_up, rejected
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS picked_up_quantity NUMERIC DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quality_status TEXT; -- green, yellow, red
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quality_notes TEXT;

-- 2. Tabla de Secciones de Corabastos
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT
);
-- Semilla de Secciones
INSERT INTO sections (name) VALUES ('Frutas'), ('Verduras'), ('Lácteos'), ('Abarrotes'), ('Carnes') ON CONFLICT DO NOTHING;

-- 3. Tabla de Colaboradores (Recogedores)
CREATE TABLE IF NOT EXISTS collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT DEFAULT 'picker',
  status TEXT DEFAULT 'available', -- available, busy
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Asignaciones Colaborador -> Sección
CREATE TABLE IF NOT EXISTS collaborator_sections (
  collaborator_id UUID REFERENCES collaborators(id),
  section_id UUID REFERENCES sections(id),
  PRIMARY KEY (collaborator_id, section_id)
);
