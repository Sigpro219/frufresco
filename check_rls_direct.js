const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function checkRLS() {
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
        
        const tables = ['products', 'product_conversions', 'purchases'];
        for (const t of tables) {
             const { data, error } = await supabase.from(t).select('*').limit(1);
             if (error) {
                 console.log(`Table ${t}: SELECT ERROR:`, JSON.stringify(error, null, 2));
             } else {
                 console.log(`Table ${t}: SELECT OK (Data length: ${data.length})`);
             }
        }
    } catch (err) {
        console.error('Script Error:', err);
    }
}

checkRLS();
