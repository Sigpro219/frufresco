const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectSchema() {
  console.log('Inspecting Tables Schema...');
  
  // Try to use rpc to inspect columns if available, or just get a single row
  const { data: oRow, error: oError } = await supabase.from('orders').select('*').limit(1);
  if (oError) {
    console.error('Error fetching order row:', oError);
  } else if (oRow && oRow.length > 0) {
    console.log('\nOrder Columns:', Object.keys(oRow[0]));
  }

  const { data: pRow, error: pError } = await supabase.from('products').select('*').limit(1);
  if (pError) {
    console.error('Error fetching product row:', pError);
  } else if (pRow && pRow.length > 0) {
    console.log('\nProduct Columns:', Object.keys(pRow[0]));
  }
}

inspectSchema();
