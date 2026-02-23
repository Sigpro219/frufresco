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

async function verifySpecific() {
    console.log('--- VERIFY SPECIFIC ---');

    // 1. Find a Despensa product
    const { data: prods } = await supabase.from('products').select('id, name').eq('category', 'Despensa').limit(1);
    const prod = prods[0];
    console.log(`Checking Product: ${prod?.name} (${prod?.id})`);

    // 2. Find a visible client (e.g. Restaurante 1 which is usually North/First)
    const { data: client } = await supabase.from('profiles').select('id, company_name').like('company_name', '%1%').limit(1);
    const cli = client[0];
    console.log(`Checking Client: ${cli?.company_name}`);

    // 3. Find Order
    const { data: order } = await supabase.from('orders').select('id, customer_name').eq('customer_name', cli?.company_name).single();
    if (!order) {
        console.log('No order found for client!');
        return;
    }
    console.log(`Order Found: ${order.id}`);

    // 4. Find All Items
    const { data: items } = await supabase.from('order_items').select('*, products(name, category)').eq('order_id', order.id);

    if (items) {
        console.log(`Total Items: ${items.length}`);
        const cats = items.map(i => i.products?.category);
        const counts = cats.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {});
        console.log('Category Distribution:', counts);
    }
}

verifySpecific();
