const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: orders } = await supabase.from('orders').select('id, sequence_id, status, delivery_date').eq('delivery_date', '2026-11-04');
  console.log('Total orders for 2026-11-04:', orders ? orders.length : 0);
  const byStatus = {};
  if (orders) orders.forEach(o => byStatus[o.status] = (byStatus[o.status]||0)+1);
  console.log('By status:', byStatus);
  if (orders && orders.length > 0) {
    console.log('First 5 orders:', orders.slice(0, 5));
  }
}
run();
