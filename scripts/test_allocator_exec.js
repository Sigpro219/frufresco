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

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function testAllocatorExecution() {
  const { data: rawOrders } = await supabase
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
    .in('status', ['pending_approval', 'pending', 'recibido', 'para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'])
    .order('created_at', { ascending: true });

  // Let's dynamically import or run ensureUniversalStagingSpaces
  // Since it's TypeScript, let's write a small TS-compatible runner or inspect
  console.log('Orders loaded:', rawOrders.length);
  
  // Let's check why orders 1249-1258 didn't have spaces:
  const emptySpaces = rawOrders.filter(o => !o.warehouse_spaces || o.warehouse_spaces.length === 0);
  console.log('Empty spaces count before:', emptySpaces.length);
}

testAllocatorExecution();
