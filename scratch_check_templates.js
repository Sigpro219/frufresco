const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkTemplates() {
  const { data, error } = await supabase.from('quote_templates').select('*');
  if (error) {
    console.error("Error fetching templates:", error);
    return;
  }
  console.log(`Found ${data.length} templates:`);
  console.log(JSON.stringify(data, null, 2));
}

checkTemplates();
