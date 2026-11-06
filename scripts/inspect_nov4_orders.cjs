const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = (match[2] || '').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function inspectOrders() {
  const { data: launchedOrders } = await supabase
    .from('orders')
    .select('id, sequence_id, status, delivery_date, profile_id, total, created_at, profiles:profile_id(company_name, contact_name)')
    .eq('delivery_date', '2026-11-04')
    .in('status', ['para_compra', 'approved', 'picking', 'shipped', 'delivered']);

  console.log('Launched Orders for 2026-11-04:', JSON.stringify(launchedOrders, null, 2));

  if (launchedOrders && launchedOrders.length > 0) {
    const ids = launchedOrders.map(o => o.id);
    const { data: items } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit, products:product_id(name)')
      .in('order_id', ids);

    console.log(`Total items in these launched orders: ${items?.length}`);
    const sumKg = items?.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    console.log(`Total sum quantity: ${sumKg}`);
    items?.forEach(it => {
      console.log(`  - ${it.products?.name}: ${it.quantity} ${it.unit}`);
    });
  }
}

inspectOrders().catch(console.error);
