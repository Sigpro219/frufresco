/**
 * Logistics Parser Agent Utilities
 * Converts natural language delivery restrictions into structured data 
 * digestible by Google Maps Route Optimization.
 */

export interface TimeWindow {
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
}

export interface LogisticsData {
  windows: TimeWindow[];
  days: number[]; // 0=Sunday, 1=Monday...
  special_notes?: string;
  parsing_date: string;
}

const NUMBER_WORDS: Record<string, number> = {
  'una': 1, 'un': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 
  'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11, 'doce': 12
};

function normalizeNumbers(text: string): string {
  let normalized = text.toLowerCase();
  for (const [word, num] of Object.entries(NUMBER_WORDS)) {
    const regex = new RegExp(`\\b${word}\\b`, 'g');
    normalized = normalized.replace(regex, num.toString());
  }
  return normalized;
}

export async function parseLogisticsText(text: string): Promise<LogisticsData> {
  const normalizedText = normalizeNumbers(text);
  let days: number[] = [];
  
  const allDays = [1, 2, 3, 4, 5, 6, 0];
  const isAllDays = /todos los d[íi]as|diario|siempre/i.test(normalizedText);

  if (isAllDays) {
    days = [...allDays];
  } else {
    if (/lunes/i.test(normalizedText)) days.push(1);
    if (/martes/i.test(normalizedText)) days.push(2);
    if (/mi[ée]rcoles/i.test(normalizedText)) days.push(3);
    if (/jueves/i.test(normalizedText)) days.push(4);
    if (/viernes/i.test(normalizedText)) days.push(5);
    if (/s[áa]bado/i.test(normalizedText)) days.push(6);
    if (/domingo/i.test(normalizedText)) days.push(0);
  }

  // Handle negations (Colombianisms: "menos los", "excepto", "el [día] no")
  const excludeMatch = normalizedText.match(/(?:menos|excepto|no|salvo)\s+(?:los\s+)?(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)/i);
  if (excludeMatch) {
    const dayToExclude = excludeMatch[1].toLowerCase();
    const dayMap: Record<string, number> = { 
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0 
    };
    const dayVal = dayMap[dayToExclude];
    if (dayVal !== undefined) {
      if (isAllDays) {
        days = days.filter(d => d !== dayVal);
      } else if (days.length === 1 && days[0] === dayVal) {
        // If they said "jueves no", and we only had Thursday, clear it
        days = [];
      }
    }
  }

  const windows: TimeWindow[] = [];

  // "Después de las X" or "A partir de las X"
  const afterMatch = normalizedText.match(/(?:despu[ée]s|luego|a partir|desde)\s+(?:de\s+)?(?:las\s+)?(\d+)(?:\s*(am|pm|de la tarde|de la mañana|tm|m))?/i);
  if (afterMatch) {
    let hour = parseInt(afterMatch[1]);
    const period = afterMatch[2]?.toLowerCase();
    if ((period?.includes('tarde') || period === 'pm') && hour < 12) hour += 12;
    if ((period?.includes('mañana') || period === 'am') && hour === 12) hour = 0;
    windows.push({ startTime: `${hour < 10 ? '0' + hour : hour}:00`, endTime: "19:00" });
  }

  // Morning pattern: "antes de las X"
  const morningMatch = normalizedText.match(/(?:ma[ñn]ana\s+)?antes de las\s+(\d+)\s*(am|pm|de la ma[ñn]ana)?/i);
  if (morningMatch && windows.length === 0) {
    let hour = parseInt(morningMatch[1]);
    const period = morningMatch[2]?.toLowerCase();
    if (period === 'pm' && hour < 12) hour += 12;
    windows.push({ startTime: "06:00", endTime: `${hour < 10 ? '0' + hour : hour}:00` });
  }

  // Generic range pattern: "entre X y Y", "de X a Y"
  const rangeMatch = normalizedText.match(/(?:entre\s+)?(\d+)\s*(am|pm|tarde|ma[ñn]ana)?\s*(?:a|hasta|y)\s*(\d+)\s*(am|pm|tarde|ma[ñn]ana)?/i);
  if (rangeMatch && windows.length === 0) {
    let startH = parseInt(rangeMatch[1]);
    const startP = rangeMatch[2]?.toLowerCase();
    let endH = parseInt(rangeMatch[3]);
    const endP = rangeMatch[4]?.toLowerCase() || startP;

    if ((startP?.includes('tarde') || startP === 'pm') && startH < 12) startH += 12;
    if ((endP?.includes('tarde') || endP === 'pm') && endH < 12) endH += 12;
    
    windows.push({ 
      startTime: `${startH < 10 ? '0' + startH : startH}:00`, 
      endTime: `${endH < 10 ? '0' + endH : endH}:00` 
    });
  }

  // Broad Colombian terms: "en la mañana", "toda la tarde"
  if (windows.length === 0) {
    if (/ma[ñn]ana/i.test(normalizedText)) {
      windows.push({ startTime: "07:00", endTime: "12:00" });
    } else if (/tarde/i.test(normalizedText)) {
      windows.push({ startTime: "14:00", endTime: "18:00" });
    }
  }

  // Default fallback
  if (windows.length === 0 && days.length > 0) {
    windows.push({ startTime: "07:00", endTime: "12:00" });
  }

  return {
    windows,
    days: days.length > 0 ? days : [1, 2, 3, 4, 5, 6],
    special_notes: text,
    parsing_date: new Date().toISOString()
  };
}

export function formatTimeWindow(data: LogisticsData): string {
  if (!data || !data.windows || data.windows.length === 0) return 'Horario estándar (7am - 5pm)';
  
  const daysMap = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const formattedDays = data.days.length === 7 ? 'Toda la semana' : 
                        data.days.length === 6 && !data.days.includes(0) ? 'Lun-Sáb' :
                        data.days.map(d => daysMap[d]).join(', ');

  const formattedWindows = data.windows.map(w => `${w.startTime} - ${w.endTime}`).join(' / ');
  
  return `${formattedDays}: ${formattedWindows}`;
}
