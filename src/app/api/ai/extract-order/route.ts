import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { fetchGeminiExtraction } from '@/lib/orders/order-parser-engine';
import { verifySessionAndPermission } from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const auth = await verifySessionAndPermission(req, 'admin.orders');
    if (!auth.authorized) {
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No se recibió ningún archivo' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de Gemini no configurada' }, { status: 500 });
    }



    // Obtener los bytes del archivo — usamos file.bytes() preferentemente porque es más
    // confiable en el contexto de Next.js + Turbopack que file.arrayBuffer(), que a veces
    // devuelve 0 bytes cuando el stream ya fue consumido internamente por el runtime.
    let fileBytes: Uint8Array;
    try {
      // file.bytes() es la API moderna (Node 20+, Edge Runtime). Intentar primero.
      fileBytes = await (file as any).bytes();
    } catch (_) {
      // Fallback: leer como arrayBuffer y convertir
      const ab = await file.arrayBuffer();
      fileBytes = new Uint8Array(ab);
    }

    console.log(`[AI Extract] Archivo recibido: "${file.name}" | tipo: ${file.type} | tamaño declarado: ${file.size} bytes | bytes leídos: ${fileBytes.byteLength}`);

    if (fileBytes.byteLength === 0) {
      console.error('[AI Extract] ERROR: El archivo llegó vacío al servidor (0 bytes).');
      return NextResponse.json({ error: 'El archivo recibido está vacío (0 bytes). Por favor, intente subirlo nuevamente.' }, { status: 400 });
    }

    const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                    file.type === 'application/vnd.ms-excel' || 
                    file.name.toLowerCase().endsWith('.xlsx') || 
                    file.name.toLowerCase().endsWith('.xls');

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

    // Validación preventiva para archivos PDF
    if (isPdf) {
      if (fileBytes.byteLength < 300) {
        console.error(`[AI Extract] Archivo PDF sospechosamente diminuto (${fileBytes.byteLength} bytes). Posible archivo de texto vacío o renombrado.`);
        return NextResponse.json({ 
          error: `Archivo dañado o no compatible. El documento "${file.name}" mide solo ${fileBytes.byteLength} bytes y no contiene páginas legibles. Por favor suba el archivo PDF o Excel original.` 
        }, { status: 400 });
      }

      // Validar firma mágica %PDF- (bytes: 0x25, 0x50, 0x44, 0x46)
      const headerStr = String.fromCharCode(...fileBytes.slice(0, 5));
      if (!headerStr.startsWith('%PDF-')) {
        console.error(`[AI Extract] Encabezado inválido para PDF: "${headerStr}"`);
        return NextResponse.json({ 
          error: `Archivo dañado o no compatible. El archivo "${file.name}" no tiene una estructura PDF válida. Por favor verifique el archivo o súbalo en formato original.` 
        }, { status: 400 });
      }
    }

    let prompt = `
      Eres un asistente experto en logística para FruFresco. 
      Analiza esta orden de compra adjunta.
      
      TAREA:
      1. Identifica el nombre del CLIENTE mencionado en el documento.
         - NOMBRE DEL CLIENTE PRINCIPAL: Identifica la compañía matriz, institución o razón social que emite el documento (frecuentemente en el encabezado, logo o parte superior, ej. "Colsubsidio", "Colegio San Jorge de Inglaterra"). NUNCA uses nombres de sucursales, centros de costos (ej. "CC33 Centro de Producción...") o dependencias internas como el nombre principal del cliente. Prioriza siempre el nombre de la entidad corporativa principal. NUNCA uses nombres de ciudades o países.
         - GUÍA DE FIRMA/PIE DE PÁGINA: Si el documento es un correo o tiene pie de página, guíate por esa sección para ubicar el nombre de la empresa matriz, la dirección y el número de teléfono.
      2. Extrae todos los productos solicitados junto con su cantidad numérica y su UNIDAD DE MEDIDA O PRESENTACIÓN exacta que aparezca en la columna (ej. "Presentación", "Unidad", "Medida", "U.M." -> ej. "KG", "UND", "UNIDAD", "CUBETA", "BOLSA", "LBS", "DOCENA", etc.) o en la descripción.
      3. Identifica si hay una DIRECCIÓN de entrega o envío mencionada de forma limpia. Extrae únicamente la nomenclatura geográfica (ej. "Carrera 15 # 134A 25, Apartamento 802, Barrio Cedritos, Bogotá"). NUNCA incluyas comentarios, solicitudes de disponibilidad, firmas o textos adicionales del documento en este campo.
      4. Identifica si hay un TELÉFONO de contacto.
      5. Identifica si hay un número de CÉDULA o NIT.
      6. Determina el tipo de documento.
      7. Identifica el NÚMERO DE ORDEN DE COMPRA (PO Number / Orden de Compra N°), frecuentemente en la cabecera (ej. "Y001 2208", "OC-5542", etc.).
      8. Identifica la FECHA DE ENTREGA principal mencionada en la cabecera (ej. "FECHA DE ENTREGA: 12/09/2026").
      9. DETECCIÓN CRÍTICA DE ENTREGAS DIFERIDAS O DÍAS ESPECÍFICOS:
         - Revisa detenidamente la columna de "ESPECIFICACIONES", "OBSERVACIONES" o notas de cada fila.
         - Si una fila dice expresamente que es para otro día o fecha (ej. "PARA MARTES", "PARA EL LUNES", "ENTREGA MIÉRCOLES", "15/09", etc.), extrae el nombre del día en mayúsculas en el campo "deliverySchedule" (ej. "MARTES"). Si no indica un día diferente, deja "deliverySchedule" en null.
         - Mantén la observación completa en el campo "observations" (ej. "PARA MARTES Amarillo", "Bonito, amarillo", "medianas, maduras").
      
      REGLAS CRÍTICAS:
      - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
      - Si el nombre del producto es ambiguo, mantén el nombre original del documento.
      - Las cantidades deben ser números.
      
      FORMATO DE RESPUESTA ESPERADO:
      {
        "clientInDocument": "Nombre del Cliente Detectado",
        "poNumber": "Número de Orden de Compra o null",
        "deliveryDateInDocument": "Fecha de Entrega de cabecera o null",
        "addressInDocument": "Dirección Extraída o null",
        "phoneInDocument": "Teléfono Extraído o null",
        "nitInDocument": "NIT/Cédula Extraída o null",
        "documentType": "PDF / Excel / Imagen",
        "items": [
          { 
            "originalName": "Nombre del Producto en el documento", 
            "quantity": 10, 
            "unit": "KG / UND / CUBETA / etc.", 
            "presentation": "Valor de la columna Presentación si existe", 
            "observations": "Cualquier nota, especificación de calidad o entrega",
            "deliverySchedule": "MARTES / LUNES / MIERCOLES / etc. o null si es entrega normal"
          }
        ]
      }
    `;

    let base64Str: string | undefined = undefined;
    let resolvedMimeType = 'application/pdf';

    if (isExcel) {
      const workbook = XLSX.read(fileBytes, { type: 'array' });
      let csvContent = "";
      workbook.SheetNames.forEach(sheetName => {
        csvContent += `\n--- Hoja: ${sheetName} ---\n`;
        csvContent += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      });
      prompt += `\n\nCONTENIDO DEL DOCUMENTO EXCEL EN FORMATO CSV:\n${csvContent}`;
    } else {
      const fileBuffer = Buffer.from(fileBytes);
      base64Str = fileBuffer.toString('base64');
      console.log(`[AI Extract] base64 generado: ${base64Str.length} caracteres (${Math.round(base64Str.length * 0.75 / 1024)} KB aprox)`);
      
      const fileNameLower = file.name.toLowerCase();
      if (fileNameLower.endsWith('.pdf') || file.type === 'application/pdf') {
        resolvedMimeType = 'application/pdf';
      } else if (fileNameLower.endsWith('.png') || file.type === 'image/png') {
        resolvedMimeType = 'image/png';
      } else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || file.type === 'image/jpeg') {
        resolvedMimeType = 'image/jpeg';
      } else if (fileNameLower.endsWith('.webp') || file.type === 'image/webp') {
        resolvedMimeType = 'image/webp';
      } else {
        resolvedMimeType = file.type || 'application/pdf';
      }
    }

    try {
      const parsedData = await fetchGeminiExtraction(apiKey, prompt, base64Str, resolvedMimeType);
      return NextResponse.json(parsedData);
    } catch (err: any) {
      console.error('[AI Extract Error]:', err);
      return NextResponse.json({ error: err.message || 'Error en la extracción IA de la orden' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[AI Extract] Error Crítico:', error.message);
    return NextResponse.json({ 
        error: `Error procesando con IA: ${error.message}` 
    }, { status: 500 });
  }
}
