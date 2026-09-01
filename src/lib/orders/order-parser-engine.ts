import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * 🛠️ Sanitizador de Texto Inteligente para OCR/PDF/Email
 * Normaliza caracteres homóglifos (ej. Beta 'Β' a 'B'), colapsa espacios por kerning y remueve tildes.
 */
export function sanitizeDocText(text: string): string {
  if (!text) return '';
  let str = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Normalizar la Beta griega 'Β' (914) y 'β' (946) a 'B' / 'b' latina
  str = str.replace(/\u0392/g, 'B').replace(/\u03B2/g, 'b');
  let lower = str.toLowerCase().trim();
  // Arreglo de palabras fragmentadas comunes por kerning de impresoras PDF
  lower = lower.replace(/\ba\s+gua\s+cates?\b/gi, 'aguacate');
  lower = lower.replace(/\barra\s+cacha\b/gi, 'arracacha');
  lower = lower.replace(/\bc\s+e\s+b\s+o\s+l\s+l\s+a\b/gi, 'cebolla');
  lower = lower.replace(/\bt\s+o\s+m\s+a\s+t\s+e\b/gi, 'tomate');
  lower = lower.replace(/\bp\s+a\s+p\s+a\b/gi, 'papa');
  lower = lower.replace(/\bl\s+i\s+m\s+o\s+n\b/gi, 'limon');
  lower = lower.replace(/\bn\s+a\s+r\s+a\s+n\s+j\s+a\b/gi, 'naranja');
  lower = lower.replace(/\bp\s+l\s+a\s+t\s+a\s+n\s+o\b/gi, 'platano');
  lower = lower.replace(/\bc\s+o\s+l\s+s\s+u\s+b\s+s\s+i\s+d\s+i\s+o\b/gi, 'colsubsidio');
  return lower.replace(/\s+/g, ' ');
}

/**
 * ⚡ Extractor IA con Resiliencia y Reintentos para Cuotas (HTTP 429)
 */
export async function fetchGeminiExtraction(
  apiKey: string,
  prompt: string,
  base64Data?: string,
  mimeType: string = 'application/pdf'
): Promise<any> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [
    'gemini-2.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite'
  ];
  let resultText: string | null = null;
  let successfulModel: string = '';
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[OrderParserEngine] Extrayendo con modelo ultrarrápido: ${modelName}...`);
      const model = genAI.getGenerativeModel({ model: modelName });
      
      const contents: any[] = [];
      if (base64Data) {
        contents.push({ inlineData: { data: base64Data, mimeType } });
      }
      contents.push({ text: prompt });

      const res = await model.generateContent(contents);
      const text = (await res.response).text().trim();
      if (text) {
        resultText = text;
        successfulModel = modelName;
        console.log(`[OrderParserEngine] ✅ Extracción exitosa con modelo ${modelName}`);
        break;
      }
    } catch (err: any) {
      console.warn(`[OrderParserEngine] Advertencia con modelo ${modelName}:`, err.message);
      lastError = err;
      // Continuar inmediatamente al siguiente modelo de respaldo
    }
  }

  if (!resultText) {
    throw lastError || new Error('No se pudo establecer comunicación con la API de Gemini.');
  }

  // Sanitizar el bloque JSON de la respuesta
  const cleanJson = resultText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  const parsedJson = JSON.parse(cleanJson);
  parsedJson._modelUsed = successfulModel;
  return parsedJson;
}

/**
 * 🎯 Resolutor Multicanal de Perfil de Cliente
 * Capa 1: NIT -> Capa 2: Emails / Aliases -> Capa 3: Razón Social -> Capa 4: Texto de Firma
 */
export function resolveClientProfile(
  clientInfo: { nit?: string; email?: string; name?: string; signatureText?: string },
  profiles: any[]
): any | null {
  if (!profiles || profiles.length === 0) return null;

  // Capa 1: Coincidencia por NIT
  const cleanNit = (clientInfo.nit || '').replace(/[^0-9]/g, '');
  if (cleanNit && cleanNit.length >= 6) {
    const matched = profiles.find(p => {
      const pNit = (p.nit || '').replace(/[^0-9]/g, '');
      return pNit && (pNit.includes(cleanNit) || cleanNit.includes(pNit));
    });
    if (matched) return matched;
  }

  // Capa 2: Coincidencia por Correo Electrónico
  const srcEmail = (clientInfo.email || '').toLowerCase().trim();
  if (srcEmail && srcEmail.includes('@')) {
    const matched = profiles.find(p => {
      const primaryEmail = (p.email || '').toLowerCase().trim();
      const altEmails = Array.isArray(p.alternate_emails) 
        ? p.alternate_emails.map((e: string) => e.toLowerCase().trim())
        : [];
      return primaryEmail === srcEmail || altEmails.includes(srcEmail);
    });
    if (matched) return matched;
  }

  // Capa 3: Coincidencia por Razón Social / Nombre Comercial / Sede Específica
  const cleanName = sanitizeDocText(clientInfo.name || '');
  const cleanAddress = sanitizeDocText(clientInfo.address || '');
  if (cleanName && cleanName.length >= 3) {
    // Si contiene sede específica (ej: "Colegio Norte", "Ceic Norte", "El Cubo", "Peñalisa")
    const matchedSede = profiles.find(p => {
      const compName = sanitizeDocText(p.company_name || '');
      const pAddress = sanitizeDocText(p.address || '');
      // Match si la dirección del perfil coincide con la dirección del documento
      if (cleanAddress && pAddress && (pAddress.includes(cleanAddress) || cleanAddress.includes(pAddress.replace(/[^a-z0-9]/g, '')))) {
        return true;
      }
      // Match si el nombre contiene la sede (ej. "Norte", "Ceic", "Cubo")
      const nameWords = cleanName.split(/\s+/).filter(w => w.length > 3 && !['caja', 'compensacion', 'familiar', 'colsubsidio', 'sas', 'ltda'].includes(w));
      return nameWords.length > 0 && nameWords.some(w => compName.includes(w));
    });
    if (matchedSede) return matchedSede;

    const matched = profiles.find(p => {
      const compName = sanitizeDocText(p.company_name || '');
      const contactName = sanitizeDocText(p.contact_name || '');
      return (compName && (compName.includes(cleanName) || cleanName.includes(compName.split(' ')[0]))) ||
             (contactName && contactName.includes(cleanName));
    });
    if (matched) return matched;
  }

  // Capa 4: Coincidencia por Texto de Firma, Dirección o Cuerpo del Correo
  const sigText = sanitizeDocText(clientInfo.signatureText || '');
  if (sigText && sigText.length >= 5) {
    const matched = profiles.find(p => {
      const compName = sanitizeDocText(p.company_name || '');
      return compName && compName.length >= 4 && sigText.includes(compName);
    });
    if (matched) return matched;
  }

  // Capa 5: Coincidencia por Dirección de Entrega en el Documento
  if (cleanAddress && cleanAddress.length >= 5) {
    const matchedByAddress = profiles.find(p => {
      const pAddress = sanitizeDocText(p.address || '');
      return pAddress && pAddress.length >= 5 && (pAddress.includes(cleanAddress) || cleanAddress.includes(pAddress));
    });
    if (matchedByAddress) return matchedByAddress;
  }

  return null;
}

export interface ProductMatchResult {
  product: any | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceScore: number;
  matchSource: 'MEMORY' | 'EXACT' | 'TOKEN' | 'NONE';
  matchReason: string;
}

/**
 * 📦 Buscador Detallado de Productos con Nivel de Confianza
 */
export function findBestProductMatchDetails(
  rawName: string,
  products: any[],
  learnedMemory: any[] = []
): ProductMatchResult {
  const cleanInput = sanitizeDocText(rawName);
  if (!cleanInput || !products || products.length === 0) {
    return { product: null, confidence: 'LOW', confidenceScore: 0, matchSource: 'NONE', matchReason: 'Sin datos de entrada' };
  }

  // Limpiar gramajes y unidades como '1000 gr', '500g', '1 kg', 'und', 'paquete'
  const strippedInput = cleanInput
    .replace(/\b\d+(?:[\.,]\d+)?\s*(?:kg|kls?|kilos?|g|gr|grs|gramos?|lbs?|libras?|unidades?|uds?|unds?|paquetes?|atados?|litros?|lt)\b/gi, '')
    .replace(/\b(?:kg|kls?|kilos?|g|gr|grs|gramos?|lbs?|libras?|unidades?|uds?|unds?|paquetes?|atados?|litros?|lt)\b/gi, '')
    .trim();

  // Prioridad 1: Memoria Histórica Aprendida para este Cliente
  if (learnedMemory.length > 0) {
    const memMatch = learnedMemory.find(m => 
      m.normalized_text === cleanInput || 
      (strippedInput && m.normalized_text === strippedInput) ||
      cleanInput.includes(m.normalized_text) ||
      m.normalized_text.includes(cleanInput)
    );
    if (memMatch) {
      const matchedProd = products.find(p => p.id === memMatch.matched_product_id);
      if (matchedProd) {
        return {
          product: matchedProd,
          confidence: 'HIGH',
          confidenceScore: 100,
          matchSource: 'MEMORY',
          matchReason: 'Aprendido de órdenes anteriores'
        };
      }
    }
  }

  // Prioridad 2: Coincidencia EXACTA con nombre de catálogo (con o sin unidades)
  let exactMatch = products.find(p => {
    const cleanPName = sanitizeDocText(p.name);
    return cleanInput === cleanPName || (strippedInput && strippedInput === cleanPName);
  });
  if (exactMatch) {
    return {
      product: exactMatch,
      confidence: 'HIGH',
      confidenceScore: 100,
      matchSource: 'EXACT',
      matchReason: 'Coincidencia exacta de catálogo'
    };
  }

  // Prioridad 3: Coincidencia por tokens / palabras individuales (Priorizar el producto base más corto)
  // Por ejemplo: 'espinaca' debe coincidir con 'Espinaca' y NO con 'Espinaca sin raiz'
  const queryTokens = (strippedInput || cleanInput).split(/\s+/).filter(t => t.length > 2);
  if (queryTokens.length > 0) {
    const candidates = products.filter(p => {
      const pClean = sanitizeDocText(p.name);
      const pTokens = pClean.split(/\s+/).filter(t => t.length > 2);
      return queryTokens.every(qt => pTokens.some(pt => pt.startsWith(qt) || qt.startsWith(pt)));
    });

    if (candidates.length > 0) {
      // Ordenar: primero el que tenga menor diferencia de longitud con la búsqueda (el producto base)
      const targetQuery = strippedInput || cleanInput;
      candidates.sort((a, b) => {
        const cleanA = sanitizeDocText(a.name);
        const cleanB = sanitizeDocText(b.name);
        const diffA = Math.abs(cleanA.length - targetQuery.length);
        const diffB = Math.abs(cleanB.length - targetQuery.length);
        return diffA - diffB;
      });

      const best = candidates[0];
      const isVeryClose = sanitizeDocText(best.name).length <= targetQuery.length + 4;
      return {
        product: best,
        confidence: isVeryClose ? 'HIGH' : 'MEDIUM',
        confidenceScore: isVeryClose ? 95 : 75,
        matchSource: 'TOKEN',
        matchReason: isVeryClose ? 'Coincidencia base de catálogo' : 'Sugerencia por palabra clave'
      };
    }
  }

  return {
    product: null,
    confidence: 'LOW',
    confidenceScore: 0,
    matchSource: 'NONE',
    matchReason: 'No se encontró coincidencia automática'
  };
}

/**
 * 📦 Buscador Inteligente de Productos con Memoria Histórica (Compatibilidad)
 */
export function findBestProductMatch(
  rawName: string,
  products: any[],
  learnedMemory: any[] = []
): any | null {
  return findBestProductMatchDetails(rawName, products, learnedMemory).product;
}

/**
 * 💾 Guardar Coincidencia Confirmada en la Memoria Histórica del Cliente
 */
export async function recordLearningMemory(
  supabaseClient: any,
  clientId: string,
  rawText: string,
  matchedProductId: string,
  matchedUnit?: string
) {
  if (!supabaseClient || !clientId || !rawText || !matchedProductId) return;
  const normText = sanitizeDocText(rawText);
  if (!normText) return;

  try {
    await supabaseClient.from('document_learning_memory').upsert({
      client_id: clientId,
      raw_pdf_text: rawText,
      normalized_text: normText,
      matched_product_id: matchedProductId,
      matched_unit: matchedUnit || 'Kg',
      last_confirmed_at: new Date().toISOString()
    }, { onConflict: 'client_id,normalized_text' });
  } catch (e) {
    console.log('[OrderParserEngine] Error guardando memoria:', e);
  }
}
