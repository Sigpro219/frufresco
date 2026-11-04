const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function verify(date) {
  console.log(`\n=== VERIFYING SALES ON ${date} ===`);
  const { data: launchedOrders } = await supabase
    .from('orders')
    .select('id, sequence_id')
    .eq('delivery_date', date)
    .in('status', ['para_compra', 'approved', 'picking', 'shipped', 'delivered']);

  console.log(`Launched orders for ${date}:`, launchedOrders?.map(o => `#${o.sequence_id}`));

  const orderIds = (launchedOrders || []).map(o => o.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_id, quantity, unit, variant_label, selected_options, products(name, unit_of_measure, weight_kg)')
    .in('order_id', orderIds);

  const sampleProducts = ['Banano uraba', 'Mandarina arrayana', 'Cubeta huevos tipo aa x 30 unds.'];
  const matched = (items || []).filter(it => sampleProducts.includes(it.products?.name));

  matched.forEach(it => {
    const isUnit = ['un', 'und', 'unidad', 'bandeja', 'atado', 'paquete'].includes((it.products?.unit_of_measure || '').toLowerCase());
    let note = null;
    if (it.selected_options?._physical_instruction) note = it.selected_options._physical_instruction;
    else if (it.variant_label) note = it.variant_label;

    console.log(`Product: ${it.products?.name}`);
    console.log(`  Base Unit: ${it.products?.unit_of_measure} (isUnit: ${isUnit})`);
    console.log(`  Col H (VENTA KG): ${isUnit ? '-' : it.quantity + ' Kg'}`);
    console.log(`  Col H Micro-badge: ${isUnit ? 'none' : note}`);
    console.log(`  Col I (VENTA UND): ${isUnit ? it.quantity + ' und' : '-'}`);
    console.log(`  Col J (PESO UND): ${isUnit ? (it.quantity * (Number(it.products?.weight_kg) || 1)) + ' Kg' : '-'}`);
  });
}

async function run() {
  await verify('2026-11-04');
  await verify('2026-11-05');
}
run();
