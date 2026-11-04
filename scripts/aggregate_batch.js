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

async function aggregateBatch(date) {
  const { data: orders } = await supabase.from('orders').select('id, status').eq('delivery_date', date);
  const ids = (orders || []).map(o => o.id);
  if (!ids.length) {
    console.log(`No orders for date ${date}`);
    return;
  }
  const { data: items } = await supabase
    .from('order_items')
    .select('product_id, quantity, products(name, unit_of_measure)')
    .in('order_id', ids);

  const totals = {};
  (items || []).forEach(it => {
    const pName = it.products?.name || 'Unknown';
    totals[pName] = (totals[pName] || 0) + Number(it.quantity || 0);
  });

  console.log(`Aggregated sales for ${date} (${ids.length} orders, ${items.length} items):`);
  const top15 = Object.entries(totals).sort((a,b) => b[1] - a[1]).slice(0, 15);
  console.log(top15);
}

async function run() {
  await aggregateBatch('2026-11-04');
  await aggregateBatch('2026-10-30');
}
run();
