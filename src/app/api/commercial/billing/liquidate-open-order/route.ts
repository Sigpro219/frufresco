import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';

export const dynamic = 'force-dynamic';

/**
 * ⚡ Endpoint: Liquidación de Precios a Costo Vigente para Pedidos sobre Lista Abierta a Consumo ($0 COP)
 * Recibe: { orderIds: string[] } | { orderId: string }
 * Actualiza los ítems con unit_price === 0 al costo activo de commercial_cost_matrix (o modelo General Institucional)
 * y recalcula subtotal, impuestos y total de las órdenes.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const orderIds: string[] = body.orderIds || (body.orderId ? [body.orderId] : []);

        if (!orderIds || orderIds.length === 0) {
            return NextResponse.json({ error: 'Debes proporcionar al menos un ID de pedido para liquidar.' }, { status: 400 });
        }

        const supabaseAdmin = createAdminClient();

        // 1. Cargar matriz de costos comerciales activa
        const { data: costMatrixData } = await supabaseAdmin
            .from('commercial_cost_matrix')
            .select('product_id, manual_cost')
            .eq('is_active', true);

        const costMap: Record<string, number> = {};
        (costMatrixData || []).forEach(r => {
            if (r.manual_cost !== null && Number(r.manual_cost) > 0) {
                costMap[r.product_id] = Number(r.manual_cost);
            }
        });

        // 2. Cargar precios del modelo general institucional como fallback secundario
        const { data: genPricesData } = await supabaseAdmin
            .from('pricing_model_prices')
            .select('product_id, price')
            .eq('model_id', GENERAL_INSTITUCIONAL_ID);

        const genPricesMap: Record<string, number> = {};
        (genPricesData || []).forEach(r => {
            if (r.price !== null && Number(r.price) > 0) {
                genPricesMap[r.product_id] = Number(r.price);
            }
        });

        let totalUpdatedOrders = 0;
        let totalUpdatedItems = 0;

        for (const orderId of orderIds) {
            // Cargar order_items con datos de producto
            const { data: items, error: itemsErr } = await supabaseAdmin
                .from('order_items')
                .select('id, product_id, quantity, unit_price, products:product_id (id, name, iva_rate)')
                .eq('order_id', orderId);

            if (itemsErr || !items || items.length === 0) {
                continue;
            }

            let orderSubtotal = 0;
            let orderTax = 0;
            let orderModified = false;

            for (const item of items) {
                const prod = (item.products as any) || {};
                let currentPrice = Number(item.unit_price) || 0;
                const qty = Number(item.quantity) || 0;
                const ivaRate = Number(prod.iva_rate) || 0;

                // Si el ítem tiene precio 0, liquidar al costo base o precio vigente
                if (currentPrice === 0 && item.product_id) {
                    const activeCost = costMap[item.product_id] || genPricesMap[item.product_id] || 0;
                    if (activeCost > 0) {
                        currentPrice = activeCost;
                        // Actualizar order_item en BD
                        await supabaseAdmin
                            .from('order_items')
                            .update({ unit_price: currentPrice })
                            .eq('id', item.id);

                        orderModified = true;
                        totalUpdatedItems++;
                    }
                }

                const lineSubtotal = currentPrice * qty;
                const lineTax = lineSubtotal * (ivaRate / 100);
                orderSubtotal += lineSubtotal;
                orderTax += lineTax;
            }

            if (orderModified) {
                const orderTotal = orderSubtotal + orderTax;
                const nowStr = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                
                // Actualizar totales de la orden
                const { data: currentOrder } = await supabaseAdmin
                    .from('orders')
                    .select('admin_notes')
                    .eq('id', orderId)
                    .single();

                let updatedNotes = currentOrder?.admin_notes || '';
                const liquidationTag = `[LIQUIDADO A COSTO VIGENTE: ${nowStr}]`;
                if (!updatedNotes.includes(liquidationTag)) {
                    updatedNotes = `${liquidationTag}\n${updatedNotes}`.trim();
                }

                await supabaseAdmin
                    .from('orders')
                    .update({
                        subtotal: orderSubtotal,
                        tax: orderTax,
                        total: orderTotal,
                        admin_notes: updatedNotes
                    })
                    .eq('id', orderId);

                totalUpdatedOrders++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Liquidación completada: ${totalUpdatedOrders} pedido(s) y ${totalUpdatedItems} ítem(s) actualizados a costo vigente.`,
            updatedOrdersCount: totalUpdatedOrders,
            updatedItemsCount: totalUpdatedItems
        });
    } catch (err: any) {
        console.error('Error liquidating open orders:', err);
        return NextResponse.json({ error: err.message || 'Error interno al liquidar pedidos.' }, { status: 500 });
    }
}
