import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import { fetchGeminiExtraction, findBestProductMatchDetails } from '@/lib/orders/order-parser-engine';

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

    // 1. Process each attachment with Gemini Multimodal / Structured LLM Engine
    for (let attIdx = 0; attIdx < attachmentsList.length; attIdx++) {
      const att = attachmentsList[attIdx];
      try {
        const fileRes = await fetch(att.url);
        if (!fileRes.ok) continue;

        const fileBuf = await fileRes.arrayBuffer();
        const ext = (att.name || '').split('.').pop()?.toLowerCase() || '';

        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
          const workbook = XLSX.read(fileBuf, { type: 'array' });
          let csvContent = "";
          workbook.SheetNames.forEach(sheetName => {
            csvContent += `\n--- Hoja: ${sheetName} ---\n`;
            csvContent += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
          });

          const prompt = `Eres un asistente experto en logística para FruFresco.
Analiza este archivo Excel adjunto ("${att.name}") y extrae la orden de compra de alimentos (Fruver y abarrotes).

TAREA:
1. Identifica el nombre o razón social del CLIENTE comprador principal en "clientName" (frecuentemente en encabezado o sucursal matriz).
2. Identifica si hay un número de NIT o Cédula en "nit".
3. Identifica la DIRECCIÓN de entrega o envío en "address".
4. Identifica la FECHA DE ENTREGA principal en "deliveryDate".
5. Identifica el NÚMERO DE ORDEN DE COMPRA (OC / OP / SOLPED / Pedido) en "purchaseOrder".
6. Extrae todos los productos solicitados en "items":
   - "name": Nombre comercial del producto en español limpio (ej. "AGUACATE", "AJO", "APIO", "BANANO CRIOLLO", "CEBOLLA CABEZONA BLANCA", "CILANTRO"). NUNCA uses códigos numéricos (como columnas PLU, ID, CÓDIGO o EAN) como el nombre del producto; extrae SIEMPRE la descripción o nombre en español del alimento.
   - "quantity": Cantidad numérica mayor a cero (ej. 4, 0.5, 70, 6). Si hay columnas para una sede o destino específico (ej. "JARDIN RICAURTE"), toma la cantidad indicada para ese destino.
   - "unit": Unidad de medida o presentación exacta (ej. "KG", "UND", "UNIDAD", "KILO", "BOLSA", "LBS", etc.).
   - "observations": Cualquier nota de especificación, calidad, corte, madurez, código PLU/código del cliente o entrega diferida.

REGLAS CRÍTICAS:
- Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
- Las cantidades deben ser números.
- Ignora filas de totales, resúmenes o productos con cantidad 0 o vacía.

FORMATO DE RESPUESTA ESPERADO:
{
  "clientName": "...",
  "nit": "...",
  "address": "...",
  "deliveryDate": "...",
  "purchaseOrder": "...",
  "items": [
    { "name": "AGUACATE", "quantity": 4, "unit": "KILO", "observations": "PLU 33" }
  ]
}

CONTENIDO DEL ARCHIVO EXCEL EN FORMATO CSV:
${csvContent}`;

          const gJson = await fetchGeminiExtraction(apiKey, prompt);
          if (gJson && Array.isArray(gJson.items) && gJson.items.length > 0) {
            if (!extractedData.clientName && gJson.clientName) extractedData.clientName = gJson.clientName;
            if (!extractedData.nit && gJson.nit) extractedData.nit = gJson.nit;
            if (!extractedData.address && gJson.address) extractedData.address = gJson.address;
            if (!extractedData.deliveryDate && gJson.deliveryDate) extractedData.deliveryDate = gJson.deliveryDate;

            gJson.items.forEach((it: any) => {
              if (it && it.name && !isNaN(Number(it.quantity)) && Number(it.quantity) > 0) {
                extractedData.items.push({
                  name: String(it.name).trim(),
                  quantity: Number(it.quantity),
                  unit: it.unit || 'Kg',
                  observations: it.observations || '',
                  source_attachment_name: att.name,
                  purchase_order: gJson.purchaseOrder || undefined,
                  attachment_index: attIdx
                });
                parsedSuccessfully = true;
              }
            });
          }
        } else if (ext === 'pdf' || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
          const base64 = Buffer.from(fileBuf).toString('base64');
          const mimeType = ext === 'pdf' ? 'application/pdf' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;

          const prompt = `Eres un asistente experto en digitalización de órdenes de compra B2B de alimentos para FruFresco.
Analiza este documento adjunto ("${att.name}") y extrae la orden de compra en formato JSON estricto:
- clientName: Razón social del cliente o empresa compradora matriz.
- nit: NIT o documento de identificación fiscal.
- address: Dirección de entrega completa.
- deliveryDate: Fecha de entrega solicitada (formato YYYY-MM-DD o DD/MM/YYYY).
- purchaseOrder: Número de orden de compra (OC, OP, SOLPED) si está presente.
- items: Lista de productos ordenados. Ignora filas con cantidad 0 o vacías.
Cada item debe tener:
  * name: Nombre comercial del producto limpio en español. NUNCA uses códigos PLU o IDs como nombre.
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
              if (it && it.name && !isNaN(Number(it.quantity)) && Number(it.quantity) > 0) {
                extractedData.items.push({
                  name: String(it.name).trim(),
                  quantity: Number(it.quantity),
                  unit: it.unit || 'Kg',
                  observations: it.observations || '',
                  source_attachment_name: att.name,
                  purchase_order: gJson.purchaseOrder || undefined,
                  attachment_index: attIdx
                });
                parsedSuccessfully = true;
              }
            });
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

      const textPrompt = `Eres un experto en digitalización de órdenes de compra B2B de alimentos para FruFresco.
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
- purchaseOrder: Número de orden de compra o pedido si existe.
- items: Lista de productos solicitados con cantidad mayor a cero.
Cada item debe tener:
  * name: Nombre comercial del producto limpio en español.
  * quantity: Número decimal o entero mayor a cero.
  * unit: Unidad de medida (Kg, Uds, Atado, Bandeja, etc.).
  * observations: Notas o especificaciones de calidad si existen.

Responde ÚNICAMENTE en JSON válido con el siguiente esquema:
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

      const textJson = await fetchGeminiExtraction(apiKey, textPrompt);
      if (textJson && Array.isArray(textJson.items)) {
        extractedData = textJson;
        parsedSuccessfully = true;
      }
    }

    // Load active products catalog for automatic SKU matching
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, sku, unit_of_measure, base_price, weight_kg, options_config')
      .eq('is_active', true);

    const productCatalog = allProducts || [];

    // Load client exceptions / nicknames memory if profile is assigned
    let learnedMemory: any[] = [];
    if (draft.profile_id) {
      const { data: memData } = await supabase
        .from('product_nicknames')
        .select('*')
        .eq('customer_id', draft.profile_id);
      if (memData) learnedMemory = memData;
    }

    const cleanItems = (extractedData.items || []).filter(it => it.quantity > 0).map(it => {
      const itName = it.name.trim();
      const matchResult = findBestProductMatchDetails(itName, productCatalog, learnedMemory);
      const matchedProd = matchResult.product;

      return {
        originalName: itName,
        name: matchedProd ? matchedProd.name : itName,
        quantity: it.quantity,
        unit: it.unit || matchedProd?.unit_of_measure || 'Kg',
        matched_product_id: matchedProd ? matchedProd.id : null,
        confidenceScore: matchResult.confidenceScore,
        confidence: matchResult.confidence,
        matchSource: matchResult.matchSource,
        matchReason: matchResult.matchReason,
        observations: it.observations || '',
        searchQuery: itName,
        skuQuery: matchedProd ? matchedProd.id : '',
        isConfirmed: !!matchedProd,
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
