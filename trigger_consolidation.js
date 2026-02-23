
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function consolidate() {
    console.log('🔄 Consolidating orders for 2026-02-12...');
    const targetDate = '2026-02-12';

    // 1. Fetch order items for the date
    const { data: items, error: fetchErr } = await supabase
        .from('order_items')
        .select(`
            id, 
            quantity, 
            product_id, 
            variant_label,
            products(unit_of_measure),
            orders!inner(delivery_date, status)
        `)
        .eq('orders.delivery_date', targetDate);

    if (fetchErr) {
        console.error('Error fetching items:', fetchErr);
        return;
    }

    if (!items || items.length === 0) {
        console.log('No items found to consolidate.');
        return;
    }

    // 2. Group by product and variant
    const totals = {};
    items.forEach(item => {
        const variant = item.variant_label || '';
        const key = `${item.product_id}_${variant}`;
        if (!totals[key]) {
            totals[key] = {
                qty: 0,
                unit: item.products?.unit_of_measure || 'kg',
                pid: item.product_id,
                variant: variant
            };
        }
        totals[key].qty += item.quantity;
    });

    // 3. Upsert into procurement_tasks
    for (const key in totals) {
        const task = totals[key];
        const { data: existing } = await supabase
            .from('procurement_tasks')
            .select('id, total_requested')
            .eq('product_id', task.pid)
            .eq('variant_label', task.variant)
            .eq('delivery_date', targetDate)
            .maybeSingle();

        if (existing) {
            await supabase.from('procurement_tasks')
                .update({ total_requested: task.qty })
                .eq('id', existing.id);
            console.log(`Updated task for ${task.pid}`);
        } else {
            await supabase.from('procurement_tasks').insert({
                product_id: task.pid,
                variant_label: task.variant,
                total_requested: task.qty,
                unit: task.unit,
                delivery_date: targetDate
            });
            console.log(`Created new task for ${task.pid}`);
        }
    }
    console.log('✅ Consolidation complete!');
}

consolidate();
