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
      ]
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
  
  // 1. Webhook Security: Check for secret in URL search params
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get('secret');
  if (process.env.WEBHOOK_SECRET && secret !== process.env.WEBHOOK_SECRET) {
    console.error('[Email Inbound] Unauthorized access attempt. Invalid secret.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rawPayloadStr = '';
  try {
    rawPayloadStr = await req.text();
    const payload = JSON.parse(rawPayloadStr);

    // Intentamos guardar en la Dead Letter Queue (raw_emails) de forma asíncrona
    // Si la tabla no existe aún, simplemente ignoramos el error.
    supabaseAdmin.from('raw_emails').insert([{ payload, status: 'pending' }]).then(() => {}).catch(() => {});


    // CloudMailin structures payload containing headers, envelope, plain, html, attachments
    const headers = payload.headers || {};
    const envelope = payload.envelope || {};

    const fromField = headers.from || headers.From || envelope.from || '';
    const toField = headers.to || headers.To || envelope.to || '';
    const subject = headers.subject || headers.Subject || '';
    const plainText = payload.plain || '';
    const attachments = payload.attachments || [];
    
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
          // Recorrer TODAS las hojas del Excel
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            const validRows = rows.filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell !== ''));
            if (validRows.length > 0) {
              allRows = allRows.concat([[`--- HOJA: ${sheetName} ---`]], validRows);
            }
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
        
        CONTEXTO ADICIONAL (Texto del cuerpo del correo enviado por el cliente):
        """
        ${currentPlainText}
        """
        
        TAREA:
        1. Analiza el documento adjunto (puede ser una imagen de WhatsApp, foto de pedido, PDF) para extraer la lista de productos solicitados.
        2. Identifica el nombre o empresa del CLIENTE, dirección de entrega física, número de teléfono, cédula/NIT y jornada preferida de entrega combinando el análisis del documento adjunto y del cuerpo del correo electrónico anterior.
           REGLA DE DIRECCIÓN: Extrae ÚNICAMENTE la dirección de entrega física si está explícita en el documento. Si el documento dice "DIRECCION: 0" o no especifica una dirección clara, devuelve null o vacío. NO deduzcas, asumas ni inventes direcciones a partir del nombre del cliente o siglas. Si no está escrita textualmente, no la pongas. Bajo ninguna circunstancia incluyas texto de la firma, despedidas, o notas sobre el horario de entrega en el campo "address".
        3. Identifica la franja u horario de entrega. Si en el correo o documento se indica un horario o franja horaria de entrega, debes asumir la jornada correspondiente:
           - Si el horario está en el rango de la mañana (ej. "7:00 a 11:00 am", "7:30 a 11:50 am", "mañana", "7:00am a 12:00pm"), asume "AM".
           - Si el horario está en el rango de la tarde (ej. "1:00 pm a 5:00 pm", "tarde", "12:00pm a 6:00pm"), asume "PM".
           - Si el horario cubre tanto mañana como tarde (ej. "7:00 am a 4:00 pm", "todo el día", "cualquier hora"), asume "Cualquier hora".
           - Si se listan horarios por sede (ej. "Bosques de Athan: 7am a 4pm", "Clínica Roma: 7:30am a 11:50am"), intenta deducir cuál aplica basándote en el nombre o dirección del cliente. Si no se puede deducir o es el horario general (ej. "horario de recibo es de 7:00 a 11:00"), asume la jornada del horario general o la que corresponda (ej. "7:00 a 11:00 de la mañana" -> "AM").
           - Si no hay información de horario, pon null.
           - El campo "deliverySlot" debe ser estrictamente uno de los siguientes valores: "AM", "PM", "Cualquier hora", o null.
        4. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial. Usa "b2c_client" si es un cliente individual/hogar (persona natural que compra para su casa).
        5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD" usando la fecha actual del sistema como referencia (si dice "mañana", suma un día a la fecha actual). Si no la especifica, pon null.
        6. Extrae todos los productos solicitados y su cantidad numérica.
             - Identifica dinámicamente qué columna contiene la "CANTIDAD PEDIDA" o "CANTIDAD TOTAL". No asumas que siempre es la tercera columna.
             - Si la cabecera (título) de la columna de cantidades está vacía o es nula en el documento/tabla, pero claramente contiene los valores totales numéricos del pedido, asume que esa es la columna correcta y extrae las cantidades de ahí.
             - Evita extraer Códigos de Barras o códigos PLU como si fueran cantidades.
             - Si la tabla incluye una columna de CANTIDAD TOTAL y luego columnas adicionales que desglosan esa cantidad por sedes, usa ÚNICAMENTE la CANTIDAD TOTAL. Ignora los desgloses para no duplicar las cantidades.
             - Asegúrate de extraer la cantidad pedida correcta que aparece junto al nombre del producto.
             - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
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
            { "originalName": "Nombre del Producto", "quantity": 10, "observations": "Cualquier nota u observación específica del producto o null" }
          ]
        }
      `;

      if (!isExcel) {
        try {
          let text = await fetchGemini(apiKey, prompt, base64Data, mimeType, { responseMimeType: 'application/json' });
          let jsonText = text.replace(/^```json/, '').replace(/```$/, '').trim();
          let parsed = JSON.parse(jsonText);
          extractedData = parsed;
          
          supabaseAdmin.from('raw_emails').update({ status: 'success' }).eq('payload->>envelope->>from', fromField).then(() => {}).catch(() => {});
          
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
        currentPlainText = currentPlainText + "\n\nCONTENIDO DEL ARCHIVO ADJUNTO EXCEL/CSV:\n" + excelTextContext;
      }
    }
    
    if (attachments.length === 0 || isExcel) {
      const prompt = `
        Eres un asistente de logística para FruFresco.
        FECHA ACTUAL DEL SISTEMA: ${new Date().toISOString().split('T')[0]}
        Analiza este cuerpo de correo electrónico que contiene una solicitud de pedido.
        
        CORREO ELECTRÓNICO:
        ${currentPlainText}
        
        TAREA:
        1. Identifica el nombre o empresa del CLIENTE.
        2. Extrae productos y cantidades. IGNORA cantidades de 0 o vacías. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
        3. Extrae dirección de entrega de forma limpia.
        4. Identifica la franja u horario: AM, PM, Cualquier hora, o null.
        5. Extrae fecha de entrega "deliveryDate" (YYYY-MM-DD).
        6. Clasifica "clientType": "b2b_client" o "b2c_client".
        7. Extrae observaciones en "observations".
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro.
        - Las cantidades deben ser numéricas.
        - El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos.
        
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
            { "originalName": "Tomate Chonto", "quantity": 15, "observations": "Cualquier nota u observación específica del producto o null" }
          ]
        }
      `;

      try {
        let text = await fetchGemini(apiKey, prompt, null, null, { responseMimeType: 'application/json' });
        let jsonText = text.replace(/^```json/, '').replace(/```$/, '').trim();
        extractedData = JSON.parse(jsonText);
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
    }

    let candidateProfiles: any[] = [];
    let cleanExtractedNit = extractedData.nit ? String(extractedData.nit).replace(/\D/g, '') : '';
    
    if (cleanExtractedNit) {
      const { data: profilesByNit } = await supabaseAdmin.from('profiles').select('id, company_name, contact_name, role, is_active, address, phone, nit').eq('nit', cleanExtractedNit);
      if (profilesByNit && profilesByNit.length > 0) candidateProfiles = profilesByNit;
    }

    if (candidateProfiles.length === 0 && !cleanExtractedNit) {
      const { data: profilesByEmail } = await supabaseAdmin.from('profiles').select('id, company_name, contact_name, role, is_active, address, phone, nit').eq('email', senderEmail);
      if (profilesByEmail && profilesByEmail.length > 0) candidateProfiles = profilesByEmail;
    }

    if (candidateProfiles.length > 0) profile = candidateProfiles[0];

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
            deliverySlot: extractedData.deliverySlot || null,
            deliveryDate: extractedData.deliveryDate || null,
            phone: extractedData.phone || null,
            nit: extractedData.nit || null,
            clientType: extractedData.clientType || 'b2c_client',
            attachmentUrl: attachmentUrl || null,
            attachmentName: attachmentName || null
          },
          ...(Array.isArray(extractedData.items) ? extractedData.items : [])
        ],
        status: 'pending'
      })
      .select()
      .single();

    if (draftError) throw draftError;

    return NextResponse.json({ success: true, draftId: newDraft.id });

  } catch (error: any) {
    console.error('[Email Inbound] Fallo general en el procesamiento:', error);
    supabaseAdmin.from('raw_emails')
      .update({ status: 'error', error_message: error?.message || 'Error desconocido' })
      .eq('status', 'pending')
      .then(() => {}).catch(() => {});

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
