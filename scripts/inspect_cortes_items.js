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

async function inspectCortesOrder() {
  const { data: o30 } = await supabase
    .from('orders')
    .select('id, delivery_date')
    .eq('delivery_date', '2026-10-30');

  const ids = (o30 || []).map(x => x.id);
  const { data: items } = await supabase
    .from('order_items')
    .select('*, products(name, unit_of_measure, weight_kg)')
    .in('order_id', ids)
    .in('product_id', [
      'a744edee-13e0-4fbe-a033-c4eea8224e1c', // Banano uraba
      '726ff8f1-13e3-4427-8979-9d9ded523ed2'  // Mandarina arrayana
    ]);

  console.log('Sample items on 2026-10-30 for Banano/Mandarina:');
  items?.forEach(it => {
    console.log({
      prod: it.products?.name,
      quantity: it.quantity,
      unit: it.unit,
      nickname: it.nickname,
      variant_label: it.variant_label,
      selected_options: it.selected_options
    });
  });
}

inspectCortesOrder();
