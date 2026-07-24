const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, base_price, category, sku, is_active')
    .eq('is_active', true)
    .limit(10);
  if (error) {
    console.error("Error fetching products:", error);
    return;
  }
  console.log("Active Products:");
  console.log(JSON.stringify(data, null, 2));
}

checkProducts();
