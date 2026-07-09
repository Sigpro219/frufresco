const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function check() {
    const env = fs.readFileSync('.env.local', 'utf8');
    const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
    const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim();

    const supabase = createClient(url, key);

    // Fetch list of functions/routines using postgres catalog tables via REST!
    // Since we are using service role key, we can query pg_catalog tables if RLS allows it or if service role bypasses it!
    console.log('Fetching functions...');
    const { data, error } = await supabase.from('pg_proc').select('proname').limit(10);
    if (error) {
        // pg_proc might not be exposed on postgrest.
        console.log('Cannot query pg_proc directly:', error.message);
        // Let's try to query via a simple SELECT or check other ways.
    } else {
        console.log('Functions:', data);
    }
}
check();
