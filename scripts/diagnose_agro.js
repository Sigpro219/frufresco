require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: p } = await supabase.from('products').select('*').eq('id', '8028231c-c3ac-420f-9591-0b9f19df14ea').single();
    console.log('Real product for 8028231c:', p);

    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true });
    console.log('Exact total count of products in DB:', count);
})();
