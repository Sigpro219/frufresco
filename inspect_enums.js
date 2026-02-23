
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL, SUPABASE_KEY;
try {
    const envPath = path.resolve(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if (keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} catch (e) { }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkEnum() {
    console.log('Testing Enum Values for orders.type...');

    // Candidates to try
    // Check existing
    const { data: existing, error } = await supabase.from('orders').select('type').limit(10);
    if (error) console.error(error);
    else console.log('Existing types found in DB:', existing);

    // If empty, try 'standard' or 'normal'
    const tryFinal = ['standard', 'normal', 'default'];
    for (const val of tryFinal) {
        process.stdout.write(`Trying "${val}"... `);
        const { error } = await supabase.from('orders').insert({
            customer_name: 'Enum Test',
            status: 'pending_approval',
            total: 100,
            subtotal: 100,
            type: val
        });
        if (!error) {
            console.log('✅ VALID!');
            await supabase.from('orders').delete().eq('customer_name', 'Enum Test');
            break;
        } else {
            console.log('❌');
        }
    }
}

checkEnum();
