import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';
import {
    allocateReturnsAcrossOrderItems,
    recalculateOrderTotalsFromItems,
    extractAgreementDiscountPct,
    type BillingReturnLike,
    type OrderItemLike,
} from '@/lib/commercial/pqrAdjustmentEngine';

export const dynamic = 'force-dynamic';

/**
 * ️ Endpoint SDD Escenario 221:
 * Gestión y Asignación Comercial de Precios para Remisiones Fuera de Acuerdo ($0 COP).
 *
 * - GET: Consulta todas las remisiones/pedidos despachados sin precio (Fuera de Acuerdo a $0)
 *        para una fecha específica (o pedido específico), devolviendo sus ítems y costos de referencia.
 * - POST: Asigna el precio unitario comercial autorizado a los SKUs/ítems en $0 del día,
 *         recalcula subtotal, IVA, total (descontando devoluciones aprobadas en recepción si existen),
 *         levanta el bloqueo de facturación, cierra las tareas urgentes en admin_tasks,
 *         y MANTIENE INTACTO el acuerdo comercial del cliente (Inmunidad Contractual).
 */
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const deliveryDate = searchParams.get('delivery_date') || searchParams.get('date');
        const orderId = searchParams.get('order_id') || searchParams.get('orderId');

        const supabaseAdmin = createAdminClient();

        let query = supabaseAdmin
            .from('orders')
            .select(`
                id,
                sequence_id,
                created_at,
                delivery_date,
                delivery_slot,
                status,
                total,
                subtotal,
                tax,
                admin_notes,
                purchase_order_number,
                logistics_data,
                profile_id,
                profiles (
                    id,
                    company_name,
                    razon_social,
                    nit,
                    iva_responsible,
                    document_type,
                    parent_id
                ),
                order_items (
                    id,
                    order_id,
                    product_id,
                    quantity,
                    picked_quantity,
                    selected_options,
                    unit_price,
                    unit,
                    variant_label,
                    nickname,
                    products (
                        id,
                        accounting_id,
                        name,
                        sku,
                        unit_of_measure,
                        iva_rate
                    )
                ),
                billing_returns (
                    id,
                    product_id,
                    quantity_returned,
                    calculated_amount,
                    status,
                    source,
                    credit_note_number,
                    reason,
                    notes
                )
            `)
            .is('billing_cut_id', null)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false });

        if (orderId) {
            query = query.eq('id', orderId);
        } else if (deliveryDate && deliveryDate !== 'all') {
            query = query.eq('delivery_date', deliveryDate);
        }

        const { data: rawOrders, error } = await query;
        if (error) throw error;

        // Filtrar pedidos que tienen marca de DESPACHADO SIN PRECIO / FUERA DE ACUERDO o ítems a $0 (excluyendo obsequios y reposiciones)
        const targetOrders = (rawOrders || []).filter((o: any) => {
            const notes = (o.admin_notes || '').toUpperCase();
            const isGiftOrReplacement =
                o.profiles?.document_type === 'gift_remission' ||
                Boolean(o.logistics_data?.is_gift_remission) ||
                Boolean(o.logistics_data?.is_replacement) ||
                notes.includes('REMISIÓN DE OBSEQUIO') ||
                notes.includes('REPOSICIÓN DE GARANTÍA');
            if (isGiftOrReplacement) return false;

            // Si es Consumo Abierto puro (y no Fuera de Acuerdo / Despachado sin Precio), se liquida por matriz de costo abierta
            const isUnpricedDispatch =
                notes.includes('DESPACHADO SIN PRECIO') ||
                notes.includes('SE DESPACHÓ SIN PRECIO') ||
                notes.includes('FUERA DE ACUERDO') ||
                Boolean(o.logistics_data?.is_off_agreement_split);

            const hasZeroItems = (o.order_items || []).some((it: any) => Number(it.unit_price || 0) === 0);
            return isUnpricedDispatch && hasZeroItems;
        });

        // Cargar costos de referencia (commercial_cost_matrix y General Institucional) como guía visual para el Jefe Comercial
        const [{ data: costMatrixData }, { data: genPricesData }] = await Promise.all([
            supabaseAdmin
                .from('commercial_cost_matrix')
                .select('product_id, manual_cost')
                .eq('is_active', true),
            supabaseAdmin
                .from('pricing_model_prices')
                .select('product_id, price')
                .eq('model_id', GENERAL_INSTITUCIONAL_ID)
        ]);

        const costMap: Record<string, number> = {};
        (costMatrixData || []).forEach((r: any) => {
            if (r.manual_cost !== null && Number(r.manual_cost) > 0) {
                costMap[r.product_id] = Number(r.manual_cost);
            }
        });

        const genPricesMap: Record<string, number> = {};
        (genPricesData || []).forEach((r: any) => {
            if (r.price !== null && Number(r.price) > 0) {
                genPricesMap[r.product_id] = Number(r.price);
            }
        });

        const formattedOrders = targetOrders.map((o: any) => {
            const rawItems = (o.order_items || []) as any[];
            const rawReturns = (o.billing_returns || []) as any[];
            const mappedItems: OrderItemLike[] = rawItems.map((it: any) => ({
                ...it,
                product_name: it.products?.name || it.nickname,
                products: it.products
            }));
            const mappedReturns: BillingReturnLike[] = rawReturns.map((r: any) => ({
                ...r,
                quantity: r.quantity_returned
            }));
            const allocatedLines = allocateReturnsAcrossOrderItems(mappedItems, mappedReturns, {
                isOffAgreementSplit: true
            });

            const items = allocatedLines.map((line) => {
                const it = line.item as any;
                const prod = it.products || {};
                const prodId = it.product_id || prod.id;

                return {
                    id: it.id,
                    order_id: o.id,
                    product_id: prodId,
                    accounting_id: prod.accounting_id || null,
                    products: it.products || null,
                    product_name: prod.name || it.nickname || 'Producto',
                    unit: it.unit || prod.unit_of_measure || 'Kg',
                    variant_label: it.variant_label || null,
                    quantity: line.originalQuantity,
                    returned_quantity: line.deductedQuantity,
                    billable_quantity: line.netQuantity,
                    unit_price: line.unitPriceGross,
                    iva_rate: line.ivaRatePct,
                    reference_cost: costMap[prodId] || 0,
                    reference_general_price: genPricesMap[prodId] || 0
                };
            });

            return {
                id: o.id,
                sequence_id: o.sequence_id,
                delivery_date: o.delivery_date,
                delivery_slot: o.delivery_slot,
                purchase_order_number: o.purchase_order_number,
                parent_order_id: o.logistics_data?.parent_order_id || null,
                parent_order_sequence: o.logistics_data?.parent_order_sequence || null,
                client_id: o.profile_id,
                client_name: o.profiles?.company_name || o.profiles?.razon_social || 'Cliente Institucional',
                client_nit: o.profiles?.nit || 'N/A',
                iva_responsible: Boolean(o.profiles?.iva_responsible),
                admin_notes: o.admin_notes,
                items,
                unpriced_items: items // SDD Escenario 312: Alias para interoperabilidad completa de UI
            };
        });

        return NextResponse.json({
            success: true,
            orders: formattedOrders
        });
    } catch (err: any) {
        console.error('Error fetching unpriced off-agreement orders:', err);
        return NextResponse.json(
            { error: err.message || 'Error consultando remisiones fuera de acuerdo sin precio.' },
            { status: 500 }
        );
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        let assignments: Array<{
            orderItemId?: string;
            orderId?: string;
            productId?: string;
            unitPrice: number;
        }> = body.assignments || [];

        // SDD Escenario 312: Soporte para formato { orderIds, itemPrices: { [orderItemId]: price } }
        if (assignments.length === 0 && body.itemPrices && typeof body.itemPrices === 'object') {
            assignments = Object.entries(body.itemPrices).map(([orderItemId, unitPrice]) => ({
                orderItemId,
                unitPrice: Number(unitPrice)
            }));
        }
        const deliveryDate: string | undefined = body.deliveryDate;
        const assignedBy: string = body.assignedBy || 'Jefe Comercial';

        if (!Array.isArray(assignments) || assignments.length === 0) {
            return NextResponse.json(
                { error: 'Debes ingresar al menos un precio comercial mayor a $0 para asignar.' },
                { status: 400 }
            );
        }

        const validAssignments = assignments.filter(a => Number(a.unitPrice) > 0);
        if (validAssignments.length === 0) {
            return NextResponse.json(
                { error: 'Todos los precios asignados deben ser mayores a $0 COP.' },
                { status: 400 }
            );
        }

        const supabaseAdmin = createAdminClient();
        const affectedOrderIds = new Set<string>();
        let updatedItemsCount = 0;

        // 1. Aplicar precios por orderItemId directo o por (productId + fecha/orden)
        for (const assign of validAssignments) {
            const cleanPrice = Math.round(Number(assign.unitPrice));
            if (cleanPrice <= 0) continue;

            if (assign.orderItemId) {
                const { data: updatedRows, error: upErr } = await supabaseAdmin
                    .from('order_items')
                    .update({ unit_price: cleanPrice })
                    .eq('id', assign.orderItemId)
                    .select('id, order_id');

                if (upErr) throw upErr;
                if (updatedRows) {
                    updatedRows.forEach((r: any) => {
                        affectedOrderIds.add(r.order_id);
                        updatedItemsCount++;
                    });
                }
            } else if (assign.productId) {
                // Buscar órdenes afectadas en esa fecha (o pedido específico)
                let ordersQuery = supabaseAdmin
                    .from('orders')
                    .select('id, admin_notes, logistics_data')
                    .is('billing_cut_id', null)
                    .neq('status', 'cancelled');

                if (assign.orderId) {
                    ordersQuery = ordersQuery.eq('id', assign.orderId);
                } else if (deliveryDate && deliveryDate !== 'all') {
                    ordersQuery = ordersQuery.eq('delivery_date', deliveryDate);
                }

                const { data: candidateOrders, error: candErr } = await ordersQuery;
                if (candErr) throw candErr;
                const targetOrderIds = (candidateOrders || [])
                    .filter((o: any) => {
                        const notes = (o.admin_notes || '').toUpperCase();
                        return (
                            notes.includes('DESPACHADO SIN PRECIO') ||
                            notes.includes('SE DESPACHÓ SIN PRECIO') ||
                            notes.includes('FUERA DE ACUERDO') ||
                            Boolean(o.logistics_data?.is_off_agreement_split)
                        );
                    })
                    .map((o: any) => o.id);

                if (targetOrderIds.length > 0) {
                    const { data: updatedRows, error: upErr } = await supabaseAdmin
                        .from('order_items')
                        .update({ unit_price: cleanPrice })
                        .in('order_id', targetOrderIds)
                        .eq('product_id', assign.productId)
                        .eq('unit_price', 0)
                        .select('id, order_id');

                    if (upErr) throw upErr;
                    if (updatedRows) {
                        updatedRows.forEach((r: any) => {
                            affectedOrderIds.add(r.order_id);
                            updatedItemsCount++;
                        });
                    }
                }
            }
        }

        // 2. Recalcular totales, impuestos, deducciones de calidad y levantar bloqueo en cada orden afectada
        let updatedOrdersCount = 0;
        const nowStr = new Date().toLocaleString('es-CO', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        for (const ordId of Array.from(affectedOrderIds)) {
            const { data: orderData, error: ordErr } = await supabaseAdmin
                .from('orders')
                .select(`
                    id,
                    sequence_id,
                    admin_notes,
                    logistics_data,
                    profiles (
                        iva_responsible,
                        logistics_data,
                        parent:parent_id (
                            logistics_data
                        )
                    ),
                    order_items (
                        id,
                        product_id,
                        quantity,
                        picked_quantity,
                        selected_options,
                        unit_price,
                        products (
                            id,
                            name,
                            iva_rate
                        )
                    ),
                    billing_returns (
                        id,
                        product_id,
                        quantity_returned,
                        calculated_amount,
                        status,
                        source,
                        credit_note_number,
                        reason,
                        notes
                    )
                `)
                .eq('id', ordId)
                .single();

            if (ordErr || !orderData) continue;

            const items = (orderData.order_items || []) as any[];
            const mappedItems: OrderItemLike[] = items.map((it: any) => ({
                id: it.id,
                product_id: it.product_id,
                product_name: it.products?.name,
                quantity: it.quantity,
                unit_price: it.unit_price,
                products: it.products
            }));
            const mappedReturns: BillingReturnLike[] = ((orderData.billing_returns || []) as any[]).map((r: any) => ({
                id: r.id,
                product_id: r.product_id,
                quantity: r.quantity_returned,
                calculated_amount: r.calculated_amount,
                status: r.status,
                source: r.source,
                credit_note_number: r.credit_note_number,
                reason: r.reason
            }));

            let stillHasZeroPrice = false;
            const remainingZeroNames: string[] = [];
            for (const it of items) {
                if ((Number(it.unit_price) || 0) <= 0) {
                    stillHasZeroPrice = true;
                    remainingZeroNames.push(it.products?.name || 'Producto');
                }
            }

            const summary = recalculateOrderTotalsFromItems(mappedItems, mappedReturns, {
                isOffAgreementSplit: true,
                agreementDiscountPct: extractAgreementDiscountPct(orderData.logistics_data)
            });

            const deductionTotal = summary.lines.reduce(
                (acc, line) => acc + line.deductedQuantity * line.unitPriceGross,
                0
            );
            const finalSubtotal = summary.subtotal;
            const finalTax = summary.tax;
            const finalTotal = summary.total;

            let updatedNotes = orderData.admin_notes || '';
            if (!stillHasZeroPrice) {
                // Remover etiquetas de bloqueo DESPACHADO SIN PRECIO / SE DESPACHÓ SIN PRECIO
                updatedNotes = updatedNotes
                    .replace(/\[FUERA DE ACUERDO\s*-\s*DESPACHADO SIN PRECIO[^\]]*\]/gi, '')
                    .replace(/\[DESPACHADO SIN PRECIO[^\]]*\]/gi, '')
                    .replace(/\[SE DESPACHÓ SIN PRECIO[^\]]*\]/gi, '')
                    .trim();

                const pricedTag = `[REMISIÓN FUERA DE ACUERDO VALORIZADA POR ${assignedBy.toUpperCase()} (${nowStr}) - TOTAL: $${finalTotal.toLocaleString('es-CO')} - LISTA PARA FACTURAR]`;
                updatedNotes = `${pricedTag}\n${updatedNotes}`.trim();
            } else {
                // Actualizar la etiqueta con los productos que aún faltan por precio
                updatedNotes = updatedNotes
                    .replace(/\[FUERA DE ACUERDO\s*-\s*DESPACHADO SIN PRECIO[^\]]*\]/gi, '')
                    .replace(/\[DESPACHADO SIN PRECIO[^\]]*\]/gi, '')
                    .trim();
                updatedNotes = `[FUERA DE ACUERDO - DESPACHADO SIN PRECIO - PENDIENTE FIJAR TARIFA COMERCIAL: ${remainingZeroNames.join(', ')}]\n${updatedNotes}`.trim();
            }

            // Si hubo deducción de calidad calculada con el nuevo precio, actualizar tag de ajuste en factura
            if (deductionTotal > 0) {
                updatedNotes = updatedNotes.replace(/\[AJUSTE FACTURA:[^\]]*\]/gi, '').trim();
                updatedNotes = `${updatedNotes} | [AJUSTE FACTURA: -$${Math.round(deductionTotal).toLocaleString('es-CO')}]`.trim();
            }

            const baseLogisticsData: Record<string, unknown> = { ...(orderData.logistics_data || {}) };
            if (!stillHasZeroPrice && baseLogisticsData.document_type_override === 'remission') {
                delete baseLogisticsData.document_type_override;
                delete baseLogisticsData.remission_with_prices_override;
            }
            const updatedLogisticsData = {
                ...baseLogisticsData,
                off_agreement_priced: !stillHasZeroPrice,
                off_agreement_priced_at: !stillHasZeroPrice ? new Date().toISOString() : null,
                off_agreement_priced_by: !stillHasZeroPrice ? assignedBy : null
            };

            const { error: ordUpdErr } = await supabaseAdmin
                .from('orders')
                .update({
                    subtotal: finalSubtotal,
                    tax: finalTax,
                    total: finalTotal,
                    admin_notes: updatedNotes,
                    logistics_data: updatedLogisticsData
                })
                .eq('id', ordId);
            if (ordUpdErr) throw ordUpdErr;

            updatedOrdersCount++;

            // 3. Si ya no tiene ítems en $0, cerrar las tareas urgentes asociadas en admin_tasks
            if (!stillHasZeroPrice) {
                const seqStr = orderData.sequence_id ? `#${orderData.sequence_id}` : ordId.slice(0, 8);
                const { data: openTasks, error: tasksFetchErr } = await supabaseAdmin
                    .from('admin_tasks')
                    .select('id, title, description')
                    .neq('status', 'completed');
                if (tasksFetchErr) throw tasksFetchErr;

                const matchingTaskIds = (openTasks || [])
                    .filter((t: any) => {
                        const text = `${t.title || ''} ${t.description || ''}`;
                        return text.includes(seqStr) || text.includes(ordId.slice(0, 8));
                    })
                    .map((t: any) => t.id);

                if (matchingTaskIds.length > 0) {
                    const { error: taskErr } = await supabaseAdmin
                        .from('admin_tasks')
                        .update({ status: 'completed' })
                        .in('id', matchingTaskIds);
                    if (taskErr) throw taskErr;
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Se asignaron precios comerciales a ${updatedItemsCount} ítem(s) en ${updatedOrdersCount} remisión(es). El acuerdo comercial del cliente se mantuvo intacto.`,
            updatedOrdersCount,
            updatedItemsCount
        });
    } catch (err: any) {
        console.error('Error assigning off-agreement commercial prices:', err);
        return NextResponse.json(
            { error: err.message || 'Error interno al asignar precios comerciales.' },
            { status: 500 }
        );
    }
}
