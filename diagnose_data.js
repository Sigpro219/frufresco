const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 1. Load Env
try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { console.error('Error reading .env.local', e); }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function diagnose() {
    console.log('--- DIAGNOSIS START ---');

    // 1. Check Schema (picked_quantity)
    const { data: items, error: itemError } = await supabase.from('order_items').select('id, picked_quantity').limit(1);
    if (itemError) console.error('SCHEMA CHECK: Failed to query picked_quantity:', itemError.message);
    else console.log('SCHEMA CHECK: picked_quantity column exists? YES (Query successful)');

    // 2. Check Orders Status
    const { data: orders, error: orderError } = await supabase.from('orders').select('id, customer_name, status, created_at').limit(10);
    if (orderError) console.error('ORDERS CHECK: Error:', orderError.message);
    else {
        console.log(`ORDERS CHECK: Found ${orders.length} orders.`);
        orders.forEach(o => console.log(` - Order ${o.id.slice(0, 5)}: Status=${o.status}, Customer=${o.customer_name}`));
    }

    // 3. Check Clients
    const { data: profiles, error: profileError } = await supabase.from('profiles').select('id, company_name, role').eq('role', 'b2b_client').limit(10);
    if (profileError) console.error('PROFILES CHECK: Error:', profileError.message);
    else {
        console.log(`PROFILES CHECK: Found ${profiles.length} client profiles.`);
        profiles.forEach(p => console.log(` - Client: ${p.company_name}`));
    }

    // 4. Check Match
    if (orders && orders.length > 0 && profiles && profiles.length > 0) {
        const orderNames = new Set(orders.map(o => o.customer_name));
        const profileNames = new Set(profiles.map(p => p.company_name));
        const intersection = [...orderNames].filter(x => profileNames.has(x));
        console.log(`MATCH CHECK: Found ${intersection.length} matches between Order Customers and Client Profiles.`);
        if (intersection.length === 0) console.warn('WARNING: No matches found! This explains why the dashboard grid is empty.');
    }

    console.log('--- DIAGNOSIS END ---');
}

diagnose();
