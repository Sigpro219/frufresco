const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function translateCatalog() {
    console.log('--- Mass Translation Starting (Frufresco 2026) ---');
    
    // 1. Fetch ALL products without translation
    const { data: products, error } = await supabase
        .from('products')
        .select('id, name')
        .is('name_en', null)
        .order('name');

    if (error) {
        console.error('Error fetching products:', error.message);
        return;
    }

    if (!products || products.length === 0) {
        console.log('✅ All products are already translated!');
        return;
    }

    console.log(`Remaining products to translate: ${products.length}`);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    for (let i = 0; i < products.length; i++) {
        const prod = products[i];
        try {
            console.log(`[${i+1}/${products.length}] Translating: "${prod.name}"...`);
            
            const prompt = `Translate exactly this product name from Spanish to English. 
            Return ONLY the translated text. No quotes.
            Input Text: "${prod.name}"`;

            const result = await model.generateContent(prompt);
            const translatedText = result.response.text().trim().replace(/["']/g, '');

            console.log(`   ✨ Result: "${translatedText}"`);

            // 2. Update DB
            const { error: updateError } = await supabase
                .from('products')
                .update({ name_en: translatedText })
                .eq('id', prod.id);

            if (updateError) console.error(`   ❌ Error updating DB:`, updateError.message);
            
            // 3. Prevent 503 by sleeping
            await sleep(2500); 

        } catch (err) {
            console.error(`   ⚠️ Failed "${prod.name}": ${err.message}`);
            if (err.message.includes('503') || err.message.includes('demand')) {
                console.log('   Waiting 10 seconds before retrying...');
                await sleep(10000);
                i--; // Retry this same product
            }
        }
    }

    console.log('--- ALL PRODUCTS TRANSLATED ---');
}

translateCatalog();
