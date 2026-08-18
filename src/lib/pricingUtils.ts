/**
 * Utility functions for pricing model resolution and commercial rules.
 */

export const GENERAL_INSTITUCIONAL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
export const CLIENTES_HOGAR_ID = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';

export interface MinimalProfile {
    id?: string;
    role?: string;
    profile_type?: string;
    pricing_model_id?: string | null;
    parent_id?: string | null;
    parent?: {
        pricing_model_id?: string | null;
    } | null;
    company_name?: string | null;
}

/**
 * Checks if a profile belongs to an institutional B2B client.
 */
export function isB2BProfile(profile?: MinimalProfile | null): boolean {
    if (!profile) return false;
    if (profile.role === 'b2b_client') return true;
    if (profile.profile_type === 'b2b') return true;
    // System admin / commercial roles acting on B2B
    if (['admin', 'sys_admin', 'commercial', 'sales'].includes(profile.role || '')) return true;
    return false;
}

/**
 * Resolves the effective pricing model ID for a client profile based on business hierarchy:
 * 1. Explicitly assigned pricing_model_id (own or matrix parent)
 * 2. If B2B client without specific model -> General Institucional (d90a91e5-827c-473d-9d4f-3e28c7c91e15)
 * 3. Default B2C / Guest -> Clientes Hogar (f7043ca1-94d5-4d25-bd10-fbf30ce120ee)
 */
export function resolvePricingModelId(profile?: MinimalProfile | null): string {
    if (!profile) {
        return CLIENTES_HOGAR_ID;
    }

    // 1. Check direct assigned pricing_model_id or parent pricing_model_id
    const assignedModel = profile.pricing_model_id || profile.parent?.pricing_model_id;
    if (assignedModel) {
        return assignedModel;
    }

    // 2. Check if user is B2C specifically
    if (profile.role === 'b2c_client') {
        return CLIENTES_HOGAR_ID;
    }

    // 3. If B2B client or company, default automatically to General Institucional
    if (isB2BProfile(profile) || Boolean(profile.company_name)) {
        return GENERAL_INSTITUCIONAL_ID;
    }

    // Default fallback
    return CLIENTES_HOGAR_ID;
}
