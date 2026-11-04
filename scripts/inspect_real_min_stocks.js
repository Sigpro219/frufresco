require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const [p1, p2, s1, s2] = await Promise.all([
        supabase.from('products').select('id, name, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id').range(0, 999),
        supabase.from('products').select('id, name, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id').range(1000, 1999),
        supabase.from('inventory_stocks').select('*').range(0, 999),
        supabase.from('inventory_stocks').select('*').range(1000, 1999)
    ]);

    const products = [...(p1.data || []), ...(p2.data || [])];
    const stocks = [...(s1.data || []), ...(s2.data || [])];
    const stockMap = new Map();
    stocks.forEach(s => {
        stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + Number(s.quantity || 0));
    });

    const withMin = products.filter(p => Number(p.min_inventory_level) > 0);
    console.log('--- PRODUCTS WITH REAL min_inventory_level > 0 (' + withMin.length + ') ---');
    withMin.forEach(p => {
        console.log(`- [${p.accounting_id || '-'}] ${p.name} | Grupo: ${p.inventory_group} | Stock: ${stockMap.get(p.id) || 0} ${p.unit_of_measure} | Min: ${p.min_inventory_level} ${p.unit_of_measure}`);
    });

    const withStock = products.filter(p => (stockMap.get(p.id) || 0) > 0);
    console.log('\n--- PRODUCTS WITH STOCK > 0 (' + withStock.length + ') ---');
    withStock.slice(0, 15).forEach(p => {
        console.log(`- [${p.accounting_id || '-'}] ${p.name} | Grupo: ${p.inventory_group} | Stock: ${stockMap.get(p.id)} ${p.unit_of_measure} | Min: ${p.min_inventory_level || 0}`);
    });
})();
