const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testInsert() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
    const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1];

    if (!url || !key) return;

    const supabase = createClient(url.trim(), key.trim());

    console.log('Attempting insert into orders...');
    const startTime = Date.now();
    
    // Minimal data for a B2C order
    const { data, error } = await supabase.from('orders').insert({
        type: 'b2c_wompi',
        status: 'pending_approval',
        origin_source: 'web',
        customer_name: 'TEST BOT',
        total: 1000
    }).select().single();

    const duration = (Date.now() - startTime) / 1000;
    console.log(`Duration: ${duration}s`);

    if (error) {
        console.error('Error Code:', error.code);
        console.error('Error Message:', error.message);
        console.error('Error Hint:', error.hint);
    } else {
        console.log('Success! Data:', data);
    }
}

testInsert();
