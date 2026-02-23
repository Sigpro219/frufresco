const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

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

async function checkOrderData() {
  const orderId = '7c4e98d9-a852-4b8f-97af-7d5bfd8e4a0d';
  console.log(`Checking items for order ${orderId}...`);
  
  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*, product:products(name)')
    .eq('order_id', orderId);

  if (itemsError) {
    console.error('Error items:', itemsError);
  } else {
    console.log('Items found:', items.length);
    console.log(JSON.stringify(items, null, 2));
  }
}

checkOrderData();
