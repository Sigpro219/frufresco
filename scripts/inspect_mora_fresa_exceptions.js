const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data: excs, error } = await supabase
        .from('client_exceptions')
        .select('id, profile_id, product_id, nickname, picking_note, preferred_options, products(name), profiles(company_name)')
        .or('nickname.ilike.%mora%,nickname.ilike.%fres%');

    if (error) console.error(error);
    else {
        console.log(`Encontradas ${excs.length} excepciones de Mora/Fresa:`);
        excs.forEach(e => {
            console.log(`- Cliente: "${e.profiles?.company_name}" | Prod: "${e.products?.name}" | Nickname: "${e.nickname}" | PickingNote: "${e.picking_note}" | PrefOpts:`, e.preferred_options);
        });
    }
}

run().catch(console.error);
