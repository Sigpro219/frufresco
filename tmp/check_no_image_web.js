
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNoImageOnWeb() {
    const { count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('show_on_web', true)
        .is('image_url', null);

    console.log(`Productos sin imagen que están en la WEB: ${count}`);
}

checkNoImageOnWeb();
