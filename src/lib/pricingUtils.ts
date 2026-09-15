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
 * and updates products.base_price for B2C Clientes Hogar.
 */
export async function recalculateAndSyncProductPrices(
    supabaseClient: any,
    productId: string,
    explicitCost?: number | null
): Promise<PricingSyncResult> {
    try {
        const { data: prod, error: pErr } = await supabaseClient
            .from('products')
            .select('id, name, iva_rate, base_price')
            .eq('id', productId)
            .single();

        if (pErr || !prod) {
            return { success: false, error: pErr?.message || 'Product not found' };
        }

        let baseCost = explicitCost;
        if (baseCost === undefined || baseCost === null || baseCost <= 0) {
            const { data: ccm } = await supabaseClient
                .from('commercial_cost_matrix')
                .select('manual_cost')
                .eq('product_id', productId)
                .eq('is_active', true)
                .maybeSingle();

            if (ccm?.manual_cost && ccm.manual_cost > 0) {
                baseCost = ccm.manual_cost;
            }
        }

        // Fallback to latest purchase if no cost in cost matrix
        if (!baseCost || baseCost <= 0) {
            const { data: pur } = await supabaseClient
                .from('purchases')
                .select('unit_price')
                .eq('product_id', productId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            if (pur?.unit_price && pur.unit_price > 0) {
                baseCost = pur.unit_price;
            }
        }

        if (!baseCost || baseCost <= 0) {
            return { success: false, error: 'No valid cost available for recalculation' };
        }

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
        (rules || []).forEach((r: any) => {
            rulesMap.set(r.model_id, Number(r.margin_adjustment));
        });

        const baseModelRuleMargin = rulesMap.get(GENERAL_INSTITUCIONAL_ID);

        const ivaRate = (Number(prod.iva_rate) || 0) / 100;
        let hogarFinalPrice: number | undefined;

        const pmpUpdates: Array<{ model_id: string; product_id: string; price: number; updated_at: string }> = [];

        models.forEach((m: any) => {
            const explicitRuleMargin = rulesMap.get(m.id);
            let marginPct: number;

            if (explicitRuleMargin !== undefined) {
                marginPct = explicitRuleMargin;
            } else if (baseModelRuleMargin !== undefined && m.id !== GENERAL_INSTITUCIONAL_ID) {
                // Cascading delta from General Institucional baseline
                marginPct = baseModelRuleMargin + (Number(m.base_margin_percent) || 0);
            } else {
                marginPct = Number(m.base_margin_percent) || 0;
            }

            const priceBeforeTax = baseCost * (1 + marginPct / 100);
            const priceWithTax = priceBeforeTax * (1 + ivaRate);
            // Colombian commercial rounding: multiples of 50 COP
            const finalPrice = Math.ceil(priceWithTax / 50) * 50;

            pmpUpdates.push({
                model_id: m.id,
                product_id: productId,
                price: finalPrice,
                updated_at: new Date().toISOString()
            });

            if (m.id === CLIENTES_HOGAR_ID) {
                hogarFinalPrice = finalPrice;
            }
        });

        if (pmpUpdates.length > 0) {
            const { error: pmpErr } = await supabaseClient
                .from('pricing_model_prices')
                .upsert(pmpUpdates, { onConflict: 'model_id,product_id' });
            if (pmpErr) console.error('PMP Upsert error:', pmpErr);
        }

        if (hogarFinalPrice && hogarFinalPrice > 0) {
            const { error: pUpErr } = await supabaseClient
                .from('products')
                .update({ base_price: hogarFinalPrice })
                .eq('id', productId);
            if (pUpErr) console.error('Product base_price update error:', pUpErr);
        }

        return { success: true, hogarPrice: hogarFinalPrice, updatesCount: pmpUpdates.length };
    } catch (err: any) {
        return { success: false, error: err?.message || 'Unknown error' };
    }
}

async function fetchAllRows(
    supabaseClient: any,
    table: string,
    selectFields: string,
    filterFn?: (query: any) => any
): Promise<any[]> {
    let allData: any[] = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        let query = supabaseClient.from(table).select(selectFields).range(page * pageSize, (page + 1) * pageSize - 1);
        if (filterFn) {
            query = filterFn(query);
        }
        const { data, error } = await query;
        if (error) throw error;
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < pageSize) break;
        page++;
    }
    return allData;
}

/**
 * Batch recalculate and sync prices for multiple products (or all active products).
 */
export async function batchRecalculateAndSyncPrices(
    supabaseClient: any,
    targetProductIds?: string[]
): Promise<{ success: boolean; processed: number; error?: string }> {
    try {
        let prods: any[];
        if (targetProductIds && targetProductIds.length > 0) {
            const { data, error } = await supabaseClient
                .from('products')
                .select('id, name, iva_rate, base_price')
                .eq('is_active', true)
                .in('id', targetProductIds);
            if (error) throw error;
            prods = data || [];
        } else {
            prods = await fetchAllRows(supabaseClient, 'products', 'id, name, iva_rate, base_price', q => q.eq('is_active', true));
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

        // Fetch cost matrix with pagination
        const ccmList = await fetchAllRows(supabaseClient, 'commercial_cost_matrix', 'product_id, manual_cost', q => q.eq('is_active', true));

        const costMap = new Map<string, number>();
        (ccmList || []).forEach((c: any) => {
            if (c.manual_cost && c.manual_cost > 0) {
                costMap.set(c.product_id, Number(c.manual_cost));
            }
        });

        // Fetch latest purchases for fallback
        const { data: purchases } = await supabaseClient
            .from('purchases')
            .select('product_id, unit_price, created_at')
            .order('created_at', { ascending: false });

        const purchaseMap = new Map<string, number>();
        (purchases || []).forEach((p: any) => {
            if (!purchaseMap.has(p.product_id) && p.unit_price > 0) {
                purchaseMap.set(p.product_id, Number(p.unit_price));
            }
        });

        // Fetch all pricing rules with pagination
        const rules = await fetchAllRows(supabaseClient, 'pricing_rules', 'model_id, product_id, margin_adjustment');

        const rulesMap = new Map<string, number>();
        (rules || []).forEach((r: any) => {
            rulesMap.set(`${r.model_id}:${r.product_id}`, Number(r.margin_adjustment));
        });

        const pmpBatch: Array<{ model_id: string; product_id: string; price: number; updated_at: string }> = [];
        const productUpdates: Array<{ id: string; base_price: number }> = [];
        const overridesBatch: Array<{ product_id: string; manual_cost: number; expires_at: null; updated_by: string }> = [];

        let processed = 0;

        for (const prod of prods) {
            const baseCost = costMap.get(prod.id) || purchaseMap.get(prod.id);
            if (!baseCost || baseCost <= 0) continue;

            overridesBatch.push({
                product_id: prod.id,
                manual_cost: baseCost,
                expires_at: null,
                updated_by: 'DELTA-BATCH-SYNC'
            });

            const ivaRate = (Number(prod.iva_rate) || 0) / 100;
            let hogarPrice: number | undefined;
            const baseRuleMargin = rulesMap.get(`${GENERAL_INSTITUCIONAL_ID}:${prod.id}`);

            for (const m of models) {
                const explicitRuleMargin = rulesMap.get(`${m.id}:${prod.id}`);
                let marginPct: number;

                if (explicitRuleMargin !== undefined) {
                    marginPct = explicitRuleMargin;
                } else if (baseRuleMargin !== undefined && m.id !== GENERAL_INSTITUCIONAL_ID) {
                    // Cascading delta from General Institucional baseline
                    marginPct = baseRuleMargin + (Number(m.base_margin_percent) || 0);
                } else {
                    marginPct = Number(m.base_margin_percent) || 0;
                }

                const priceBeforeTax = baseCost * (1 + marginPct / 100);
                const priceWithTax = priceBeforeTax * (1 + ivaRate);
                const finalPrice = Math.ceil(priceWithTax / 50) * 50;

                pmpBatch.push({
                    model_id: m.id,
                    product_id: prod.id,
                    price: finalPrice,
                    updated_at: new Date().toISOString()
                });

                if (m.id === CLIENTES_HOGAR_ID) {
                    hogarPrice = finalPrice;
                }
            }

            if (hogarPrice && hogarPrice > 0) {
                productUpdates.push({
                    id: prod.id,
                    base_price: hogarPrice
                });
            }
            processed++;
        }

        // Upsert overrides in chunks
        for (let i = 0; i < overridesBatch.length; i += 50) {
            const chunk = overridesBatch.slice(i, i + 50);
            try {
                await supabaseClient.from('commercial_overrides').upsert(chunk, { onConflict: 'product_id' });
            } catch (coChunkErr) {
                console.warn('commercial_overrides batch chunk notice:', coChunkErr);
            }
        }

        // Upsert PMP in chunks
        for (let i = 0; i < pmpBatch.length; i += 50) {
            const chunk = pmpBatch.slice(i, i + 50);
            await supabaseClient.from('pricing_model_prices').upsert(chunk, { onConflict: 'model_id,product_id' });
        }

        // Update products.base_price in parallel chunks
        for (let i = 0; i < productUpdates.length; i += 25) {
            const chunk = productUpdates.slice(i, i + 25);
            await Promise.all(chunk.map((pu) =>
                supabaseClient.from('products').update({ base_price: pu.base_price }).eq('id', pu.id)
            ));
        }

        return { success: true, processed };
    } catch (err: any) {
        return { success: false, processed: 0, error: err?.message || 'Unknown batch error' };
    }
}

