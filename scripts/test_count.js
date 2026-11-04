require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const { data: page1 } = await supabase.from('products').select('id, name, sku, accounting_id, category').range(0, 999);
    const { data: page2, count } = await supabase.from('products').select('id, name, sku, accounting_id, category', { count: 'exact' }).range(1000, 1999);

    console.log('Page 1 count:', page1?.length);
    console.log('Page 2 count:', page2?.length);
    console.log('Exact total count in DB:', count);

    const allProducts = [...(page1 || []), ...(page2 || [])];
    console.log('Combined allProducts:', allProducts.length);

    // Let's find Cebolla cabezona blanca
    const cebolla = allProducts.find(p => (p.name || '').toLowerCase().includes('cebolla cabezona blanca cero'));
    console.log('Found cebolla:', cebolla);
})();
