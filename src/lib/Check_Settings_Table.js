
const { createClient } = require('@supabase/supabase-client');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
    console.log('Checking app_settings table...');
    const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1);

    if (error) {
        console.error('❌ Error or table missing:', error.message);
    } else {
        console.log('✅ Table app_settings exists. Rows found:', data.length);
    }
}

checkTable();
