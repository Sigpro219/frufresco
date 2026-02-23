const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local manually
const envFile = fs.readFileSync('.env.local', 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const [key, ...value] = line.split('=');
  if (key && value) env[key.trim()] = value.join('=').trim().replace(/^"(.*)"$/, '$1');
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function inspectProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  if (error) {
    console.error(error);
  } else if (data && data.length > 0) {
    console.log('Profile Columns:', Object.keys(data[0]));
  } else {
    console.log('No profiles found');
  }
}

inspectProfiles();
