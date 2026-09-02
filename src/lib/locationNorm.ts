/**
 * Utilidad Canónica de Normalización de Municipios y Ciudades (Colombia)
 * Evita duplicidad de ciudades por variaciones ortográficas (ej: 'Bogotá', 'Bogotá, D.C.', 'bogota dc')
 */

export const CANONICAL_CITIES = [
    'Bogotá',
    'Soacha',
    'Chía',
    'Cota',
    'Funza',
    'Mosquera',
    'Madrid',
    'Facatativá',
    'Zipaquirá',
    'Cajicá',
    'Sopó',
    'Tocancipá',
    'Gachancipá',
    'Villavicencio',
    'Medellín',
    'Cali',
    'Barranquilla',
    'Bucaramanga',
    'Pereira',
    'Manizales',
    'Ibagué',
    'Cartagena',
    'Santa Marta'
] as const;

export function normalizeCityName(raw?: string | null): string {
    if (!raw) return 'Bogotá';
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === '---') return 'Bogotá';

    const clean = trimmed
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (clean.includes('bogota') || clean === 'dc' || clean === 'd c' || clean.includes('distrito capital')) {
        return 'Bogotá';
    }
    if (clean.includes('soacha')) return 'Soacha';
    if (clean.includes('chia')) return 'Chía';
    if (clean.includes('cota')) return 'Cota';
    if (clean.includes('funza')) return 'Funza';
    if (clean.includes('mosquera')) return 'Mosquera';
    if (clean.includes('madrid')) return 'Madrid';
    if (clean.includes('facatativa')) return 'Facatativá';
    if (clean.includes('zipaquira')) return 'Zipaquirá';
    if (clean.includes('cajica')) return 'Cajicá';
    if (clean.includes('sopo')) return 'Sopó';
    if (clean.includes('tocancipa')) return 'Tocancipá';
    if (clean.includes('villavicencio')) return 'Villavicencio';
    if (clean.includes('medellin')) return 'Medellín';
    if (clean.includes('cali')) return 'Cali';
    if (clean.includes('barranquilla')) return 'Barranquilla';
    if (clean.includes('bucaramanga')) return 'Bucaramanga';
    if (clean.includes('pereira')) return 'Pereira';
    if (clean.includes('manizales')) return 'Manizales';
    if (clean.includes('ibague')) return 'Ibagué';

    return trimmed
        .split(' ')
        .filter(Boolean)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
}
