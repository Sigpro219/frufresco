const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function testRun() {
  const { data: rawOrders, error } = await supabase
    .from('orders')
    .select(`
        id, sequence_id, delivery_date, delivery_slot, shipping_address, warehouse_spaces, status, profile_id, type, logistics_data,
        profiles:profile_id(id, created_at, parent_id, company_name, contact_name, address, role, logistics_data),
        order_items(
            id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options,
            products(id, name, sku, accounting_id, unit_of_measure, buying_team, category, weight_kg, parent_id)
        )
    `)
    .eq('delivery_date', '2026-10-24')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true });

  console.log('Orders found for 2026-10-24:', rawOrders.length);
  
  // Now let's import ensureUniversalStagingSpaces or run the logic
  // Let's see what each order has for warehouse_spaces
  rawOrders.forEach(o => {
    console.log(`Order #${o.sequence_id}: spaces =`, o.warehouse_spaces);
  });
}

testRun();
