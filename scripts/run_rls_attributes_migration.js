const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSql() {
    const connectionString = 'postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres';
    
    console.log(`📡 Connecting to Supabase DB...`);
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260702_rls_attributes.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`🚀 Executing RLS Attributes SQL Migration...`);
        await client.query(sql);
        console.log(`✅ RLS policies applied successfully to product_attributes_master.`);
    } catch (err) {
        console.error(`❌ Error executing migration:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
