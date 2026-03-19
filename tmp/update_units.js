
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
    const { data, error } = await supabase.from('app_settings').select('*').eq('key', 'standard_units');
    if (error) {
        console.error('Error:', error);
        return;
    }
    console.log('Current value:', data[0]?.value);
    
    const currentUnits = data[0]?.value || '';
    const unitsList = currentUnits.split(',').map(u => u.trim());
    
    const newUnits = ['Pkt 250g', 'Pkt 500g'];
    let changed = false;
    
    newUnits.forEach(u => {
        if (!unitsList.includes(u)) {
            unitsList.push(u);
            changed = true;
        }
    });
    
    if (changed) {
        const newValue = unitsList.join(',');
        const { error: updateError } = await supabase.from('app_settings').upsert({ key: 'standard_units', value: newValue });
        if (updateError) {
            console.error('Update Error:', updateError);
        } else {
            console.log('Successfully updated to:', newValue);
        }
    } else {
        console.log('No changes needed.');
    }
}

run();
