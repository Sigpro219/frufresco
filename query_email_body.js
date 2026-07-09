const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('raw_emails')
    .select('id, subject, body_text, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  if (error) {
    console.error('Error:', error);
    return;
  }

  data.forEach((email, idx) => {
    console.log(`\n================ EMAIL ${idx + 1} ================`);
    console.log('ID:', email.id);
    console.log('Subject:', email.subject);
    console.log('Created At:', email.created_at);
    console.log('Body Text Snippet:', email.body_text ? email.body_text.slice(0, 1000) : 'No body text');
  });
}

main();
