import { NextResponse } from 'next/server';
import { fetchGeminiExtraction } from '@/lib/orders/order-parser-engine';
import { getGeminiApiKey } from '@/lib/ai/aiModelConfig';
import { PhysicalSheetType, RawExtractedSheetRow, parseHandwrittenQuantity } from '@/lib/inventory/physical-sheet-parser';

function buildPromptForSheetType(sheetType: PhysicalSheetType, balanceDate: string): string {
  const typeDescription =
    sheetType === 'entrada'
      ? `PLANILLA DE ENTRADAS / RECEPCIÓN DE MUELLE ("CONTROL DE LLEGADA DE PRODUCTOS EN KG"):
         - Es un formato impreso a doble columna o una hoja manuscrita de recepción de compras en bodega (Corabastos).
         - Contiene: Nombre del Producto, Presentación mayorista anotada a mano (ej. "12 At", "70 doc", "1 bto", "5 cjs"), Peso final en KG (ej. "170 K", "740 K", "48"), Precio pagado si aparece (ej. "4500 pago", "120000 pago", "9500") y Nombre del Proveedor (ej. "Andrés", "Evelia", "Faco", "Sofía").
         - EXTRAE ÚNICAMENTE las filas donde exista una anotación manuscrita de cantidad. Ignora todas las filas impresas que estén vacías en blanco.`
      : sheetType === 'inv_manual'
      ? `PLANILLA DE CONTEO FÍSICO DE BODEGA ("Inventario de bodega - papas, frutas, hortalizas, verduras, abarrotes"):
         - Es un formato impreso con lista de productos numerados y columna "KG" diligenciada a mano con lapicero al cierre del turno.
         - También puede incluir productos agregados a mano al final de la tabla (ej. "Papa sabanera en cambio 41", "Hinojo 0.8", "Yerbabuena 1").
         - EXTRAE ÚNICAMENTE los productos que tengan un número escrito a mano.
         - IGNORA las filas en blanco y las filas que solo tengan una raya horizontal ("—", "-").
         - Si una celda tiene una suma escrita a mano (ej. "408 + 70" o "28 + 3"), suma los valores (ej. 478, 31) en "quantityKg" y guarda la expresión original en "rawQuantityText".
         - Si dice "12 1/2" o "4 1/2", conviértelo a decimal (12.5, 4.5).`
      : `FORMATO FÍSICO DE DESPERDICIO Y DESCAPOTE ("FORMATO DESPERDICIO"):
         - Es una planilla manuscrita con columnas: No. | PRODUCTO | DESPERDICIO KG | PESADAS KG | ARREGLO.
         - Extrae cada fila escrita a mano.
         - Si en PRODUCTO dice por ejemplo "Acelga Inventario" o "Acelga Ingreso hoy", pon el nombre completo en "rawProductName" y guarda "Inventario" o "Ingreso hoy" en "sourceNote".
         - Si hay sumas como "29.1 + 39.4 + 20.5", calcula la suma exacta (89.0) en "quantityKg" y conserva "29.1 + 39.4 + 20.5" en "rawQuantityText".
         - Clasifica en "wasteTypeHint":
           * Usa "cleaning" si es cáscara, descapote, rama, hoja, tallo, pelado o limpieza (ej. "Cascara Cebolla Roja", "Cascara Ceboll Blanca", "Cascara de yuca", "Rama Ceboll larga").
           * Usa "damage" para el resto de productos dañados, picados, maduros o desperdicio directo.`;

  return `
Eres un auditor experto en agro-logística de FruFresco (Investments Cortés S.A.S. - Bogotá / Corabastos).
Analiza con precisión milimétrica esta imagen/documento correspondiente a la fecha contable ${balanceDate}.

TIPO DE DOCUMENTO A PROCESAR:
${typeDescription}

REGLAS ESTRICTAS DE EXTRACCIÓN:
1. Devuelve ÚNICAMENTE un objeto JSON válido, sin bloques markdown adicionales ni comentarios.
2. Extrae EXCLUSIVAMENTE los renglones que tengan cantidades reales diligenciadas. Cero filas vacías.
3. En números con coma o punto decimal (ej. "9,9" o "9.9" o "184,7"), conviértelos siempre a número flotante estándar con punto (9.9, 184.7).
4. Si en la columna de cantidad dice "170K" o "55K" o "28K", la "K" significa Kilogramos (NO significa mil). Por tanto "170K" = 170, "55K" = 55, "28K" = 28.
5. En cambio, en precios monetarios de compra en Colombia, si dice "90mil" son 90000 COP.

ESTRUCTURA JSON EXACTA REQUERIDA:
{
  "sheetTitleDetected": "Título leído en el encabezado del documento",
  "dateDetected": "YYYY-MM-DD o texto de fecha leído",
  "items": [
    {
      "rawProductName": "Nombre del producto tal como aparece impreso o manuscrito",
      "rawQuantityText": "Texto exacto de la cantidad escrita (ej. '408 + 70', '170 K', '9.9')",
      "quantityKg": 478,
      "rawPresentation": "Presentación mayorista si se anotó (ej. '12 At', '70 doc', '1 bto', '3 Cubetas') o null",
      "unitCostPaid": null,
      "supplierName": "Nombre del proveedor/intermediario anotado al lado (ej. 'Andrés', 'Evelia', 'Faco') o null",
      "wasteTypeHint": "damage o cleaning o null",
      "sourceNote": "Nota adicional como 'Ingreso hoy', 'Inventario', 'en cambio' o null"
    }
  ]
}
`;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || getGeminiApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key de Gemini no configurada en el servidor.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const sheetType = ((formData.get('sheetType') as string) || 'inv_manual') as PhysicalSheetType;
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

    // 1. Procesar archivos (imágenes JPG/PNG/WebP o PDFs)
    for (const file of uploadedFiles) {
      if (!file || file.size === 0) continue;
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = Buffer.from(arrayBuffer).toString('base64');
      const mimeType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const rawResponse = await fetchGeminiExtraction(apiKey, basePrompt, base64Data, mimeType);
      const rawItems: RawExtractedSheetRow[] = Array.isArray(rawResponse?.items)
        ? rawResponse.items.map((it: Record<string, unknown>) => {
            const parsedQty =
              typeof it.quantityKg === 'number' && it.quantityKg > 0
                ? it.quantityKg
                : parseHandwrittenQuantity(it.rawQuantityText as string | number);
            return {
              rawProductName: String(it.rawProductName || '').trim(),
              rawQuantityText: String(it.rawQuantityText || parsedQty),
              quantityKg: parsedQty,
              rawPresentation: it.rawPresentation ? String(it.rawPresentation) : null,
              unitCostPaid: typeof it.unitCostPaid === 'number' ? it.unitCostPaid : null,
              supplierName: it.supplierName ? String(it.supplierName) : null,
              wasteTypeHint:
                it.wasteTypeHint === 'cleaning' || it.wasteTypeHint === 'damage'
                  ? it.wasteTypeHint
                  : null,
              sourceNote: it.sourceNote ? String(it.sourceNote) : null
            };
          })
        : [];

      resultsByFile.push({
        fileName: file.name,
        sheetTitleDetected: typeof rawResponse?.sheetTitleDetected === 'string' ? rawResponse.sheetTitleDetected : file.name,
        dateDetected: typeof rawResponse?.dateDetected === 'string' ? rawResponse.dateDetected : balanceDate,
        items: rawItems.filter(r => r.rawProductName.length > 0 && r.quantityKg > 0)
      });
    }

    // 2. Procesar texto libre / WhatsApp si fue enviado
    if (textInput.trim().length > 0) {
      const textPrompt = `${basePrompt}\n\nTEXTO A PROCESAR:\n"""\n${textInput.trim()}\n"""`;
      const rawResponse = await fetchGeminiExtraction(apiKey, textPrompt);
      const rawItems: RawExtractedSheetRow[] = Array.isArray(rawResponse?.items)
        ? rawResponse.items.map((it: Record<string, unknown>) => {
            const parsedQty =
              typeof it.quantityKg === 'number' && it.quantityKg > 0
                ? it.quantityKg
                : parseHandwrittenQuantity(it.rawQuantityText as string | number);
            return {
              rawProductName: String(it.rawProductName || '').trim(),
              rawQuantityText: String(it.rawQuantityText || parsedQty),
              quantityKg: parsedQty,
              rawPresentation: it.rawPresentation ? String(it.rawPresentation) : null,
              unitCostPaid: typeof it.unitCostPaid === 'number' ? it.unitCostPaid : null,
              supplierName: it.supplierName ? String(it.supplierName) : null,
              wasteTypeHint:
                it.wasteTypeHint === 'cleaning' || it.wasteTypeHint === 'damage'
                  ? it.wasteTypeHint
                  : null,
              sourceNote: it.sourceNote ? String(it.sourceNote) : null
            };
          })
        : [];

      resultsByFile.push({
        fileName: 'Texto / WhatsApp',
        sheetTitleDetected: 'Transcripción de Texto / WhatsApp',
        dateDetected: balanceDate,
        items: rawItems.filter(r => r.rawProductName.length > 0 && r.quantityKg > 0)
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
