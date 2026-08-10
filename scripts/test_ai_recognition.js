const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const dir = 'C:\\Users\\German Higuera\\OneDrive\\Documentos\\Proyectos Delta CoreTech\\2026\\Inventario Fruver\\ordenes de pedido';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf') || f.endsWith('.PDF'));

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function testDirectGemini() {
  const { data: products } = await supabase.from('products').select('id, name, sku, base_price, accounting_id').eq('is_active', true);
  const { data: aliases } = await supabase.from('product_aliases').select('*');
  const { data: nicknames } = await supabase.from('product_nicknames').select('*');

  console.log(`Loaded ${products?.length} active products, ${aliases?.length || 0} aliases, ${nicknames?.length || 0} client nicknames.`);

  for (const fileName of files) {
    console.log('\n==================================================');
    console.log('TESTING FILE WITH GEMINI:', fileName);
    console.log('==================================================');

    const filePath = path.join(dir, fileName);
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    const prompt = `
      Eres un asistente experto en logística para FruFresco. 
      Analiza esta orden de compra adjunta.
      
      TAREA:
      1. Identifica el nombre del CLIENTE mencionado en el documento.
         - NOMBRE DEL CLIENTE PRINCIPAL: Identifica la compañía matriz, institución o razón social que emite el documento (frecuentemente en el encabezado, logo o parte superior, ej. "Colsubsidio"). NUNCA uses nombres de sucursales, centros de costos (ej. "CC33 Centro de Producción...") o dependencias internas como el nombre principal del cliente.
      2. Extrae todos los productos solicitados junto con su cantidad numérica y unidad.
      3. Identifica si hay una DIRECCIÓN de entrega o envío mencionada de forma limpia.
      4. Identifica si hay un TELÉFONO de contacto.
      5. Identifica si hay un número de CÉDULA o NIT.
      6. Determina el tipo de documento.
      
      FORMATO DE RESPUESTA ESPERADO:
      {
        "clientInDocument": "Nombre del Cliente Detectado",
        "addressInDocument": "Dirección Extraída o null",
        "phoneInDocument": "Teléfono Extraído o null",
        "nitInDocument": "NIT/Cédula Extraída o null",
        "documentType": "PDF",
        "items": [
          { "originalName": "Nombre del Producto", "quantity": 10, "unit": "Kg", "observations": null }
        ]
      }
    `;

    const modelsToTry = ['gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'];
    let resultText = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const res = await model.generateContent([
          { inlineData: { data: base64Data, mimeType: 'application/pdf' } },
          { text: prompt }
        ]);
        resultText = (await res.response).text().trim();
        if (resultText) {
          console.log(`Processed successfully with model: ${modelName}`);
          break;
        }
      } catch (e) {
        console.log(`Model ${modelName} failed: ${e.message}`);
      }
    }

    if (resultText) {
      try {
        const cleanJson = resultText.replace(/^```json/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleanJson);
        console.log('Client Detected:', parsed.clientInDocument);
        console.log('Address Detected:', parsed.addressInDocument);
        console.log('Phone Detected:', parsed.phoneInDocument);
        console.log('NIT Detected:', parsed.nitInDocument);
        console.log('Items Count:', parsed.items?.length);
        console.log('Sample Items (first 5):', JSON.stringify(parsed.items?.slice(0, 5), null, 2));

        if (parsed.items && Array.isArray(parsed.items)) {
          let matchedCount = 0;
          let unmatchedCount = 0;
          parsed.items.forEach(item => {
            const originalName = (item.originalName || '').toLowerCase();
            const match = products.find(p => 
              originalName.includes(p.name.toLowerCase()) ||
              p.name.toLowerCase().includes(originalName.split(' ')[0])
            );
            if (match) {
              matchedCount++;
            } else {
              unmatchedCount++;
              console.log('  ⚠️ UNMATCHED ITEM:', item.originalName);
            }
          });
          console.log(`Matching Summary: ${matchedCount} matched, ${unmatchedCount} unmatched (Total: ${parsed.items.length})`);
        }
      } catch (e) {
        console.log('JSON Parse Error:', resultText.substring(0, 300));
      }
    }
  }
}

testDirectGemini();
