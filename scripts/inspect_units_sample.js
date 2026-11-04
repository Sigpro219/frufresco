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

async function inspectSampleOrderItems() {
  const { data: o } = await supabase
    .from('orders')
    .select('id')
    .eq('delivery_date', '2026-11-05');

  const oIds = (o || []).map(x => x.id);
  const { data: items } = await supabase
    .from('order_items')
    .select(`
      id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options,
      products (id, name, unit_of_measure, weight_kg, web_conversion_factor, parent_id)
    `)
    .in('order_id', oIds);

  console.log(`Found ${items?.length} items in tomorrow's orders.`);
  const sample = items?.map(it => ({
    productName: it.products?.name,
    orderQuantity: it.quantity,
    itemUnit: it.unit,
    productUom: it.products?.unit_of_measure,
    weightKg: it.products?.weight_kg,
    convFactor: it.products?.web_conversion_factor,
    variant: it.variant_label,
    isParent: !it.products?.parent_id
  }));

  console.log('Sample 10 items:\n', JSON.stringify(sample?.slice(0, 10), null, 2));
}

inspectSampleOrderItems();
