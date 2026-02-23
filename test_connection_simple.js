const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function test() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
    const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1];

    if (!url || !key) {
        console.error('Credentials not found');
        return;
    }

    console.log('Testing connection to:', url.trim());
    const supabase = createClient(url.trim(), key.trim());

    try {
        console.log('Executing simple query...');
        const { data, error } = await supabase.from('app_settings').select('*').limit(1);
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Success! Data:', data);
        }
    } catch (e) {
        console.error('Exception:', e);
    }
}

test();
