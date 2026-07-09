const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
let envConfig = {};
try {
    envConfig = dotenv.parse(fs.readFileSync(envPath));
} catch (e) {
    console.warn('⚠️ Could not parse .env.local, falling back to static config:', e.message);
}

async function run() {
    const connectionString = envConfig.DATABASE_URL || `postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres`;
    console.log(`📡 Connecting to Supabase DB...`);
    const client = new Client({ connectionString });
    try {
        await client.connect();
        const res = await client.query(`
            SELECT proname, prosrc 
            FROM pg_proc 
            WHERE proname = 'handle_inventory_movement';
        `);
        if (res.rows.length > 0) {
            const source = res.rows[0].prosrc;
            const outputPath = path.join(__dirname, '../scratch/handle_inventory_movement_source.sql');
            fs.writeFileSync(outputPath, source, 'utf8');
            console.log(`✅ Function source code written to scratch/handle_inventory_movement_source.sql`);
        } else {
            console.log(`❌ Function handle_inventory_movement not found in database.`);
        }
    } catch (err) {
        console.error(`❌ Error querying function:`, err.message);
    } finally {
        await client.end();
    }
}

run();
