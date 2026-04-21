const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkOperationsTables() {
    const tables = [
        'procurement_tasks', 
        'purchases', 
        'providers', 
        'order_items',
        'commercial_overrides'
    ];
    console.log('--- Checking Operations Ecosystem ---');
    
    for (const table of tables) {
        const { error } = await supabase.from(table).select('*').limit(1);
        if (error) {
            console.log(`❌ [${table}]: ${error.message}`);
        } else {
            console.log(`✅ [${table}]: OK`);
        }
    }
}

checkOperationsTables();
