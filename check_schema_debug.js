const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkSchema() {
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
        const { data, error } = await supabase.from('purchases').select('*').limit(1).single();
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Purchases columns:', Object.keys(data));
        }

        const { data: convData, error: convError } = await supabase.from('product_conversions').select('*').limit(1);
        if (convError) console.error('Conv Error:', convError);
        else if (convData.length > 0) console.log('Conv columns:', Object.keys(convData[0]));

    } catch (err) {
        console.error('Script Error:', err);
    }
}

checkSchema();
