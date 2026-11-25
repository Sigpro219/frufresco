import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifyStaffBearer, insertAuditLogSafe } from '@/lib/auth/verifyStaffBearer';
import { canCreateHistoricalBillingOrder } from '@/lib/billing/historicalBillingAuth';
import {
    CLIENTES_HOGAR_ID,
    DEFAULT_INSTITUTIONAL_MARGIN_PCT,
    FAMILIA_CORTES_CORPORATIVO_ID,
    GENERAL_INSTITUCIONAL_ID,
    resolvePricingModelId,
} from '@/lib/pricingUtils';

export const dynamic = 'force-dynamic';

type PriceSource = 'agreement' | 'pricing_model' | 'cost_matrix' | 'none';

interface HistoricalOrderItemInput {
    product_id: string;
    quantity: number;
    unit_price: number;
    unit?: string | null;
    variant_label?: string | null;
}

function getBogotaTodayStr(): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

async function authorizeHistoricalBilling(
    req: NextRequest,
    supabaseAdmin: ReturnType<typeof createAdminClient>
) {
    const auth = await verifyStaffBearer(req, supabaseAdmin);
    if (!auth.ok) {
        const failed = auth as { ok: false; status: 401 | 403; error: string };
        return { ok: false as const, status: failed.status, error: failed.error };
    }

    const staff = auth as {
        ok: true;
        userId: string;
        actorName: string;
        actorEmail: string | null;
        role: string;
    };

    if (!canCreateHistoricalBillingOrder({ id: staff.userId, email: staff.actorEmail })) {
        return {
            ok: false as const,
            status: 403 as const,
            error: 'Acceso denegado: usuario no autorizado para crear pedidos históricos de solo facturación',
        };
    }

    return { ok: true as const, auth: staff };
}

function computeCostMatrixPrice(
    manualCost: number,
    ivaRatePct: number,
    modelId: string,
    baseMarginPercent: number,
    modelRuleMargin: number | undefined,
    giRuleMargin: number | undefined
): number {
    if (!Number.isFinite(manualCost) || manualCost <= 0) return 0;

    let marginPct: number;
    if (modelId === FAMILIA_CORTES_CORPORATIVO_ID) {
        marginPct = modelRuleMargin !== undefined ? modelRuleMargin : 0;
    } else if (modelId === GENERAL_INSTITUCIONAL_ID) {
        marginPct =
            modelRuleMargin !== undefined && modelRuleMargin > 0
                ? modelRuleMargin
                : DEFAULT_INSTITUTIONAL_MARGIN_PCT;
    } else if (modelRuleMargin !== undefined && modelRuleMargin > 0) {
        marginPct = modelRuleMargin;
    } else {
        const effectiveGiMargin =
            giRuleMargin !== undefined && giRuleMargin > 0
                ? giRuleMargin
                : DEFAULT_INSTITUTIONAL_MARGIN_PCT;
        marginPct = effectiveGiMargin + (Number.isFinite(baseMarginPercent) ? baseMarginPercent : 0);
    }

    const priceBeforeTax = manualCost * (1 + marginPct / 100);
    if (modelId === CLIENTES_HOGAR_ID) {
        const priceWithTax = priceBeforeTax * (1 + Math.max(0, ivaRatePct) / 100);
        return Math.ceil(priceWithTax / 50) * 50;
    }
    return Math.ceil(priceBeforeTax / 50) * 50;
}

/**
 * GET /api/commercial/billing/historical-order?profile_id=...
 * Returns active clients, active catalog (`id`, `name`, `accounting_id`, `unit_of_measure`, `iva_rate`),
 * and resolved prices strictly from:
 *   1. Active agreement (`quotes` with `status = 'agreement'` + `quote_items`)
 *   2. `pricing_model_prices` (`profile.pricing_model_id` / default institutional or hogar model)
 *   3. `commercial_cost_matrix` + `pricing_rules`
 * Never reads or uses `products.base_price`.
 */
export async function GET(req: NextRequest) {
    try {
        const supabaseAdmin = createAdminClient();
        const authCheck = await authorizeHistoricalBilling(req, supabaseAdmin);
        if (!authCheck.ok) {
            return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
        }

        const { searchParams } = new URL(req.url);
        const profileId = (searchParams.get('profile_id') || '').trim() || null;
        const todayBogota = getBogotaTodayStr();

        const [
            { data: clientsData, error: clientsErr },
            { data: productsData, error: productsErr },
        ] = await Promise.all([
            supabaseAdmin
                .from('profiles')
                .select(
                    'id, company_name, razon_social, contact_name, email, nit, document_type, role, pricing_model_id, parent_id, address, is_active'
                )
                .in('role', ['b2b_client', 'b2c_client'])
                .neq('is_active', false)
                .order('company_name', { ascending: true, nullsFirst: false }),
            supabaseAdmin
                .from('products')
                .select('id, name, accounting_id, unit_of_measure, iva_rate')
                .eq('is_active', true)
                .order('name', { ascending: true }),
        ]);

        if (clientsErr) throw clientsErr;
        if (productsErr) throw productsErr;

        const clients = clientsData || [];
        const products = productsData || [];

        let selectedProfile: any = null;
        let resolvedModelId: string = GENERAL_INSTITUCIONAL_ID;
        const agreementPriceMap = new Map<string, number>();

        if (profileId) {
            selectedProfile = clients.find((c: any) => c.id === profileId) || null;
            if (!selectedProfile) {
                const { data: fetchedProfile } = await supabaseAdmin
                    .from('profiles')
                    .select(
                        'id, company_name, razon_social, contact_name, email, nit, document_type, role, pricing_model_id, parent_id, address, is_active'
                    )
                    .eq('id', profileId)
                    .maybeSingle();
                selectedProfile = fetchedProfile || null;
            }

            if (!selectedProfile) {
                return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
            }

            let parentProfile: { pricing_model_id?: string | null } | null = null;
            if (selectedProfile.parent_id) {
                const cachedParent = clients.find((c: any) => c.id === selectedProfile.parent_id);
                if (cachedParent) {
                    parentProfile = { pricing_model_id: cachedParent.pricing_model_id };
                } else {
                    const { data: pData } = await supabaseAdmin
                        .from('profiles')
                        .select('pricing_model_id')
                        .eq('id', selectedProfile.parent_id)
                        .maybeSingle();
                    parentProfile = pData;
                }
            }

            resolvedModelId = resolvePricingModelId({
                ...selectedProfile,
                parent: parentProfile,
            });

            // 1. Active agreement (`quotes` with `status = 'agreement'` + `quote_items`)
            const fetchAgreementQuotes = async (clientTargetId: string) => {
                const { data } = await supabaseAdmin
                    .from('quotes')
                    .select('id, created_at, quote_items(product_id, unit_price)')
                    .eq('client_id', clientTargetId)
                    .eq('status', 'agreement')
                    .order('created_at', { ascending: false })
                    .limit(1);
                return data || [];
            };

            let agreementQuotes = await fetchAgreementQuotes(selectedProfile.id);
            if (agreementQuotes.length === 0 && selectedProfile.parent_id) {
                agreementQuotes = await fetchAgreementQuotes(selectedProfile.parent_id);
            }

            if (agreementQuotes.length > 0 && Array.isArray(agreementQuotes[0].quote_items)) {
                for (const qi of agreementQuotes[0].quote_items as any[]) {
                    const priceVal = Number(qi.unit_price);
                    if (qi.product_id && Number.isFinite(priceVal) && priceVal > 0) {
                        agreementPriceMap.set(qi.product_id, priceVal);
                    }
                }
            }
        }

        // 2 & 3. `pricing_model_prices` + `commercial_cost_matrix` + `pricing_rules`
        const [
            { data: pmpData },
            { data: costMatrixData },
            { data: pricingModelsData },
            { data: modelRulesData },
            { data: giRulesData },
        ] = await Promise.all([
            supabaseAdmin
                .from('pricing_model_prices')
                .select('product_id, price')
                .eq('model_id', resolvedModelId),
            supabaseAdmin
                .from('commercial_cost_matrix')
                .select('product_id, manual_cost')
                .eq('is_active', true),
            supabaseAdmin
                .from('pricing_models')
                .select('id, base_margin_percent')
                .eq('id', resolvedModelId)
                .maybeSingle(),
            supabaseAdmin
                .from('pricing_rules')
                .select('product_id, margin_adjustment')
                .eq('model_id', resolvedModelId),
            resolvedModelId !== GENERAL_INSTITUCIONAL_ID
                ? supabaseAdmin
                      .from('pricing_rules')
                      .select('product_id, margin_adjustment')
                      .eq('model_id', GENERAL_INSTITUCIONAL_ID)
                : Promise.resolve({ data: [] as any[] }),
        ]);

        const modelPriceMap = new Map<string, number>();
        for (const row of pmpData || []) {
            const p = Number((row as any).price);
            if ((row as any).product_id && Number.isFinite(p) && p > 0) {
                modelPriceMap.set((row as any).product_id, p);
            }
        }

        const costMatrixMap = new Map<string, number>();
        for (const row of costMatrixData || []) {
            const c = Number((row as any).manual_cost);
            if ((row as any).product_id && Number.isFinite(c) && c > 0) {
                costMatrixMap.set((row as any).product_id, c);
            }
        }

        const modelRuleMap = new Map<string, number>();
        for (const row of modelRulesData || []) {
            if ((row as any).product_id && (row as any).margin_adjustment !== null) {
                modelRuleMap.set((row as any).product_id, Number((row as any).margin_adjustment));
            }
        }

        const giRuleMap = new Map<string, number>();
        for (const row of giRulesData || []) {
            if ((row as any).product_id && (row as any).margin_adjustment !== null) {
                giRuleMap.set((row as any).product_id, Number((row as any).margin_adjustment));
            }
        }

        const baseMarginPercent = Number((pricingModelsData as any)?.base_margin_percent || 0);

        const catalog = products.map((prod: any) => {
            const ivaRate = Number(prod.iva_rate || 0);
            let resolvedPrice = 0;
            let priceSource: PriceSource = 'none';

            const agPrice = agreementPriceMap.get(prod.id);
            if (agPrice !== undefined && agPrice > 0) {
                resolvedPrice = agPrice;
                priceSource = 'agreement';
            } else {
                const mpPrice = modelPriceMap.get(prod.id);
                if (mpPrice !== undefined && mpPrice > 0) {
                    resolvedPrice = mpPrice;
                    priceSource = 'pricing_model';
                } else {
                    const manualCost = costMatrixMap.get(prod.id);
                    if (manualCost !== undefined && manualCost > 0) {
                        const computed = computeCostMatrixPrice(
                            manualCost,
                            ivaRate,
                            resolvedModelId,
                            baseMarginPercent,
                            modelRuleMap.get(prod.id),
                            giRuleMap.get(prod.id)
                        );
                        if (computed > 0) {
                            resolvedPrice = computed;
                            priceSource = 'cost_matrix';
                        }
                    }
                }
            }

            return {
                id: prod.id,
                name: prod.name,
                accounting_id: prod.accounting_id ?? null,
                unit_of_measure: prod.unit_of_measure || 'Kg',
                iva_rate: ivaRate,
                resolved_price: resolvedPrice,
                price_source: priceSource,
            };
        });

        return NextResponse.json({
            today_bogota: todayBogota,
            clients,
            selected_profile: selectedProfile,
            pricing_model_id: resolvedModelId,
            catalog,
        });
    } catch (err: any) {
        console.error('[Historical Billing GET] Error:', err);
        return NextResponse.json(
            { error: err?.message || 'Error consultando catálogo histórico' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/commercial/billing/historical-order
 * Creates an isolated `status = 'billing_only'` historical order with `picked_quantity: null`,
 * `warehouse_spaces: null`, `assigned_route_id: null`, `origin: 'Admin Panel'`,
 * and `origin_source: 'billing_historical'`.
 */
export async function POST(req: NextRequest) {
    try {
        const supabaseAdmin = createAdminClient();
        const authCheck = await authorizeHistoricalBilling(req, supabaseAdmin);
        if (!authCheck.ok) {
            return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
        }
        const { auth } = authCheck;

        const body = await req.json();
        const profileId = String(body?.profile_id || '').trim();
        const deliveryDate = String(body?.delivery_date || '').trim();
        const purchaseOrderNumber =
            body?.purchase_order_number !== undefined && body?.purchase_order_number !== null
                ? String(body.purchase_order_number).trim() || null
                : null;
        const rawNotes =
            body?.notes !== undefined && body?.notes !== null ? String(body.notes).trim() : '';
        const rawItems: HistoricalOrderItemInput[] = Array.isArray(body?.items) ? body.items : [];

        if (!profileId) {
            return NextResponse.json({ error: 'profile_id es obligatorio' }, { status: 400 });
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) {
            return NextResponse.json(
                { error: 'delivery_date debe tener formato YYYY-MM-DD' },
                { status: 400 }
            );
        }

        const todayBogota = getBogotaTodayStr();
        if (deliveryDate > todayBogota) {
            return NextResponse.json(
                {
                    error: `La fecha histórica de entrega (${deliveryDate}) no puede ser futura respecto a hoy (${todayBogota}, America/Bogota)`,
                },
                { status: 400 }
            );
        }

        if (rawItems.length === 0) {
            return NextResponse.json(
                { error: 'Debe incluir al menos un ítem en el pedido histórico' },
                { status: 400 }
            );
        }

        for (let i = 0; i < rawItems.length; i++) {
            const it = rawItems[i];
            const prodId = String(it?.product_id || '').trim();
            const qty = Number(it?.quantity);
            const price = Number(it?.unit_price);

            if (!prodId) {
                return NextResponse.json(
                    { error: `Ítem #${i + 1}: product_id es obligatorio` },
                    { status: 400 }
                );
            }
            if (!Number.isFinite(qty) || qty <= 0) {
                return NextResponse.json(
                    { error: `Ítem #${i + 1}: quantity debe ser mayor a 0` },
                    { status: 400 }
                );
            }
            if (!Number.isFinite(price) || price < 0) {
                return NextResponse.json(
                    { error: `Ítem #${i + 1}: unit_price debe ser >= 0` },
                    { status: 400 }
                );
            }
        }

        const { data: profile, error: profileErr } = await supabaseAdmin
            .from('profiles')
            .select(
                'id, role, company_name, razon_social, contact_name, document_type, remission_with_prices, address'
            )
            .eq('id', profileId)
            .maybeSingle();

        if (profileErr) throw profileErr;
        if (!profile) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }

        const uniqueProductIds = Array.from(
            new Set(rawItems.map((it) => String(it.product_id).trim()))
        );
        const { data: dbProducts, error: dbProdErr } = await supabaseAdmin
            .from('products')
            .select('id, name, unit_of_measure, iva_rate, weight_kg')
            .in('id', uniqueProductIds);

        if (dbProdErr) throw dbProdErr;

        const productsMap = new Map<string, any>();
        for (const p of dbProducts || []) {
            productsMap.set(p.id, p);
        }

        let subtotal = 0;
        let totalTax = 0;
        let totalWeightKg = 0;

        const preparedItems = rawItems.map((it) => {
            const productId = String(it.product_id).trim();
            const dbProd = productsMap.get(productId);
            if (!dbProd) {
                throw new Error(`Producto no encontrado: ${productId}`);
            }

            const quantity = Number(it.quantity);
            const unitPrice = Number(it.unit_price);
            const unit = String(it.unit || dbProd.unit_of_measure || 'Kg').trim();
            const ivaRate = Number(dbProd.iva_rate || 0);

            const lineSubtotal = quantity * unitPrice;
            const lineTax = lineSubtotal * (ivaRate / 100);
            subtotal += lineSubtotal;
            totalTax += lineTax;

            const unitLower = unit.toLowerCase();
            let weightFactor = 1.0;
            if (unitLower === 'kg' || unitLower === 'kilo' || unitLower === 'kilogramo') {
                weightFactor = 1.0;
            } else if (unitLower === 'lb' || unitLower === 'libra' || unitLower === 'libras') {
                weightFactor = 0.5;
            } else if (dbProd.weight_kg && Number(dbProd.weight_kg) > 0) {
                weightFactor = Number(dbProd.weight_kg);
            }
            totalWeightKg += quantity * weightFactor;

            return {
                product_id: productId,
                quantity,
                picked_quantity: null,
                unit_price: unitPrice,
                unit,
                variant_label: it.variant_label ? String(it.variant_label).trim() : null,
            };
        });

        const roundedSubtotal = Math.round(subtotal * 100) / 100;
        const roundedTax = Math.round(totalTax * 100) / 100;
        const roundedTotal = Math.round((roundedSubtotal + roundedTax) * 100) / 100;
        const roundedWeight = Math.round(totalWeightKg * 1000) / 1000;

        const isB2C = profile.role === 'b2c_client';
        const adminNotes = `[SOLO FACTURACIÓN / HISTÓRICO — Creado por ${auth.actorName}]${
            rawNotes ? ` ${rawNotes}` : ''
        }`;

        const orderPayload = {
            profile_id: profile.id,
            type: isB2C ? 'b2c' : 'b2b',
            document_type: isB2C ? 'remission' : profile.document_type || 'remission',
            remission_with_prices: isB2C ? true : profile.remission_with_prices !== false,
            status: 'billing_only',
            warehouse_spaces: null,
            assigned_route_id: null,
            origin: 'Admin Panel',
            origin_source: 'billing_historical',
            delivery_date: deliveryDate,
            delivery_slot: 'AM',
            shipping_address: profile.address || 'Bogotá',
            payment_status: 'Pendiente',
            payment_method: isB2C ? 'Contado' : 'Crédito B2B',
            purchase_order_number: purchaseOrderNumber,
            subtotal: roundedSubtotal,
            tax: roundedTax,
            total: roundedTotal,
            total_weight_kg: roundedWeight,
            admin_notes: adminNotes,
            logistics_data: {
                is_historical_billing_only: true,
                created_by_id: auth.userId,
                created_by_name: auth.actorName,
                created_by_email: auth.actorEmail,
            },
        };

        const { data: newOrder, error: orderErr } = await supabaseAdmin
            .from('orders')
            .insert([orderPayload])
            .select()
            .single();

        if (orderErr || !newOrder) {
            console.error('[Historical Billing POST] Error inserting order:', orderErr);
            return NextResponse.json(
                { error: `Error creando pedido histórico: ${orderErr?.message || 'desconocido'}` },
                { status: 500 }
            );
        }

        const orderItemsToInsert = preparedItems.map((itm) => ({
            order_id: newOrder.id,
            ...itm,
        }));

        const { error: itemsErr } = await supabaseAdmin
            .from('order_items')
            .insert(orderItemsToInsert);

        if (itemsErr) {
            console.error('[Historical Billing POST] Error inserting order_items:', itemsErr);
            await supabaseAdmin.from('orders').delete().eq('id', newOrder.id);
            return NextResponse.json(
                { error: `Error guardando ítems del pedido histórico: ${itemsErr.message}` },
                { status: 500 }
            );
        }

        try {
            await insertAuditLogSafe(supabaseAdmin, {
                action: 'CREATE_historical_billing_order',
                module: 'BILLING',
                collaboratorName: auth.actorName,
                collaboratorId: auth.userId,
                details: {
                    order_id: newOrder.id,
                    sequence_id: newOrder.sequence_id,
                    profile_id: profile.id,
                    client_name: profile.company_name || profile.razon_social || profile.contact_name,
                    delivery_date: deliveryDate,
                    total: roundedTotal,
                    items_count: orderItemsToInsert.length,
                    origin_source: 'billing_historical',
                },
            });
        } catch (auditErr) {
            console.warn('[Historical Billing POST] Audit log warning:', auditErr);
        }

        return NextResponse.json(
            {
                ok: true,
                order: newOrder,
                items_count: orderItemsToInsert.length,
            },
            { status: 201 }
        );
    } catch (err: any) {
        console.error('[Historical Billing POST] Error:', err);
        return NextResponse.json(
            { error: err?.message || 'Error creando pedido histórico' },
            { status: 500 }
        );
    }
}
