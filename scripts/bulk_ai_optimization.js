const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config({ path: '.env.local' });

// Configuración de Supabase (Service Role para bypass RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!supabaseUrl || !supabaseKey || !geminiKey) {
    console.error("❌ Faltan variables de entorno en .env.local");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const genAI = new GoogleGenerativeAI(geminiKey);

// Usamos el modelo configurado en el sistema
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

async function getProductsToOptimize() {
    console.log("🔍 Consultando productos sin descripción optimizada...");
    // Buscamos productos que no tengan descripción en inglés o que tengan descripciones muy cortas
    const { data, error } = await supabase
        .from('products')
        .select('id, name, category, description')
        .or('description_en.is.null, name_en.is.null')
        .order('id');

    if (error) throw error;
    return data;
}

async function optimizeProduct(product) {
    const prompt = `
Eres un experto en marketing gastronómico y nutrición para FruFresco, una tienda premium de frutas y verduras.
Tu tarea es generar una descripción atractiva, orgánica y saludable para un producto.

PRODUCTO: ${product.name}
CATEGORÍA: ${product.category}
DESCRIPCIÓN ACTUAL (opcional): ${product.description || 'N/A'}

REQUERIMIENTOS:
1. TONO: Profesional, saludable, premium y persuasivo.
2. CONTENIDO:
   - Una apertura que resalte la calidad superior del producto.
   - MENCIONA AL MENOS 2 BENEFICIOS nutricionales o para la salud (ej: vitaminas, fibra, antioxidantes).
   - Un consejo de uso culinario creativo.
3. IDIOMAS: Español e Inglés.
4. FORMATO: JSON puro.
{
  "name_en": "Traducción al inglés",
  "description_es": "Descripción equilibrada y saludable en español (Entre 40 y 50 palabras)",
  "description_en": "Healthy and balanced description in English (40-50 words)"
}

No incluyas markdown, solo el JSON puro.
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().replace(/```json|```/g, '');
        return JSON.parse(text);
    } catch (error) {
        // Fallback si el modelo flash falla (intentar pro)
        if (error.message.includes('not found') || error.message.includes('404')) {
            const backupModel = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await backupModel.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim().replace(/```json|```/g, '');
            return JSON.parse(text);
        }
        throw error;
    }
}

async function runOptimization() {
    try {
        const products = await getProductsToOptimize();
        console.log(`🚀 Iniciando optimización de ${products.length} productos...`);

        let successCount = 0;
        let errorCount = 0;

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            const progress = `[${i + 1}/${products.length}]`;

            try {
                process.stdout.write(`${progress} Optimizando: ${product.name}... `);
                
                const aiData = await optimizeProduct(product);
                
                if (aiData) {
                    const { error: updateError } = await supabase
                        .from('products')
                        .update({
                            description: aiData.description_es,
                            description_en: aiData.description_en,
                            name_en: aiData.name_en
                        })
                        .eq('id', product.id);

                    if (updateError) throw updateError;
                    
                    console.log("✅ OK");
                    successCount++;
                }
            } catch (err) {
                console.log(`❌ ERROR: ${err.message}`);
                errorCount++;
                // Pequeña pausa si hay error para no saturar
                await new Promise(r => setTimeout(r, 2000));
            }

            // Pausa entre peticiones para respetar cuotas (Rate Limiting)
            // Gemini Flash tiene límites generosos pero es mejor ser precavido
            await new Promise(r => setTimeout(r, 500)); 
        }

        console.log("\n--- RESULTADOS FINALES ---");
        console.log(`✅ Éxito: ${successCount}`);
        console.log(`❌ Errores: ${errorCount}`);
        console.log("--------------------------");

    } catch (error) {
        console.error("❌ Error fatal en el proceso:", error.message);
    }
}

runOptimization();
