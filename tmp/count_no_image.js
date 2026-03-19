
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function countNoImage() {
    const { data, count, error } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .is('image_url', null);
    
    const { data: data2, count: count2 } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('image_url', '');

    console.log(`Total con image_url null: ${count}`);
    console.log(`Total con image_url vacio: ${count2}`);
}

countNoImage();
