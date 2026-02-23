
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

async function checkData() {
  const { data, error } = await supabase.from('products').select('id, name, is_active').limit(5);
  console.log('Sample Products:', data);
  if (data && data.length > 0) {
    const p = data[0];
    const newStatus = !p.is_active;
    console.log(`Attempting to toggle product ${p.id} to ${newStatus}`);
    const { data: updateData, error: updateError } = await supabase
      .from('products')
      .update({ is_active: newStatus })
      .eq('id', p.id)
      .select();
    console.log('Update Result:', { updateData, updateError });
  }
}

checkData();
