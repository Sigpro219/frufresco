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
  console.log('🔍 Buscando pedidos recientes...\n');
  
  // Get the most recent orders
  const { data: orders, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  if (!orders || orders.length === 0) {
    console.log('⚠️ No se encontraron pedidos en la base de datos.');
    return;
  }

  console.log(`✅ Encontrados ${orders.length} pedidos recientes:\n`);
  
  orders.forEach((order, index) => {
    console.log(`--- Pedido ${index + 1} ---`);
    console.log(`ID: ${order.id}`);
    console.log(`Sequence ID: ${order.sequence_id || 'N/A'}`);
    console.log(`Type: ${order.type || 'N/A'}`);
    console.log(`Status: ${order.status}`);
    console.log(`Origin Source: ${order.origin_source || 'N/A'}`);
    console.log(`Delivery Date: ${order.delivery_date || 'N/A'}`);
    console.log(`Total: $${order.total}`);
    console.log(`Created At: ${order.created_at}`);
    console.log(`Shipping Address: ${order.shipping_address || 'N/A'}`);
    console.log('');
  });
}

checkRecentOrders();
