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

async function testQuery(date) {
  console.log(`\n=== Testing Date: ${date} ===`);
  const { data: launchedOrders, error: ordersErr } = await supabase
    .from('orders')
    .select('id')
    .eq('delivery_date', date)
    .in('status', ['para_compra', 'approved', 'picking', 'shipped', 'delivered']);

  if (ordersErr) {
    console.error(ordersErr);
    return;
  }

  const launchedOrderIds = (launchedOrders || []).map(o => o.id);
  console.log(`Found ${launchedOrderIds.length} launched orders for date ${date}`);

  const salesMap = new Map();
  if (launchedOrderIds.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < launchedOrderIds.length; i += batchSize) {
      const batch = launchedOrderIds.slice(i, i + batchSize);
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('product_id, quantity, products(name, unit_of_measure)')
        .in('order_id', batch);

      if (itemsErr) {
        console.error(itemsErr);
        break;
      }

      (items || []).forEach(it => {
        if (!it.product_id) return;
        const prev = salesMap.get(it.products?.name || it.product_id) || 0;
        salesMap.set(it.products?.name || it.product_id, prev + (Number(it.quantity) || 0));
      });
    }
  }

  console.log(`Aggregated sales across ${salesMap.size} distinct SKUs:`);
  const top10 = Array.from(salesMap.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
  console.log(top10);
}

async function run() {
  await testQuery('2026-10-30'); // previously launched
  await testQuery('2026-11-04'); // currently pending_approval
}

run();
