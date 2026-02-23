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

async function inspectProductsDetailed() {
  console.log('Inspecting Products Detailed Data...');
  
  const { data: products, error } = await supabase
    .from('products')
    .select('name, unit_of_measure, weight_kg')
    .limit(10);

  if (error) {
    console.error('Error fetching products:', error);
  } else {
    products.forEach(p => {
      console.log(`- ${p.name}: Unit=${p.unit_of_measure}, Weight=${p.weight_kg}kg`);
    });
  }
}

inspectProductsDetailed();
