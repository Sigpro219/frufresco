const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testInsertReal() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
    const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1];

    if (!url || !key) return;

    const supabase = createClient(url.trim(), key.trim());

    console.log('Attempting REAL insert into orders...');
    const startTime = Date.now();
    
    const { data, error } = await supabase.from('orders').insert({
        type: 'b2c_wompi',
        status: 'pending_approval',
        origin_source: 'web',
        delivery_date: new Date().toISOString().split('T')[0],
        shipping_address: 'Calle Falsa 123 - TEST',
        customer_name: 'TEST BOT REAL',
        customer_email: 'test@example.com',
        customer_phone: '1234567890',
        subtotal: 50000,
        total: 50000,
        latitude: 4.6097,
        longitude: -74.0817
    }).select().single();

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Duration: ${duration}s`);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success! Order ID:', data.id);
    }
}

testInsertReal();
