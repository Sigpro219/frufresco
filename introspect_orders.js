const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function introspect() {
    console.log('Introspecting table "orders"...');

    // Try to insert a dummy record with a clearly invalid status to see if it lists valid ones in the error
    const { data, error } = await supabase
        .from('orders')
        .insert({ status: 'CHECK_VALID_STATUSES' })
        .select();

    if (error) {
        console.log('Error received (this is expected):');
        console.log(error.message);
        if (error.details) console.log('Details:', error.details);
        if (error.hint) console.log('Hint:', error.hint);
    } else {
        console.log('Surprisingly, it worked! Data:', data);
    }
}

introspect();
