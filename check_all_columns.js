const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [key, ...value] = line.split('=');
    if (key && value) {
        env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkColumns() {
    const tables = ['orders', 'procurement_tasks', 'purchases', 'order_items'];
    for (const table of tables) {
        const { data } = await supabase.from(table).select('*').limit(1).single();
        if (data) {
            console.log(`Columns in ${table}:`, Object.keys(data));
        } else {
            console.log(`No data in ${table} to check columns.`);
        }
    }
}

checkColumns();
