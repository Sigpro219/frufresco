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

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
  console.log('--- Detailed Inspection of Nov 4 Data ---');

  // 1. That 1 movement on Nov 4
  const { data: novMovs } = await supabase
    .from('inventory_movements')
    .select('*')
    .gte('created_at', '2026-11-04T00:00:00')
    .lte('created_at', '2026-11-04T23:59:59.999Z');
  console.log('Nov 4 Movement:', novMovs);

  // 2. Orders with delivery_date = 2026-11-04
  const { data: novOrders } = await supabase
    .from('orders')
    .select('id, sequence_id, delivery_date, status, total, profile_id, created_at')
    .eq('delivery_date', '2026-11-04');
  console.log(`orders with delivery_date = 2026-11-04:`, novOrders?.length);
  console.log('Orders:', novOrders);

  if (novOrders && novOrders.length > 0) {
    const orderIds = novOrders.map(o => o.id);
    const { data: items } = await supabase
      .from('order_items')
      .select('id, order_id, product_id, quantity, unit, variant_label')
      .in('order_id', orderIds);
    console.log(`order_items for Nov 4: count = ${items?.length}`);
    const totalQty = items?.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    console.log(`Sum of item quantities = ${totalQty} (matches 271.00 in screenshot?)`);
    console.log('Items sample:', items.slice(0, 10));
  }

  // 3. Are there any other inventory_movements for these products or around Nov 4?
  const { data: allMovsNov } = await supabase
    .from('inventory_movements')
    .select('id, product_id, type, quantity, reference_type, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('Latest 10 inventory_movements in DB:', allMovsNov);
}

inspect().catch(console.error);
