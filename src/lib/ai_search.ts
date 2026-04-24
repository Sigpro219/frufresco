const API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const searchCache = new Map<string, { terms: string[], category?: string }>();

/**
 * Expands a search query into semantic terms and a category code.
 * Returns { terms: string[], category?: string }
 * INFALLIBLE PLAIN TEXT PARSING.
 */
export async function expandSearchQuery(query: string): Promise<{ terms: string[], category?: string }> {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery || trimmedQuery.length < 3 || !API_KEY) return { terms: [query] };

    if (searchCache.has(trimmedQuery)) return searchCache.get(trimmedQuery)!;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
        
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
        const timeoutId = setTimeout(() => controller.abort(), 4500);

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
        const terms = termsStr.split(',').map((t: string) => t.trim());
        const category = (catCode || 'DE').trim().toUpperCase().substring(0, 2);

        const finalResults = { terms, category };
        searchCache.set(trimmedQuery, finalResults);
        return finalResults;
    } catch (error) {
        return { terms: [query], category: 'DE' };
    }
}
