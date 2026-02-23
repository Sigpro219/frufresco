const { Client } = require('pg');

const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres',
});

const sql = `
-- purchases updates
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending_pickup';
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS picked_up_quantity NUMERIC DEFAULT 0;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quality_status TEXT;
ALTER TABLE purchases ADD COLUMN IF NOT EXISTS quality_notes TEXT;

-- sections
CREATE TABLE IF NOT EXISTS sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT
);
INSERT INTO sections (name) VALUES ('Frutas'), ('Verduras'), ('Lácteos'), ('Abarrotes'), ('Carnes') ON CONFLICT DO NOTHING;

-- collaborators
CREATE TABLE IF NOT EXISTS collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role TEXT DEFAULT 'picker',
  status TEXT DEFAULT 'available',
  last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- collaborator_sections (assignments)
CREATE TABLE IF NOT EXISTS collaborator_sections (
  collaborator_id UUID REFERENCES collaborators(id),
  section_id UUID REFERENCES sections(id),
  PRIMARY KEY (collaborator_id, section_id)
);
`;

async function run() {
    try {
        await client.connect();
        console.log('Connected to DB');
        await client.query(sql);
        console.log('Migration successful');
    } catch (e) {
        // Try port 5432 just in case
        console.log('Retrying on port 5432...');
        const client2 = new Client({
            connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
        });
        try {
            await client2.connect();
            await client2.query(sql);
            console.log('Migration successful on port 5432');
        } catch (e2) {
            console.error('Migration failed:', e);
        } finally {
            await client2.end().catch(() => { });
        }
    } finally {
        await client.end().catch(() => { });
    }
}

run();
