import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import https from 'https';
import * as XLSX from 'xlsx';

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key);
};

function fetchGemini(apiKey: string, prompt: string, base64Image?: string, mimeType?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      contents: [
        {
          role: "user",
          parts: base64Image ? [
            { inlineData: { data: base64Image, mimeType: mimeType } },
            { text: prompt }
          ] : [
            { text: prompt }
          ]
        }
      ],
      generationConfig: { responseMimeType: "application/json" }
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

export const maxDuration = 60; // Increase Vercel timeout to 60s for Gemini
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(req: Request) {
  const supabaseAdmin = getSupabaseAdmin();
  
  // 1. Webhook Security
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    console.error('[Email Inbound] Unauthorized access attempt.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rawPayloadStr = '';
  try {
    rawPayloadStr = await req.text();
    const payload = JSON.parse(rawPayloadStr);

    supabaseAdmin.from('raw_emails').insert([{ payload, status: 'pending' }]).then(()=>{}, ()=>{});

    // CloudMailin structures payload containing headers, envelope, plain, html, attachments
    const headers = payload.headers || {};
    const envelope = payload.envelope || {};

    const fromField = headers.from || headers.From || envelope.from || '';
    const toField = headers.to || headers.To || envelope.to || '';
    const subject = headers.subject || headers.Subject || '';
    const plainText = payload.plain || '';
    const attachments = payload.attachments || [];
    
    // Clean forwarded message headers if present to prevent client profile matching issues and product parsing noise
    let cleanedBodyText = plainText;
    const forwardBlockRegex = /[-]+\s*Forwarded\s+message\s*[-]+\s*\r?\n(?:(?:De|From|Date|Fecha|Subject|Asunto|To|Para|Cc):\s*[^\r\n]*\r?\n)*/i;
    cleanedBodyText = cleanedBodyText.replace(forwardBlockRegex, '').trim();
    
    // DEBUG: Append attachment info to plainText so we can see it in Supabase
    let debugInfo = '\n\n[DEBUG] Attachments info: ' + JSON.stringify(attachments.map((a: any) => ({name: a.filename, type: a.content_type, size: a.content ? a.content.length : 0})));
    let currentPlainText = plainText + debugInfo;

    // Extract clean email address (e.g. "John Doe <john@example.com>" -> "john@example.com")
    let senderEmail = fromField;
    const matchEmail = fromField.match(/<([^>]+)>/);
    if (matchEmail) {
      senderEmail = matchEmail[1];
    }
    senderEmail = senderEmail.trim().toLowerCase();

    // Cuentas corporativas conocidas de FruFresco y del administrador
    const corporateEmails = ['frufrescodigital@gmail.com', 'pedidos@frufresco.com', 'compras@frufresco.com', 'ventas@frufresco.com'];
    const isCorporateSender = corporateEmails.includes(senderEmail) || senderEmail.endsWith('@frufresco.com') || senderEmail.endsWith('@frufresco.co');

    // 1. IGNORAR de inmediato si es un correo automático (auto-replies, bounces, deliverability messages)
    const isAutoReply = 
      headers['auto-submitted'] || 
      headers['Auto-Submitted'] || 
      subject.toLowerCase().startsWith('¡hemos recibido tu pedido!') ||
      subject.toLowerCase().startsWith('hemos recibido tu pedido') ||
      subject.toLowerCase().includes('auto-reply') || 
      subject.toLowerCase().includes('autoreply') || 
      subject.toLowerCase().includes('delivery status notification') || 
      subject.toLowerCase().includes('undelivered mail') || 
      subject.toLowerCase().includes('failure notice') ||
      senderEmail.includes('mailer-daemon') ||
      senderEmail.includes('noreply') ||
      senderEmail.includes('no-reply');

    if (isAutoReply) {
      console.log(`[Email Inbound] Ignorando correo automático para evitar bucles de respuesta. Emisor: ${senderEmail}, Asunto: ${subject}`);
      return NextResponse.json({ success: true, message: 'Ignored automatic email/loop prevention.' });
    }

    // Determine if the email was sent to our corporate email address (which is normal for orders)
    let recipientEmail = toField;
    const matchTo = toField.match(/<([^>]+)>/);
    if (matchTo) {
      recipientEmail = matchTo[1];
    }
    recipientEmail = recipientEmail.trim().toLowerCase();

    const isCorporateRecipient = corporateEmails.includes(recipientEmail) || recipientEmail.endsWith('@frufresco.com') || recipientEmail.endsWith('@frufresco.co');

    if (isCorporateSender && toField) {
      // Si el emisor es corporativo (frufrescodigital@gmail.com), se trata de un correo saliente
      // (ej. enviado con CCO a la plataforma). En este caso, el cliente es el destinatario (recipientEmail).
      
      // Si el destinatario también es corporativo, se aborta para evitar bucles.
      if (isCorporateRecipient) {
        console.log(`[Email Inbound] Ignorando correo corporativo interno de loop. De: ${senderEmail} Para: ${recipientEmail}`);
        return NextResponse.json({ success: true, message: 'Ignored internal corporate email loop.' });
      }

      console.log(`[Email Inbound] Correo saliente detectado (CCO/BCC) desde emisor corporativo (${senderEmail}). Asociando al destinatario (cliente): ${recipientEmail}`);
      senderEmail = recipientEmail; // Usar el destinatario para buscar la ficha del cliente y responderle
    } else {
      // Si el emisor NO es corporativo (ej: higuera200@gmail.com), el cliente es el senderEmail.
      // El correo fue enviado TO a nuestra cuenta corporativa (recipientEmail).
      console.log(`[Email Inbound] Correo entrante recibido de cliente: ${senderEmail} hacia corporativo: ${recipientEmail} con asunto: ${subject}`);
    }

    // 1. Declare client profile reference
    let profile: any = null;
    const draftUuid = crypto.randomUUID();
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key is missing' }, { status: 500 });
    }

    let extractedData: any = {
      clientInDocument: '',
      documentType: 'Email',
      items: []
    };

    // 2. Parse email body or attachment with Gemini
    let isExcel = false;
    let excelTextContext = '';

    if (attachments.length > 0) {
      const attFileName = attachments[0].file_name || attachments[0].filename || 'adjunto.xlsx';
      console.log(`[Email Inbound] Processing attachment: ${attFileName}`);
      // CloudMailin attachment format: content is base64 encoded
      const attachment = attachments[0];
      const base64Data = attachment.content;
      const mimeType = attachment.content_type || 'application/pdf';
      attachmentName = attFileName;

      const lowerMime = mimeType.toLowerCase();
      const lowerName = attachmentName ? attachmentName.toLowerCase() : '';
      isExcel = lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');

      if (isExcel) {
        try {
          const buffer = Buffer.from(base64Data, 'base64');
          const workbook = XLSX.read(buffer, { type: 'buffer' });
          let allRows: any[] = [];
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const validRows = rows.filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell !== ''));
            if (validRows.length > 0) allRows = allRows.concat([[`--- HOJA: ${sheetName} ---`]], validRows);
          }
          excelTextContext = JSON.stringify(allRows);
          console.log(`[Email Inbound] Extracted text from all sheets of Excel attachment: ${attachmentName}`);
        } catch (err) {
          console.error('[Email Inbound] Error parsing Excel:', err);
        }
      }

      try {
        // Ensure order-attachments bucket exists
        try {
          await supabaseAdmin.storage.createBucket('order-attachments', { public: true });
        } catch (_) {}

        const buffer = Buffer.from(base64Data, 'base64');
        const sanitizedFilename = (attachmentName || 'unnamed').replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${draftUuid}_${sanitizedFilename}`;
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
          .from('order-attachments')
          .upload(storagePath, buffer, {
            contentType: mimeType,
            upsert: true
          });

        if (!uploadError) {
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from('order-attachments')
            .getPublicUrl(storagePath);
          attachmentUrl = publicUrl;
          console.log(`[Email Inbound] Attachment uploaded to Supabase Storage: ${attachmentUrl}`);
        } else {
          console.error('[Email Inbound] Failed to upload attachment:', uploadError);
        }
      } catch (uploadErr) {
        console.error('[Email Inbound] Storage upload handler crashed:', uploadErr);
      }

      const prompt = `
        Eres un asistente de logística experto en digitalización de pedidos para FruFresco.
        FECHA ACTUAL DEL SISTEMA: ${new Date().toISOString().split('T')[0]}
        
        ASUNTO DEL CORREO: "${subject}"
        
        CONTEXTO ADICIONAL (Texto del cuerpo del correo enviado por el cliente):
        """
        ${cleanedBodyText}
        """
        
        TAREA:
        1. Analiza el documento adjunto (puede ser una imagen de WhatsApp, foto de pedido, PDF) para extraer la lista de productos solicitados.
        2. Identifica el nombre o empresa del CLIENTE, dirección de entrega física, número de teléfono, cédula/NIT y jornada preferida de entrega combinando el análisis del documento adjunto y del cuerpo del correo electrónico anterior.
           - GUÍA DE FIRMA/PIE DE PÁGINA: La firma o pie de página del correo suele contener el NOMBRE DE LA EMPRESA, la DIRECCIÓN y el NÚMERO DE TELÉFONO de contacto. Busca en esa zona específica (generalmente al final del correo, después de expresiones como "Atentamente" o "Cordialmente") para identificar y extraer estos datos con precisión.
           - NOMBRE DEL CLIENTE: Identifica el nombre comercial de la empresa, marca o contacto en la firma/pie de página. NUNCA uses nombres de ciudades/países (como "Bogotá-Colombia", "Bogotá", "Colombia") como el nombre del cliente; busca el nombre real del negocio o contacto.
           - DIRECCIÓN DE ENTREGA: Extrae la dirección física escrita en el correo o firma (ej. "Carrera 7 #45-78"). Limpia cualquier texto extra de despedida o firma, guardando únicamente la nomenclatura de la dirección. Si no hay dirección explícita, devuelve null o vacío.
        3. Identifica la franja u horario de entrega. Si en el correo o documento se indica un horario o franja horaria de entrega, debes asumir la jornada correspondiente:
           - Si el horario está en el rango de la mañana (ej. "7:00 a 11:00 am", "7:30 a 11:50 am", "mañana", "7:00am a 12:00pm"), asume "AM".
           - Si el horario está en el rango de la tarde (ej. "1:00 pm a 5:00 pm", "tarde", "12:00pm a 6:00pm"), asume "PM".
           - Si el horario cubre tanto mañana como tarde (ej. "7:00 am a 4:00 pm", "todo el día", "cualquier hora"), asume "Cualquier hora".
           - Si se listan horarios por sede (ej. "Bosques de Athan: 7am a 4pm", "Clínica Roma: 7:30am a 11:50am"), intenta deducir cuál aplica basándote en el nombre o dirección del cliente. Si no se puede deducir o es el horario general (ej. "horario de recibo es de 7:00 a 11:00"), asume la jornada del horario general o la que corresponda (ej. "7:00 a 11:00 de la mañana" -> "AM").
           - Si no hay información de horario, pon null.
           - El campo "deliverySlot" debe ser estrictamente uno de los siguientes valores: "AM", "PM", "Cualquier hora", o null.
        4. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial. Usa "b2c_client" si es un cliente individual/hogar (persona natural que compra para su casa).
        5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD". Revisa muy atentamente tanto el ASUNTO DEL CORREO como el cuerpo/documento para encontrar indicaciones de fecha (ej. "Pedido para mañana", "Despacho 25/06/2026", "Entrega viernes", etc.). Usa la fecha actual del sistema como referencia. Si no se especifica ninguna fecha de entrega en el asunto ni en el cuerpo/documento, pon null.
        6. Extrae todos los productos solicitados y su cantidad numérica.
             - Identifica dinámicamente qué columna contiene la "CANTIDAD PEDIDA" o "CANTIDAD TOTAL". No asumas que siempre es la tercera columna.
             - Si la cabecera (título) de la columna de cantidades está vacía o es nula en el documento/tabla, pero claramente contiene los valores totales numéricos del pedido, asume que esa es la columna correcta y extrae las cantidades de ahí.
             - Evita extraer Códigos de Barras o códigos PLU como si fueran cantidades.
             - Si la tabla incluye una columna de CANTIDAD TOTAL y luego columnas adicionales que desglosan esa cantidad por sedes, usa ÚNICAMENTE la CANTIDAD TOTAL. Ignora los desgloses para no duplicar las cantidades.
             - Asegúrate de extraer la cantidad pedida correcta que aparece junto al nombre del producto.
             - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
             - Extrae también la unidad de medida (ej. "Kg", "Lb", "Litro", etc.). Si el producto no tiene descripción de unidades en el texto del pedido (ej. "12 huevos", "1 lechuga crespa"), debes establecer obligatoriamente la unidad como "Unidad".
        7. Extrae las observaciones, notas o especificaciones de calidad del producto (por ejemplo, 'maduro', 'pintón', 'delgados', etc.) en el campo "observations". Si no hay observaciones, pon una cadena vacía o null.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código.
        - Las cantidades deben ser estrictamente numéricas (si dice "una libra", pon 1. Si no hay cantidad, asume 1).
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos. Incluso si está vacío, o si el usuario lista con guiones (-), extráelos como elementos del arreglo.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre o Empresa Detectada",
          "documentType": "Imagen/WhatsApp/PDF",
          "address": "Dirección física limpia extraída o vacio",
          "phone": "Teléfono extraído o vacio",
          "nit": "NIT o cédula extraída o vacio",
          "deliverySlot": "AM / PM / Cualquier hora / null",
          "deliveryDate": "YYYY-MM-DD o null",
          "clientType": "b2b_client o b2c_client",
          "items": [
            { "originalName": "Nombre del Producto", "quantity": 10, "unit": "Kg / Lb / Unidad / Litro / null", "observations": "Cualquier nota u observación específica del producto o null" }
          ]
        }
      `;

      if (!isExcel) {
        try {
          let text = await fetchGemini(apiKey, prompt, base64Data, mimeType);
          text = text.trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
          extractedData = JSON.parse(text);
          if (extractedData.items && !Array.isArray(extractedData.items)) {
            if (typeof extractedData.items === 'object') {
              extractedData.items = Object.keys(extractedData.items).map(key => ({ originalName: key, quantity: extractedData.items[key] }));
            } else {
              extractedData.items = [];
            }
          }
        } catch (e) {
          console.error('Failed to parse Gemini output for attachment:', e);
        }
      } else {
        console.log('[Email Inbound] Attachment is Excel. Sending CSV data as text to Gemini.');
        // We use the same detailed prompt style but adapt it for Excel context
        const excelPrompt = `
        Eres un asistente de logística experto en digitalización de pedidos para FruFresco.
        FECHA ACTUAL DEL SISTEMA: ${new Date().toISOString().split('T')[0]}
        
        ASUNTO DEL CORREO: "${subject}"
        
        CONTEXTO ADICIONAL (Texto del cuerpo del correo enviado por el cliente):
        """
        ${currentPlainText}
        """

        CONTENIDO DEL ARCHIVO ADJUNTO EXCEL/CSV:
        ${excelTextContext}
        
        TAREA:
        1. Analiza el contenido de texto del archivo Excel adjunto para extraer la lista de productos solicitados.
        2. Identifica el nombre o empresa del CLIENTE, dirección de entrega física, número de teléfono, cédula/NIT y jornada preferida de entrega combinando el análisis del correo y del Excel.
           - NOMBRE DEL CLIENTE: Identifica la compañía matriz o razón social principal. NUNCA uses nombres de sucursales o ciudades.
        3. Identifica la franja u horario de entrega. El campo "deliverySlot" debe ser estrictamente uno de los siguientes valores: "AM", "PM", "Cualquier hora", o null.
        4. Clasifica el tipo de cliente en "clientType": "b2b_client" o "b2c_client".
        5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD". Revisa muy atentamente tanto el ASUNTO DEL CORREO como el cuerpo/Excel para encontrar indicaciones de fecha (ej. "Pedido para mañana", "Despacho 25/06/2026", "Entrega viernes", etc.). Usa la fecha actual del sistema como referencia. Si no se especifica ninguna fecha de entrega en el asunto ni en el cuerpo/Excel, pon null.
        6. Extrae todos los productos solicitados y su cantidad numérica.
             - Identifica dinámicamente qué columna contiene la "CANTIDAD PEDIDA" o "CANTIDAD TOTAL". No asumas que siempre es la tercera columna.
             - Si la cabecera (título) de la columna de cantidades está vacía o es nula en el documento/tabla, pero claramente contiene los valores totales numéricos del pedido, asume que esa es la columna correcta y extrae las cantidades de ahí.
             - Evita extraer Códigos de Barras o códigos PLU como si fueran cantidades.
             - Si la tabla incluye una columna de CANTIDAD TOTAL y luego columnas adicionales que desglosan esa cantidad por sedes, usa ÚNICAMENTE la CANTIDAD TOTAL. Ignora los desgloses para no duplicar las cantidades.
             - Asegúrate de extraer la cantidad pedida correcta que aparece junto al nombre del producto.
             - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
             - Extrae también la unidad de medida (ej. "Kg", "Lb", "Litro", etc.). Si el producto no tiene descripción de unidades en el texto del pedido (ej. "12 huevos", "1 lechuga crespa"), debes establecer obligatoriamente la unidad como "Unidad".
        7. Extrae las observaciones o especificaciones en el campo "observations".
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
        - Las cantidades deben ser estrictamente numéricas.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre o Empresa Detectada",
          "documentType": "Email con Excel adjunto",
          "address": "Dirección física limpia extraída o vacio",
          "phone": "Teléfono extraído o vacio",
          "nit": "NIT o cédula extraída o vacio",
          "deliverySlot": "AM / PM / Cualquier hora / null",
          "deliveryDate": "YYYY-MM-DD o null",
          "clientType": "b2b_client o b2c_client",
          "items": [
            { "originalName": "Nombre del Producto", "quantity": 10, "unit": "Kg / Lb / Unidad / Litro / null", "observations": "Cualquier nota u observación específica del producto o null" }
          ]
        }
        `;
        try {
          let text = await fetchGemini(apiKey, excelPrompt);
          console.log('[Email Inbound] Raw Gemini Excel text:', text);
          
          // Extraer bloque de código JSON si existe
          const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
          if (jsonMatch) {
            text = jsonMatch[1];
          }
          text = text.trim();
          
          // Eliminar posibles caracteres basura comunes al inicio/final
          if (text.startsWith('```json')) text = text.substring(7);
          if (text.startsWith('```')) text = text.substring(3);
          if (text.endsWith('```')) text = text.substring(0, text.length - 3);
          text = text.trim();

          extractedData = JSON.parse(text);
          if (extractedData.items && !Array.isArray(extractedData.items)) {
            if (typeof extractedData.items === 'object') {
              extractedData.items = Object.keys(extractedData.items).map(key => ({ originalName: key, quantity: extractedData.items[key] }));
            } else {
              extractedData.items = [];
            }
          }
        } catch (e) {
          console.error('Failed to parse Gemini output for Excel content:', e);
        }
      }
    }
    
    if (attachments.length === 0) {
      console.log('[Email Inbound] Processing plain text email body');
      // No attachments, parse the email text body directly
      const prompt = `
        Eres un asistente de logística para FruFresco.
        FECHA ACTUAL DEL SISTEMA: ${new Date().toISOString().split('T')[0]}
        
        ASUNTO DEL CORREO: "${subject}"
        
        CUERPO DEL CORREO ELECTRÓNICO ENVIADO POR EL CLIENTE:
        """
        ${cleanedBodyText}
        """

        Analiza tanto el asunto como el cuerpo de este correo electrónico que contiene una solicitud de pedido.
        TAREA:
        1. Identifica el nombre o empresa del CLIENTE que firma o envía el correo.
           - GUÍA DE FIRMA/PIE DE PÁGINA: La firma o pie de página del correo suele contener el NOMBRE DE LA EMPRESA, la DIRECCIÓN y el NÚMERO DE TELÉFONO de contacto. Busca en esa zona específica (generalmente al final del correo, después de expresiones como "Atentamente" o "Cordialmente") para identificar y extraer estos datos con precisión.
           - NOMBRE DEL CLIENTE: Identifica el nombre comercial de la empresa, marca o contacto en la firma/pie de página. NUNCA uses nombres de ciudades/países (como "Bogotá-Colombia", "Bogotá", "Colombia") como el nombre del cliente; busca el nombre real del negocio o contacto.
        2. Extrae todos los productos solicitados con sus cantidades.
           - Si el texto es un arreglo/JSON o tabla, la tercera columna (índice 2) contiene la CANTIDAD TOTAL del pedido. Ignora por completo las columnas posteriores (las que vienen después de la tercera columna), ya que son desgloses por sede y sumarlas causaría una duplicación.
           - NO confundas el código PLU (primera columna) con la cantidad. 
           - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
           - Extrae también la unidad de medida (ej. "Kg", "Lb", "Litro", etc.). Si el producto no tiene descripción de unidades en el texto del pedido (ej. "12 huevos", "1 lechuga crespa"), debes establecer obligatoriamente la unidad como "Unidad".
        3. Extrae la dirección de entrega de forma limpia.
           - DIRECCIÓN DE ENTREGA: Extrae únicamente la dirección física escrita en el correo o firma (ej. "Carrera 7 #45-78", "Carrera 15 # 134A 25, Apartamento 802, Barrio Cedritos, Bogotá"). Limpia cualquier texto extra de comentarios, solicitudes, despedida o firma. Quédate estrictamente con la nomenclatura geográfica de la dirección. NUNCA incluyas frases del cuerpo del correo como "Por favor confirmar disponibilidad...", "Adjunto pedido...", etc. Si no hay dirección explícita, devuelve null o vacío.
        4. Identifica la franja u horario de entrega. Si en el correo se indica un horario o franja horaria de entrega, debes asumir la jornada correspondiente:
           - Si el horario está en el rango de la mañana (ej. "7:00 a 11:00 am", "7:30 a 11:50 am", "mañana", "7:00am a 12:00pm"), asume "AM".
           - Si el horario está en el rango de la tarde (ej. "1:00 pm a 5:00 pm", "tarde", "12:00pm a 6:00pm"), asume "PM".
           - Si el horario cubre tanto mañana como tarde (ej. "7:00 am a 4:00 pm", "todo el día", "cualquier hora"), asume "Cualquier hora".
           - Si se listan horarios por sede (ej. "Bosques de Athan: 7am a 4pm", "Clínica Roma: 7:30am a 11:50am"), intenta deducir cuál aplica basándote en el nombre o dirección del cliente. Si no se puede deducir o es el horario general (ej. "horario de recibo es de 7:00 a 11:00"), asume la jornada del horario general o la que corresponda (ej. "7:00 a 11:00 de la mañana" -> "AM").
           - Si no hay información de horario, pon null.
           - El campo "deliverySlot" debe ser estrictamente uno de los siguientes valores: "AM", "PM", "Cualquier hora", o null.
        5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD". Revisa muy atentamente tanto el ASUNTO DEL CORREO como el cuerpo para encontrar indicaciones de fecha (ej. "Pedido para mañana", "Despacho 25/06/2026", "Entrega viernes", etc.). Usa la fecha actual del sistema como referencia (ej. si hoy es 24 de junio y dice "mañana", la fecha de entrega es 2026-06-25; si dice "para el viernes" y hoy es miércoles, calcula la fecha del próximo viernes). Si no se especifica ninguna fecha de entrega en el asunto ni en el cuerpo, pon null.
        6. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial (suele empezar con 8 o 9). Usa "b2c_client" si es un cliente individual/hogar.
        7. Extrae las observaciones, notas o especificaciones de calidad del producto (por ejemplo, 'maduro', 'pintón', 'delgados', etc.) en el campo "observations". Si no hay observaciones, pon una cadena vacía o null.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
        - Las cantidades deben ser numéricas.
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre o Empresa Detectada",
          "documentType": "Email",
          "address": "Dirección física limpia extraída o vacio",
          "deliverySlot": "AM / PM / Cualquier hora / null",
          "deliveryDate": "YYYY-MM-DD o null",
          "phone": "Teléfono extraído o vacio",
          "nit": "NIT o cédula extraída o vacio",
          "clientType": "b2b_client o b2c_client",
          "items": [
            { "originalName": "Tomate Chonto", "quantity": 15, "unit": "Kg / Lb / Unidad / Litro / null", "observations": "Cualquier nota u observación específica del producto o null" }
          ]
        }
      `;

      try {
        let text = await fetchGemini(apiKey, prompt);
        console.log('[Email Inbound] Raw Gemini plain text:', text);
        
        // Extraer bloque de código JSON si existe
        const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
        if (jsonMatch) {
          text = jsonMatch[1];
        }
        text = text.trim();
        
        // Eliminar posibles caracteres basura comunes al inicio/final
        if (text.startsWith('```json')) text = text.substring(7);
        if (text.startsWith('```')) text = text.substring(3);
        if (text.endsWith('```')) text = text.substring(0, text.length - 3);
        text = text.trim();
 
        extractedData = JSON.parse(text);
        if (extractedData.items && !Array.isArray(extractedData.items)) {
          if (typeof extractedData.items === 'object') {
            extractedData.items = Object.keys(extractedData.items).map(key => ({ originalName: key, quantity: extractedData.items[key] }));
          } else {
            extractedData.items = [];
          }
        }
      } catch (e) {
        console.error('Failed to parse Gemini output for email text:', e);
      }
      
      // FALLBACK: If Gemini failed to extract items, try regex extraction
      if (!extractedData.items || !Array.isArray(extractedData.items) || extractedData.items.length === 0) {
        extractedData.items = [];
        const lines = cleanedBodyText.split('\n');
        const regex = /^[-*\s]*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|litros?|paquetes?|unidades?|cubetas?|manojos?|atados?)?\s*(de\s+)?(.+)/i;
        for (let line of lines) {
          line = line.trim();
          if (line === '-' || line === '') continue;
          if (line.toLowerCase().includes('dirección') || line.toLowerCase().includes('celular') || line.toLowerCase().includes('atentamente')) continue;
          const match = line.match(regex);
          if (match) {
            extractedData.items.push({
              originalName: match[4].trim().replace(/^-+/, '').trim(),
              quantity: parseFloat(match[1].replace(',', '.')),
              unit: match[2] ? match[2] : 'Unidad'
            });
          }
        }
      }
      
      // FALLBACK: If Gemini failed to extract metadata, use regex
      const lines = cleanedBodyText.split('\n');
      let addressStr = '';
      let addressFound = false;
      for (let line of lines) {
        line = line.trim();
        // Extract Phone
        if (line.match(/celular|tel[ée]fono/i)) {
          const phoneMatch = line.match(/(\d[\d\s-]{6,}\d)/);
          if (phoneMatch && !extractedData.phone) extractedData.phone = phoneMatch[1].replace(/\D/g, '');
        }
        // Extract NIT/CC
        if (line.match(/c\.c\.|nit/i)) {
          const nitMatch = line.match(/(\d[\d\.-]{5,}\d)/);
          if (nitMatch && !extractedData.nit) extractedData.nit = nitMatch[1].replace(/\D/g, '');
        }
        // Extract Address
        if (addressFound && line !== '') {
          if (line.match(/celular|tel[ée]fono|c\.c\.|nit|atentamente|gracias|agradezco|quedo|favor|confirmar|disponibilidad|productos|valor|total|pedido|saludo/i)) {
            addressFound = false;
          } else if (addressStr.length < 120) {
            addressStr += (addressStr ? ', ' : '') + line;
          }
        }
        if (line.match(/direcci[óo]n/i)) {
          addressFound = true;
          const inLine = line.replace(/.*direcci[óo]n.*?:/i, '').replace(/\*/g, '').trim();
          if (inLine) addressStr = inLine;
        }
      }
      if (addressStr && !extractedData.address) extractedData.address = addressStr;

      // Fallback for client name extraction from signature lines above C.C./NIT/Celular
      const lowerClientName = String(extractedData.clientInDocument || '').toLowerCase().trim();
      const isBlacklistedName = !lowerClientName || 
        lowerClientName === 'desconocido' || 
        lowerClientName === 'no detectado' || 
        lowerClientName === 'none' || 
        lowerClientName === 'no especificado' || 
        lowerClientName === 'no especificada' ||
        lowerClientName.includes('bogota') ||
        lowerClientName.includes('colombia') ||
        lowerClientName.includes('atentamente') ||
        lowerClientName.includes('cordialmente');

      if (isBlacklistedName) {
        let nameCandidate = '';
        const signatureLines = cleanedBodyText.split('\n');
        for (let k = 0; k < signatureLines.length; k++) {
          const line = signatureLines[k].trim();
          if (line.match(/c\.c\.|nit|celular|tel[ée]fono/i)) {
            // Look up to 3 lines above to find the name
            for (let prevIdx = k - 1; prevIdx >= Math.max(0, k - 3); prevIdx--) {
              const prevLine = signatureLines[prevIdx].trim().replace(/\*/g, '');
              if (
                prevLine !== '' && 
                prevLine.length > 3 && 
                prevLine.length < 50 &&
                !prevLine.match(/direcci[óo]n|correo|email|pedido|tomate|papa|cebolla|zanahoria|gracias|atentamente|saludos|cordialmente|bogota|colombia/i) &&
                !prevLine.includes(':') &&
                !prevLine.includes('/') &&
                prevLine.match(/[a-zA-ZñÑáéíóúÁÉÍÓÚ]/)
              ) {
                nameCandidate = prevLine;
                break;
              }
            }
          }
          if (nameCandidate) break;
        }
        if (nameCandidate) {
          extractedData.clientInDocument = nameCandidate;
        }
      }
    }

    // 3. Identify Client in our database (we prioritize matching by NIT/CC if extracted from the email)
    let candidateProfiles: any[] = [];
    let cleanExtractedNit = '';
    
    if (extractedData.nit) {
      cleanExtractedNit = String(extractedData.nit).replace(/\D/g, '');
    }

    if (cleanExtractedNit) {
      console.log(`[Email Ingest] Extracted NIT: "${extractedData.nit}". Searching by NIT digits: "${cleanExtractedNit}"`);
      // Build possible NIT variants to query (e.g. 900.123.456-1, 9001234561, 900123456, 12.345.678)
      const nitQueries = [extractedData.nit, cleanExtractedNit];
      
      if (cleanExtractedNit.length === 10) {
        nitQueries.push(`${cleanExtractedNit.substring(0, 3)}.${cleanExtractedNit.substring(3, 6)}.${cleanExtractedNit.substring(6, 9)}-${cleanExtractedNit.substring(9)}`);
      }
      if (cleanExtractedNit.length === 9) {
        nitQueries.push(`${cleanExtractedNit.substring(0, 3)}.${cleanExtractedNit.substring(3, 6)}.${cleanExtractedNit.substring(6, 9)}`);
      }
      if (cleanExtractedNit.length === 8) {
        nitQueries.push(`${cleanExtractedNit.substring(0, 2)}.${cleanExtractedNit.substring(2, 5)}.${cleanExtractedNit.substring(5, 8)}`);
      }
      
      const uniqueNits = Array.from(new Set(nitQueries.filter(Boolean)));
      
      const { data: profilesByNit, error: nitError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, role, is_active, address, phone, nit')
        .in('nit', uniqueNits);

      if (nitError) {
        console.error('[Email Ingest] Error querying profiles by NIT:', nitError);
      } else if (profilesByNit && profilesByNit.length > 0) {
        console.log(`[Email Ingest] Found ${profilesByNit.length} profiles matching NIT.`);
        candidateProfiles = profilesByNit;
      } else {
        console.log('[Email Ingest] No profile found matching NIT in DB. Treating as a NEW client.');
      }
    }

    // Try searching by phone number (clean digits match) if no profile was matched by NIT
    let cleanExtractedPhone = '';
    if (extractedData.phone) {
      cleanExtractedPhone = String(extractedData.phone).replace(/\D/g, '');
    }

    if (candidateProfiles.length === 0 && cleanExtractedPhone && cleanExtractedPhone.length >= 7) {
      console.log(`[Email Ingest] Searching client by phone: ${cleanExtractedPhone}`);
      const { data: profilesByPhone, error: phoneError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, role, is_active, address, phone, nit');

      if (phoneError) {
        console.error('[Email Ingest] Error listing profiles for phone matching:', phoneError);
      } else if (profilesByPhone) {
        // Match if the db phone contains the extracted phone or vice-versa
        const matched = profilesByPhone.filter(p => {
          const dbPhoneClean = String(p.phone || '').replace(/\D/g, '');
          return dbPhoneClean && (dbPhoneClean.includes(cleanExtractedPhone) || cleanExtractedPhone.includes(dbPhoneClean));
        });
        if (matched.length > 0) {
          console.log(`[Email Ingest] Found ${matched.length} profiles matching phone number.`);
          candidateProfiles = matched;
        }
      }
    }

    // Only if we haven't found any profiles by NIT or Phone, search by sender email address
    if (candidateProfiles.length === 0) {
      console.log(`[Email Ingest] Searching client by sender email: ${senderEmail}`);
      const { data: profilesByEmail, error: emailError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, role, is_active, address, phone, nit')
        .eq('email', senderEmail);

      if (emailError) {
        console.error('[Email Ingest] Error querying profiles by email:', emailError);
      } else if (profilesByEmail && profilesByEmail.length > 0) {
        candidateProfiles = profilesByEmail;
      }
    }

    // If still no profile found, try a global fuzzy name match search against the whole database
    let detectedNameForFuzzy = extractedData.clientInDocument || '';
    if (typeof detectedNameForFuzzy !== 'string') {
      detectedNameForFuzzy = String(detectedNameForFuzzy);
    }
    detectedNameForFuzzy = detectedNameForFuzzy.trim();

    if (candidateProfiles.length === 0 && detectedNameForFuzzy && detectedNameForFuzzy.length > 3) {
      console.log(`[Email Ingest] Attempting global fuzzy name match for: "${detectedNameForFuzzy}"`);
      const { data: allProfiles, error: allProfilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, role, is_active, address, phone, nit');
      
      if (!allProfilesError && allProfiles) {
        const namesMatch = (detName: string, profName: string): boolean => {
          if (!detName || !profName) return false;
          const norm1 = detName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          const norm2 = profName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          
          const words1 = norm1.split(/\s+/).filter(w => w.length > 2);
          const words2 = norm2.split(/\s+/).filter(w => w.length > 2);
          
          return words1.some(w => words2.includes(w));
        };

        const matched = allProfiles.filter(p => 
          namesMatch(detectedNameForFuzzy, p.contact_name || '') || namesMatch(detectedNameForFuzzy, p.company_name || '')
        );

        if (matched.length > 0) {
          console.log(`[Email Ingest] Found ${matched.length} profiles via global fuzzy name search.`);
          candidateProfiles = matched;
        }
      }
    }

    if (candidateProfiles && candidateProfiles.length > 0) {
      let detectedName = extractedData.clientInDocument || '';
      if (typeof detectedName !== 'string') {
        detectedName = String(detectedName);
      }
      
      const namesMatch = (detName: string, profName: string): boolean => {
        if (!detName || !profName) return false;
        const norm1 = detName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const norm2 = profName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        
        const words1 = norm1.split(/\s+/).filter(w => w.length > 2);
        const words2 = norm2.split(/\s+/).filter(w => w.length > 2);
        
        return words1.some(w => words2.includes(w));
      };

      if (candidateProfiles.length === 1) {
        const candidate = candidateProfiles[0];
        if (candidate.role === 'b2b_client') {
          profile = candidate;
        } else {
          if (!detectedName || namesMatch(detectedName, candidate.contact_name || '') || namesMatch(detectedName, candidate.company_name || '')) {
            profile = candidate;
          }
        }
      } else {
        // Multiple profiles found (e.g. sharing testing email higuera200@gmail.com)
        // We MUST find the one that matches the client name extracted from the email/document
        const exactOrSimilarMatch = candidateProfiles.find(p => 
          namesMatch(detectedName, p.contact_name || '') || namesMatch(detectedName, p.company_name || '')
        );
        if (exactOrSimilarMatch) {
          profile = exactOrSimilarMatch;
          console.log(`[Email Ingest] Matched specific profile by name: "${profile.company_name}"`);
        } else {
          // If no names match, fall back to a B2B client candidate
          const b2bCandidate = candidateProfiles.find(p => p.role === 'b2b_client');
          if (b2bCandidate) {
            profile = b2bCandidate;
            console.log(`[Email Ingest] No name matched detected "${detectedName}". Falling back to B2B candidate: "${profile.company_name}"`);
          } else {
            // Fallback to the first one
            profile = candidateProfiles[0];
            console.log(`[Email Ingest] No B2B candidate. Falling back to first candidate: "${profile.company_name}"`);
          }
        }
      }
    }

    const addrVal = extractedData.address;
    const addressDetected = !!(addrVal && 
      addrVal.toLowerCase() !== 'no detectado' && 
      addrVal.toLowerCase() !== 'no detectada' && 
      addrVal.toLowerCase() !== 'null' && 
      addrVal.toLowerCase() !== 'vacio' && 
      addrVal.trim() !== '');

    if (profile) {
      if (!extractedData.address && profile.address) {
        extractedData.address = profile.address;
      }
      if (!extractedData.phone && profile.phone) {
        extractedData.phone = profile.phone;
      }
    }

    // 4. Determine client type (B2B vs B2C) based on rules & AI extraction
    let clientType = 'b2c_client';
    if (profile && (profile.role === 'b2b_client' || profile.role === 'b2c_client')) {
      clientType = profile.role;
    } else {
      const nitClean = extractedData.nit ? String(extractedData.nit).replace(/\D/g, '') : '';
      const clientNameLower = String(extractedData.clientInDocument || '').toLowerCase();
      const hasBusinessKeywords = [
        'sas', 's.a.', 's.a.s', 'ltda', 'comercializadora', 'distribuidora', 'inversiones', 
        'restaurante', 'cafe', 'cafeteria', 'hotel', 'hostel', 'grupo', 'cooperativa', 
        'fruver', 'supermercado', 'tienda', 'minimarket', 'negocio'
      ].some(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b|${keyword}`, 'i');
        return regex.test(clientNameLower);
      });
      const startsWith8Or9 = nitClean.startsWith('8') || nitClean.startsWith('9');

      if (startsWith8Or9 || hasBusinessKeywords) {
        clientType = 'b2b_client';
      } else if (extractedData.clientType === 'b2b_client' || extractedData.clientType === 'b2c_client') {
        clientType = extractedData.clientType;
      }
    }

    // Normalize and/or assume delivery slot based on metadata or email content
    let finalDeliverySlot = extractedData.deliverySlot || null;
    if (finalDeliverySlot) {
      const lowerSlot = finalDeliverySlot.toString().toLowerCase().trim();
      if (lowerSlot.includes('am') || lowerSlot.includes('mañana') || lowerSlot.includes('morning') || lowerSlot.includes('mñn') || lowerSlot.includes('7:00') || lowerSlot.includes('7:30') || lowerSlot.includes('8:00') || lowerSlot.includes('11:00') || lowerSlot.includes('11:50')) {
        finalDeliverySlot = 'AM';
      } else if (lowerSlot.includes('pm') || lowerSlot.includes('tarde') || lowerSlot.includes('afternoon') || lowerSlot.includes('12:') || lowerSlot.includes('13:') || lowerSlot.includes('14:') || lowerSlot.includes('15:') || lowerSlot.includes('16:') || lowerSlot.includes('17:')) {
        finalDeliverySlot = 'PM';
      } else if (lowerSlot.includes('cualquier') || lowerSlot.includes('todo') || lowerSlot.includes('any') || lowerSlot.includes('all')) {
        finalDeliverySlot = 'Cualquier hora';
      } else {
        if (finalDeliverySlot !== 'AM' && finalDeliverySlot !== 'PM' && finalDeliverySlot !== 'Cualquier hora') {
          finalDeliverySlot = null;
        }
      }
    }
    
    if (!finalDeliverySlot && currentPlainText) {
      const bodyLower = currentPlainText.toLowerCase();
      const address = (extractedData.address || '').toLowerCase();
      const clientName = (extractedData.clientInDocument || '').toLowerCase();
      
      if (address.includes('athan') || clientName.includes('athan') || address.includes('bosques') || clientName.includes('bosques')) {
        finalDeliverySlot = 'Cualquier hora';
      } else if (address.includes('roma') || clientName.includes('roma') || address.includes('clínica') || clientName.includes('clínica')) {
        finalDeliverySlot = 'AM';
      } else {
        if (bodyLower.includes('7:00 a 11:00') || bodyLower.includes('7:00am a 11:00am') || bodyLower.includes('7:00 a.m. a 11:00 a.m.') || bodyLower.includes('7:00 a 11:00 de la mañana')) {
          finalDeliverySlot = 'AM';
        } else if (bodyLower.includes('7:00am a 04:00pm') || bodyLower.includes('7:00 am a 4:00 pm') || bodyLower.includes('7:00am a 4:00pm')) {
          finalDeliverySlot = 'Cualquier hora';
        } else if (bodyLower.includes('7:30am a 8:00am') || bodyLower.includes('11:00am a 11:50am')) {
          finalDeliverySlot = 'AM';
        } else if (bodyLower.includes('mañana') || bodyLower.includes('morning') || bodyLower.includes('am')) {
          finalDeliverySlot = 'AM';
        } else if (bodyLower.includes('tarde') || bodyLower.includes('pm')) {
          finalDeliverySlot = 'PM';
        }
      }
    }

    // Extract date from subject or body if present as fallback/override
    let targetDeliveryDate = extractedData.deliveryDate || null;
    if (subject) {
      const dateMatchSlash = subject.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})/);
      if (dateMatchSlash) {
        const day = dateMatchSlash[1];
        const month = dateMatchSlash[2];
        const year = dateMatchSlash[3];
        targetDeliveryDate = `${year}-${month}-${day}`;
      } else {
        const dateMatchDash = subject.match(/(\d{4})[\/-](\d{2})[\/-](\d{2})/);
        if (dateMatchDash) {
          targetDeliveryDate = `${dateMatchDash[1]}-${dateMatchDash[2]}-${dateMatchDash[3]}`;
        }
      }
    }

    // 5. Save draft to public.order_drafts
    // Use the predefined draftUuid so we can reference its short ID immediately
    const shortCode = `EML-${draftUuid.substring(0, 6).toUpperCase()}`;

    const { data: newDraft, error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .insert({
        id: draftUuid,
        profile_id: profile ? profile.id : null,
        client_detected_name: (extractedData.clientInDocument || profile?.company_name || 'Desconocido').replace(/\*/g, '').trim(),
        source_email: senderEmail,
        email_subject: `[${shortCode}] ${subject}`,
        email_body: currentPlainText,
        extracted_items: [
          { 
            isMetadata: true, 
            address: extractedData.address || null,
            addressDetected: addressDetected,
            deliverySlot: finalDeliverySlot,
            deliveryDate: targetDeliveryDate || null,
            phone: extractedData.phone || null,
            nit: extractedData.nit || null,
            clientType: clientType,
            attachmentUrl: attachmentUrl || null,
            attachmentName: attachmentName || null
          },
          ...(Array.isArray(extractedData.items) ? extractedData.items.map((itm: any) => {
            const nameLower = String(itm.originalName || itm.name || '').toLowerCase();
            let quantity = itm.quantity;
            let observations = itm.observations || '';
            
            // Si el nombre original contiene la palabra 'libra' o 'libras' o 'lb'
            if (nameLower.includes('libra') || nameLower.includes('lb')) {
              // Si la unidad detectada en base de datos es Kg, 1 libra = 0.5 Kg.
              // Indicamos en las observaciones que se solicitó en libras
              if (!observations.toLowerCase().includes('libra')) {
                observations = `Solicitado en Libras. ${observations}`.trim();
              }
              // Opcional: Podríamos convertir la cantidad a Kg (ej: 1 libra = 0.5 Kg) si se asume Kg por defecto
              // Pero el frontend/sistema de equivalencias requiere saber la cantidad original y la unidad.
              // Agregamos un flag de unidad 'Lb' o similar al objeto del item
              return {
                ...itm,
                unit: 'Lb',
                observations: observations
              };
            }
            if (nameLower.includes('litro') || nameLower.includes('litros') || nameLower.includes(' l ') || nameLower.includes(' lt ') || nameLower.endsWith(' l') || nameLower.endsWith(' lt')) {
              if (!observations.toLowerCase().includes('litro')) {
                observations = `Solicitado en Litros. ${observations}`.trim();
              }
              return {
                ...itm,
                unit: 'Litro',
                observations: observations
              };
            }
            return itm;
          }) : [])
        ],
        status: 'pending'
      })
      .select()
      .single();

    if (draftError) {
      console.error('[Email Inbound] Error saving draft:', draftError);
      return NextResponse.json({ error: draftError.message }, { status: 500 });
    }

    console.log('[Email Inbound] Draft created successfully:', newDraft.id);
    supabaseAdmin.from('raw_emails').update({ status: 'success' }).eq('payload->>envelope->>from', fromField).then(()=>{}, ()=>{});

    // 4. Send confirmation email to the client using Nodemailer
    // DESACTIVADO: Ahora los correos se envían manualmente después de la revisión del operario
    if (false && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        // Dynamic import to avoid edge runtime issues if applicable, though this is a Node.js route
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });

        const today = new Date().toLocaleDateString('es-CO');
        
        // Cargar memoria de alias de productos
        const { data: aliasRecord } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', 'ai_product_aliases')
          .maybeSingle();

        let aliases: Record<string, string> = {};
        if (aliasRecord?.value) {
          try {
            aliases = typeof aliasRecord.value === 'string' ? JSON.parse(aliasRecord.value) : aliasRecord.value;
          } catch (e) {
            console.error('[Email Inbound] Failed to parse aliases:', e);
          }
        }

        // Fetch active products once for in-memory smart matching
        let dbProducts: any[] = [];
        try {
          const { data: productsData } = await supabaseAdmin
            .from('products')
            .select('id, name, base_price, unit_of_measure')
            .eq('is_active', true);
          if (productsData) dbProducts = productsData;
        } catch (e) {
          console.error('[Email Inbound] Failed to fetch active products:', e);
        }

        // Formateador local de moneda (separador de miles con punto)
        const formatMoneyLocal = (num: number): string => {
          if (num === null || num === undefined || isNaN(num)) return '$0';
          const parts = Math.round(num).toFixed(0).split('.');
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
          return `$${parts.join(',')}`;
        };

        // Build items HTML and calculate total
        let itemsHtml = '';
        let totalOrderAmount = 0;
        let hasPendingPrices = false;
        const items = extractedData.items || [];
        
        for (const item of items) {
          let price = 0;
          let unit = '';
          const qty = item.quantity || 1;
          const searchName = item.originalName || item.name || '';
          
          if (searchName) {
            const cleanSearch = searchName.toLowerCase().trim();
            const aliasProductId = aliases[cleanSearch];
            let matchedProduct = null;

            if (aliasProductId) {
              matchedProduct = dbProducts.find(p => p.id === aliasProductId);
            }

            if (!matchedProduct) {
              const cleanText = (txt: string) => {
                return txt
                  .toLowerCase()
                  .normalize("NFD")
                  .replace(/[\u0300-\u036f]/g, "")
                  .replace(/[^a-z0-9\s]/g, "")
                  .trim();
              };

              const originalClean = cleanText(searchName);
              const originalWords = originalClean.split(/\s+/).filter(w => w.length > 1);

              let bestMatch: any = null;
              let highestScore = -999;

              for (const p of dbProducts) {
                const productClean = cleanText(p.name);
                
                if (productClean === originalClean) {
                  bestMatch = p;
                  highestScore = 9999;
                  break;
                }

                const productWords = productClean.split(/\s+/).filter(w => w.length > 1);
                const sharedWords = originalWords.filter(w => productWords.includes(w));
                
                if (sharedWords.length > 0) {
                  const extraWords = Math.abs(productWords.length - sharedWords.length);
                  const score = sharedWords.length * 10 - extraWords;
                  if (score > highestScore) {
                    highestScore = score;
                    bestMatch = p;
                  }
                }
              }

              // Exigir una puntuación mínima o coincidencia real para evitar mapeos erróneos (ej. "tipo" que asocie Ladrillos y Tomate Cherry)
              const hasOnlyGenericSharedWords = originalWords.filter(w => {
                const productClean = cleanText(bestMatch?.name || '');
                return productClean.split(/\s+/).includes(w);
              }).every(w => ['tipo', 'de', 'con', 'para', 'el', 'la', 'los', 'las', 'un', 'una', 'en'].includes(w));

              if (highestScore < 8 || hasOnlyGenericSharedWords) {
                bestMatch = null;
              }

              if (!bestMatch) {
                if (originalClean.length >= 3 && !['tipo', 'para', 'con'].includes(originalClean)) {
                  bestMatch = dbProducts.find((p: any) => {
                    const productClean = cleanText(p.name);
                    return productClean.includes(originalClean) || originalClean.includes(productClean);
                  });
                }
              }

              matchedProduct = bestMatch;
            }

            if (matchedProduct) {
              price = matchedProduct.base_price || 0;
              unit = matchedProduct.unit_of_measure || '';
            }
          }
          
          const lineTotal = price * qty;
          totalOrderAmount += lineTotal;
          
          let lineTotalDisplay = '';
          if (price > 0) {
            lineTotalDisplay = formatMoneyLocal(lineTotal);
          } else {
            lineTotalDisplay = 'Por confirmar';
            hasPendingPrices = true;
          }

          const productNameDisplay = `${searchName || 'Producto'}${unit ? ` (${unit})` : ''}`;

          itemsHtml += `
            <tr style="border-bottom: 1px solid #E5E7EB;">
                <td style="padding: 12px 0; color: #111827; font-family: sans-serif; font-size: 14px;">${productNameDisplay}</td>
                <td style="padding: 12px 0; text-align: center; color: #4B5563; font-family: sans-serif; font-size: 14px; font-weight: bold;">${qty}</td>
                <td style="padding: 12px 0; text-align: right; color: #111827; font-family: sans-serif; font-size: 14px; font-weight: bold;">${lineTotalDisplay}</td>
            </tr>
          `;
        }
        
        let totalOrderDisplay = '';
        if (totalOrderAmount > 0) {
          totalOrderDisplay = `Total Aprox: ${formatMoneyLocal(totalOrderAmount)}`;
          if (hasPendingPrices) {
             totalOrderDisplay += ' <span style="font-size: 11px; color: #6B7280; font-weight: normal;">(+ Ítems por confirmar)</span>';
          }
        } else {
          totalOrderDisplay = 'Total: A confirmar en despacho';
        }

        let extractedClientName = extractedData.clientInDocument || '';
        const lowerName = extractedClientName.toLowerCase();
        if (lowerName.includes('no detectado') || lowerName.includes('desconocido') || lowerName.includes('no especificado') || lowerName.includes('none')) {
            extractedClientName = '';
        }
        
        const clientName = extractedClientName || profile?.company_name || profile?.contact_name || '';
        const draftIdStr = shortCode;

        const emailHtml = `
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..900&display=swap" rel="stylesheet">
<div style="font-family: 'Playfair Display', Georgia, serif; color: #286a36; padding: 40px; background-color: #ffffff; max-width: 600px; margin: auto;">
    <center>
        <img src="https://frufresco-liard.vercel.app/logo-investments.png" width="150" style="margin-bottom: 20px;" alt="Investments Cortés Logo">
        <h1 style="color: #286a36; font-size: 28px; margin-bottom: 10px;">¡Gracias por tu compra${clientName ? `, ${clientName}` : ''}!</h1>
        <p style="font-size: 16px; color: #555; margin-top: 0;">Hemos recibido tu pedido con éxito y ya está en preparación.</p>
    </center>
    
    <div style="background: white; padding: 30px; border-radius: 15px; margin-top: 30px; border-left: 5px solid #1f9040; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
        <h3 style="color: #286a36; margin-top: 0; font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Resumen del Pedido #${draftIdStr}</h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 20px;"><b>Fecha:</b> ${today}</p>
        
        <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
            <thead>
                <tr style="border-bottom: 2px solid #286a36; color: #286a36; text-align: left;">
                    <th style="padding: 10px 5px; font-weight: bold;">Producto</th>
                    <th style="padding: 10px 5px; font-weight: bold; text-align: center;">Cant.</th>
                    <th style="padding: 10px 5px; font-weight: bold; text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        
        <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #286a36; text-align: right;">
            <p style="font-size: 16px; color: #286a36; margin: 0; font-weight: 800;">
                <span>${totalOrderDisplay}</span>
            </p>
        </div>
    </div>

    <p style="margin-top: 30px; text-align: center; color: #666; font-size: 14px;">
        Te enviaremos otra notificación cuando tu pedido esté en camino.<br>
        Si tienes alguna duda o deseas realizar cambios, puedes responder a este correo.
    </p>
    
    <hr style="border: 0; border-top: 1px solid #1f9040; margin: 40px 0;">
    
    <center>
        <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Investments Cortés SAS • Del Campo a tu Negocio</p>
    </center>
</div>
        `;

        // Respuesta automática deshabilitada. Ahora se envía manualmente desde la interfaz cuando el administrador lo decida.
        console.log('[Email Inbound] Automatic confirmation email is disabled. Admin will send manual receipt acknowledgment.');

      } catch (emailError) {
        console.error('[Email Inbound] Failed to send confirmation email:', emailError);
      }
    } else {
      console.log('[Email Inbound] SMTP credentials not set, skipping confirmation email.');
    }

    return NextResponse.json({ success: true, draftId: newDraft.id });

  } catch (err: any) {
    console.error('[Email Inbound] Ingest error:', err);
    supabaseAdmin.from('raw_emails').update({ status: 'error', error_message: err?.message || 'Error' }).eq('status', 'pending').then(()=>{}, ()=>{});
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
