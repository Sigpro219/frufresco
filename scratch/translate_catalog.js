const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

async function translateCatalog() {
    console.log('--- Mass Translation Starting ---');
    
    // 1. Fetch products without translation
    const { data: products, error } = await supabase
        .from('products')
        .select('id, name')
        .is('name_en', null)
        .limit(10); // Batch of 10 for testing

    if (error) {
        console.error('Error fetching products:', error.message);
        return;
    }

    if (!products || products.length === 0) {
        console.log('No products to translate or name_en column missing.');
        return;
    }

    console.log(`Translating ${products.length} products...`);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    for (const prod of products) {
        try {
            const prompt = `Translate exactly this product name from Spanish to English. 
            Return ONLY the translated text. 
            Input Text: "${prod.name}"`;

            const result = await model.generateContent(prompt);
            const translatedText = result.response.text().trim().replace(/["']/g, '');

            console.log(`- "${prod.name}" -> "${translatedText}"`);

            // 2. Update DB
            const { error: updateError } = await supabase
                .from('products')
                .update({ name_en: translatedText })
                .eq('id', prod.id);

            if (updateError) console.error(`Error updating ${prod.name}:`, updateError.message);
        } catch (err) {
            console.error(`Failed to translate "${prod.name}":`, err.message);
            console.log('TIP: Ensure Generative Language API is enabled for your API Key in Google Cloud Console.');
            break; // Stop if there's an auth error
        }
    }

    console.log('--- Batch Finished ---');
}

translateCatalog();
