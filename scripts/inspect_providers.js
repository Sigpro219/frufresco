const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspect() {
    // Try to fetch only name and tax_id
    const { data, error } = await supabase.from('providers').select('name, tax_id').limit(1);
    if (error) {
        console.error('Select error (name, tax_id):', error.message);
    } else {
        console.log('Success (name, tax_id)');
    }

    // Try to fetch location
    const { data: d2, error: e2 } = await supabase.from('providers').select('location').limit(1);
    if (e2) {
        console.error('Select error (location):', e2.message);
    } else {
        console.log('Success (location)');
    }
}
inspect();
