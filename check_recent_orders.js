const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkRecentOrders() {
  console.log('Checking recent orders and items...');
  
  const { data: orders, error: oError } = await supabase
    .from('orders')
    .select('id, sequence_id, admin_notes, total')
    .order('created_at', { ascending: false })
    .limit(2);

  if (oError) {
    console.error('Error fetching orders:', oError);
    return;
  }

  for (const o of orders) {
    console.log(`\nOrder ID: ${o.id} (Seq: ${o.sequence_id})`);
    console.log(`Admin Notes: ${o.admin_notes}`);
    
    const { data: items, error: iError } = await supabase
      .from('order_items')
      .select('quantity, product:products(name, unit_of_measure)')
      .eq('order_id', o.id);

    if (iError) {
      console.error('Error fetching items:', iError);
    } else {
      items.forEach(item => {
        console.log(`- ${item.quantity} ${item.product.unit_of_measure} of ${item.product.name}`);
      });
    }
  }
}

checkRecentOrders();
