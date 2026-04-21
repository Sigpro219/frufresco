
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkSettings() {
    console.log('Consultando tabla app_settings...');
    const { data, error } = await supabase.from('app_settings').select('*');
    if (error) {
        console.error('❌ Error:', error.message);
    } else {
        console.log('--- CONTENIDO DE APP_SETTINGS ---');
        console.table(data);
    }
}

checkSettings();
