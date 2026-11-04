const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, sequence_id, status, delivery_date, profiles:profiles(company_name, contact_name)')
    .eq('delivery_date', '2026-11-04')
    .limit(10);
  orders?.forEach(o => {
    console.log(`Order #${o.sequence_id} (${o.id}): client=${o.profiles?.company_name || o.profiles?.contact_name}, status=${o.status}`);
  });
}
run();
