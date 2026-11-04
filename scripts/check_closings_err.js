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

async function checkClosings() {
  const { data, error } = await supabase
    .from('daily_inventory_closings')
    .select('*')
    .limit(5);

  if (error) {
    console.error('Error querying daily_inventory_closings:', error);
  } else {
    console.log('Count:', data?.length);
  }
}

checkClosings();
