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
    const { data: nicks, error } = await supabase
        .from('product_nicknames')
        .select('id, customer_id, product_id, nickname, picking_note, preferred_options, products!product_nicknames_product_id_fkey(name), profiles:customer_id(company_name)')
        .or('nickname.ilike.%mora%,nickname.ilike.%fres%');

    if (error) console.error(error);
    else {
        console.log(`Encontrados ${nicks.length} registros en product_nicknames:`);
        nicks.forEach(n => {
            console.log(`- Cliente: "${n.profiles?.company_name}" | Prod: "${n.products?.name}" | Nickname: "${n.nickname}" | PickingNote: "${n.picking_note}" | PrefOpts:`, n.preferred_options);
        });
    }
}

run().catch(console.error);
