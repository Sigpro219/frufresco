const { Client } = require('pg');
const connectionString = 'postgresql://postgres.csqurhdykbalvlnpowcz:postgres@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

async function test() {
    const client = new Client({
        connectionString,
        ssl: {
            rejectUnauthorized: false
        }
    });
    try {
        await client.connect();
        console.log('✅ Connected to connection pooler!');
        const res = await client.query("SELECT 'Success' as status");
        console.log('Result:', res.rows);
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
    } finally {
        await client.end();
    }
}
test();
