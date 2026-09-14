/**
 * Utility module for canonical Spanish agricultural spelling and accentuation normalization.
 * Poka-Yoke framework to prevent unaccented or malformed product names on storefronts.
 */

export interface DictionaryEntry {
    pattern: RegExp;
    replacement: string;
}

export const AGRICULTURAL_ACCENTS_DICTIONARY: DictionaryEntry[] = [
    { pattern: /\bsandia\b/gi, replacement: 'Sandía' },
    { pattern: /\bmelon\b/gi, replacement: 'Melón' },
    { pattern: /\blimon\b/gi, replacement: 'Limón' },
    { pattern: /\bplatano\b/gi, replacement: 'Plátano' },
    { pattern: /\bpinton\b/gi, replacement: 'pintón' },
    { pattern: /\bmaracuya\b/gi, replacement: 'Maracuyá' },
    { pattern: /\barandano\b/gi, replacement: 'Arándano' },
    { pattern: /\barandanos\b/gi, replacement: 'Arándanos' },
    { pattern: /\bbrocoli\b/gi, replacement: 'Brócoli' },
    { pattern: /\bchampinon\b/gi, replacement: 'Champiñón' },
    { pattern: /\bchampinones\b/gi, replacement: 'Champiñones' },
    { pattern: /\bguanabana\b/gi, replacement: 'Guanábana' },
    { pattern: /\bpimenton\b/gi, replacement: 'Pimentón' },
    { pattern: /\bmaranon\b/gi, replacement: 'Marañón' },
    { pattern: /\brabano\b/gi, replacement: 'Rábano' },
    { pattern: /\brabanos\b/gi, replacement: 'Rábanos' },
    { pattern: /\besparrago\b/gi, replacement: 'Espárrago' },
    { pattern: /\besparragos\b/gi, replacement: 'Espárragos' },
    { pattern: /\btahiti\b/gi, replacement: 'Tahití' },
    { pattern: /\barbol\b/gi, replacement: 'árbol' },
    { pattern: /\barbolitos\b/gi, replacement: 'arbolitos' },
    { pattern: /\boregano\b/gi, replacement: 'Orégano' },
    { pattern: /\banis\b/gi, replacement: 'Anís' },
    { pattern: /\baji\b/gi, replacement: 'Ají' },
    { pattern: /\bmelocoton\b/gi, replacement: 'Melocotón' },
    { pattern: /\bnispero\b/gi, replacement: 'Níspero' },
    { pattern: /\bpitaya\b/gi, replacement: 'Pitahaya' },
    { pattern: /\bcomun\b/gi, replacement: 'común' },
    { pattern: /\bamazonico\b/gi, replacement: 'amazónico' },
    { pattern: /\bjalapeno\b/gi, replacement: 'jalapeño' },
    { pattern: /\bfrutino\b/gi, replacement: 'Frutiño' },
    { pattern: /\bchontaduro\b/gi, replacement: 'Chontaduro' }
];

const LOWERCASE_WORDS = new Set([
    'de', 'del', 'en', 'con', 'por', 'para', 'y', 'e', 'o', 'u', 'a', 'sin', 'x',
    'gr', 'grs', 'g', 'kg', 'ml', 'oz', 'lb', 'lbs'
]);

/**
 * Capitalizes principal words for catalog display while respecting short Spanish prepositions
 * and measurements (de, con, x, gr, kg, etc.).
 */
export function toCatalogTitleCase(text: string): string {
    if (!text || typeof text !== 'string') return '';
    const words = text.trim().split(/\s+/);
    return words.map((word, index) => {
        const cleanLower = word.toLowerCase();
        
        // Handle x125gr or x430grs patterns
        if (/^x\d+/i.test(word)) {
            return word.toLowerCase();
        }

        // If it's a lowercase connector/unit and NOT the first word, keep it lowercase
        if (index > 0 && LOWERCASE_WORDS.has(cleanLower)) {
            return cleanLower;
        }

        // Otherwise capitalize first character
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

/**
 * Applies canonical RAE and agricultural accent rules, plus catalog title casing.
 */
export function normalizeCatalogSpelling(text: string, applyTitleCase: boolean = true): string {
    if (!text || typeof text !== 'string') return '';
    let result = text.trim().replace(/\s+/g, ' ');

    AGRICULTURAL_ACCENTS_DICTIONARY.forEach(({ pattern, replacement }) => {
        result = result.replace(pattern, (match) => {
            if (match === match.toUpperCase() && match.length > 1) {
                return replacement.toUpperCase();
            }
            if (match[0] === match[0].toUpperCase()) {
                return replacement.charAt(0).toUpperCase() + replacement.slice(1);
            }
            return replacement.toLowerCase();
        });
    });

    if (applyTitleCase) {
        result = toCatalogTitleCase(result);
    }

    return result;
}

/**
 * Returns true if the string can be improved with accents or title casing.
 */
export function hasSpellingSuggestion(text: string): boolean {
    if (!text || typeof text !== 'string') return false;
    const normalized = normalizeCatalogSpelling(text);
    return normalized !== text.trim();
}

/**
 * Returns the suggested corrected string, or null if no improvement needed.
 */
export function getSpellingSuggestion(text: string): string | null {
    if (!text || typeof text !== 'string') return null;
    const normalized = normalizeCatalogSpelling(text);
    return normalized !== text.trim() ? normalized : null;
}
