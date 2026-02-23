const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function dumpSettings() {
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
        console.log('--- app_settings content ---');
        const { data, error } = await supabase.from('app_settings').select('*');
        if (error) {
            console.error('Error:', error);
        } else {
            const counts = {};
            data.forEach(s => {
                counts[s.key] = (counts[s.key] || 0) + 1;
                if (counts[s.key] > 1) console.log(`DUPLICATE FOUND: ${s.key}`);
            });
            console.log('--- Counts per key ---');
            Object.entries(counts).forEach(([k, v]) => {
                if (v > 1) console.log(`${k}: ${v}`);
            });
            const b2b = data.filter(s => s.key === 'enable_b2b_lead_capture');
            console.log('--- Result ---');
            console.log('Found enable_b2b_lead_capture:', b2b.length);
            if (b2b.length > 0) console.log('Value(s):', b2b.map(s => s.value));
        }
    } catch (err) {
        console.error('Script Error:', err);
    }
}

dumpSettings();
