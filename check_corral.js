const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, company_name, contact_name, email, phone')
    .ilike('company_name', '%corral%');
  
  if (error) {
    console.error(error);
  } else {
    console.log(data);
  }
}

check();
