import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { extractCommercialProposalAI, parseExcelPriceProposal, enrichCommercialProposal } from '@/lib/commercial/commercial-parser-engine';
import { resolveClientProfile } from '@/lib/orders/order-parser-engine';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const { mailId, clientProfileId, forceReanalyze } = await req.json();

    if (!mailId) {
      return NextResponse.json({ error: 'Falta el parámetro mailId' }, { status: 400 });
    }

    // 1. Fetch Mail Record
    const { data: mailRecord, error: mailErr } = await supabaseAdmin
      .from('mail')
      .select('*')
      .eq('id', mailId)
      .single();

    if (mailErr || !mailRecord) {
      return NextResponse.json({ error: 'No se encontró el correo especificado' }, { status: 404 });
    }

    const messageData = mailRecord.message || {};
    const subject = mailRecord.subject || '';
    const bodyText = messageData.text || '';
    const attachments = messageData.attachments || mailRecord.payload?.attachments || [];
    const senderEmail = messageData.sender_email || mailRecord.to_email || '';

    // 2. Fetch Profiles & Leads for Resolution
    let resolvedProfile: any = null;
    let resolvedLead: any = null;

    if (clientProfileId) {
      const { data: directProfile } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', clientProfileId)
        .maybeSingle();
      if (directProfile) resolvedProfile = directProfile;
    }

    if (!resolvedProfile) {
      const { data: allProfiles } = await supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, nit, email, phone, address, pricing_model_id')
        .in('role', ['b2b_client', 'b2c_client', 'client']);

      resolvedProfile = resolveClientProfile({ email: senderEmail, name: messageData.sender_name || subject }, allProfiles || []);
    }

    // 3. Extraction: Excel or Gemini
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    let rawItems: any[] = [];
    let detectedClientName = resolvedProfile?.company_name || resolvedProfile?.contact_name || messageData.sender_name || 'Cliente Comercial';
    let validityStart = new Date().toISOString().split('T')[0];
    let validityEnd = '';

    // Check for Excel attachment
    const excelAtt = attachments.find((a: any) => {
      const name = (a.name || a.filename || '').toLowerCase();
      const type = (a.content_type || '').toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv') || type.includes('spreadsheet') || type.includes('excel');
    });

    // Check for PDF attachment
    const pdfAtt = attachments.find((a: any) => {
      const name = (a.name || a.filename || '').toLowerCase();
      const type = (a.content_type || '').toLowerCase();
      return name.endsWith('.pdf') || type.includes('pdf');
    });

    if (excelAtt && excelAtt.url) {
      try {
        console.log('[Analyze Proposal] Fetching Excel from:', excelAtt.url);
        const res = await fetch(excelAtt.url);
        const arrayBuf = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuf);
        rawItems = parseExcelPriceProposal(buffer);
        console.log(`[Analyze Proposal] Excel extracted ${rawItems.length} items programmatically.`);
      } catch (excelErr) {
        console.warn('[Analyze Proposal] Excel parsing fallback to AI:', excelErr);
      }
    }

    // If Excel didn't extract items or it's a PDF/Text email, use Gemini
    if (rawItems.length === 0 && apiKey) {
      let base64Data: string | undefined = undefined;
      let mimeType = 'application/pdf';

      const targetAtt = pdfAtt || excelAtt || attachments[0];
      if (targetAtt && targetAtt.url) {
        try {
          const res = await fetch(targetAtt.url);
          const arrayBuf = await res.arrayBuffer();
          base64Data = Buffer.from(arrayBuf).toString('base64');
          mimeType = targetAtt.content_type || (targetAtt.name?.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream');
        } catch (fetchErr) {
          console.warn('[Analyze Proposal] Error fetching attachment for AI:', fetchErr);
        }
      }

      try {
        const aiResult = await extractCommercialProposalAI(apiKey, subject, bodyText, base64Data, mimeType);
        if (aiResult.items && aiResult.items.length > 0) {
          rawItems = aiResult.items.map((i: any) => ({
            accounting_id: i.accounting_id,
            client_product_name: i.client_product_name || i.originalName,
            client_proposed_price: parseFloat(i.client_proposed_price || i.price || 0),
            unit: i.unit || 'Kg',
            observations: i.observations || ''
          }));
        }
        if (aiResult.client_name && !resolvedProfile) {
          detectedClientName = aiResult.client_name;
        }
        if (aiResult.validity_start) validityStart = aiResult.validity_start;
        if (aiResult.validity_end) validityEnd = aiResult.validity_end;
      } catch (aiErr: any) {
        console.error('[Analyze Proposal] AI Extraction error:', aiErr.message);
      }
    }

    // 4. Enrich with Catalog, Margins, Last Applied Price & General Institucional
    const enrichedItems = await enrichCommercialProposal(rawItems, resolvedProfile?.id || null, supabaseAdmin);

    // 5. Calculate Subtotal and Total
    const subtotal = enrichedItems.reduce((acc, item) => acc + (item.client_proposed_price || 0), 0);

    // Return the analyzed proposal data
    return NextResponse.json({
      success: true,
      mailId: mailId,
      client: {
        id: resolvedProfile?.id || null,
        name: detectedClientName,
        email: senderEmail,
        nit: resolvedProfile?.nit || null
      },
      validity: {
        start: validityStart,
        end: validityEnd
      },
      attachments: attachments,
      items: enrichedItems,
      subtotal: subtotal,
      itemCount: enrichedItems.length
    });

  } catch (err: any) {
    console.error('[Analyze Proposal API] Fatal error:', err);
    return NextResponse.json({ error: err.message || 'Internal error analyzing proposal' }, { status: 500 });
  }
}
