require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
    console.log('--- 1. SPECIAL AGREEMENT MODELS ---');
    const { data: models, error: mErr } = await supabase
        .from('special_agreement_models')
        .select('*');
    if (mErr) {
        console.error('Error fetching special_agreement_models:', mErr);
    } else {
        console.log(`Found ${models.length} special models:`);
        models.forEach(m => {
            console.log(`- Model ID: ${m.id} | Name: ${m.name} | Master Quote ID: ${m.master_quote_id} | Start: ${m.start_date} | Valid Until: ${m.valid_until}`);
        });
    }

    console.log('\n--- 2. APP SETTINGS (SPECIAL AGREEMENTS & SHARED QUOTES) ---');
    const { data: settings } = await supabase
        .from('app_settings')
        .select('*');
    (settings || []).forEach(s => {
        if (s.key && (s.key.includes('agreement') || s.key.includes('nutresa') || s.key.includes('colsubsidio') || s.key.includes('quote'))) {
            console.log(`Key: ${s.key} | Value:`, JSON.stringify(s.value));
        }
    });

    console.log('\n--- 3. CHECKING QUOTES FOR EACH MODEL ---');
    const masterQuoteIds = (models || []).map(m => m.master_quote_id).filter(Boolean);
    if (masterQuoteIds.length > 0) {
        const { data: quotes } = await supabase
            .from('quotes')
            .select('id, quote_number, client_id, status, total, created_at')
            .in('id', masterQuoteIds);
        console.log(`Found ${quotes?.length} master quotes:`);
        quotes?.forEach(q => {
            console.log(`- Quote ID: ${q.id} | No: ${q.quote_number} | Status: ${q.status} | Client: ${q.client_id}`);
        });

        const { data: items } = await supabase
            .from('quote_items')
            .select('quote_id, product_id, unit_price')
            .in('quote_id', masterQuoteIds);
        console.log(`Total items across master quotes: ${items?.length}`);
    }
})();
