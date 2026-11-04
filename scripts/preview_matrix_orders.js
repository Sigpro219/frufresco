require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function previewMatrixOrders() {
    const { data: matrices } = await supabase
        .from('profiles')
        .select('id, company_name, razon_social')
        .eq('role', 'b2b_client')
        .is('parent_id', null);

    const { data: existingTemplates } = await supabase.from('quote_templates').select('id, name');
    const existingNames = new Set((existingTemplates || []).map(t => t.name.toLowerCase().trim()));

    let totalProductsFound = 0;
    for (const m of (matrices || []).slice(0, 10)) {
        const name = (m.company_name || m.razon_social || '').trim();
        if (existingNames.has(name.toLowerCase())) continue;

        // Get branches
        const { data: branches } = await supabase.from('profiles').select('id').eq('parent_id', m.id);
        const allIds = [m.id, ...(branches || []).map(b => b.id)];

        // Get orders
        const { data: orders } = await supabase.from('orders').select('id').in('profile_id', allIds).neq('status', 'cancelled').limit(50);
        const orderIds = (orders || []).map(o => o.id);

        let uniqueProducts = [];
        if (orderIds.length > 0) {
            const { data: items } = await supabase.from('order_items').select('product_id').in('order_id', orderIds);
            uniqueProducts = [...new Set((items || []).map(it => it.product_id).filter(Boolean))];
        }
        console.log(`Matriz: ${name} -> Branches: ${branches.length}, Orders: ${orderIds.length}, Unique SKUs: ${uniqueProducts.length}`);
    }
}
previewMatrixOrders().catch(console.error);
