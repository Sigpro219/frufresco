
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

async function checkTables() {
  const { data: pData, error: pError } = await supabase.from('products').select('count').limit(1);
  console.log('Products table check:', { hasData: !!pData, error: pError?.message });

  const { data: vData, error: vError } = await supabase.from('product_variants').select('count').limit(1);
  console.log('Product Variants table check:', { hasData: !!vData, error: vError?.message });
}

checkTables();
