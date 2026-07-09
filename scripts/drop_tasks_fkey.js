const { Client } = require('pg');

async function runSql() {
    const connectionString = 'postgresql://postgres:postgres@db.csqurhdykbalvlnpowcz.supabase.co:5432/postgres';
    
    console.log(`📡 Connecting to DB...`);
    const client = new Client({ connectionString });
    
    try {
        await client.connect();
        const sql = `ALTER TABLE admin_tasks DROP CONSTRAINT IF EXISTS admin_tasks_assigned_to_fkey;`;
        console.log(`🚀 Executing SQL: ${sql}`);
        await client.query(sql);
        console.log(`✅ Foreign key constraint dropped successfully.`);
    } catch (err) {
        console.error(`❌ Error executing SQL:`, err.message);
    } finally {
        await client.end();
    }
}

runSql();
