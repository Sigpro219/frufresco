const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://kuxnixwoacwsotcilhuz.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo');

async function testInsert() {
    const { error } = await supabase
        .from('product_variants')
        .insert([{
            product_id: 'd8c4c5a0-0000-0000-0000-000000000000', // Dummy or existing
            sku: 'TEST-SKU-' + Date.now(),
            options: {},
            price_adjustment_percent: 5
        }]);
    
    if (error) {
        console.log('Error Code:', error.code);
        console.log('Error Message:', error.message);
        console.log('Error Details:', error.details);
    } else {
        console.log('Insert successful!');
    }
}

testInsert();
