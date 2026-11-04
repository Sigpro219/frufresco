const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const envContent = fs.readFileSync('C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  const k = parts[0];
  const v = parts.slice(1).join('=');
  if (k && v) env[k.trim()] = v.trim().replace(/^['"]|['"]$/g, '');
});
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkHierarchy() {
  const { data: o } = await supabase.from('orders').select('id').eq('delivery_date', '2026-11-04');
  const ids = (o || []).map(x => x.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('product_id, quantity, products(name, parent_id, unit_of_measure)')
    .in('order_id', ids.slice(0, 50));
  
  let childrenCount = 0;
  let parentCount = 0;
  (items || []).forEach(it => {
    if (it.products?.parent_id) childrenCount++;
    else parentCount++;
  });
  console.log({ totalItemsSampled: items.length, parentCount, childrenCount });
}
checkHierarchy();
