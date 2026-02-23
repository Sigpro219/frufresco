
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function check() {
    const { data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
        console.error(error);
    } else if (data && data.length > 0) {
        console.log(JSON.stringify(Object.keys(data[0])));
    } else {
        console.log('Empty orders table');
    }
}

check();
