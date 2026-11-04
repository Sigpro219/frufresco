const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  const k = parts[0];
  const v = parts.slice(1).join('=');
  if (k && v) env[k.trim()] = v.trim().replace(/^['"]|['"]$/g, '');
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkYesterday() {
  const { data: o3 } = await supabase.from('orders').select('*').eq('delivery_date', '2026-11-03');
  console.log('Orders delivery_date 2026-11-03:', o3 ? o3.length : 0);

  const { data: m3 } = await supabase.from('inventory_movements').select('*').gte('created_at', '2026-11-03T00:00:00Z').lte('created_at', '2026-11-03T23:59:59Z');
  console.log('Movements on 2026-11-03:', m3 ? m3.length : 0);

  const { data: m4 } = await supabase.from('inventory_movements').select('*').gte('created_at', '2026-11-04T00:00:00Z').lte('created_at', '2026-11-04T23:59:59Z');
  console.log('Movements on 2026-11-04:', m4 ? m4.length : 0);

  // Check total sales in the 39 orders of 2026-11-04
  const { data: o4 } = await supabase.from('orders').select('id').eq('delivery_date', '2026-11-04');
  const ids4 = (o4 || []).map(o => o.id);
  const { data: items4 } = await supabase.from('order_items').select('id, quantity').in('order_id', ids4);
  console.log('Total items in 2026-11-04 batch:', items4 ? items4.length : 0);

  // Check total sales in 2026-10-30 batch
  const { data: o30 } = await supabase.from('orders').select('id').eq('delivery_date', '2026-10-30');
  const ids30 = (o30 || []).map(o => o.id);
  const { data: items30 } = await supabase.from('order_items').select('id, quantity').in('order_id', ids30);
  console.log('Total items in 2026-10-30 batch:', items30 ? items30.length : 0);
}

checkYesterday();
