const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testInsert() {
    const testData = {
        name: 'TEST PROVIDER',
        tax_id: '123456789',
        nit: '123456789',
        location: 'TEST LOCATION',
        address: 'TEST ADDRESS',
        contact_phone: '123456',
        phone: '123456',
        email: 'test@example.com',
        world_office_id: '123456789'
    };

    for (const key of Object.keys(testData)) {
        console.log(`Testing column: ${key}`);
        const { error } = await supabase.from('providers').insert({ name: 'TEST', [key]: testData[key] });
        if (error) {
            console.log(`Result for ${key}: FAILED - ${error.message}`);
        } else {
            console.log(`Result for ${key}: SUCCESS`);
        }
    }
}
testInsert();
