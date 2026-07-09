const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runSql() {
    const connectionString = 'postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres';
    
    console.log(`📡 Connecting to Supabase direct DB...`);
    const client = new Client({
        connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });
    
    try {
        await client.connect();
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260709_add_iva_columns_to_order_items.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`🚀 Executing SQL Migration to add IVA columns to order_items...`);
        const res = await client.query(sql);
        console.log(`Result:`, res[res.length - 1]?.rows || res.rows);
        console.log(`✅ IVA columns added successfully to order_items table.`);
    } catch (err) {
        console.error(`❌ Error executing migration:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
