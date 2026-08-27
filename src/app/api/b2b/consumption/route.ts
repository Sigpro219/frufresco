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
        const includeBranches = searchParams.get('includeBranches') !== 'false';

        if (!clientId) {
            return NextResponse.json({ error: 'clientId parameter is required' }, { status: 400 });
        }

        const { data: clientProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, parent_id, is_corporate_parent, company_name, razon_social, nit')
            .eq('id', clientId)
            .single();

        const clientIds = [clientId];
        if (includeBranches) {
            if (clientProfile?.is_corporate_parent) {
                const { data: branches } = await supabaseAdmin
                    .from('profiles')
                    .select('id')
                    .eq('parent_id', clientId);
                if (branches && branches.length > 0) {
                    branches.forEach((b: any) => clientIds.push(b.id));
                }
            }
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

        // 2. Fetch all valid orders for client (or matrix group)
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
                history: [],
                topProducts: [],
                paretoProducts: [],
                kpis: { totalCop: 0, totalKg: 0, totalOrders: 0, totalSkus: 0, classACount: 0, classBCount: 0, classCCount: 0, totalSavingsCop: 0, avgPrice: 0, avgTicket: 0 },
                clientInfo: clientProfile
            });
        }

        const orderIds = ordersData.map(o => o.id);

        const { data: itemsData, error: itemsError } = await supabaseAdmin
            .from('order_items')
            .select('id, product_id, order_id, quantity, unit_price, nickname, products(id, sku, name, name_en, unit_of_measure, image_url, base_price, category)')
            .in('order_id', orderIds);

        if (itemsError) {
            console.error('Error fetching B2B order items for consumption:', itemsError);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // Filter based on timeRange
        const now = new Date();
        const daysLimit = timeRange === '30days' ? 30 : timeRange === '3months' ? 90 : timeRange === '1year' ? 365 : 99999;
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
        const avgTicket = filteredOrders.length > 0 ? (totalCop / filteredOrders.length) : 0;

        // Group history timeline for Chart
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

        // Group top products for frequent items list and Pareto calculation
        const productMap: Record<string, {
            id: string,
            sku: string,
            name: string,
            image: string,
            unit: string,
            category: string,
            totalQuantity: number,
            totalRevenue: number,
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
                    sku: p?.sku || '',
                    name: p?.name || it.nickname || 'Producto Insumo',
                    image: p?.image_url || '',
                    unit: p?.unit_of_measure || 'Kg',
                    category: p?.category || 'General',
                    totalQuantity: 0,
                    totalRevenue: 0,
                    ordersCount: 0,
                    orderIds: new Set<string>(),
                    product: p || { id: pId, sku: p?.sku || '', name: it.nickname || 'Producto Insumo', unit_of_measure: 'Kg' }
                };
            }

            const qty = Number(it.quantity || 0);
            const uPrice = Number(it.unit_price || 0);
            productMap[pId].totalQuantity += qty;
            productMap[pId].totalRevenue += qty * uPrice;
            productMap[pId].orderIds.add(it.order_id);
        });

        // Sort descending by totalRevenue (or totalQuantity)
        const sortedProducts = Object.values(productMap).map(p => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            image: p.image,
            unit: p.unit,
            category: p.category,
            totalQuantity: p.totalQuantity,
            totalRevenue: p.totalRevenue,
            avgUnitPrice: p.totalQuantity > 0 ? (p.totalRevenue / p.totalQuantity) : 0,
            ordersCount: p.orderIds.size,
            product: p.product
        })).sort((a, b) => b.totalRevenue - a.totalRevenue || b.totalQuantity - a.totalQuantity);

        let runningRevenue = 0;
        let runningQuantity = 0;

        const paretoProducts = sortedProducts.map(p => {
            runningRevenue += p.totalRevenue;
            runningQuantity += p.totalQuantity;

            const shareRevenuePct = totalCop > 0 ? (p.totalRevenue / totalCop) * 100 : 0;
            const cumulativeRevenuePct = totalCop > 0 ? (runningRevenue / totalCop) * 100 : 0;
            const shareQtyPct = totalKg > 0 ? (p.totalQuantity / totalKg) * 100 : 0;
            const cumulativeQtyPct = totalKg > 0 ? (runningQuantity / totalKg) * 100 : 0;

            // Pareto 80/20 ABC Classification:
            // Clase A: Representa hasta el 80% del valor total (los más críticos)
            // Clase B: Siguiente 15% (hasta el 95%)
            // Clase C: Último 5% (cola larga)
            let paretoClass: 'A' | 'B' | 'C' = 'C';
            if (cumulativeRevenuePct <= 80 || shareRevenuePct >= 80) {
                paretoClass = 'A';
            } else if (cumulativeRevenuePct <= 95) {
                paretoClass = 'B';
            }

            return {
                ...p,
                shareRevenuePct,
                cumulativeRevenuePct,
                shareQtyPct,
                cumulativeQtyPct,
                paretoClass
            };
        });

        const classACount = paretoProducts.filter(p => p.paretoClass === 'A').length;
        const classBCount = paretoProducts.filter(p => p.paretoClass === 'B').length;
        const classCCount = paretoProducts.filter(p => p.paretoClass === 'C').length;

        return NextResponse.json({
            items: filteredItems,
            history,
            topProducts: sortedProducts,
            paretoProducts,
            kpis: {
                totalCop,
                totalKg,
                totalOrders: filteredOrders.length,
                totalSkus: paretoProducts.length,
                classACount,
                classBCount,
                classCCount,
                totalSavingsCop,
                avgPrice,
                avgTicket
            },
            clientInfo: clientProfile
        });
    } catch (err: any) {
        console.error('B2B Consumption API exception:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
