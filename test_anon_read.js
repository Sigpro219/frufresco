const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function testAnonRead() {
    try {
        const envFile = fs.readFileSync('.env.local', 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value.length) {
                env[key.trim()] = value.join('=').trim().replace(/"/g, '');
            }
        });

        const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        console.log('Testing SELECT on app_settings as anon...');
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'enable_b2b_lead_capture')
            .single();
            
        if (error) {
            console.error('FAILED:', error);
        } else {
            console.log('SUCCESS:', data);
        }
    } catch (err) {
        console.error('Script Error:', err);
    }
}

testAnonRead();
