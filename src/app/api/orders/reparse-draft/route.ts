import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

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
      return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    }

    const rawItems = draft.extracted_items || [];
    const metadata = (Array.isArray(rawItems) ? rawItems.find((it: any) => it.isMetadata) : {}) || {};
    const attachmentUrl = metadata.attachments?.[0]?.url || metadata.attachmentUrl;
    const attachmentName = metadata.attachments?.[0]?.name || metadata.attachmentName || 'documento.pdf';

    if (!attachmentUrl) {
      return NextResponse.json({ error: "Draft has no attachment URL" }, { status: 400 });
    }

    const ext = attachmentName.split('.').pop()?.toLowerCase() || '';
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "Gemini API key not configured on server" }, { status: 500 });
    }

    // Fetch attachment file buffer
    const fileRes = await fetch(attachmentUrl);
    if (!fileRes.ok) throw new Error("Failed to download attachment from storage");
    const fileBuf = await fileRes.arrayBuffer();

    let extractedData: {
      clientName?: string;
      nit?: string;
      address?: string;
      deliveryDate?: string;
      items: Array<{ name: string; quantity: number; unit?: string; observations?: string }>;
    } = { items: [] };

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

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          response_mime_type: 'application/json'
        }
      };

      const gRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!gRes.ok) {
        const errText = await gRes.text();
        throw new Error(`Gemini API Error: ${errText}`);
      }

      const gJson = await gRes.json();
      const text = gJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        extractedData = JSON.parse(text);
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
