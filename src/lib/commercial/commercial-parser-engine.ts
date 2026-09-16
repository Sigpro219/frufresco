import { GoogleGenerativeAI } from '@google/generative-ai';
import { sanitizeDocText, findBestProductMatchDetails, resolveClientProfile } from '@/lib/orders/order-parser-engine';
import * as XLSX from 'xlsx';

export interface CommercialExtractedItem {
  accounting_id?: string;
  client_product_name: string;
  client_proposed_price: number;
  unit: string;
  observations?: string;
  matched_product?: any;
  last_applied_price?: number;
  general_institutional_price?: number;
  cost_basis?: number;
  margin_percent?: number;
  counter_price?: number;
  is_counter_offered?: boolean;
}

export interface CommercialProposalExtraction {
  client_name: string;
  client_nit?: string;
  client_address?: string;
  client_phone?: string;
  validity_start?: string;
  validity_end?: string;
  items: CommercialExtractedItem[];
  observations?: string;
  _modelUsed?: string;
}

/**
 * 🤖 Gemini Prompt especializado en extracción de Propuestas y Tarifas Comerciales
 */
export async function extractCommercialProposalAI(
  apiKey: string,
  subject: string,
  bodyText: string,
  base64Data?: string,
  mimeType: string = 'application/pdf'
): Promise<CommercialProposalExtraction> {
  const prompt = `
    Eres un analista comercial senior experto en negociación B2B de alimentos para FruFresco (Investments Cortés SAS).
    FECHA ACTUAL: ${new Date().toISOString().split('T')[0]}
    
    ASUNTO DEL CORREO: "${subject}"
    
    TEXTO DEL CORREO:
    """
    ${bodyText}
    """
    
    TAREA:
    1. Identifica el nombre de la empresa / cliente que solicita o negocia la cotización.
    2. Identifica el NIT de la empresa si aparece.
    3. Identifica la dirección de entrega o ciudad si aparece.
    4. Identifica el teléfono o contacto si aparece.
    5. Identifica las fechas de vigencia propuestas (inicio y fin) si se mencionan en el correo o adjunto.
    6. Extrae cada uno de los productos solicitados con:
       - accounting_id: Código o referencia contable si está presente en el texto/documento (ej. "1042", "REF-001"), o null si no existe.
       - client_product_name: Nombre exacto con el que el cliente llama al producto en su documento o correo.
       - client_proposed_price: Precio que el cliente ofrece o solicita pagar por unidad (número), o null si es una solicitud de cotización abierta donde nosotros debemos poner el precio.
       - unit: Unidad de medida mencionada (Kg, Und, Gramos, Bolsa, etc.).
       - observations: Cualquier especificación técnica requerida por el cliente (ej. "Maduro", "Verde", "Empacado al vacío", etc.) o null.

    REGLAS CRÍTICAS:
    - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
    - Si las cantidades o precios tienen separadores de miles o decimales, conviértelos a números estándar.
    
    FORMATO JSON ESPERADO:
    {
      "client_name": "Nombre de la Empresa / Cliente",
      "client_nit": "NIT o cédula si está presente o null",
      "client_address": "Dirección si está presente o null",
      "client_phone": "Teléfono si está presente o null",
      "validity_start": "YYYY-MM-DD o null",
      "validity_end": "YYYY-MM-DD o null",
      "observations": "Notas generales de la negociación o null",
      "items": [
        {
          "accounting_id": "1042",
          "client_product_name": "Tomate Chonto",
          "client_proposed_price": 3200,
          "unit": "Kg",
          "observations": "Maduro seleccionado"
        }
      ]
    }
  `;

  const isPdf = mimeType === 'application/pdf';
  const modelsToTry = isPdf
    ? ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    : ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-2.5-flash-lite'];

  let resultText: string | null = null;
  let successfulModel: string = '';
  let lastError: any = null;
  let allModelsNotFound = true;

  for (const modelName of modelsToTry) {
    try {
      const parts: any[] = [];
      if (base64Data && base64Data.trim().length > 0) {
        parts.push({
          inline_data: {
            mime_type: mimeType,
            data: base64Data.trim()
          }
        });
      }
      parts.push({ text: prompt });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts }] }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data?.error?.message || response.statusText || 'Error desconocido';
        console.warn(`[CommercialParserEngine] Error ${response.status} con ${modelName}:`, errorMsg);

        if (response.status !== 404 && response.status !== 410) {
          allModelsNotFound = false;
        }

        if (errorMsg.includes('has no pages') || errorMsg.includes('no pages')) {
          throw new Error('El documento adjunto no contiene páginas legibles o está vacío.');
        }

        lastError = new Error(`[Gemini ${response.status}] ${errorMsg}`);
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) {
        resultText = text;
        successfulModel = modelName;
        break;
      }
    } catch (err: any) {
      if (err.message && err.message.includes('páginas')) {
        throw err;
      }
      lastError = err;
    }
  }

  if (!resultText) {
    if (allModelsNotFound) {
      throw new Error('El modelo de Inteligencia Artificial ya no está vigente. Debe ponerse en contacto con el servicio de soporte técnico de inmediato para actualizarlo.');
    }
    throw lastError || new Error('No fue posible procesar la propuesta comercial con el motor de Inteligencia Artificial.');
  }

  // Parse JSON
  let cleanJson = resultText.trim();
  const match = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) cleanJson = match[1].trim();
  else {
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  const parsed = JSON.parse(cleanJson);
  parsed._modelUsed = successfulModel;
  return parsed;
}

/**
 * 📊 Motor Programático de Extracción de Tablas de Precios en Excel (XLSX)
 */
export function parseExcelPriceProposal(buffer: Buffer): CommercialExtractedItem[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let allRows: any[] = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      const validRows = rows.filter(r => r && Array.isArray(r) && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''));
      if (validRows.length > 0) {
        allRows = allRows.concat(validRows);
      }
    }

    if (allRows.length === 0) return [];

    // Detect header row
    const PRICE_HEADER_REGEX = /^(?:precio|tarifa|costo|vr\.?\s*unit|valor|oferta|propuesta|precio\s*propuesto|precio\s*ofertado)$/i;
    const NAME_HEADER_REGEX = /^(?:producto|descripci[oó]n|item|art[ií]culo|nombre|material)$/i;
    const CODE_HEADER_REGEX = /^(?:c[oó]digo|cod|sku|accounting_id|plu|ref|#)$/i;
    const UNIT_HEADER_REGEX = /^(?:unidad|medida|uom|presentaci[oó]n|um)$/i;

    let headerRowIdx = -1;
    let nameCol = -1;
    let priceCol = -1;
    let codeCol = -1;
    let unitCol = -1;

    for (let r = 0; r < Math.min(allRows.length, 25); r++) {
      const row = allRows[r];
      let rName = -1, rPrice = -1, rCode = -1, rUnit = -1;

      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] || '').trim();
        if (NAME_HEADER_REGEX.test(val)) rName = c;
        else if (PRICE_HEADER_REGEX.test(val)) rPrice = c;
        else if (CODE_HEADER_REGEX.test(val)) rCode = c;
        else if (UNIT_HEADER_REGEX.test(val)) rUnit = c;
      }

      if (rName !== -1 && rPrice !== -1) {
        headerRowIdx = r;
        nameCol = rName;
        priceCol = rPrice;
        codeCol = rCode;
        unitCol = rUnit;
        break;
      }
    }

    // If no explicit header, find column with text and column with price numbers (> 100)
    if (nameCol === -1 || priceCol === -1) {
      for (let r = 0; r < Math.min(allRows.length, 15); r++) {
        const row = allRows[r];
        for (let c = 0; c < row.length - 1; c++) {
          const valText = String(row[c] || '').trim();
          const valNum = parseFloat(String(row[c + 1] || '').replace(/[^0-9.]/g, ''));
          if (valText.length > 3 && isNaN(Number(valText)) && !isNaN(valNum) && valNum >= 100) {
            headerRowIdx = r - 1;
            nameCol = c;
            priceCol = c + 1;
            break;
          }
        }
        if (nameCol !== -1) break;
      }
    }

    if (nameCol === -1 || priceCol === -1) return [];

    const extracted: CommercialExtractedItem[] = [];
    const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

    for (let r = startRow; r < allRows.length; r++) {
      const row = allRows[r];
      if (!row || !Array.isArray(row)) continue;

      const rawName = String(row[nameCol] || '').trim();
      const rawPriceStr = String(row[priceCol] || '').replace(/[\$,\s]/g, '').replace(/\.(?=\d{3})/g, '');
      const rawPrice = parseFloat(rawPriceStr);

      if (!rawName || rawName.length <= 1 || isNaN(rawPrice) || rawPrice <= 0) continue;
      if (/^(?:total|subtotal|iva|firma|observaciones)/i.test(rawName)) continue;

      let codeVal = codeCol !== -1 ? String(row[codeCol] || '').trim() : undefined;
      let unitVal = unitCol !== -1 ? String(row[unitCol] || '').trim() : 'Kg';

      extracted.push({
        accounting_id: codeVal || undefined,
        client_product_name: rawName,
        client_proposed_price: rawPrice,
        unit: unitVal || 'Kg',
        counter_price: rawPrice
      });
    }

    return extracted;
  } catch (err) {
    console.error('[Excel Proposal Parser] Error:', err);
    return [];
  }
}

/**
 * ⚡ Enriquecedor de Precios, Costos y Márgenes contra la Base de Datos
 */
export async function enrichCommercialProposal(
  items: CommercialExtractedItem[],
  clientProfileId: string | null,
  supabaseAdmin: any
): Promise<CommercialExtractedItem[]> {
  // 1. Fetch active products
  const { data: dbProducts } = await supabaseAdmin
    .from('products')
    .select('id, sku, name, unit_of_measure, base_price, accounting_id, iva_rate')
    .eq('is_active', true);

  const catalog = dbProducts || [];

  // 2. Fetch General Institucional pricing model rules
  let generalRulesMap: Record<string, number> = {};
  try {
    const { data: genModel } = await supabaseAdmin
      .from('pricing_models')
      .select('id')
      .eq('name', 'General Institucional')
      .maybeSingle();

    if (genModel) {
      const { data: genRules } = await supabaseAdmin
        .from('pricing_rules')
        .select('product_id, margin_adjustment, target_price')
        .eq('model_id', genModel.id);

      (genRules || []).forEach((r: any) => {
        generalRulesMap[r.product_id] = r.target_price || 0;
      });
    }
  } catch (err) {
    console.warn('[Enricher] Error fetching General Institucional rules:', err);
  }

  // 3. Fetch latest purchase costs / cost matrix
  let costMatrixMap: Record<string, number> = {};
  try {
    const { data: costs } = await supabaseAdmin
      .from('commercial_cost_matrix')
      .select('product_id, manual_cost');
    (costs || []).forEach((c: any) => {
      costMatrixMap[c.product_id] = c.manual_cost;
    });
  } catch (err) {
    console.warn('[Enricher] Error fetching cost matrix:', err);
  }

  // 4. Fetch last applied prices for this client if profile exists
  let lastAppliedMap: Record<string, number> = {};
  if (clientProfileId) {
    try {
      const { data: recentOrders } = await supabaseAdmin
        .from('orders')
        .select('id, created_at')
        .eq('user_id', clientProfileId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentOrders && recentOrders.length > 0) {
        const orderIds = recentOrders.map((o: any) => o.id);
        const { data: recentItems } = await supabaseAdmin
          .from('order_items')
          .select('product_id, unit_price, created_at')
          .in('order_id', orderIds)
          .order('created_at', { ascending: false });

        (recentItems || []).forEach((ri: any) => {
          if (!lastAppliedMap[ri.product_id]) {
            lastAppliedMap[ri.product_id] = ri.unit_price;
          }
        });
      }
    } catch (err) {
      console.warn('[Enricher] Error fetching client order history:', err);
    }
  }

  // Enrich each item
  return items.map((item) => {
    // Match product
    const match = findBestProductMatchDetails(item.client_product_name, catalog);
    const matchedProd = match.product;

    const accountingId = item.accounting_id || (matchedProd ? (matchedProd.accounting_id ? String(matchedProd.accounting_id) : matchedProd.sku) : '');
    const costBasis = matchedProd ? (costMatrixMap[matchedProd.id] || matchedProd.base_price || 0) : 0;
    const lastApplied = matchedProd ? (lastAppliedMap[matchedProd.id] || 0) : 0;
    const genPrice = matchedProd ? (generalRulesMap[matchedProd.id] || (costBasis ? Math.round(costBasis * 1.25) : matchedProd.base_price || 0)) : 0;
    
    // Calculate margin percent for client proposed price
    const proposedPrice = item.client_proposed_price || 0;
    let marginPct = 0;
    if (proposedPrice > 0 && costBasis > 0) {
      marginPct = Math.round(((proposedPrice - costBasis) / proposedPrice) * 100);
    }

    return {
      ...item,
      accounting_id: accountingId,
      matched_product: matchedProd,
      last_applied_price: lastApplied || genPrice,
      general_institutional_price: genPrice,
      cost_basis: costBasis,
      margin_percent: marginPct,
      counter_price: item.counter_price || item.client_proposed_price,
      is_counter_offered: false
    };
  });
}
