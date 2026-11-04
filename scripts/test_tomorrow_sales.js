const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, profiles:profiles(id, created_at, role, contact_phone, latitude, longitude, company_name, contact_name, nit, email, address, pricing_model_id, parent_id, payment_days, logistics_data, delivery_restrictions), order_items(id, product_id, quantity, unit, nickname, products(id, name, sku, weight_kg, unit_of_measure, accounting_id, category, purchase_sublist, inventory_group, requires_label))')
    .eq('delivery_date', '2026-11-05');
  console.log('Orders found:', data ? data.length : 0, 'Error:', error);
  if (data && data.length > 0) {
    data.forEach(o => {
      console.log(`Order #${o.sequence_id}: status=${o.status}, profile=${o.profiles?.company_name || o.profiles?.contact_name}, items=${o.order_items?.length}`);
    });
  }
}
run();
