const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function count() {
    const { count, error } = await supabase.from('providers').select('*', { count: 'exact', head: true });
    if (error) console.error(error);
    console.log('Total Providers in DB:', count);
}
count();
