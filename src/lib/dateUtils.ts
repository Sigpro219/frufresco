/**
 * Soberanía Horaria America/Bogota (UTC-5, permanent, no DST).
 * Centralizes all Bogotá calendar date parsing, formatting, arithmetic, and UTC range conversion.
 */

const BOGOTA_TZ = 'America/Bogota';
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const DATE_ONLY_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts a YYYY-MM-DD Bogotá calendar date (-05:00, no DST) into UTC ISO bounds
 * for safe Supabase range queries and timestamp comparisons.
 */
export function getBogotaDayRangeUtcIso(dateStr: string): { startUtcIso: string; endUtcIso: string } {
    if (dateStr == null) {
        throw new Error(`Invalid Bogotá date: "${dateStr}"`);
    }
    const normalized = getBogotaDateString(dateStr);
    if (!DATE_ONLY_REGEX.test(normalized)) {
        throw new Error(`Invalid Bogotá date: "${dateStr}"`);
    }
    const startDate = new Date(`${normalized}T00:00:00.000-05:00`);
    const endDate = new Date(`${normalized}T23:59:59.999-05:00`);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        throw new Error(`Invalid Bogotá date: "${dateStr}"`);
    }
    return { startUtcIso: startDate.toISOString(), endUtcIso: endDate.toISOString() };
}

/**
 * Returns the YYYY-MM-DD calendar date in America/Bogota (-05:00, permanent UTC-5).
 * Date-only 'YYYY-MM-DD' strings are returned directly without UTC shifting.
 */
export function getBogotaDateString(input?: Date | string | null): string {
    const resolved = input === undefined ? new Date() : input;
    if (resolved === null) return '';
    if (typeof resolved === 'string') {
        const trimmed = resolved.trim();
        if (!trimmed) return '';
        if (DATE_ONLY_REGEX.test(trimmed)) return trimmed;
        const ms = new Date(trimmed).getTime();
        if (Number.isNaN(ms)) return '';
        return new Date(ms - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
    }
    if (!(resolved instanceof Date)) return '';
    const ms = resolved.getTime();
    if (Number.isNaN(ms)) return '';
    return new Date(ms - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Parses a 'YYYY-MM-DD' date-only string at Bogotá noon (12:00:00-05:00 = 17:00:00Z),
 * making the returned Date 100% timezone-invariant across TZ=UTC and TZ=America/Bogota.
 * Full timestamps are parsed directly.
 */
export function parseBogotaDate(dateStr: string): Date {
    const trimmed = (dateStr ?? '').trim();
    if (DATE_ONLY_REGEX.test(trimmed)) {
        return new Date(`${trimmed}T12:00:00-05:00`);
    }
    return new Date(trimmed);
}

/**
 * Formats a Date, timestamp, or 'YYYY-MM-DD' date-only string in 'es-CO' with timeZone 'America/Bogota'.
 * Date-only strings are anchored at UTC noon to prevent -1 day shifts.
 */
export function formatBogotaDate(
    input?: Date | string | null,
    options?: Intl.DateTimeFormatOptions,
    fallback: string = '---'
): string {
    if (input === null || input === undefined || input === '') return fallback;

    let dateObj: Date;
    if (typeof input === 'string') {
        const trimmed = input.trim();
        if (!trimmed) return fallback;
        const match = trimmed.match(DATE_ONLY_REGEX);
        if (match) {
            const y = Number(match[1]);
            const m = Number(match[2]);
            const d = Number(match[3]);
            dateObj = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
        } else {
            dateObj = new Date(trimmed);
        }
    } else {
        dateObj = input;
    }

    if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return fallback;
    return dateObj.toLocaleDateString('es-CO', {
        timeZone: BOGOTA_TZ,
        ...options,
    });
}

/**
 * Adds or subtracts integer calendar days to a 'YYYY-MM-DD' (or timestamp) using UTC noon arithmetic
 * and returns 'YYYY-MM-DD'.
 */
export function addBogotaDays(dateStr: string | Date | null | undefined, days: number): string {
    if (dateStr == null || !Number.isFinite(days)) return '';
    const baseStr = getBogotaDateString(dateStr);
    const match = baseStr.match(DATE_ONLY_REGEX);
    if (!match) return '';
    const y = Number(match[1]);
    const m = Number(match[2]);
    const d = Number(match[3]);
    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
    utcNoon.setUTCDate(utcNoon.getUTCDate() + Math.trunc(days));
    return utcNoon.toISOString().slice(0, 10);
}

/**
 * Returns the exact integer calendar day difference (to - from) in Bogotá calendar.
 */
export function diffBogotaDays(fromDateStr: string | Date | null | undefined, toDateStr: string | Date | null | undefined): number {
    if (fromDateStr == null || toDateStr == null) return NaN;
    const fromStr = getBogotaDateString(fromDateStr);
    const toStr = getBogotaDateString(toDateStr);
    const fromMatch = fromStr.match(DATE_ONLY_REGEX);
    const toMatch = toStr.match(DATE_ONLY_REGEX);
    if (!fromMatch || !toMatch) return NaN;
    const fromMs = Date.UTC(Number(fromMatch[1]), Number(fromMatch[2]) - 1, Number(fromMatch[3]), 12, 0, 0, 0);
    const toMs = Date.UTC(Number(toMatch[1]), Number(toMatch[2]) - 1, Number(toMatch[3]), 12, 0, 0, 0);
    return Math.round((toMs - fromMs) / 86_400_000);
}
