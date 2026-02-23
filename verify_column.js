const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://kuxnixwoacwsotcilhuz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo');

async function checkColumns() {
    const { data, error } = await supabase
        .from('product_variants')
        .select('*')
        .limit(1);
    
    if (error) {
        console.log('Error:', error);
    } else {
        console.log('Columns found:', data.length > 0 ? Object.keys(data[0]) : 'Table is empty, cannot infer columns from select *');
    }

    // Try to describe the table via RPC if possible, or just try to insert with the new column
    const { error: insertError } = await supabase
        .from('product_variants')
        .insert([{
            product_id: 'd8c4c5a0-0000-0000-0000-000000000000',
            sku: 'DEBUG-' + Date.now(),
            options: {},
            price_adjustment_percent: 0
        }]);

    if (insertError) {
        console.log('Insert Test with price_adjustment_percent failed:', insertError.message);
    } else {
        console.log('Insert Test with price_adjustment_percent SUCCEEDED!');
    }
}

checkColumns();
