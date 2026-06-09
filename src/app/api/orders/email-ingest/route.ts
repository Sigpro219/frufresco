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
  try {
    const payload = await req.json();

    // CloudMailin structures payload containing headers, envelope, plain, html, attachments
    const headers = payload.headers || {};
    const envelope = payload.envelope || {};

    const fromField = headers.from || headers.From || envelope.from || '';
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

    console.log(`[Email Inbound] Received mail from ${senderEmail} with subject: ${subject}`);

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
        4. Extrae todos los productos solicitados y su cantidad numérica.
        
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
    }

    // 3. Identify Client in our database (we also include inactive B2C profiles so their data is remembered)
    const { data: candidateProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name, role, is_active, address, phone')
      .eq('email', senderEmail);

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

    // 4. Save draft to public.order_drafts
    // Use an explicit UUID so we can reference its short ID immediately
    const draftUuid = crypto.randomUUID();
    const shortCode = `EML-${draftUuid.substring(0, 6).toUpperCase()}`;

    const { data: newDraft, error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .insert({
        id: draftUuid,
        profile_id: profile ? profile.id : null,
        client_detected_name: extractedData.clientInDocument || profile?.company_name || 'Desconocido',
        source_email: senderEmail,
        email_subject: `[${shortCode}] ${subject}`,
        email_body: plainText,
        extracted_items: [
          { 
            isMetadata: true, 
            address: extractedData.address || null,
            phone: extractedData.phone || null,
            nit: extractedData.nit || null
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
              // Smart Auto Match (matching the UI algorithm)
              const firstWord = cleanSearch.split(' ')[0]?.replace(/[()0-9]/g, '');
              matchedProduct = dbProducts.find((p: any) => {
                const prodNameLower = p.name.toLowerCase();
                return cleanSearch.includes(prodNameLower) || 
                       (firstWord && firstWord.length > 2 && prodNameLower.includes(firstWord));
              });
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
