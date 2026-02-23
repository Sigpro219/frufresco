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

async function deepDive() {
    console.log('--- DEEP DIVE ---');

    // 1. Get Product ID for "Arroz Premium" (Despensa)
    const { data: prods } = await supabase.from('products').select('*').ilike('name', '%Arroz Premium%');
    console.log('Products found (Arroz Premium):', prods.length);
    prods.forEach(p => console.log(`Prod: ${p.name} [${p.id}] Cat: ${p.category}`));
    const targetProd = prods[0];

    // 2. Get Order for "Restaurante 1" (part of "Restaurante 1...")
    const { data: clients } = await supabase.from('profiles').select('id, company_name').ilike('company_name', '%Restaurante 1%').limit(1);
    const client = clients[0];
    console.log(`Client: ${client?.company_name}`);

    const { data: order } = await supabase.from('orders').select('id, customer_name').eq('customer_name', client.company_name).single();
    console.log(`Order: ${order?.id}`);

    // 3. Check Exact Item
    const { data: item } = await supabase.from('order_items')
        .select('*')
        .eq('order_id', order.id)
        .eq('product_id', targetProd.id);

    console.log(`Item in DB?`, item);
}

deepDive();
