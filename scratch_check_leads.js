const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkLeads() {
  const { data, error } = await supabase
    .from('leads')
    .select('id, company_name, contact_name, status, notes, created_at');
  
  if (error) {
    console.error("Error fetching leads:", error);
    return;
  }
  
  console.log(`Found ${data.length} total leads:`);
  console.log(JSON.stringify(data, null, 2));
}

checkLeads();
