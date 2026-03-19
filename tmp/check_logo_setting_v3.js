
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('app_settings').select('key, value, updated_at').eq('key', 'app_logo_url');
  if (error) fs.writeFileSync('tmp/check_output.txt', JSON.stringify(error));
  else fs.writeFileSync('tmp/check_output.txt', JSON.stringify(data, null, 2));
}
check();
