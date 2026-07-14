import { NextResponse, after } from 'next/server';
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

async function fetchGemini(apiKey: string, prompt: string, base64Image?: string, mimeType?: string): Promise<string> {
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-1.5-flash-latest'];
  let lastError: any = null;
  for (const model of models) {
    try {
      return await new Promise<string>((resolve, reject) => {
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
          path: `/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
    } catch (err: any) {
      console.warn(`[Gemini Inbound Ingest] Model ${model} failed, trying fallback. Error:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error("All Gemini models failed");
}

export const maxDuration = 60; // Increase Vercel timeout to 60s for Gemini
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Raise body size limit to 20 MB so emails with large PDF/Excel attachments
// are not rejected by the Next.js body parser (default is 1 MB).
// Without this Cloudmailin receives a 413 / "exceeded max size" error and
// bounces the email back to the original sender.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

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

      // Save email immediately to the 'order_drafts' table to ensure we have a record
      // Using extracted_items JSONB column to store the raw payload for debugging
      const { data: mailRecord, error: mailErr } = await supabaseAdmin
        .from('order_drafts')
        .insert([{
          email_subject: '[RAW_WEBHOOK] ' + (payload.headers?.subject || payload.headers?.Subject || 'Sin Asunto'),
          source_email: payload.headers?.from || payload.headers?.From || payload.envelope?.from || 'desconocido',
          status: 'pending',
          extracted_items: { debug_payload: payload }
        }])
        .select()
        .single();

      if (mailErr) {
        console.error('[Email Inbound] Error saving raw mail payload to drafts:', mailErr);
      }

      // 2. KICK OFF ASYNCHRONOUS PROCESSING
      // We process the email parsing, Gemini extraction, attachments and drafts in the background.
      // This immediately returns 200 OK to CloudMailin to prevent Vercel Function Invocation timeouts.
      const processMailAsync = async () => {
        const mailId = mailRecord?.id;
        console.log(`[Email Inbound] Asynchronously processing mail record: ${mailId}`);

        try {
          const headers = payload.headers || {};
          const envelope = payload.envelope || {};

          const fromField = headers.from || headers.From || envelope.from || '';
          const toField = headers.to || headers.To || envelope.to || '';
          const subject = headers.subject || headers.Subject || '';
          const plainText = payload.plain || '';
          const htmlText = payload.html || '';
          let attachments = payload.attachments || [];
          
          // Filter out tiny signature images (typically inline images with cid or very small size)
          attachments = attachments.filter((att: any) => {
            if (!att.content) return false;
            const lowerName = (att.file_name || att.filename || '').toLowerCase();
            const mimeType = (att.content_type || '').toLowerCase();
            const isImage = mimeType.startsWith('image/') || lowerName.endsWith('.png') || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg') || lowerName.endsWith('.webp');
            
            // Base64 size estimation
            const sizeInKB = att.content.length / 1.33 / 1024;
            const isInline = !!(att.content_id || att.cid || (att.disposition && att.disposition.toLowerCase() === 'inline'));
            
            if (isImage) {
              if ((sizeInKB < 60 && isInline) || sizeInKB < 15) {
                console.log(`[Email Inbound] Ignorando adjunto de imagen pequeño/firma: ${lowerName} (${Math.round(sizeInKB)}KB, inline: ${isInline})`);
                return false;
              }
            }
            return true;
          });
          
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
            if (mailId) {
              await supabaseAdmin.from('mail').update({ status: 'ignored' }).eq('id', mailId);
            }
            return;
          }

          // Determine if the email was sent to our corporate email address (which is normal for orders)
          let recipientEmail = toField;
          const matchTo = toField.match(/<([^>]+)>/);
          if (matchTo) {
            recipientEmail = matchTo[1];
          }
          recipientEmail = recipientEmail.trim().toLowerCase();

          // --- INICIO ENRUTAMIENTO DINÁMICO ---
          let inboxOrders = 'pedidos@frufresco.com';
          let inboxCommercial = 'contacto@investmentscortes.com';
          try {
            const { data: dbSettings } = await supabaseAdmin
              .from('app_settings')
              .select('key, value')
              .in('key', ['inbox_email_orders', 'inbox_email_commercial']);

            if (dbSettings) {
              const ordersSetting = dbSettings.find((s: any) => s.key === 'inbox_email_orders');
              const commSetting = dbSettings.find((s: any) => s.key === 'inbox_email_commercial');
              if (ordersSetting) inboxOrders = ordersSetting.value;
              if (commSetting) inboxCommercial = commSetting.value;
            }
          } catch (err: any) {
            console.error('[Email Inbound] Error querying app_settings for routing:', err.message);
          }

          const cleanInboxOrders = inboxOrders.toLowerCase().trim();
          const cleanInboxCommercial = inboxCommercial.toLowerCase().trim();

          // Check if matches Commercial Inbox address
          if (recipientEmail === cleanInboxCommercial) {
            console.log(`[Email Inbound] Route: COMMERCIAL inbox (${recipientEmail}). Skipping AI extraction.`);
            if (mailId) {
              await supabaseAdmin
                .from('mail')
                .update({ 
                  is_inbound: true,
                  inbox_type: 'commercial',
                  status: 'received',
                  to_email: recipientEmail,
                  sender_email: senderEmail,
                  message: { text: plainText, html: htmlText }
                })
                .eq('id', mailId);
            }
            return;
          }

          // Check if matches Orders Inbox address
          if (recipientEmail === cleanInboxOrders) {
            console.log(`[Email Inbound] Route: ORDERS inbox (${recipientEmail}). Running AI extraction.`);
            if (mailId) {
              await supabaseAdmin
                .from('mail')
                .update({ 
                  is_inbound: true,
                  inbox_type: 'orders',
                  to_email: recipientEmail,
                  sender_email: senderEmail
                })
                .eq('id', mailId);
            }
          }
          // --- FIN ENRUTAMIENTO DINÁMICO ---

          const isCorporateRecipient = corporateEmails.includes(recipientEmail) || recipientEmail.endsWith('@frufresco.com') || recipientEmail.endsWith('@frufresco.co');

          if (isCorporateSender && toField) {
            // Si el emisor es corporativo (frufrescodigital@gmail.com), se trata de un correo saliente
            // (ej. enviado con CCO a la plataforma). En este caso, el cliente es el destinatario (recipientEmail).
            
            // Si el destinatario también es corporativo, se aborta para evitar bucles.
            if (isCorporateRecipient) {
              console.log(`[Email Inbound] Ignorando correo corporativo interno de loop. De: ${senderEmail} Para: ${recipientEmail}`);
              if (mailId) {
                await supabaseAdmin.from('mail').update({ status: 'ignored' }).eq('id', mailId);
              }
              return;
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

    // 2. Parse email body or attachments with Gemini
    let uploadedAttachments: { name: string, url: string }[] = [];
    let parsedAttachments: any[] = [];

    if (attachments.length > 0) {
      // Define standard generic extraction prompt template
      const genericPrompt = `
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
        5. Extrae la fecha de entrega general solicitada en "deliveryDate" en formato "YYYY-MM-DD". Revisa muy atentamente tanto el ASUNTO DEL CORREO como el cuerpo/documento para encontrar indicaciones de fecha (ej. "Pedido para mañana", "Despacho 25/06/2026", "Entrega viernes", etc.). Usa la fecha actual del sistema como referencia. Si no se especifica ninguna fecha de entrega en el asunto ni en el cuerpo/documento, pon null.
        6. Extrae todos los productos solicitados y su cantidad numérica.
             - Identifica dinámicamente qué columna contiene la "CANTIDAD PEDIDA" o "CANTIDAD TOTAL". No asumas que siempre es la tercera columna.
             - Si la cabecera (título) de la columna de cantidades está vacía o es nula en el documento/tabla, pero claramente contiene los valores totales numéricos del pedido, asume que esa es la columna correcta y extrae las cantidades de ahí.
             - Evita extraer Códigos de Barras o códigos PLU como si fueran cantidades.
             - Si la tabla incluye una columna de CANTIDAD TOTAL y luego columnas adicionales que desglosan esa cantidad por sedes, usa ÚNICAMENTE la CANTIDAD TOTAL. Ignora los desgloses para no duplicar las cantidades.
             - Asegúrate de extraer la cantidad pedida correcta que aparece junto al nombre del producto.
             - CRÍTICO - FECHAS POR ÍTEM: Si el documento tiene:
                  (a) Una columna de fecha de entrega individual (ej. "F. Entrega", "Fecha Entrega", "Fecha", "Fecha de despacho"),
                  (b) Secciones o grupos de productos separados por encabezados que contienen fechas distintas (ej. una sección "Entrega 23/07/2026" seguida de productos, y otra sección "Entrega 25/07/2026" con más productos),
                  (c) O cualquier indicación de que cada producto tiene su propia fecha de entrega diferente a la global;
                ENTONCES debes OBLIGATORIAMENTE asignar la fecha específica de entrega de cada producto en el campo "deliveryDate" de ese ítem en formato "YYYY-MM-DD". PROPAGA la fecha de la sección/encabezado más cercano a cada ítem si no hay columna explícita.
                Si un ítem NO tiene fecha de entrega específica diferente a la general, coloca null en su "deliveryDate".
             - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
             - Extrae también la unidad de medida (ej. "Kg", "Lb", "Litro", etc.). Si el producto no tiene descripción de unidades en el texto del pedido (ej. "12 huevos", "1 lechuga crespa"), debes establecer obligatoriamente la unidad como "Unidad".
        7. Extrae las observaciones, notas o especificaciones de calidad del producto en el campo "observations".
           - REGLA CRÍTICA DE OBSERVACIONES: Las observaciones deben venir ÚNICAMENTE de anotaciones explícitas de calidad (por ejemplo: 'maduro', 'pintón', 'delgados').
           - NUNCA asumas que los textos que acompañan al nombre en la columna del producto (como "INSTITUCIONAL", "1000G", "KILO", "PAQ 1000 G") son observaciones o características. Esos textos pertenecen al nombre del producto, NO a observaciones. Si no hay una observación explícita y separada del producto, pon null.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código.
        - Las cantidades deben ser estrictamente numéricas (si dice "una libra", pon 1. Si no hay cantidad, asume 1).
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos. Incluso si está vacío, o si el usuario lista con guiones (-), extráelos como elementos del arreglo.

        REGLAS DE EXCLUSIÓN CRÍTICA DE PRODUCTOS:
        * NUNCA extraigas el nombre del cliente, dirección, teléfono, NIT, número de factura o cualquier información de la cabecera/pie de página como si fuera un producto.
        * Si detectas un texto que coincide con el nombre de la empresa (ej. "CLUB BELLAVISTA", "ADR WORK", etc.) y un valor numérico extremadamente grande al lado (ej. "7900405437", "800234123", etc. que claramente es un teléfono, NIT o código de barra), es información del cliente/documento, NO es un producto del pedido. Queda TERMINANTEMENTE PROHIBIDO incluirlo en la lista de 'items'.
        * Cualquier cantidad que sea mayor a 5000 (o que parezca un código numérico largo como un teléfono o NIT) debe ser ignorada como producto y NO debe incluirse en la lista de 'items'.
        
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
            { 
              "originalName": "Nombre del Producto", 
              "quantity": 10, 
              "unit": "Kg / Lb / Unidad / Litro / null", 
              "observations": "Cualquier nota u observación específica del producto o null",
              "deliveryDate": "YYYY-MM-DD o null"
            }
          ]
        }
      `;

      // Process ALL attachments in parallel (Storage upload + AI Parse)
      const attachmentPromises = attachments.map(async (attachment, i) => {
        const attFileName = attachment.file_name || attachment.filename || `adjunto_${i}.bin`;
        const base64Data = attachment.content;
        let mimeType = attachment.content_type || 'application/octet-stream';
        const lowerName = attFileName.toLowerCase();
        
        if (!attachment.content_type || attachment.content_type === 'application/octet-stream') {
          if (lowerName.endsWith('.pdf')) mimeType = 'application/pdf';
          else if (lowerName.endsWith('.png')) mimeType = 'image/png';
          else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
          else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
          else if (lowerName.endsWith('.xlsx')) mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          else if (lowerName.endsWith('.xls')) mimeType = 'application/vnd.ms-excel';
          else if (lowerName.endsWith('.csv')) mimeType = 'text/csv';
        }

        const lowerMime = mimeType.toLowerCase();
        const attIsExcel = lowerMime.includes('spreadsheet') || lowerMime.includes('excel') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');

        // A. Upload to Supabase Storage in parallel
        let publicUrl = '';
        try {
          try {
            await supabaseAdmin.storage.createBucket('order-attachments', { public: true });
          } catch (_) {}

          const buffer = Buffer.from(base64Data, 'base64');
          const sanitizedFilename = attFileName.replace(/[^a-zA-Z0-9.-]/g, '_');
          const storagePath = `${draftUuid}_${i}_${sanitizedFilename}`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from('order-attachments')
            .upload(storagePath, buffer, {
              contentType: mimeType,
              upsert: true
            });

          if (!uploadError) {
            const { data: { publicUrl: pUrl } } = supabaseAdmin.storage
              .from('order-attachments')
              .getPublicUrl(storagePath);
            publicUrl = pUrl;
            console.log(`[Email Inbound] Parallel attachment ${i} (${attFileName}) uploaded to Supabase: ${publicUrl}`);
          } else {
            console.error(`[Email Inbound] Failed parallel upload for attachment ${i}:`, uploadError);
          }
        } catch (uploadErr) {
          console.error(`[Email Inbound] Parallel storage upload handler crashed for attachment ${i}:`, uploadErr);
        }

        // B. Parse attachment text content if Excel, or call Gemini
        let attProgrammaticExcelItems: any[] = [];
        let attExcelTextContext = '';

        if (attIsExcel) {
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
            const aiRows = allRows.slice(0, 30);
            attExcelTextContext = JSON.stringify(aiRows);

            // ═══════════════════════════════════════════════════════════════
            // MOTOR INTELIGENTE DE PARSING DE EXCEL (Multi-Estrategia)
            // ═══════════════════════════════════════════════════════════════

            const isNumeric = (val: any): boolean => {
              if (val === null || val === undefined) return false;
              if (typeof val === 'number') return !isNaN(val);
              const str = String(val).trim().replace(',', '.');
              if (str === '') return false;
              return !isNaN(Number(str));
            };

            const parseNum = (val: any): number => {
              if (typeof val === 'number') return val;
              return parseFloat(String(val || '').trim().replace(',', '.'));
            };

            // Diccionario de sinónimos para cada tipo de columna (con puntaje)
            const NAME_SYNONYMS: [RegExp, number][] = [
              [/^prod(ucto|uct|uctos)?$/i, 10],  // producto, product, productos
              [/prod/i, 7],                        // prodcuto (typo), products, etc.
              [/^desc(ripci[oó]n)?$/i, 10],
              [/descrip/i, 7],
              [/^nombre$/i, 10],
              [/^item$/i, 9],
              [/^art[ií]culo$/i, 10],
              [/art[ií]cul/i, 7],
              [/^material$/i, 9],
              [/^detalle$/i, 9],
              [/^sku$/i, 8],
              [/^referencia$/i, 6],
              [/^concepto$/i, 7],
              [/^insumo/i, 8],
              [/^mercancia/i, 7],
              [/^fruta/i, 6],
              [/^verdura/i, 6],
              [/^bien$/i, 5],
            ];
            const QTY_SYNONYMS: [RegExp, number][] = [
              [/^can(t(idad)?)?$/i, 10],           // can, cant, cantidad
              [/^qty$/i, 10],
              [/^quantity$/i, 10],
              [/^unidades$/i, 8],
              [/^pedid[oa]?$/i, 8],
              [/^solicit/i, 7],
              [/^total$/i, 5],
              [/cant[\.\s]*(pedid|solicit|total)/i, 9],
              [/^vol(umen)?$/i, 6],
              [/^peso$/i, 6],
              [/^pedir$/i, 7],
              [/^orden$/i, 4],
              [/^demanda$/i, 5],
              [/^requerid/i, 7],
              [/^necesidad$/i, 5],
            ];
            // Negative patterns: columns that LOOK like qty but aren't
            const QTY_NEGATIVE: RegExp[] = [
              /medida/i, /presentaci[oó]n/i, /precio/i, /valor/i, /costo/i,
              /plu/i, /c[oó]digo/i, /barr?a/i, /ref(erencia)?$/i, /ean/i,
            ];
            const UNIT_SYNONYMS: [RegExp, number][] = [
              [/^unidad$/i, 10],
              [/^uom$/i, 10],
              [/^ubm$/i, 10],
              [/^medida$/i, 8],
              [/^unid\.?$/i, 9],
              [/^unit$/i, 10],
              [/^presentaci[oó]n$/i, 8],
              [/^um$/i, 7],
              [/^emp(aque)?$/i, 6],
            ];
            const OBS_SYNONYMS: [RegExp, number][] = [
              [/^obs(ervaci[oó]n(es)?)?$/i, 10],
              [/^notas?$/i, 9],
              [/^comentario/i, 8],
              [/^especificaci[oó]n/i, 7],
              [/^detalle$/i, 5],
              [/^instrucciones$/i, 6],
            ];
            // Columns to SKIP (never treat as name or quantity)
            const SKIP_COLUMNS: RegExp[] = [
              /^plu$/i, /^c[oó]digo/i, /^cod\.?$/i, /^ref\.?$/i, /^ean$/i,
              /^barr?a$/i, /^#$/i, /^no\.?$/i, /^n[uú]mero$/i, /^id$/i,
              /^precio/i, /^valor/i, /^costo/i, /^total/i, /^subtotal/i,
              /^iva/i, /^impuesto/i, /^descuento/i, /^\.t$/i, /^sede/i,
              /^sucursal/i, /^bodega/i, /^almac[eé]n$/i, /^lote$/i,
              /^fecha/i, /^f\.\s*entrega/i, /^entrega$/i, /^oc$/i,
            ];

            const scoreColumn = (val: string, synonyms: [RegExp, number][]): number => {
              let best = 0;
              for (const [regex, score] of synonyms) {
                if (regex.test(val)) best = Math.max(best, score);
              }
              return best;
            };

            const isSkipColumn = (val: string): boolean => {
              return SKIP_COLUMNS.some(rx => rx.test(val));
            };

            let headerRowIdx = -1, nameColIdx = -1, qtyColIdx = -1, unitColIdx = -1, obsColIdx = -1;

            // ─── ESTRATEGIA 1: Scoring por sinónimos de cabecera ───
            let bestHeaderScore = 0;
            for (let r = 0; r < Math.min(allRows.length, 30); r++) {
              const row = allRows[r];
              if (!row || !Array.isArray(row)) continue;

              let rNameIdx = -1, rQtyIdx = -1, rUnitIdx = -1, rObsIdx = -1;
              let rNameScore = 0, rQtyScore = 0;

              for (let c = 0; c < row.length; c++) {
                const raw = row[c];
                if (raw === null || raw === undefined) continue;
                const val = String(raw).toLowerCase().replace(/[*_\-\.#]/g, '').trim();
                if (!val || val.length > 40) continue;
                if (isSkipColumn(val)) continue;

                const ns = scoreColumn(val, NAME_SYNONYMS);
                const qs = scoreColumn(val, QTY_SYNONYMS);
                const us = scoreColumn(val, UNIT_SYNONYMS);
                const os = scoreColumn(val, OBS_SYNONYMS);

                // Check qty negative patterns
                const isQtyNeg = QTY_NEGATIVE.some(rx => rx.test(val));

                if (ns > rNameScore) { rNameIdx = c; rNameScore = ns; }
                if (qs > rQtyScore && !isQtyNeg) { rQtyIdx = c; rQtyScore = qs; }
                if (us > 0 && rUnitIdx === -1) rUnitIdx = c;
                if (os > 0 && rObsIdx === -1) rObsIdx = c;
              }

              const totalScore = rNameScore + rQtyScore;
              if (rNameIdx !== -1 && rQtyIdx !== -1 && totalScore > bestHeaderScore) {
                bestHeaderScore = totalScore;
                headerRowIdx = r;
                nameColIdx = rNameIdx;
                qtyColIdx = rQtyIdx;
                unitColIdx = rUnitIdx;
                obsColIdx = rObsIdx;
              }
            }
            console.log(`[Excel Parser] Strategy 1 (Synonyms): headerRow=${headerRowIdx}, nameCol=${nameColIdx}, qtyCol=${qtyColIdx}, unitCol=${unitColIdx}, obsCol=${obsColIdx}, score=${bestHeaderScore}`);

            // ─── ESTRATEGIA 2: Buscar fila con ≥2 celdas de texto corto (típicas cabeceras) ───
            if (nameColIdx === -1 || qtyColIdx === -1) {
              for (let r = 0; r < Math.min(allRows.length, 20); r++) {
                const row = allRows[r];
                if (!row || !Array.isArray(row)) continue;
                const textCells: number[] = [];
                row.forEach((cell: any, c: number) => {
                  const val = String(cell || '').trim();
                  if (val.length >= 2 && val.length <= 25 && isNaN(Number(val))) {
                    textCells.push(c);
                  }
                });
                if (textCells.length >= 2 && textCells.length <= 12) {
                  // This row could be a header. Check if next rows have the pattern: text + number
                  let dataRowsFound = 0;
                  for (let dr = r + 1; dr < Math.min(r + 6, allRows.length); dr++) {
                    const dRow = allRows[dr];
                    if (!dRow || !Array.isArray(dRow)) continue;
                    const hasText = textCells.some(c => dRow[c] && String(dRow[c]).trim().length > 3 && isNaN(Number(String(dRow[c]).trim())));
                    const hasNum = textCells.some(c => {
                      // Look at adjacent columns for numbers
                      for (let nc = 0; nc < dRow.length; nc++) {
                        if (nc !== c && isNumeric(dRow[nc]) && parseNum(dRow[nc]) > 0 && parseNum(dRow[nc]) <= 5000) return true;
                      }
                      return false;
                    });
                    if (hasText && hasNum) dataRowsFound++;
                  }
                  if (dataRowsFound >= 2) {
                    // Use first text column as name, scan for qty column
                    const candidateNameCol = textCells[0];
                    let candidateQtyCol = -1;
                    // Find first numeric column after candidate name
                    for (let dr = r + 1; dr < Math.min(r + 10, allRows.length); dr++) {
                      const dRow = allRows[dr];
                      if (!dRow) continue;
                      for (let c = 0; c < dRow.length; c++) {
                        if (c === candidateNameCol) continue;
                        const hdr = String(row[c] || '').toLowerCase().trim();
                        if (isSkipColumn(hdr)) continue;
                        if (isNumeric(dRow[c]) && parseNum(dRow[c]) > 0 && parseNum(dRow[c]) <= 5000) {
                          candidateQtyCol = c;
                          break;
                        }
                      }
                      if (candidateQtyCol !== -1) break;
                    }
                    if (candidateQtyCol !== -1) {
                      headerRowIdx = r;
                      nameColIdx = candidateNameCol;
                      qtyColIdx = candidateQtyCol;
                      console.log(`[Excel Parser] Strategy 2 (Pattern): headerRow=${r}, nameCol=${candidateNameCol}, qtyCol=${candidateQtyCol}`);
                      break;
                    }
                  }
                }
              }
            }

            // ─── ESTRATEGIA 3: Análisis estadístico de columnas ───
            if (nameColIdx === -1 || qtyColIdx === -1) {
              const maxCols = Math.max(...allRows.filter(r => Array.isArray(r)).map(r => r.length), 0);
              const colStats: { textCount: number, numCount: number, avgLen: number, totalLen: number }[] = [];
              for (let c = 0; c < maxCols; c++) {
                let textCount = 0, numCount = 0, totalLen = 0;
                for (let r = 0; r < Math.min(allRows.length, 50); r++) {
                  const row = allRows[r];
                  if (!row || !Array.isArray(row) || c >= row.length) continue;
                  const val = row[c];
                  if (val === null || val === undefined) continue;
                  if (typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val.trim())) && val.trim() !== '')) {
                    numCount++;
                  } else if (typeof val === 'string' && val.trim().length > 2) {
                    textCount++;
                    totalLen += val.trim().length;
                  }
                }
                colStats.push({ textCount, numCount, avgLen: textCount > 0 ? totalLen / textCount : 0, totalLen });
              }

              // Name column: most text cells with longest average length
              let bestNameCol = -1, bestNameScore2 = 0;
              for (let c = 0; c < colStats.length; c++) {
                const s = colStats[c];
                const score = s.textCount * s.avgLen;
                if (s.textCount >= 3 && s.avgLen > 5 && score > bestNameScore2) {
                  bestNameScore2 = score;
                  bestNameCol = c;
                }
              }

              // Qty column: numeric column with values in reasonable range (1-5000)
              let bestQtyCol = -1, bestQtyCount = 0;
              for (let c = 0; c < colStats.length; c++) {
                if (c === bestNameCol) continue;
                const s = colStats[c];
                // Count how many values are in reasonable quantity range
                let reasonableCount = 0;
                for (let r = 0; r < Math.min(allRows.length, 50); r++) {
                  const row = allRows[r];
                  if (!row || !Array.isArray(row) || c >= row.length) continue;
                  const n = parseNum(row[c]);
                  if (!isNaN(n) && n > 0 && n <= 5000) reasonableCount++;
                }
                if (reasonableCount > bestQtyCount && s.numCount >= 2) {
                  bestQtyCount = reasonableCount;
                  bestQtyCol = c;
                }
              }

              if (bestNameCol !== -1 && bestQtyCol !== -1) {
                nameColIdx = bestNameCol;
                qtyColIdx = bestQtyCol;
                // Find header row: search upward from first data row
                for (let r = 0; r < Math.min(allRows.length, 20); r++) {
                  const row = allRows[r];
                  if (!row || !Array.isArray(row)) continue;
                  const nameCell = String(row[nameColIdx] || '').trim();
                  if (nameCell.length >= 2 && nameCell.length <= 30 && isNaN(Number(nameCell))) {
                    // Check if next row has actual data
                    const nextRow = allRows[r + 1];
                    if (nextRow && nextRow[nameColIdx] && String(nextRow[nameColIdx]).trim().length > 3) {
                      headerRowIdx = r;
                      break;
                    }
                  }
                }
                if (headerRowIdx === -1) headerRowIdx = 0;
                console.log(`[Excel Parser] Strategy 3 (Stats): nameCol=${nameColIdx}, qtyCol=${qtyColIdx}, headerRow=${headerRowIdx}`);
              }
            }

            // ─── ESTRATEGIA 4: Heurística simple (columna texto + columna número adyacente) ───
            if (nameColIdx === -1 || qtyColIdx === -1) {
              for (let r = 0; r < Math.min(allRows.length, 15); r++) {
                const row = allRows[r];
                if (!row || row.length < 2) continue;
                for (let c = 0; c < row.length - 1; c++) {
                  const cellText = String(row[c] || '').trim();
                  if (cellText.length > 3 && isNaN(Number(cellText)) && isNumeric(row[c + 1]) && parseNum(row[c + 1]) > 0 && parseNum(row[c + 1]) <= 5000) {
                    headerRowIdx = r - 1;
                    nameColIdx = c;
                    qtyColIdx = c + 1;
                    console.log(`[Excel Parser] Strategy 4 (Adjacent): headerRow=${headerRowIdx}, nameCol=${c}, qtyCol=${c + 1}`);
                    break;
                  }
                }
                if (nameColIdx !== -1) break;
              }
            }

            console.log(`[Excel Parser] Final detection: headerRow=${headerRowIdx}, nameCol=${nameColIdx}, qtyCol=${qtyColIdx}, unitCol=${unitColIdx}, obsCol=${obsColIdx}`);

            // ─── EXTRACCIÓN DE FILAS ───
            const startRow = headerRowIdx !== -1 ? headerRowIdx + 1 : 0;
            const TOTAL_KEYWORDS = /^(total|subtotal|sub-total|gran total|suma|iva|impuesto|descuento|neto)/i;

            for (let r = startRow; r < allRows.length; r++) {
              const row = allRows[r];
              if (!row || !Array.isArray(row)) continue;
              const rawName = row[nameColIdx !== -1 ? nameColIdx : 0];
              const rawQty = row[qtyColIdx !== -1 ? qtyColIdx : 1];
              if (!rawName || String(rawName).trim() === '' || String(rawName).includes('--- HOJA:')) continue;

              const nameStr = String(rawName).trim();
              // Skip total/subtotal rows
              if (TOTAL_KEYWORDS.test(nameStr)) continue;
              // Skip rows that look like metadata (very short or very long)
              if (nameStr.length <= 1 || nameStr.length > 200) continue;

              const qtyVal = parseNum(rawQty);
              if (isNaN(qtyVal) || qtyVal <= 0 || qtyVal > 50000) continue;

              // Build unit value
              let unitVal = 'Unidad';
              if (unitColIdx !== -1 && row[unitColIdx] !== undefined && row[unitColIdx] !== null) {
                const u = String(row[unitColIdx]).trim();
                if (u.length > 0 && u.length < 20) unitVal = u;
              }

              // Build observations
              let obsVal: string | null = null;
              if (obsColIdx !== -1 && row[obsColIdx] !== undefined && row[obsColIdx] !== null) {
                const o = String(row[obsColIdx]).trim();
                if (o.length > 0 && o.length < 500) obsVal = o;
              }

              attProgrammaticExcelItems.push({
                originalName: nameStr,
                quantity: qtyVal,
                unit: unitVal,
                observations: obsVal
              });
            }
            console.log(`[Excel Parser] Extracted ${attProgrammaticExcelItems.length} items programmatically from ${attFileName}`);

          } catch (err) {
            console.error('[Email Inbound] Error parsing Excel programmatically:', err);
          }
        }

        let attExtractedData: any = { items: [] };

        if (!attIsExcel) {
          try {
            let text = await fetchGemini(apiKey, genericPrompt, base64Data, mimeType);
            text = text.trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            attExtractedData = JSON.parse(text);
            if (attExtractedData.items && !Array.isArray(attExtractedData.items)) {
              if (typeof attExtractedData.items === 'object') {
                attExtractedData.items = Object.keys(attExtractedData.items).map(key => ({ originalName: key, quantity: attExtractedData.items[key] }));
              } else {
                attExtractedData.items = [];
              }
            }
          } catch (e) {
            console.error('Failed to parse Gemini output for attachment:', e);
          }
        } else {
          const excelPrompt = `
          Eres un asistente de logística experto en digitalización de pedidos para FruFresco.
          FECHA ACTUAL DEL SISTEMA: ${new Date().toISOString().split('T')[0]}
          ASUNTO DEL CORREO: "${subject}"
          CONTEXTO ADICIONAL (Texto del cuerpo del correo enviado por el cliente):
          """
          ${cleanedBodyText}
          """
          CONTENIDO DEL ARCHIVO ADJUNTO EXCEL/CSV:
          ${attExcelTextContext}
          TAREA:
          1. Identifica el nombre o empresa del CLIENTE, dirección de entrega física, número de teléfono, cédula/NIT y jornada preferida de entrega combinando el correo y el Excel.
          2. IMPORTANTE EN EXCEL: Extrae la lista completa de productos del Excel/CSV en la propiedad 'items' (con 'originalName', 'quantity', 'unit' y 'observations' si aplica) para que sirva como respaldo por si nuestro lector automático rápido llega a fallar. Además, extrae los metadatos del cliente y del pedido ('clientInDocument', 'address', 'phone', 'nit', 'deliverySlot', 'deliveryDate', 'clientType').
          3. Identifica la franja u horario de entrega: "AM", "PM", "Cualquier hora", o null.
          4. Clasifica el tipo de cliente en "clientType": "b2b_client" o "b2c_client".
          5. Extrae la fecha de entrega solicitada en "deliveryDate" en formato "YYYY-MM-DD" o null.
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
              { "originalName": "Nombre del producto", "quantity": 10, "unit": "Kg", "observations": null, "deliveryDate": "YYYY-MM-DD o null" }
            ]
          }
          `;
          try {
            let text = await fetchGemini(apiKey, excelPrompt);
            text = text.trim().replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
            attExtractedData = JSON.parse(text);
            const filterExcelItems = (items: any[], clientName: string) => {
              if (!items || items.length === 0) return [];
              return items.filter((itm: any) => {
                if (itm.quantity > 5000) return false;
                if (clientName) {
                  const cleanClient = clientName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                  const cleanProd = String(itm.originalName || itm.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                  if (cleanClient === cleanProd || cleanProd.includes(cleanClient) || cleanClient.includes(cleanProd)) {
                    return false;
                  }
                }
                return true;
              });
            };

            if (attProgrammaticExcelItems.length > 0) {
              attExtractedData.items = filterExcelItems(attProgrammaticExcelItems, attExtractedData.clientInDocument || '');
            } else if (Array.isArray(attExtractedData.items) && attExtractedData.items.length > 0) {
              attExtractedData.items = filterExcelItems(attExtractedData.items, attExtractedData.clientInDocument || '');
            } else if (attExtractedData.items && !Array.isArray(attExtractedData.items)) {
              if (typeof attExtractedData.items === 'object') {
                attExtractedData.items = Object.keys(attExtractedData.items).map(key => ({ originalName: key, quantity: attExtractedData.items[key] }));
              } else {
                attExtractedData.items = [];
              }
            } else {
              attExtractedData.items = [];
            }
          } catch (e) {
            console.error('Failed to parse Gemini output for Excel content:', e);
            if (attProgrammaticExcelItems.length > 0) {
              const filterExcelItems = (items: any[], clientName: string) => {
                if (!items || items.length === 0) return [];
                return items.filter((itm: any) => {
                  if (itm.quantity > 5000) return false;
                  if (clientName) {
                    const cleanClient = clientName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                    const cleanProd = String(itm.originalName || itm.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                    if (cleanClient === cleanProd || cleanProd.includes(cleanClient) || cleanClient.includes(cleanProd)) return false;
                  }
                  return true;
                });
              };
              attExtractedData.items = filterExcelItems(attProgrammaticExcelItems, attExtractedData.clientInDocument || '');
              attExtractedData.documentType = 'Email con Excel adjunto';
            }
          }
        }

        return {
          name: attFileName,
          url: publicUrl,
          processed: false,
          orderId: null,
          deliveryDate: attExtractedData.deliveryDate || null,
          deliverySlot: attExtractedData.deliverySlot || null,
          clientInDocument: attExtractedData.clientInDocument || null,
          documentType: attExtractedData.documentType || (attIsExcel ? 'Email con Excel adjunto' : 'Imagen/WhatsApp/PDF'),
          address: attExtractedData.address || null,
          phone: attExtractedData.phone || null,
          nit: attExtractedData.nit || null,
          clientType: attExtractedData.clientType || null,
          items: attExtractedData.items || []
        };
      });

      parsedAttachments = await Promise.all(attachmentPromises);
      uploadedAttachments = parsedAttachments.map(att => ({ name: att.name, url: att.url }));

      // DIAGNOSTIC LOG: Show per-attachment AI extraction results for deliveryDate per item
      parsedAttachments.forEach((att, i) => {
        const uniqueDates = [...new Set((att.items || []).map((itm: any) => itm.deliveryDate || null))];
        console.log(`[Email Inbound] [DIAG] Adjunto ${i+1}/${parsedAttachments.length}: "${att.name}" | globalDate=${att.deliveryDate} | itemDates=[${uniqueDates.join(', ')}] | items=${(att.items || []).length}`);
      });

      if (uploadedAttachments.length > 0) {
        attachmentUrl = uploadedAttachments[0].url;
        attachmentName = uploadedAttachments[0].name;
      }

      if (parsedAttachments.length > 0) {
        extractedData = {
          clientInDocument: parsedAttachments[0].clientInDocument,
          documentType: parsedAttachments[0].documentType,
          address: parsedAttachments[0].address,
          phone: parsedAttachments[0].phone,
          nit: parsedAttachments[0].nit,
          deliverySlot: parsedAttachments[0].deliverySlot,
          deliveryDate: parsedAttachments[0].deliveryDate,
          clientType: parsedAttachments[0].clientType,
          items: parsedAttachments[0].items
        };
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
        3. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial (suele empezar con 8 o 9). Usa "b2c_client" si es un cliente individual/hogar.
        4. Identifica la franja u horario de entrega. Si en el correo se indica un horario o franja horaria de entrega, debes asumir la jornada correspondiente:
           - Si el horario está en el rango de la mañana (ej. "7:00 a 11:00 am", "7:30 a 11:50 am", "mañana", "7:00am a 12:00pm"), asume "AM".
           - Si el horario está en el rango de la tarde (ej. "1:00 pm a 5:00 pm", "tarde", "12:00pm a 6:00pm"), asume "PM".
           - Si el horario cubre tanto mañana como tarde (ej. "7:00 am a 4:00 pm", "todo el día", "cualquier hora"), asume "Cualquier hora".
           - Si se listan horarios por sede (ej. "Bosques de Athan: 7am a 4pm", "Clínica Roma: 7:30am a 11:50am"), intenta deducir cuál aplica basándote en el nombre o dirección del cliente. Si no se puede deducir o es el horario general (ej. "horario de recibo es de 7:00 a 11:00"), asume la jornada del horario general o la que corresponda (ej. "7:00 a 11:00 de la mañana" -> "AM").
        5. Extrae la fecha de entrega general solicitada en "deliveryDate" en formato "YYYY-MM-DD". Revisa muy atentamente tanto el ASUNTO DEL CORREO como el cuerpo para encontrar indicaciones de fecha (ej. "Pedido para mañana", "Despacho 25/06/2026", "Entrega viernes", etc.). Usa la fecha actual del sistema como referencia (ej. si hoy es 24 de junio y dice "mañana", la fecha de entrega es 2026-06-25; si dice "para el viernes" y hoy es miércoles, calcula la fecha del próximo viernes). Si no se especifica ninguna fecha de entrega en el asunto ni en el cuerpo, pon null.
        6. Extrae todos los productos solicitados y su cantidad numérica.
           - Si el texto es un arreglo/JSON o tabla, la tercera columna (índice 2) contiene la CANTIDAD TOTAL del pedido. Ignora por completo las columnas posteriores (las que vienen después de la tercera columna), ya que son desgloses por sede y sumarlas causaría una duplicación.
           - NO confundas el código PLU (primera columna) con la cantidad.
           - IMPORTANTE: Si se especifica explícitamente una fecha de entrega en la misma línea o párrafo del producto (ej. "Hierbabuena para el 23/07"), extrae obligatoriamente esa fecha específica en el campo "deliveryDate" de ese ítem en formato "YYYY-MM-DD". Si el ítem no tiene una fecha de entrega específica por línea, coloca null.
           - IMPORTANTE: IGNORA todos los productos cuya CANTIDAD PEDIDA sea 0 o esté vacía. EXTRAE ÚNICAMENTE productos con cantidad mayor a 0.
           - Extrae también la unidad de medida (ej. "Kg", "Lb", "Litro", etc.). Si el producto no tiene descripción de unidades en el texto del pedido (ej. "12 huevos", "1 lechuga crespa"), debes establecer obligatoriamente la unidad como "Unidad".
        7. Extrae las observaciones, notas o especificaciones de calidad del producto en el campo "observations".
           - REGLA CRÍTICA DE OBSERVACIONES: Las observaciones deben venir ÚNICAMENTE de anotaciones explícitas de calidad (por ejemplo: 'maduro', 'pintón', 'delgados').
           - NUNCA asumas que los textos que acompañan al nombre en la columna del producto (como "INSTITUCIONAL", "1000G", "KILO", "PAQ 1000 G") son observaciones o características. Esos textos pertenecen al nombre del producto, NO a observaciones. Si no hay una observación explícita y separada del producto, pon null.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
        - Las cantidades deben ser numéricas.
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos.

        REGLAS DE EXCLUSIÓN CRÍTICA DE PRODUCTOS:
        * NUNCA extraigas el nombre del cliente, dirección, teléfono, NIT, número de factura o cualquier información de la cabecera/pie de página como si fuera un producto.
        * Si detectas un texto que coincide con el nombre de la empresa (ej. "CLUB BELLAVISTA", "ADR WORK", etc.) y un valor numérico extremadamente grande al lado (ej. "7900405437", "800234123", etc. que claramente es un teléfono, NIT o código de barra), es información del cliente/documento, NO es un producto del pedido. Queda TERMINANTEMENTE PROHIBIDO incluirlo en la lista de 'items'.
        * Cualquier cantidad que sea mayor a 5000 (o que parezca un código numérico largo como un teléfono o NIT) debe ser ignorada como producto y NO debe incluirse en la lista de 'items'.
        
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
            { "originalName": "Tomate Chonto", "quantity": 15, "unit": "Kg / Lb / Unidad / Litro / null", "observations": "Cualquier nota u observación específica del producto o null", "deliveryDate": "YYYY-MM-DD o null" }
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
        const regex = /^[-*\s]*(\d+(?:[.,]\d+)?)\s*(kg|kls?|g|lb|litros?|paquetes?|unidades?|cubetas?|manojos?|atados?)?\s*(de\s+)?(.+)/i;
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

    // Only if we haven't found any profiles by NIT or Phone, search by sender email address (skip if it is the test email)
    if (candidateProfiles.length === 0 && senderEmail !== 'higuera200@gmail.com') {
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

    const namesMatch = (detName: string, profName: string): boolean => {
      if (!detName || !profName) return false;
      const norm1 = detName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      const norm2 = profName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      
      const words1 = norm1.split(/\s+/).filter(w => w.length > 2);
      const words2 = norm2.split(/\s+/).filter(w => w.length > 2);
      
      return words1.some(w => words2.includes(w));
    };

    // If still no profile found, try a global fuzzy name match search against the whole database
    let detectedNameForFuzzy = extractedData.clientInDocument || '';
    if (typeof detectedNameForFuzzy !== 'string') {
      detectedNameForFuzzy = String(detectedNameForFuzzy);
    }
    detectedNameForFuzzy = detectedNameForFuzzy.trim();

    let hasNameMatch = false;
    if (candidateProfiles.length > 0 && detectedNameForFuzzy) {
      hasNameMatch = candidateProfiles.some(p => 
        namesMatch(detectedNameForFuzzy, p.contact_name || '') || namesMatch(detectedNameForFuzzy, p.company_name || '')
      );
    }

    if ((candidateProfiles.length === 0 || !hasNameMatch) && detectedNameForFuzzy && detectedNameForFuzzy.length > 3) {
      console.log(`[Email Ingest] Attempting global fuzzy name match for: "${detectedNameForFuzzy}"`);
      const { data: allProfiles, error: allProfilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, role, is_active, address, phone, nit');
      
      if (!allProfilesError && allProfiles) {
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
    const draftsToInsert: any[] = [];

    const processSourceIntoDrafts = (sourceData: any, isFromAttachment: boolean, attIndex: number = 0, totalAtts: number = 0) => {
      const items = Array.isArray(sourceData.items) ? sourceData.items : [];
      const groups = new Map<string, any[]>();
      
      if (items.length === 0) {
        const fallbackDate = sourceData.deliveryDate || targetDeliveryDate || null;
        groups.set(String(fallbackDate), []);
      } else {
        items.forEach((itm: any) => {
          const itemDate = itm.deliveryDate || sourceData.deliveryDate || targetDeliveryDate || null;
          const key = String(itemDate);
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(itm);
        });
      }

      const numGroups = groups.size;
      console.log(`[Email Inbound] [DIAG] processSourceIntoDrafts: att=${attIndex+1}/${totalAtts} | groups=${numGroups} | dateKeys=[${[...groups.keys()].join(', ')}]`);
      let groupIndex = 0;

      for (const [dateKey, groupedItems] of groups.entries()) {
        groupIndex++;
        const effectiveDate = dateKey === 'null' ? null : dateKey;
        const isFirstGlobalDraft = draftsToInsert.length === 0;
        const uniqueDraftUuid = isFirstGlobalDraft ? draftUuid : crypto.randomUUID();
        const shortCode = `EML-${uniqueDraftUuid.substring(0, 6).toUpperCase()}`;
        
        let subjectSuffix = '';
        if (totalAtts > 1) {
           subjectSuffix += `[Adjunto ${attIndex + 1}/${totalAtts}]`;
        }
        if (numGroups > 1) {
           subjectSuffix += ` [Pedido ${groupIndex}/${numGroups}]`;
        }
        
        const finalSubject = `[${shortCode}] ${subjectSuffix ? subjectSuffix + ' ' : ''}${subject}`.trim().replace(/\s+/g, ' ');

        draftsToInsert.push({
          id: uniqueDraftUuid,
          profile_id: profile ? profile.id : null,
          client_detected_name: (sourceData.clientInDocument || extractedData.clientInDocument || profile?.company_name || 'Desconocido').replace(/\*/g, '').trim(),
          source_email: senderEmail,
          email_subject: finalSubject,
          email_body: currentPlainText,
          extracted_items: [
            { 
              isMetadata: true, 
              address: sourceData.address || extractedData.address || null,
              addressDetected: addressDetected,
              deliverySlot: sourceData.deliverySlot || finalDeliverySlot,
              deliveryDate: effectiveDate,
              phone: sourceData.phone || extractedData.phone || null,
              nit: sourceData.nit || extractedData.nit || null,
              clientType: sourceData.clientType || clientType,
              attachmentUrl: sourceData.url || attachmentUrl || null,
              attachmentName: sourceData.name || attachmentName || null,
              attachments: isFromAttachment ? [{ ...sourceData, items: groupedItems }] : parsedAttachments.map((pa: any) => ({ ...pa, items: [] })),
              emailHtml: htmlText || null
            },
            ...groupedItems.map((itm: any) => {
              let originalName = String(itm.originalName || itm.name || '').trim();
              originalName = originalName.replace(/\s*[xX]\s*\d+(?:\.\d+)?\s*(?:g|gr|grs|kg|kl|kls|lb|lbs|oz|ml|l|lt|lts|unid|unidades|und|unds)\b.*$/i, '').trim();
              const nameLower = originalName.toLowerCase();
              let observations = itm.observations || '';
              
              if (nameLower.includes('libra') || nameLower.includes('lb')) {
                if (!observations.toLowerCase().includes('libra')) {
                  observations = `Solicitado en Libras. ${observations}`.trim();
                }
                return { ...itm, originalName, unit: 'Lb', observations };
              }
              if (nameLower.includes('litro') || nameLower.includes('litros') || nameLower.includes(' l ') || nameLower.includes(' lt ') || nameLower.endsWith(' l') || nameLower.endsWith(' lt')) {
                if (!observations.toLowerCase().includes('litro')) {
                  observations = `Solicitado en Litros. ${observations}`.trim();
                }
                return { ...itm, originalName, unit: 'Litro', observations };
              }
              return { ...itm, originalName };
            })
          ],
          status: 'pending'
        });
      }
    };

    if (parsedAttachments.length > 0) {
      for (let index = 0; index < parsedAttachments.length; index++) {
        processSourceIntoDrafts(parsedAttachments[index], true, index, parsedAttachments.length);
      }
    } else {
      processSourceIntoDrafts(extractedData, false);
    }

    const { data: insertedDrafts, error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .insert(draftsToInsert)
      .select();

    if (draftError) {
      console.error('[Email Inbound] Error saving draft:', draftError);
      return NextResponse.json({ error: draftError.message }, { status: 500 });
    }

    const newDraft = insertedDrafts?.[0] || { id: draftsToInsert[0]?.id };
    console.log('[Email Inbound] Draft(s) created successfully:', insertedDrafts?.map(d => d.id));
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
        const draftIdStr = `EML-${newDraft.id.substring(0, 6).toUpperCase()}`;

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

          if (mailId) {
            await supabaseAdmin.from('mail').update({ status: 'success' }).eq('id', mailId);
          }
          console.log('[Email Inbound] Asynchronous processing finished successfully. Draft created:', newDraft.id);

        } catch (err: any) {
          console.error('[Email Inbound] Ingest error in background process:', err);
          if (mailId) {
            await supabaseAdmin.from('mail').update({ status: 'error', error_message: err?.message || 'Error parsing' }).eq('id', mailId);
          }
          await supabaseAdmin.from('order_drafts').insert([{
            email_subject: subject || 'Error en Ingesta',
            source_email: fromField || 'desconocido',
            status: 'rejected',
            client_type: 'b2b_client',
            items: [],
            extracted_items: { 
              error: err?.message || 'Fatal error in processMailAsync',
              stack: err?.stack,
              name: err?.name
            }
          }]);
        }
      };

      // Execute background processing using Next.js after() to keep the serverless container alive
      after(async () => {
        try {
          await processMailAsync();
        } catch (err) {
          console.error('[Email Inbound] Fatal background process execution error:', err);
        }
      });

      // Return immediate 200 OK to CloudMailin to prevent serverless function timeout
      return NextResponse.json({ success: true, message: 'Email received and queued for processing.', mailId: mailRecord?.id });

    } catch (err: any) {
      console.error('[Email Inbound] Webhook handler error:', err);
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
