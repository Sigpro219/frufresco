
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function checkTable(table) {
    const start = Date.now();
    const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true }); // Head-only request for speed checking permissions

    const duration = Date.now() - start;

    if (error) {
        console.log(`❌ ${table}: ERROR - ${error.message} (${error.code}) [${duration}ms]`);
    } else {
        console.log(`✅ ${table}: OK - Count: ${count} [${duration}ms]`);
    }
}

async function run() {
    console.log("🔍 Verifying Anonymous Access to Tables...");
    const tables = [
        'products',
        'profiles',
        'orders',
        'order_items',
        'inventory_stocks',
        'inventory_movements',
        'providers',
        'product_conversions',
        'app_settings',
        'delivery_zones'
    ];

    for (const t of tables) {
        await checkTable(t);
    }
}

run();
