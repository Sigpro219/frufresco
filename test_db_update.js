
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

async function testUpdate() {
  console.log('--- TEST START ---');
  // 1. Fetch a product
  const { data: products, error: fetchError } = await supabase.from('products').select('id, name, is_active').limit(1);
  
  if (fetchError) {
    console.error('Fetch Error:', fetchError);
    return;
  }
  
  if (!products || products.length === 0) {
    console.log('No products found.');
    return;
  }

  const p = products[0];
  const originalStatus = p.is_active;
  const targetStatus = !originalStatus;

  console.log(`Product: ${p.name} (${p.id})`);
  console.log(`Current Status: ${originalStatus}`);
  console.log(`Attempting to set to: ${targetStatus}`);

  // 2. Try update
  const { data: updateData, error: updateError, status, statusText } = await supabase
    .from('products')
    .update({ is_active: targetStatus })
    .eq('id', p.id)
    .select();

  console.log('Update Status:', status, statusText);
  if (updateError) {
    console.error('Update Error:', updateError);
  } else {
    console.log('Update Data Return:', updateData);
    if (updateData && updateData.length > 0) {
      console.log('✅ Success! Data returned from DB.');
    } else {
      console.log('❌ Failure: No data returned. This usually means RLS is blocking the update or the ID is wrong.');
    }
  }

  // 3. Verify
  const { data: verifyData } = await supabase.from('products').select('is_active').eq('id', p.id).single();
  console.log(`Verification Status in DB: ${verifyData?.is_active}`);
  console.log('--- TEST END ---');
}

testUpdate();
