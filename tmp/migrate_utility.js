const { Client } = require('pg');

const connectionString = 'postgresql://postgres:postgres.kuxnixwoacwsotcilhuz@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

async function runMigration() {
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    await client.connect();
    console.log('Connected to database');
    await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS utility_deviation_pct NUMERIC DEFAULT 0;');
    console.log('Migration completed: Added utility_deviation_pct to products');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    await client.end();
  }
}

runMigration();
