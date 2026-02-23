const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

try {
    const envConfig = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) process.env[key.trim()] = value.trim();
    });
} catch (e) { }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkCoverage() {
    console.log('--- CHECKING COVERAGE ---');

    const { data: products } = await supabase.from('products').select('id, name, category');
    const { data: items } = await supabase.from('order_items').select('product_id');

    // Count items per product ID
    const counts = items.reduce((acc, item) => {
        acc[item.product_id] = (acc[item.product_id] || 0) + 1;
        return acc;
    }, {});

    // Aggregate by category
    const catStats = products.reduce((acc, p) => {
        if (!acc[p.category]) acc[p.category] = { total: 0, withOrders: 0, items: 0 };
        acc[p.category].total++;
        if (counts[p.id]) {
            acc[p.category].withOrders++;
            acc[p.category].items += counts[p.id];
        }
        return acc;
    }, {});

    // console.table(catStats);
    Object.keys(catStats).forEach(cat => {
        console.log(`Category: "${cat}" - Total Products: ${catStats[cat].total}, With Orders: ${catStats[cat].withOrders}, Total Items: ${catStats[cat].items}`);
    });
}

checkCoverage();
