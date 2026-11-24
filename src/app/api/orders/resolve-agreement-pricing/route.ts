import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0; // Dynamic route

const GENERAL_INSTITUCIONAL_ID = 'd90a91e5-827c-473d-9d4f-3e28c7c91e15';
const CLIENTES_HOGAR_ID = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee';

// In-memory cache for General Institucional & Clientes Hogar prices to avoid downloading thousands of rows on every request
let cachedGeneralPrices: { map: Record<string, number>; timestamp: number } | null = null;
let cachedHogarPrices: { map: Record<string, number>; timestamp: number } | null = null;
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

    const [genPricesRes, prodsRes, costRes, rulesRes] = await Promise.all([
        supabase.from('pricing_model_prices').select('product_id, price').eq('model_id', GENERAL_INSTITUCIONAL_ID),
        supabase.from('products').select('id, base_price, theoretical_shrinkage_pct').eq('is_active', true),
        supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true),
        supabase.from('pricing_rules').select('product_id, margin_adjustment').eq('model_id', GENERAL_INSTITUCIONAL_ID)
    ]);

    const map: Record<string, number> = {};
    (genPricesRes.data || []).forEach((p: any) => {
        if (p.product_id && p.price !== null && Number(p.price) > 0) {
            map[p.product_id] = Number(p.price);
        }
    });

    const costMap = new Map<string, number>();
    (costRes.data || []).forEach((c: any) => {
        if (Number(c.manual_cost) > 0) costMap.set(c.product_id, Number(c.manual_cost));
    });

    const ruleMap = new Map<string, number>();
    (rulesRes.data || []).forEach((r: any) => {
        if (r.margin_adjustment !== null && r.margin_adjustment !== undefined) {
            ruleMap.set(r.product_id, Number(r.margin_adjustment));
        }
    });

    (prodsRes.data || []).forEach((prod: any) => {
        if (!map[prod.id] || map[prod.id] <= 0) {
            const realCost = costMap.get(prod.id) || 0;
            const ruleMargin = ruleMap.has(prod.id) ? (ruleMap.get(prod.id) as number) : 35;
            const shrinkagePct = Math.min(Math.max(Number(prod.theoretical_shrinkage_pct) || 0, 0), 90);
            const effectiveCost = shrinkagePct > 0 ? realCost / (1 - shrinkagePct / 100) : realCost;
            const computed = effectiveCost > 0
                ? Math.ceil((effectiveCost * (1 + ruleMargin / 100)) / 50) * 50
                : (Number(prod.base_price) > 0 ? Number(prod.base_price) : 0);
            if (computed > 0) {
                map[prod.id] = computed;
            }
        }
    });

    cachedGeneralPrices = { map, timestamp: now };
    return map;
}

async function getClientesHogarPrices(supabase: any): Promise<Record<string, number>> {
    const now = Date.now();
    if (cachedHogarPrices && (now - cachedHogarPrices.timestamp < CACHE_TTL_MS)) {
        return cachedHogarPrices.map;
    }

    const [hogarPricesRes, genPricesMap] = await Promise.all([
        supabase.from('pricing_model_prices').select('product_id, price').eq('model_id', CLIENTES_HOGAR_ID),
        getGeneralInstitutionalPrices(supabase)
    ]);

    const map: Record<string, number> = {};
    (hogarPricesRes.data || []).forEach((p: any) => {
        if (p.product_id && p.price !== null && Number(p.price) > 0) {
            map[p.product_id] = Number(p.price);
        }
    });

    // Respaldo de seguridad: si un producto del catálogo no está explícito en la lista Hogar, hereda el precio General
    if (genPricesMap) {
        for (const [prodId, gPrice] of Object.entries(genPricesMap)) {
            if (!map[prodId] && Number(gPrice) > 0) {
                map[prodId] = Number(gPrice);
            }
        }
    }

    cachedHogarPrices = { map, timestamp: now };
    return map;
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const deliveryDate = searchParams.get('delivery_date') || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const orderDate = searchParams.get('order_date') || searchParams.get('orderDate') || null;
    const clientType = searchParams.get('client_type') || (clientId ? 'B2B' : 'B2C');

    return handleResolve(clientId, deliveryDate, clientType, orderDate);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const clientId = body.client_id;
        const deliveryDate = body.delivery_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
        const orderDate = body.order_date || body.orderDate || null;
        const clientType = body.client_type || (clientId ? 'B2B' : 'B2C');

        return handleResolve(clientId, deliveryDate, clientType, orderDate);
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
}

async function handleResolve(clientId: string | null, deliveryDate: string, clientType: string, orderDate?: string | null) {
    const supabase = getSupabase();
    // Brecha A5: El descuento y la vigencia aplican prioritariamente a la FECHA DEL PEDIDO
    const defaultBogotaDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
    const checkDate = orderDate ? orderDate.split('T')[0] : (deliveryDate ? deliveryDate.split('T')[0] : defaultBogotaDate);
    
    // Determinación inicial B2C vs B2B
    let isB2C = clientType === 'B2C' || clientType === 'HOGAR';

    if (!clientId) {
        if (isB2C || !clientType || clientType !== 'B2B') {
            const hogarPrices = await getClientesHogarPrices(supabase);
            return NextResponse.json({
                success: true,
                resolvedModel: { id: CLIENTES_HOGAR_ID, name: 'Clientes Hogar' },
                activeAgreement: null,
                isExpired: false,
                isB2CDefault: true,
                allowOffAgreementPurchases: true,
                contractPrices: hogarPrices,
                agreementProductIds: [],
                customPriceIds: Object.keys(hogarPrices),
                campaignPrices: {}
            });
        }
        return NextResponse.json({
            success: true,
            resolvedModel: { id: GENERAL_INSTITUCIONAL_ID, name: 'General Institucional' },
            activeAgreement: null,
            isExpired: false,
            isB2CDefault: false,
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

        if (currentProfile?.role === 'b2c_client' || currentProfile?.pricing_model_id === CLIENTES_HOGAR_ID) {
            isB2C = true;
        } else if (currentProfile?.role === 'b2b_client') {
            isB2C = false;
        }
        const isB2B = !isB2C;

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
        const { data: specialModels } = await supabase
            .from('special_agreement_models')
            .select('id, name, master_quote_id, start_date, valid_until');

        const masterModelByQuoteId = new Map<string, any>();
        (specialModels || []).forEach((sm: any) => {
            if (sm.master_quote_id) masterModelByQuoteId.set(sm.master_quote_id, sm);
        });

        const enrichAgreementDates = (ag: any) => {
            if (!ag) return null;
            const mm = masterModelByQuoteId.get(ag.id);
            if (mm) {
                const agEnd = ag.valid_until ? String(ag.valid_until).split('T')[0] : '';
                const mmEnd = mm.valid_until ? String(mm.valid_until).split('T')[0] : '';
                const useMasterModel = Boolean(mmEnd && (!agEnd || mmEnd >= agEnd));
                return {
                    ...ag,
                    start_date: useMasterModel ? (mm.start_date || ag.start_date) : ag.start_date,
                    valid_until: useMasterModel ? mm.valid_until : ag.valid_until,
                    model_snapshot_name: ag.model_snapshot_name || mm.name
                };
            }
            return ag;
        };

        type AgreementLifecycle = 'active' | 'grace_30d' | 'expired_over_30d' | 'future';
        const getAgreementLifecycle = (ag: any): { isExpired: boolean; daysExpired: number; lifecycle: AgreementLifecycle } => {
            if (!ag) return { isExpired: true, daysExpired: 0, lifecycle: 'future' };
            const start = ag.start_date?.split('T')[0];
            const end = ag.valid_until?.split('T')[0];
            if (start && start > checkDate) return { isExpired: true, daysExpired: 0, lifecycle: 'future' };
            if (end && end < checkDate) {
                const daysExpired = Math.max(0, Math.floor((Date.parse(`${checkDate}T00:00:00Z`) - Date.parse(`${end}T00:00:00Z`)) / 86400000));
                if (daysExpired > 30) {
                    return { isExpired: true, daysExpired, lifecycle: 'expired_over_30d' };
                }
                return { isExpired: true, daysExpired, lifecycle: 'grace_30d' };
            }
            return { isExpired: false, daysExpired: 0, lifecycle: 'active' };
        };
        const isAgreementExpired = (ag: any) => getAgreementLifecycle(ag).isExpired;

        // Candado 3 (Enmienda Escenario 479): 2 Pasadas Globales (Pasada 1: 'agreement' en 1->2->3; Pasada 2: 'expired' en 1->2->3)
        // Impide que un acuerdo viejo 'expired' en Nivel 1 o 2 bloquee una Lista Maestra 'agreement' vigente en Nivel 3.
        const resolveAgreementByStatus = async (targetStatus: 'agreement' | 'expired') => {
            const fetchClientQuote = async (cId: string) => {
                let q = supabase
                    .from('quotes')
                    .select('id, quote_number, start_date, valid_until, model_snapshot_name, status')
                    .eq('client_id', cId)
                    .eq('status', targetStatus);
                if (targetStatus === 'expired') {
                    q = q.order('valid_until', { ascending: false, nullsFirst: false });
                }
                const { data } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
                return data ? enrichAgreementDates(data) : null;
            };

            // Level 1: Branch assigned agreement
            if (branchId) {
                const branchAg = await fetchClientQuote(branchId);
                if (branchAg) return branchAg;
            }

            // Level 2: Matrix parent assigned agreement
            if (parentId) {
                const parentAg = await fetchClientQuote(parentId);
                if (parentAg) return parentAg;
            }

            // Level 3: Master shared agreement (evalua todos los candidatos en orden sin que uno muerto bloquee al siguiente)
            const candidateMasterIds: string[] = [];
            const pushUniqueMasterId = (id: unknown) => {
                if (typeof id === 'string' && id.trim() && !candidateMasterIds.includes(id.trim())) {
                    candidateMasterIds.push(id.trim());
                }
            };

            pushUniqueMasterId(currentProfile?.logistics_data?.active_master_agreement_id);
            pushUniqueMasterId(parentProfile?.logistics_data?.active_master_agreement_id);

            if (branchId || parentId) {
                const targetIds = [branchId, parentId].filter(Boolean);
                const { data: modelRows } = await supabase
                    .from('special_agreement_model_clients')
                    .select('model_id')
                    .in('client_id', targetIds);
                if (modelRows && modelRows.length > 0) {
                    const modelIds = Array.from(new Set(modelRows.map((r: any) => r.model_id).filter(Boolean)));
                    if (modelIds.length > 0) {
                        const { data: sams } = await supabase
                            .from('special_agreement_models')
                            .select('master_quote_id')
                            .in('id', modelIds);
                        (sams || []).forEach((s: any) => pushUniqueMasterId(s.master_quote_id));
                    }
                }

                const { data: sharedSettings } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .ilike('key', 'agreement_clients:%');
                if (sharedSettings) {
                    for (const item of sharedSettings) {
                        try {
                            const linkedIds: string[] = JSON.parse(item.value || '[]');
                            if (linkedIds.includes(branchId) || (parentId && linkedIds.includes(parentId))) {
                                pushUniqueMasterId(item.key.replace('agreement_clients:', ''));
                            }
                        } catch {
                            // ignore json error
                        }
                    }
                }
            }

            for (const masterId of candidateMasterIds) {
                const { data: sm } = await supabase
                    .from('quotes')
                    .select('id, quote_number, start_date, valid_until, model_snapshot_name, status')
                    .eq('id', masterId)
                    .eq('status', targetStatus)
                    .maybeSingle();
                if (sm) {
                    const enriched = enrichAgreementDates(sm);
                    if (enriched) return enriched;
                }
            }

            return null;
        };

        const candidateAgreement = (await resolveAgreementByStatus('agreement')) || (await resolveAgreementByStatus('expired'));
        const isCandidateExpired = candidateAgreement ? isAgreementExpired(candidateAgreement) : false;

        // 4. Validity check against order date (Escenario 479: Gracia 30 días vs > 30 días Remisión $0)
        const candidateLifecycle = candidateAgreement ? getAgreementLifecycle(candidateAgreement) : null;
        const agreementLifecycle: 'active' | 'grace_30d' | 'expired_over_30d' | 'future' | 'none' = candidateLifecycle ? candidateLifecycle.lifecycle : 'none';
        const daysExpired = candidateLifecycle ? candidateLifecycle.daysExpired : 0;
        const isExpiredOver30Days = agreementLifecycle === 'expired_over_30d';
        let expired = candidateAgreement ? isCandidateExpired : false;
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
        } else if (candidateAgreement) {
            // SDD Escenario 312 & 479: Preservar precios en gracia <= 30d; > 30d pasa a Remisión $0
            const baseAgName = candidateAgreement.model_snapshot_name || `Acuerdo ${candidateAgreement.quote_number}`;
            resolvedModel = {
                id: candidateAgreement.id,
                name: isExpiredOver30Days
                    ? `${baseAgName} (Vencido > 30d · Remisión $0)`
                    : (agreementLifecycle === 'grace_30d' ? `${baseAgName} (Gracia ${daysExpired}/30d)` : `${baseAgName} (En transición/Renovación)`),
                is_agreement: true,
                quote_number: candidateAgreement.quote_number,
                start_date: candidateAgreement.start_date,
                valid_until: candidateAgreement.valid_until,
                is_expired: isCandidateExpired,
                days_expired: daysExpired,
                agreement_lifecycle: agreementLifecycle
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

        // 6a. Quote items for active or candidate agreement (Escenario 312)
        const targetAgreement = activeAgreement || candidateAgreement;
        if (targetAgreement) {
            parallelQueries.push(
                Promise.resolve(
                    supabase
                        .from('quote_items')
                        .select('product_id, unit_price')
                        .eq('quote_id', targetAgreement.id)
                )
            );
        } else if (resolvedModel?.id === CLIENTES_HOGAR_ID) {
            parallelQueries.push(
                getClientesHogarPrices(supabase).then(hMap => ({
                    data: Object.entries(hMap).map(([product_id, price]) => ({ product_id, price }))
                }))
            );
        } else if (resolvedModel && !resolvedModel.is_agreement && resolvedModel.id !== GENERAL_INSTITUCIONAL_ID) {
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

        // Process specific agreement or model prices (Escenario 312 & 479)
        if (targetAgreement && specificRes.data) {
            (specificRes.data || []).forEach((qi: any) => {
                if (qi.product_id) {
                    agreementProductIds.push(qi.product_id);
                    if (!isExpiredOver30Days) {
                        const price = Number(qi.unit_price) || 0;
                        priceMap[qi.product_id] = price;
                        customPriceIds.push(qi.product_id);
                    }
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

        // Populate fallback general institutional prices for missing SKUs ONLY when there is NO active agreement.
        // SDD Escenario 221: Si el cliente tiene acuerdo vigente (activeAgreement != null), cualquier SKU fuera del acuerdo
        // (cuando allowOffAgreementPurchases === true) entra a $0 COP para despacharse en Remisión Fuera de Acuerdo,
        // prohibiéndose la auto-asignación de precios de la lista General Institucional.
        // SDD Escenario 221 & 312: Si el cliente tiene acuerdo asignado (activo o candidato),
        // cualquier SKU fuera del acuerdo entra a $0 COP para despacharse como Remision Fuera de Acuerdo (Tarifa Pendiente).
        // Queda ESTRICTAMENTE PROHIBIDO heredar precios automaticos de General Institucional ($3.400) para clientes con acuerdo.
        const hasAssignedAgreement = Boolean(activeAgreement || candidateAgreement);
        // SDD Escenario 466: Si el cliente B2B tiene acuerdo vigente, PROHIBIDO heredar General Institucional aunque allowOff=true; todo SKU fuera de acuerdo nace en $0 COP.
        if ((isB2B && !hasAssignedAgreement) || isB2C) {
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
        if (targetCampaigns.length > 0 && !hasAssignedAgreement) {
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

        // Extract agreement discount percentage (Escenario 253)
        const candidateName = candidateAgreement?.model_snapshot_name || activeAgreement?.model_snapshot_name || '';
        const dtoMatch = candidateName.match(/\[DTO_COMERCIAL:\s*(\d+(\.\d+)?)%\]/i);
        const agreementDiscountPct = dtoMatch 
            ? Number(dtoMatch[1]) 
            : Number(currentProfile?.logistics_data?.agreement_discount_pct || parentProfile?.logistics_data?.agreement_discount_pct || 0);

        return NextResponse.json({
            success: true,
            resolvedModel,
            activeAgreement,
            agreementDiscountPct,
            candidateAgreement: candidateAgreement ? {
                id: candidateAgreement.id,
                quote_number: candidateAgreement.quote_number,
                start_date: candidateAgreement.start_date,
                valid_until: candidateAgreement.valid_until,
                model_snapshot_name: candidateAgreement.model_snapshot_name
            } : null,
            isExpired: expired,
            agreementLifecycle,
            daysExpired,
            isExpiredOver30Days,
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
