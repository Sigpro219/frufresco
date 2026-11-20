import { stripPluNoise } from '../orderUtils';

const LETTER_BOUNDARY_PREFIX = '(?:^|[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])';
const LETTER_BOUNDARY_SUFFIX = '(?=$|[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ])';

const EXACT_LIBRA_RE = new RegExp(
  `${LETTER_BOUNDARY_PREFIX}(libras?|lbs?)${LETTER_BOUNDARY_SUFFIX}`,
  'i'
);

const EXACT_UNIT_RE = new RegExp(
  `${LETTER_BOUNDARY_PREFIX}(unidades?|unds?|uds?)${LETTER_BOUNDARY_SUFFIX}`,
  'i'
);

const EXACT_KILO_RE = new RegExp(
  `${LETTER_BOUNDARY_PREFIX}(kilogramos?|kilos?|kgs?|kls?)${LETTER_BOUNDARY_SUFFIX}`,
  'i'
);

const EXACT_GRAM_PACK_RE = new RegExp(
  `${LETTER_BOUNDARY_PREFIX}(\\d+(?:[.,]\\d+)?)\\s*(?:grs?|gramos?|gms?|grams?|g)${LETTER_BOUNDARY_SUFFIX}`,
  'i'
);

const EXACT_KG_PACK_RE = new RegExp(
  `${LETTER_BOUNDARY_PREFIX}(\\d+(?:[.,]\\d+)?)\\s*(?:kg|kgs?|kilos?|kilogramos?)${LETTER_BOUNDARY_SUFFIX}`,
  'i'
);

const CONTAINER_WORD_RE = new RegExp(
  `${LETTER_BOUNDARY_PREFIX}(canastas?|canastillas?|bandejas?|paquetes?|paq|pqt|pq|bolsas?|frascos?|unidades?|unds?|atados?|manojos?)${LETTER_BOUNDARY_SUFFIX}`,
  'i'
);

function escapeRegex(str: string): string {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function hasExplicitLibraWord(text?: string | null): boolean {
  if (!text) return false;
  return EXACT_LIBRA_RE.test(stripPluNoise(String(text)));
}

export function hasExplicitUnitWord(text?: string | null): boolean {
  if (!text) return false;
  return EXACT_UNIT_RE.test(stripPluNoise(String(text)));
}

export function hasExplicitKiloWord(text?: string | null): boolean {
  if (!text) return false;
  return EXACT_KILO_RE.test(stripPluNoise(String(text)));
}

export function hasWholeWord(text?: string | null, token?: string | null): boolean {
  if (!text || !token) return false;
  const cleanToken = String(token).trim();
  if (!cleanToken) return false;
  const rx = new RegExp(
    `${LETTER_BOUNDARY_PREFIX}${escapeRegex(cleanToken)}${LETTER_BOUNDARY_SUFFIX}`,
    'i'
  );
  return rx.test(String(text));
}

export function normalizeCanonicalUnit(u?: string | null): string {
  if (!u) return '';
  const raw = String(u).trim();
  if (!raw) return '';
  const clean = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.+$/g, '')
    .trim();

  if (
    ['kg', 'kgs', 'kl', 'kls', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(clean)
  ) {
    return 'Kg';
  }
  if (['lb', 'lbs', 'libra', 'libras', 'pound', 'pounds'].includes(clean)) {
    return 'Lb';
  }
  if (['g', 'gr', 'grs', 'gramo', 'gramos', 'gm', 'gms', 'gram', 'grams'].includes(clean)) {
    return 'g';
  }
  if (
    ['un', 'und', 'unds', 'ud', 'uds', 'uni', 'unidad', 'unidades', 'pza', 'pzas', 'pieza', 'piezas'].includes(
      clean
    )
  ) {
    return 'Unidad';
  }
  if (['atado', 'atados', 'manojo', 'manojos'].includes(clean)) {
    return 'Atado';
  }
  if (['bandeja', 'bandejas'].includes(clean)) {
    return 'Bandeja';
  }
  if (['canasta', 'canastas', 'canastilla', 'canastillas'].includes(clean)) {
    return 'Canasta';
  }
  if (['paquete', 'paquetes', 'paq', 'pqt', 'pq'].includes(clean)) {
    return 'Paquete';
  }
  if (['bolsa', 'bolsas', 'malla', 'mallas'].includes(clean)) {
    return 'Bolsa';
  }
  if (['caja', 'cajas', 'caj'].includes(clean)) {
    return 'Caja';
  }
  if (['bulto', 'bultos', 'saco', 'sacos'].includes(clean)) {
    return 'Bulto';
  }
  if (['cubeta', 'cubetas', 'cub', 'panal', 'panales'].includes(clean)) {
    return 'Cubeta';
  }
  if (['l', 'lt', 'lts', 'litro', 'litros'].includes(clean)) {
    return 'Litro';
  }
  if (['doc', 'docena', 'docenas'].includes(clean)) {
    return 'Docena';
  }
  return raw;
}

export function isKgUnitName(u?: string | null): boolean {
  return normalizeCanonicalUnit(u) === 'Kg';
}

export function isLibraUnitName(u?: string | null): boolean {
  return normalizeCanonicalUnit(u) === 'Lb';
}

const DISCRETE_UNIT_SET = new Set([
  'Unidad',
  'Bandeja',
  'Canasta',
  'Paquete',
  'Bolsa',
  'Caja',
  'Atado',
  'Cubeta',
  'Bulto',
  'Docena',
  'Frasco',
]);

export function isDiscreteUnitName(u?: string | null): boolean {
  if (!u) return false;
  const norm = normalizeCanonicalUnit(u);
  if (DISCRETE_UNIT_SET.has(norm)) return true;
  const firstToken = String(u).trim().split(/\s+/)[0];
  const firstNorm = normalizeCanonicalUnit(firstToken);
  if (DISCRETE_UNIT_SET.has(firstNorm)) return true;
  return /^(frascos?|tarros?|botellas?|latas?|racimos?|matas?)$/i.test(firstToken);
}

export function extractPackWeightKgFromText(text?: string | null): number | null {
  if (!text) return null;
  const str = String(text).trim();
  if (!str) return null;

  if (str.includes('|')) {
    const parts = str.split('|');
    const grams = parseFloat(parts[1]);
    if (!isNaN(grams) && grams > 0) return parseFloat((grams / 1000).toFixed(4));
  }

  // Strip PLU codes and collapse dot-thousands before weight units (e.g., "1.000 gr" -> "1000 gr")
  const cleaned = stripPluNoise(str).replace(
    /\b([1-9]\d{0,2})\.(\d{3})(?=\s*(?:g|gr|grs|gramos|gms|grams|gramo|gram)\b)/gi,
    '$1$2'
  );

  const kgMatch = cleaned.match(EXACT_KG_PACK_RE);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return parseFloat(val.toFixed(4));
  }

  const gMatch = cleaned.match(EXACT_GRAM_PACK_RE);
  if (gMatch) {
    const val = parseFloat(gMatch[1].replace(',', '.'));
    if (!isNaN(val) && val > 0) return parseFloat((val / 1000).toFixed(4));
  }

  if (hasExplicitLibraWord(cleaned)) {
    return 0.5;
  }

  return null;
}

export interface ProductConversionRow {
  product_id?: string;
  from_unit: string;
  to_unit: string;
  conversion_factor: number | string;
}

export interface ProductLikeForConversion {
  id?: string;
  name?: string | null;
  unit_of_measure?: string | null;
  weight_kg?: number | string | null;
  web_unit?: string | null;
  web_conversion_factor?: number | string | null;
  options_config?: Array<{ name?: string; values?: string[] }> | null;
}

export interface UnitConversionInput {
  rawName: string;
  rawDocumentUnit?: string | null;
  currentUnit?: string | null;
  observations?: string | null;
  quantity: number;
  product?: ProductLikeForConversion | null;
  productConversions?: ProductConversionRow[] | null;
  alreadyNormalized?: boolean;
  isManuallyEditedQty?: boolean;
}

export interface UnitConversionResult {
  billingQty: number;
  billingUnit: string;
  originalQty: number;
  originalUnit: string;
  rawDocumentUnit: string | null;
  factor: number;
  conversionApplied: true;
  sanitizedPoisonedLibra: boolean;
  reason: string;
}

function findDbConversion(
  productConversions: ProductConversionRow[] | null | undefined,
  fromUnit: string,
  toUnit: string
): ProductConversionRow | undefined {
  if (!Array.isArray(productConversions) || productConversions.length === 0) return undefined;
  const normFrom = normalizeCanonicalUnit(fromUnit);
  const normTo = normalizeCanonicalUnit(toUnit);
  if (!normFrom || !normTo || normFrom === normTo) return undefined; // Guard Escenario 458
  return productConversions.find(c => {
    const cFrom = normalizeCanonicalUnit(c.from_unit);
    const cTo = normalizeCanonicalUnit(c.to_unit);
    return cFrom === normFrom && cTo === normTo && cFrom !== cTo;
  });
}

function isPoisonedAlbahacaLibra(
  docUnitRaw: string,
  rawName: string,
  observations?: string | null
): boolean {
  if (normalizeCanonicalUnit(docUnitRaw) !== 'Lb') return false;
  if (hasExplicitLibraWord(rawName)) return false;
  if (!/(?:albahac|albac)/i.test(rawName)) return false;
  const obs = observations || '';
  const packKg = extractPackWeightKgFromText(rawName);
  return (
    obs.includes('Solicitado en Libras.') ||
    hasExplicitKiloWord(rawName) ||
    packKg === 1
  );
}

export function resolveCanonicalConversion(input: UnitConversionInput): UnitConversionResult {
  const {
    rawName = '',
    rawDocumentUnit,
    currentUnit,
    observations,
    quantity,
    product,
    productConversions = [],
    alreadyNormalized = false,
    isManuallyEditedQty = false,
  } = input;

  const billingUnit = (product?.unit_of_measure || currentUnit || 'Kg').trim() || 'Kg';
  const cleanQty = Number.isFinite(quantity) ? Number(quantity) : 0;

  // Guard: never store 'Kg' / discrete labels inconsistently when already normalized or manually edited
  if (alreadyNormalized || isManuallyEditedQty) {
    return {
      billingQty: parseFloat(cleanQty.toFixed(3)),
      billingUnit,
      originalQty: parseFloat(cleanQty.toFixed(3)),
      originalUnit: billingUnit,
      rawDocumentUnit: rawDocumentUnit ?? (currentUnit || null),
      factor: 1,
      conversionApplied: true,
      sanitizedPoisonedLibra: false,
      reason: isManuallyEditedQty ? 'manual_edit_preserved' : 'already_normalized_idempotent',
    };
  }

  // Preserve explicit `rawDocumentUnit: null` (document omitted unit); only fall back to `currentUnit`
  // on legacy drafts/rows where `rawDocumentUnit` is `undefined`.
  let effectiveRawDocUnit: string | null =
    rawDocumentUnit !== undefined
      ? (rawDocumentUnit !== null && String(rawDocumentUnit).trim() !== ''
          ? String(rawDocumentUnit).trim()
          : null)
      : currentUnit && String(currentUnit).trim() !== ''
      ? String(currentUnit).trim()
      : null;

  let sanitizedPoisonedLibra = false;
  if (effectiveRawDocUnit && isPoisonedAlbahacaLibra(effectiveRawDocUnit, rawName, observations)) {
    effectiveRawDocUnit = 'Kg';
    sanitizedPoisonedLibra = true;
  }

  const docUnitNorm = effectiveRawDocUnit ? normalizeCanonicalUnit(effectiveRawDocUnit) : '';
  const isBillingKg = isKgUnitName(billingUnit);
  const isBillingLb = isLibraUnitName(billingUnit);

  // Regla 1: Unidad explícita del documento es Kg y producto factura en Kg -> factor 1 (ignora "500 gr" en nombre)
  if (docUnitNorm === 'Kg' && isBillingKg) {
    return {
      billingQty: parseFloat(cleanQty.toFixed(3)),
      billingUnit,
      originalQty: cleanQty,
      originalUnit: 'Kg',
      rawDocumentUnit: effectiveRawDocUnit,
      factor: 1,
      conversionApplied: true,
      sanitizedPoisonedLibra,
      reason: 'explicit_kg_unit',
    };
  }

  // Regla 2: Unidad explícita del documento es Libra
  if (docUnitNorm === 'Lb') {
    const factor = isBillingLb ? 1 : isBillingKg ? 0.5 : 1;
    return {
      billingQty: parseFloat((cleanQty * factor).toFixed(3)),
      billingUnit,
      originalQty: cleanQty,
      originalUnit: 'Lb',
      rawDocumentUnit: effectiveRawDocUnit,
      factor,
      conversionApplied: true,
      sanitizedPoisonedLibra,
      reason: isBillingKg ? 'explicit_lb_to_kg_0_5' : 'explicit_lb_same_unit',
    };
  }

  // Regla 3: Unidad explícita del documento es Gramos
  if (docUnitNorm === 'g' && isBillingKg) {
    const factor = 0.001;
    return {
      billingQty: parseFloat((cleanQty * factor).toFixed(3)),
      billingUnit,
      originalQty: cleanQty,
      originalUnit: 'g',
      rawDocumentUnit: effectiveRawDocUnit,
      factor,
      conversionApplied: true,
      sanitizedPoisonedLibra,
      reason: 'explicit_grams_to_kg',
    };
  }

  // Regla 4: Unidad explícita discreta (Unidad, Bandeja, Canasta, Paquete, Atado, "CANASTA 500 G", "500 GR", etc.)
  const docPackWeight = effectiveRawDocUnit && !isKgUnitName(effectiveRawDocUnit)
    ? extractPackWeightKgFromText(effectiveRawDocUnit)
    : null;

  if ((isDiscreteUnitName(effectiveRawDocUnit) || docPackWeight !== null) && isBillingKg) {
    // 4a. Buscar peso explícito en docUnitRaw o en rawName (ej. Colsubsidio 4 UN + "TOMATE CHERRY CANASTA INTS 500 GR" -> 0.5)
    const namePackWeight = extractPackWeightKgFromText(rawName);
    const resolvedPackWeight = docPackWeight !== null && docPackWeight > 0
      ? docPackWeight
      : (namePackWeight !== null && namePackWeight > 0 ? namePackWeight : null);

    if (resolvedPackWeight !== null) {
      return {
        billingQty: parseFloat((cleanQty * resolvedPackWeight).toFixed(3)),
        billingUnit,
        originalQty: cleanQty,
        originalUnit: effectiveRawDocUnit || docUnitNorm || 'Unidad',
        rawDocumentUnit: effectiveRawDocUnit,
        factor: resolvedPackWeight,
        conversionApplied: true,
        sanitizedPoisonedLibra,
        reason: docPackWeight !== null ? 'discrete_unit_embedded_weight' : 'discrete_unit_name_pack_weight',
      };
    }

    // 4b. Consultar tabla product_conversions con match exacto from !== to
    const dbConv = findDbConversion(productConversions, effectiveRawDocUnit || docUnitNorm, billingUnit);
    if (dbConv) {
      const f = parseFloat(String(dbConv.conversion_factor)) || 1;
      return {
        billingQty: parseFloat((cleanQty * f).toFixed(3)),
        billingUnit,
        originalQty: cleanQty,
        originalUnit: effectiveRawDocUnit || docUnitNorm,
        rawDocumentUnit: effectiveRawDocUnit,
        factor: f,
        conversionApplied: true,
        sanitizedPoisonedLibra,
        reason: 'discrete_unit_db_conversion',
      };
    }

    // 4c. Fallback conservador para unidad discreta sin peso ni conversión definida: factor 1
    return {
      billingQty: parseFloat(cleanQty.toFixed(3)),
      billingUnit,
      originalQty: cleanQty,
      originalUnit: effectiveRawDocUnit || docUnitNorm || billingUnit,
      rawDocumentUnit: effectiveRawDocUnit,
      factor: 1,
      conversionApplied: true,
      sanitizedPoisonedLibra,
      reason: 'discrete_unit_fallback_1',
    };
  }

  // Regla 5: docUnitRaw ausente / vacío (o no reconocido en Reglas 1-4)
  if (!effectiveRawDocUnit || docUnitNorm === '') {
    if (isBillingKg) {
      if (hasExplicitKiloWord(rawName)) {
        return {
          billingQty: parseFloat(cleanQty.toFixed(3)),
          billingUnit,
          originalQty: cleanQty,
          originalUnit: 'Kg',
          rawDocumentUnit: effectiveRawDocUnit,
          factor: 1,
          conversionApplied: true,
          sanitizedPoisonedLibra,
          reason: 'missing_unit_explicit_kilo_in_name',
        };
      }
      if (hasExplicitLibraWord(rawName)) {
        return {
          billingQty: parseFloat((cleanQty * 0.5).toFixed(3)),
          billingUnit,
          originalQty: cleanQty,
          originalUnit: 'Lb',
          rawDocumentUnit: effectiveRawDocUnit,
          factor: 0.5,
          conversionApplied: true,
          sanitizedPoisonedLibra,
          reason: 'missing_unit_explicit_libra_in_name',
        };
      }

      const packWeight = extractPackWeightKgFromText(rawName);
      if (packWeight !== null && packWeight > 0 && CONTAINER_WORD_RE.test(stripPluNoise(rawName))) {
        return {
          billingQty: parseFloat((cleanQty * packWeight).toFixed(3)),
          billingUnit,
          originalQty: cleanQty,
          originalUnit: `${packWeight * 1000} gr`,
          rawDocumentUnit: effectiveRawDocUnit,
          factor: packWeight,
          conversionApplied: true,
          sanitizedPoisonedLibra,
          reason: 'missing_unit_container_pack_weight',
        };
      }

      if (Array.isArray(productConversions)) {
        for (const c of productConversions) {
          const cFrom = normalizeCanonicalUnit(c.from_unit);
          const cTo = normalizeCanonicalUnit(c.to_unit);
          if (cFrom && cTo && cFrom !== cTo && cTo === 'Kg' && hasWholeWord(rawName, c.from_unit)) {
            const f = parseFloat(String(c.conversion_factor)) || 1;
            return {
              billingQty: parseFloat((cleanQty * f).toFixed(3)),
              billingUnit,
              originalQty: cleanQty,
              originalUnit: c.from_unit,
              rawDocumentUnit: effectiveRawDocUnit,
              factor: f,
              conversionApplied: true,
              sanitizedPoisonedLibra,
              reason: 'missing_unit_db_wholeword_match',
            };
          }
        }
      }

      return {
        billingQty: parseFloat(cleanQty.toFixed(3)),
        billingUnit,
        originalQty: cleanQty,
        originalUnit: billingUnit,
        rawDocumentUnit: effectiveRawDocUnit,
        factor: 1,
        conversionApplied: true,
        sanitizedPoisonedLibra,
        reason: 'missing_unit_default_billing',
      };
    }
  }

  // Regla 6: El producto NO se factura en Kg (ej. Unidad, Cubeta, Litro)
  if (!isBillingKg) {
    if (effectiveRawDocUnit) {
      const dbConv = findDbConversion(productConversions, effectiveRawDocUnit, billingUnit);
      if (dbConv) {
        const f = parseFloat(String(dbConv.conversion_factor)) || 1;
        return {
          billingQty: parseFloat((cleanQty * f).toFixed(3)),
          billingUnit,
          originalQty: cleanQty,
          originalUnit: effectiveRawDocUnit,
          rawDocumentUnit: effectiveRawDocUnit,
          factor: f,
          conversionApplied: true,
          sanitizedPoisonedLibra,
          reason: 'non_kg_db_conversion',
        };
      }
    }

    // Only divide by pack count (e.g. Cubeta x 30 unds) when document asks in Unidad — NEVER match gr|g|kg!
    if (docUnitNorm === 'Unidad' && product?.name) {
      const packMatch = product.name.match(
        /\bx\s*(\d+(?:[.,]\d+)?)\s*(?:unds?|unids?|unidades)\b/i
      );
      const packSize = packMatch ? parseFloat(packMatch[1].replace(',', '.')) : null;
      if (packSize && packSize > 1) {
        const f = parseFloat((1 / packSize).toFixed(5));
        return {
          billingQty: parseFloat((cleanQty * f).toFixed(3)),
          billingUnit,
          originalQty: cleanQty,
          originalUnit: effectiveRawDocUnit || 'Unidad',
          rawDocumentUnit: effectiveRawDocUnit,
          factor: f,
          conversionApplied: true,
          sanitizedPoisonedLibra,
          reason: 'non_kg_unit_pack_divisor',
        };
      }
    }

    return {
      billingQty: parseFloat(cleanQty.toFixed(3)),
      billingUnit,
      originalQty: cleanQty,
      originalUnit: effectiveRawDocUnit || billingUnit,
      rawDocumentUnit: effectiveRawDocUnit,
      factor: 1,
      conversionApplied: true,
      sanitizedPoisonedLibra,
      reason: 'non_kg_default_1',
    };
  }

  // Fallback for Kg billing with unrecognized docUnitRaw: still check dbConv
  if (effectiveRawDocUnit) {
    const dbConv = findDbConversion(productConversions, effectiveRawDocUnit, billingUnit);
    if (dbConv) {
      const f = parseFloat(String(dbConv.conversion_factor)) || 1;
      return {
        billingQty: parseFloat((cleanQty * f).toFixed(3)),
        billingUnit,
        originalQty: cleanQty,
        originalUnit: effectiveRawDocUnit,
        rawDocumentUnit: effectiveRawDocUnit,
        factor: f,
        conversionApplied: true,
        sanitizedPoisonedLibra,
        reason: 'fallback_db_conversion',
      };
    }
  }

  return {
    billingQty: parseFloat(cleanQty.toFixed(3)),
    billingUnit,
    originalQty: cleanQty,
    originalUnit: effectiveRawDocUnit || billingUnit,
    rawDocumentUnit: effectiveRawDocUnit,
    factor: 1,
    conversionApplied: true,
    sanitizedPoisonedLibra,
    reason: 'default_1',
  };
}

export function computeLineWeightKg(params: {
  quantity: number | string | null | undefined;
  billingUnit?: string | null;
  productUnitOfMeasure?: string | null;
  productWeightKg?: number | string | null;
}): number {
  const qty =
    typeof params.quantity === 'number'
      ? params.quantity
      : parseFloat(String(params.quantity ?? '0').replace(',', '.')) || 0;
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  // Priority: productUnitOfMeasure when Kg, or explicit billingUnit when Kg (quantity is already Kg!)
  const primaryUnit = (params.productUnitOfMeasure || params.billingUnit || '').trim();
  if (isKgUnitName(primaryUnit) || isKgUnitName(params.billingUnit)) {
    return parseFloat(qty.toFixed(3));
  }

  const effectiveUnit = (params.billingUnit || params.productUnitOfMeasure || '').trim();
  if (isLibraUnitName(effectiveUnit)) {
    return parseFloat((qty * 0.5).toFixed(3));
  }

  const pw = Number(params.productWeightKg);
  if (Number.isFinite(pw) && pw > 0) {
    return parseFloat((qty * pw).toFixed(3));
  }

  return parseFloat(qty.toFixed(3));
}

export function getSafeProductMinSaleKg(
  product?: ProductLikeForConversion | null
): number | null {
  if (!product) return null;
  if (!isKgUnitName(product.unit_of_measure || 'Kg')) return null;

  // Only whole heavy fruits/vegetables (>= 1.5 kg per piece, e.g. Patilla, Papaya, Ahuyama) enforce whole-piece minimum
  const baseWeightKg = Number(product.weight_kg);
  const heavyVariantWeights: number[] = [];

  if (Number.isFinite(baseWeightKg) && baseWeightKg >= 1.5) {
    heavyVariantWeights.push(baseWeightKg);
  }

  if (Array.isArray(product.options_config)) {
    for (const opt of product.options_config) {
      const optName = (opt?.name || '').toLowerCase();
      if (
        optName.includes('presentaci') ||
        optName.includes('unidad') ||
        optName.includes('tamaño') ||
        optName.includes('gramaje')
      ) {
        for (const val of opt.values || []) {
          const lowerVal = String(val).toLowerCase();
          if (
            lowerVal.includes('libra') ||
            lowerVal.includes('pound') ||
            lowerVal.includes('unidad web')
          ) {
            continue;
          }
          const pw = extractPackWeightKgFromText(val);
          if (pw !== null && pw >= 1.5) {
            heavyVariantWeights.push(pw);
          }
        }
      }
    }
  }

  if (heavyVariantWeights.length > 0) {
    return Math.min(...heavyVariantWeights);
  }

  // Standard bulk / herb / cherry tomato products: allow down to 10g (0.01 kg) without false blocking
  return 0.01;
}
