const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkNulls() {
    console.log('--- CHECK NULLS ---');

    const { count: nullProfiles } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).is('company_name', null);
    console.log('Null Profiles:', nullProfiles);

    const { count: nullOrders } = await supabase.from('orders').select('*', { count: 'exact', head: true }).is('customer_name', null);
    console.log('Null Orders:', nullOrders);

    // Check if we have visible orders with names
    const { data: orders } = await supabase.from('orders').select('customer_name').limit(5);
    console.log('Sample Order Names:', orders.map(o => o.customer_name));
}

checkNulls();
