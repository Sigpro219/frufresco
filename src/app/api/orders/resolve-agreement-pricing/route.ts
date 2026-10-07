import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0; // Dynamic route

const GENERAL_INSTITUCIONAL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
const CLIENTES_HOGAR_ID = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';

// In-memory cache for General Institucional prices to avoid downloading thousands of rows on every request
let cachedGeneralPrices: { map: Record<string, number>; timestamp: number } | null = null;
const CACHE_TTL_MS = 120_000; // 2 minutes

function getSupabase() {
    const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
    return createClient(supabaseUrl, serviceKey);
}

async function getGeneralInstitutionalPrices(supabase: any): Promise<Record<string, number>> {
    const now = Date.now();
    if (cachedGeneralPrices && (now - cachedGeneralPrices.timestamp < CACHE_TTL_MS)) {
        return cachedGeneralPrices.map;
    }

    const { data: genPrices } = await supabase
        .from('pricing_model_prices')
        .select('product_id, price')
        .eq('model_id', GENERAL_INSTITUCIONAL_ID);

    const map: Record<string, number> = {};
    (genPrices || []).forEach((p: any) => {
        if (p.product_id && p.price !== null && Number(p.price) > 0) {
            map[p.product_id] = Number(p.price);
        }
    });

    cachedGeneralPrices = { map, timestamp: now };
    return map;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const deliveryDate = searchParams.get('delivery_date') || new Date().toISOString().split('T')[0];
    const clientType = searchParams.get('client_type') || (clientId ? 'B2B' : 'B2C');

    return handleResolve(clientId, deliveryDate, clientType);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const clientId = body.client_id;
        const deliveryDate = body.delivery_date || new Date().toISOString().split('T')[0];
        const clientType = body.client_type || (clientId ? 'B2B' : 'B2C');

        return handleResolve(clientId, deliveryDate, clientType);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
}

async function handleResolve(clientId: string | null, deliveryDate: string, clientType: string) {
    const supabase = getSupabase();
    const checkDate = deliveryDate ? deliveryDate.split('T')[0] : new Date().toISOString().split('T')[0];
    const isB2B = clientType === 'B2B' || Boolean(clientId);

    if (!clientId) {
        return NextResponse.json({
            success: true,
            resolvedModel: { id: CLIENTES_HOGAR_ID, name: 'Clientes Hogar' },
            activeAgreement: null,
            isExpired: false,
            isB2CDefault: true,
            allowOffAgreementPurchases: true,
            contractPrices: {},
            agreementProductIds: [],
            customPriceIds: [],
            campaignPrices: {}
        });
    }

    try {
        // 1. Fetch current client profile
        const { data: currentProfile } = await supabase
            .from('profiles')
            .select('id, company_name, pricing_model_id, parent_id, role, payment_days, logistics_data, allow_off_agreement_purchases, override_parent_off_agreement')
            .eq('id', clientId)
            .maybeSingle();

        const branchId = currentProfile?.id || clientId;
        const parentId = currentProfile?.parent_id || null;

        // Fetch parent profile in parallel if exists
        let parentProfile: any = null;
        if (parentId) {
            const { data: pData } = await supabase
                .from('profiles')
                .select('id, company_name, pricing_model_id, parent_id, role, payment_days, logistics_data, allow_off_agreement_purchases, override_parent_off_agreement')
                .eq('id', parentId)
                .maybeSingle();
            parentProfile = pData;
        }

        // 2. Off-agreement purchase permissions (matrix inheritance)
        let allowOff = true;
        if (currentProfile) {
            if (currentProfile.override_parent_off_agreement && currentProfile.allow_off_agreement_purchases !== undefined && currentProfile.allow_off_agreement_purchases !== null) {
                allowOff = currentProfile.allow_off_agreement_purchases !== false;
            } else if (parentProfile && parentProfile.allow_off_agreement_purchases !== undefined && parentProfile.allow_off_agreement_purchases !== null) {
                allowOff = parentProfile.allow_off_agreement_purchases !== false;
            } else if (currentProfile.allow_off_agreement_purchases !== undefined && currentProfile.allow_off_agreement_purchases !== null) {
                allowOff = currentProfile.allow_off_agreement_purchases !== false;
            }
        }

        // 3. Agreement Resolution (Canonical Hierarchy: Branch > Matrix > Master Shared)
        let candidateAgreement: any = null;

        // Level 1: Branch assigned agreement
        if (branchId) {
            const { data: bAg } = await supabase
                .from('quotes')
                .select('id, quote_number, start_date, valid_until, model_snapshot_name')
                .eq('client_id', branchId)
                .eq('status', 'agreement')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (bAg) candidateAgreement = bAg;
        }

        // Level 2: Matrix parent assigned agreement
        if (!candidateAgreement && parentId) {
            const { data: mAg } = await supabase
                .from('quotes')
                .select('id, quote_number, start_date, valid_until, model_snapshot_name')
                .eq('client_id', parentId)
                .eq('status', 'agreement')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (mAg) candidateAgreement = mAg;
        }

        // Level 3: Master shared agreement
        if (!candidateAgreement) {
            const masterId = currentProfile?.logistics_data?.active_master_agreement_id 
                          || parentProfile?.logistics_data?.active_master_agreement_id;
            if (masterId) {
                const { data: sm } = await supabase
                    .from('quotes')
                    .select('id, quote_number, start_date, valid_until, model_snapshot_name')
                    .eq('id', masterId)
                    .eq('status', 'agreement')
                    .maybeSingle();
                if (sm) candidateAgreement = sm;
            }

            if (!candidateAgreement && (branchId || parentId)) {
                const { data: sharedSettings } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .ilike('key', 'agreement_clients:%');
                
                if (sharedSettings) {
                    for (const item of sharedSettings) {
                        try {
                            const linkedIds: string[] = JSON.parse(item.value || '[]');
                            if (linkedIds.includes(branchId) || (parentId && linkedIds.includes(parentId))) {
                                const quoteId = item.key.replace('agreement_clients:', '');
                                const { data: sm } = await supabase
                                    .from('quotes')
                                    .select('id, quote_number, start_date, valid_until, model_snapshot_name')
                                    .eq('id', quoteId)
                                    .eq('status', 'agreement')
                                    .maybeSingle();
                                if (sm) {
                                    candidateAgreement = sm;
                                    break;
                                }
                            }
                        } catch {
                            // ignore json error
                        }
                    }
                }
            }
        }

        // 4. Validity check against delivery date
        let expired = false;
        if (candidateAgreement) {
            const start = candidateAgreement.start_date?.split('T')[0];
            const end = candidateAgreement.valid_until?.split('T')[0];
            if (start && start > checkDate) expired = true;
            if (end && end < checkDate) expired = true;
        }

        const activeAgreement = (candidateAgreement && !expired) ? candidateAgreement : null;

        // 5. Model Resolution
        let resolvedModel: any = null;
        let b2cFallback = false;

        if (activeAgreement) {
            resolvedModel = {
                id: activeAgreement.id,
                name: activeAgreement.model_snapshot_name || `Acuerdo ${activeAgreement.quote_number}`,
                is_agreement: true,
                quote_number: activeAgreement.quote_number,
                start_date: activeAgreement.start_date,
                valid_until: activeAgreement.valid_until
            };
        } else {
            let modelId = currentProfile?.pricing_model_id || parentProfile?.pricing_model_id || null;
            if (modelId) {
                const { data: pm } = await supabase
                    .from('pricing_models')
                    .select('*')
                    .eq('id', modelId)
                    .single();
                if (pm) {
                    resolvedModel = pm;
                    const start = pm.start_date?.split('T')[0];
                    const end = pm.end_date?.split('T')[0];
                    if (start && start > checkDate) expired = true;
                    if (end && end < checkDate) expired = true;
                }
            }

            if (!resolvedModel || expired) {
                b2cFallback = true;
                const defaultTargetId = isB2B ? GENERAL_INSTITUCIONAL_ID : CLIENTES_HOGAR_ID;
                const { data: defModel } = await supabase
                    .from('pricing_models')
                    .select('*')
                    .eq('id', defaultTargetId)
                    .maybeSingle();
                resolvedModel = defModel || { id: defaultTargetId, name: isB2B ? 'General Institucional' : 'Clientes Hogar' };
            }
        }

        // 6. Parallel data retrieval: agreement items + general institutional fallback
        const priceMap: Record<string, number> = {};
        const agreementProductIds: string[] = [];
        const customPriceIds: string[] = [];

        const parallelQueries: Promise<any>[] = [];

        // 6a. Quote items for active agreement
        if (activeAgreement) {
            parallelQueries.push(
                Promise.resolve(
                    supabase
                        .from('quote_items')
                        .select('product_id, unit_price')
                        .eq('quote_id', activeAgreement.id)
                )
            );
        } else if (resolvedModel && !resolvedModel.is_agreement && resolvedModel.id !== GENERAL_INSTITUCIONAL_ID && resolvedModel.id !== CLIENTES_HOGAR_ID) {
            parallelQueries.push(
                Promise.resolve(
                    supabase
                        .from('pricing_model_prices')
                        .select('product_id, price')
                        .eq('model_id', resolvedModel.id)
                )
            );
        } else {
            parallelQueries.push(Promise.resolve({ data: [] }));
        }

        // 6b. General institutional fallback (served from fast server memory cache)
        parallelQueries.push(getGeneralInstitutionalPrices(supabase));

        // 6c. Campaign Targets
        parallelQueries.push(
            Promise.resolve(
                supabase
                    .from('campaign_targets')
                    .select('campaign_id')
                    .eq('profile_id', branchId)
            )
        );

        const [specificRes, genPricesMap, campTargetsRes] = await Promise.all(parallelQueries);

        // Process specific agreement or model prices
        if (activeAgreement && specificRes.data) {
            (specificRes.data || []).forEach((qi: any) => {
                if (qi.product_id) {
                    const price = Number(qi.unit_price) || 0;
                    priceMap[qi.product_id] = price;
                    agreementProductIds.push(qi.product_id);
                    customPriceIds.push(qi.product_id);
                }
            });
        } else if (resolvedModel && !resolvedModel.is_agreement && specificRes.data) {
            (specificRes.data || []).forEach((p: any) => {
                if (p.product_id && p.price !== null) {
                    const price = Number(p.price) || 0;
                    priceMap[p.product_id] = price;
                    customPriceIds.push(p.product_id);
                }
            });
        }

        // Populate fallback general institutional prices for missing SKUs
        if (isB2B) {
            const castedGenPrices = (genPricesMap || {}) as Record<string, number>;
            for (const [prodId, gPrice] of Object.entries(castedGenPrices)) {
                const numericPrice = Number(gPrice);
                if (priceMap[prodId] === undefined && numericPrice > 0) {
                    priceMap[prodId] = numericPrice;
                }
            }
        }

        // 7. Resolve Campaigns
        const campMap: Record<string, { value: number; type: string; name: string }> = {};
        const targetCampaigns = campTargetsRes?.data || [];
        if (targetCampaigns.length > 0) {
            const campIds = targetCampaigns.map((tc: any) => tc.campaign_id);
            const nowIso = new Date().toISOString();
            const { data: activeCamps } = await supabase
                .from('commercial_campaigns')
                .select('*')
                .in('id', campIds)
                .eq('status', 'active')
                .lte('start_date', nowIso)
                .gte('end_date', nowIso);

            if (activeCamps && activeCamps.length > 0) {
                const agreementSet = new Set(agreementProductIds);
                for (const camp of activeCamps) {
                    const { data: campItems } = await supabase
                        .from('campaign_items')
                        .select('*')
                        .eq('campaign_id', camp.id);

                    (campItems || []).forEach((ci: any) => {
                        // SPEC.md §7.2: Inmunidad Contractual - Campañas aplican a catálogo, NO a SKUs congelados en acuerdo
                        if (!agreementSet.has(ci.product_id)) {
                            campMap[ci.product_id] = {
                                value: Number(ci.custom_value) || 0,
                                type: camp.type || 'fixed_price',
                                name: camp.name || 'Campaña'
                            };

                            // Apply campaign discount directly if valid
                            const basePrice = priceMap[ci.product_id] || 0;
                            if (basePrice > 0) {
                                if (camp.type === 'fixed_price') {
                                    priceMap[ci.product_id] = Number(ci.custom_value) || 0;
                                } else if (camp.type === 'margin_adjustment') {
                                    priceMap[ci.product_id] = basePrice * (1 + (Number(ci.custom_value) || 0) / 100);
                                }
                            }
                        }
                    });
                }
            }
        }

        return NextResponse.json({
            success: true,
            resolvedModel,
            activeAgreement,
            candidateAgreement: candidateAgreement ? {
                id: candidateAgreement.id,
                quote_number: candidateAgreement.quote_number,
                start_date: candidateAgreement.start_date,
                valid_until: candidateAgreement.valid_until,
                model_snapshot_name: candidateAgreement.model_snapshot_name
            } : null,
            isExpired: expired,
            isB2CDefault: b2cFallback,
            allowOffAgreementPurchases: allowOff,
            contractPrices: priceMap,
            agreementProductIds,
            customPriceIds,
            campaignPrices: campMap
        });
    } catch (err: any) {
        console.error('Error resolving agreement pricing:', err);
        return NextResponse.json({ error: err.message || 'Error en servidor' }, { status: 500 });
    }
}
