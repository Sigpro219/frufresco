import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: Request) {
  try {
    const { text, targetLang } = await req.json();
    console.log(`[API Translate] Starting: "${text}" to ${targetLang}`);

    if (!text || !targetLang) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    if (!apiKey) {
      console.error('[API Translate] NO API KEY IN ENV');
      return NextResponse.json({ translatedText: text });
    }

    // Force 'v1' stable API version
    const genAI = new GoogleGenerativeAI(apiKey, { apiVersion: "v1" });
    const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash",
    });
    
    const prompt = `Translate exactly this product name from Spanish to ${targetLang === 'en' ? 'English' : 'Spanish'}. 
    Return ONLY the translated text. Do not add anything else.
    Input Text: "${text}"`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const translated = response.text().trim().replace(/["']/g, '');

    console.log(`[API Translate] SUCCESS: "${text}" -> "${translated}"`);

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
