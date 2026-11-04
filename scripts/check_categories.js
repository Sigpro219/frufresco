require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: prods } = await supabase.from('products').select('category');
    const set = new Set();
    prods.forEach(p => { if (p.category) set.add(p.category); });
    console.log('Distinct categories in products table:', Array.from(set));
})();
