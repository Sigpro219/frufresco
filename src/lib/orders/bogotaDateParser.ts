/**
 * Pure Bogotá (UTC-5) calendar & deterministic Spanish relative delivery-date parser.
 * Zero external dependencies; safe for both Node API routes and React Client Components.
 */

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

/** Returns YYYY-MM-DD in America/Bogota timezone. */
export function getBogotaDateStr(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/** Parses YYYY-MM-DD at noon UTC to avoid DST/offset day shifts. */
function parseDateNoonUtc(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00Z`);
}

/** Formats a UTC Date as YYYY-MM-DD. */
function formatDateUtc(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Returns short Spanish weekday badge (LUN..DOM) for a YYYY-MM-DD string. */
export function getBogotaWeekdayShort(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = parseDateNoonUtc(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return SPANISH_WEEKDAYS_SHORT[d.getUTCDay()] || '';
}

/** Returns long Spanish weekday name (lunes..domingo) for a YYYY-MM-DD string. */
export function getBogotaWeekdayLong(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const d = parseDateNoonUtc(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return SPANISH_WEEKDAYS_LONG[d.getUTCDay()] || '';
}

/**
 * Builds an explicit Bogotá calendar reference block for Gemini prompts so the LLM
 * never performs mental weekday arithmetic across years/timezones.
 */
export function buildBogotaCalendarContext(now: Date = new Date()): string {
  const todayStr = getBogotaDateStr(now);
  const base = parseDateNoonUtc(todayStr);
  const todayName = SPANISH_WEEKDAYS_LONG[base.getUTCDay()];
  const upcoming: string[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + offset);
    const label = offset === 1 ? 'mañana ' : '';
    upcoming.push(`${label}${SPANISH_WEEKDAYS_LONG[d.getUTCDay()]} = ${formatDateUtc(d)}`);
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

  const todayStr = getBogotaDateStr(refDate);
  const base = parseDateNoonUtc(todayStr);

  // 1. Pasado mañana
  const pasadoMatch = normalized.match(/\b(?:para\s+)?pasado\s+manana\b/);
  if (pasadoMatch) {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + 2);
    return { date: formatDateUtc(d), matchedPhrase: pasadoMatch[0], isSameDay: false };
  }

  // 2. Para mañana / entrega mañana
  const mananaMatch = normalized.match(/\b(?:para|entrega(?:\s+el\s+dia)?|despacho)\s+manana\b/);
  if (mananaMatch) {
    const d = new Date(base.getTime());
    d.setUTCDate(d.getUTCDate() + 1);
    return { date: formatDateUtc(d), matchedPhrase: mananaMatch[0], isSameDay: false };
  }

  // 3. Para hoy / entrega hoy / mismo día
  const hoyMatch = normalized.match(/\b(?:para\s+hoy|entrega\s+hoy|mismo\s+dia|hoy\s+mismo|despacho\s+hoy)\b/);
  if (hoyMatch) {
    return { date: todayStr, matchedPhrase: hoyMatch[0], isSameDay: true };
  }

  // 4. Explicit weekday: "para el jueves", "entrega viernes", "despacho el lunes"
  const weekdayMatch = normalized.match(
    /\b(?:para(?:\s+el(?:\s+dia)?)?|entrega(?:\s+el(?:\s+dia)?)?|despacho(?:\s+el(?:\s+dia)?)?)\s+(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/
  );
  if (weekdayMatch) {
    const targetDay = WEEKDAY_NAME_TO_JS_DAY[weekdayMatch[1]];
    if (typeof targetDay === 'number') {
      const currentDay = base.getUTCDay();
      let delta = (targetDay - currentDay + 7) % 7;
      // "para el jueves" written on Thursday typically means today unless specified; keep delta=0 only if same day
      const d = new Date(base.getTime());
      d.setUTCDate(d.getUTCDate() + delta);
      return {
        date: formatDateUtc(d),
        matchedPhrase: weekdayMatch[0],
        isSameDay: delta === 0,
      };
    }
  }

  return null;
}
