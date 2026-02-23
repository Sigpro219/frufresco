const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTables() {
    console.log('Checking tables...');
    
    // Check product_conversions
    const { error: err1 } = await supabase.from('product_conversions').select('*').limit(1);
    console.log('product_conversions:', err1 ? err1.message : 'OK');

    // Check quotes
    const { error: err2 } = await supabase.from('quotes').select('*').limit(1);
    console.log('quotes:', err2 ? err2.message : 'OK');

    // Check quote_items
    const { error: err3 } = await supabase.from('quote_items').select('*').limit(1);
    console.log('quote_items:', err3 ? err3.message : 'OK');
}

checkTables();
