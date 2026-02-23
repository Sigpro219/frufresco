const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkPolicies() {
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
        
        console.log('--- Checking RLS Policies ---');
        const { data, error } = await supabase.rpc('debug_policies');
        
        if (error) {
            console.log('Error calling debug_policies:', error);
        } else {
            const relevant = data.filter(p => ['purchases', 'products', 'product_conversions', 'app_settings'].includes(p.tablename));
            console.table(relevant);
        }
    } catch (err) {
        console.error('Script Error:', err);
    }
}

checkPolicies();
