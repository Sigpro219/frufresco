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

async function testOrdersSpaces() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, sequence_id, delivery_date, warehouse_spaces, status, profile_id')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching orders:', error);
  } else {
    console.log('Sample orders warehouse_spaces:');
    orders.forEach(o => {
      console.log(`Order #${o.sequence_id} (Date: ${o.delivery_date}): spaces =`, o.warehouse_spaces, 'type:', typeof o.warehouse_spaces, 'isArray:', Array.isArray(o.warehouse_spaces));
    });
  }
}

testOrdersSpaces();
