require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: movs } = await supabase
        .from('inventory_movements')
        .select('id, product_id, quantity, type, status_to, notes, created_at')
        .order('quantity', { ascending: false })
        .limit(20);
    console.log('Top 20 largest inventory_movements:', movs);
})();
