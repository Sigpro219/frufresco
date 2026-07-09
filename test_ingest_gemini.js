const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const https = require('https');

dotenv.config({ path: path.resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

function fetchGemini(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt }
          ]
        }
      ]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(body);
            const text = parsed.candidates[0].content.parts[0].text;
            resolve(text);
          } catch (e) {
            reject(new Error("Invalid JSON response from Gemini: " + body));
          }
        } else {
          reject(new Error(`Gemini API Error: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

async function main() {
  const { data: draft, error } = await supabase
    .from('order_drafts')
    .select('email_body')
    .eq('id', 'c75bbdc6-96ea-4fab-806a-908d6d73cf3f')
    .single();

  if (error) {
    console.error('Error fetching draft:', error);
    return;
  }

  const currentPlainText = draft.email_body;

  const prompt = `
    Eres un asistente de logística para FruFresco.
    FECHA ACTUAL DEL SISTEMA: 2026-06-18
    Analiza este cuerpo de correo electrónico que contiene una solicitud de pedido.
    
    CORREO ELECTRÓNICO:
    ${currentPlainText}
    
    TAREA:
    1. Identifica el nombre o empresa del CLIENTE que firma o envía el correo.
    2. Extrae todos los productos solicitados con sus cantidades.
       - Si el texto es una tabla, CSV o JSON, la segunda columna suele ser el NOMBRE DEL PRODUCTO y la tercera columna es la CANTIDAD PEDIDA. 
       - NO confundas el código PLU (primera columna) con la cantidad. 
       - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0. 
    3. Extrae la dirección de entrega de forma limpia.
       REGLA DE DIRECCIÓN: Extrae ÚNICAMENTE la dirección de entrega física (por ejemplo: "Calle 127 # 7A-28 Oficina 801, Bogotá D.C."). 
       Bajo ninguna circunstancia incluyas texto de la firma, despedidas, fórmulas de cortesía (como "Cordialmente", "Atentamente"), ni notas sobre el valor total o el horario de entrega en el campo "address". 
       Si hay texto extra después de la dirección física, recórtalo y quédate solo con la nomenclatura de la dirección.
    4. Extrae la jornada u horario de entrega preferido si el cliente lo menciona explícitamente en el texto (por ejemplo: "AM", "PM", "Tarde", "Mañana", "Entre las 8 y 10 am"). Si no se menciona o no se registra de manera clara, pon null o vacio.
    5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD" usando la fecha actual del sistema como referencia (si dice "mañana", suma un día a la fecha actual). Si no la especifica, pon null.
    6. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial (suele empezar con 8 o 9). Usa "b2c_client" si es un cliente individual/hogar.
    
    REGLAS CRÍTICAS:
    - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
    - Las cantidades deben ser numéricas.
    - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos.
    
    FORMATO DE RESPUESTA ESPERADO:
    {
      "clientInDocument": "Nombre o Empresa Detectada",
      "documentType": "Email",
      "address": "Dirección física limpia extraída o vacio",
      "deliverySlot": "AM / PM / Mañana / Tarde / null",
      "deliveryDate": "YYYY-MM-DD o null",
      "phone": "Teléfono extraído o vacio",
      "nit": "NIT o cédula extraída o vacio",
      "clientType": "b2b_client o b2c_client",
      "items": [
        { "originalName": "Tomate Chonto", "quantity": 15 }
      ]
    }
  `;

  console.log('Sending request to Gemini...');
  try {
    const rawResult = await fetchGemini(apiKey, prompt);
    console.log('\n--- GEMINI RAW RESPONSE ---');
    console.log(rawResult);
    console.log('---------------------------');
    
    const cleaned = rawResult.trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    console.log('\n--- PARSED JSON ---');
    console.log(JSON.stringify(parsed, null, 2));
  } catch (err) {
    console.error('Error during execution:', err);
  }
}

main();
