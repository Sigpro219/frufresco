const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
        const k = trimmed.substring(0, eqIdx).trim();
        const v = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        env[k] = v;
    }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function main() {
    const { data: ord } = await supabase
        .from('orders')
        .select('*')
        .eq('sequence_id', 1003)
        .maybeSingle();

    console.log('Order #1003:', JSON.stringify(ord, null, 2));

    const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', ord.id);

    console.log('\nOrder Items for #1003:', JSON.stringify(items, null, 2));
}

main().catch(console.error);
