const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { count: countDrafts, error: errDrafts } = await supabase.from('order_drafts').select('*', { count: 'exact', head: true });
  console.log("Drafts count:", countDrafts, "Error:", errDrafts);

  const { count: countMail, error: errMail } = await supabase.from('mail').select('*', { count: 'exact', head: true });
  console.log("Mail count:", countMail, "Error:", errMail);
  
  const { count: countRaw, error: errRaw } = await supabase.from('raw_emails').select('*', { count: 'exact', head: true });
  console.log("Raw emails count:", countRaw, "Error:", errRaw);
}

run();
