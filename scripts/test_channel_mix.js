require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    // 1. Get special agreement clients
    const { data: settings } = await supabase.from('app_settings').select('key, value');
    const specialClientSet = new Set();
    (settings || []).forEach(s => {
        if (s.key && s.key.startsWith('agreement_clients:')) {
            try {
                const arr = JSON.parse(typeof s.value === 'string' ? s.value : JSON.stringify(s.value));
                if (Array.isArray(arr)) {
                    arr.forEach(id => specialClientSet.add(id));
                }
            } catch (e) {}
        }
    });

    console.log('Total clients in special agreement padrones:', specialClientSet.size);

    // 2. Fetch profiles
    const { data: profiles } = await supabase.from('profiles').select('id, role, company_name, contact_name, parent_id');
    const profMap = new Map();
    (profiles || []).forEach(p => profMap.set(p.id, p));

    // 3. Fetch cost matrix
    const { data: matrix } = await supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true);
    const costMap = new Map();
    (matrix || []).forEach(m => costMap.set(m.product_id, Number(m.manual_cost || 0)));

    // 4. Fetch orders for this month (October 2026)
    const { data: orders } = await supabase.from('orders')
        .select('id, profile_id, total, delivery_date, created_at, status')
        .gte('delivery_date', '2026-10-01')
        .lte('delivery_date', '2026-10-31')
        .neq('status', 'cancelled');

    console.log('Total orders in Oct 2026:', (orders || []).length);

    const orderIds = (orders || []).map(o => o.id);
    const { data: items } = await supabase.from('order_items')
        .select('order_id, product_id, quantity, unit_price')
        .in('order_id', orderIds.slice(0, 500)); // Sample

    // Aggregate by channel
    const channels = {
        special_chains: { name: 'Acuerdos Especiales / Cadenas', orders: 0, sales: 0, cost: 0, profit: 0 },
        b2b_standard: { name: 'B2B Institucional Estándar', orders: 0, sales: 0, cost: 0, profit: 0 },
        b2c_home: { name: 'Hogar / B2C Directo', orders: 0, sales: 0, cost: 0, profit: 0 }
    };

    const itemsByOrder = new Map();
    (items || []).forEach(it => {
        if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
        itemsByOrder.get(it.order_id).push(it);
    });

    (orders || []).forEach(o => {
        const prof = profMap.get(o.profile_id);
        const isSpecial = specialClientSet.has(o.profile_id) || 
                          (prof?.parent_id && specialClientSet.has(prof.parent_id)) ||
                          /corral|nutresa|ircc|colsubsidio|leños|beer station/i.test(prof?.company_name || '');
        const isB2B = prof?.role === 'b2b_client' || (prof?.company_name && prof?.role !== 'b2c_client');

        let chKey = 'b2c_home';
        if (isSpecial) {
            chKey = 'special_chains';
        } else if (isB2B) {
            chKey = 'b2b_standard';
        }

        const amt = Number(o.total || 0);
        channels[chKey].orders++;
        channels[chKey].sales += amt;

        // Calculate cost
        const oItems = itemsByOrder.get(o.id) || [];
        let oCost = 0;
        oItems.forEach(it => {
            const qty = Number(it.quantity || 0);
            const unitPrice = Number(it.unit_price || 0);
            const unitCost = costMap.get(it.product_id) || (unitPrice > 0 ? unitPrice * 0.70 : 0);
            oCost += qty * unitCost;
        });

        if (oCost === 0 && amt > 0) {
            oCost = amt * 0.72; // Fallback estimate
        }
        channels[chKey].cost += oCost;
        channels[chKey].profit += (amt - oCost);
    });

    console.log('Channels summary:');
    let totalS = 0;
    let totalP = 0;
    Object.values(channels).forEach(c => {
        totalS += c.sales;
        totalP += c.profit;
    });

    Object.entries(channels).forEach(([k, c]) => {
        const salesShare = totalS > 0 ? (c.sales / totalS) * 100 : 0;
        const profitShare = totalP > 0 ? (c.profit / totalP) * 100 : 0;
        const margin = c.sales > 0 ? (c.profit / c.sales) * 100 : 0;
        console.log(`- ${c.name}:`);
        console.log(`  Pedidos: ${c.orders}`);
        console.log(`  Ventas: $${Math.round(c.sales).toLocaleString()} (${salesShare.toFixed(1)}%)`);
        console.log(`  Utilidad: $${Math.round(c.profit).toLocaleString()} (${profitShare.toFixed(1)}%)`);
        console.log(`  Margen: ${margin.toFixed(1)}%`);
    });
})();
