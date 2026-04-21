const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fullSweep() {
    console.log('--- STARTING TOTAL TRANSLATION SWEEP (1356 Products) ---');
    
    while(true) {
        // Fetch products that are either NULL or empty string in name_en
        const { data: products, error } = await supabase
            .from('products')
            .select('id, name')
            .or('name_en.is.null,name_en.eq.""')
            .limit(50); // Small batches to be safe

        if (error) {
            console.error('Fetch error:', error.message);
            break;
        }

        if (!products || products.length === 0) {
            console.log('✅ ALL 1356 PRODUCTS ARE NOW TRANSLATED!');
            break;
        }

        console.log(`Processing next 50 products...`);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        for (const prod of products) {
            try {
                // Skip if name is empty or numeric (some SKUs might be in the name field)
                if (!prod.name || prod.name.trim().length < 2) {
                    await supabase.from('products').update({ name_en: prod.name || 'N/A' }).eq('id', prod.id);
                    continue;
                }

                const prompt = `Translate this product name from Spanish to English. Return ONLY the translation. Text: "${prod.name}"`;
                const result = await model.generateContent(prompt);
                const translatedText = result.response.text().trim().replace(/["']/g, '');

                await supabase.from('products').update({ name_en: translatedText }).eq('id', prod.id);
                console.log(`- Translated: "${prod.name}" -> "${translatedText}"`);
                
                await sleep(1500); // 1.5s delay to avoid any rate limits
            } catch (err) {
                console.error(`Error with "${prod.name}":`, err.message);
                await sleep(5000); // Wait 5s on error before continuing
            }
        }
    }
}

fullSweep();
