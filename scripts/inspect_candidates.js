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

async function inspectCandidates() {
  const { data: o4 } = await supabase
    .from('orders')
    .select('id, friendly_id, customer_name, delivery_date, total, status')
    .eq('delivery_date', '2026-11-04')
    .limit(4);

  console.log('4 Candidate orders from 2026-11-04:\n', JSON.stringify(o4, null, 2));
}

inspectCandidates();
