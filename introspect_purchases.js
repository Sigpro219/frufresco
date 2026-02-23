const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function introspect() {
    console.log('Introspecting table "purchases"...');

    // Try to insert a dummy record with invalid request to force error with column info or select one
    const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .limit(1);

    if (error) {
        console.log('Error selecting purchases:', error.message);
    } else {
        console.log('Purchases sample data:', data);
        if (data.length > 0) {
            console.log('Columns:', Object.keys(data[0]));
        } else {
            console.log('Table is empty, cannot infer columns from data.');
            // Force error
            const { error: err2 } = await supabase.from('purchases').insert({ non_existent_column: 'test' });
            if (err2) console.log('Insert error hints:', err2.message, err2.details, err2.hint);
        }
    }
}

introspect();
