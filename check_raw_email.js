const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('raw_emails')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (error) {
    console.error(error);
  } else {
    console.log("Subject:", data[0]?.payload?.headers?.subject);
    console.log("Body:", data[0]?.payload?.plain);
  }
}

check();
