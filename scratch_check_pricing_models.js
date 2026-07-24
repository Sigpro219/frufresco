const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkModels() {
  const { data, error } = await supabase.from('pricing_models').select('id, name');
  if (error) {
    console.error("Error fetching pricing models:", error);
    return;
  }
  console.log("Pricing Models in DB:");
  console.log(JSON.stringify(data, null, 2));
}

checkModels();
