
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkData() {
    console.log('Consultando tabla collaborators...');
    const { data, error, count } = await supabase
        .from('collaborators')
        .select('*', { count: 'exact' });

    if (error) {
        console.error('❌ Error:', error.message);
    } else {
        console.log(`✅ Éxito: Se encontraron ${data.length} registros (Count: ${count}).`);
        console.log('Muestra del primer registro:', data[0]);
    }
}

checkData();
