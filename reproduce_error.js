const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

async function reproduce() {
    try {
        const envFile = fs.readFileSync('.env.local', 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value.length) {
                env[key.trim()] = value.join('=').trim().replace(/"/g, '');
            }
        });

        const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        
        console.log('1. Fetching products...');
        const { data: productsData, error: pError } = await supabase
            .from('products')
            .select('*')
            .order('category', { ascending: true })
            .order('name', { ascending: true });
        if (pError) throw pError;

        console.log('2. Fetching conversions...');
        const { data: convData } = await supabase.from('product_conversions').select('*');

        console.log('3. Fetching purchases...');
        const { data: purchasesData, error: iError } = await supabase
            .from('purchases')
            .select('product_id, unit_price, created_at, purchase_unit')
            .order('created_at', { ascending: false });
        if (iError) throw iError;

        console.log('4. Normalizing...');
        const historyMap = {};
        purchasesData?.forEach((p) => {
            if (!historyMap[p.product_id]) historyMap[p.product_id] = [];
            if (historyMap[p.product_id].length < 8) {
                const product = productsData?.find((pd) => pd.id === p.product_id);
                let normalizedPrice = p.unit_price;

                if (product && p.purchase_unit && p.purchase_unit !== product.unit_of_measure) {
                    const conv = convData?.find((c) => 
                        c.product_id === p.product_id && 
                        c.from_unit === p.purchase_unit && 
                        c.to_unit === product.unit_of_measure
                    );
                    if (conv && conv.conversion_factor) {
                        normalizedPrice = normalizedPrice / conv.conversion_factor;
                    }
                }

                historyMap[p.product_id].push({
                    ...p,
                    normalized_price: normalizedPrice
                });
            }
        });

        console.log('5. Reversing...');
        Object.keys(historyMap).forEach(pid => {
            historyMap[pid].reverse();
        });

        console.log('✅ Success! Map size:', Object.keys(historyMap).length);
    } catch (err) {
        console.error('Manual Fetch Error:', err);
    }
}

reproduce();
