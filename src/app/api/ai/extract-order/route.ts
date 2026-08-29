import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
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

    // Inicializar Gemini
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Obtener ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                    file.type === 'application/vnd.ms-excel' || 
                    file.name.toLowerCase().endsWith('.xlsx') || 
                    file.name.toLowerCase().endsWith('.xls');

    let prompt = `
      Eres un asistente experto en logística para FruFresco. 
      Analiza esta orden de compra adjunta.
      
      TAREA:
      1. Identifica el nombre del CLIENTE mencionado en el documento.
         - NOMBRE DEL CLIENTE PRINCIPAL: Identifica la compañía matriz, institución o razón social que emite el documento (frecuentemente en el encabezado, logo o parte superior, ej. "Colsubsidio"). NUNCA uses nombres de sucursales, centros de costos (ej. "CC33 Centro de Producción...") o dependencias internas como el nombre principal del cliente. Prioriza siempre el nombre de la entidad corporativa principal. NUNCA uses nombres de ciudades o países.
         - GUÍA DE FIRMA/PIE DE PÁGINA: Si el documento es un correo o tiene pie de página, guíate por esa sección para ubicar el nombre de la empresa matriz, la dirección y el número de teléfono.
      2. Extrae todos los productos solicitados junto con su cantidad numérica y su UNIDAD DE MEDIDA O PRESENTACIÓN exacta que aparezca en la columna (ej. "Presentación", "Unidad", "Medida", "U.M." -> ej. "KG", "UND", "UNIDAD", "CUBETA", "BOLSA", "LBS", "DOCENA", etc.) o en la descripción.
      3. Identifica si hay una DIRECCIÓN de entrega o envío mencionada de forma limpia. Extrae únicamente la nomenclatura geográfica (ej. "Carrera 15 # 134A 25, Apartamento 802, Barrio Cedritos, Bogotá"). NUNCA incluyas comentarios, solicitudes de disponibilidad, firmas o textos adicionales del documento en este campo.
      4. Identifica si hay un TELÉFONO de contacto.
      5. Identifica si hay un número de CÉDULA o NIT.
      6. Determina el tipo de documento.
      
      REGLAS CRÍTICAS:
      - Devuelve ÚNICAMENTE un objeto JSON puro. Sin texto extra, sin bloques de código markdown.
      - Si el nombre del producto es ambiguo, mantén el nombre original del documento.
      - Las cantidades deben ser números.
      
      FORMATO DE RESPUESTA ESPERADO:
      {
        "clientInDocument": "Nombre del Cliente Detectado",
        "addressInDocument": "Dirección Extraída o null",
        "phoneInDocument": "Teléfono Extraído o null",
        "nitInDocument": "NIT/Cédula Extraída o null",
        "documentType": "PDF / Excel / Imagen",
        "items": [
          { "originalName": "Nombre del Producto en el documento", "quantity": 10, "unit": "KG / UND / CUBETA / etc.", "presentation": "Valor de la columna Presentación si existe", "observations": "Cualquier nota u observación específica del producto o null" }
        ]
      }
    `;

    let base64Str: string | undefined = undefined;
    let resolvedMimeType = 'application/pdf';

    if (isExcel) {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let csvContent = "";
      workbook.SheetNames.forEach(sheetName => {
        csvContent += `\n--- Hoja: ${sheetName} ---\n`;
        csvContent += XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      });
      prompt += `\n\nCONTENIDO DEL DOCUMENTO EXCEL EN FORMATO CSV:\n${csvContent}`;
    } else {
      base64Str = Buffer.from(arrayBuffer).toString('base64');
      resolvedMimeType = file.type || '';
      if (!resolvedMimeType || resolvedMimeType === 'application/octet-stream') {
        const fileNameLower = file.name.toLowerCase();
        if (fileNameLower.endsWith('.pdf')) {
          resolvedMimeType = 'application/pdf';
        } else if (fileNameLower.endsWith('.png')) {
          resolvedMimeType = 'image/png';
        } else if (fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg')) {
          resolvedMimeType = 'image/jpeg';
        } else if (fileNameLower.endsWith('.webp')) {
          resolvedMimeType = 'image/webp';
        } else if (fileNameLower.endsWith('.xlsx')) {
          resolvedMimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (fileNameLower.endsWith('.xls')) {
          resolvedMimeType = 'application/vnd.ms-excel';
        } else {
          resolvedMimeType = 'application/pdf';
        }
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
