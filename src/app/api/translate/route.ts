import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  executeWithObsolescenceGuard,
  PRIMARY_AI_MODEL,
  CANONICAL_MODEL_CASCADE,
  getGeminiApiKey,
} from '@/lib/ai/aiModelConfig';
import { supabase } from '@/lib/supabase';

export async function POST(req: Request) {
  let text = '';
  try {
    const body = await req.json();
    const targetLang = body.targetLang;
    text = body.text || '';
    
    if (!text || !targetLang) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const apiKey = getGeminiApiKey();

    if (!apiKey) {
      return NextResponse.json({ translatedText: text });
    }

    const prompt = `Translate exactly this product name from Spanish to ${targetLang === 'en' ? 'English' : 'Spanish'}. 
    Return ONLY the translated text. Do not add anything else.
    Input Text: "${text}"`;

    const translatedResult = await executeWithObsolescenceGuard(
      async (modelName: string, keyToUse: string) => {
        const genAI = new GoogleGenerativeAI(keyToUse);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text().trim().replace(/["']/g, '');
      },
      {
        apiKey,
        moduleName: 'translate',
        operationName: 'sku_name_translation',
        timeoutMs: 15000,
      }
    );

    const translated = translatedResult;

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
