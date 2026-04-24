import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const { text, targetLang } = await req.json();
    
    if (!text || !targetLang) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ translatedText: text });
    }

    // Usamos el SDK oficial para máxima estabilidad
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
    
    const prompt = `Translate exactly this product name from Spanish to ${targetLang === 'en' ? 'English' : 'Spanish'}. 
    Return ONLY the translated text. Do not add anything else.
    Input Text: "${text}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translated = response.text().trim().replace(/["']/g, '');

    // Background cache update
    try {
        await supabase.from('product_translations_cache').upsert({
            source_text: text,
            translated_text: translated,
            lang: targetLang
        }, { onConflict: 'source_text, lang' });
    } catch (dbErr) {
        console.warn('[API Translate] Cache Error:', dbErr);
    }

    return NextResponse.json({ translatedText: translated });
  } catch (error: any) {
    console.error('[API Translate] ERROR:', error.message);
    
    // Fallback simple si la IA falla
    return NextResponse.json({ translatedText: text });
  }
}
