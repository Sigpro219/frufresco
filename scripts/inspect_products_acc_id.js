require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data, error } = await supabase.from('products').select('id, name, accounting_id, sku, created_at').order('created_at', { ascending: false }).limit(10);
    console.log('Last 10 products:', data);

    const { data: maxIdData } = await supabase
        .from('products')
        .select('accounting_id')
        .not('accounting_id', 'is', null)
        .order('accounting_id', { ascending: false })
        .limit(5);
    console.log('Max accounting_ids:', maxIdData);
})();
