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
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash'
  ];

  const prompt = `
    Eres un analista comercial senior experto en negociación B2B de alimentos para FruFresco (Investments Cortés SAS).
    FECHA ACTUAL: ${new Date().toISOString().split('T')[0]}
    
    ASUNTO DEL CORREO: "${subject}"
    
    TEXTO DEL CORREO:
    """
    ${bodyText}
    """
    
    TAREA:
    1. Analiza el documento adjunto o texto para extraer la propuesta de PRECIOS / TARIFAS comerciales enviada por el cliente.
    2. Identifica el nombre de la empresa / cliente, NIT, dirección, teléfono y el período de vigencia solicitado (ej. "Septiembre 2026", "Semana 35", etc.).
    3. Para cada ítem/producto solicitado, extrae:
       - "accounting_id": Código contable, PLU o SKU del cliente si está presente (ej. "1042", "PLU-201"), o null.
       - "client_product_name": Nombre exacto del producto tal como lo solicita el cliente.
       - "client_proposed_price": Precio unitario numérico ofertado/propuesto por el cliente (ej. 3500. Sin símbolos de moneda ni comas de miles).
       - "unit": Unidad de medida (Kg, Lb, Unidad, Caja, Litro, etc.). Si no se especifica, usa "Kg".
       - "observations": Especificaciones de calidad o notas asociadas al producto.
    
    REGLAS CRÍTICAS:
    - Extrae el PRECIO o TARIFA del producto, NO cantidades pedidas.
    - Las cifras en "client_proposed_price" deben ser estrictamente numéricas (ej. 4200).
    - Omite filas de subtotales, totales, impuestos o encabezados repetidos.
    - Devuelve ÚNICAMENTE un objeto JSON puro con la estructura especificada.

    FORMATO DE RESPUESTA ESPERADO:
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

  let resultText: string | null = null;
  let successfulModel: string = '';
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const contents: any[] = [];
      if (base64Data) {
        contents.push({ inlineData: { data: base64Data, mimeType } });
      }
      contents.push({ text: prompt });

      const res = await model.generateContent(contents);
      const text = (await res.response).text().trim();
      if (text) {
        resultText = text;
        successfulModel = modelName;
        break;
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  if (!resultText) {
    throw lastError || new Error('No se pudo procesar la propuesta con Gemini.');
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
