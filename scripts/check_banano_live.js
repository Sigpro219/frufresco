const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function checkBananoRow(date) {
  // Fetch orders
  const { data: launchedOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('delivery_date', date)
    .in('status', ['para_compra', 'approved', 'picking', 'shipped', 'delivered']);

  const orderIds = (launchedOrders || []).map(o => o.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_id, quantity, unit, variant_label, selected_options')
    .in('order_id', orderIds);

  const bananoId = 'a744edee-13e0-4fbe-a033-c4eea8224e1c';
  const bananoItems = (items || []).filter(it => it.product_id === bananoId);

  console.log(`\nDate: ${date} - Total Banano Items found in launched orders:`, bananoItems.length);
  bananoItems.forEach(it => {
    console.log(`- Qty: ${it.quantity} ${it.unit} | variant_label: ${it.variant_label} | options:`, it.selected_options);
  });
}

async function run() {
  await checkBananoRow('2026-11-04');
  await checkBananoRow('2026-11-05');
}
run();
