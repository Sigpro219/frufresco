/**
 * Catálogo Canónico y Gobernanza de Productos Susceptibles a Desperdicio y Merma (SDD Escenarios 391 & 392 / DT-18)
 * Persistido en Supabase `app_settings` (`key = 'waste_susceptible_products'`) sin requerir migraciones SQL.
 * Pre-cargado con los 109 productos oficiales de `FORMATO DE DESPERDICIO.xlsx` y herencia automática Padre -> Hijo.
 */

export const WASTE_SUSCEPTIBLE_SETTINGS_KEY = 'waste_susceptible_products';
export const SPECIFIC_COUNT_SETTINGS_KEY = 'specific_count_products';

/**
 * Semilla oficial de 109 IDs contables (`products.accounting_id`) extraídos de `FORMATO DE DESPERDICIO.xlsx`
 */
export const DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS: number[] = [
    1,    // Acelga
    210,  // Agraz
    211,  // Aguacate
    91,   // Ahuyama
    3,    // Albahaca
    4,    // Albahacon
    9,    // Apio
    1264, // Apio Institucional
    90,   // Arándano (Arandano Mediano)
    217,  // Banano Criollo
    1698, // Bok Choy
    12,   // Brocoli
    1337, // Brocoli Sin Tallo
    13,   // Calabaza
    15,   // Calabacin verde (Calabazin Verde)
    106,  // Cebolla Cabezona Blanca
    1502, // Cebolla Cabezona Blanca Cero Sin Pelar
    107,  // Cebolla Cabezona Roja
    1196, // Cebolla Cabezona Roja Sin Pelar
    110,  // Cebolla Larga
    18,   // Cebolla Puerro
    19,   // Cebollin Verde
    113,  // Champiñon Portobelo
    21,   // Cidron
    22,   // Cilantro
    23,   // Cilantro Cimarron
    1377, // Cilantro Cimarron Seleccionado
    1149, // Cilantro Sin Raiz
    228,  // Ciruela Nacional
    78,   // Cogollo Europeo
    24,   // Coliflor
    663,  // Cubeta Huevos Tipo AA x 30 Unds.
    232,  // Durazno Importado
    233,  // Durazno Nacional
    28,   // Espinaca
    82,   // Espinaca baby
    843,  // Espinaca Sin Raiz
    234,  // Frambuesa Roja
    236,  // Fresa Jumbo
    237,  // Fresa Mediana
    1527, // Germinados x 50grs
    242,  // Guanabana
    32,   // Guascas
    116,  // Guatila
    246,  // Guayaba pera
    119,  // Habichuela
    869,  // Habichuela picada
    35,   // Hierbabuena
    42,   // Jengibre
    249,  // Kiwi Importado
    44,   // Lechuga Batavia
    46,   // Lechuga Crespa Morada
    47,   // Lechuga Crespa Verde
    51,   // Lechuga Romana
    52,   // Lechuga Rugula
    251,  // Limon Tahiti
    255,  // Mandarina Arrayana
    259,  // Mango Comun
    261,  // Mango Filipino
    264,  // Mango Tommy
    209,  // Mango Tommy Verde
    269,  // Manzana Verde Importada
    270,  // Maracuya
    191,  // Mazorca en tuza
    273,  // Melon
    56,   // Menta
    411,  // Mix Lechuga Asiatico
    274,  // Mora
    726,  // Mora Despitonada
    283,  // Naranja Valencia
    58,   // Oregano
    150,  // Papa Pastusa lavada
    287,  // Papayuela
    122,  // Pepino Cohombro
    61,   // Pepino Europeo
    62,   // Perejil Crespo
    63,   // Perejil Liso
    124,  // Pimenton Amarillo
    125,  // Pimenton Rojo
    293,  // Piña Golden
    158,  // Platano Maduro
    159,  // Platano Topocho
    324,  // Pulpa de Guayaba
    302,  // Pulpa de Mango
    303,  // Pulpa de Maracuya
    66,   // Rabano Rojo
    67,   // Raiz China
    128,  // Remolacha Cero
    1115, // Remolacha Mediana
    69,   // Repollo Blanco
    70,   // Repollo Morado
    76,   // Tomate Cherry
    667,  // Tomate Cherry Uvalina rojo
    129,  // Tomate Chonto
    130,  // Tomate Larga Vida
    312,  // Uchuvas desgranadas (Uchuva Desgranada)
    313,  // Uva Chilena Roja Importada
    314,  // Uva Isabelita
    316,  // Uva Roja
    317,  // Uva Verde
    844,  // Yuca Armenia Extra
    1035, // Yuca Institucional
    829,  // Yuca Pelada
    131,  // Zanahoria
    778,  // Zanahoria Cero
    1261, // Zanahoria Cero Aprovechamiento
    749,  // Zanahoria Fina
    73,   // Zukini Amarillo
    74    // Zukini Verde
];

/**
 * Parsea el valor almacenado en `app_settings` (`waste_susceptible_products`) o retorna la semilla oficial de 109 SKUs.
 */
export function parseSusceptibleAccountingIds(rawValue: unknown): Set<number> {
    if (!rawValue) {
        return new Set<number>(DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS);
    }
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (Array.isArray(parsed) && parsed.length > 0) {
            const nums = parsed.map(n => Number(n)).filter(n => !isNaN(n) && n > 0);
            if (nums.length > 0) return new Set<number>(nums);
        }
        if (parsed && typeof parsed === 'object' && 'accounting_ids' in parsed) {
            const rawIds = (parsed as { accounting_ids?: unknown }).accounting_ids;
            if (Array.isArray(rawIds)) {
                const nums = rawIds.map((n: unknown) => Number(n)).filter((n: number) => !isNaN(n) && n > 0);
                if (nums.length > 0) return new Set<number>(nums);
            }
        }
    } catch {
        // Fallback a semilla por defecto
    }
    return new Set<number>(DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS);
}

/**
 * Parsea la lista específica de conteo físico (`specific_count_products`) en `app_settings`.
 * Si no se ha personalizado, utiliza por defecto la misma lista de productos susceptibles a merma/desperdicio.
 */
export function parseSpecificCountAccountingIds(rawValue: unknown): Set<number> {
    if (!rawValue) {
        return new Set<number>(DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS);
    }
    try {
        const parsed = typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
        if (Array.isArray(parsed)) {
            const nums = parsed.map(n => Number(n)).filter(n => !isNaN(n) && n > 0);
            if (nums.length > 0) return new Set<number>(nums);
        }
    } catch {
        // Fallback
    }
    return new Set<number>(DEFAULT_WASTE_SUSCEPTIBLE_ACCOUNTING_IDS);
}

/**
 * Evalúa si un producto es susceptible a desperdicio/merma, incluyendo herencia automática Padre -> Hijo:
 * Si el SKU está directamente en `susceptibleAccountingIds` O su SKU Padre está en `susceptibleAccountingIds`, retorna `true`.
 */
export function isProductWasteSusceptible(
    product: { id?: string; accounting_id?: number | string | null; parent_id?: string | null },
    susceptibleAccountingIds: Set<number>,
    allProductsById?: Map<string, { id?: string; accounting_id?: number | string | null; parent_id?: string | null }>
): boolean {
    const accId = Number(product.accounting_id);
    if (!isNaN(accId) && accId > 0 && susceptibleAccountingIds.has(accId)) {
        return true;
    }
    if (product.parent_id && product.parent_id !== product.id && allProductsById) {
        const parent = allProductsById.get(product.parent_id);
        if (parent) {
            const parentAccId = Number(parent.accounting_id);
            if (!isNaN(parentAccId) && parentAccId > 0 && susceptibleAccountingIds.has(parentAccId)) {
                return true;
            }
        }
    }
    return false;
}
