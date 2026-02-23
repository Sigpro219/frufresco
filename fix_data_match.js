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
} catch (e) { }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function fixData() {
    console.log('--- FIXING DATA MATCH ---');

    // 1. Get Top 20 Clients (the ones showing on dashboard)
    const { data: clients } = await supabase.from('profiles').select('id, company_name, delivery_zone_id').eq('role', 'b2b_client').limit(20);

    if (!clients || clients.length === 0) {
        console.error('No clients found!');
        return;
    }

    console.log(`Found ${clients.length} clients.`);

    // 2. Get Products
    const { data: products } = await supabase.from('products').select('id, base_price').limit(5);

    for (const client of clients) {
        console.log(`Creating Order for ${client.company_name}`);

        // Create Order
        const { data: order, error: orderError } = await supabase.from('orders').upsert({
            customer_name: client.company_name,
            status: 'approved',
            total: 50000,
            subtotal: 50000,
            type: 'b2b_credit',
            shipping_address: 'Fix St 123',
            delivery_date: new Date().toISOString()
        }, { onConflict: 'customer_name' }).select().single();

        if (orderError) {
            console.error('Error creating order:', orderError.message);
            continue;
        }

        // Create Items
        // Delete old items for this order to be clean
        await supabase.from('order_items').delete().eq('order_id', order.id);

        for (const prod of products) {
            await supabase.from('order_items').insert({
                order_id: order.id,
                product_id: prod.id,
                quantity: Math.floor(Math.random() * 10) + 1,
                picked_quantity: 0,
                unit_price: prod.base_price
            });
        }
    }
    console.log('--- FIX COMPLETE ---');
}

fixData();
