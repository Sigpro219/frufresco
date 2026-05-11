const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

async function runSql() {
    const connectionString = envConfig.DATABASE_URL || `postgresql://postgres:${envConfig.SUPABASE_DB_PASSWORD}@db.${envConfig.SUPABASE_PROJECT_ID}.supabase.co:5432/postgres`;
    
    console.log(`📡 Connecting to DB...`);
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        const sql = fs.readFileSync(path.join(__dirname, 'add_inherit_price.sql'), 'utf8');
        console.log(`🚀 Executing SQL...`);
        await client.query(sql);
        console.log(`✅ Column inherit_price added successfully.`);
    } catch (err) {
        console.error(`❌ Error executing SQL:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
