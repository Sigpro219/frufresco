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
  const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash-latest'];
  let resultText: string | null = null;
  let lastError: any = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        console.log(`[OrderParserEngine] Extrayendo con modelo ${modelName} (intento ${attempt + 1})...`);
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
          console.log(`[OrderParserEngine] Éxito con modelo ${modelName}`);
          break;
        }
      } catch (err: any) {
        console.warn(`[OrderParserEngine] Error con modelo ${modelName} (intento ${attempt + 1}):`, err.message);
        lastError = err;
        if (err.message?.includes('429') || err.status === 429) {
          console.log('⏳ Rate limit 429. Esperando 10s antes de reintentar...');
          await new Promise(r => setTimeout(r, 10000));
        } else {
          break; // Switch to next model if non-429 error
        }
      }
    }
    if (resultText) break;
  }

  if (!resultText) {
    throw lastError || new Error('No se pudo establecer comunicación con la API de Gemini.');
  }

  // Sanitizar el bloque JSON de la respuesta
  const cleanJson = resultText.replace(/^```json/, '').replace(/^```/, '').replace(/```$/, '').trim();
  return JSON.parse(cleanJson);
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

  // Capa 3: Coincidencia por Razón Social / Nombre Comercial
  const cleanName = sanitizeDocText(clientInfo.name || '');
  if (cleanName && cleanName.length >= 3) {
    const matched = profiles.find(p => {
      const compName = sanitizeDocText(p.company_name || '');
      const contactName = sanitizeDocText(p.contact_name || '');
      return (compName && (compName.includes(cleanName) || cleanName.includes(compName.split(' ')[0]))) ||
             (contactName && contactName.includes(cleanName));
    });
    if (matched) return matched;
  }

  // Capa 4: Coincidencia por Texto de Firma o Cuerpo del Correo
  const sigText = sanitizeDocText(clientInfo.signatureText || '');
  if (sigText && sigText.length >= 5) {
    const matched = profiles.find(p => {
      const compName = sanitizeDocText(p.company_name || '');
      return compName && compName.length >= 4 && sigText.includes(compName);
    });
    if (matched) return matched;
  }

  return null;
}

/**
 * 📦 Buscador Inteligente de Productos con Memoria Histórica
 * Prioridad 1: Memoria del cliente (document_learning_memory)
 * Prioridad 2: Coincidencia exacta/substring sanitizada en catálogo
 * Prioridad 3: Coincidencia por raíz (plurales/singulares)
 */
export function findBestProductMatch(
  rawName: string,
  products: any[],
  learnedMemory: any[] = []
): any | null {
  const cleanInput = sanitizeDocText(rawName);
  if (!cleanInput || !products || products.length === 0) return null;

  // Prioridad 1: Memoria Histórica Aprendida para este Cliente
  if (learnedMemory.length > 0) {
    const memMatch = learnedMemory.find(m => 
      m.normalized_text === cleanInput || 
      cleanInput.includes(m.normalized_text) ||
      m.normalized_text.includes(cleanInput)
    );
    if (memMatch) {
      const matchedProd = products.find(p => p.id === memMatch.matched_product_id);
      if (matchedProd) return matchedProd;
    }
  }

  // Prioridad 2: Coincidencia exacta o por contención directa en catálogo
  let match = products.find(p => {
    const cleanPName = sanitizeDocText(p.name);
    return cleanInput === cleanPName || cleanInput.includes(cleanPName) || cleanPName.includes(cleanInput);
  });
  if (match) return match;

  // Prioridad 3: Coincidencia por tokens / palabras individuales (Manejo de plurales: Bananos -> Banano, Ajos -> Ajo)
  const tokens = cleanInput.split(' ').filter(t => t.length > 2);
  if (tokens.length > 0) {
    const firstToken = tokens[0];
    const stemToken = firstToken.endsWith('s') ? firstToken.slice(0, -1) : firstToken;
    match = products.find(p => {
      const cleanPName = sanitizeDocText(p.name);
      return cleanPName.includes(firstToken) || cleanPName.includes(stemToken);
    });
  }

  return match || null;
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
