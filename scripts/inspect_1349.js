const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: order } = await supabase.from('orders').select('id, sequence_id, status, delivery_date, total').eq('sequence_id', 1349).single();
  const { data: items } = await supabase.from('order_items').select('id, product_id, quantity, unit, variant_label').eq('order_id', order.id);
  console.log('Order 1349:', order, 'Items count:', items?.length);
  console.log('Items sample:', items?.slice(0, 5));
}
run();
