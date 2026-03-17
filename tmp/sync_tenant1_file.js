
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Read directly from the file to avoid any copy-paste errors
const envFile = fs.readFileSync(path.resolve(__dirname, '../.env.tenant1_production'), 'utf8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL="([^"]+)"/);
const keyMatch = envFile.match(/SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
  console.error('Could not find URL or Key in env file');
  process.exit(1);
}

const supabaseUrl = urlMatch[1];
const supabaseKey = keyMatch[1];

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncTenant1() {
  console.log('--- SYNCING TENANT 1 (FRUFRESCO) via File Config ---');
  
  const now = new Date().toISOString();
  
  const { data, error: fetchError } = await supabase
    .from('app_settings')
    .select('*')
    .eq('key', 'last_core_sync');
    
  if (fetchError) {
    console.error('Fetch Error:', fetchError);
    return;
  }

  if (data.length === 0) {
    console.log('Record not found. Inserting...');
    const { error: insertError } = await supabase
      .from('app_settings')
      .insert([{ key: 'last_core_sync', value: now }]);
    if (insertError) console.error('Insert Error:', insertError);
    else console.log('Success: Inserted', now);
  } else {
    console.log('Record found. Updating...');
    const { error: updateError } = await supabase
      .from('app_settings')
      .update({ value: now })
      .eq('key', 'last_core_sync');
    if (updateError) console.error('Update Error:', updateError);
    else console.log('Success: Updated to', now);
  }
}

syncTenant1();
