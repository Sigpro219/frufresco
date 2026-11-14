import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifySessionAndRole } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase';
import { fetchGeminiExtraction } from '@/lib/orders/order-parser-engine';
import { getGeminiApiKey } from '@/lib/ai/aiModelConfig';
import { PhysicalSheetType, RawExtractedSheetRow, normalizeGeminiItems } from '@/lib/inventory/physical-sheet-parser';

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

function parseAndNormalizeGeminiResponse(rawResponse: unknown): {
  sheetTitleDetected?: string;
  dateDetected?: string;
  items: RawExtractedSheetRow[];
} {
  const parsed = GeminiResponseSchema.safeParse(rawResponse);
  const safeData = parsed.success ? parsed.data : { items: [] };
  return {
    sheetTitleDetected: safeData.sheetTitleDetected,
    dateDetected: safeData.dateDetected,
    items: normalizeGeminiItems(safeData.items)
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
         - Si un producto tiene una línea horizontal atravesada ("—", "-", raya) o no tiene valor en la casilla de cantidad, asígnale quantityKg: 0 y rawQuantityText: "0".`
      : sheetType === 'inv_manual'
      ? `PLANILLA DE CONTEO FÍSICO DE BODEGA ("Inventario de bodega - fin de turno" -> Columna T):
         - Es un formato impreso de 4 columnas por bloque: "N°" | "ID" | "Producto" | "KG" (diligenciada a mano al cierre del turno).
         - La columna "N°" (1, 2, 3...) es SOLO el consecutivo marginal de fila: IGNÓRALO.
         - La columna "ID" contiene el código contable exacto (accountingId, ej. "106", "1582"). Extráelo SIEMPRE en el campo "accountingId" (solo dígitos).
         - La columna "Producto" contiene el nombre limpio del producto ("rawProductName"). Si es un formato antiguo sin columna "ID" separada y trae "#ID" dentro del texto, extráelo igual en "accountingId" y limpia "rawProductName".
         - Si la casilla "KG" tiene una línea horizontal atravesada ("—", "-", raya) o está en blanco / sin valor escrito, asigna obligatoriamente quantityKg: 0 y rawQuantityText: "0".
         - Si una celda tiene una suma escrita a mano (ej. "408 + 70"), suma los valores (478) en "quantityKg" y guarda la expresión original en "rawQuantityText".`
      : sheetType === 'pedidos_desperdicio'
      ? `FORMATO BICOLUMNA DE PRODUCTOS SUSCEPTIBLES A DESPERDICIO DEL PEDIDO ("FORMATO DE DESPERDICIO Y MERMA" -> Columnas Q y R):
         - Es el formato impreso desde el Módulo de Pedidos con los productos susceptibles a desperdicio y DOS columnas manuscritas:
           1. Columna "DESPERDICIO" -> devuélvela en el campo "wasteQtyKg" (alimenta Columna Q).
           2. Columna "BASURA" / "BASURA-MERMA" -> devuélvela en el campo "garbageQtyKg" (alimenta Columna R).
         - Si tiene raya atravesada ("—") o no hay valor, toma la cantidad como 0.`
      : sheetType === 'donaciones'
      ? `PLANTILLA FÍSICA DE DONACIONES / BANCO DE ALIMENTOS (Autorizada por Supervisor de Planta -> Columna X):
         - Es un acta o plantilla de donación de alimentos autorizada por el Supervisor de Planta.
         - Extrae cada producto donado ("rawProductName") y su cantidad exacta en Kg o Unidades ("quantityKg"). Si tiene raya atravesada o sin valor, tómalo como 0.`
      : `FORMATO FÍSICO DE DESPERDICIO Y DESCAPOTE ("FORMATO DESPERDICIO" -> Columnas Q y R):
         - Extrae cada fila. Si tiene raya atravesada ("—") o sin valor, toma quantityKg: 0.
         - Si el documento tiene 2 columnas separadas para "DESPERDICIO" y "BASURA / MERMA", llena "wasteQtyKg" y "garbageQtyKg".
         - Si es una sola columna de cantidad, llena "quantityKg" y clasifica en "wasteTypeHint": "cleaning" si es cáscara/descapote/rama/hoja/tallo, o "damage" si es avería/desperdicio.`;

  return `
Eres un auditor experto en agro-logística de FruFresco (Investments Cortés S.A.S. - Bogotá).
Analiza con precisión milimétrica esta imagen/documento correspondiente a la fecha contable ${balanceDate}.

TIPO DE DOCUMENTO A PROCESAR:
${typeDescription}

REGLAS ESTRICTAS DE EXTRACCIÓN:
1. Devuelve ÚNICAMENTE un objeto JSON válido, sin bloques markdown adicionales ni comentarios.
2. REGLA DE LÍNEA ATRAVESADA O SIN VALOR = CERO (0): Cuando un renglón tenga una línea horizontal atravesada ("—", "-", raya) o su casilla de cantidad esté vacía / sin valor, regístralo SIEMPRE como cero: "quantityKg": 0 y "rawQuantityText": "0". JAMÁS interpretes una raya horizontal como el número 1 o 11.
3. En números con coma o punto decimal (ej. "9,9", "8,50" o "184,7"), conviértelos siempre a número flotante estándar con punto (9.9, 8.5, 184.7).
4. En cantidades de peso, la letra "K" significa Kilogramos (NO significa mil): "170K" = 170, "55K" = 55.
5. PROHIBIDO hacer recálculos mayoristas: respeta el valor numérico directo escrito en la columna KG (no dupliques un mismo renglón si tiene una nota lateral; toma el valor de la columna KG).
6. Remueve el número de orden inicial y el badge "#ID" del nombre del producto (ej. "1. #106 Cebolla cabezona blanca" -> rawProductName: "Cebolla cabezona blanca", accountingId: "106"). Nunca confundas el consecutivo de fila (1, 2, 3...) con el accountingId (#ID).

ESTRUCTURA JSON EXACTA REQUERIDA (Omite campos que sean null para máxima velocidad):
{
  "sheetTitleDetected": "Título leído",
  "dateDetected": "YYYY-MM-DD",
  "items": [
    {
      "accountingId": "106",
      "rawProductName": "Nombre del producto",
      "rawQuantityText": "Texto de la cantidad escrita",
      "quantityKg": 478
    }
  ]
}
(Nota: Solo incluye "wasteQtyKg", "garbageQtyKg", "unitCostPaid", "supplierName" o "wasteTypeHint" cuando tengan valor real en la fila).
`;
}

export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const auth = await verifySessionAndRole(req);
    if (!auth.authorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const rawName = searchParams.get('fileName') || 'planilla.pdf';
    const cleanName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `temp-ocr/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${cleanName}`;

    const supabaseAdmin = createAdminClient();
    await supabaseAdmin.storage.createBucket('inventory-evidence', { public: true }).catch(() => null);

    const { data, error } = await supabaseAdmin.storage
      .from('inventory-evidence')
      .createSignedUploadUrl(storagePath);

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'No se pudo crear canal de carga' }, { status: 500 });
    }

    const { data: pubUrl } = supabaseAdmin.storage.from('inventory-evidence').getPublicUrl(storagePath);
    return NextResponse.json({
      success: true,
      path: storagePath,
      token: data.token,
      signedUrl: data.signedUrl,
      publicUrl: pubUrl.publicUrl
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error creando URL firmada' },
      { status: 500 }
    );
  }
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
    const fileUrl = (formData.get('fileUrl') as string) || '';
    const storagePath = (formData.get('storagePath') as string) || '';
    const remoteFileName = (formData.get('fileName') as string) || 'Planilla_Escaneada.pdf';
    const remoteMimeType = (formData.get('fileMimeType') as string) || 'application/pdf';

    // Soportar tanto 'file' (1:1 con /api/ai/extract-order) como 'files'
    const singleFile = formData.get('file') as File | null;
    const multiFiles = formData.getAll('files') as File[];
    const uploadedFiles: File[] = [
      ...(singleFile ? [singleFile] : []),
      ...multiFiles
    ];

    if (uploadedFiles.length === 0 && !fileUrl.trim() && !textInput.trim()) {
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

    // Si el archivo pesado (> 3.2 MB) vino vía Supabase Storage URL para evitar el límite 413 de Vercel
    if (fileUrl.trim()) {
      const remoteRes = await fetch(fileUrl.trim());
      if (storagePath.trim()) {
        void createAdminClient().storage.from('inventory-evidence').remove([storagePath.trim()]).catch(() => null);
      }
      if (!remoteRes.ok) {
        throw new Error(`No se pudo descargar el documento desde el canal seguro (${remoteRes.status}).`);
      }
      const arrayBuffer = await remoteRes.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const rawResponse = await fetchGeminiExtraction(apiKey, basePrompt, base64Data, remoteMimeType, 90000);
      const normalized = parseAndNormalizeGeminiResponse(rawResponse);
      resultsByFile.push({
        fileName: remoteFileName,
        sheetTitleDetected: normalized.sheetTitleDetected || remoteFileName,
        dateDetected: normalized.dateDetected || balanceDate,
        items: normalized.items
      });
    }

    const validFiles = uploadedFiles.filter(file => file && file.size > 0);
    const fileResults = await Promise.all(
      validFiles.map(async file => {
        const ab = await file.arrayBuffer();
        const fileBytes = new Uint8Array(ab);
        const lowerName = file.name.toLowerCase();
        const isSpreadsheet = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');

        let rawResponse: unknown;
        if (isSpreadsheet) {
          const XLSX = await import('xlsx');
          const workbook = XLSX.read(fileBytes, { type: 'array' });
          const sheetTexts: string[] = [];
          workbook.SheetNames.forEach(sheetName => {
            const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName], { blankrows: false });
            if (csv.trim()) sheetTexts.push(`--- HOJA: ${sheetName} ---\n${csv}`);
          });
          const excelPrompt = `${basePrompt}\n\nCONTENIDO DEL ARCHIVO EXCEL (${file.name}):\n"""\n${sheetTexts.join('\n\n')}\n"""`;
          rawResponse = await fetchGeminiExtraction(apiKey, excelPrompt, undefined, 'application/pdf', 90000);
        } else {
          const base64Data = Buffer.from(fileBytes).toString('base64');
          const mimeType = file.type || (lowerName.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
          rawResponse = await fetchGeminiExtraction(apiKey, basePrompt, base64Data, mimeType, 90000);
        }
        const normalized = parseAndNormalizeGeminiResponse(rawResponse);

        return {
          fileName: file.name,
          sheetTitleDetected: normalized.sheetTitleDetected || file.name,
          dateDetected: normalized.dateDetected || balanceDate,
          items: normalized.items
        };
      })
    );
    resultsByFile.push(...fileResults);

    if (textInput.trim().length > 0) {
      const textPrompt = `${basePrompt}\n\nTEXTO A PROCESAR:\n"""\n${textInput.trim()}\n"""`;
      const rawResponse = await fetchGeminiExtraction(apiKey, textPrompt);
      const normalized = parseAndNormalizeGeminiResponse(rawResponse);

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
