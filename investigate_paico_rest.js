const fs = require('fs');
const path = require('path');

// Read env variables
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const getEnvVar = (name) => {
    const match = envContent.match(new RegExp(`^${name}=(.*)$`, 'm'));
    return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : null;
};

const supabaseUrl = getEnvVar('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey = getEnvVar('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const PRODUCT_ID = 'c26f9472-0b82-4698-b7ad-77a51818d083';

async function fetchRest(endpoint) {
    const url = `${supabaseUrl}/rest/v1/${endpoint}`;
    const res = await fetch(url, {
        headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
        }
    });
    if (!res.ok) {
        throw new Error(`REST Error for ${endpoint}: ${res.status} ${res.statusText} - ${await res.text()}`);
    }
    return await res.json();
}

async function main() {
    console.log('--- START PAICO INVESTIGATION ---');
    
    // 1. Fetch Product Info
    console.log('\nFetching Product Info...');
    const products = await fetchRest(`products?id=eq.${PRODUCT_ID}`);
    console.log(JSON.stringify(products, null, 2));
    
    // 2. Fetch Stocks
    console.log('\nFetching Stocks...');
    const stocks = await fetchRest(`inventory_stocks?product_id=eq.${PRODUCT_ID}`);
    console.log(JSON.stringify(stocks, null, 2));
    
    // 3. Fetch Movements
    console.log('\nFetching Movements...');
    const movements = await fetchRest(`inventory_movements?product_id=eq.${PRODUCT_ID}&order=created_at.asc`);
    console.log(`Found ${movements.length} movements.`);
    
    // 4. Gather order items and purchase receptions (which map to 'purchases')
    const orderItemIds = movements
        .filter(m => m.reference_type === 'order_item')
        .map(m => m.reference_id);
    const purchaseIds = movements
        .filter(m => m.reference_type === 'purchase_reception')
        .map(m => m.reference_id);
        
    console.log(`\nGathering details for ${orderItemIds.length} order items and ${purchaseIds.length} purchases...`);
    
    let orderItemsMap = {};
    let ordersMap = {};
    if (orderItemIds.length > 0) {
        const items = await fetchRest(`order_items?id=in.(${orderItemIds.join(',')})`);
        items.forEach(it => {
            orderItemsMap[it.id] = it;
        });
        
        const orderIds = [...new Set(items.map(it => it.order_id))];
        if (orderIds.length > 0) {
            const orders = await fetchRest(`orders?id=in.(${orderIds.join(',')})`);
            orders.forEach(o => {
                ordersMap[o.id] = o;
            });
        }
    }
    
    let purchasesMap = {};
    if (purchaseIds.length > 0) {
        const purchases = await fetchRest(`purchases?id=in.(${purchaseIds.join(',')})`);
        purchases.forEach(p => {
            purchasesMap[p.id] = p;
        });
    }
    
    // 5. Output Timeline
    console.log('\n======================================================');
    console.log('                 CHRONOLOGICAL TIMELINE               ');
    console.log('======================================================');
    
    let cumulative = 0;
    movements.forEach((m, index) => {
        const qty = parseFloat(m.quantity);
        cumulative += qty;
        
        console.log(`\n[#${index + 1}] Date: ${m.created_at}`);
        console.log(`      Type: ${m.type.toUpperCase()} | Qty: ${qty > 0 ? '+' : ''}${qty} Kg | Running Stock: ${cumulative} Kg`);
        console.log(`      Status: ${m.status_from} -> ${m.status_to}`);
        console.log(`      Notes: "${m.notes || ''}"`);
        console.log(`      Ref Type: ${m.reference_type} | Ref ID: ${m.reference_id}`);
        
        if (m.reference_type === 'order_item') {
            const item = orderItemsMap[m.reference_id];
            if (item) {
                const order = ordersMap[item.order_id];
                console.log(`      --> Order Item Info: Qty Ordered: ${item.quantity} | Qty Picked: ${item.picked_quantity}`);
                if (order) {
                    console.log(`      --> Order Info: Order ID: ${order.id} | Delivery Date: ${order.delivery_date} | Status: ${order.status}`);
                } else {
                    console.log(`      --> Order Info: Order ID: ${item.order_id} (Order not found)`);
                }
            } else {
                console.log(`      --> Order Item Info: Not found in order_items table!`);
            }
        } else if (m.reference_type === 'purchase_reception') {
            const purchase = purchasesMap[m.reference_id];
            if (purchase) {
                console.log(`      --> Purchase Info: Ordered Qty: ${purchase.quantity} | Picked Up Qty: ${purchase.picked_up_quantity} | Status: ${purchase.status}`);
            } else {
                console.log(`      --> Purchase Info: Not found in purchases table!`);
            }
        }
    });
    
    console.log('\n--- END PAICO INVESTIGATION ---');
}

main().catch(err => {
    console.error('Fatal Error:', err);
});
