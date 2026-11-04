const dotenv = require('dotenv');
const { createClient } = require('@supabase/supabase-js');
dotenv.config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, sequence_id, warehouse_spaces, profiles(company_name), total_weight_kg, order_items(quantity, products(weight_kg))')
    .eq('delivery_date', '2026-10-30')
    .neq('status', 'cancelled');

  const mismatches = [];
  orders.forEach(o => {
    let weight = Number(o.total_weight_kg) || 0;
    if (weight === 0 && o.order_items) {
      weight = o.order_items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.products?.weight_kg) || 1), 0);
    }
    const crates = Math.max(1, Math.ceil(weight / 12.5));
    const needed = Math.max(1, Math.ceil(crates / 36));
    const assigned = o.warehouse_spaces || [];
    if (assigned.length !== needed) {
      mismatches.push({
        id: o.id,
        seq: o.sequence_id,
        name: o.profiles?.company_name,
        weight: weight.toFixed(1),
        crates,
        needed,
        assigned
      });
    }
  });

  console.log('Total orders:', orders.length);
  console.log('Mismatches count:', mismatches.length);
  console.log('Mismatches list:', mismatches);
}
check();
