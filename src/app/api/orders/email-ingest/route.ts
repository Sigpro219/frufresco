import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
import { GoogleGenerativeAI } from "@google/generative-ai";

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
    return NextResponse.json({ success: true, draftId: newDraft.id });

  } catch (err: any) {
    console.error('[Email Inbound] Ingest error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
