require('dotenv').config({ path: '.env.local' });
const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

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
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    });

    const req = require('https').request({
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (parsed.candidates && parsed.candidates[0]) {
              resolve(parsed.candidates[0].content.parts[0].text);
          } else {
              reject(new Error("No candidates: " + body));
          }
        } catch(e) {
          reject(new Error("Parse error: " + body));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const plainText = `Buenos días,\r\n\r\nCordial saludo.\r\n\r\nQuisiera realizar el siguiente pedido para entrega a domicilio:\r\n\r\n   -\r\n\r\n   2 kg de papa pastusa\r\n   -\r\n\r\n   1 kg de tomate chonto\r\n   -\r\n\r\n   1 kg de cebolla cabezona\r\n   -\r\n\r\n   1 kg de zanahoria\r\n   -\r\n\r\n   500 g de habichuela\r\n   -\r\n\r\n   1 kg de plátano maduro\r\n   -\r\n\r\n   1 kg de naranja Valencia\r\n   -\r\n\r\n   1 kg de banano bocadillo\r\n   -\r\n\r\n   1 kg de guayaba\r\n   -\r\n\r\n   1 lechuga crespa\r\n   -\r\n\r\n   500 g de cilantro\r\n   -\r\n\r\n   24 huevos AA\r\n   -\r\n\r\n   2 litros de leche entera\r\n   -\r\n\r\n   1 kg de arroz\r\n   -\r\n\r\n   1 paquete de pan tajado\r\n\r\n*Dirección de entrega:*\r\n\r\nCarrera 79C # 42 Sur - 18, Apartamento 302\r\nBarrio Kennedy Central\r\nBogotá D.C.\r\n\r\nAgradezco confirmar la disponibilidad de los productos, el valor total del\r\npedido y el horario estimado para la entrega.\r\n\r\nQuedo atento a su respuesta.\r\n\r\nMuchas gracias.\r\n\r\nAtentamente,\r\n\r\nChristian Eduardo Rodríguez Higuera\r\nC.C. 1013671534\r\nCelular: 314 587 2631`;

const prompt = `
        Eres un asistente de logística para FruFresco.
        Analiza este cuerpo de correo electrónico que contiene una solicitud de pedido.
        
        CORREO ELECTRÓNICO:
        ${plainText}
        
        TAREA:
        1. Identifica el nombre o empresa del CLIENTE que firma o envía el correo.
        2. Extrae todos los productos solicitados con sus cantidades.
        3. Extrae la dirección de entrega, ciudad, número de teléfono y cédula/NIT si están presentes en el texto o en la firma.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
        - Las cantidades deben ser numéricas.
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos. Muchos clientes listan productos separados por guiones (-). Debes ignorar los guiones y extraer el nombre del producto y su cantidad.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre o Empresa Detectada",
          "documentType": "Email",
          "address": "Dirección extraída o vacio",
          "phone": "Teléfono extraído o vacio",
          "nit": "NIT o cédula extraída o vacio",
          "items": [
            { "originalName": "Tomate Chonto", "quantity": 15 }
          ]
        }
      `;

fetchGemini(apiKey, prompt).then(text => console.log(text)).catch(console.error);
