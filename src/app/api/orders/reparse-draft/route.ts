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

    // 1. Intento con archivo adjunto si existe URL
    if (attachmentUrl) {
      try {
        const fileRes = await fetch(attachmentUrl);
        if (fileRes.ok) {
          const fileBuf = await fileRes.arrayBuffer();
          const ext = attachmentName.split('.').pop()?.toLowerCase() || '';

          if (ext === 'pdf' || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
            const base64 = Buffer.from(fileBuf).toString('base64');
            const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

            const prompt = `Eres un experto en digitalización de órdenes de compra B2B de alimentos (Fruver y abarrotes).
Extrae la información en formato JSON estricto:
- clientName: Razón social del cliente o empresa compradora.
- nit: NIT o documento de identificación fiscal.
- address: Dirección de entrega completa.
- deliveryDate: Fecha de entrega solicitada (formato YYYY-MM-DD o DD/MM/YYYY).
- items: Lista de productos ordenados. Ignora filas con cantidad 0 o vacías. Limpia nombres de productos (une palabras separadas por espacios anormales como "A GUA CATES" -> "Aguacate", "ARRA CACHA" -> "Arracacha").
Cada item debe tener:
  * name: Nombre comercial del producto limpio.
  * quantity: Número decimal o entero mayor a cero.
  * unit: Unidad de medida (Kg, Uds, Atado, Bandeja, etc.).
  * observations: Notas, especificaciones (madurez, corte, calibre) si existen.

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

            const gJson = await fetchGeminiExtraction(apiKey, prompt, base64, mimeType);
            if (gJson && Array.isArray(gJson.items)) {
              extractedData = gJson;
              parsedSuccessfully = true;
            }
          } else if (ext === 'xlsx' || ext === 'xls') {
            const workbook = XLSX.read(fileBuf, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:Z100');

            let headerRowIdx = -1;
            let qtyCol = -1;
            let nameCol = -1;
            let unitCol = -1;
            let obsCol = -1;

            for (let R = range.s.r; R <= range.e.r; R++) {
              const rowCells: any[] = [];
              for (let C = range.s.c; C <= range.e.c; C++) {
                const cellRef = XLSX.utils.encode_cell({ c: C, r: R });
                const cell = worksheet[cellRef];
                rowCells.push(cell ? cell.v : '');
              }

              if (headerRowIdx === -1) {
                const isHeader = rowCells.some(c => {
                  const s = String(c || '').toLowerCase().trim();
                  return s === 'plu' || s === 'prodcuto' || s === 'producto';
                });
                if (isHeader) {
                  headerRowIdx = R;
                  rowCells.forEach((c, cIdx) => {
                    const s = String(c || '').toLowerCase().trim();
                    if (s === 'ca' || s === 'can' || s === 'cant' || s.includes('cantid') || s === 'qty') qtyCol = cIdx;
                    else if (s.includes('prod') || s.includes('descrip')) nameCol = cIdx;
                    else if (s === 'ubm' || s.includes('unidad') || s === 'und') unitCol = cIdx;
                    else if (s.includes('observ') || s.includes('nota')) obsCol = cIdx;
                  });
                }
              } else if (qtyCol !== -1 && nameCol !== -1) {
                const rawQty = rowCells[qtyCol];
                if (rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== '') {
                  const num = parseFloat(String(rawQty).replace(',', '.'));
                  if (!isNaN(num) && num > 0) {
                    const nameVal = String(rowCells[nameCol] || '').trim();
                    const unitVal = unitCol !== -1 ? String(rowCells[unitCol] || '').trim() : 'Kg';
                    const obsVal = obsCol !== -1 ? String(rowCells[obsCol] || '').trim() : '';
                    if (nameVal) {
                      extractedData.items.push({
                        name: nameVal,
                        quantity: num,
                        unit: unitVal,
                        observations: obsVal
                      });
                    }
                  }
                }
              }
            }
            parsedSuccessfully = extractedData.items.length > 0;
          }
        }
      } catch (attErr) {
        console.warn("[reparse-draft] Error procesando archivo adjunto, intentando fallback de texto:", attErr);
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
        isConfirmed: !!bestMatch
      };
    });

    // Update metadata
    if (extractedData.clientName) metadata.clientInDocument = extractedData.clientName;
    if (extractedData.nit) metadata.nit = extractedData.nit;
    if (extractedData.address) metadata.address = extractedData.address;
    if (extractedData.deliveryDate) metadata.deliveryDate = extractedData.deliveryDate;
    if (metadata.attachments && metadata.attachments[0]) {
      metadata.attachments[0].items = cleanItems;
      metadata.attachments[0].clientInDocument = metadata.clientInDocument;
      metadata.attachments[0].nit = metadata.nit;
      metadata.attachments[0].address = metadata.address;
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
