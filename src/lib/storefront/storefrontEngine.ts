import type { Product } from '../supabase';
import type { CartItem } from '../cartContext';
import type { Locale } from '../translations';
import type {
  CanonicalRecipeId,
  FrioganStorefrontMode,
  RecipeBundleDefinition,
  RecipeBundleItemResult,
  StoreStatusMode,
  StorefrontPresentationKind,
  StorefrontPresentationOption,
  StorefrontPriceResolution,
  StorefrontProductInput,
  StorefrontRuntimeConfig,
} from './storefrontContracts';

const FRIOGAN_EXCLUDED_PREFIXES = ['/admin', '/ops', '/login', '/auth', '/b2b/dashboard', '/register', '/checkout'];

/** Determines whether the current route uses the new Catalog-First public storefront shell. */
export function isPublicStorefrontRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname.includes('/print') || pathname.includes('-print')) return false;
  return !FRIOGAN_EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Normalizes raw app_settings string into canonical 3-state Friogan storefront mode. */
export function parseFrioganStorefrontMode(raw?: string | null): FrioganStorefrontMode {
  const clean = String(raw ?? '').trim().toUpperCase();
  if (clean === 'LIVE') return 'LIVE';
  if (clean === 'TEASER') return 'TEASER';
  return 'OFF';
}

/** Identifies Friogan meat/protein SKUs by canonical category 'CP', inventory_group, or tags. */
export function isFrioganProteinProduct(product: Partial<Product> | null | undefined): boolean {
  if (!product) return false;
  if ((product.category || '').trim().toUpperCase() === 'CP') return true;
  if ((product.inventory_group || '').trim().toUpperCase().includes('FRIOGAN')) return true;
  return Array.isArray(product.tags) && product.tags.some((t) => String(t || '').trim().toLowerCase().includes('friogan'));
}

/** Filters out Friogan SKUs whenever storefront mode is OFF or TEASER. */
export function filterStorefrontProductsByFrioganMode<T extends Partial<Product>>(
  products: T[],
  mode: FrioganStorefrontMode
): T[] {
  return mode === 'LIVE' ? products : products.filter((p) => !isFrioganProteinProduct(p));
}

/** Identifies active offers/promotions either from commercial_campaigns or product tags. */
export function isOfferOrPromoProduct(product: Partial<Product> | null | undefined): boolean {
  if (!product) return false;
  if (product.campaign_info) return true;
  return Array.isArray(product.tags) && product.tags.some((t) => /promo|oferta|descuento|flash|temporada/i.test(String(t || '')));
}

function normalizeText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function parseWeightKgFromPresentationText(rawVal: string): number | null {
  if (!rawVal) return null;
  if (rawVal.includes('|')) {
    const grams = parseFloat(String(rawVal.split('|')[1] || '').replace(',', '.'));
    if (Number.isFinite(grams) && grams > 0) return grams / 1000;
  }
  const normalized = rawVal.replace(/\b([1-9]\d{0,2})\.(\d{3})(?=\s*(?:g|gr|grs|gramos|gms|grams|gramo|gram)\b)/gi, '$1$2').toLowerCase();
  const kgMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilos)\b/);
  if (kgMatch) {
    const val = parseFloat(kgMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) return val;
  }
  const gMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos|gms|grams|gramo|gram)\b/);
  if (gMatch) {
    const val = parseFloat(gMatch[1].replace(',', '.'));
    if (Number.isFinite(val) && val > 0) return val / 1000;
  }
  return normalized.includes('libra') || /\blb\b/.test(normalized) || normalized.includes('pound') ? 0.5 : null;
}

function formatGramsForDisplay(grams: number): string {
  return Math.round(grams).toLocaleString('es-CO');
}

/** Resolves storefront presentation options distinguishing fixed vacuum-sealed meat packs from agricultural produce. */
export function resolveProductStorefrontPresentation(
  product: StorefrontProductInput,
  locale: Locale = 'es'
): {
  kind: StorefrontPresentationKind;
  defaultOption: StorefrontPresentationOption;
  options: StorefrontPresentationOption[];
  sealedWeightLabel: string | null;
} {
  const isEn = locale === 'en';
  const rawBaseUnit = (product.unit_of_measure || '').trim().toLowerCase();
  const isKgBase = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos'].includes(rawBaseUnit);

  if (isFrioganProteinProduct(product)) {
    const options: StorefrontPresentationOption[] = [];
    const seenKeys = new Set<string>();
    const configs = Array.isArray(product.options_config) ? product.options_config : [];
    const presOpts = configs.filter((opt: { name?: string; values?: string[] }) => {
      const n = String(opt?.name || '').toLowerCase();
      return n.includes('presentaci') || n.includes('gramaje');
    });

    for (const opt of presOpts) {
      for (const rawVal of opt.values || []) {
        const weightKg = parseWeightKgFromPresentationText(String(rawVal)) || Number(product.web_conversion_factor) || Number(product.weight_kg) || 1;
        const grams = Math.round(weightKg * 1000);
        const key = `pack_${grams}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const labelGrams = formatGramsForDisplay(grams);
        options.push({
          key,
          label: isEn ? `Vacuum Pack ${labelGrams}g` : `Paquete ${labelGrams}g al vacío`,
          cartUnit: `Paquete ${grams}g`,
          conversionFactor: isKgBase ? weightKg : 1,
          weightKg,
          isFixedWeightPack: true,
        });
      }
    }

    if (options.length === 0) {
      const weightKg =
        product.web_conversion_factor && product.web_conversion_factor > 0
          ? Number(product.web_conversion_factor)
          : product.weight_kg && product.weight_kg > 0
            ? Number(product.weight_kg)
            : 1;
      const grams = Math.round(weightKg * 1000);
      const labelGrams = formatGramsForDisplay(grams);
      options.push({
        key: `pack_${grams}`,
        label: isEn ? `Vacuum Pack ${labelGrams}g` : `Paquete ${labelGrams}g al vacío`,
        cartUnit: `Paquete ${grams}g`,
        conversionFactor: isKgBase ? weightKg : 1,
        weightKg,
        isFixedWeightPack: true,
      });
    }

    const defaultOption = options[0];
    const grams = Math.round(defaultOption.weightKg * 1000);
    return {
      kind: 'FIXED_VACUUM_PACK',
      defaultOption,
      options,
      sealedWeightLabel: isEn
        ? `${formatGramsForDisplay(grams)}g exact vacuum sealed`
        : `${formatGramsForDisplay(grams)} g exactos al vacío`,
    };
  }

  const rawWebUnit = (product.web_unit || '').trim().toLowerCase();
  const options: StorefrontPresentationOption[] = [];
  const seenKeys = new Set<string>();
  const pushOpt = (opt: StorefrontPresentationOption) => {
    if (!seenKeys.has(opt.key)) {
      seenKeys.add(opt.key);
      options.push(opt);
    }
  };

  if (isKgBase) {
    const webFactor = Number(product.web_conversion_factor || 0);
    const isEmpaque = ['bandeja', 'cubeta', 'caja', 'paquete', 'malla', 'bolsa'].some((pkg) => rawWebUnit.includes(pkg));

    if (rawWebUnit.includes('libra') || rawWebUnit.includes('pound') || rawWebUnit === 'lb') {
      pushOpt({ key: 'lb_500', label: isEn ? 'Pound 500g' : 'Libra 500g', cartUnit: 'Lb', conversionFactor: 0.5, weightKg: 0.5, isFixedWeightPack: false });
      pushOpt({ key: 'kg_1000', label: 'Kg', cartUnit: 'Kg', conversionFactor: 1, weightKg: 1, isFixedWeightPack: false });
    } else if (isEmpaque) {
      const f = webFactor > 0 ? webFactor : 1;
      pushOpt({ key: `pkg_${Math.round(f * 1000)}`, label: product.web_unit || 'Bandeja', cartUnit: product.web_unit || 'Bandeja', conversionFactor: f, weightKg: f, isFixedWeightPack: false });
    } else if (webFactor > 0.5) {
      const formattedKg = webFactor % 1 === 0 ? String(webFactor) : webFactor.toFixed(1).replace('.', ',');
      pushOpt({
        key: `und_${Math.round(webFactor * 1000)}`,
        label: isEn ? `Unit (±${webFactor % 1 === 0 ? webFactor : webFactor.toFixed(1)} kg)` : `Unidad (±${formattedKg} kg)`,
        cartUnit: 'Unidad',
        conversionFactor: webFactor,
        weightKg: webFactor,
        isFixedWeightPack: false,
      });
    } else {
      pushOpt({ key: 'lb_500', label: isEn ? 'Pound 500g' : 'Libra 500g', cartUnit: 'Lb', conversionFactor: 0.5, weightKg: 0.5, isFixedWeightPack: false });
      pushOpt({ key: 'kg_1000', label: 'Kg', cartUnit: 'Kg', conversionFactor: 1, weightKg: 1, isFixedWeightPack: false });
    }

    const configs = Array.isArray(product.options_config) ? product.options_config : [];
    const presOpt = configs.find((o: { name?: string; values?: string[] }) => String(o?.name || '').toLowerCase().includes('presentaci'));
    if (presOpt && Array.isArray(presOpt.values)) {
      for (const v of presOpt.values) {
        const lowerV = String(v).toLowerCase();
        if (lowerV.includes('libra') || lowerV.includes('500')) continue;
        const wKg = parseWeightKgFromPresentationText(String(v));
        if (wKg && wKg > 0 && Math.abs(wKg - 0.5) > 0.01 && Math.abs(wKg - 1) > 0.01) {
          const grams = Math.round(wKg * 1000);
          pushOpt({ key: `und_${grams}`, label: isEn ? `Unit (±${grams}g)` : `Unidad (±${grams}g)`, cartUnit: 'Unidad', conversionFactor: wKg, weightKg: wKg, isFixedWeightPack: false });
        }
      }
    }
  } else {
    const f = product.web_conversion_factor && product.web_conversion_factor > 0 ? Number(product.web_conversion_factor) : Number(product.weight_kg || 0);
    const unitLabel = (() => {
      if (rawWebUnit === 'unidad' && f > 0) {
        if (f >= 1) {
          const fk = f % 1 === 0 ? String(f) : f.toFixed(1).replace('.', ',');
          return isEn ? `Unit (±${f % 1 === 0 ? f : f.toFixed(1)} kg)` : `Unidad (±${fk} kg)`;
        }
        return isEn ? `Unit (±${Math.round(f * 1000)}g)` : `Unidad (±${Math.round(f * 1000)}g)`;
      }
      return product.web_unit || product.unit_of_measure || 'Unidad';
    })();
    pushOpt({
      key: `std_${normalizeText(unitLabel).replace(/[^a-z0-9]+/g, '_') || 'un'}`,
      label: unitLabel,
      cartUnit: product.web_unit || product.unit_of_measure || 'Unidad',
      conversionFactor: product.web_conversion_factor && product.web_conversion_factor > 0 ? Number(product.web_conversion_factor) : 1,
      weightKg: f > 0 ? f : 0,
      isFixedWeightPack: false,
    });
  }

  return { kind: 'AGRICULTURAL_STANDARD', defaultOption: options[0], options, sealedWeightLabel: null };
}

/** Resolves storefront price strictly from pricing_model_prices / agreements. Never reads product.base_price. */
export function resolveStorefrontPrice(
  product: Partial<Product> | null | undefined,
  option: Pick<StorefrontPresentationOption, 'conversionFactor'>
): StorefrontPriceResolution {
  const unitBasePrice = Number(product?.pricing_model_prices?.[0]?.price || 0);
  if (!Number.isFinite(unitBasePrice) || unitBasePrice <= 0) {
    return { unitBasePrice: 0, displayPrice: 0, originalDisplayPrice: 0, isPriceAvailable: false, hasCampaignDiscount: false };
  }
  const factor = option.conversionFactor > 0 ? option.conversionFactor : 1;
  const displayPrice = Math.ceil((unitBasePrice * factor) / 50) * 50;
  const rawOrig = Number(product?.campaign_info?.originalPrice || 0);
  const originalDisplayPrice = Number.isFinite(rawOrig) && rawOrig > 0 ? Math.ceil((rawOrig * factor) / 50) * 50 : displayPrice;
  return {
    unitBasePrice,
    displayPrice,
    originalDisplayPrice,
    isPriceAvailable: true,
    hasCampaignDiscount: Boolean(product?.campaign_info && originalDisplayPrice > displayPrice),
  };
}

/** Builds canonical CartItem.name ensuring deduplication and React key safety in /checkout. */
export function buildCartItemName(
  product: Pick<Product, 'name' | 'display_name' | 'name_en'>,
  option: Pick<StorefrontPresentationOption, 'label'>,
  includePresentationSuffix: boolean,
  locale: Locale = 'es'
): string {
  const base = locale === 'en' && product.name_en ? product.name_en : product.display_name || product.name;
  return includePresentationSuffix ? `${base} (${option.label})` : base;
}

/** Canonical CartItem builder guaranteeing unit, weight_kg, variant_label, presentation_key and is_friogan. */
export function buildStorefrontCartItem(
  product: StorefrontProductInput,
  option: StorefrontPresentationOption,
  quantity: number,
  optionsCount: number,
  kind: StorefrontPresentationKind,
  priceResolution: StorefrontPriceResolution,
  locale: Locale = 'es'
): CartItem {
  const includeSuffix = optionsCount > 1 || kind === 'FIXED_VACUUM_PACK';
  return {
    id: product.id,
    name: buildCartItemName(product, option, includeSuffix, locale),
    price: priceResolution.displayPrice,
    iva_rate: product.iva_rate || 0,
    unit: option.cartUnit,
    quantity: Math.max(1, Math.round(quantity)),
    image_url: product.image_url,
    variant_label: includeSuffix ? option.label : undefined,
    weight_kg: option.weightKg,
    presentation_key: option.key,
    is_friogan: kind === 'FIXED_VACUUM_PACK',
    accounting_id: product.accounting_id ?? null,
  };
}

const INGREDIENT_GROSS_GRAMS_PER_SERVING: Record<string, number> = {
  'papa sabanera': 120, 'papa pastusa': 100, 'papa criolla': 95, yuca: 130, 'platano verde': 140,
  'platano maduro': 120, 'hojas de platano': 65, mazorca: 130, guascas: 10, aguacate: 90,
  arracacha: 75, alcaparras: 15, cilantro: 12, 'cebolla larga': 25, 'cebolla junca': 25,
  'cebolla cabezona': 35, cebolla: 35, ahuyama: 110, frijol: 75, arroz: 85, 'tomate chonto': 65,
  zanahoria: 55, 'zanahoria fina': 55, arveja: 45, habichuela: 40, pimenton: 30, garbanzo: 65,
  ajo: 8, huevo: 60, pechuga: 180, pollo: 180, sobrebarriga: 180, costilla: 200, res: 180,
  'carne molida': 160, chicharron: 120, lomo: 180, cerdo: 170, carne: 170, tocino: 70,
};

/** Computes suggested purchase units rounded up to the next Libra (500g) for a recipe ingredient given servings and package weight. */
export function calculateRecipeServingQuantity(matchedTerm: string, servings: number, weightKg: number): number {
  const safeServings = Math.max(1, Math.min(500, Math.round(servings || 4)));
  const cleanTerm = normalizeText(matchedTerm);
  const unitGrams = weightKg > 0 ? weightKg * 1000 : 500;
  if (cleanTerm === 'huevo' && unitGrams >= 1000) {
    return Math.max(1, Math.ceil(safeServings / 30));
  }
  const gramsPerServing = INGREDIENT_GROSS_GRAMS_PER_SERVING[cleanTerm] ?? 80;
  const totalGramsRoundedToLibra = Math.ceil((gramsPerServing * safeServings) / 500) * 500;
  return Math.max(1, Math.ceil(totalGramsRoundedToLibra / unitGrams));
}

export const RECIPE_BUNDLES: RecipeBundleDefinition[] = [
  { id: 'ajiaco', labelEs: 'Ajiaco Santafereño', labelEn: 'Bogota Ajiaco', searchQuery: 'ajiaco', ingredientMatchTerms: ['papa criolla', 'papa pastusa', 'papa sabanera', 'mazorca', 'guascas', 'aguacate', 'arracacha', 'alcaparras'], optionalFrioganMatchTerms: ['pechuga', 'pollo'] },
  { id: 'sancocho', labelEs: 'Sancocho Tradicional', labelEn: 'Traditional Sancocho', searchQuery: 'sancocho', ingredientMatchTerms: ['yuca', 'platano verde', 'papa pastusa', 'mazorca', 'cilantro', 'cebolla larga', 'cebolla junca', 'ahuyama'], optionalFrioganMatchTerms: ['sobrebarriga', 'costilla', 'res'] },
  { id: 'bandeja paisa', labelEs: 'Bandeja Paisa', labelEn: 'Bandeja Paisa', searchQuery: 'bandeja paisa', ingredientMatchTerms: ['frijol', 'aguacate', 'platano maduro', 'arroz', 'tomate chonto', 'cebolla', 'huevo'], optionalFrioganMatchTerms: ['carne molida', 'chicharron', 'lomo'] },
  { id: 'mondongo', labelEs: 'Mondongo', labelEn: 'Mondongo Stew', searchQuery: 'mondongo', ingredientMatchTerms: ['papa pastusa', 'yuca', 'zanahoria fina', 'arveja', 'cilantro', 'cebolla', 'ajo'], optionalFrioganMatchTerms: ['cerdo', 'carne'] },
  { id: 'mute', labelEs: 'Mute Santandereano', labelEn: 'Mute Soup', searchQuery: 'mute', ingredientMatchTerms: ['papa criolla', 'papa pastusa', 'ahuyama', 'zanahoria fina', 'arveja', 'garbanzo', 'cilantro'], optionalFrioganMatchTerms: ['costilla', 'res'] },
  { id: 'tamal', labelEs: 'Tamal', labelEn: 'Colombian Tamal', searchQuery: 'tamal', ingredientMatchTerms: ['hojas de platano', 'arroz', 'arveja', 'zanahoria fina', 'papa pastusa', 'ajo', 'cebolla larga', 'huevo'], optionalFrioganMatchTerms: ['cerdo', 'pechuga', 'tocino'] },
  { id: 'arroz con pollo', labelEs: 'Arroz con Pollo', labelEn: 'Chicken Rice', searchQuery: 'arroz con pollo', ingredientMatchTerms: ['arroz', 'zanahoria fina', 'arveja', 'habichuela', 'pimenton', 'cebolla cabezona', 'ajo'], optionalFrioganMatchTerms: ['pechuga', 'pollo'] },
];

/** Resolves purchasable ingredients for one of the 7 canonical Colombian recipes respecting Friogan mode and pricing rules. */
export function resolveRecipeBundleProducts(
  products: Product[],
  bundleId: string,
  mode: FrioganStorefrontMode,
  locale: Locale = 'es'
): RecipeBundleItemResult[] {
  const cleanId = normalizeText(bundleId) as CanonicalRecipeId;
  const bundle = RECIPE_BUNDLES.find((b) => normalizeText(b.id) === cleanId || normalizeText(b.searchQuery) === cleanId);
  if (!bundle) return [];

  const eligible = filterStorefrontProductsByFrioganMode(products, mode);
  const terms = mode === 'LIVE' ? [...bundle.ingredientMatchTerms, ...bundle.optionalFrioganMatchTerms] : bundle.ingredientMatchTerms;
  const usedIds = new Set<string>();
  const results: RecipeBundleItemResult[] = [];

  for (const term of terms) {
    const cleanTerm = normalizeText(term);
    if (!cleanTerm) continue;
    for (const product of eligible) {
      if (usedIds.has(product.id)) continue;
      const haystack = normalizeText(`${product.display_name || ''} ${product.name || ''} ${product.keywords || ''}`);
      if (!haystack.includes(cleanTerm)) continue;
      const presentation = resolveProductStorefrontPresentation(product, locale);
      const price = resolveStorefrontPrice(product, presentation.defaultOption);
      if (!price.isPriceAvailable) continue;
      usedIds.add(product.id);
      const includeSuffix = presentation.options.length > 1 || presentation.kind === 'FIXED_VACUUM_PACK';
      results.push({
        product,
        matchedTerm: term,
        defaultOption: presentation.defaultOption,
        price,
        cartItemName: buildCartItemName(product, presentation.defaultOption, includeSuffix, locale),
      });
      break;
    }
  }
  return results;
}

export const DEFAULT_STOREFRONT_CONFIG: StorefrontRuntimeConfig = {
  frioganMode: 'OFF',
  cutoffHourPublic: 17,
  minOrderHogar: 150000,
  deliveryFee: 5000,
  storeStatus: 'open',
  vacationConfigRaw: null,
  globalBannerEs: '',
  globalBannerEn: '',
  contactPhone: '+57 300 123 4567',
  isB2bLeadCaptureEnabled: true,
  quickSuggestions: [],
  logoUrl: '/logo.png',
  heroImageUrl: '/hero_fresh_produce.png',
};

/** Builds public StorefrontRuntimeConfig safely from app_settings rows and visible products without reading base_price. */
export function buildStorefrontRuntimeConfig(
  settingsRows: { key: string; value?: string | null }[] = [],
  visibleProducts: Product[] = []
): StorefrontRuntimeConfig {
  const map = new Map<string, string>();
  for (const row of settingsRows) {
    if (row?.key) map.set(row.key, String(row.value ?? ''));
  }

  const frioganMode = parseFrioganStorefrontMode(map.get('friogan_storefront_mode'));
  const rawStatus = (map.get('store_status') || 'open').trim();
  const storeStatus: StoreStatusMode =
    rawStatus === 'closed' || rawStatus === 'vacation_preorder' ? rawStatus : 'open';
  const cutoffParsed = Number(map.get('cutoff_hour_public'));
  const minOrderParsed = Number(map.get('min_order_hogar'));
  const feeParsed = Number(map.get('delivery_fee'));

  const eligible = filterStorefrontProductsByFrioganMode(visibleProducts, frioganMode);
  const quickSuggestions: Product[] = [];
  for (const p of eligible) {
    const pres = resolveProductStorefrontPresentation(p, 'es');
    if (resolveStorefrontPrice(p, pres.defaultOption).isPriceAvailable) {
      quickSuggestions.push(p);
      if (quickSuggestions.length >= 6) break;
    }
  }

  return {
    frioganMode,
    cutoffHourPublic: Number.isFinite(cutoffParsed) && cutoffParsed > 0 ? cutoffParsed : 17,
    minOrderHogar: Number.isFinite(minOrderParsed) && minOrderParsed > 0 ? minOrderParsed : 150000,
    deliveryFee: Number.isFinite(feeParsed) && feeParsed >= 0 ? feeParsed : 5000,
    storeStatus,
    vacationConfigRaw: map.get('store_vacation_config') || null,
    globalBannerEs: map.get('global_banner') || '',
    globalBannerEn: map.get('global_banner_en') || '',
    contactPhone: map.get('contact_phone') || '+57 300 123 4567',
    isB2bLeadCaptureEnabled: map.get('enable_b2b_lead_capture') !== 'false',
    quickSuggestions,
    logoUrl: (map.get('app_logo_url') || '').trim() || '/logo.png',
    heroImageUrl: (map.get('hero_image_url') || '').trim() || '/hero_fresh_produce.png',
  };
}
