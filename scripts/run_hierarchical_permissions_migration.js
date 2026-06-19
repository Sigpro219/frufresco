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
        const sqlPath = path.join(__dirname, '../supabase/migrations/20260619_add_custom_permissions_to_profiles.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log(`🚀 Executing Hierarchical Permissions SQL Migration...`);
        await client.query(sql);
        console.log(`✅ Migration applied successfully.`);
    } catch (err) {
        console.error(`❌ Error executing migration:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
