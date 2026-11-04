require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // 1. Get orders for 2026-10-27
    const { data: orders } = await supabase
        .from('orders')
        .select('id, delivery_date, created_at')
        .or('delivery_date.eq.2026-10-27,created_at.gte.2026-10-27T00:00:00,created_at.lte.2026-10-27T23:59:59');

    const orderIds = (orders || []).map(o => o.id);
    console.log('Orders found:', orderIds.length);

    // 2. Get order_items
    const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);

    console.log('Order items found:', (items || []).length);

    // 3. Check products
    const { data: products } = await supabase
        .from('products')
        .select('id, name, sku, category, unit_of_measure, accounting_id')
        .range(0, 4999);

    const prodMap = new Map();
    (products || []).forEach(p => prodMap.set(p.id, p));

    console.log('Total products loaded in map:', prodMap.size);

    let missing = 0;
    (items || []).forEach(it => {
        const prod = prodMap.get(it.product_id);
        if (!prod) {
            missing++;
            console.log('MISSING PROD:', it.id, 'product_id:', it.product_id, 'variant_label:', it.variant_label, 'custom_label:', it.custom_label);
        } else {
            console.log('MATCHED PROD:', prod.name, '| acc_id:', prod.accounting_id, '| sku:', prod.sku, '| cat:', prod.category);
        }
    });

    console.log('Total missing product_id matches:', missing);
})();
