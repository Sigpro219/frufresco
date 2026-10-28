/**
 * Utility functions for pricing model resolution and commercial rules.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const GENERAL_INSTITUCIONAL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
export const CLIENTES_HOGAR_ID = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';
export const FAMILIA_CORTES_CORPORATIVO_ID = '31c6d356-2d52-488f-81d6-abffaed295cf';
export const DEFAULT_INSTITUTIONAL_MARGIN_PCT = 25;

interface PricingProductRow {
    id: string;
    name?: string;
    iva_rate?: number | null;
    theoretical_shrinkage_pct?: number | null;
}

interface PricingRuleRow {
    model_id: string;
    product_id?: string;
    margin_adjustment: number | string | null;
}

interface CostMatrixRow {
    product_id: string;
    manual_cost: number | string | null;
    updated_at?: string | null;
}

interface PurchaseHistoryRow {
    product_id: string;
    unit_price: number | string | null;
    created_at?: string | null;
}

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
    return false;
}

/**
 * Resolves the effective pricing model ID for a client profile based on business hierarchy:
 * 1. Explicitly assigned pricing_model_id (own or matrix parent)
 * 2. If B2B client without specific model -> General Institucional (d90a91e5-827c-473d-9d4f-3e28c7c91e15)
 * 3. Default B2C / Guest / Internal Staff -> Clientes Hogar (f7043ca1-94d5-4d25-bd10-fbf30ce120ee)
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

    // 2. Check if user is B2C specifically or internal staff without explicit assignment
    if (profile.role === 'b2c_client' || ['admin', 'sys_admin', 'employee', 'commercial', 'sales'].includes(profile.role || '')) {
        return CLIENTES_HOGAR_ID;
    }

    // 3. If B2B client or company, default automatically to General Institucional
    if (isB2BProfile(profile) || Boolean(profile.company_name)) {
        return GENERAL_INSTITUCIONAL_ID;
    }

    // Default fallback
    return CLIENTES_HOGAR_ID;
}

export interface PricingSyncResult {
    success: boolean;
    hogarPrice?: number;
    error?: string;
    updatesCount?: number;
}

/**
 * Recalculates prices for a single product across all active pricing models
 * based on the authorized base cost from commercial_cost_matrix (or explicit cost),
 * applies margin adjustments from pricing_rules (or base_margin_percent),
 * applies IVA and Colombian commercial 50-multiple rounding,
 * updates pricing_model_prices, mirrors the cost into commercial_overrides for DB triggers,
 * updates pricing_model_prices, and mirrors the cost into commercial_overrides for DB triggers.
 */
export async function recalculateAndSyncProductPrices(
    supabaseClient: SupabaseClient,
    productId: string,
    explicitCost?: number | null
): Promise<PricingSyncResult> {
    try {
        const { data: prod, error: pErr } = await supabaseClient
            .from('products')
            .select('id, name, iva_rate, theoretical_shrinkage_pct')
            .eq('id', productId)
            .single();

        if (pErr || !prod) {
            return { success: false, error: pErr?.message || 'Product not found' };
        }

        let baseCost = explicitCost;
        if (baseCost === undefined || baseCost === null || baseCost <= 0) {
            const [{ data: ccm }, { data: pur }] = await Promise.all([
                supabaseClient
                    .from('commercial_cost_matrix')
                    .select('manual_cost, updated_at')
                    .eq('product_id', productId)
                    .eq('is_active', true)
                    .maybeSingle(),
                supabaseClient
                    .from('purchase_history_normalized')
                    .select('unit_price, created_at')
                    .eq('product_id', productId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
            ]);

            const ccmCost = ccm?.manual_cost && Number(ccm.manual_cost) > 0 ? Number(ccm.manual_cost) : 0;
            const purCost = pur?.unit_price && Number(pur.unit_price) > 0 ? Number(pur.unit_price) : 0;

            if (ccmCost > 0 && purCost > 0) {
                const ccmTime = ccm?.updated_at ? new Date(ccm.updated_at).getTime() : 0;
                const purTime = pur?.created_at ? new Date(pur.created_at).getTime() : 0;
                baseCost = purTime > ccmTime ? purCost : ccmCost;
            } else if (ccmCost > 0) {
                baseCost = ccmCost;
            } else if (purCost > 0) {
                baseCost = purCost;
            } else {
                const { data: rawPur } = await supabaseClient
                    .from('purchases')
                    .select('unit_price')
                    .eq('product_id', productId)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (rawPur?.unit_price && rawPur.unit_price > 0) {
                    baseCost = Number(rawPur.unit_price);
                }
            }
        }

        if (!baseCost || baseCost <= 0) {
            return { success: false, error: 'No valid cost available for recalculation' };
        }

        // Factor de Merma Teórica: Costo Neto = Costo Base / (1 - Merma%)
        const shrinkagePct = Math.min(Math.max(Number(prod.theoretical_shrinkage_pct) || 0, 0), 90);
        const effectiveCost = shrinkagePct > 0 
            ? baseCost / (1 - (shrinkagePct / 100))
            : baseCost;

        // Mirror to commercial_overrides so any Postgres triggers also see this authorized cost
        try {
            await supabaseClient.from('commercial_overrides').upsert({
                product_id: productId,
                manual_cost: baseCost,
                expires_at: null,
                updated_by: 'DELTA-DYNAMIC-SYNC'
            }, { onConflict: 'product_id' });
        } catch (coErr) {
            console.warn('commercial_overrides upsert notice:', coErr);
        }

        const { data: models, error: mErr } = await supabaseClient
            .from('pricing_models')
            .select('id, name, base_margin_percent, is_base_model');

        if (mErr || !models || models.length === 0) {
            return { success: false, error: mErr?.message || 'No pricing models found' };
        }

        const { data: rules } = await supabaseClient
            .from('pricing_rules')
            .select('model_id, margin_adjustment')
            .eq('product_id', productId);

        const rulesMap = new Map<string, number>();
        ((rules || []) as PricingRuleRow[]).forEach((r: PricingRuleRow) => {
            rulesMap.set(r.model_id, Number(r.margin_adjustment));
        });

        const rawBaseRuleMargin = rulesMap.get(GENERAL_INSTITUCIONAL_ID);
        const effectiveBaseMargin = (rawBaseRuleMargin !== undefined && rawBaseRuleMargin > 0)
            ? rawBaseRuleMargin
            : DEFAULT_INSTITUTIONAL_MARGIN_PCT;

        const ivaRate = (Number(prod.iva_rate) || 0) / 100;
        let hogarFinalPrice: number | undefined;

        const pmpUpdates: Array<{ model_id: string; product_id: string; price: number; updated_at: string }> = [];

        models.forEach((m: { id: string; name: string; base_margin_percent: number }) => {
            const explicitRuleMargin = rulesMap.get(m.id);
            const isZeroMarginCorporate = m.id === FAMILIA_CORTES_CORPORATIVO_ID;
            let marginPct: number;

            if (isZeroMarginCorporate) {
                marginPct = explicitRuleMargin !== undefined ? explicitRuleMargin : 0;
            } else if (m.id === GENERAL_INSTITUCIONAL_ID) {
                marginPct = effectiveBaseMargin;
            } else if (explicitRuleMargin !== undefined && explicitRuleMargin > 0) {
                marginPct = explicitRuleMargin;
            } else {
                // Cascading delta from General Institucional baseline (SDD §7.11.A)
                marginPct = effectiveBaseMargin + (Number(m.base_margin_percent) || 0);
            }

            // SPEC.md Secc. 7.3.A: Fórmula Canónica Margen/Utilidad sobre Costo Efectivo (Markup Multiplicador)
            const priceBeforeTax = effectiveCost * (1 + (marginPct || 0) / 100);
            // SPEC.md Secc. 7.3.B: Redondeo Comercial Colombiano a múltiplos superiores de $50 COP
            const roundedPriceBeforeTax = Math.ceil(priceBeforeTax / 50) * 50;

            let finalPrice = roundedPriceBeforeTax;
            if (m.id === CLIENTES_HOGAR_ID) {
                // Para consumidor final B2C, la regulación exige precio de góndola con IVA incluido
                const priceWithTax = priceBeforeTax * (1 + ivaRate);
                finalPrice = Math.ceil(priceWithTax / 50) * 50;
                hogarFinalPrice = finalPrice;
            }

            pmpUpdates.push({
                model_id: m.id,
                product_id: productId,
                price: finalPrice,
                updated_at: new Date().toISOString()
            });
        });

        if (pmpUpdates.length > 0) {
            const { error: pmpErr } = await supabaseClient
                .from('pricing_model_prices')
                .upsert(pmpUpdates, { onConflict: 'model_id,product_id' });
            if (pmpErr) console.error('PMP Upsert error:', pmpErr);
        }

        // SPEC.md §7.2: Se suprime la actualización del campo legado products.base_price.
        // La fuente de verdad canónica para Clientes Hogar y todos los modelos reside exclusivamente en pricing_model_prices.

        return { success: true, hogarPrice: hogarFinalPrice, updatesCount: pmpUpdates.length };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return { success: false, error: message };
    }
}

interface FetchAllOptions {
    eq?: [string, string | number | boolean];
    orderBy?: { column: string; ascending: boolean };
}

async function fetchAllRows<T = Record<string, unknown>>(
    supabaseClient: SupabaseClient,
    table: string,
    selectFields: string,
    options?: FetchAllOptions
): Promise<T[]> {
    let allData: T[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        let query = supabaseClient.from(table).select(selectFields);
        if (options?.eq) {
            query = query.eq(options.eq[0], options.eq[1]);
        }
        if (options?.orderBy) {
            query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending });
        }
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data as unknown as T[]);
        if (data.length < pageSize) break;
        page++;
    }
    return allData;
}

/**
 * Batch recalculate and sync prices for multiple products (or all active products).
 */
export async function batchRecalculateAndSyncPrices(
    supabaseClient: SupabaseClient,
    targetProductIds?: string[]
): Promise<{ success: boolean; processed: number; error?: string }> {
    try {
        let prods: PricingProductRow[];
        if (targetProductIds && targetProductIds.length > 0) {
            const { data, error } = await supabaseClient
                .from('products')
                .select('id, name, iva_rate, theoretical_shrinkage_pct')
                .eq('is_active', true)
                .in('id', targetProductIds);
            if (error) throw error;
            prods = (data || []) as PricingProductRow[];
        } else {
            prods = await fetchAllRows<PricingProductRow>(supabaseClient, 'products', 'id, name, iva_rate, theoretical_shrinkage_pct', { eq: ['is_active', true] });
        }

        if (!prods || prods.length === 0) {
            return { success: false, processed: 0, error: 'No products found' };
        }

        const { data: models } = await supabaseClient
            .from('pricing_models')
            .select('id, name, base_margin_percent, is_base_model');

        if (!models || models.length === 0) {
            return { success: false, processed: 0, error: 'No pricing models found' };
        }

        // Fetch cost matrix with pagination (including updated_at for chronological precedence)
        const ccmList = await fetchAllRows<CostMatrixRow>(supabaseClient, 'commercial_cost_matrix', 'product_id, manual_cost, updated_at', { eq: ['is_active', true] });

        const costMap = new Map<string, { cost: number; updatedAt: number }>();
        (ccmList || []).forEach((c: CostMatrixRow) => {
            if (c.manual_cost && Number(c.manual_cost) > 0) {
                costMap.set(c.product_id, {
                    cost: Number(c.manual_cost),
                    updatedAt: c.updated_at ? new Date(c.updated_at).getTime() : 0
                });
            }
        });

        // Fetch latest purchases for chronological comparison / fallback across purchase_history_normalized and purchases
        const [phnList, rawPurList] = await Promise.all([
            fetchAllRows<PurchaseHistoryRow>(
                supabaseClient,
                'purchase_history_normalized',
                'product_id, unit_price, created_at',
                { orderBy: { column: 'created_at', ascending: false } }
            ),
            fetchAllRows<PurchaseHistoryRow>(
                supabaseClient,
                'purchases',
                'product_id, unit_price, created_at',
                { orderBy: { column: 'created_at', ascending: false } }
            )
        ]);

        const purchaseMap = new Map<string, { cost: number; createdAt: number }>();
        (phnList || []).forEach((p: PurchaseHistoryRow) => {
            if (!purchaseMap.has(p.product_id) && Number(p.unit_price) > 0) {
                purchaseMap.set(p.product_id, {
                    cost: Number(p.unit_price),
                    createdAt: p.created_at ? new Date(p.created_at).getTime() : 0
                });
            }
        });
        (rawPurList || []).forEach((p: PurchaseHistoryRow) => {
            if (!purchaseMap.has(p.product_id) && Number(p.unit_price) > 0) {
                purchaseMap.set(p.product_id, {
                    cost: Number(p.unit_price),
                    createdAt: p.created_at ? new Date(p.created_at).getTime() : 0
                });
            }
        });

        // Fetch all pricing rules with pagination
        const rules = await fetchAllRows<PricingRuleRow>(supabaseClient, 'pricing_rules', 'model_id, product_id, margin_adjustment');

        const rulesMap = new Map<string, number>();
        (rules || []).forEach((r: PricingRuleRow) => {
            rulesMap.set(`${r.model_id}:${r.product_id}`, Number(r.margin_adjustment));
        });

        const pmpBatch: Array<{ model_id: string; product_id: string; price: number; updated_at: string }> = [];
        const overridesBatch: Array<{ product_id: string; manual_cost: number; expires_at: null; updated_by: string }> = [];

        let processed = 0;

        for (const prod of prods) {
            const ccmEntry = costMap.get(prod.id);
            const purEntry = purchaseMap.get(prod.id);
            let baseCost = 0;
            if (ccmEntry && purEntry) {
                baseCost = purEntry.createdAt > ccmEntry.updatedAt ? purEntry.cost : ccmEntry.cost;
            } else if (ccmEntry) {
                baseCost = ccmEntry.cost;
            } else if (purEntry) {
                baseCost = purEntry.cost;
            }
            if (!baseCost || baseCost <= 0) continue;

            overridesBatch.push({
                product_id: prod.id,
                manual_cost: baseCost,
                expires_at: null,
                updated_by: 'DELTA-BATCH-SYNC'
            });

            // Factor de Merma Teórica: Costo Neto = Costo Base / (1 - Merma%)
            const shrinkagePct = Math.min(Math.max(Number(prod.theoretical_shrinkage_pct) || 0, 0), 90);
            const effectiveCost = shrinkagePct > 0 
                ? baseCost / (1 - (shrinkagePct / 100))
                : baseCost;

            const ivaRate = (Number(prod.iva_rate) || 0) / 100;
            const rawBaseRuleMargin = rulesMap.get(`${GENERAL_INSTITUCIONAL_ID}:${prod.id}`);
            const effectiveBaseMargin = (rawBaseRuleMargin !== undefined && rawBaseRuleMargin > 0)
                ? rawBaseRuleMargin
                : DEFAULT_INSTITUTIONAL_MARGIN_PCT;

            for (const m of models) {
                const explicitRuleMargin = rulesMap.get(`${m.id}:${prod.id}`);
                const isZeroMarginCorporate = m.id === FAMILIA_CORTES_CORPORATIVO_ID;
                let marginPct: number;

                if (isZeroMarginCorporate) {
                    marginPct = explicitRuleMargin !== undefined ? explicitRuleMargin : 0;
                } else if (m.id === GENERAL_INSTITUCIONAL_ID) {
                    marginPct = effectiveBaseMargin;
                } else if (explicitRuleMargin !== undefined && explicitRuleMargin > 0) {
                    marginPct = explicitRuleMargin;
                } else {
                    // Cascading delta from General Institucional baseline (SDD §7.11.A)
                    marginPct = effectiveBaseMargin + (Number(m.base_margin_percent) || 0);
                }

                // SPEC.md Secc. 7.3.A: Fórmula Canónica Margen/Utilidad sobre Costo Efectivo (Markup Multiplicador)
                const priceBeforeTax = effectiveCost * (1 + (marginPct || 0) / 100);
                // SPEC.md Secc. 7.3.B: Redondeo Comercial Colombiano a múltiplos superiores de $50 COP
                const roundedPriceBeforeTax = Math.ceil(priceBeforeTax / 50) * 50;

                let finalPrice = roundedPriceBeforeTax;
                if (m.id === CLIENTES_HOGAR_ID) {
                    const priceWithTax = priceBeforeTax * (1 + ivaRate);
                    finalPrice = Math.ceil(priceWithTax / 50) * 50;
                }

                pmpBatch.push({
                    model_id: m.id,
                    product_id: prod.id,
                    price: finalPrice,
                    updated_at: new Date().toISOString()
                });
            }

            processed++;
        }

        // Upsert overrides in chunks of 250
        for (let i = 0; i < overridesBatch.length; i += 250) {
            const chunk = overridesBatch.slice(i, i + 250);
            try {
                await supabaseClient.from('commercial_overrides').upsert(chunk, { onConflict: 'product_id' });
            } catch (coChunkErr) {
                console.warn('commercial_overrides batch chunk notice:', coChunkErr);
            }
        }

        // Upsert PMP in chunks of 250
        for (let i = 0; i < pmpBatch.length; i += 250) {
            const chunk = pmpBatch.slice(i, i + 250);
            await supabaseClient.from('pricing_model_prices').upsert(chunk, { onConflict: 'model_id,product_id' });
        }

        // SPEC.md §7.2: Supresión total de escritura a products.base_price en sincronización masiva.

        return { success: true, processed };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown batch error';
        return { success: false, processed: 0, error: message };
    }
}

export interface BlindCountMetaPayload {
    counted_quantity?: number | string | null;
    countedQty?: number | string | null;
    previous_quantity?: number | string | null;
    diff_quantity?: number | string | null;
    cell_name?: string | null;
    operator?: string | null;
}

/**
 * Extrae de manera determinista la cantidad física contada desde `inventory_movements.notes`.
 * Prioriza el bloque estructurado `[BLIND_COUNT_META: {...}]` (soportando llaves anidadas en strings)
 * y conserva la expresión regular `/Contado:\s*([0-9]+(?:[.,][0-9]+)?)/i` como fallback histórico
 * (SDD §4 DEUDA TÉCNICA 19 / Escenario 338.2 — DT-04).
 */
export function parseBlindCountQuantity(notes?: string | null): number | null {
    if (!notes || typeof notes !== 'string') return null;

    const marker = '[BLIND_COUNT_META:';
    const startIdx = notes.indexOf(marker);
    if (startIdx !== -1) {
        const jsonStart = notes.indexOf('{', startIdx + marker.length);
        if (jsonStart !== -1) {
            let depth = 0;
            let inString = false;
            let isEscaped = false;
            let jsonEnd = -1;

            for (let i = jsonStart; i < notes.length; i++) {
                const ch = notes[i];
                if (isEscaped) {
                    isEscaped = false;
                    continue;
                }
                if (ch === '\\' && inString) {
                    isEscaped = true;
                    continue;
                }
                if (ch === '"') {
                    inString = !inString;
                    continue;
                }
                if (!inString) {
                    if (ch === '{') depth++;
                    else if (ch === '}') {
                        depth--;
                        if (depth === 0) {
                            jsonEnd = i;
                            break;
                        }
                    }
                }
            }

            if (jsonEnd !== -1) {
                try {
                    const parsed = JSON.parse(notes.slice(jsonStart, jsonEnd + 1)) as BlindCountMetaPayload;
                    const rawCandidate = parsed?.counted_quantity !== undefined && parsed?.counted_quantity !== null
                        ? parsed.counted_quantity
                        : parsed?.countedQty;
                    if (rawCandidate !== undefined && rawCandidate !== null && String(rawCandidate).trim() !== '') {
                        const num = Number(rawCandidate);
                        if (Number.isFinite(num)) {
                            return num;
                        }
                    }
                } catch {
                    // Fallback to historical regex below if JSON block is malformed
                }
            }
        }
    }

    const match = notes.match(/Contado:\s*([0-9]+(?:[.,][0-9]+)?)/i);
    if (match && match[1]) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (Number.isFinite(val)) return val;
    }

    return null;
}


