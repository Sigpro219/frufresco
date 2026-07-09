const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({path: '.env.local'});
const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

async function run() {
  const currentPlainText = 'Buenos dias me puedes ayudar con 20 kl de tomate 15 kl de cebolla y 2 canastillas de lechuga gracias\n--\n*Kelvin Torres*';
  
  const prompt = `
        Eres un asistente de logística para FruFresco.
        FECHA ACTUAL DEL SISTEMA: ${new Date().toISOString().split('T')[0]}
        Analiza este cuerpo de correo electrónico que contiene una solicitud de pedido.
        
        CORREO ELECTRÓNICO:
        ${currentPlainText}
        
        TAREA:
        1. Identifica el nombre o empresa del CLIENTE que firma o envía el correo.
        2. Extrae todos los productos solicitados con sus cantidades.
           - Si el texto es un arreglo/JSON o tabla, la tercera columna (índice 2) contiene la CANTIDAD TOTAL del pedido. Ignora por completo las columnas posteriores (las que vienen después de la tercera columna), ya que son desgloses por sede y sumarlas causaría una duplicación.
           - NO confundas el código PLU (primera columna) con la cantidad. 
           - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0. 
        3. Extrae la dirección de entrega de forma limpia.
           REGLA DE DIRECCIÓN: Extrae ÚNICAMENTE la dirección de entrega física (por ejemplo: "Calle 127 # 7A-28 Oficina 801, Bogotá D.C.") si está escrita textualmente. Si no hay dirección especificada, devuelve null o vacío. NO deduzcas, asumas ni inventes direcciones basándote en el nombre del cliente o sus iniciales. Bajo ninguna circunstancia incluyas texto de la firma, despedidas, fórmulas de cortesía (como "Cordialmente", "Atentamente"), ni notas sobre el valor total o el horario de entrega en el campo "address". 
           Si hay texto extra después de la dirección física, recórtalo y quédate solo con la nomenclatura de la dirección.
        4. Identifica la franja u horario de entrega. Si en el correo se indica un horario o franja horaria de entrega, debes asumir la jornada correspondiente:
           - Si el horario está en el rango de la mañana (ej. "7:00 a 11:00 am", "7:30 a 11:50 am", "mañana", "7:00am a 12:00pm"), asume "AM".
           - Si el horario está en el rango de la tarde (ej. "1:00 pm a 5:00 pm", "tarde", "12:00pm a 6:00pm"), asume "PM".
           - Si el horario cubre tanto mañana como tarde (ej. "7:00 am a 4:00 pm", "todo el día", "cualquier hora"), asume "Cualquier hora".
           - Si se listan horarios por sede (ej. "Bosques de Athan: 7am a 4pm", "Clínica Roma: 7:30am a 11:50am"), intenta deducir cuál aplica basándote en el nombre o dirección del cliente. Si no se puede deducir o es el horario general (ej. "horario de recibo es de 7:00 a 11:00"), asume la jornada del horario general o la que corresponda (ej. "7:00 a 11:00 de la mañana" -> "AM").
           - Si no hay información de horario, pon null.
           - El campo "deliverySlot" debe ser estrictamente uno de los siguientes valores: "AM", "PM", "Cualquier hora", o null.
        5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD" usando la fecha actual del sistema como referencia (si dice "mañana", suma un día a la fecha actual). Si no la especifica, pon null.
        6. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial (suele empezar con 8 o 9). Usa "b2c_client" si es un cliente individual/hogar.
        7. Extrae las observaciones, notas o especificaciones de calidad del producto (por ejemplo, 'maduro', 'pintón', 'delgados', etc.) en el campo "observations". Si no hay observaciones, pon una cadena vacía o null.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
        - Las cantidades deben ser numéricas.
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "nombre o null",
          "items": [{ "originalName": "nombre del producto", "quantity": 12.5 }],
          "address": "dirección o null",
          "phone": "teléfono o null",
          "nit": "nit o null",
          "deliverySlot": "AM o PM o Cualquier hora o null",
          "deliveryDate": "YYYY-MM-DD o null",
          "clientType": "b2b_client o b2c_client",
          "observations": "notas sobre los productos o el pedido, o null"
        }
  `;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }, { apiVersion: 'v1beta' });
  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    });
    console.log(result.response.text());
  } catch (err) {
    console.error(err);
  }
}

run();
