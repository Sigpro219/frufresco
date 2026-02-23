const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
} catch (e) {
    console.error('Error reading .env.local', e);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
// Need service role key to inspect schema properly if anon doesn't have permissions
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

console.log('Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectOrders() {
    console.log('Inspecting orders table...');
    // Try to select the specific new columns to see if they error out
    const { data, error } = await supabase
        .from('orders')
        .select('id, customer_email, customer_name, customer_phone')
        .limit(1);

    if (error) {
        console.error('Error fetching orders:', error.message);
        if (error.message.includes('Could not find the') || error.code === 'PGRST204') { // PGRST204 is column not found often
            console.error('CONFIRMED: Columns are missing or not in schema cache.');
        }
    } else {
        console.log('SUCCESS: customer_email and other columns queryable.');
    }
}

inspectOrders();
