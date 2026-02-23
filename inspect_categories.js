const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function inspectCats() {
    console.log('--- INSPECTING CATEGORIES ---');

    const { data: products } = await supabase.from('products').select('category');

    // Distinct
    const distinct = [...new Set(products.map(p => p.category))];
    console.log('Categories found in DB:', distinct);
}

inspectCats();
