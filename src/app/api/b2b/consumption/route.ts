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

        return NextResponse.json({
            items: filteredItems,
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
