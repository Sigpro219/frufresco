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

async function checkTypes() {
    console.log('🔍 Checking types for "total" and "subtotal"...');

    // We can't easily check types via simple select, but we can try to insert a float
    // and see if it fails or rounds.
    
    // Attempt insert with float
    const floatVal = 1234.56;
    
    console.log(`Testing insert with total = ${floatVal}`);
    
    const dummyOrder = {
        type: 'b2c_wompi',
        status: 'pending_approval',
        origin_source: 'test_script_float',
        delivery_date: new Date().toISOString().split('T')[0],
        shipping_address: 'Type Check Address',
        customer_name: 'Type Check',
        customer_email: 'test@types.com',
        customer_phone: '1234567890',
        subtotal: floatVal,
        total: floatVal
    };

    const { data, error } = await supabase
        .from('orders')
        .insert(dummyOrder)
        .select()
        .single();

    if (error) {
        console.error('❌ Insert with FLOAT failed:', error.message);
    } else {
        console.log('✅ Insert with FLOAT succeeded:', data.id);
        console.log('Saved values:', `Total: ${data.total}`, `Subtotal: ${data.subtotal}`);
        
        // Clean up
        await supabase.from('orders').delete().eq('id', data.id);
    }
}

checkTypes();
