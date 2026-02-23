
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkRLS() {
  const { data, error } = await supabase.rpc('check_rls_status', { table_name: 'products' });
  if (error) {
    // try a different way if RPC doesn't exist
    const { data: policies, error: pError } = await supabase.from('pg_policies').select('*').eq('tablename', 'products');
    console.log('Polices from pg_policies:', policies || pError?.message);
  } else {
    console.log('RLS Status:', data);
  }
}

checkRLS();
