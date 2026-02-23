
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
    console.log('--- Columns in products ---');
    const { data: p } = await supabase.from('products').select('*').limit(1);
    if (p && p.length > 0) console.log(Object.keys(p[0]));

    console.log('--- Columns in order_items ---');
    const { data: oi } = await supabase.from('order_items').select('*').limit(1);
    if (oi && oi.length > 0) console.log(Object.keys(oi[0]));
}

check();
