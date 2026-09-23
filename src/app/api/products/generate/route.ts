import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
    executeWithObsolescenceGuard,
    PRIMARY_AI_MODEL,
    CANONICAL_MODEL_CASCADE,
    getGeminiApiKey,
} from '@/lib/ai/aiModelConfig';
import { verifySessionAndPermission } from '@/lib/auth';

export async function POST(req: Request) {
    // Validate session and permission
    const auth = await verifySessionAndPermission(req, 'admin.products.master.edit');
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 });
    }

    let current_description = '';
    try {
        const body = await req.json();
        const { name, category } = body;
        current_description = body.current_description || '';

        if (!name || !category) {
            return NextResponse.json({ error: 'Faltan datos del producto (nombre o categoría)' }, { status: 400 });
        }

        const apiKey = getGeminiApiKey();
        if (!apiKey) {
            return NextResponse.json({ error: 'Google AI API Key no configurada' }, { status: 500 });
        }

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

        const aiResult = await executeWithObsolescenceGuard(
            async (modelName: string, keyToUse: string) => {
                const genAI = new GoogleGenerativeAI(keyToUse);
                const model = genAI.getGenerativeModel({ model: modelName });
                const result = await model.generateContent(prompt);
                const response = await result.response;
                const text = response.text().trim().replace(/```json|```/g, '');
                return text;
            },
            {
                apiKey,
                moduleName: 'products_generate',
                operationName: 'description_generation',
                timeoutMs: 30000,
            }
        );

        const text = aiResult;
        try {
            const aiData = JSON.parse(text);
            if (aiResult._obsolescenceWarning) {
                aiData._obsolescenceWarning = aiResult._obsolescenceWarning;
            }
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
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
