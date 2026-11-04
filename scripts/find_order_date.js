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

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function findDate() {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name')
    .ilike('company_name', '%BATEA%');

  console.log('Profiles with BATEA:', profiles);

  if (profiles && profiles.length > 0) {
    const { data: orders } = await supabase
      .from('orders')
      .select('id, sequence_id, delivery_date, warehouse_spaces, status, profile_id')
      .eq('profile_id', profiles[0].id)
      .order('created_at', { ascending: false })
      .limit(10);
    console.log('Recent orders for BATEA:', orders);
  }
}

findDate();
