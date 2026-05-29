const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const sql = fs.readFileSync(path.join(__dirname, 'create_weight_discrepancies.sql'), 'utf8');

async function tryConnectAndRun(connectionString) {
    console.log(`📡 Connecting to ${connectionString}...`);
    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log(`🚀 Connected! Executing SQL...`);
        await client.query(sql);
        console.log(`✅ Table and policies created successfully.`);
        await client.end();
        return true;
    } catch (err) {
        console.error(`❌ Failed: ${err.message}`);
        try { await client.end(); } catch (e) {}
        return false;
    }
}

async function runSql() {
    const urls = [
        'postgresql://postgres:postgres@localhost:54322/postgres',
        'postgresql://postgres:postgres@localhost:5432/postgres',
    ];
    for (const url of urls) {
        const success = await tryConnectAndRun(url);
        if (success) {
            console.log("🎉 Migration finished successfully!");
            process.exit(0);
        }
    }
    console.error("❌ All connection attempts failed.");
    process.exit(1);
}

runSql();
