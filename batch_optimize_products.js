const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Configuración
const SUPABASE_URL = 'https://csqurhdykbalvlnpowcz.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzcXVyaGR5a2JhbHZsbnBvd2N6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjY3Njk2MSwiZXhwIjoyMDg4MjUyOTYxfQ.6lAdV9TeZvrc6nMs7VCMxnZiTWeewMsFtZn84-kJ_5E';
const GEMINI_KEY = 'AIzaSyCDH2OFlGQ-M_QPm2o58yzpgQHKo-iXpU4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

async function processBatch(products) {
    const promises = products.map(async (product) => {
        const prompt = `
Eres un experto en marketing gastronómico y nutrición para FruFresco, una tienda premium de frutas y verduras.
Tu tarea es generar una descripción atractiva, orgánica y saludable para un producto.

PRODUCTO: ${product.name}
CATEGORÍA: ${product.category || 'N/A'}
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
  "name_en": "Commercial English Name",
  "description_es": "Descripción equilibrada y saludable en español (Entre 40 y 50 palabras)",
  "description_en": "Healthy and balanced description in English (40-50 words)"
}

No incluyas markdown, solo el JSON puro.`;

        try {
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text().trim().replace(/```json|```/g, '');
            const aiData = JSON.parse(text);

            const { error } = await supabase
                .from('products')
                .update({
                    name_en: aiData.name_en,
                    description: aiData.description_es,
                    description_en: aiData.description_en
                })
                .eq('sku', product.sku);

            if (error) throw error;
            console.log(`✅ Optimizado: ${product.sku} - ${product.name}`);
            return true;
        } catch (err) {
            console.error(`❌ Error en ${product.sku}:`, err.message);
            return false;
        }
    });

    return Promise.all(promises);
}

async function main() {
    console.log('🚀 Iniciando optimización masiva de FruFresco...');
    
    const { data: products, error } = await supabase
        .from('products')
        .select('sku, name, category, description')
        .eq('show_on_web', true);

    if (error) {
        console.error('Error al obtener productos:', error);
        return;
    }

    console.log(`📦 Encontrados ${products.length} productos para procesar.`);

    const batchSize = 1; 
    for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize);
        console.log(`\n⏳ Procesando producto ${i + 1} de ${products.length}...`);
        await processBatch(batch);
        console.log('💤 Esperando 20 segundos...');
        await new Promise(resolve => setTimeout(resolve, 20000));
    }

    console.log('\n✨ ¡Optimización global completada!');
}

main();
