const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSql() {
    // Explicit connection string based on discoverable db details (password: postgres)
    const connectionString = 'postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres';
    
    console.log(`📡 Connecting to DB...`);
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260630_audit_details_update.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`🚀 Executing Audit Details Update SQL Migration...`);
        await client.query(sql);
        console.log(`✅ Migration applied successfully.`);
    } catch (err) {
        console.error(`❌ Error executing migration:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
