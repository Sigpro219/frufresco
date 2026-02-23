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

async function checkWeights() {
  console.log('Checking order weights...');
  
  // 1. Check a few products
  const { data: products, error: pError } = await supabase
    .from('products')
    .select('id, name, weight_kg')
    .limit(10);
    
  if (pError) {
    console.error('Error fetching products:', pError);
  } else {
    console.log('Sample Products:');
    products.forEach(p => console.log(`- ${p.name}: ${p.weight_kg}kg`));
  }

  // 2. Check a few orders
  const { data: orders, error: oError } = await supabase
    .from('orders')
    .select('id, sequence_id, total_weight_kg')
    .order('created_at', { ascending: false })
    .limit(5);

  if (oError) {
    console.error('Error fetching orders:', oError);
  } else {
    console.log('\nSample Orders:');
    orders.forEach(o => console.log(`- Order #${o.sequence_id}: ${o.total_weight_kg}kg`));
  }

  // 3. Check order items for one of those orders
  if (orders && orders.length > 0) {
    const orderId = orders[0].id;
    const { data: items, error: iError } = await supabase
      .from('order_items')
      .select('quantity, product:products(name, weight_kg)')
      .eq('order_id', orderId);

    if (iError) {
      console.error('Error fetching order items:', iError);
    } else {
      console.log(`\nItems for Order #${orders[0].sequence_id}:`);
      items.forEach(item => {
        console.log(`- ${item.quantity} x ${item.product.name} (Unit weight: ${item.product.weight_kg}kg)`);
      });
      const calculated = items.reduce((acc, item) => acc + (item.quantity * (item.product.weight_kg || 0)), 0);
      console.log(`Calculated Total Weight: ${calculated}kg`);
    }
  }
}

checkWeights();
