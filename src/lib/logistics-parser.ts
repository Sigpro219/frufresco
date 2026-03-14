/**
 * Logistics Parser Agent Utilities
 * Converts natural language delivery restrictions into structured data 
 * digestible by Google Maps Route Optimization.
 * 
 * OPERATIVE RANGE FRUFRESCO: 04:30 AM - 07:00 PM (19:00)
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

function clampTime(h: number, m: number): { h: number, m: number } {
  const totalMinutes = h * 60 + m;
  const minMinutes = 4 * 60 + 30; // 04:30
  const maxMinutes = 19 * 60;     // 19:00

  if (totalMinutes < minMinutes) return { h: 4, m: 30 };
  if (totalMinutes > maxMinutes) return { h: 19, m: 0 };
  return { h, m };
}

const parseH = (s: string, p?: string) => {
  let [h, m] = s.split(':').map(Number);
  if (isNaN(m)) m = 0;
  if ((p?.includes('tarde') || p === 'pm') && h < 12) h += 12;
  if ((p?.includes('mañana') || p === 'am') && h === 12) h = 0;
  return { h, m };
};

export function parseLogisticsText(text: string): LogisticsData {
  if (!text) return {
    windows: [{ startTime: "04:30", endTime: "12:00" }],
    days: [1, 2, 3, 4, 5, 6],
    parsing_date: new Date().toISOString()
  };

  const normalizedText = normalizeNumbers(text);
  let days: number[] = [];
  
  const allDays = [1, 2, 3, 4, 5, 6, 0];
  const isAllDays = /todos los d[íi]as|diario|siempre/i.test(normalizedText);

  if (isAllDays) {
    days = [...allDays];
  } else {
    const dayMap: Record<string, number> = { 
      'lunes': 1, 'lun': 1, 'martes': 2, 'mar': 2, 'miércoles': 3, 'miercoles': 3, 'mie': 3,
      'jueves': 4, 'jue': 4, 'viernes': 5, 'vie': 5, 'sábado': 6, 'sabado': 6, 'sab': 6, 'domingo': 0, 'dom': 0
    };

    // Detectar rangos como "lunes a viernes" o "lun-sab"
    const rangeDayMatch = normalizedText.match(/(lunes|lun|martes|mar|mi[ée]rcoles|mie|jueves|jue|viernes|vie|s[áa]bado|sab|domingo|dom)\s*(?:a|hasta|-)\s*(lunes|lun|martes|mar|mi[ée]rcoles|mie|jueves|jue|viernes|vie|s[áa]bado|sab|domingo|dom)/i);
    
    if (rangeDayMatch) {
      const startDay = dayMap[rangeDayMatch[1].toLowerCase()];
      let endDay = dayMap[rangeDayMatch[2].toLowerCase()];
      
      if (startDay !== undefined && endDay !== undefined) {
        // Manejar rangos que cruzan el domingo si es necesario, pero usualmente es lineal
        if (endDay === 0) endDay = 7; // Domingo al final para el rango
        for (let i = startDay; i <= endDay; i++) {
          days.push(i === 7 ? 0 : i);
        }
      }
    }

    // Si no es un rango, buscar días individuales
    if (days.length === 0) {
      if (/lunes/i.test(normalizedText)) days.push(1);
      if (/martes/i.test(normalizedText)) days.push(2);
      if (/mi[ée]rcoles/i.test(normalizedText)) days.push(3);
      if (/jueves/i.test(normalizedText)) days.push(4);
      if (/viernes/i.test(normalizedText)) days.push(5);
      if (/s[áa]bado/i.test(normalizedText)) days.push(6);
      if (/domingo/i.test(normalizedText)) days.push(0);
    }
  }

  // Si no se detectaron días, asumir de lunes a sábado (estándar operativo)
  if (days.length === 0) {
    days = [1, 2, 3, 4, 5, 6];
  }

  // Handle negations (Colombianisms: "menos los", "excepto", "el [día] no")
  const excludeMatch = normalizedText.match(/(?:menos|excepto|no|salvo|sin)\s+(?:los\s+|el\s+)?(lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado|domingo)/i);
  if (excludeMatch) {
    const dayToExclude = excludeMatch[1].toLowerCase();
    const dayMap: Record<string, number> = { 
      'lunes': 1, 'martes': 2, 'miércoles': 3, 'miercoles': 3, 
      'jueves': 4, 'viernes': 5, 'sábado': 6, 'sabado': 6, 'domingo': 0 
    };
    const dayVal = dayMap[dayToExclude];
    if (dayVal !== undefined) {
      days = days.filter(d => d !== dayVal);
    }
  }

  const windows: TimeWindow[] = [];

  // Generic range pattern: "entre X y Y", "de X a Y", "X hasta Y"
  const rangeMatch = normalizedText.match(/(?:entre\s+)?(\d+(?::\d{2})?)\s*(am|pm|tarde|ma[ñn]ana)?\s*(?:a|hasta|y)\s*(\d+(?::\d{2})?)\s*(am|pm|tarde|ma[ñn]ana)?/i);
  
  if (rangeMatch) {
    const [ , startStr, startP, endStr, endP ] = rangeMatch;
    
    const rawStart = parseH(startStr, startP);
    const rawEnd = parseH(endStr, endP || startP); 

    const start = clampTime(rawStart.h, rawStart.m);
    const end = clampTime(rawEnd.h, rawEnd.m);

    windows.push({ 
      startTime: `${start.h.toString().padStart(2, '0')}:${start.m.toString().padStart(2, '0')}`,
      endTime: `${end.h.toString().padStart(2, '0')}:${end.m.toString().padStart(2, '0')}`
    });
  }

  // "Después de las X", "A partir de las X", "Luego de las X"
  if (windows.length === 0) {
    const afterMatch = normalizedText.match(/(?:despu[ée]s|luego|a partir|desde)\s+(?:de\s+)?(?:las\s+)?(\d+(?::\d{2})?)\s*(am|pm|de la tarde|de la mañana)?/i);
    if (afterMatch) {
      const [ , timeStr, period ] = afterMatch;
      const rawH = parseH(timeStr, period);
      const { h, m } = clampTime(rawH.h, rawH.m);
      
      windows.push({ 
        startTime: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, 
        endTime: "19:00" 
      });
    }
  }

  // Morning pattern: "antes de las X"
  if (windows.length === 0) {
    const morningMatch = normalizedText.match(/(?:ma[ñn]ana\s+)?antes de las\s+(\d+(?::\d{2})?)\s*(am|pm|de la ma[ñn]ana)?/i);
    if (morningMatch) {
      const [ , timeStr, period ] = morningMatch;
      let [h, m] = timeStr.split(':').map(Number);
      if (isNaN(m)) m = 0;
      if (period?.includes('pm') && h < 12) h += 12;
      
      const clamped = clampTime(h, m);
      
      windows.push({ startTime: "04:30", endTime: `${clamped.h.toString().padStart(2, '0')}:${clamped.m.toString().padStart(2, '0')}` });
    }
  }

  // Broad Colombian terms Fallback
  if (windows.length === 0) {
    if (/ma[ñn]ana/i.test(normalizedText)) {
      windows.push({ startTime: "04:30", endTime: "11:00" });
    } else if (/tarde/i.test(normalizedText)) {
      windows.push({ startTime: "13:00", endTime: "18:00" });
    }
  }

  // Final Default Operative Window
  if (windows.length === 0) {
    windows.push({ startTime: "04:30", endTime: "12:00" });
  }

  return {
    windows,
    days: days.length > 0 ? days : [1, 2, 3, 4, 5, 6],
    special_notes: text,
    parsing_date: new Date().toISOString()
  };
}

export function formatTimeWindow(data?: LogisticsData): string {
  if (!data || !data.days || data.days.length === 0) return 'Sin restricciones (Horario Completo 04:30 - 19:00)';
  
  const daysMap = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  let formattedDays = '';
  
  if (data.days.length === 7) formattedDays = 'Toda la semana';
  else if (data.days.length === 6 && !data.days.includes(0)) formattedDays = 'Lun-Sáb';
  else formattedDays = data.days.sort((a,b) => (a||7)-(b||7)).map(d => daysMap[d]).join(', ');

  const formattedWindows = (data.windows || []).map(w => `${w.startTime} - ${w.endTime}`).join(' / ');
  
  return `${formattedDays}: ${formattedWindows || '04:30 - 19:00'}`;
}
