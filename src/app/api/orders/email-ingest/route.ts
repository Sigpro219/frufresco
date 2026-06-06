import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 60; // Increase Vercel timeout to 60s for Gemini

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

    // 1. Identify Client in our database
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id, company_name, contact_name')
      .eq('email', senderEmail)
      .limit(1)
      .maybeSingle();

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key is missing' }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    let extractedData = {
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
        Eres un asistente de logística experto en FruFresco.
        Analiza esta orden de compra adjunta al correo.
        
        TAREA:
        1. Identifica el nombre del CLIENTE mencionado en el documento.
        2. Extrae todos los productos solicitados junto con su cantidad numérica.
        3. Determina el tipo de documento (PDF, Excel, etc.).
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin markdown (ej. no uses \`\`\`json).
        - Si el nombre del producto es ambiguo, mantén el nombre original del documento.
        - Las cantidades deben ser números.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre del Cliente Detectado",
          "documentType": "PDF",
          "items": [
            { "originalName": "Nombre del Producto", "quantity": 10 }
          ]
        }
      `;

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        { text: prompt }
      ]);

      const response = await result.response;
      let text = response.text().trim();
      text = text.replace(/^```json/, '').replace(/```$/, '').trim();
      try {
        extractedData = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse Gemini output for attachment:', text);
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
        
        REGLAS CRÍTICAS:
        - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
        - Las cantidades deben ser numéricas.
        
        FORMATO DE RESPUESTA ESPERADO:
        {
          "clientInDocument": "Nombre o Empresa Detectada",
          "documentType": "Email",
          "items": [
            { "originalName": "Tomate Chonto", "quantity": 15 }
          ]
        }
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();
      text = text.replace(/^```json/, '').replace(/```$/, '').trim();
      try {
        extractedData = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse Gemini output for email text:', text);
      }
    }

    // 3. Save draft to public.order_drafts
    const { data: newDraft, error: draftError } = await supabaseAdmin
      .from('order_drafts')
      .insert({
        profile_id: profile ? profile.id : null,
        client_detected_name: extractedData.clientInDocument || profile?.company_name || 'Desconocido',
        source_email: senderEmail,
        email_subject: subject,
        email_body: plainText,
        extracted_items: extractedData.items || [],
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
        
        // Build items HTML
        let itemsHtml = '';
        const items = extractedData.items || [];
        for (const item of items) {
          itemsHtml += `
            <tr style="border-bottom: 1px solid #f0f0f0;">
                <td style="padding: 12px 5px; color: #333;">\${item.originalName || item.name || 'Producto'}</td>
                <td style="padding: 12px 5px; text-align: center; color: #666;">\${item.quantity || 1}</td>
                <td style="padding: 12px 5px; text-align: right; color: #333; font-weight: bold;">Pendiente</td>
            </tr>
          `;
        }

        const clientName = extractedData.clientInDocument || profile?.company_name || 'Cliente';
        const draftIdStr = newDraft.id.substring(0, 8).toUpperCase(); // Short ID

        const emailHtml = `
<div style="font-family: 'Playfair Display', serif; color: #025357; padding: 40px; background-color: #f8f9f5; border-radius: 20px; max-width: 600px; margin: auto;">
    <center>
        <img src="https://zeticas.com/favicon.png" width="80" style="margin-bottom: 20px;">
        <h1 style="color: #025357; font-size: 28px; margin-bottom: 10px;">¡Gracias por tu compra, \${clientName}!</h1>
        <p style="font-size: 16px; color: #555;">Hemos recibido tu pedido con éxito y ya está en preparación.</p>
    </center>
    
    <div style="background: white; padding: 30px; border-radius: 15px; margin-top: 30px; border-left: 5px solid #D6BD98; box-shadow: 0 4px 12px rgba(0,0,0,0.02);">
        <h3 style="color: #025357; margin-top: 0; font-size: 18px; border-bottom: 1px solid #f0f0f0; padding-bottom: 10px;">Resumen del Pedido #\${draftIdStr}</h3>
        <p style="font-size: 13px; color: #666; margin-bottom: 20px;"><b>Fecha:</b> \${today}</p>
        
        <table style="width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 14px;">
            <thead>
                <tr style="border-bottom: 2px solid #025357; color: #025357; text-align: left;">
                    <th style="padding: 10px 5px; font-weight: bold;">Producto</th>
                    <th style="padding: 10px 5px; font-weight: bold; text-align: center;">Cant.</th>
                    <th style="padding: 10px 5px; font-weight: bold; text-align: right;">Total</th>
                </tr>
            </thead>
            <tbody>
                \${itemsHtml}
            </tbody>
        </table>
        
        <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #025357; text-align: right;">
            <p style="font-size: 16px; color: #025357; margin: 0;"><b>Total: A confirmar en despacho</b></p>
        </div>
    </div>

    <p style="margin-top: 30px; text-align: center; color: #666; font-size: 14px;">
        Te enviaremos otra notificación cuando tu pedido esté en camino.<br>
        Si tienes alguna duda o deseas realizar cambios, puedes responder a este correo.
    </p>
    
    <hr style="border: 0; border-top: 1px solid #D6BD98; margin: 40px 0;">
    
    <center>
        <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px;">Propósito Artesanal • Zeticas</p>
    </center>
</div>
        `;

        await transporter.sendMail({
          from: \`"Zeticas (Pedidos)" <\${process.env.SMTP_USER}>\`,
          to: senderEmail,
          subject: \`¡Hemos recibido tu pedido! (#\${draftIdStr})\`,
          html: emailHtml,
        });
        console.log('[Email Inbound] Confirmation email sent to:', senderEmail);

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
