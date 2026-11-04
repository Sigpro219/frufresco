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

async function inspectSchema() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('delivery_date', '2026-11-04')
    .limit(1);

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample order keys:', Object.keys(data[0] || {}));
    console.log('Order id:', data[0]?.id, 'status:', data[0]?.status, 'friendly_id:', data[0]?.friendly_id);
  }
}

inspectSchema();
