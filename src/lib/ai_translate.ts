import { supabase } from './supabase';

/**
 * Intelligent Translation Service with Cache
 * Translates product names and other UI strings lazily.
 */
export async function getIntelligentTranslation(text: string, lang: 'en' | 'es' = 'en'): Promise<string> {
    if (!text || lang === 'es') return text;

    try {
        // 1. Check Cache first
        const { data: cacheHit } = await supabase
            .from('product_translations_cache')
            .select('translated_text')
            .eq('source_text', text)
            .eq('lang', lang)
            .maybeSingle();

        if (cacheHit?.translated_text) {
            return cacheHit.translated_text;
        }

        // 2. Fallback to a simple static dictionary for common fruits/veggies to save API calls
        const commonDict: Record<string, string> = {
            'Uchuva': 'Cape Gooseberry',
            'Uchuvas': 'Cape Gooseberries',
            'Papa Sabanera': 'Sabanera Potato',
            'Papa Pastusa': 'Pastusa Potato',
            'Plátano': 'Plantain',
            'Cebolla Cabezona': 'Bulb Onion',
            'Cebolla Larga': 'Green Onion',
            'Tomate Chonto': 'Chonto Tomato',
            'Frutas': 'Fruits',
            'Verduras': 'Vegetables'
        };

        const staticMatch = commonDict[text] || commonDict[text.trim()];
        if (staticMatch) {
             // Save to cache for next time even if it's static
             await supabase.from('product_translations_cache').insert({
                source_text: text,
                translated_text: staticMatch,
                lang
            });
            return staticMatch;
        }

        // 3. AI Translation (Server-side call)
        // Note: This requires a GOOGLE_GENERATIVE_AI_API_KEY env var
        const response = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, targetLang: lang })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.translatedText) {
                return result.translatedText;
            }
        }

        return text; // Return original if everything fails
    } catch (err) {
        console.error('IntelligentTranslation Error:', err);
        return text;
    }
}
