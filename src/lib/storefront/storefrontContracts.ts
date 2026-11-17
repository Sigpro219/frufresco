import type { Product } from '../supabase';

export type StorefrontProductInput = Pick<Product, 'id' | 'name'> & Partial<Product>;

export type FrioganStorefrontMode = 'OFF' | 'TEASER' | 'LIVE';

export type StorefrontPresentationKind = 'AGRICULTURAL_STANDARD' | 'FIXED_VACUUM_PACK';

export type StoreStatusMode = 'open' | 'vacation_preorder' | 'closed';

export interface StorefrontPresentationOption {
  /** Clave determinista para identificar variante en UI y Carrito */
  key: string;
  /** Etiqueta legible para UI (ej. 'Libra 500g', 'Kg', 'Paquete 1.000g al vacío') */
  label: string;
  /** Unidad sin separador de miles en gramos para compatibilidad estricta con getParsedWeight */
  cartUnit: string;
  /** Factor multiplicador respecto al unitBasePrice de pricing_model_prices */
  conversionFactor: number;
  /** Peso neto físico en Kg por unidad de esta presentación */
  weightKg: number;
  /** true para paquetes cerrados al vacío de peso fijo */
  isFixedWeightPack: boolean;
}

export interface StorefrontPriceResolution {
  unitBasePrice: number;
  displayPrice: number;
  originalDisplayPrice: number;
  isPriceAvailable: boolean;
  hasCampaignDiscount: boolean;
}

export type CanonicalRecipeId =
  | 'ajiaco'
  | 'sancocho'
  | 'bandeja paisa'
  | 'mondongo'
  | 'mute'
  | 'tamal'
  | 'arroz con pollo';

export interface RecipeBundleDefinition {
  id: CanonicalRecipeId;
  labelEs: string;
  labelEn: string;
  searchQuery: string;
  ingredientMatchTerms: string[];
  optionalFrioganMatchTerms: string[];
}

export interface RecipeBundleItemResult {
  product: Product;
  matchedTerm: string;
  defaultOption: StorefrontPresentationOption;
  price: StorefrontPriceResolution;
  cartItemName: string;
}

export interface StorefrontRuntimeConfig {
  frioganMode: FrioganStorefrontMode;
  cutoffHourPublic: number;
  minOrderHogar: number;
  deliveryFee: number;
  storeStatus: StoreStatusMode;
  vacationConfigRaw: string | null;
  globalBannerEs: string;
  globalBannerEn: string;
  contactPhone: string;
  isB2bLeadCaptureEnabled: boolean;
  quickSuggestions: Product[];
  logoUrl?: string;
  heroImageUrl?: string;
}

export type LeadExpressChannel = 'B2B_EXPRESS' | 'FRIOGAN_TEASER';
export type LeadExpressSegment = 'HOGAR' | 'HORECA';

export interface LeadExpressValidatedInput {
  channel: LeadExpressChannel;
  segment: LeadExpressSegment;
  contact_name: string;
  phone: string;
  company_name: string;
  nit: number | null;
  email: string | null;
  municipality: string;
  address: string;
  business_type: string;
  business_size: string;
  notes: string;
}

export const STOREFRONT_CRATE_PRODUCT_ID = 'c13cfedc-c803-495b-9b9d-71a54d472aa3';

const EMAIL_SIMPLE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Validates and normalizes express B2B / Friogan teaser lead payloads without external dependencies.
 */
export function validateLeadExpressPayload(
  raw: unknown
): { ok: true; data: LeadExpressValidatedInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Solicitud inválida.' };
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.channel !== 'string') {
    return { ok: false, error: 'Canal de registro inválido.' };
  }
  const rawChannel = record.channel.trim();
  if (rawChannel !== 'B2B_EXPRESS' && rawChannel !== 'FRIOGAN_TEASER') {
    return { ok: false, error: 'Canal de registro inválido.' };
  }
  const channel: LeadExpressChannel = rawChannel;

  if (record.segment !== undefined && typeof record.segment !== 'string') {
    return { ok: false, error: 'Segmento inválido.' };
  }
  const rawSegment = String(record.segment ?? 'HORECA').trim().toUpperCase();
  const segment: LeadExpressSegment = rawSegment === 'HOGAR' ? 'HOGAR' : 'HORECA';

  if (typeof record.contact_name !== 'string') {
    return { ok: false, error: 'Ingresa tu nombre completo (mínimo 2 caracteres).' };
  }
  const contactName = record.contact_name.trim();
  if (contactName.length < 2 || contactName.length > 120) {
    return { ok: false, error: 'Ingresa tu nombre completo (mínimo 2 caracteres).' };
  }

  if (typeof record.phone !== 'string' && typeof record.phone !== 'number') {
    return { ok: false, error: 'Ingresa un número celular o fijo válido de 10 dígitos en Colombia.' };
  }
  const rawPhone = String(record.phone).trim();
  if (!/^[+\d\s()-]+$/.test(rawPhone)) {
    return { ok: false, error: 'El teléfono contiene caracteres no permitidos.' };
  }
  const cleanPhone = rawPhone.replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 13) {
    return { ok: false, error: 'Ingresa un número celular o fijo válido de 10 dígitos en Colombia.' };
  }

  if (record.company_name !== undefined && record.company_name !== null && typeof record.company_name !== 'string') {
    return { ok: false, error: 'Nombre de empresa inválido.' };
  }
  const rawCompany = String(record.company_name ?? '').trim().slice(0, 160);
  const companyName =
    rawCompany ||
    (segment === 'HOGAR' ? 'Hogar - Lista Prioritaria Friogan' : contactName);

  // Sanitize Colombian NIT safely into integer for public.leads.nit (bigint)
  let nit: number | null = null;
  if (record.nit !== undefined && record.nit !== null && record.nit !== '') {
    if (typeof record.nit === 'number') {
      if (!Number.isSafeInteger(record.nit) || record.nit <= 0 || String(record.nit).length < 5 || String(record.nit).length > 15) {
        return { ok: false, error: 'NIT inválido. Verifica los dígitos ingresados.' };
      }
      nit = record.nit;
    } else if (typeof record.nit === 'string') {
      const rawNit = record.nit.trim().slice(0, 30);
      if (rawNit.length > 0) {
        if (!/^\d[\d.\s-]*(?:-\d)?$/.test(rawNit)) {
          return { ok: false, error: 'NIT inválido. Usa solo dígitos y guión de verificación.' };
        }
        const basePart = rawNit.split('-')[0] || '';
        const nitDigits = basePart.replace(/[.\s]/g, '');
        if (!/^\d{5,15}$/.test(nitDigits)) {
          return { ok: false, error: 'NIT inválido. Verifica los dígitos ingresados.' };
        }
        const parsedNit = Number(nitDigits);
        if (!Number.isSafeInteger(parsedNit) || parsedNit <= 0) {
          return { ok: false, error: 'NIT inválido.' };
        }
        nit = parsedNit;
      }
    } else {
      return { ok: false, error: 'NIT inválido.' };
    }
  }

  if (record.email !== undefined && record.email !== null && typeof record.email !== 'string') {
    return { ok: false, error: 'El correo electrónico no es válido.' };
  }
  const rawEmail = String(record.email ?? '').trim().slice(0, 160);
  let email: string | null = null;
  if (rawEmail.length > 0) {
    if (!EMAIL_SIMPLE_RE.test(rawEmail)) {
      return { ok: false, error: 'El correo electrónico no es válido.' };
    }
    email = rawEmail.toLowerCase();
  }

  const municipality = typeof record.municipality === 'string' && record.municipality.trim()
    ? record.municipality.trim().slice(0, 80)
    : 'Bogotá';
  const rawAddress = typeof record.address === 'string' ? record.address.trim().slice(0, 160) : '';
  const address = rawAddress || municipality;
  const notes = typeof record.notes === 'string' ? record.notes.trim().slice(0, 300) : '';

  return {
    ok: true,
    data: {
      channel,
      segment,
      contact_name: contactName,
      phone: cleanPhone,
      company_name: companyName,
      nit,
      email,
      municipality,
      address,
      business_type: segment === 'HOGAR' ? 'Hogar' : 'Restaurante',
      business_size: segment === 'HOGAR' ? 'Hogar B2C' : 'Por calificar (Exprés)',
      notes,
    },
  };
}
