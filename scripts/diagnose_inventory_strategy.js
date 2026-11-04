require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const [prodRes, stockRes, settingsRes] = await Promise.all([
        supabase.from('products').select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active').limit(2000),
        supabase.from('inventory_stocks').select('*'),
        supabase.from('app_settings').select('*').in('key', ['product_categories', 'inventory_groups'])
    ]);

    const prods = prodRes.data || [];
    const stocks = stockRes.data || [];
    console.log('Total products fetched:', prods.length);
    console.log('Total inventory_stocks rows:', stocks.length);
    console.log('app_settings:', JSON.stringify(settingsRes.data, null, 2));

    const groups = {};
    const cats = {};
    let withMinLevel = 0;
    prods.forEach(p => {
        const g = p.inventory_group || '(null)';
        groups[g] = (groups[g] || 0) + 1;
        const c = p.category || '(null)';
        cats[c] = (cats[c] || 0) + 1;
        if (p.min_inventory_level && Number(p.min_inventory_level) > 0) withMinLevel++;
    });
    console.log('Products with min_inventory_level > 0:', withMinLevel);
    console.log('Distinct inventory_group counts:', groups);
    console.log('Distinct category counts:', cats);

    let stocksWithMin = 0;
    let stocksPositive = 0;
    stocks.forEach(s => {
        if (s.min_stock_level && Number(s.min_stock_level) > 0) stocksWithMin++;
        if (Number(s.quantity) > 0) stocksPositive++;
    });
    console.log('Stocks with quantity > 0:', stocksPositive, '| Stocks with min_stock_level > 0:', stocksWithMin);
    console.log('Sample stocks (first 10):', stocks.slice(0, 10));
})();
