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

async function findBananoOrSimilar() {
  // Check orders for 2026-11-05
  const { data: o5 } = await supabase.from('orders').select('id, sequence_id').eq('delivery_date', '2026-11-05');
  console.log('Orders on 2026-11-05:', o5);

  const oIds = (o5 || []).map(x => x.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options, products(id, name, unit_of_measure, weight_kg)')
    .in('order_id', oIds);

  console.log('Current items in 2026-11-05 orders:');
  items.forEach(it => {
    console.log(`- Item #${it.id.slice(0,8)} | Prod: ${it.products?.name} | Qty: ${it.quantity} | Unit: ${it.unit} | ProdUom: ${it.products?.unit_of_measure} | Weight: ${it.products?.weight_kg} | Variant: ${it.variant_label}`);
  });

  // Also check if Banano uraba exists in products
  const { data: banano } = await supabase.from('products').select('id, name, unit_of_measure, weight_kg').ilike('name', '%banano%');
  console.log('\nBanano products in DB:', banano);

  const { data: mandarina } = await supabase.from('products').select('id, name, unit_of_measure, weight_kg').ilike('name', '%mandarina%');
  console.log('\nMandarina products in DB:', mandarina);
}

findBananoOrSimilar();
