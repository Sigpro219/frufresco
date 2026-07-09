const { Client } = require('pg');

async function testConn(connStr) {
  console.log(`📡 Testing connection with: ${connStr.replace(/:[^:@]+@/, ':***@')}`);
  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log(`✅ Connected successfully!`);
    const res = await client.query('SELECT NOW()');
    console.log(`Time:`, res.rows[0]);
  } catch (err) {
    console.error(`❌ Connection failed:`, err.message);
  } finally {
    await client.end();
  }
}

async function main() {
  // Try port 6543 first (Transaction pooler)
  await testConn('postgresql://postgres.csqurhdykbalvlnpowcz:postgres@aws-0-sa-east-1.pooler.supabase.com:6543/postgres');
  
  // Try port 5432 next (Session pooler)
  await testConn('postgresql://postgres.csqurhdykbalvlnpowcz:postgres@aws-0-sa-east-1.pooler.supabase.com:5432/postgres');
}

main();
