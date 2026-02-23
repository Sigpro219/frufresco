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

async function testWebInsert() {
    console.log('🧪 Testing "web" Origin Order Insert...');

    // Simulate exact payload from checkout page
    const dummyOrder = {
        type: 'b2c_wompi',
        status: 'pending_approval',
        origin_source: 'web', // <--- This is key
        delivery_date: new Date().toISOString().split('T')[0],
        shipping_address: 'Calle Real 123 - Web Sim',
        customer_name: 'Web Sim User',
        customer_email: 'websim@test.com',
        customer_phone: '3001234567',
        subtotal: 50000,
        total: 50000,
        latitude: 4.60971, 
        longitude: -74.08175 
    };

    const { data, error } = await supabase
        .from('orders')
        .insert(dummyOrder)
        .select()
        .single();

    if (error) {
        console.error('❌ Web Insert FAILED:', error.message);
        console.error(error);
    } else {
        console.log('✅ Web Insert SUCCESS:', data.id);
        
        // Clean up
        await supabase.from('orders').delete().eq('id', data.id);
    }
}

testWebInsert();
