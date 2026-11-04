require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    const [p1, p2, s1, s2, mRes] = await Promise.all([
        supabase.from('products').select('id, name, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id').range(0, 999),
        supabase.from('products').select('id, name, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id').range(1000, 2999),
        supabase.from('inventory_stocks').select('*').range(0, 999),
        supabase.from('inventory_stocks').select('*').range(1000, 2999),
        supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true)
    ]);

    const products = [...(p1.data || []), ...(p2.data || [])];
    const stocks = [...(s1.data || []), ...(s2.data || [])];
    const matrix = mRes.data || [];

    const costMap = new Map();
    matrix.forEach(m => {
        if (m.product_id && Number(m.manual_cost) > 0) costMap.set(m.product_id, Number(m.manual_cost));
    });
    products.forEach(p => {
        if (!costMap.has(p.id) && p.parent_id && costMap.has(p.parent_id)) {
            costMap.set(p.id, costMap.get(p.parent_id));
        }
    });

    const stockMap = new Map();
    stocks.forEach(s => {
        stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + Number(s.quantity || 0));
    });

    const groupMap = new Map();
    products.forEach(p => {
        const grp = (p.inventory_group || 'SIN GRUPO ASIGNADO').trim();
        const q = stockMap.get(p.id) || 0;
        const cost = costMap.get(p.id) || 0;
        const val = q * cost;
        const cur = groupMap.get(grp) || { group: grp, totalKg: 0, totalCostValue: 0, skus: 0, activeStockSkus: 0 };
        cur.totalKg += q;
        cur.totalCostValue += val;
        cur.skus += 1;
        if (q > 0) cur.activeStockSkus += 1;
        groupMap.set(grp, cur);
    });

    console.log('--- INVENTORY GROUPS BREAKDOWN ---');
    Array.from(groupMap.values()).sort((a, b) => b.totalKg - a.totalKg).forEach(g => {
        console.log(`${g.group}: ${g.totalKg.toFixed(1)} Kg | Valor Costo: $${Math.round(g.totalCostValue).toLocaleString('es-CO')} | SKUs con stock: ${g.activeStockSkus}/${g.skus}`);
    });
})();
