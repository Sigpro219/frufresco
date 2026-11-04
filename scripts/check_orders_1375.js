const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim().replace(/^['"]|['"]$/g, '')];
}));
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data: orders, error } = await supabase.from('orders').select('id, sequence_id, status, delivery_date').in('sequence_id', [1375, 1376, 1377, 1378]);
  console.log('Orders 1375-1378:', orders, 'Error:', error);
}
run();
