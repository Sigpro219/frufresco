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

async function inspectItems() {
  const { data: o } = await supabase.from('orders').select('id').eq('delivery_date', '2026-11-04').limit(1);
  const { data: items } = await supabase.from('order_items').select('*').eq('order_id', o[0].id).limit(1);
  console.log('Sample item keys:', Object.keys(items[0] || {}));
}

inspectItems();
