import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clientId = searchParams.get('clientId');
        const timeRange = searchParams.get('timeRange') || 'all';

        if (!clientId) {
            return NextResponse.json({ error: 'clientId parameter is required' }, { status: 400 });
        }

        const { data: clientProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, parent_id')
            .eq('id', clientId)
            .single();

        const clientIds = [clientId];
        if (clientProfile?.parent_id) {
            clientIds.push(clientProfile.parent_id);
        }

        // 1. Fetch Agreements to get agreement prices & base prices
        const { data: quoteAgreements } = await supabaseAdmin
            .from('quotes')
            .select(`
                id,
                quote_items(
                    product_id,
                    unit_price,
                    products(id, base_price)
                )
            `)
            .in('client_id', clientIds)
            .eq('status', 'agreement');

        const agreementMap: Record<string, number> = {};
        const basePriceMap: Record<string, number> = {};

        if (quoteAgreements && quoteAgreements.length > 0) {
            quoteAgreements.forEach((q: any) => {
                q.quote_items?.forEach((qi: any) => {
                    if (qi.product_id) {
                        if (qi.unit_price) agreementMap[qi.product_id] = Number(qi.unit_price);
                        const p = Array.isArray(qi.products) ? qi.products[0] : qi.products;
                        if (p?.base_price) basePriceMap[qi.product_id] = Number(p.base_price);
                    }
                });
            });
        }

        // 2. Fetch all valid orders for client
        const { data: ordersData, error: ordersError } = await supabaseAdmin
            .from('orders')
            .select('id, created_at, delivery_date, total, subtotal, status, profile_id')
            .in('profile_id', clientIds)
            .neq('status', 'draft')
            .neq('status', 'cancelled')
            .order('delivery_date', { ascending: true });

        if (ordersError) {
            console.error('Error fetching B2B orders for consumption:', ordersError);
            return NextResponse.json({ error: ordersError.message }, { status: 500 });
        }

        if (!ordersData || ordersData.length === 0) {
            return NextResponse.json({
                items: [],
                kpis: { totalCop: 0, totalKg: 0, totalSavingsCop: 0, avgPrice: 0 }
            });
        }

        const orderIds = ordersData.map(o => o.id);

        const { data: itemsData, error: itemsError } = await supabaseAdmin
            .from('order_items')
            .select('id, product_id, order_id, quantity, unit_price, nickname, products(id, name, name_en, unit_of_measure, image_url, base_price, category)')
            .in('order_id', orderIds);

        if (itemsError) {
            console.error('Error fetching B2B order items for consumption:', itemsError);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // Filter based on timeRange
        const now = new Date();
        const daysLimit = timeRange === '30days' ? 30 : timeRange === '3months' ? 90 : 99999;
        const cutoffDate = new Date(now.getTime() - daysLimit * 24 * 60 * 60 * 1000);

        const filteredOrders = ordersData.filter(o => {
            if (timeRange === 'all') return true;
            const dateVal = new Date(o.delivery_date || o.created_at);
            return dateVal >= cutoffDate;
        });

        const filteredOrderIds = new Set(filteredOrders.map(o => o.id));
        const filteredItems = (itemsData || []).filter(item => filteredOrderIds.has(item.order_id));

        let totalCop = 0;
        let totalKg = 0;
        let totalSavingsCop = 0;

        filteredOrders.forEach(o => {
            const orderItems = filteredItems.filter(it => it.order_id === o.id);
            let itemsSum = 0;
            orderItems.forEach(it => {
                const qty = Number(it.quantity || 0);
                const p = Array.isArray(it.products) ? it.products[0] : it.products;
                const pId = it.product_id || p?.id;
                const unitPrice = Number(it.unit_price || 0);
                itemsSum += qty * unitPrice;
                totalKg += qty;

                if (pId && (agreementMap[pId] || basePriceMap[pId] || p?.base_price)) {
                    const baseP = basePriceMap[pId] || Number(p?.base_price || unitPrice * 1.15);
                    if (baseP > unitPrice) {
                        totalSavingsCop += qty * (baseP - unitPrice);
                    }
                }
            });
            totalCop += (o.total ? Number(o.total) : itemsSum);
        });

        const avgPrice = totalKg > 0 ? (totalCop / totalKg) : 0;

        // Group history timeline for SVG Chart
        const historyMap: Record<string, { date: string, rawDate: string, cop: number, kg: number }> = {};

        filteredOrders.forEach(o => {
            const dateStr = (o.delivery_date || o.created_at || '').substring(0, 10);
            if (!dateStr) return;

            const parts = dateStr.split('-');
            let formattedDate = dateStr;
            if (parts.length === 3) {
                const day = parts[2];
                const monthNum = parseInt(parts[1], 10) - 1;
                const monthsShort = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
                formattedDate = `${day} ${monthsShort[monthNum] || ''}`;
            }

            if (!historyMap[dateStr]) {
                historyMap[dateStr] = { date: formattedDate, rawDate: dateStr, cop: 0, kg: 0 };
            }

            const orderItems = filteredItems.filter(it => it.order_id === o.id);
            let itemsSum = 0;
            orderItems.forEach(it => {
                const qty = Number(it.quantity || 0);
                const uPrice = Number(it.unit_price || 0);
                itemsSum += qty * uPrice;
                historyMap[dateStr].kg += qty;
            });

            const orderTotal = o.total ? Number(o.total) : itemsSum;
            historyMap[dateStr].cop += orderTotal;
        });

        const history = Object.values(historyMap).sort((a, b) => a.rawDate.localeCompare(b.rawDate));

        // Group top products for frequent items list
        const productMap: Record<string, {
            id: string,
            name: string,
            image: string,
            unit: string,
            totalQuantity: number,
            ordersCount: number,
            orderIds: Set<string>,
            product: any
        }> = {};

        filteredItems.forEach(it => {
            const p = Array.isArray(it.products) ? it.products[0] : it.products;
            const pId = it.product_id || p?.id;
            if (!pId) return;

            if (!productMap[pId]) {
                productMap[pId] = {
                    id: pId,
                    name: p?.name || it.nickname || 'Producto Insumo',
                    image: p?.image_url || '',
                    unit: p?.unit_of_measure || 'Kg',
                    totalQuantity: 0,
                    ordersCount: 0,
                    orderIds: new Set<string>(),
                    product: p || { id: pId, name: it.nickname || 'Producto Insumo', unit_of_measure: 'Kg' }
                };
            }

            productMap[pId].totalQuantity += Number(it.quantity || 0);
            productMap[pId].orderIds.add(it.order_id);
        });

        const topProducts = Object.values(productMap).map(p => ({
            id: p.id,
            name: p.name,
            image: p.image,
            unit: p.unit,
            totalQuantity: p.totalQuantity,
            ordersCount: p.orderIds.size,
            product: p.product
        })).sort((a, b) => b.totalQuantity - a.totalQuantity);

        return NextResponse.json({
            items: filteredItems,
            history,
            topProducts,
            kpis: {
                totalCop,
                totalKg,
                totalSavingsCop,
                avgPrice
            }
        });
    } catch (err: any) {
        console.error('B2B Consumption API exception:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
