
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Helper to get env vars from .env.local
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const supabase = createClient(url, key);

async function checkColumns() {
    console.log('--- Checking Profiles Table ---');
    const { data: pData, error: pErr } = await supabase.from('profiles').select('*').limit(1);
    if (pErr) console.error('Profiles Error:', pErr.message);
    else if (pData.length > 0) console.log('Profiles columns:', Object.keys(pData[0]));
    else console.log('Profiles table is empty, cannot infer columns this way.');

    console.log('\n--- Checking Orders Table ---');
    const { data: oData, error: oErr } = await supabase.from('orders').select('*').limit(1);
    if (oErr) console.error('Orders Error:', oErr.message);
    else if (oData.length > 0) console.log('Orders columns:', Object.keys(oData[0]));
    else console.log('Orders table is empty, cannot infer columns this way.');
}

checkColumns();
