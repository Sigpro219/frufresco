const fs = require('fs');
const https = require('https');
require('dotenv').config({path: '.env.local'});
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

const base64Data = fs.readFileSync('test.pdf').toString('base64');
const prompt = `
Eres un asistente de procesamiento de pedidos de FruFresco.
TAREA:
1. Identifica el nombre o empresa del CLIENTE que firma o envía el correo.
2. Extrae todos los productos solicitados con sus cantidades.
   - Si el texto es un arreglo/JSON o tabla, la tercera columna (índice 2) contiene la CANTIDAD TOTAL del pedido. Ignora por completo las columnas posteriores (las que vienen después de la tercera columna), ya que son desgloses por sede y sumarlas causaría una duplicación.
   - NO confundas el código PLU (primera columna) con la cantidad. 
   - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0. 
3. Extrae la dirección de entrega de forma limpia.
4. Extrae el teléfono de contacto (si hay).
5. Extrae el NIT o Cédula (si hay).
6. Extrae la franja de entrega sugerida si existe ('deliverySlot' como AM o PM, etc).
7. Extrae la fecha de entrega sugerida ('deliveryDate' como YYYY-MM-DD o null).
8. Si el correo viene de compras@frufresco.com, pedidos@frufresco.com o frufrescodigital@gmail.com clasifícalo como 'b2c_client'. De lo contrario, 'b2b_client'.

FORMATO DE RESPUESTA ESPERADO:
{
  "clientInDocument": "Nombre o Empresa Detectada",
  "documentType": "Imagen/WhatsApp/PDF",
  "address": "Dirección física limpia extraída o vacio",
  "phone": "Teléfono extraído o vacio",
  "nit": "NIT o cédula extraída o vacio",
  "deliverySlot": "AM / PM / Mañana / Tarde / null",
  "deliveryDate": "YYYY-MM-DD o null",
  "clientType": "b2b_client o b2c_client",
  "items": [
    { "originalName": "Nombre del Producto", "quantity": 10 }
  ]
}
`;

const data = JSON.stringify({
  contents: [{
    role: 'user',
    parts: [
      { text: prompt },
      { inline_data: { mime_type: 'application/pdf', data: base64Data } }
    ]
  }]
});

const req = https.request({
  hostname: 'generativelanguage.googleapis.com',
  port: 443,
  path: '/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log(res.statusCode, body));
});
req.on('error', console.error);
req.write(data);
req.end();
