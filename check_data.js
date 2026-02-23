
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

let SUPABASE_URL, SUPABASE_KEY;

try {
    const envPath = path.resolve(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
    const keyMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
    if (urlMatch) SUPABASE_URL = urlMatch[1].trim();
    if (keyMatch) SUPABASE_KEY = keyMatch[1].trim();
} catch (e) { }

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
    const { count: prodCount } = await supabase.from('products').select('*', { count: 'exact', head: true });
    const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { error: zoneError } = await supabase.from('delivery_zones').select('*').limit(1);

    console.log(`Products: ${prodCount}`);
    console.log(`Profiles: ${profileCount}`);
    console.log(`Zones Table: ${zoneError ? 'Missing' : 'Exists'}`);
}

check();
