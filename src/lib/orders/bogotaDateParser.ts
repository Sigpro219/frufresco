/**
 * Pure Bogotá (UTC-5) calendar & deterministic Spanish relative delivery-date parser.
 * Delegates date math strictly to `@/lib/dateUtils`.
 */

import { addBogotaDays, getBogotaDateString, parseBogotaDate } from '@/lib/dateUtils';

const SPANISH_WEEKDAYS_LONG = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
] as const;

const SPANISH_WEEKDAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'] as const;

const WEEKDAY_NAME_TO_JS_DAY: Record<string, number> = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miercoles: 3,
  miércoles: 3,
  jueves: 4,
  viernes: 5,
  sabado: 6,
  sábado: 6,
};

/** Returns YYYY-MM-DD in America/Bogota timezone (delegates to dateUtils). */
export function getBogotaDateStr(now: Date = new Date()): string {
  return getBogotaDateString(now);
}

/** Returns short Spanish weekday badge (LUN..DOM) for a YYYY-MM-DD string. */
export function getBogotaWeekdayShort(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = parseBogotaDate(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return SPANISH_WEEKDAYS_SHORT[d.getDay()] || '';
}

/** Returns long Spanish weekday name (lunes..domingo) for a YYYY-MM-DD string. */
export function getBogotaWeekdayLong(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = parseBogotaDate(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return SPANISH_WEEKDAYS_LONG[d.getDay()] || '';
}

/** Strips quoted RE:/RV:/Forwarded history from an email body before date parsing. */
export function stripQuotedEmailHistory(body: string): string {
  if (!body) return '';
  const cutMarkers = [
    /\r?\n-{2,}\s*(?:Mensaje reenviado|Forwarded message|Original Message)\s*-{2,}/i,
    /\r?\n(?:De|From):\s*[^\r\n]+\r?\n(?:Enviado|Sent|Date):/i,
    /\r?\nEl\s+\d{1,2}\/\d{1,2}\/\d{2,4}.*escribi[oó]:/i,
    /\r?\n\[DEBUG\]\s*Attachments info:/i,
  ];
  let clean = body;
  for (const rx of cutMarkers) {
    const idx = clean.search(rx);
    if (idx > 0) clean = clean.slice(0, idx);
  }
  return clean;
}

/** Detects explicit numeric dates (DD/MM/YYYY or YYYY-MM-DD) in subject or clean body. */
export function hasExplicitNumericDate(text: string): boolean {
  if (!text) return false;
  return /\b(?:\d{2}[\/-]\d{2}[\/-]\d{4}|\d{4}[\/-]\d{2}[\/-]\d{2})\b/.test(text);
}

/**
 * Builds an explicit Bogotá calendar reference block for Gemini prompts so the LLM
 * never performs mental weekday arithmetic across years/timezones.
 */
export function buildBogotaCalendarContext(now: Date = new Date()): string {
  const todayStr = getBogotaDateString(now);
  const todayName = getBogotaWeekdayLong(todayStr);
  const upcoming: string[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const nextStr = addBogotaDays(todayStr, offset);
    const label = offset === 1 ? 'mañana ' : '';
    upcoming.push(`${label}${getBogotaWeekdayLong(nextStr)} = ${nextStr}`);
  }
  return `FECHA ACTUAL EN BOGOTÁ (UTC-5): ${todayName} ${todayStr} | PRÓXIMOS 7 DÍAS: ${upcoming.join(' | ')}`;
}

/**
 * Deterministically resolves explicit Spanish relative delivery phrases
 * ("para hoy", "para mañana", "para pasado mañana", "para el jueves", "entrega el viernes")
 * relative to Bogotá calendar date `refDate`.
 */
export function resolveExplicitRelativeDeliveryDate(
  text: string,
  refDate: Date = new Date()
): { date: string; matchedPhrase: string; isSameDay: boolean } | null {
  if (!text || typeof text !== 'string') return null;

  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const todayStr = getBogotaDateString(refDate);
  const base = parseBogotaDate(todayStr);

  const pasadoMatch = normalized.match(/\b(?:para\s+)?pasado\s+manana\b/);
  if (pasadoMatch) {
    return { date: addBogotaDays(todayStr, 2), matchedPhrase: pasadoMatch[0], isSameDay: false };
  }

  const mananaMatch = normalized.match(/\b(?:para|entrega(?:\s+el\s+dia)?|despacho)\s+manana\b/);
  if (mananaMatch) {
    return { date: addBogotaDays(todayStr, 1), matchedPhrase: mananaMatch[0], isSameDay: false };
  }

  const hoyMatch = normalized.match(/\b(?:para\s+hoy|entrega\s+hoy|mismo\s+dia|hoy\s+mismo|despacho\s+hoy)\b/);
  if (hoyMatch) {
    return { date: todayStr, matchedPhrase: hoyMatch[0], isSameDay: true };
  }

  const weekdayMatch = normalized.match(
    /\b(?:para(?:\s+el(?:\s+dia)?)?|entrega(?:\s+el(?:\s+dia)?)?|despacho(?:\s+el(?:\s+dia)?)?)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/
  );
  if (weekdayMatch) {
    const targetDay = WEEKDAY_NAME_TO_JS_DAY[weekdayMatch[1]];
    if (typeof targetDay === 'number') {
      const currentDay = base.getDay();
      const delta = (targetDay - currentDay + 7) % 7;
      return {
        date: addBogotaDays(todayStr, delta),
        matchedPhrase: weekdayMatch[0],
        isSameDay: delta === 0,
      };
    }
  }

  return null;
}
