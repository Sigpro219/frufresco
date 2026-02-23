const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
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
        const tables = ['products', 'product_conversions', 'purchases', 'app_settings'];
        
        console.log('--- Checking Tables ---');
        for (const t of tables) {
            console.log(`Checking table: ${t}...`);
            const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
            if (error) {
                console.log(`Table ${t}: Error:`, JSON.stringify(error, null, 2));
            } else {
                console.log(`Table ${t}: Count:`, count);
            }
        }
        console.log('--- Done ---');
    } catch (err) {
        console.error('Script Error:', err);
    }
}

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

check();
