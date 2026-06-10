import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
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
    
    // Convertir archivo a Base64 para Gemini
    const arrayBuffer = await file.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');

    const prompt = `
      Eres un asistente experto en logística para FruFresco. 
      Analiza esta orden de compra adjunta (puede ser PDF, Imagen o Excel).
      
      TAREA:
      1. Identifica el nombre del CLIENTE mencionado en el documento.
      2. Extrae todos los productos solicitados junto con su cantidad numérica.
      3. Identifica si hay una DIRECCIÓN de entrega o envío mencionada.
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
          { "originalName": "Nombre del Producto en el documento", "quantity": 10 }
        ]
      }
    `;

    // Modelos alternativos en caso de indisponibilidad por alta demanda
    const modelsToTry = ["gemini-2.5-flash", "gemini-1.5-flash", "gemini-pro"];
    let result = null;
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`[AI Extract] Intentando procesar orden con modelo: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });
        
        result = await model.generateContent([
          {
            inlineData: {
              data: base64Data,
              mimeType: file.type
            }
          },
          { text: prompt }
        ]);
        
        if (result) {
          console.log(`[AI Extract] Procesado exitosamente con modelo: ${modelName}`);
          break;
        }
      } catch (err: any) {
        console.error(`[AI Extract] Error con modelo ${modelName}:`, err.message);
        lastError = err;
      }
    }

    if (!result) {
      throw lastError || new Error("No se pudo establecer comunicación con ningún modelo de Gemini.");
    }

    const response = await result.response;
    let text = response.text().trim();
    
    // Limpiar posibles bloques de código markdown si la IA los incluye
    text = text.replace(/^```json/, '').replace(/```$/, '').trim();
    
    try {
        const parsedData = JSON.parse(text);
        return NextResponse.json(parsedData);
    } catch (parseError) {
        console.error('[AI Extract] JSON Parse Error:', text);
        return NextResponse.json({ 
            error: 'La IA devolvió un formato inválido',
            rawResponse: text 
        }, { status: 500 });
    }

  } catch (error: any) {
    console.error('[AI Extract] Error Crítico:', error.message);
    return NextResponse.json({ 
        error: `Error procesando con IA: ${error.message}` 
    }, { status: 500 });
  }
}
