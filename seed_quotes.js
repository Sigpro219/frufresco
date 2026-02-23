const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://kuxnixwoacwsotcilhuz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1eG5peHdvYWN3c290Y2lsaHV6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg1OTg1NzIsImV4cCI6MjA4NDE3NDU3Mn0.ueMkLMfFTze3EeAokrgsmmwL--_S5Vgj2pcyaJq8hOo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedQuotes() {
    console.log('Seeding quotes for matrix...');
    
    // 1. Get some products
    const { data: products } = await supabase.from('products').select('id, name, base_price').limit(10);
    if (!products) return;

    // 2. Get some models
    const { data: models } = await supabase.from('pricing_models').select('id, name');
    if (!models) return;

    const clients = ['Hotel Continental', 'Restaurante Central', 'Colegio San Jose', 'Bistro Mar', 'Cafe Paris'];

    for (let i = 0; i < 5; i++) {
        const quoteDate = new Date();
        quoteDate.setDate(quoteDate.getDate() - i);
        
        const { data: quote, error: qErr } = await supabase.from('quotes').insert({
            client_name: clients[i],
            model_id: models[0].id,
            model_snapshot_name: models[0].name,
            total_amount: 0,
            status: 'sent',
            created_at: quoteDate.toISOString()
        }).select().single();

        if (qErr) {
            console.error('Error insert quote:', qErr);
            continue;
        }

        const items = products.slice(0, 5 + i).map(p => {
            const price = p.base_price * (1 + (Math.random() * 0.2)); // Random variation
            return {
                quote_id: quote.id,
                product_id: p.id,
                product_name: p.name,
                quantity: Math.floor(Math.random() * 10) + 1,
                unit: 'kg',
                unit_price: Math.ceil(price),
                total_price: Math.ceil(price) * 10
            };
        });

        const { error: iErr } = await supabase.from('quote_items').insert(items);
        if (iErr) console.error('Error items:', iErr);
        
        console.log(`Created quote for ${clients[i]}`);
    }
}

seedQuotes();
