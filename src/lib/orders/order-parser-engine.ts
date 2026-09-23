import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  executeWithObsolescenceGuard,
  PRIMARY_AI_MODEL,
  CANONICAL_MODEL_CASCADE,
  getGeminiApiKey,
} from '@/lib/ai/aiModelConfig';

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
 * ⚡ Extractor IA con Gobernanza Central y Centinela de Obsolescencia Poka-Yoke
 */
export async function fetchGeminiExtraction(
  apiKey: string,
  prompt: string,
  base64Data?: string,
  mimeType: string = 'application/pdf'
): Promise<any> {
  const resolvedApiKey = apiKey?.trim() || getGeminiApiKey();

  const parts: any[] = [];
  if (base64Data && base64Data.trim().length > 0) {
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data.trim()
      }
    });
  }
  parts.push({ text: prompt });

  let successfulModelUsed = PRIMARY_AI_MODEL;

  const extractionResult = await executeWithObsolescenceGuard(
    async (modelName: string, keyToUse: string, signal?: AbortSignal) => {
      successfulModelUsed = modelName;
      console.log(`[OrderParserEngine] Extrayendo con modelo central: ${modelName}...`);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${keyToUse}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
        signal: signal
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMsg = data?.error?.message || response.statusText || 'Error desconocido';
        console.warn(`[OrderParserEngine] Respuesta ${response.status} con modelo ${modelName}:`, errorMsg);

        // Si el error es de cliente (el archivo no tiene páginas, documento inválido, etc.)
        // NO tiene sentido reintentar con otros modelos: el archivo es el que tiene el problema.
        if (errorMsg.includes('has no pages') || errorMsg.includes('no pages') || errorMsg.includes('empty page')) {
          throw new Error('Archivo dañado o no compatible. El documento PDF no contiene páginas legibles o está vacío. Por favor verifique que sea un documento PDF original completo.');
        }

        if (response.status === 400 && (errorMsg.includes('corrupted') || errorMsg.includes('failed to parse') || errorMsg.includes('invalid argument') || errorMsg.includes('Invalid base64 payload'))) {
          const badReqErr = new Error(`Archivo dañado o no compatible. No fue posible interpretar la estructura del documento.`);
          (badReqErr as any).status = 400;
          (badReqErr as any).statusCode = 400;
          throw badReqErr;
        }

        const apiErr = new Error(`[Gemini ${response.status}] ${errorMsg}`);
        (apiErr as any).status = response.status;
        (apiErr as any).statusCode = response.status;
        throw apiErr;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        throw new Error(`El modelo ${modelName} no devolvió texto en la respuesta.`);
      }

      console.log(`[OrderParserEngine] ✅ Extracción exitosa con modelo ${modelName}`);
      return { rawText: text, modelUsed: modelName };
    },
    {
      apiKey: resolvedApiKey,
      moduleName: 'orders',
      operationName: 'order-parser-extraction',
      timeoutMs: 45000,
    }
  );

  const resultText = extractionResult.rawText;

  // Sanitizar el bloque JSON de la respuesta de forma ultra-robusta
  let parsedJson: any = null;
  const match = resultText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    try {
      parsedJson = JSON.parse(match[1].trim());
    } catch (e) {
      // Fallback below
    }
  }

  if (!parsedJson) {
    const firstBrace = resultText.indexOf('{');
    const lastBrace = resultText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        parsedJson = JSON.parse(resultText.slice(firstBrace, lastBrace + 1).trim());
      } catch (e) {
        // Fallback below
      }
    }
  }

  if (!parsedJson) {
    const cleanJson = resultText.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    parsedJson = JSON.parse(cleanJson);
  }

  parsedJson._modelUsed = extractionResult.modelUsed || successfulModelUsed;
  if (extractionResult._obsolescenceWarning) {
    parsedJson._obsolescenceWarning = extractionResult._obsolescenceWarning;
  }
  return parsedJson;
}

/**
 * 🎯 Resolutor Multicanal de Perfil de Cliente
 * Capa 1: NIT -> Capa 2: Emails / Aliases -> Capa 3: Razón Social -> Capa 4: Texto de Firma
 */
export function resolveClientProfile(
  clientInfo: { nit?: string; email?: string; name?: string; address?: string; signatureText?: string },
  profiles: any[]
): any | null {
  if (!profiles || profiles.length === 0) return null;

  const cleanNit = (clientInfo.nit || '').replace(/[^0-9]/g, '');
  const cleanName = sanitizeDocText(clientInfo.name || '');
  const cleanAddress = sanitizeDocText(clientInfo.address || '');
  const sigText = sanitizeDocText(clientInfo.signatureText || '');
  const fullSearchContext = `${cleanName} ${cleanAddress} ${sigText}`.toLowerCase();

  const stopWords = ['caja', 'compensacion', 'familiar', 'colsubsidio', 'sas', 's.a.s', 's.a.', 'ltda', 'sociedad', 'sede', 'sucursal', 'restaurante', 'empresa', 'cliente'];
  const nameKeywords = cleanName
    .split(/\s+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2 && !stopWords.includes(w));
  
  const addressNumbers = cleanAddress.match(/\b\d+[\w-]*\b/g) || [];

  const scoreCandidateBranch = (p: any): number => {
    let score = 0;
    const compName = sanitizeDocText(p.company_name || '');
    const contactName = sanitizeDocText(p.contact_name || '');
    const pAddress = sanitizeDocText(p.address || '');

    // 1. Coincidencia de Dirección exacta o parcial
    if (cleanAddress && pAddress) {
      if (cleanAddress.includes(pAddress) || pAddress.includes(cleanAddress)) score += 50;
      // Coincidencia de números de nomenclatura (calle, carrera, número)
      if (addressNumbers.length > 0) {
        let numMatches = 0;
        addressNumbers.forEach(n => {
          if (pAddress.includes(n)) numMatches++;
        });
        score += numMatches * 15;
      }
    }

    // 2. Coincidencia de palabras clave del nombre de la sede (ej. "CESD", "53", "Galerias", "Bellavista", "Piscilago")
    nameKeywords.forEach(kw => {
      if (compName.includes(kw)) score += 20;
      if (contactName.includes(kw)) score += 15;
      if (pAddress.includes(kw)) score += 10;
    });

    // 3. Coincidencia en contexto completo (ej. documento menciona palabras de compName)
    const branchSpecificWords = compName.split(/\s+/).filter(w => w.length > 3 && !stopWords.includes(w));
    branchSpecificWords.forEach(w => {
      if (fullSearchContext.includes(w)) score += 10;
    });

    return score;
  };

  // Capa 1: Coincidencia por NIT (con Desambiguación Multisede)
  if (cleanNit && cleanNit.length >= 6) {
    const nitCandidates = profiles.filter(p => {
      const pNit = (p.nit || '').replace(/[^0-9]/g, '');
      return pNit && (pNit.includes(cleanNit) || cleanNit.includes(pNit));
    });

    if (nitCandidates.length === 1) {
      return nitCandidates[0];
    } else if (nitCandidates.length > 1) {
      // Ordenar candidatos por puntuación de sede (dirección + nombre)
      const scored = nitCandidates.map(p => ({ profile: p, score: scoreCandidateBranch(p) }));
      scored.sort((a, b) => b.score - a.score);
      if (scored[0].score > 0) {
        return scored[0].profile;
      }
      // Si ninguna sede específica coincidió con la dirección/nombre, preferir matriz o primera
      const parentMatrix = nitCandidates.find(p => !p.parent_id);
      return parentMatrix || nitCandidates[0];
    }
  }

  // Capa 2: Coincidencia por Correo Electrónico
  const srcEmail = (clientInfo.email || '').toLowerCase().trim();
  if (srcEmail && srcEmail.includes('@')) {
    const emailCandidates = profiles.filter(p => {
      const primaryEmail = (p.email || '').toLowerCase().trim();
      const altEmails = Array.isArray(p.alternate_emails) 
        ? p.alternate_emails.map((e: string) => e.toLowerCase().trim())
        : [];
      return primaryEmail === srcEmail || altEmails.includes(srcEmail);
    });
    if (emailCandidates.length === 1) return emailCandidates[0];
    if (emailCandidates.length > 1) {
      const scored = emailCandidates.map(p => ({ profile: p, score: scoreCandidateBranch(p) }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0].profile;
    }
  }

  // Capa 3: Coincidencia por Razón Social / Nombre Comercial / Sede Específica
  if (cleanName && cleanName.length >= 3) {
    const nameCandidates = profiles.filter(p => {
      const compName = sanitizeDocText(p.company_name || '');
      const contactName = sanitizeDocText(p.contact_name || '');
      return (compName && (compName.includes(cleanName) || cleanName.includes(compName.split(' ')[0]))) ||
             (contactName && contactName.includes(cleanName));
    });

    if (nameCandidates.length === 1) {
      return nameCandidates[0];
    } else if (nameCandidates.length > 1) {
      const scored = nameCandidates.map(p => ({ profile: p, score: scoreCandidateBranch(p) }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0].profile;
    }
  }

  // Capa 4: Coincidencia por Texto de Firma o Contexto General
  if (sigText && sigText.length >= 5) {
    const sigCandidates = profiles.filter(p => {
      const compName = sanitizeDocText(p.company_name || '');
      return compName && compName.length >= 4 && sigText.includes(compName);
    });
    if (sigCandidates.length > 0) {
      const scored = sigCandidates.map(p => ({ profile: p, score: scoreCandidateBranch(p) }));
      scored.sort((a, b) => b.score - a.score);
      return scored[0].profile;
    }
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
