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

async function checkStatus() {
  const { data: o4 } = await supabase.from('orders').select('id, delivery_date, status').eq('delivery_date', '2026-11-04');
  const status4 = {};
  (o4 || []).forEach(o => status4[o.status] = (status4[o.status] || 0) + 1);
  console.log('Orders on 2026-11-04 (today):', status4);

  const { data: o5 } = await supabase.from('orders').select('id, delivery_date, status').eq('delivery_date', '2026-11-05');
  const status5 = {};
  (o5 || []).forEach(o => status5[o.status] = (status5[o.status] || 0) + 1);
  console.log('Orders on 2026-11-05 (tomorrow):', status5);
}

checkStatus();
