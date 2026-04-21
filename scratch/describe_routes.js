const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = envConfig.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function describeRoutes() {
    // We can't easily describe via supabase-js, but we can try to insert a dummy and see errors or query a row
    const { data, error } = await supabase.from('routes').select('*').limit(1);
    if (data && data.length > 0) {
        console.log('Columns in routes:', Object.keys(data[0]));
    } else {
        console.log('Routes table is empty, columns unknown via SELECT.');
        // Try to insert an almost empty row to see missing columns error
        const { error: insErr } = await supabase.from('routes').insert({}).select();
        console.log('Insert error hint:', insErr?.message);
    }
}

describeRoutes();
