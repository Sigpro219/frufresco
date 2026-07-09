const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: './.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from('order_drafts').select('*').ilike('email_subject', '%D8536A%');
  console.log("Draft D8536A:", JSON.stringify(data, null, 2));
}

run();
