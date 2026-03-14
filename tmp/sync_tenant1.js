
const { createClient } = require('@supabase/supabase-js');

// Tenant 1 (FruFresco) Credentials (Using Service Role for Admin Sync)
const supabaseUrl = 'https://csqurhdykbalvlnpowcz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncTenant1() {
  console.log('--- SYNCING TENANT 1 (FRUFRESCO) ---');
  
  const { data, error } = await supabase
    .from('app_settings')
    .select('*')
    .eq('key', 'last_core_sync');
  
  if (error) {
    console.error('Error fetching settings:', error);
    return;
  }
  
  const now = new Date().toISOString();
  
  if (data.length === 0) {
    console.log('Record last_core_sync not found in Tenant 1. Creating...');
    const { error: insertError } = await supabase
      .from('app_settings')
      .insert([{ key: 'last_core_sync', value: now }]);
    
    if (insertError) console.error('Insert Error:', insertError);
    else console.log('Successfully created in Tenant 1:', now);
  } else {
    console.log('Record exists in Tenant 1. Updating...');
    const { error: updateError } = await supabase
      .from('app_settings')
      .update({ value: now })
      .eq('key', 'last_core_sync');
      
    if (updateError) console.error('Update Error:', updateError);
    else console.log('Successfully updated in Tenant 1 to:', now);
  }
}

syncTenant1();
