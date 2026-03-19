
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.tenant1_production') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableExists() {
  const { data, error } = await supabase.from('fleet_tenants').select('id').limit(1);
  if (error) console.log('TABLE DOES NOT EXIST (as expected for children)');
  else console.log('TABLE EXISTS');
}
checkTableExists();
