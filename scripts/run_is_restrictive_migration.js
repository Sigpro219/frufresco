const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSql() {
    const connectionString = 'postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres';
    
    console.log(`📡 Connecting to DB...`);
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20260623_add_is_restrictive_to_pricing_models.sql'), 'utf8');
        console.log(`🚀 Executing SQL...`);
        await client.query(sql);
        console.log(`✅ Column is_restrictive added successfully to pricing_models.`);
    } catch (err) {
        console.error(`❌ Error executing SQL:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
