/**
 * Converts a YYYY-MM-DD Bogotá calendar date (-05:00, no DST) into UTC ISO bounds
 * for safe Supabase range queries and timestamp comparisons.
 */
export function getBogotaDayRangeUtcIso(dateStr: string): { startUtcIso: string; endUtcIso: string } {
    const startUtcIso = new Date(`${dateStr}T00:00:00.000-05:00`).toISOString();
    const endUtcIso = new Date(`${dateStr}T23:59:59.999-05:00`).toISOString();
    return { startUtcIso, endUtcIso };
}

/**
 * Returns the YYYY-MM-DD calendar date in America/Bogota (-05:00, permanent UTC-5).
 */
export function getBogotaDateString(input: Date | string = new Date()): string {
    const ms = typeof input === 'string' ? new Date(input).getTime() : input.getTime();
    if (Number.isNaN(ms)) return '';
    const bogotaShifted = new Date(ms - 5 * 60 * 60 * 1000);
    return bogotaShifted.toISOString().slice(0, 10);
}
