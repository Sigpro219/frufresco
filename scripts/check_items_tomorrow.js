const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: orders } = await supabase.from('orders').select('id, sequence_id').eq('delivery_date', '2026-11-05');
  const ids = orders.map(o => o.id);
  const { data: items } = await supabase.from('order_items').select('product_id, quantity, unit, variant_label, products(name, sku, unit_of_measure, weight_kg)').in('order_id', ids);
  console.log('Total items on 2026-11-05:', items ? items.length : 0);
  items.forEach(it => {
    console.log(`- ${it.products?.name} (${it.products?.unit_of_measure}): qty=${it.quantity} ${it.unit} | label=${it.variant_label}`);
  });
}
run();
