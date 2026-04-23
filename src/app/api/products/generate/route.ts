import { NextResponse } from 'next/server';

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

        const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;


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

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error?.message || 'Error en la API de Gemini');
        }

        const result = await response.json();
        const text = result.candidates[0].content.parts[0].text.trim().replace(/```json|```/g, '');
        
        try {
            const aiData = JSON.parse(text);
            return NextResponse.json(aiData);
        } catch (parseErr) {
            console.error('Error parsing AI JSON:', text);
            return NextResponse.json({ error: 'Error al procesar la respuesta de la IA' }, { status: 500 });
        }

    } catch (error: any) {
        console.error('❌ [Product AI Engine] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
