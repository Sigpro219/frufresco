
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) env[key.trim()] = value.trim();
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function diagnose() {
  console.log('--- DIAGNOSTIC START ---');
  console.log('1. Testing Connection & Basic Select...');
  
  const { data, error } = await supabase.from('products').select('id, name, is_active').limit(5);

  if (error) {
      console.error('❌ CRITICAL ERROR: Fetch Failed.');
      console.error(JSON.stringify(error, null, 2));
  } else {
      console.log(`✅ Connection Successful. Found ${data.length} products.`);
      if (data.length > 0) {
          console.log('Sample Data:', JSON.stringify(data[0], null, 2));
      } else {
          console.warn('⚠️ WARNING: Table is empty or RLS is hiding all rows.');
      }
  }

  console.log('\n2. Testing Insert Policy (Dry Run)...');
  // We won't actually insert, just wanted to see if we could. RLS policies often block this.

  console.log('--- DIAGNOSTIC END ---');
}

diagnose();
