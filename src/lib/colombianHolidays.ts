/**
 * Algoritmo Oficial de los 19 Festivos de Colombia (Ley 51 de 1983 - Ley Emiliani + Ley 2578 del 9 de Julio)
 * 
 * Calcula exactamente los 19 días festivos de Colombia para cualquier año (2026, 2027, ..., 2050+).
 */

/**
 * Calcula la fecha del Domingo de Pascua para un año dado usando la fórmula de Gauss / Meeus (Computus).
 */
export function getEasterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Marzo, 4 = Abril
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    return new Date(year, month - 1, day);
}

/**
 * Si la fecha no cae en Lunes, se traslada al Lunes siguiente (Ley Emiliani).
 */
function getNextMondayIfWeekday(year: number, month: number, day: number): Date {
    const d = new Date(year, month - 1, day);
    const dayOfWeek = d.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    if (dayOfWeek === 1) return d; // Ya es Lunes
    if (dayOfWeek === 0) {
        // Si cae en domingo, según Emiliani se mueve al Lunes siguiente (+1 día)
        d.setDate(d.getDate() + 1);
        return d;
    }
    // Si cae de Martes (2) a Sábado (6), se mueve al siguiente Lunes
    const daysUntilMonday = (8 - dayOfWeek) % 7;
    d.setDate(d.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
    return d;
}

function formatDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export interface ColombianHoliday {
    date: string; // YYYY-MM-DD
    name: string;
    type: 'fijo' | 'emiliani' | 'pascua';
}

/**
 * Obtiene la lista completa de los 19 festivos de Colombia para un año específico.
 */
export function getColombianHolidays(year: number): ColombianHoliday[] {
    const holidays: ColombianHoliday[] = [];

    // 1. FESTIVOS FIJOS (6 Días)
    holidays.push({ date: `${year}-01-01`, name: 'Año Nuevo', type: 'fijo' });
    holidays.push({ date: `${year}-05-01`, name: 'Día del Trabajo', type: 'fijo' });
    holidays.push({ date: `${year}-07-20`, name: 'Día de la Independencia', type: 'fijo' });
    holidays.push({ date: `${year}-08-07`, name: 'Batalla de Boyacá', type: 'fijo' });
    holidays.push({ date: `${year}-12-08`, name: 'Inmaculada Concepción', type: 'fijo' });
    holidays.push({ date: `${year}-12-25`, name: 'Navidad', type: 'fijo' });

    // 2. FESTIVOS LEY EMILIANI (8 Días)
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 1, 6)), name: 'Reyes Magos', type: 'emiliani' });
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 3, 19)), name: 'San José', type: 'emiliani' });
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 6, 29)), name: 'San Pedro y San Pablo', type: 'emiliani' });
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 7, 9)), name: 'Virgen del Rosario de Chiquinquirá', type: 'emiliani' }); // Nuevo 19º festivo (Ley 2578)
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 8, 15)), name: 'Asunción de la Virgen', type: 'emiliani' });
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 10, 12)), name: 'Día de la Raza', type: 'emiliani' });
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 11, 1)), name: 'Todos los Santos', type: 'emiliani' });
    holidays.push({ date: formatDateKey(getNextMondayIfWeekday(year, 11, 11)), name: 'Independencia de Cartagena', type: 'emiliani' });

    // 3. FESTIVOS BASADOS EN LA PASCUA (5 Días)
    const easter = getEasterSunday(year);

    // Jueves Santo (Pascua - 3 días)
    const juevesSanto = new Date(easter);
    juevesSanto.setDate(easter.getDate() - 3);
    holidays.push({ date: formatDateKey(juevesSanto), name: 'Jueves Santo', type: 'pascua' });

    // Viernes Santo (Pascua - 2 días)
    const viernesSanto = new Date(easter);
    viernesSanto.setDate(easter.getDate() - 2);
    holidays.push({ date: formatDateKey(viernesSanto), name: 'Viernes Santo', type: 'pascua' });

    // Ascensión del Señor (Pascua + 43 días ➔ Lunes)
    const ascension = new Date(easter);
    ascension.setDate(easter.getDate() + 43);
    holidays.push({ date: formatDateKey(ascension), name: 'Ascensión del Señor', type: 'pascua' });

    // Corpus Christi (Pascua + 64 días ➔ Lunes)
    const corpus = new Date(easter);
    corpus.setDate(easter.getDate() + 64);
    holidays.push({ date: formatDateKey(corpus), name: 'Corpus Christi', type: 'pascua' });

    // Sagrado Corazón de Jesús (Pascua + 71 días ➔ Lunes)
    const sagradoCorazon = new Date(easter);
    sagradoCorazon.setDate(easter.getDate() + 71);
    holidays.push({ date: formatDateKey(sagradoCorazon), name: 'Sagrado Corazón de Jesús', type: 'pascua' });

    return holidays;
}

/**
 * Verifica si una fecha dada es un festivo oficial en Colombia.
 */
export function isColombianHoliday(dateVal: Date | string): { isHoliday: boolean; holidayName?: string } {
    let d: Date;
    if (typeof dateVal === 'string') {
        const parts = dateVal.split('T')[0].split('-');
        if (parts.length === 3) {
            d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            d = new Date(dateVal);
        }
    } else {
        d = dateVal;
    }

    if (isNaN(d.getTime())) return { isHoliday: false };

    const year = d.getFullYear();
    const dateKey = formatDateKey(d);
    const list = getColombianHolidays(year);
    const found = list.find(h => h.date === dateKey);

    if (found) {
        return { isHoliday: true, holidayName: found.name };
    }
    return { isHoliday: false };
}

/**
 * Verifica si una fecha es válida según los permisos de entregas los domingos y festivos.
 */
export function isValidDeliveryDate(
    dateVal: Date | string,
    allowSundays: boolean = false,
    allowHolidays: boolean = false
): { valid: boolean; reason?: string } {
    let d: Date;
    if (typeof dateVal === 'string') {
        const parts = dateVal.split('T')[0].split('-');
        if (parts.length === 3) {
            d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            d = new Date(dateVal);
        }
    } else {
        d = dateVal;
    }

    if (isNaN(d.getTime())) return { valid: true };

    const isSunday = d.getDay() === 0;
    if (isSunday && !allowSundays) {
        return { valid: false, reason: 'Los domingos no realizamos entregas de pedidos.' };
    }

    const { isHoliday, holidayName } = isColombianHoliday(d);
    if (isHoliday && !allowHolidays) {
        return { valid: false, reason: `El día elegido es festivo en Colombia (${holidayName}). No hay entregas disponibles.` };
    }

    return { valid: true };
}

/**
 * Encuentra el primer día hábil permitido a partir de una fecha dada.
 */
export function getNextValidDeliveryDate(
    startDate: Date | string,
    allowSundays: boolean = false,
    allowHolidays: boolean = false
): Date {
    let current: Date;
    if (typeof startDate === 'string') {
        const parts = startDate.split('T')[0].split('-');
        if (parts.length === 3) {
            current = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        } else {
            current = new Date(startDate);
        }
    } else {
        current = new Date(startDate.getTime());
    }

    // Buscar hasta un máximo de 14 días adelante
    for (let i = 0; i < 14; i++) {
        const check = isValidDeliveryDate(current, allowSundays, allowHolidays);
        if (check.valid) {
            return current;
        }
        current.setDate(current.getDate() + 1);
    }
    return current;
}
