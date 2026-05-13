import { unstable_cache } from 'next/cache';

const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

/**
 * Expands a search query into semantic terms and a category code.
 * Returns { terms: string[], category?: string }
 * Cached to improve search speed on repeated queries.
 */
export const expandSearchQuery = unstable_cache(
    async (query: string): Promise<{ terms: string[], category?: string }> => {
        const trimmedQuery = query.trim().toLowerCase();
        if (!trimmedQuery || trimmedQuery.length < 3 || !API_KEY) return { terms: [query] };

        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`;
            
            const prompt = `
Analiza esta búsqueda de tienda: "${query}"
Devuelve exactamente esto: términos_separados_por_coma|CÓDIGO_CATEGORÍA

REGLAS:
- CÓDIGOS: [FR, VE, TU, HO, LA, DE, CO]
- Si no hay categoría clara, usa DE.
- No escribas nada más que el formato indicado.

Ejemplo: paella -> arroz, pimenton, mariscos, cebolla, paella|DE
`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            if (!response.ok) return { terms: [query], category: 'DE' };

            const result = await response.json();
            const rawText = result.candidates[0].content.parts[0].text.trim();
            
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
