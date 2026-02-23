
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function seed() {
    console.log('🌱 Seeding demo data for Compras...');
    
    // 1. Get products
    const { data: products } = await supabase.from('products').select('id, name').limit(10);
    if (!products || products.length < 2) {
        console.error('Not enough products found');
        return;
    }

    const prod1 = products[0];
    const prod2 = products[1];

    // 2. Create Order
    const tomorrow = '2026-02-12';
    console.log(`📅 Target delivery date: ${tomorrow}`);

    const { data: order, error: orderErr } = await supabase
        .from('orders')
        .insert({
            customer_name: 'Restaurante El Demo',
            total: 50000,
            status: 'approved',
            type: 'b2b_credit',
            shipping_address: 'Calle Demo 123',
            delivery_date: tomorrow,
            is_b2b: true
        })
        .select()
        .single();

    if (orderErr) {
        console.error('Error creating order:', orderErr);
        return;
    }

    console.log(`✅ Order created: ${order.id}`);

    // 3. Create Items
    const { error: itemErr } = await supabase
        .from('order_items')
        .insert([
            { order_id: order.id, product_id: prod1.id, quantity: 15, unit_price: 3000 },
            { order_id: order.id, product_id: prod2.id, quantity: 8, unit_price: 5000 }
        ]);

    if (itemErr) {
        console.error('Error creating items:', itemErr);
    } else {
        console.log(`🚀 Items added: 15x ${prod1.name}, 8x ${prod2.name}`);
        console.log('✨ Data ready for consolidation!');
    }
}

seed();
