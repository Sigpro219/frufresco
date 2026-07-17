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

async function runSql() {
    const connectionString = process.env.DATABASE_URL || envConfig.DATABASE_URL || 'postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres';
    
    console.log(`📡 Connecting to Supabase DB...`);
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260709_create_quotes_and_templates.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`🚀 Executing SQL Migration to create quotes, quote_items, and templates...`);
        await client.query(sql);
        console.log(`✅ CRM Quotes and Templates tables created successfully with appropriate RLS policies.`);
    } catch (err) {
        console.error(`❌ Error executing migration:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
