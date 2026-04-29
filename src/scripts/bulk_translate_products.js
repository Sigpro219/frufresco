const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

async function runBulkTranslation() {
    console.log('🚀 Starting Bulk Translation Process...');

    // 1. Load Env
    let envContent;
    try {
        envContent = fs.readFileSync('.env.local', 'utf8');
    } catch (e) {
        console.error('❌ Could not find .env.local');
        return;
    }

    const getEnv = (key) => {
        const match = envContent.match(new RegExp(`${key}=(.*)`));
        return match ? match[1].trim() : null;
    };

    const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL');
    const supabaseKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
    const geminiKey = getEnv('GOOGLE_GENERATIVE_AI_API_KEY');

    if (!supabaseUrl || !supabaseKey || !geminiKey) {
        console.error('❌ Missing required environment variables');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    // 2. Fetch products needing translation
    console.log('📡 Fetching products missing translations...');
    const { data: products, error: fetchError } = await supabase
        .from('products')
        .select('id, name, description, name_en, description_en')
        .or('name_en.is.null,description_en.is.null')
        .limit(1000); // Process in chunks of 1000

    if (fetchError) {
        console.error('❌ Error fetching products:', fetchError);
        return;
    }

    if (!products || products.length === 0) {
        console.log('✅ All products are already bilingual!');
        return;
    }

    console.log(`📦 Found ${products.length} products to translate.`);

    // 3. Batch Processing
    const BATCH_SIZE = 40; // Larger batches to use fewer requests
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(products.length / BATCH_SIZE);
        
        console.log(`\n🔄 Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

        const prompt = `You are a professional agricultural translator for FruFresco.
Translate these product names and descriptions from Spanish to English.
Focus on produce accuracy (e.g. "Papa Sabanera" -> "Sabanera Potato").

Input:
${JSON.stringify(batch.map(p => ({ id: p.id, name: p.name, description: p.description })))}

Output:
Return ONLY a valid JSON array of objects: [{"id": "...", "name_en": "...", "description_en": "..."}].
No markdown, no talk.`;

        let success = false;
        let retries = 0;
        const MAX_RETRIES = 100; // Persistence: Keep trying until finished

        while (!success && retries < MAX_RETRIES) {
            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                let text = response.text().trim();
                
                if (text.startsWith('```json')) {
                    text = text.substring(7, text.length - 3).trim();
                } else if (text.startsWith('```')) {
                    text = text.substring(3, text.length - 3).trim();
                }

                const translations = JSON.parse(text);

                // 4. Update Database
                process.stdout.write(`💾 Saving ${translations.length} translations... `);
                for (const trans of translations) {
                    await supabase
                        .from('products')
                        .update({
                            name_en: trans.name_en,
                            description_en: trans.description_en
                        })
                        .eq('id', trans.id);
                }
                console.log(`✅`);
                
                success = true;
                
                if (i + BATCH_SIZE < products.length) {
                    console.log(`⏳ Waiting 65 seconds to respect rate limits...`);
                    await new Promise(resolve => setTimeout(resolve, 65000));
                }

            } catch (err) {
                if (err.message.includes('429') || err.message.includes('Quota')) {
                    retries++;
                    console.warn(`⚠️ Rate limit hit. Waiting 90s (Retry ${retries}/${MAX_RETRIES})...`);
                    await new Promise(resolve => setTimeout(resolve, 90000));
                } else {
                    console.error(`❌ Unexpected error in batch:`, err.message);
                    break; 
                }
            }
        }
    }

    console.log('\n✨ BULK TRANSLATION COMPLETED! All SKUs are now bilingual.');
}

runBulkTranslation();
