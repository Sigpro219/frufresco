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

async function checkOrders() {
    console.log('--- Orders Pending Approval ---');
    const { data, error } = await supabase
        .from('orders')
        .select('id, status, customer_name, delivery_date')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching orders:', error);
    } else {
        console.log(`Found ${data.length} orders pending approval.`);
        data.forEach(o => console.log(`ID: ${o.id}, Status: ${o.status}, Name: ${o.customer_name}, Date: ${o.delivery_date}`));
    }

    const { data: paraCompra } = await supabase
        .from('orders')
        .select('id')
        .eq('status', 'para_compra');
    console.log(`Current orders in 'para_compra': ${paraCompra?.length || 0}`);
}

checkOrders();
