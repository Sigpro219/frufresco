
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFleet() {
  const { data, error } = await supabase.from('fleet_tenants').select('*');
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
checkFleet();
