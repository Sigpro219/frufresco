import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  try {
    const payload = await req.json();

    // CloudMailin structures payload containing headers, envelope, plain, html, attachments
    const headers = payload.headers || {};
    const envelope = payload.envelope || {};

    const fromField = headers.from || headers.From || envelope.from || '';
    const toField = headers.to || headers.To || envelope.to || '';
    const subject = headers.subject || headers.Subject || '';
    const plainText = payload.plain || '';
    const attachments = payload.attachments || [];

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
    if (attachments.length > 0) {
      console.log(`[Email Inbound] Processing attachment: ${attachments[0].filename}`);
      // CloudMailin attachment format: content is base64 encoded
      const attachment = attachments[0];
      const base64Data = attachment.content;
      const mimeType = attachment.content_type || 'application/pdf';

      const prompt = `
        Eres un asistente de logística experto en digitalización de pedidos para FruFresco.
        
        TAREA:
        1. Analiza el documento adjunto (puede ser una imagen de WhatsApp, foto de pedido, PDF).
        2. Identifica el nombre o empresa del CLIENTE.
        3. Extrae la dirección de entrega, ciudad, número de teléfono y cédula/NIT si están presentes.
        4. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial. Usa "b2c_client" si es un cliente individual/hogar (persona natural que compra para su casa).
        5. Extrae todos los productos solicitados y su cantidad numérica.
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código.
        - Las cantidades deben ser estrictamente numéricas (si dice "una libra", pon 1. Si no hay cantidad, asume 1).
        - MUY IMPORTANTE: El campo "items" DEBE ser SIEMPRE un arreglo (Array) de objetos. Incluso si está vacío, o si el usuario lista con guiones (-), extráelos como elementos del arreglo.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre o Empresa Detectada",
          "documentType": "Imagen/WhatsApp/PDF",
          "address": "Dirección extraída o vacio",
          "phone": "Teléfono extraído o vacio",
          "nit": "NIT o cédula extraída o vacio",
          "clientType": "b2b_client o b2c_client",
          "items": [
            { "originalName": "Nombre del Producto", "quantity": 10 }
          ]
        }
      `;

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
      console.log('[Email Inbound] Processing plain text email body');
      // No attachments, parse the email text body directly
      const prompt = `
        Eres un asistente de logística para FruFresco.
        Analiza este cuerpo de correo electrónico que contiene una solicitud de pedido.
        
        CORREO ELECTRÓNICO:
        ${plainText}
        
        TAREA:
        1. Identifica el nombre o empresa del CLIENTE que firma o envía el correo.
        2. Extrae todos los productos solicitados con sus cantidades.
        3. Extrae la dirección de entrega de forma limpia.
           REGLA DE DIRECCIÓN: Extrae ÚNICAMENTE la dirección de entrega física (por ejemplo: "Calle 127 # 7A-28 Oficina 801, Bogotá D.C."). 
           Bajo ninguna circunstancia incluyas texto de la firma, despedidas, fórmulas de cortesía (como "Cordialmente", "Atentamente"), ni notas sobre el valor total o el horario de entrega en el campo "address". 
           Si hay texto extra después de la dirección física, recórtalo y quédate solo con la nomenclatura de la dirección.
        4. Extrae la jornada u horario de entrega preferido si el cliente lo menciona explícitamente en el texto (por ejemplo: "AM", "PM", "Tarde", "Mañana", "Entre las 8 y 10 am"). Si no se menciona o no se registra de manera clara, pon null o vacio.
        5. Clasifica el tipo de cliente en "clientType". Usa "b2b_client" si es una empresa, negocio, restaurante, hotel, cafetería (HORECA), distribuidora, o tiene NIT comercial (suele empezar con 8 o 9). Usa "b2c_client" si es un cliente individual/hogar.
        
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
          "phone": "Teléfono extraído o vacio",
          "nit": "NIT o cédula extraída o vacio",
          "clientType": "b2b_client o b2c_client",
          "items": [
            { "originalName": "Tomate Chonto", "quantity": 15 }
          ]
        }
      `;

      try {
        let text = await fetchGemini(apiKey, prompt);
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
        console.error('Failed to parse Gemini output for email text:', e);
      }
      
      // FALLBACK: If Gemini failed to extract items, try regex extraction
      if (!extractedData.items || !Array.isArray(extractedData.items) || extractedData.items.length === 0) {
        extractedData.items = [];
        const lines = plainText.split('\n');
        const regex = /^[-*\s]*(\d+(?:[.,]\d+)?)\s*(kg|g|lb|litros?|paquetes?|unidades?|cubetas?|manojos?|atados?)?\s*(de\s+)?(.+)/i;
        for (let line of lines) {
          line = line.trim();
          if (line === '-' || line === '') continue;
          if (line.toLowerCase().includes('dirección') || line.toLowerCase().includes('celular') || line.toLowerCase().includes('atentamente')) continue;
          const match = line.match(regex);
          if (match) {
            extractedData.items.push({
              originalName: match[4].trim().replace(/^-+/, '').trim(),
              quantity: parseFloat(match[1].replace(',', '.'))
            });
          }
        }
      }
      
      // FALLBACK: If Gemini failed to extract metadata, use regex
      const lines = plainText.split('\n');
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
        if (addressFound && line !== '' && !line.match(/celular|tel[ée]fono|c\.c\.|nit|atentamente|gracias|agradezco|quedo/i) && addressStr.length < 120) {
          addressStr += (addressStr ? ', ' : '') + line;
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
      if (!lowerClientName || lowerClientName === 'desconocido' || lowerClientName === 'no detectado' || lowerClientName === 'none' || lowerClientName === 'no especificado' || lowerClientName === 'no especificada') {
        let nameCandidate = '';
        const signatureLines = plainText.split('\n');
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
                !prevLine.match(/direcci[óo]n|correo|email|pedido|tomate|papa|cebolla|zanahoria|gracias|atentamente|saludos|cordialmente/i) &&
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

    // Only if we haven't found any profiles by NIT AND there was NO NIT in the email,
    // we fall back to searching by sender email address.
    if (candidateProfiles.length === 0 && !cleanExtractedNit) {
      console.log(`[Email Ingest] No NIT provided. Searching client by sender email: ${senderEmail}`);
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
        const exactOrSimilarMatch = candidateProfiles.find(p => 
          namesMatch(detectedName, p.contact_name || '') || namesMatch(detectedName, p.company_name || '')
        );
        if (exactOrSimilarMatch) {
          profile = exactOrSimilarMatch;
        } else {
          const b2bCandidate = candidateProfiles.find(p => p.role === 'b2b_client');
          if (b2bCandidate) {
            profile = b2bCandidate;
          }
        }
      }
    }

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

    // 5. Save draft to public.order_drafts
    // Use an explicit UUID so we can reference its short ID immediately
    const draftUuid = crypto.randomUUID();
    const shortCode = `EML-${draftUuid.substring(0, 6).toUpperCase()}`;

    const { data: newDraft, error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .insert({
        id: draftUuid,
        profile_id: profile ? profile.id : null,
        client_detected_name: (extractedData.clientInDocument || profile?.company_name || 'Desconocido').replace(/\*/g, '').trim(),
        source_email: senderEmail,
        email_subject: `[${shortCode}] ${subject}`,
        email_body: plainText,
        extracted_items: [
          { 
            isMetadata: true, 
            address: extractedData.address || null,
            deliverySlot: extractedData.deliverySlot || null,
            phone: extractedData.phone || null,
            nit: extractedData.nit || null,
            clientType: clientType
          },
          ...(Array.isArray(extractedData.items) ? extractedData.items : [])
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

    // 4. Send confirmation email to the client using Nodemailer
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
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

        // EVITAR enviar correos de confirmación al propio correo corporativo/administrador para no saturar la bandeja de entrada
        const isCorporateRecipient = corporateEmails.includes(senderEmail) || senderEmail.endsWith('@frufresco.com') || senderEmail.endsWith('@frufresco.co');
        if (!isCorporateRecipient) {
          await transporter.sendMail({
            from: `"Investments Cortés (Pedidos)" <${process.env.SMTP_USER}>`,
            to: senderEmail,
            subject: `¡Hemos recibido tu pedido! (#${draftIdStr})`,
            html: emailHtml,
          });
          console.log('[Email Inbound] Confirmation email sent to:', senderEmail);

          // Guarda copia en la tabla mail para el historial
          await supabaseAdmin.from('mail').insert({
            to_email: senderEmail,
            subject: `¡Hemos recibido tu pedido! (#${draftIdStr})`,
            message: { html: emailHtml, text: 'Tu pedido ha sido recibido con éxito.' },
            status: 'sent',
            sent_at: new Date().toISOString(),
            template: { name: 'inbound_draft_received', data: { draft_id: draftIdStr, total: totalOrderAmount } }
          });
        } else {
          console.log('[Email Inbound] Correo destinatario es corporativo/admin. Saltando envío de confirmación e historial para evitar spam.', senderEmail);
        }

      } catch (emailError) {
        console.error('[Email Inbound] Failed to send confirmation email:', emailError);
      }
    } else {
      console.log('[Email Inbound] SMTP credentials not set, skipping confirmation email.');
    }

    return NextResponse.json({ success: true, draftId: newDraft.id });

  } catch (err: any) {
    console.error('[Email Inbound] Ingest error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
