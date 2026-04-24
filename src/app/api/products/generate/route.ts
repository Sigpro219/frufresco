import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function POST(req: Request) {
    try {
        const { name, category, current_description } = await req.json();

        if (!name || !category) {
            return NextResponse.json({ error: 'Faltan datos del producto (nombre o categoría)' }, { status: 400 });
        }

        if (!GEMINI_KEY) {
            return NextResponse.json({ error: 'Google AI API Key no configurada' }, { status: 500 });
        }

        // Usamos el SDK oficial de Google para mayor estabilidad
        const genAI = new GoogleGenerativeAI(GEMINI_KEY);
        
        // Usamos gemini-3-flash-preview (el estándar de vanguardia en 2026)
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const prompt = `
Eres un experto en marketing gastronómico y nutrición para FruFresco, una tienda premium de frutas y verduras.
Tu tarea es generar una descripción atractiva, orgánica y saludable para un producto.

PRODUCTO: ${name}
CATEGORÍA: ${category}
DESCRIPCIÓN ACTUAL (opcional): ${current_description || 'N/A'}

REQUERIMIENTOS:
1. TONO: Profesional, saludable, premium y persuasivo.
2. CONTENIDO:
   - Una apertura que resalte la calidad superior del producto.
   - MENCIONA AL MENOS 2 BENEFICIOS nutricionales o para la salud (ej: vitaminas, fibra, antioxidantes).
   - Un consejo de uso culinario creativo.
3. IDIOMAS: Español e Inglés.
4. FORMATO: JSON puro.
{
  "name_en": "Traducción al inglés",
  "description_es": "Descripción equilibrada y saludable en español (Entre 40 y 50 palabras)",
  "description_en": "Healthy and balanced description in English (40-50 words)"
}

No incluyas markdown, solo el JSON puro.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().replace(/```json|```/g, '');
        
        try {
            const aiData = JSON.parse(text);
            return NextResponse.json(aiData);
        } catch (parseErr) {
            console.error('Error parsing AI JSON:', text);
            // Si el JSON falla, devolvemos un fallback limpio
            return NextResponse.json({ 
                description_es: text.substring(0, 200),
                description_en: "Translation pending...",
                name_en: name
            });
        }

    } catch (error: any) {
        console.error('❌ [Product AI Engine] Error:', error.message);
        
        // Si el error es específicamente de "model not found", intentamos un último recurso con gemini-pro
        if (error.message.includes('not found') || error.message.includes('not supported')) {
            try {
                console.log('🔄 Reintentando con modelo alternativo (gemini-pro)...');
                const genAI = new GoogleGenerativeAI(GEMINI_KEY as string);
                const backupModel = genAI.getGenerativeModel({ model: "gemini-pro" });
                const result = await backupModel.generateContent("Traduce a ingles: " + name);
                const response = await result.response;
                return NextResponse.json({
                    description_es: current_description || "Descripción generada",
                    description_en: response.text(),
                    name_en: response.text()
                });
            } catch (innerError) {
                return NextResponse.json({ error: "El modelo de IA no está disponible en esta región o con esta llave." }, { status: 500 });
            }
        }

        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
