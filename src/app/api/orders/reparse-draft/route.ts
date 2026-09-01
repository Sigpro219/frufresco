import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { fetchGeminiExtraction } from '@/lib/orders/order-parser-engine';

const getSupabaseAdmin = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing Supabase configuration");
  return createClient(url, key);
};

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { draftId } = await req.json();
    if (!draftId) {
      return NextResponse.json({ error: "draftId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: draft, error: fetchErr } = await supabase
      .from('order_drafts')
      .select('*')
      .eq('id', draftId)
      .single();

    if (fetchErr || !draft) {
      return NextResponse.json({ error: "Borrador no encontrado" }, { status: 404 });
    }

    const rawItems = draft.extracted_items || [];
    const metadata = (Array.isArray(rawItems) ? rawItems.find((it: any) => it.isMetadata) : {}) || {};
    const attachmentUrl = metadata.attachments?.[0]?.url || metadata.attachmentUrl;
    const attachmentName = metadata.attachments?.[0]?.name || metadata.attachmentName || 'documento.pdf';
    const emailBodyText = draft.email_body || metadata.emailHtml || metadata.rawText || '';
    const emailSubject = draft.email_subject || '';

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "No se encuentra configurada la clave de API de Gemini en el servidor" }, { status: 500 });
    }

    let extractedData: {
      clientName?: string;
      nit?: string;
      address?: string;
      deliveryDate?: string;
      items: Array<{ name: string; quantity: number; unit?: string; observations?: string }>;
    } = { items: [] };

    let parsedSuccessfully = false;

    const attachmentsList: Array<{ url: string; name: string }> = [];
    if (metadata.attachments && Array.isArray(metadata.attachments) && metadata.attachments.length > 0) {
      metadata.attachments.forEach((att: any) => {
        if (att.url) attachmentsList.push({ url: att.url, name: att.name || 'documento' });
      });
    } else if (attachmentUrl) {
      attachmentsList.push({ url: attachmentUrl, name: attachmentName });
    }

    // 1. Process each attachment independently
    for (let attIdx = 0; attIdx < attachmentsList.length; attIdx++) {
      const att = attachmentsList[attIdx];
      try {
        const fileRes = await fetch(att.url);
        if (!fileRes.ok) continue;

        const fileBuf = await fileRes.arrayBuffer();
        const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';

        if (ext === 'xlsx' || ext === 'xls') {
          const workbook = XLSX.read(fileBuf, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1 }) as any[][];
          if (!rawData || rawData.length === 0) continue;

          let poNumber = '';
          let headerRowIdx = -1;
          const qtyCandidates: number[] = [];
          let nameCol = -1;
          let unitCol = -1;
          let obsCol = -1;
          let pluCol = -1;

          // Scan top rows for metadata (PEDIDO, OC, DIRECCION, etc.)
          for (let r = 0; r < Math.min(15, rawData.length); r++) {
            const rowStr = (rawData[r] || []).map(c => String(c || '')).join(' ');
            const poMatch = rowStr.match(/PEDIDO:\s*([0-9A-Za-z-]+)/i) || rowStr.match(/OC:\s*([0-9A-Za-z-]+)/i);
            if (poMatch && !poNumber) poNumber = poMatch[1].trim();

            if (headerRowIdx === -1) {
              const rowLower = rowStr.toLowerCase();
              if ((rowLower.includes('plu') || rowLower.includes('prod') || rowLower.includes('articulo')) && 
                  (rowLower.includes('cant') || rowLower.includes('total') || rowLower.includes('pedido') || rowLower.includes('ubm'))) {
                headerRowIdx = r;
                const headerRow = rawData[r] || [];
                headerRow.forEach((c: any, cIdx: number) => {
                  const s = String(c || '').toLowerCase().trim();
                  if (s === 'ca' || s === 'can' || s === 'cant' || s.includes('cantid') || s === 'qty' || s === 'total' || s.includes('total') || s.includes('solic')) {
                    qtyCandidates.push(cIdx);
                  } else if (s.includes('prod') || s.includes('descrip') || s.includes('nombre') || s.includes('articulo') || s.includes('item')) {
                    nameCol = cIdx;
                  } else if (s === 'ubm' || s.includes('unidad') || s === 'und' || s === 'u.m' || s.includes('medida')) {
                    unitCol = cIdx;
                  } else if (s.includes('observ') || s.includes('nota')) {
                    obsCol = cIdx;
                  } else if (s.includes('plu') || s.includes('codigo') || s.includes('cod') || s === 'id') {
                    pluCol = cIdx;
                  }
                });
              }
            }
          }

          // Auto-select best qty column with positive numbers
          let qtyCol = -1;
          if (qtyCandidates.length > 0) {
            let bestCount = -1;
            qtyCandidates.forEach(candCol => {
              let posCount = 0;
              for (let r = (headerRowIdx !== -1 ? headerRowIdx + 1 : 0); r < rawData.length; r++) {
                const val = rawData[r]?.[candCol];
                if (val !== undefined && val !== null && String(val).trim() !== '') {
                  const num = parseFloat(String(val).replace(',', '.').replace(/[^0-9.]/g, ''));
                  if (!isNaN(num) && num > 0) posCount++;
                }
              }
              if (posCount > bestCount) {
                bestCount = posCount;
                qtyCol = candCol;
              }
            });
          }

          if (headerRowIdx !== -1 && nameCol !== -1) {
            for (let r = headerRowIdx + 1; r < rawData.length; r++) {
              const row = rawData[r] || [];
              let qtyNum: number | null = null;

              if (qtyCol !== -1 && row[qtyCol] !== undefined && row[qtyCol] !== null) {
                const rawVal = String(row[qtyCol]).trim();
                const num = parseFloat(rawVal.replace(',', '.').replace(/[^0-9.]/g, ''));
                if (!isNaN(num) && num > 0) qtyNum = num;
              }

              if (qtyNum === null) {
                for (const candCol of qtyCandidates) {
                  if (candCol === qtyCol) continue;
                  const cVal = row[candCol];
                  if (cVal !== undefined && cVal !== null && String(cVal).trim() !== '') {
                    const num = parseFloat(String(cVal).replace(',', '.').replace(/[^0-9.]/g, ''));
                    if (!isNaN(num) && num > 0) {
                      qtyNum = num;
                      break;
                    }
                  }
                }
              }

              if (qtyNum !== null && qtyNum > 0) {
                const rawName = String(row[nameCol] || '').trim();
                const rawUnit = unitCol !== -1 ? String(row[unitCol] || '').trim() : 'Kg';
                const rawObs = obsCol !== -1 ? String(row[obsCol] || '').trim() : '';
                if (rawName) {
                  extractedData.items.push({
                    name: rawName,
                    quantity: qtyNum,
                    unit: rawUnit || 'Kg',
                    observations: rawObs,
                    source_attachment_name: att.name,
                    purchase_order: poNumber || undefined,
                    attachment_index: attIdx
                  } as any);
                  parsedSuccessfully = true;
                }
              }
            }
          }
        } else if (ext === 'pdf' || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
          const base64 = Buffer.from(fileBuf).toString('base64');
          const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

          const prompt = `Eres un experto en digitalización de órdenes de compra B2B de alimentos (Fruver y abarrotes).
Extrae la información del documento "${att.name}" en formato JSON estricto:
- clientName: Razón social del cliente o empresa compradora.
- nit: NIT o documento de identificación fiscal.
- address: Dirección de entrega completa.
- deliveryDate: Fecha de entrega solicitada (formato YYYY-MM-DD o DD/MM/YYYY).
- purchaseOrder: Número de orden de compra o pedido si está presente.
- items: Lista de productos ordenados. Ignora filas con cantidad 0 o vacías.
Cada item debe tener:
  * name: Nombre comercial del producto limpio.
  * quantity: Número decimal o entero mayor a cero.
  * unit: Unidad de medida (Kg, Uds, Atado, Bandeja, etc.).
  * observations: Notas, especificaciones (madurez, corte, calibre) si existen.

Responde ÚNICAMENTE en JSON válido:
{
  "clientName": "...",
  "nit": "...",
  "address": "...",
  "deliveryDate": "...",
  "purchaseOrder": "...",
  "items": [
    { "name": "...", "quantity": 10, "unit": "Kg", "observations": "..." }
  ]
}`;

          const gJson = await fetchGeminiExtraction(apiKey, prompt, base64, mimeType);
          if (gJson && Array.isArray(gJson.items) && gJson.items.length > 0) {
            if (!extractedData.clientName && gJson.clientName) extractedData.clientName = gJson.clientName;
            if (!extractedData.nit && gJson.nit) extractedData.nit = gJson.nit;
            if (!extractedData.address && gJson.address) extractedData.address = gJson.address;
            if (!extractedData.deliveryDate && gJson.deliveryDate) extractedData.deliveryDate = gJson.deliveryDate;

            gJson.items.forEach((it: any) => {
              extractedData.items.push({
                ...it,
                source_attachment_name: att.name,
                purchase_order: gJson.purchaseOrder || undefined,
                attachment_index: attIdx
              });
            });
            parsedSuccessfully = true;
          }
        }
      } catch (attErr) {
        console.warn(`[reparse-draft] Error procesando adjunto ${att.name}:`, attErr);
      }
    }

    // 2. Fallback con texto del correo o cuerpo si no hubo adjunto o falló
    if (!parsedSuccessfully) {
      if (!emailBodyText && !emailSubject) {
        return NextResponse.json({ 
          error: "Este borrador no tiene archivos adjuntos ni texto en el cuerpo para procesar con IA." 
        }, { status: 400 });
      }

      const textPrompt = `Eres un experto en digitalización de órdenes de compra B2B de alimentos (Fruver y abarrotes).
FECHA ACTUAL: ${new Date().toISOString().split('T')[0]}

ASUNTO DEL CORREO: "${emailSubject}"

CUERPO / TEXTO DEL PEDIDO:
"""
${emailBodyText}
"""

Extrae la información en formato JSON estricto:
- clientName: Razón social o nombre comercial del cliente comprador. Revisa firmas y pie de página.
- nit: NIT o documento fiscal si está presente.
- address: Dirección física de entrega limpia.
- deliveryDate: Fecha de entrega solicitada (formato YYYY-MM-DD o DD/MM/YYYY).
- items: Lista de productos solicitados con cantidad mayor a cero.
Cada item debe tener:
  * name: Nombre comercial del producto limpio.
  * quantity: Número decimal o entero mayor a cero.
  * unit: Unidad de medida (Kg, Uds, Atado, Bandeja, etc.).
  * observations: Notas o especificaciones de calidad si existen.

Responde ÚNICAMENTE en JSON válido con el siguiente esquema:
{
  "clientName": "...",
  "nit": "...",
  "address": "...",
  "deliveryDate": "...",
  "items": [
    { "name": "...", "quantity": 10, "unit": "Kg", "observations": "..." }
  ]
}`;

      const textJson = await fetchGeminiExtraction(apiKey, textPrompt);
      if (textJson && Array.isArray(textJson.items)) {
        extractedData = textJson;
        parsedSuccessfully = true;
      }
    }

    // Load active products catalog for automatic SKU matching
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, sku, unit_of_measure');

    const productCatalog = allProducts || [];

    const cleanItems = (extractedData.items || []).filter(it => it.quantity > 0).map(it => {
      const itName = it.name.trim();
      let bestMatch: any = null;
      let bestScore = 0;

      for (const p of productCatalog) {
        const pName = p.name.toLowerCase();
        const search = itName.toLowerCase();
        if (pName === search) {
          bestMatch = p;
          bestScore = 100;
          break;
        }
        if (pName.includes(search) || search.includes(pName)) {
          bestMatch = p;
          bestScore = 90;
        }
      }

      return {
        originalName: itName,
        name: bestMatch ? bestMatch.name : itName,
        quantity: it.quantity,
        unit: it.unit || bestMatch?.unit_of_measure || 'Kg',
        matched_product_id: bestMatch ? bestMatch.id : null,
        confidenceScore: bestScore,
        observations: it.observations || '',
        searchQuery: itName,
        skuQuery: bestMatch ? bestMatch.id : '',
        isConfirmed: !!bestMatch,
        source_attachment_name: (it as any).source_attachment_name,
        purchase_order: (it as any).purchase_order,
        attachment_index: (it as any).attachment_index
      };
    });

    // Update metadata
    if (extractedData.clientName) metadata.clientInDocument = extractedData.clientName;
    if (extractedData.nit) metadata.nit = extractedData.nit;
    if (extractedData.address) metadata.address = extractedData.address;
    if (extractedData.deliveryDate) metadata.deliveryDate = extractedData.deliveryDate;
    if (metadata.attachments && Array.isArray(metadata.attachments)) {
      metadata.attachments.forEach((att: any, attIdx: number) => {
        att.items = cleanItems.filter(ci => ci.attachment_index === attIdx || ci.source_attachment_name === att.name);
      });
    }

    const finalExtracted = [metadata, ...cleanItems];
    await supabase.from('order_drafts').update({
      client_detected_name: metadata.clientInDocument || draft.client_detected_name,
      extracted_items: finalExtracted
    }).eq('id', draftId);

    return NextResponse.json({
      success: true,
      clientName: metadata.clientInDocument,
      nit: metadata.nit,
      address: metadata.address,
      items: cleanItems
    });

  } catch (error: any) {
    console.error("[reparse-draft error]:", error);
    return NextResponse.json({ error: error.message || "Failed to re-parse draft" }, { status: 500 });
  }
}
