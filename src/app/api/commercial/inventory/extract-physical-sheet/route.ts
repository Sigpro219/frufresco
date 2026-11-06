import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionAndRole } from '@/lib/auth';
import { fetchGeminiExtraction } from '@/lib/orders/order-parser-engine';
import { getGeminiApiKey } from '@/lib/ai/aiModelConfig';
import { PhysicalSheetType, RawExtractedSheetRow, parseHandwrittenQuantity } from '@/lib/inventory/physical-sheet-parser';

const SheetTypeSchema = z.enum(['entrada', 'inv_manual', 'desperdicio', 'pedidos_desperdicio', 'donaciones']);
const GeminiExtractionItemSchema = z.object({
  rawProductName: z.string().optional().default(''),
  rawQuantityText: z.union([z.string(), z.number()]).optional().nullable(),
  quantityKg: z.number().optional().nullable(),
  wasteQtyKg: z.union([z.number(), z.string()]).optional().nullable(),
  garbageQtyKg: z.union([z.number(), z.string()]).optional().nullable(),
  rawPresentation: z.string().optional().nullable(),
  unitCostPaid: z.number().optional().nullable(),
  supplierName: z.string().optional().nullable(),
  wasteTypeHint: z.enum(['damage', 'cleaning']).optional().nullable(),
  sourceNote: z.string().optional().nullable()
});
const GeminiResponseSchema = z.object({
  sheetTitleDetected: z.string().optional(),
  dateDetected: z.string().optional(),
  items: z.array(GeminiExtractionItemSchema).optional().default([])
});

function normalizeGeminiItems(rawResponse: unknown): {
  sheetTitleDetected?: string;
  dateDetected?: string;
  items: RawExtractedSheetRow[];
} {
  const parsed = GeminiResponseSchema.safeParse(rawResponse);
  const safeData = parsed.success ? parsed.data : { items: [] };
  const items: RawExtractedSheetRow[] = safeData.items.map(it => {
    const parsedFromText = parseHandwrittenQuantity(it.rawQuantityText ?? it.quantityKg, it.rawPresentation ?? null);
    const parsedQty = parsedFromText > 0 ? parsedFromText : (typeof it.quantityKg === 'number' && it.quantityKg > 0 ? it.quantityKg : 0);
    const wasteQty = parseHandwrittenQuantity(it.wasteQtyKg);
    const garbageQty = parseHandwrittenQuantity(it.garbageQtyKg);
    return {
      rawProductName: String(it.rawProductName || '').trim(),
      rawQuantityText: String(it.rawQuantityText ?? (wasteQty > 0 || garbageQty > 0 ? `Desp:${wasteQty} / Bas:${garbageQty}` : parsedQty)),
      quantityKg: parsedQty > 0 ? parsedQty : (wasteQty + garbageQty),
      wasteQtyKg: wasteQty > 0 ? wasteQty : null,
      garbageQtyKg: garbageQty > 0 ? garbageQty : null,
      rawPresentation: it.rawPresentation ?? null,
      unitCostPaid: typeof it.unitCostPaid === 'number' ? it.unitCostPaid : null,
      supplierName: it.supplierName ?? null,
      wasteTypeHint: it.wasteTypeHint === 'cleaning' || it.wasteTypeHint === 'damage' ? it.wasteTypeHint : null,
      sourceNote: it.sourceNote ?? null
    };
  });
  return {
    sheetTitleDetected: safeData.sheetTitleDetected,
    dateDetected: safeData.dateDetected,
    items: items.filter(r => r.rawProductName.length > 0 && (r.quantityKg > 0 || (r.wasteQtyKg && r.wasteQtyKg > 0) || (r.garbageQtyKg && r.garbageQtyKg > 0)))
  };
}

function buildPromptForSheetType(sheetType: PhysicalSheetType, balanceDate: string): string {
  const typeDescription =
    sheetType === 'entrada'
      ? `PLANILLA DE ENTRADAS / RECEPCIÓN DE MUELLE ("CONTROL DE LLEGADA DE PRODUCTOS" -> Columna G):
         - REGLA INNEGOCIABLE DE UNIDAD DE COMPRA DIRECTA (CERO RECÁLCULOS):
           * En esta lectura SOLO deben entrar los productos por su "unidad de compra" directa (Kg o Unidades), tal como está escrito el número en la columna de cantidad recibida.
           * PROHIBIDO hacer recálculos o multiplicaciones por bultos, canastillas, arrobas o docenas. Lee el número exacto escrito en la cantidad recibida.
           * Únicamente si hay una suma explícita escrita con signo "+" (ej. "408 + 70"), suma los números (478).
         - Captura también el Precio pagado si aparece ("unitCostPaid") y el Nombre del Proveedor ("supplierName").
         - EXTRAE ÚNICAMENTE las filas donde exista una anotación manuscrita de cantidad. Ignora todas las filas impresas en blanco.`
      : sheetType === 'inv_manual'
      ? `PLANILLA DE CONTEO FÍSICO DE BODEGA ("Inventario de bodega - fin de turno" -> Columna T):
         - Es un formato impreso con lista de productos numerados y columna diligenciada a mano al cierre del turno.
         - EXTRAE ÚNICAMENTE los productos que tengan un número escrito a mano. Ignora filas en blanco o con raya ("—", "-").
         - Si una celda tiene una suma escrita a mano (ej. "408 + 70"), suma los valores (478) en "quantityKg" y guarda la expresión original en "rawQuantityText".`
      : sheetType === 'pedidos_desperdicio'
      ? `FORMATO BICOLUMNA DE PRODUCTOS SUSCEPTIBLES A DESPERDICIO DEL PEDIDO ("FORMATO DE DESPERDICIO Y MERMA" -> Columnas Q y R):
         - Es el formato impreso desde el Módulo de Pedidos con los productos susceptibles a desperdicio y DOS columnas manuscritas:
           1. Columna "DESPERDICIO" -> devuélvela en el campo "wasteQtyKg" (alimenta Columna Q).
           2. Columna "BASURA" / "BASURA-MERMA" -> devuélvela en el campo "garbageQtyKg" (alimenta Columna R).
         - EXTRAE ÚNICAMENTE las filas que tengan número escrito a mano en la columna de Desperdicio, en la de Basura, o en ambas. Ignora todas las filas vacías.`
      : sheetType === 'donaciones'
      ? `PLANTILLA FÍSICA DE DONACIONES / BANCO DE ALIMENTOS (Autorizada por Supervisor de Planta -> Columna X):
         - Es un acta o plantilla de donación de alimentos autorizada por el Supervisor de Planta.
         - Extrae cada producto donado ("rawProductName") y su cantidad exacta en Kg o Unidades ("quantityKg").`
      : `FORMATO FÍSICO DE DESPERDICIO Y DESCAPOTE ("FORMATO DESPERDICIO" -> Columnas Q y R):
         - Extrae cada fila escrita a mano.
         - Si el documento tiene 2 columnas separadas para "DESPERDICIO" y "BASURA / MERMA", llena "wasteQtyKg" y "garbageQtyKg".
         - Si es una sola columna de cantidad, llena "quantityKg" y clasifica en "wasteTypeHint": "cleaning" si es cáscara/descapote/rama/hoja/tallo, o "damage" si es avería/desperdicio.`;

  return `
Eres un auditor experto en agro-logística de FruFresco (Investments Cortés S.A.S. - Bogotá).
Analiza con precisión milimétrica esta imagen/documento correspondiente a la fecha contable ${balanceDate}.

TIPO DE DOCUMENTO A PROCESAR:
${typeDescription}

REGLAS ESTRICTAS DE EXTRACCIÓN:
1. Devuelve ÚNICAMENTE un objeto JSON válido, sin bloques markdown adicionales ni comentarios.
2. Extrae EXCLUSIVAMENTE los renglones que tengan cantidades reales diligenciadas. Cero filas vacías.
3. En números con coma o punto decimal (ej. "9,9" o "184,7"), conviértelos siempre a número flotante estándar con punto (9.9, 184.7).
4. En cantidades de peso, la letra "K" significa Kilogramos (NO significa mil): "170K" = 170, "55K" = 55.
5. PROHIBIDO hacer recálculos mayoristas: respeta el valor numérico directo escrito en unidad de compra (Kg o Unidad).

ESTRUCTURA JSON EXACTA REQUERIDA:
{
  "sheetTitleDetected": "Título leído en el encabezado del documento",
  "dateDetected": "YYYY-MM-DD o texto de fecha leído",
  "items": [
    {
      "rawProductName": "Nombre del producto tal como aparece impreso o manuscrito",
      "rawQuantityText": "Texto exacto de la cantidad escrita",
      "quantityKg": 478,
      "wasteQtyKg": null,
      "garbageQtyKg": null,
      "rawPresentation": null,
      "unitCostPaid": null,
      "supplierName": null,
      "wasteTypeHint": "damage o cleaning o null",
      "sourceNote": null
    }
  ]
}
`;
}

export async function POST(req: Request) {
  try {
    const auth = await verifySessionAndRole(req);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || 'No autorizado para extraer planillas físicas con IA.' },
        { status: 401 }
      );
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key de Gemini no configurada en el servidor.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const sheetTypeParse = SheetTypeSchema.safeParse(formData.get('sheetType') || 'inv_manual');
    if (!sheetTypeParse.success) {
      return NextResponse.json({ error: 'Tipo de planilla física inválido.' }, { status: 400 });
    }
    const sheetType: PhysicalSheetType = sheetTypeParse.data;
    const balanceDate = (formData.get('balanceDate') as string) || new Date().toISOString().split('T')[0];
    const textInput = (formData.get('text') as string) || '';
    const uploadedFiles = formData.getAll('files') as File[];

    if (uploadedFiles.length === 0 && !textInput.trim()) {
      return NextResponse.json(
        { error: 'Debes adjuntar al menos una foto/PDF de la planilla física o pegar el texto a procesar.' },
        { status: 400 }
      );
    }

    const basePrompt = buildPromptForSheetType(sheetType, balanceDate);
    const resultsByFile: Array<{
      fileName: string;
      sheetTitleDetected?: string;
      dateDetected?: string;
      items: RawExtractedSheetRow[];
    }> = [];

    for (const file of uploadedFiles) {
      if (!file || file.size === 0) continue;
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const rawResponse = await fetchGeminiExtraction(apiKey, basePrompt, base64Data, mimeType);
      const normalized = normalizeGeminiItems(rawResponse);

      resultsByFile.push({
        fileName: file.name,
        sheetTitleDetected: normalized.sheetTitleDetected || file.name,
        dateDetected: normalized.dateDetected || balanceDate,
        items: normalized.items
      });
    }

    if (textInput.trim().length > 0) {
      const textPrompt = `${basePrompt}\n\nTEXTO A PROCESAR:\n"""\n${textInput.trim()}\n"""`;
      const rawResponse = await fetchGeminiExtraction(apiKey, textPrompt);
      const normalized = normalizeGeminiItems(rawResponse);

      resultsByFile.push({
        fileName: 'Texto / WhatsApp',
        sheetTitleDetected: 'Transcripción de Texto / WhatsApp',
        dateDetected: balanceDate,
        items: normalized.items
      });
    }

    return NextResponse.json({
      success: true,
      sheetType,
      balanceDate,
      filesProcessed: resultsByFile.length,
      results: resultsByFile
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inesperado al extraer planilla física con IA';
    console.error('[ExtractPhysicalSheet API Error]:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
