const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function listTriggers() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1];
    const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1];

    if (!url || !key) return;

    const supabase = createClient(url.trim(), key.trim());

    // Querying information_schema.triggers
    const { data, error } = await supabase.rpc('get_triggers', { table_name: 'orders' });
    
    if (error) {
        // If RPC doesn't exist, try a simple query to see if we can get something via a system view if exposed
        // Actually, most Supabase projects don't expose information_schema via PostgREST.
        // But let's try to just check for an insert policy first.
        console.log('Error fetching triggers (RPC might be missing).');
    } else {
        console.log('Triggers:', data);
    }
}

listTriggers();
