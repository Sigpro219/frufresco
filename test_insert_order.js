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

async function testHighPrecision() {
    console.log('🧪 Testing HIGH PRECISION Order Insert...');

    // Simulate browser coords
    const longLat = 4.609710982348574;
    const longLng = -74.08175234918237;

    console.log(`Sending: Lat ${longLat}, Lng ${longLng}`);

    const dummyOrder = {
        type: 'b2c_wompi',
        status: 'pending_approval',
        origin_source: 'test_script_precision',
        delivery_date: new Date().toISOString().split('T')[0],
        shipping_address: 'Calle Falsa 123 - Test Script Precision',
        customer_name: 'Test Script Precision',
        customer_email: 'test@script.com',
        customer_phone: '1234567890',
        subtotal: 1000,
        total: 1000,
        latitude: longLat, 
        longitude: longLng 
    };

    const { data, error } = await supabase
        .from('orders')
        .insert(dummyOrder)
        .select()
        .single();

    if (error) {
        console.error('❌ Insert FAILED:', error.message);
        console.error('Details:', error.details);
        console.error('Hint:', error.hint);
    } else {
        console.log('✅ Insert SUCCESS:', data.id);
        console.log('Saved Coords:', data.latitude, data.longitude);
        
        // Clean up
        await supabase.from('orders').delete().eq('id', data.id);
    }
}

testHighPrecision();
