const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://csqurhdykbalvlnpowcz.supabase.co";
const supabaseServiceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODU5ODU3MiwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function update() {
    console.log('--- Updating Production Settings ---');
    
    const { data: d1, error: e1 } = await supabase
        .from('app_settings')
        .upsert({ key: 'last_core_sync', value: '2026-03-17T13:57:00.000Z' }, { onConflict: 'key' });
        
    if (e1) console.error('Error updating last_core_sync:', e1.message);
    else console.log('✅ last_core_sync updated.');

    const { data: d2, error: e2 } = await supabase
        .from('app_settings')
        .upsert({ key: 'app_name', value: 'FruFresco' }, { onConflict: 'key' });

    if (e2) console.error('Error updating app_name:', e2.message);
    else console.log('✅ app_name updated.');

    // Check results
    const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .in('key', ['last_core_sync', 'app_name']);
    
    console.log('Current Settings:', data);
}

update();
