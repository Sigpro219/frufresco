import { unstable_cache } from 'next/cache';
import {
    executeWithObsolescenceGuard,
    PRIMARY_AI_MODEL,
    CANONICAL_MODEL_CASCADE,
    getGeminiApiKey,
} from '@/lib/ai/aiModelConfig';

/**
 * Expands a search query into semantic terms and a category code.
 * Returns { terms: string[], category?: string }
 * Cached to improve search speed on repeated queries.
 */
export const expandSearchQuery = unstable_cache(
    async (query: string): Promise<{ terms: string[], category?: string }> => {
        const trimmedQuery = query.trim().toLowerCase();
        const apiKey = getGeminiApiKey();
        if (!trimmedQuery || trimmedQuery.length < 3 || !apiKey) return { terms: [query] };

        try {
            const prompt = `
Analiza esta búsqueda de tienda: "${query}"
Devuelve exactamente esto: términos_separados_por_coma|CÓDIGO_CATEGORÍA

REGLAS:
- CÓDIGOS: [FR, VE, TU, HO, LA, DE, CO]
- Si no hay categoría clara, usa DE.
- No escribas nada más que el formato indicado.

Ejemplo: paella -> arroz, pimenton, mariscos, cebolla, paella|DE
`;

            const rawText = await executeWithObsolescenceGuard(
                async (modelName: string, keyToUse: string, signal?: AbortSignal) => {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToUse}`;
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                        signal
                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        const msg = errData?.error?.message || response.statusText;
                        const err = new Error(`[Gemini ${response.status}] ${msg}`);
                        (err as any).status = response.status;
                        (err as any).statusCode = response.status;
                        throw err;
                    }

                    const result = await response.json();
                    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
                    if (!text) throw new Error('No text generated');
                    return text;
                },
                {
                    apiKey,
                    moduleName: 'search',
                    operationName: 'query_expansion',
                    timeoutMs: 4000,
                }
            );

            const [termsStr, catCode] = rawText.split('|');
            const terms = (termsStr || query).split(',').map((t: string) => t.trim());
            const category = (catCode || 'DE').trim().toUpperCase().substring(0, 2);

            return { terms, category };
        } catch (error) {
            return { terms: [query], category: 'DE' };
        }
    },
    ['search-expansion'],
    { revalidate: 86400 } // Cache search expansions for 24 hours
);
