
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSync() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('key', 'last_core_sync');
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Current last_core_sync in DB:', data);
  
  if (data.length === 0) {
    console.log('Record not found. Creating it...');
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from('app_settings')
      .insert([{ key: 'last_core_sync', value: now }]);
    
    if (insertError) console.error('Insert Error:', insertError);
    else console.log('Created with value:', now);
  } else {
    console.log('Record exists. Updating to force refresh...');
    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('app_settings')
      .update({ value: now })
      .eq('key', 'last_core_sync');
      
    if (updateError) console.error('Update Error:', updateError);
    else console.log('Updated to:', now);
  }
}

checkSync();
