
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.resolve(__dirname, '../.env.tenant1_production'), 'utf8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="?([^"\s]+)"?/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="?([^"\s]+)"?/);

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

console.log('URL:', supabaseUrl);
console.log('Key Sample:', supabaseKey.substring(0, 20) + '...');

const supabase = createClient(supabaseUrl, supabaseKey);

async function sync() {
  const now = new Date().toISOString();
  console.log('Upserting last_core_sync to', now);
  const { data, error } = await supabase
    .from('app_settings')
    .upsert({ key: 'last_core_sync', value: now });
    
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success!');
  }
}

sync();
