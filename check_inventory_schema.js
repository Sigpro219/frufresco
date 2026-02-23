
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read .env.local manually since require('dotenv') might not be available or working as expected
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) env[key.trim()] = value.trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkInventory() {
    console.log('--- Checking Inventory Tables ---');
    
    const tables = ['inventory_stocks', 'inventory_movements', 'inventory_random_tasks', 'inventory_task_items', 'warehouses', 'products'];
    
    for (const table of tables) {
        const { data, error } = await supabase
            .from(table)
            .select('*')
            .limit(1);
        
        if (error) {
            console.error(`❌ Error in table ${table}:`, error.message);
        } else {
            console.log(`✅ Table ${table} exists. Columns:`, data.length > 0 ? Object.keys(data[0]) : '(No data to show columns)');
        }
    }
}

checkInventory();
