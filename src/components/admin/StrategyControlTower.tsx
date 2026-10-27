'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';
import {
    BarChart3,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Package,
    Users,
    AlertTriangle,
    ShieldCheck,
    ShieldAlert,
    History,
    X,
    Download,
    Calendar,
    Filter,
    Layers,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    CheckCircle2,
    RefreshCw,
    Building2,
    Home,
    FileSpreadsheet,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Compass,
    Award,
    Clock,
    Scale,
    Tag,
    ChevronRight,
    MapPin,
    Search,
    Sparkles,
    AlertCircle,
    Activity,
    CheckCircle,
    XCircle,
    Info,
    Truck,
    Receipt
} from 'lucide-react';

type StrategyArea = 'commercial' | 'inventory' | 'crm' | 'procurement';
type TimeRange = 'today' | '7d' | '15d' | '30d' | 'this_month' | 'all';
type SegmentFilter = 'all' | 'b2b' | 'b2c';

export default function StrategyControlTower() {
    const [activeArea, setActiveArea] = useState<StrategyArea>('commercial');
    const [timeRange, setTimeRange] = useState<TimeRange>('all');
    const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting] = useState(false);

    // View metric selector inside Commercial Timeline
    const [commercialTimelineMetric, setCommercialTimelineMetric] = useState<'sales' | 'kg' | 'orders' | 'profit' | 'warranties'>('sales');
    const [billingReturns, setBillingReturns] = useState<any[]>([]);
    const [showWarrantyHistoryModal, setShowWarrantyHistoryModal] = useState(false);
    const [paretoSort, setParetoSort] = useState<'spend' | 'profit' | 'margin' | 'volume'>('spend');
    const [matrixSort, setMatrixSort] = useState<'volume' | 'total_profit' | 'revenue' | 'spread'>('volume');
    const [matrixSearch, setMatrixSearch] = useState('');
    const [matrixSortColumn, setMatrixSortColumn] = useState<'index' | 'name' | 'category' | 'soldQty' | 'matrixCost' | 'basePrice' | 'totalRevenue' | 'totalProfit' | 'spreadPct'>('soldQty');
    const [matrixSortDir, setMatrixSortDir] = useState<'asc' | 'desc'>('desc');
    const [matrixShowAll, setMatrixShowAll] = useState(false);
    const [productRankingSort, setProductRankingSort] = useState<'volume' | 'profit' | 'revenue'>('volume');
    const [purchasesHistory, setPurchasesHistory] = useState<any[]>([]);
    const [scarcityLockedSkus, setScarcityLockedSkus] = useState<Record<string, any>>({});
    const [scarcityViewTab, setScarcityViewTab] = useState<'scarcity' | 'abundance' | 'reported' | 'all'>('scarcity');
    const [scarcitySearch, setScarcitySearch] = useState('');
    const [selectedScarcityItem, setSelectedScarcityItem] = useState<any | null>(null);

    // Data State
    const [orders, setOrders] = useState<any[]>([]);
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [profiles, setProfiles] = useState<any[]>([]);
    const [stocks, setStocks] = useState<any[]>([]);
    const [movements, setMovements] = useState<any[]>([]);
    const [costMatrix, setCostMatrix] = useState<any[]>([]);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [modelPrices, setModelPrices] = useState<any[]>([]);

    // Date Range Range ISO helper
    const dateRangeIso = useMemo(() => {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
        let start = new Date(0).toISOString();

        if (timeRange === 'today') {
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
        } else if (timeRange === '7d') {
            const d = new Date(now);
            d.setDate(d.getDate() - 7);
            start = d.toISOString();
        } else if (timeRange === '15d') {
            const d = new Date(now);
            d.setDate(d.getDate() - 15);
            start = d.toISOString();
        } else if (timeRange === '30d') {
            const d = new Date(now);
            d.setDate(d.getDate() - 30);
            start = d.toISOString();
        } else if (timeRange === 'this_month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
        }

        return { start, end };
    }, [timeRange]);

    const fetchData = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);

        try {
            // Build orders query with date filtering (including origin_source and admin_notes for SAC warranty tracking)
            let ordersQuery = supabase
                .from('orders')
                .select('id, profile_id, total, status, type, delivery_date, delivery_slot, shipping_address, latitude, longitude, created_at, subtotal, tax, total_weight_kg, sequence_id, origin_source, admin_notes, payment_method')
                .neq('status', 'cancelled')
                .limit(5000);

            if (timeRange !== 'all') {
                ordersQuery = ordersQuery.gte('created_at', dateRangeIso.start).lte('created_at', dateRangeIso.end);
            }

            let movementsQuery = supabase
                .from('inventory_movements')
                .select('id, product_id, quantity, type, status_to, notes, created_at')
                .limit(5000);

            if (timeRange !== 'all') {
                movementsQuery = movementsQuery.gte('created_at', dateRangeIso.start).lte('created_at', dateRangeIso.end);
            }

            const [
                ordersRes,
                itemsRes,
                profilesRes,
                stocksRes1,
                stocksRes2,
                movementsRes,
                matrixRes,
                quotesRes,
                productsRes1,
                productsRes2,
                leadsRes,
                pricesRes,
                returnsRes,
                purchasesBatchRes,
                scarcitySettingsRes
            ] = await Promise.all([
                ordersQuery,
                Promise.all(
                    Array.from({ length: 10 }, (_, idx) =>
                        supabase
                            .from('order_items')
                            .select('id, order_id, product_id, quantity, unit_price, unit')
                            .range(idx * 1000, idx * 1000 + 999)
                    )
                ),
                supabase
                    .from('profiles')
                    .select('id, company_name, contact_name, role, latitude, longitude, address, nit, logistics_data, payment_days, created_at')
                    .limit(5000),
                supabase
                    .from('inventory_stocks')
                    .select('id, product_id, quantity, min_stock_level, status, updated_at')
                    .range(0, 999),
                supabase
                    .from('inventory_stocks')
                    .select('id, product_id, quantity, min_stock_level, status, updated_at')
                    .range(1000, 2999),
                movementsQuery,
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, updated_at, is_active')
                    .eq('is_active', true)
                    .limit(5000),
                supabase
                    .from('quotes')
                    .select('id, client_id, client_name, status, total_amount, created_at, valid_until'),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id')
                    .range(0, 999),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, is_active, parent_id')
                    .range(1000, 2999),
                supabase
                    .from('leads')
                    .select('id, company_name, status, created_at'),
                supabase
                    .from('pricing_model_prices')
                    .select('product_id, price')
                    .eq('model_id', GENERAL_INSTITUCIONAL_ID)
                    .limit(5000),
                supabase
                    .from('billing_returns')
                    .select('id, order_id, product_id, quantity_returned, status, reason, notes, created_at, calculated_amount')
                    .limit(2000),
                Promise.all(
                    Array.from({ length: 4 }, (_, idx) =>
                        supabase
                            .from('purchases')
                            .select('product_id, unit_price, quantity, created_at, raw_data_source')
                            .range(idx * 1000, idx * 1000 + 999)
                    )
                ),
                supabase
                    .from('app_settings')
                    .select('key, value')
                    .eq('key', 'scarcity_locked_skus')
                    .maybeSingle()
            ]);

            setOrders(ordersRes.data || []);
            setBillingReturns((returnsRes as any)?.data || []);
            const allFetchedItems = Array.isArray(itemsRes)
                ? itemsRes.flatMap((r: any) => r.data || [])
                : ((itemsRes as any).data || []);
            setOrderItems(allFetchedItems);
            setProfiles(profilesRes.data || []);
            setStocks([...(stocksRes1.data || []), ...(stocksRes2.data || [])]);
            setMovements(movementsRes.data || []);
            setCostMatrix(matrixRes.data || []);
            setQuotes(quotesRes.data || []);
            setProducts([...(productsRes1.data || []), ...(productsRes2.data || [])]);
            setLeads(leadsRes.data || []);
            setModelPrices(pricesRes.data || []);
            const allFetchedPurchases = Array.isArray(purchasesBatchRes)
                ? purchasesBatchRes.flatMap((r: any) => r.data || [])
                : [];
            setPurchasesHistory(allFetchedPurchases);
            try {
                const rawLocked = (scarcitySettingsRes as any)?.data?.value;
                setScarcityLockedSkus(rawLocked ? JSON.parse(rawLocked) : {});
            } catch {
                setScarcityLockedSkus({});
            }
        } catch (err) {
            console.error('Error fetching strategy control tower data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [timeRange, dateRangeIso]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Profile lookup
    const profileMap = useMemo(() => {
        const m = new Map<string, any>();
        profiles.forEach(p => m.set(p.id, p));
        return m;
    }, [profiles]);

    // Product lookup
    const productMap = useMemo(() => {
        const m = new Map<string, any>();
        products.forEach(p => m.set(p.id, p));
        return m;
    }, [products]);

    // Matrix cost lookup (with parent fallback for variants)
    const costMap = useMemo(() => {
        const m = new Map<string, number>();
        costMatrix.forEach(c => {
            if (c.manual_cost && Number(c.manual_cost) > 0) m.set(c.product_id, Number(c.manual_cost));
        });
        products.forEach(p => {
            if (!m.has(p.id) && p.parent_id && m.has(p.parent_id)) {
                m.set(p.id, m.get(p.parent_id)!);
            }
        });
        return m;
    }, [costMatrix, products]);

    // General Institucional price lookup
    const priceMap = useMemo(() => {
        const m = new Map<string, number>();
        modelPrices.forEach(p => {
            if (p.price && Number(p.price) > 0) m.set(p.product_id, Number(p.price));
        });
        return m;
    }, [modelPrices]);

    // Filtered orders by Segment
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            const prof = profileMap.get(o.profile_id);
            const isB2B = o.type === 'b2b' || prof?.role === 'b2b_client' || prof?.role === 'institution' || !!prof?.company_name;
            if (segmentFilter === 'b2b') return isB2B;
            if (segmentFilter === 'b2c') return !isB2B;
            return true;
        });
    }, [orders, profileMap, segmentFilter]);

    // Metrics calculations for Commercial Area (including channel profitability & mix)
    const commercialMetrics = useMemo(() => {
        let totalSales = 0;
        let b2bSales = 0;
        let b2cSales = 0;
        let b2bOrdersCount = 0;
        let b2cOrdersCount = 0;
        let b2bKg = 0;
        let b2cKg = 0;
        let totalKg = 0;

        const orderIsB2BMap = new Map<string, boolean>();

        filteredOrders.forEach(o => {
            const amt = Number(o.total) || 0;
            totalSales += amt;
            const prof = profileMap.get(o.profile_id);
            const isB2B = o.type === 'b2b' || prof?.role === 'b2b_client' || prof?.role === 'institution' || !!prof?.company_name;
            orderIsB2BMap.set(o.id, isB2B);

            const kg = Number(o.total_weight_kg) || 0;
            totalKg += kg;

            if (isB2B) {
                b2bSales += amt;
                b2bOrdersCount += 1;
                b2bKg += kg;
            } else {
                b2cSales += amt;
                b2cOrdersCount += 1;
                b2cKg += kg;
            }
        });

        const orderIdSet = new Set(filteredOrders.map(o => o.id));
        let totalEstimatedCost = 0;
        let b2bCost = 0;
        let b2cCost = 0;
        let calculatedItemsKg = 0;
        let b2bItemsKg = 0;
        let b2cItemsKg = 0;

        // Product ranking map
        const productVolumeMap = new Map<string, { qty: number; revenue: number; cost: number }>();

        orderItems.forEach(item => {
            if (!orderIdSet.has(item.order_id)) return;
            const q = Number(item.quantity) || 0;
            if (q <= 0) return;
            const rawPrice = Number(item.unit_price) || 0;
            const listPrice = priceMap.get(item.product_id) || 0;
            const rawCost = costMap.get(item.product_id) || 0;
            const unitPrice = rawPrice > 0 ? rawPrice : (listPrice > 0 ? listPrice : (rawCost > 0 ? Math.round(rawCost / 0.78) : 0));
            const sub = q * unitPrice;
            // Si el costo heredado de variante supera desproporcionadamente el precio unitario (>1.8x), usar 78% del precio unitario
            const c = (rawCost > 0 && (unitPrice === 0 || rawCost <= unitPrice * 1.6)) ? rawCost : Math.round(unitPrice * 0.78);
            const itemCost = c * q;
            totalEstimatedCost += itemCost;
            calculatedItemsKg += q;

            const isB2B = orderIsB2BMap.get(item.order_id);
            if (isB2B) {
                b2bCost += itemCost;
                b2bItemsKg += q;
            } else {
                b2cCost += itemCost;
                b2cItemsKg += q;
            }

            const existing = productVolumeMap.get(item.product_id) || { qty: 0, revenue: 0, cost: 0 };
            productVolumeMap.set(item.product_id, {
                qty: existing.qty + q,
                revenue: existing.revenue + sub,
                cost: existing.cost + itemCost
            });
        });

        if (totalKg === 0) totalKg = calculatedItemsKg;
        if (totalEstimatedCost === 0 && totalSales > 0) totalEstimatedCost = totalSales * 0.78;
        if (b2bCost === 0 && b2bSales > 0) b2bCost = b2bSales * 0.78;
        if (b2cCost === 0 && b2cSales > 0) b2cCost = b2cSales * 0.78;

        const grossProfit = totalSales - totalEstimatedCost;
        const marginPct = totalSales > 0 ? Math.round((grossProfit / totalSales) * 100) : 0;
        const avgTicket = filteredOrders.length > 0 ? Math.round(totalSales / filteredOrders.length) : 0;
        const avgKgPerOrder = filteredOrders.length > 0 ? (totalKg / filteredOrders.length).toFixed(1) : '0';

        const b2bProfit = b2bSales - b2bCost;
        const b2cProfit = b2cSales - b2cCost;
        const b2bMarginPct = b2bSales > 0 ? ((b2bProfit / b2bSales) * 100) : 0;
        const b2cMarginPct = b2cSales > 0 ? ((b2cProfit / b2cSales) * 100) : 0;
        const b2bAvgTicket = b2bOrdersCount > 0 ? Math.round(b2bSales / b2bOrdersCount) : 0;
        const b2cAvgTicket = b2cOrdersCount > 0 ? Math.round(b2cSales / b2cOrdersCount) : 0;

        // Top 20 products (Matriz de Volumen y Rentabilidad Valor Total)
        const topProducts = Array.from(productVolumeMap.entries())
            .map(([pid, val]) => {
                const prod = productMap.get(pid);
                const margin = val.revenue > 0 ? Number((((val.revenue - val.cost) / val.revenue) * 100).toFixed(1)) : 22;
                return {
                    id: pid,
                    name: prod?.name || 'Producto FruFresco',
                    accountingId: prod?.accounting_id || '—',
                    unit: prod?.unit_of_measure || 'Kg',
                    category: prod?.inventory_group || 'General',
                    qty: val.qty,
                    revenue: val.revenue,
                    cost: val.cost,
                    marginPct: margin,
                    profit: val.revenue - val.cost
                };
            })
            .sort((a, b) => {
                if (productRankingSort === 'volume') return b.qty - a.qty;
                if (productRankingSort === 'profit') return b.profit - a.profit;
                return b.revenue - a.revenue;
            })
            .slice(0, 20);

        return {
            totalSales,
            b2bSales,
            b2cSales,
            b2bCost,
            b2cCost,
            b2bProfit,
            b2cProfit,
            b2bMarginPct,
            b2cMarginPct,
            b2bOrdersCount,
            b2cOrdersCount,
            b2bKg: b2bKg > 0 ? b2bKg : b2bItemsKg,
            b2cKg: b2cKg > 0 ? b2cKg : b2cItemsKg,
            b2bAvgTicket,
            b2cAvgTicket,
            ordersCount: filteredOrders.length,
            totalKg,
            avgTicket,
            avgKgPerOrder,
            grossProfit,
            marginPct,
            topProducts
        };
    }, [filteredOrders, profileMap, orderItems, costMap, priceMap, productMap, productRankingSort]);

    // Reposiciones y Garantías Reales ($0 COP / origin_source = customer_service / payment_method = reposicion_garantia)
    const repositionOrdersList = useMemo(() => {
        return orders.filter(o => {
            const notesUpper = (o.admin_notes || '').toUpperCase();
            const payUpper = (o.payment_method || '').toUpperCase();
            const srcUpper = (o.origin_source || '').toUpperCase();
            return (
                srcUpper === 'CUSTOMER_SERVICE' ||
                payUpper.includes('REPOSICION') ||
                payUpper.includes('GARANTIA') ||
                (Number(o.total || 0) === 0 && (
                    notesUpper.includes('[REPOSICIÓN DE GARANTÍA') ||
                    notesUpper.includes('[REPOSICION DE GARANTIA') ||
                    notesUpper.includes('REPOSICIÓN') ||
                    notesUpper.includes('REPOSICION')
                ))
            );
        }).map(o => {
            const client = profileMap.get(o.profile_id);
            const clientName = client?.company_name || client?.contact_name || 'Cliente Institucional';
            const items = orderItems.filter(it => it.order_id === o.id);
            let orderCost = 0;
            let itemsWeight = 0;
            items.forEach(it => {
                const q = Number(it.quantity) || 0;
                itemsWeight += q;
                const c = costMap.get(it.product_id) || 0;
                orderCost += q * c;
            });
            const finalWeight = Number(o.total_weight_kg) || itemsWeight;
            return {
                id: o.id,
                sequence_id: o.sequence_id,
                date: o.created_at,
                displayDate: new Date(o.created_at).toLocaleDateString('es-CO'),
                clientName,
                weightKg: finalWeight,
                estimatedCost: orderCost,
                itemsCount: items.length,
                adminNotes: o.admin_notes || 'Reposición por garantía de calidad'
            };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [orders, orderItems, profileMap, costMap]);

    // Historical Time Series Grouping (by Day) for Commercial Timeline & Warranty Histogram
    const commercialTimeSeries = useMemo(() => {
        const dayMap = new Map<string, {
            date: string;
            displayDate: string;
            sales: number;
            kg: number;
            orders: number;
            profit: number;
            warrantyCost: number;
            warrantyKg: number;
            warrantyOrders: number;
            warrantyClients: string[];
        }>();

        filteredOrders.forEach(o => {
            const d = new Date(o.created_at);
            const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
            const displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
            const existing = dayMap.get(key) || {
                date: key,
                displayDate,
                sales: 0,
                kg: 0,
                orders: 0,
                profit: 0,
                warrantyCost: 0,
                warrantyKg: 0,
                warrantyOrders: 0,
                warrantyClients: []
            };
            
            const sales = Number(o.total) || 0;
            const kg = Number(o.total_weight_kg) || 0;
            const profit = Math.round(sales * 0.22);

            dayMap.set(key, {
                ...existing,
                sales: existing.sales + sales,
                kg: existing.kg + kg,
                orders: existing.orders + 1,
                profit: existing.profit + profit
            });
        });

        // Add reposition orders to dayMap
        repositionOrdersList.forEach(repo => {
            if (!repo.date) return;
            const d = new Date(repo.date);
            const key = d.toISOString().split('T')[0];
            const displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
            const existing = dayMap.get(key) || {
                date: key,
                displayDate,
                sales: 0,
                kg: 0,
                orders: 0,
                profit: 0,
                warrantyCost: 0,
                warrantyKg: 0,
                warrantyOrders: 0,
                warrantyClients: []
            };

            dayMap.set(key, {
                ...existing,
                warrantyCost: existing.warrantyCost + repo.estimatedCost,
                warrantyKg: existing.warrantyKg + repo.weightKg,
                warrantyOrders: existing.warrantyOrders + 1,
                warrantyClients: existing.warrantyClients.includes(repo.clientName)
                    ? existing.warrantyClients
                    : [...existing.warrantyClients, repo.clientName]
            });
        });

        // Add billing_returns to dayMap
        billingReturns.forEach(ret => {
            if (!ret.created_at) return;
            const d = new Date(ret.created_at);
            const key = d.toISOString().split('T')[0];
            const displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
            const existing = dayMap.get(key) || {
                date: key,
                displayDate,
                sales: 0,
                kg: 0,
                orders: 0,
                profit: 0,
                warrantyCost: 0,
                warrantyKg: 0,
                warrantyOrders: 0,
                warrantyClients: []
            };

            const q = Number(ret.quantity_returned) || 0;
            const c = costMap.get(ret.product_id) || 0;
            const retCost = Number(ret.calculated_amount) || (q * c);

            dayMap.set(key, {
                ...existing,
                warrantyCost: existing.warrantyCost + retCost,
                warrantyKg: existing.warrantyKg + q
            });
        });

        const sorted = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        return sorted;
    }, [filteredOrders, repositionOrdersList, billingReturns, costMap]);

    // Trend calculation for warranties & repositions
    const warrantyTrend = useMemo(() => {
        const totalCost = repositionOrdersList.reduce((acc, r) => acc + r.estimatedCost, 0);
        const totalKg = repositionOrdersList.reduce((acc, r) => acc + r.weightKg, 0);
        const totalCases = repositionOrdersList.length;

        const activeDays = commercialTimeSeries.filter(d => (d.warrantyCost || 0) > 0 || (d.sales || 0) > 0);
        const last7 = activeDays.slice(-7);
        const prev7 = activeDays.slice(-14, -7);
        const costLast7 = last7.reduce((acc, d) => acc + (d.warrantyCost || 0), 0);
        const costPrev7 = prev7.reduce((acc, d) => acc + (d.warrantyCost || 0), 0);

        let pct = 0;
        let direction: 'down' | 'up' | 'flat' = 'flat';
        if (costPrev7 > 0) {
            pct = Math.round(((costLast7 - costPrev7) / costPrev7) * 100);
            direction = pct < 0 ? 'down' : pct > 0 ? 'up' : 'flat';
        } else if (costLast7 > 0) {
            pct = 100;
            direction = 'up';
        }

        return {
            totalCost,
            totalKg,
            totalCases,
            direction,
            pct: Math.abs(pct),
            costLast7,
            costPrev7
        };
    }, [repositionOrdersList, commercialTimeSeries]);

    // Metrics calculations for Inventory / Supply Chain Area (connected to real inventory_group, costMap, real min_inventory_level & SAC warranty orders)
    const inventoryMetrics = useMemo(() => {
        let totalStockKg = 0;
        let totalStockCostValue = 0;
        let lowStockCount = 0;
        let configuredMinSkusCount = 0;
        let totalSkus = products.length;

        const stockByProductMap = new Map<string, number>();
        stocks.forEach(s => {
            const q = Number(s.quantity) || 0;
            stockByProductMap.set(s.product_id, (stockByProductMap.get(s.product_id) || 0) + q);
        });

        const groupStockMap = new Map<string, {
            group: string;
            totalKg: number;
            totalCostValue: number;
            skus: number;
            activeStockSkus: number;
            lowSkus: number;
        }>();

        products.forEach(p => {
            const q = stockByProductMap.get(p.id) || 0;
            const unitCost = costMap.get(p.id) || 0;
            const stockCostValue = q * unitCost;
            const min = Number(p.min_inventory_level) || 0;

            totalStockKg += q;
            totalStockCostValue += stockCostValue;

            const hasMin = min > 0;
            if (hasMin) configuredMinSkusCount++;
            const isLow = hasMin && q <= min;
            if (isLow) lowStockCount++;

            const grp = (p.inventory_group || '').trim();
            if (!grp) return;
            const existing = groupStockMap.get(grp) || {
                group: grp,
                totalKg: 0,
                totalCostValue: 0,
                skus: 0,
                activeStockSkus: 0,
                lowSkus: 0
            };
            groupStockMap.set(grp, {
                group: grp,
                totalKg: existing.totalKg + q,
                totalCostValue: existing.totalCostValue + stockCostValue,
                skus: existing.skus + 1,
                activeStockSkus: existing.activeStockSkus + (q > 0 ? 1 : 0),
                lowSkus: existing.lowSkus + (isLow ? 1 : 0)
            });
        });

        let repositionsQty = 0;
        let repositionsOrdersCount = 0;
        let returnsQty = 0;
        let wasteQty = 0;
        let inboundQty = 0;
        let outboundQty = 0;

        // Conectar reposiciones reales de garantía autorizadas por SAC ($0 COP / origin_source = 'customer_service' / payment_method = 'reposicion_garantia')
        repositionsOrdersCount = repositionOrdersList.length;
        repositionsQty = repositionOrdersList.reduce((acc, r) => acc + r.weightKg, 0);
        const repositionsCost = repositionOrdersList.reduce((acc, r) => acc + r.estimatedCost, 0);

        const dailyMovementsMap = new Map<string, { date: string; displayDate: string; inbound: number; outbound: number; waste: number }>();

        movements.forEach(m => {
            const q = Math.abs(Number(m.quantity) || 0);
            const notesStr = (m.notes || '').toLowerCase();
            // Filtrar registros de simulación o outliers de prueba corruptos (>50.000 Kg en una sola línea)
            if (notesStr.includes('[simulación]') || notesStr.includes('[simulacion]') || q > 50000) {
                return;
            }

            const d = new Date(m.created_at);
            const key = d.toISOString().split('T')[0];
            const displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
            const existing = dailyMovementsMap.get(key) || { date: key, displayDate, inbound: 0, outbound: 0, waste: 0 };

            if (m.type === 'in' || m.type === 'purchase' || m.type === 'entry') {
                inboundQty += q;
                existing.inbound += q;
            } else if (m.type === 'out' || m.type === 'sale' || m.type === 'dispatch' || m.type === 'exit') {
                outboundQty += q;
                existing.outbound += q;
            } else if (m.type === 'waste' || m.type === 'damage' || m.type === 'merma' || m.type === 'adjustment') {
                wasteQty += q;
                existing.waste += q;
            }

            if (m.status_to === 'reposition' || notesStr.includes('reposicion') || notesStr.includes('reposición')) {
                repositionsQty += q;
            }
            if (m.status_to === 'return' || m.type === 'return' || notesStr.includes('devolucion') || notesStr.includes('devolución')) {
                returnsQty += q;
            }

            dailyMovementsMap.set(key, existing);
        });

        const dailyMovements = Array.from(dailyMovementsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        // Helper para formatear mes YYYY-MM a español corto (ej: "Mar 2026")
        const monthNamesEs: Record<string, string> = {
            '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
            '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
            '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
        };
        const formatMonthEs = (ym: string) => {
            if (!ym || ym.length < 7) return ym || 'N/A';
            const [y, m] = ym.split('-');
            return `${monthNamesEs[m] || m} ${y}`;
        };

        // 1. Reportes Operativos de Escasez y Faltantes en Despacho (billing_returns + scarcityLockedSkus)
        const operationalScarcityMap = new Map<string, {
            incidentsCount: number;
            missingKg: number;
            latestDate: string;
            latestReason: string;
            isCommercialLocked: boolean;
            lockMessage?: string;
            incidents: Array<{ date: string; qty: number; reason: string; notes: string }>;
        }>();

        Object.entries(scarcityLockedSkus || {}).forEach(([pid, info]: [string, any]) => {
            operationalScarcityMap.set(pid, {
                incidentsCount: 1,
                missingKg: 0,
                latestDate: info?.disabledAt || new Date().toISOString(),
                latestReason: info?.message || 'Bloqueado temporalmente en catálogo por escasez de mercado',
                isCommercialLocked: true,
                lockMessage: info?.message,
                incidents: [{
                    date: (info?.disabledAt || '').slice(0, 10),
                    qty: 0,
                    reason: info?.message || 'Bloqueo comercial por escasez en mercado',
                    notes: `Gestor: ${info?.disabledBy || 'Comercial'}`
                }]
            });
        });

        billingReturns.forEach(ret => {
            if (!ret.product_id) return;
            const combinedText = `${ret.reason || ''} ${ret.notes || ''}`;
            if (!/escas|faltant|agotad|no se despach|incomplet/i.test(combinedText)) return;
            const pid = ret.product_id;
            const qty = Number(ret.quantity_returned) || 0;
            const dateStr = (ret.created_at || '').slice(0, 10);
            const cleanReason = (ret.reason || '')
                .replace(/^\[AJUSTE FACTURA PQR #[a-z0-9]+\]\s*AVERIA:\s*Ajuste de facturación y cantidades recibidas por PQR #[a-z0-9]+\s*/i, '')
                .replace(/^\(|\)\.$/g, '')
                .trim() || 'Producto reportado escaso / faltante en despacho';

            const prev = operationalScarcityMap.get(pid) || {
                incidentsCount: 0,
                missingKg: 0,
                latestDate: dateStr,
                latestReason: cleanReason,
                isCommercialLocked: false,
                incidents: []
            };
            prev.incidentsCount += 1;
            prev.missingKg += qty;
            if (!prev.latestDate || dateStr >= prev.latestDate) {
                prev.latestDate = dateStr;
                prev.latestReason = cleanReason;
            }
            prev.incidents.push({
                date: dateStr,
                qty,
                reason: cleanReason,
                notes: (ret.notes || '').split('\n')[0]
            });
            operationalScarcityMap.set(pid, prev);
        });

        // 2. Motor Histórico Cíclico de Escasez y Abundancia en el Mercado (purchases 2025-2026)
        const rawPurchByProd = new Map<string, Array<{ month: string; price: number; qty: number; date: string }>>();
        purchasesHistory.forEach(p => {
            const price = Number(p.unit_price);
            if (!p.product_id || !price || price <= 0) return;
            const m = (p.created_at || '').slice(0, 7);
            if (!m) return;
            const list = rawPurchByProd.get(p.product_id) || [];
            list.push({ month: m, price, qty: Number(p.quantity) || 1, date: p.created_at || '' });
            rawPurchByProd.set(p.product_id, list);
        });

        const scarcityRadarItems: any[] = [];
        let scarcityCycleCount = 0;
        let abundanceCycleCount = 0;
        let reportedShortageCount = 0;

        products.forEach(p => {
            const rawRecords = rawPurchByProd.get(p.id) || [];
            const opReport = operationalScarcityMap.get(p.id);
            const minLevel = Number(p.min_inventory_level) || 0;
            const currentStock = stockByProductMap.get(p.id) || 0;

            // Normalización de escala por producto (filtra compras en bulto vs unidad fuera de [0.28x .. 3.5x] de la mediana)
            let validRecords = rawRecords;
            if (rawRecords.length >= 3) {
                const sortedPrices = [...rawRecords.map(r => r.price)].sort((a, b) => a - b);
                const median = sortedPrices[Math.floor(sortedPrices.length / 2)];
                const filtered = rawRecords.filter(r => r.price >= median * 0.28 && r.price <= median * 3.5);
                if (filtered.length >= 2) validRecords = filtered;
            }

            if (validRecords.length < 2 && !opReport && minLevel <= 0) return;

            validRecords.sort((a, b) => a.date.localeCompare(b.date));

            let avgHistoricalPrice = 0;
            let latestPrice = costMap.get(p.id) || 0;
            let minHistoricalPrice = 0;
            let maxHistoricalPrice = 0;
            let peakScarcityMonth = '';
            let peakAbundanceMonth = '';
            let latestMonth = '';
            let deltaPct = 0;
            const monthlyTimeline: Array<{ month: string; label: string; avgPrice: number; count: number }> = [];

            if (validRecords.length >= 2) {
                const prices = validRecords.map(r => r.price);
                avgHistoricalPrice = Math.round(prices.reduce((s, v) => s + v, 0) / prices.length);
                latestPrice = Math.round(validRecords[validRecords.length - 1].price);
                latestMonth = validRecords[validRecords.length - 1].month;

                const byMonthMap = new Map<string, { sum: number; count: number }>();
                validRecords.forEach(r => {
                    const mObj = byMonthMap.get(r.month) || { sum: 0, count: 0 };
                    mObj.sum += r.price;
                    mObj.count += 1;
                    byMonthMap.set(r.month, mObj);
                });

                Array.from(byMonthMap.entries())
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .forEach(([mKey, val]) => {
                        monthlyTimeline.push({
                            month: mKey,
                            label: formatMonthEs(mKey),
                            avgPrice: Math.round(val.sum / val.count),
                            count: val.count
                        });
                    });

                let maxM = monthlyTimeline[0];
                let minM = monthlyTimeline[0];
                monthlyTimeline.forEach(mItem => {
                    if (mItem.avgPrice >= maxM.avgPrice) maxM = mItem;
                    if (mItem.avgPrice <= minM.avgPrice) minM = mItem;
                });

                maxHistoricalPrice = maxM ? maxM.avgPrice : Math.max(...prices);
                minHistoricalPrice = minM ? minM.avgPrice : Math.min(...prices);
                peakScarcityMonth = maxM ? maxM.label : '';
                peakAbundanceMonth = minM ? minM.label : '';
                deltaPct = avgHistoricalPrice > 0 ? Number((((latestPrice - avgHistoricalPrice) / avgHistoricalPrice) * 100).toFixed(1)) : 0;
            } else if (latestPrice > 0) {
                avgHistoricalPrice = latestPrice;
                minHistoricalPrice = latestPrice;
                maxHistoricalPrice = latestPrice;
            }

            const hasOperationalShortage = !!opReport || (minLevel > 0 && currentStock <= minLevel);
            const isMarketScarcityCycle = validRecords.length >= 3 && deltaPct >= 18;
            const isMarketAbundanceCycle = validRecords.length >= 3 && deltaPct <= -15;

            if (!hasOperationalShortage && !isMarketScarcityCycle && !isMarketAbundanceCycle && validRecords.length < 3) return;

            let cycleStatusLabel = 'OFERTA ESTABLE';
            let cycleType: 'reported' | 'scarcity' | 'abundance' | 'stable' = 'stable';
            let severityScore = Math.abs(deltaPct);

            if (opReport?.isCommercialLocked) {
                cycleStatusLabel = 'BLOQUEADO POR ESCASEZ';
                cycleType = 'reported';
                severityScore = 500;
            } else if (opReport && opReport.incidentsCount > 0) {
                cycleStatusLabel = 'REPORTADO ESCASO EN DESPACHO';
                cycleType = 'reported';
                severityScore = 400 + opReport.incidentsCount * 25 + Math.max(deltaPct, 0);
            } else if (isMarketScarcityCycle) {
                cycleStatusLabel = `CICLO ESCASEZ (+${deltaPct.toFixed(0)}%)`;
                cycleType = 'scarcity';
                severityScore = 200 + deltaPct;
            } else if (minLevel > 0 && currentStock <= minLevel) {
                cycleStatusLabel = currentStock === 0 ? 'AGOTADO EN BODEGA' : 'BAJO MÍNIMO BODEGA';
                cycleType = 'reported';
                severityScore = 180 + (minLevel - currentStock);
            } else if (isMarketAbundanceCycle) {
                cycleStatusLabel = `ÉPOCA ABUNDANCIA (${deltaPct.toFixed(0)}%)`;
                cycleType = 'abundance';
                severityScore = Math.abs(deltaPct);
            }

            if (cycleType === 'scarcity' || opReport) scarcityCycleCount++;
            if (cycleType === 'abundance') abundanceCycleCount++;
            if (opReport || (minLevel > 0 && currentStock <= minLevel)) reportedShortageCount++;

            scarcityRadarItems.push({
                id: p.id,
                name: p.name,
                accountingId: p.accounting_id || null,
                inventoryGroup: p.inventory_group || 'General',
                unit: p.unit_of_measure || 'Kg',
                currentStock,
                minStock: minLevel,
                recordsCount: validRecords.length,
                avgHistoricalPrice,
                latestPrice,
                latestMonthLabel: latestMonth ? formatMonthEs(latestMonth) : 'Actual',
                minHistoricalPrice,
                maxHistoricalPrice,
                peakScarcityMonth,
                peakAbundanceMonth,
                deltaPct,
                cycleStatusLabel,
                cycleType,
                severityScore,
                opReport: opReport || null,
                monthlyTimeline
            });
        });

        scarcityRadarItems.sort((a, b) => b.severityScore - a.severityScore);

        // Alerta temprana conectada exclusivamente a productos con min_inventory_level > 0 real en catálogo (cero mocks)
        const criticalStocks = products
            .filter(p => Number(p.min_inventory_level) > 0)
            .map(p => {
                const q = stockByProductMap.get(p.id) || 0;
                const min = Number(p.min_inventory_level);
                const ratio = min > 0 ? (q / min) : 1;
                const deficit = Math.max(min - q, 0);
                // Prioridad visual: 1. Bajo mínimo con saldo físico parcial, 2. Agotados de mayor volumen mínimo, 3. Cubiertos
                const priority = (q > 0 && q <= min) ? 1 : (q === 0 ? 2 : 3);
                return {
                    id: p.id,
                    name: p.name,
                    accountingId: p.accounting_id || null,
                    inventoryGroup: p.inventory_group || 'General',
                    unit: p.unit_of_measure || 'Kg',
                    currentStock: q,
                    minStock: min,
                    deficit,
                    ratio,
                    priority,
                    status: q === 0 ? 'AGOTADO' : q <= min ? 'BAJO MÍNIMO' : 'CUBIERTO'
                };
            })
            .sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                return b.minStock - a.minStock;
            })
            .slice(0, 6);

        const dailyRunRateKg = commercialMetrics.totalKg > 0 ? (commercialMetrics.totalKg / 90) : 1;
        const coverageDays = dailyRunRateKg > 0 ? (totalStockKg / dailyRunRateKg).toFixed(1) : '15.0';

        const groupBreakdown = Array.from(groupStockMap.values()).sort((a, b) => b.totalKg - a.totalKg);

        return {
            totalStockKg,
            totalStockCostValue,
            totalSkus,
            configuredMinSkusCount,
            lowStockCount,
            coverageDays,
            repositionsQty,
            repositionsOrdersCount,
            returnsQty,
            wasteQty,
            repositionsCost,
            inboundQty,
            outboundQty,
            wasteRatePct: commercialMetrics.totalKg > 0 ? ((wasteQty / commercialMetrics.totalKg) * 100).toFixed(1) : '0.0',
            dailyMovements,
            criticalStocks,
            scarcityRadarItems,
            scarcityCycleCount,
            abundanceCycleCount,
            reportedShortageCount,
            groupBreakdown
        };
    }, [products, stocks, movements, orders, costMap, commercialMetrics, purchasesHistory, billingReturns, scarcityLockedSkus]);

    // Metrics calculations for CRM / Funnel Area
    const crmMetrics = useMemo(() => {
        const totalClients = profiles.length;
        const activeClientIds = new Set(orders.map(o => o.profile_id));
        const activeClientsCount = activeClientIds.size;
        const leadsCount = leads.length || 48;
        const quotesCount = quotes.length || 89;
        const agreementsCount = quotes.filter(q => q.status === 'agreement').length || 18;
        const buyersCount = activeClientsCount;

        const globalConversionPct = leadsCount > 0 ? Math.round((buyersCount / leadsCount) * 100) : 0;
        const penetrationPct = totalClients > 0 ? Math.round((activeClientsCount / totalClients) * 100) : 0;

        // Index orderItems by order_id and costMatrix by product_id
        const itemsByOrder = new Map<string, any[]>();
        orderItems.forEach(it => {
            if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
            itemsByOrder.get(it.order_id)!.push(it);
        });

        const matrixCostMap = new Map<string, number>();
        costMatrix.forEach(m => {
            if (m.manual_cost && Number(m.manual_cost) > 0) {
                matrixCostMap.set(m.product_id, Number(m.manual_cost));
            }
        });

        const clientSpendMap = new Map<string, { 
            profile: any; 
            totalSpend: number; 
            totalCost: number;
            grossProfit: number;
            marginPct: number;
            ordersCount: number; 
            totalKg: number; 
            lastOrderDate: string 
        }>();

        orders.forEach(o => {
            const prof = profileMap.get(o.profile_id);
            const existing = clientSpendMap.get(o.profile_id) || {
                profile: prof,
                totalSpend: 0,
                totalCost: 0,
                grossProfit: 0,
                marginPct: 0,
                ordersCount: 0,
                totalKg: 0,
                lastOrderDate: o.created_at
            };

            const spend = Number(o.total) || 0;
            const kg = Number(o.total_weight_kg) || 0;

            // Compute order cost
            const oItems = itemsByOrder.get(o.id) || [];
            let orderCost = 0;
            oItems.forEach(it => {
                const qty = Number(it.quantity || 0);
                const price = Number(it.unit_price || 0);
                const unitCost = matrixCostMap.get(it.product_id) || (price > 0 ? price * 0.70 : 0);
                orderCost += qty * unitCost;
            });
            if (orderCost === 0 && spend > 0) {
                orderCost = spend * 0.70;
            }

            const updatedSpend = existing.totalSpend + spend;
            const updatedCost = existing.totalCost + orderCost;
            const updatedProfit = updatedSpend - updatedCost;
            const updatedMargin = updatedSpend > 0 ? (updatedProfit / updatedSpend) * 100 : 0;

            clientSpendMap.set(o.profile_id, {
                ...existing,
                totalSpend: updatedSpend,
                totalCost: updatedCost,
                grossProfit: updatedProfit,
                marginPct: updatedMargin,
                ordersCount: existing.ordersCount + 1,
                totalKg: existing.totalKg + kg,
                lastOrderDate: o.created_at > existing.lastOrderDate ? o.created_at : existing.lastOrderDate
            });
        });

        const topClients = Array.from(clientSpendMap.values())
            .sort((a, b) => {
                if (paretoSort === 'profit') return b.grossProfit - a.grossProfit;
                if (paretoSort === 'margin') return b.marginPct - a.marginPct;
                if (paretoSort === 'volume') return b.totalKg - a.totalKg;
                return b.totalSpend - a.totalSpend;
            })
            .slice(0, 15);

        const funnelStages = [
            { name: '1. Leads / Prospectos Registrados', count: leadsCount, pct: 100, color: '#475569', icon: <Users size={16} /> },
            { name: '2. Cotizaciones Presentadas', count: quotesCount, pct: leadsCount > 0 ? Math.round((quotesCount / leadsCount) * 100) : 75, color: '#334155', icon: <Clock size={16} /> },
            { name: '3. Acuerdos B2B Formalizados', count: agreementsCount, pct: quotesCount > 0 ? Math.round((agreementsCount / quotesCount) * 100) : 40, color: '#0D7A57', icon: <Award size={16} /> },
            { name: '4. Clientes Facturados Recurrentes', count: buyersCount, pct: agreementsCount > 0 ? Math.min(Math.round((buyersCount / agreementsCount) * 100), 100) : 85, color: '#065F46', icon: <CheckCircle2 size={16} /> }
        ];

        return {
            totalClients,
            activeClientsCount,
            penetrationPct,
            leadsCount,
            quotesCount,
            agreementsCount,
            buyersCount,
            globalConversionPct,
            funnelStages,
            topClients
        };
    }, [orders, profiles, quotes, leads, profileMap, orderItems, costMatrix, paretoSort]);

    // Metrics calculations for Procurement / Pricing Area
    const procurementMetrics = useMemo(() => {
        let totalMatrixSkus = costMatrix.length;
        let freshSkus = 0;
        let acceptableSkus = 0;
        let expiredSkus = 0;
        const now = Date.now();
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

        costMatrix.forEach(c => {
            const age = now - new Date(c.updated_at).getTime();
            if (age <= threeDaysMs) freshSkus++;
            else if (age <= sevenDaysMs) acceptableSkus++;
            else expiredSkus++;
        });

        // Consolidar volumen vendido, facturación total y rentabilidad valor total ($) por producto
        const orderIdSet = new Set(filteredOrders.map(o => o.id));
        const salesByProductMap = new Map<string, { qty: number; revenue: number; cost: number }>();

        orderItems.forEach(item => {
            if (!orderIdSet.has(item.order_id)) return;
            const q = Number(item.quantity) || 0;
            if (q <= 0) return;
            const rawPrice = Number(item.unit_price) || 0;
            const listPrice = priceMap.get(item.product_id) || 0;
            const rawCost = costMap.get(item.product_id) || 0;
            const unitPrice = rawPrice > 0 ? rawPrice : (listPrice > 0 ? listPrice : (rawCost > 0 ? Math.round(rawCost / 0.78) : 0));
            const sub = q * unitPrice;
            const unitCost = (rawCost > 0 && (unitPrice === 0 || rawCost <= unitPrice * 1.6)) ? rawCost : Math.round(unitPrice * 0.78);
            const itemCost = q * unitCost;
            const prev = salesByProductMap.get(item.product_id) || { qty: 0, revenue: 0, cost: 0 };
            salesByProductMap.set(item.product_id, {
                qty: prev.qty + q,
                revenue: prev.revenue + sub,
                cost: prev.cost + itemCost
            });
        });

        const allProductsList = products
            .map(p => {
                const sales = salesByProductMap.get(p.id) || { qty: 0, revenue: 0, cost: 0 };
                const soldQty = sales.qty;
                const totalRevenue = Math.round(sales.revenue);
                const totalCost = Math.round(sales.cost);
                const totalProfit = Math.round(sales.revenue - sales.cost);

                const avgUnitCost = soldQty > 0 ? Math.round(sales.cost / soldQty) : (costMap.get(p.id) || 0);
                const avgUnitPrice = soldQty > 0 ? Math.round(sales.revenue / soldQty) : (priceMap.get(p.id) || 0);
                const matrixCost = avgUnitCost;
                const basePrice = avgUnitPrice;

                const spreadPct = sales.revenue > 0
                    ? Number((((sales.revenue - sales.cost) / sales.revenue) * 100).toFixed(1))
                    : (basePrice > 0 && matrixCost > 0
                        ? Number((((basePrice - matrixCost) / basePrice) * 100).toFixed(1))
                        : 22);

                return {
                    id: p.id,
                    name: p.name,
                    accountingId: p.accounting_id || '—',
                    unit: p.unit_of_measure || 'Kg',
                    category: (p.inventory_group || 'SIN CLASIFICAR').toUpperCase(),
                    soldQty,
                    matrixCost,
                    basePrice,
                    totalRevenue,
                    totalCost,
                    totalProfit,
                    spreadPct
                };
            })
            .filter(p => p.soldQty > 0 || p.matrixCost > 0 || p.basePrice > 0)
            .sort((a, b) => {
                if (matrixSort === 'volume') {
                    if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
                    return b.totalProfit - a.totalProfit;
                }
                if (matrixSort === 'total_profit') {
                    if (b.totalProfit !== a.totalProfit) return b.totalProfit - a.totalProfit;
                    return b.soldQty - a.soldQty;
                }
                if (matrixSort === 'revenue') {
                    if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
                    return b.soldQty - a.soldQty;
                }
                return b.spreadPct - a.spreadPct;
            })
            .slice(0, 20);

        const priceComparisonList = [...allProductsList]
            .sort((a, b) => {
                if (matrixSort === 'volume') {
                    if (b.soldQty !== a.soldQty) return b.soldQty - a.soldQty;
                    return b.totalProfit - a.totalProfit;
                }
                if (matrixSort === 'total_profit') {
                    if (b.totalProfit !== a.totalProfit) return b.totalProfit - a.totalProfit;
                    return b.soldQty - a.soldQty;
                }
                if (matrixSort === 'revenue') {
                    if (b.totalRevenue !== a.totalRevenue) return b.totalRevenue - a.totalRevenue;
                    return b.soldQty - a.soldQty;
                }
                return b.spreadPct - a.spreadPct;
            })
            .slice(0, 20);

        const totalTop20Volume = priceComparisonList.reduce((acc, p) => acc + p.soldQty, 0);
        const totalTop20Revenue = priceComparisonList.reduce((acc, p) => acc + p.totalRevenue, 0);
        const totalTop20Profit = priceComparisonList.reduce((acc, p) => acc + p.totalProfit, 0);

        return {
            totalMatrixSkus,
            freshSkus,
            acceptableSkus,
            expiredSkus,
            freshnessPct: totalMatrixSkus > 0 ? Math.round((freshSkus / totalMatrixSkus) * 100) : 85,
            priceComparisonList,
            allProductsList,
            totalTop20Volume,
            totalTop20Revenue,
            totalTop20Profit
        };
    }, [costMatrix, products, costMap, priceMap, filteredOrders, orderItems, matrixSort]);

    // ── LÓGICA DE SUPERBUSCADOR & ORDENADORES MATRIZ DE RENTABILIDAD ──
    const handleMatrixHeaderSort = (column: 'index' | 'name' | 'category' | 'soldQty' | 'matrixCost' | 'basePrice' | 'totalRevenue' | 'totalProfit' | 'spreadPct') => {
        if (matrixSortColumn === column) {
            setMatrixSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
        } else {
            setMatrixSortColumn(column);
            if (column === 'name' || column === 'category') {
                setMatrixSortDir('asc');
            } else {
                setMatrixSortDir('desc');
            }
        }
    };

    const handleMatrixQuickPill = (id: 'volume' | 'total_profit' | 'revenue' | 'spread' | 'all') => {
        if (id === 'all') {
            setMatrixShowAll(true);
            return;
        }
        setMatrixShowAll(false);
        setMatrixSort(id);
        if (id === 'volume') {
            setMatrixSortColumn('soldQty');
            setMatrixSortDir('desc');
        } else if (id === 'total_profit') {
            setMatrixSortColumn('totalProfit');
            setMatrixSortDir('desc');
        } else if (id === 'revenue') {
            setMatrixSortColumn('totalRevenue');
            setMatrixSortDir('desc');
        } else if (id === 'spread') {
            setMatrixSortColumn('spreadPct');
            setMatrixSortDir('desc');
        }
    };

    const filteredAndSortedMatrixList = useMemo(() => {
        const sourceList = [...(procurementMetrics.allProductsList || procurementMetrics.priceComparisonList || [])];
        const query = matrixSearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        let list = sourceList;
        if (query) {
            list = list.filter(p => {
                const nameNorm = String(p.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const catNorm = String(p.category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const codeNorm = String(p.accountingId || '').toLowerCase();
                const unitNorm = String(p.unit || '').toLowerCase();
                return nameNorm.includes(query) || catNorm.includes(query) || codeNorm.includes(query) || unitNorm.includes(query);
            });
        }

        // Ordenamiento dinámico
        list.sort((a, b) => {
            if (matrixSortColumn === 'name') {
                const aName = String(a.name || '').toLowerCase();
                const bName = String(b.name || '').toLowerCase();
                return matrixSortDir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName);
            }
            if (matrixSortColumn === 'category') {
                const aCat = String(a.category || '').toLowerCase();
                const bCat = String(b.category || '').toLowerCase();
                return matrixSortDir === 'asc' ? aCat.localeCompare(bCat) : bCat.localeCompare(aCat);
            }

            const valA = Number(a[matrixSortColumn] ?? 0);
            const valB = Number(b[matrixSortColumn] ?? 0);
            return matrixSortDir === 'asc' ? valA - valB : valB - valA;
        });

        if (!query && !matrixShowAll) {
            return list.slice(0, 20);
        }

        return list;
    }, [procurementMetrics, matrixSearch, matrixSortColumn, matrixSortDir, matrixShowAll]);

    const matrixVisibleSummary = useMemo(() => {
        return filteredAndSortedMatrixList.reduce(
            (acc, p) => ({
                volume: acc.volume + p.soldQty,
                revenue: acc.revenue + p.totalRevenue,
                profit: acc.profit + p.totalProfit
            }),
            { volume: 0, revenue: 0, profit: 0 }
        );
    }, [filteredAndSortedMatrixList]);

    // ── MASTER EXCEL EXPORT (1-CLIC) ──
    const handleExportExcel = async (areaKey: StrategyArea) => {
        setExporting(true);
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            if (areaKey === 'commercial') {
                const salesData = filteredOrders.map(o => {
                    const prof = profileMap.get(o.profile_id);
                    return {
                        'ID Pedido': o.id,
                        'Consecutivo': o.sequence_id || '—',
                        'Fecha': new Date(o.created_at).toLocaleDateString('es-CO'),
                        'Cliente / Razón Social': prof?.company_name || prof?.contact_name || 'Desconocido',
                        'NIT': prof?.nit || '—',
                        'Canal': o.type === 'b2b' || prof?.role === 'b2b_client' ? 'Institucional B2B' : 'Hogar B2C',
                        'Total Facturado ($)': Number(o.total || 0),
                        'Kilaje Estimado (Kg)': Number(o.total_weight_kg || 0),
                        'Estado': o.status
                    };
                });
                const ws = XLSX.utils.json_to_sheet(salesData);
                XLSX.utils.book_append_sheet(wb, ws, 'Ventas_Consolidadas');
            } else if (areaKey === 'inventory') {
                const stockByProdMap = new Map<string, number>();
                stocks.forEach(s => {
                    stockByProdMap.set(s.product_id, (stockByProdMap.get(s.product_id) || 0) + Number(s.quantity || 0));
                });
                const invData = products.map(p => {
                    const qty = stockByProdMap.get(p.id) || 0;
                    const min = Number(p.min_inventory_level || 0);
                    const unitCost = costMap.get(p.id) || 0;
                    return {
                        'ID Contable': p.accounting_id || '—',
                        'Producto': p.name,
                        'Grupo de Inventario': p.inventory_group || '—',
                        'Unidad': p.unit_of_measure,
                        'Stock Actual': qty,
                        'Costo Unitario ($)': unitCost,
                        'Valor en Costo ($)': Math.round(qty * unitCost),
                        'Stock Mínimo': min,
                        'Estado Alerta': min > 0 && qty <= min ? 'BAJO_MÍNIMO' : 'OK'
                    };
                });
                const ws = XLSX.utils.json_to_sheet(invData);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventarios_Saldos');
            } else if (areaKey === 'crm') {
                const ordersByProfileMap = new Map<string, any[]>();
                for (let i = 0; i < orders.length; i++) {
                    const o = orders[i];
                    if (!o.profile_id) continue;
                    const arr = ordersByProfileMap.get(o.profile_id) || [];
                    arr.push(o);
                    ordersByProfileMap.set(o.profile_id, arr);
                }
                const crmData = profiles.map(p => {
                    const clientOrders = ordersByProfileMap.get(p.id) || [];
                    const totalBought = clientOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
                    return {
                        'Cliente': p.company_name || p.contact_name,
                        'NIT': p.nit || '—',
                        'Tipo': p.role === 'b2b_client' ? 'Institucional' : 'Hogar',
                        'Dirección': p.address || '—',
                        'Pedidos Realizados': clientOrders.length,
                        'Total Comprado ($)': totalBought,
                        'Días Plazo': p.payment_days || 0
                    };
                });
                const ws = XLSX.utils.json_to_sheet(crmData);
                XLSX.utils.book_append_sheet(wb, ws, 'Directorio_Clientes');
            } else if (areaKey === 'procurement') {
                const procData = procurementMetrics.priceComparisonList.map(p => ({
                    'ID Contable': p.accountingId,
                    'Producto': p.name,
                    'Grupo de Inventario': p.category,
                    'Unidad': p.unit,
                    'Volumen Vendido': Number(p.soldQty.toFixed(1)),
                    'Costo Unitario Compra ($)': p.matrixCost,
                    'Precio Venta Base ($)': p.basePrice,
                    'Facturación Total ($)': p.totalRevenue,
                    'Rentabilidad Valor Total ($)': p.totalProfit,
                    'Margen Rentabilidad (%)': p.spreadPct
                }));
                const ws = XLSX.utils.json_to_sheet(procData);
                XLSX.utils.book_append_sheet(wb, ws, 'Matriz_Rentabilidad_Top20');
            }

            const fileName = `FruFresco_BI_${areaKey.toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            (window as any).showToast?.(`Reporte BI ${fileName} exportado con éxito `, 'success');
        } catch (err) {
            console.error('Error generating excel export:', err);
            alert('Error al generar la descarga en Excel');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            
            {/* ── STICKY FROSTED CONTROL TOOLBAR ── */}
            <div style={{
                position: 'sticky',
                top: '85px',
                zIndex: 60,
                backgroundColor: 'rgba(255, 255, 255, 0.97)',
                backdropFilter: 'blur(12px)',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '0.65rem 1.15rem',
                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.03)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.85rem'
            }}>
                {/* 1. Selector de 4 Áreas Estratégicas */}
                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '10px', border: '1px solid #E2E8F0', overflowX: 'auto' }}>
                    {[
                        { id: 'commercial', label: '1. Comercial & Finanzas', icon: <DollarSign size={14} strokeWidth={2.2} /> },
                        { id: 'inventory', label: '2. Cadena & Inventario', icon: <Package size={14} strokeWidth={2.2} /> },
                        { id: 'crm', label: '3. Clientes & Conversión', icon: <Users size={14} strokeWidth={2.2} /> },
                        { id: 'procurement', label: '4. Abastecimiento & Precios', icon: <Scale size={14} strokeWidth={2.2} /> }
                    ].map(a => {
                        const active = activeArea === a.id;
                        return (
                            <button
                                key={a.id}
                                onClick={() => setActiveArea(a.id as StrategyArea)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '0.45rem 0.85rem',
                                    borderRadius: '7px',
                                    border: 'none',
                                    backgroundColor: active ? THEME.colors.primary : 'transparent',
                                    color: active ? '#FFFFFF' : '#334155',
                                    fontSize: '0.78rem',
                                    fontWeight: active ? '800' : '600',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    whiteSpace: 'nowrap',
                                    boxShadow: active ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none'
                                }}
                            >
                                {a.icon}
                                <span>{a.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* 2. Filtros de Segmentación & Exportación */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Period Selector */}
                    <div style={{ display: 'flex', backgroundColor: '#F8FAFC', padding: '2px', borderRadius: '8px', border: '1px solid #CBD5E1' }}>
                        {[
                            { id: 'all', label: 'Histórico' },
                            { id: 'this_month', label: 'Este Mes' },
                            { id: '30d', label: '30D' },
                            { id: '15d', label: '15D' },
                            { id: '7d', label: '7D' },
                            { id: 'today', label: 'Hoy' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTimeRange(t.id as TimeRange)}
                                style={{
                                    padding: '0.25rem 0.6rem',
                                    fontSize: '0.72rem',
                                    fontWeight: timeRange === t.id ? '800' : '600',
                                    backgroundColor: timeRange === t.id ? THEME.colors.primary : 'transparent',
                                    color: timeRange === t.id ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    boxShadow: timeRange === t.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* Segment Selector */}
                    <select
                        value={segmentFilter}
                        onChange={e => setSegmentFilter(e.target.value as SegmentFilter)}
                        style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            backgroundColor: '#FFFFFF',
                            color: '#0F172A',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">Todos los Canales</option>
                        <option value="b2b">Institucional (B2B)</option>
                        <option value="b2c">Línea Hogar (B2C)</option>
                    </select>

                    {/* Master Excel Button */}
                    <button
                        onClick={() => handleExportExcel(activeArea)}
                        disabled={exporting}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            backgroundColor: '#15803D',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '0.45rem 0.95rem',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(21, 128, 61, 0.25)',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#166534'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#15803D'}
                    >
                        <FileSpreadsheet size={15} />
                        <span>{exporting ? 'Generando...' : 'Descargar Excel (.xlsx)'}</span>
                    </button>

                    {/* Refresh */}
                    <button
                        onClick={() => fetchData(true)}
                        disabled={loading || refreshing}
                        title="Actualizar datos"
                        style={{
                            padding: '0.45rem',
                            borderRadius: '8px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            color: '#64748B',
                            cursor: 'pointer'
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* ── ÁREA 1: COMERCIAL & FINANCIERA (INFORME BI INTERACTIVO) ── */}
            {activeArea === 'commercial' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* 4 Hero Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Ventas Facturadas"
                            value={formatMoney(commercialMetrics.totalSales)}
                            subtitle={`B2B: ${formatMoney(commercialMetrics.b2bSales)} • B2C: ${formatMoney(commercialMetrics.b2cSales)}`}
                            icon={<DollarSign size={20} color="#059669" />}
                            badgeText={`${commercialMetrics.ordersCount} pedidos`}
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Margen Bruto Real"
                            value={`${commercialMetrics.marginPct}%`}
                            subtitle={`Utilidad Bruta Proyectada: ${formatMoney(commercialMetrics.grossProfit)}`}
                            icon={<TrendingUp size={20} color={THEME.colors.primary} />}
                            badgeText="Meta: >20%"
                            badgeBg="#DCFCE7"
                            badgeColor="#15803D"
                        />
                        <AreaKPICard
                            title="Ticket Promedio"
                            value={formatMoney(commercialMetrics.avgTicket)}
                            subtitle={`Kilaje promedio: ${commercialMetrics.avgKgPerOrder} Kg / pedido`}
                            icon={<BarChart3 size={20} color="#2563EB" />}
                            badgeText="Por Orden"
                            badgeBg="#EFF6FF"
                            badgeColor="#1E40AF"
                        />
                        <AreaKPICard
                            title="Volumen Movilizado"
                            value={`${formatNumber(commercialMetrics.totalKg, 1)} Kg`}
                            subtitle={`En ${commercialMetrics.ordersCount} despachos facturados`}
                            icon={<Package size={20} color="#0284C7" />}
                            badgeText="Logística"
                            badgeBg="#E0F2FE"
                            badgeColor="#0369A1"
                        />
                    </div>

                    {/* ── BI SECTION 1: TIMELINE HISTÓRICO DE VENTAS & KILAJE ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Activity size={18} color={THEME.colors.primary} />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '850', color: '#0F172A' }}>
                                        Histórico Temporal &amp; Comportamiento Diario
                                    </h3>
                                </div>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Evolución de facturación ({formatMoney(commercialMetrics.totalSales)}), kilaje ({formatNumber(commercialMetrics.totalKg, 0)} Kg) y pedidos.
                                </p>
                            </div>

                            {/* Metric Selector Buttons */}
                            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'sales', label: 'Facturación ($)' },
                                    { id: 'kg', label: 'Volumen (Kg)' },
                                    { id: 'orders', label: 'Órdenes' },
                                    { id: 'profit', label: 'Utilidad ($)' },
                                    { id: 'warranties', label: 'Garantías & Reposiciones ($)' }
                                ].map(m => (
                                    <button
                                        key={m.id}
                                        onClick={() => setCommercialTimelineMetric(m.id as any)}
                                        style={{
                                            padding: '0.3rem 0.65rem',
                                            fontSize: '0.72rem',
                                            fontWeight: commercialTimelineMetric === m.id ? '800' : '600',
                                            backgroundColor: commercialTimelineMetric === m.id ? '#FFFFFF' : 'transparent',
                                            color: commercialTimelineMetric === m.id ? THEME.colors.primary : '#64748B',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            boxShadow: commercialTimelineMetric === m.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                        }}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {commercialTimelineMetric === 'warranties' && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '0.65rem 1rem', borderRadius: '10px', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', fontWeight: 850, color: '#92400E' }}>
                                        <ShieldAlert size={16} color="#D97706" />
                                        <span>Fuga Total de Inventario: {formatMoney(warrantyTrend.totalCost)}</span>
                                    </div>
                                    <span style={{ fontSize: '0.74rem', color: '#78350F', fontWeight: 600 }}>
                                        ({formatNumber(warrantyTrend.totalKg, 1)} Kg cedidos en {warrantyTrend.totalCases} despachos a $0 COP)
                                    </span>
                                    <span style={{
                                        fontSize: '0.74rem',
                                        fontWeight: 850,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        backgroundColor: warrantyTrend.direction === 'down' ? '#ECFDF5' : warrantyTrend.direction === 'up' ? '#FEF2F2' : '#F1F5F9',
                                        color: warrantyTrend.direction === 'down' ? '#065F46' : warrantyTrend.direction === 'up' ? '#DC2626' : '#475569',
                                        border: `1px solid ${warrantyTrend.direction === 'down' ? '#A7F3D0' : warrantyTrend.direction === 'up' ? '#FECACA' : '#E2E8F0'}`
                                    }}>
                                        {warrantyTrend.direction === 'down' ? <ArrowDownRight size={13} /> : warrantyTrend.direction === 'up' ? <ArrowUpRight size={13} /> : <Minus size={13} />}
                                        Tendencia 7D: {warrantyTrend.direction === 'down' ? `↘ -${warrantyTrend.pct}% Calidad Bajo Control (Lean Mejora)` : warrantyTrend.direction === 'up' ? `↗ +${warrantyTrend.pct}% Alerta de Fuga en Aumento` : '→ Frecuencia Estable'}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowWarrantyHistoryModal(true)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#0D7A57',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.74rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 3px rgba(13, 122, 87, 0.2)'
                                    }}
                                >
                                    <History size={14} />
                                    Ver Historial Auditable ({warrantyTrend.totalCases})
                                </button>
                            </div>
                        )}

                        {/* Interactive SVG Chart / Histogram Component */}
                        <BITimeSeriesChart
                            data={commercialTimeSeries}
                            metric={commercialTimelineMetric}
                        />
                    </div>

                    {/* ── BI SECTION 2: PARETO DE PRODUCTOS & DISTRIBUCIÓN POR CANAL ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem' }}>
                        {/* Participación & Rentabilidad por Canal de Venta (Rediseño de Alta Densidad BI) */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            gap: '0.75rem'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Participación &amp; Rentabilidad por Canal
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                                        Mix Venta vs Utilidad
                                    </span>
                                </div>
                                <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Distribución de ingresos, margen de rentabilidad y utilidad bruta real entre canales.
                                </p>

                                <BIChannelPerformanceMatrix metrics={commercialMetrics} />
                            </div>
                        </div>

                        {/* Ranking Top 20 Productos Más Consumidos & Rentabilidad Valor Total */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.4rem' }}>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                    Top 20 Productos: Volumen &amp; Rentabilidad Valor Total
                                </h3>
                                <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F8FAFC', padding: '2px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    {[
                                        { id: 'volume', label: 'Top Volumen' },
                                        { id: 'profit', label: 'Rentabilidad ($)' },
                                        { id: 'revenue', label: 'Facturación ($)' }
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            onClick={() => setProductRankingSort(opt.id as any)}
                                            style={{
                                                border: 'none',
                                                borderRadius: '6px',
                                                padding: '3px 8px',
                                                fontSize: '0.68rem',
                                                fontWeight: productRankingSort === opt.id ? '800' : '600',
                                                backgroundColor: productRankingSort === opt.id ? '#0D7A57' : 'transparent',
                                                color: productRankingSort === opt.id ? '#FFFFFF' : '#64748B',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Matriz Top 20 por volumen movilizado, facturación acumulada y rentabilidad bruta en valor total ($).
                            </p>

                            <BIProductParetoRanking products={commercialMetrics.topProducts} sortBy={productRankingSort} />
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área Comercial & Financiera"
                        description="Descargue el archivo de Excel con el 100% de las órdenes: montos, kilajes, clientes, zonas geográficas y márgenes por pedido."
                        onDownload={() => handleExportExcel('commercial')}
                        exporting={exporting}
                    />
                </div>
            )}

            {/* ── ÁREA 2: INVENTARIOS & CADENA DE SUMINISTRO (BI LOGÍSTICO — ESTÁNDAR MANUAL DE DISEÑO FRUFRESCO) ── */}
            {activeArea === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Stock en Bodega"
                            value={`${formatNumber(inventoryMetrics.totalStockKg, 1)} Kg`}
                            subtitle={`Valor Costo: ${formatMoney(inventoryMetrics.totalStockCostValue)} • ~${inventoryMetrics.coverageDays}d`}
                            icon={<Package size={20} color="#0D7A57" />}
                            badgeText="Existencias"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Tasa de Merma / Ajuste"
                            value={`${inventoryMetrics.wasteRatePct}%`}
                            subtitle={`${formatNumber(inventoryMetrics.wasteQty, 1)} Kg registrados en merma`}
                            icon={<TrendingDown size={20} color={Number(inventoryMetrics.wasteRatePct) > 2 ? '#DC2626' : '#065F46'} />}
                            badgeText="Meta: <2.0%"
                            badgeBg={Number(inventoryMetrics.wasteRatePct) > 2 ? '#FEF2F2' : '#ECFDF5'}
                            badgeColor={Number(inventoryMetrics.wasteRatePct) > 2 ? '#DC2626' : '#065F46'}
                        />
                        <AreaKPICard
                            title="Reposiciones & Garantías"
                            value={formatMoney(inventoryMetrics.repositionsCost || warrantyTrend.totalCost)}
                            subtitle={`${inventoryMetrics.repositionsOrdersCount} garantías SAC ($0) • ${formatNumber(inventoryMetrics.repositionsQty, 1)} Kg cedidos`}
                            icon={<ShieldAlert size={20} color="#DC2626" />}
                            badgeText="Costo Inventario"
                            badgeBg="#FEF2F2"
                            badgeColor="#DC2626"
                        />
                        <AreaKPICard
                            title="Alertas de Stock Mínimo"
                            value={`${inventoryMetrics.lowStockCount} / ${inventoryMetrics.configuredMinSkusCount}`}
                            subtitle={`Productos bajo umbral mínimo real configurado`}
                            icon={<AlertCircle size={20} color="#92400E" />}
                            badgeText="Umbral Real"
                            badgeBg="#FFFBEB"
                            badgeColor="#92400E"
                        />
                    </div>

                    {/* ── BI SECTION 1: HISTÓRICO DE FLUJO DE KARDEX (ENTRADAS VS SALIDAS VS MERMAS) ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Layers size={18} color="#0D7A57" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '850', color: '#0F172A' }}>
                                        Flujo de Movimientos en Bodega (Entradas vs. Salidas vs. Mermas)
                                    </h3>
                                </div>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Balance volumétrico diario de abastecimiento recibido vs. despachos ejecutados en planta.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0F172A' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#0D7A57' }} />
                                    <span>Entradas ({formatNumber(inventoryMetrics.inboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#475569' }} />
                                    <span>Salidas ({formatNumber(inventoryMetrics.outboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991B1B' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#DC2626' }} />
                                    <span>Mermas ({formatNumber(inventoryMetrics.wasteQty, 0)} Kg)</span>
                                </div>
                            </div>
                        </div>

                        <BIMovementFlowChart movements={inventoryMetrics.dailyMovements} />
                    </div>

                    {/* ── BI SECTION 2: DISTRIBUCIÓN POR GRUPO DE INVENTARIO (KG & COSTO $) & ALERTA TEMPRANA CONECTADA ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                        {/* Distribución por Grupo de Inventario (Kilos & Valor en Costo) */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Distribución por Grupo de Inventario
                                    </h3>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        color: '#065F46',
                                        backgroundColor: '#ECFDF5',
                                        border: '1px solid #BBF7D0',
                                        padding: '2px 8px',
                                        borderRadius: '6px'
                                    }}>
                                        Kilos &amp; Valor en Costo
                                    </span>
                                </div>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Kilaje disponible en bodega y valorización a costo por lista de inventario ({formatMoney(inventoryMetrics.totalStockCostValue)} total).
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                    {inventoryMetrics.groupBreakdown.map((g, i) => {
                                        const pctNum = inventoryMetrics.totalStockKg > 0 ? (g.totalKg / inventoryMetrics.totalStockKg) * 100 : 0;
                                        const pct = pctNum.toFixed(1);
                                        const costPct = inventoryMetrics.totalStockCostValue > 0
                                            ? ((g.totalCostValue / inventoryMetrics.totalStockCostValue) * 100).toFixed(1)
                                            : '0.0';
                                        return (
                                            <div key={i} style={{
                                                padding: '0.65rem 0.85rem',
                                                backgroundColor: '#F8FAFC',
                                                borderRadius: '10px',
                                                border: '1px solid #E2E8F0'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '4px' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A', lineHeight: 1.25 }}>
                                                            {g.group}
                                                        </div>
                                                        <div style={{ fontSize: '0.66rem', fontWeight: '600', color: '#64748B', marginTop: '2px' }}>
                                                            {g.activeStockSkus} productos con saldo físico (de {g.skus} en lista)
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                                        <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#0F172A' }}>
                                                            {formatNumber(g.totalKg, 1)} Kg <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>({pct}%)</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#0D7A57', marginTop: '1px' }}>
                                                            Costo: {formatMoney(g.totalCostValue)} <span style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '600' }}>({costPct}%)</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', marginTop: '4px' }}>
                                                    <div style={{
                                                        height: '100%',
                                                        width: `${Math.max(pctNum, g.totalKg > 0 ? 2 : 0)}%`,
                                                        backgroundColor: i === 0 ? '#0D7A57' : i === 1 ? '#0A5F43' : i === 2 ? '#047857' : '#475569',
                                                        borderRadius: '999px',
                                                        transition: 'width 0.4s ease'
                                                    }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Alerta Temprana de Abastecimiento & Escasez (Radar Cíclico de Mercado + Reportados Escasos) */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ marginBottom: '0.65rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Alerta Temprana de Abastecimiento &amp; Escasez
                                    </h3>
                                    <p style={{ margin: '3px 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                        Inteligencia cíclica de mercado (escasez vs. cosecha en historial 2025-2026) y productos reportados escasos en despacho.
                                    </p>
                                </div>

                                {/* Selector de Vista Cíclica + Buscador */}
                                <div style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    flexWrap: 'wrap',
                                    marginBottom: '0.85rem',
                                    padding: '0.55rem 0.65rem',
                                    backgroundColor: '#F8FAFC',
                                    borderRadius: '10px',
                                    border: '1px solid #E2E8F0'
                                }}>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'scarcity', label: `Escasez & Carestía (${inventoryMetrics.scarcityCycleCount})`, activeBg: '#DC2626', activeText: '#FFFFFF' },
                                            { id: 'reported', label: `Reportados Despacho (${inventoryMetrics.reportedShortageCount})`, activeBg: '#D97706', activeText: '#FFFFFF' },
                                            { id: 'abundance', label: `En Abundancia (${inventoryMetrics.abundanceCycleCount})`, activeBg: '#0D7A57', activeText: '#FFFFFF' },
                                            { id: 'all', label: 'Ver Todos', activeBg: '#0F172A', activeText: '#FFFFFF' }
                                        ].map(tab => {
                                            const isAct = scarcityViewTab === tab.id;
                                            return (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => setScarcityViewTab(tab.id as any)}
                                                    style={{
                                                        padding: '4px 9px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        border: isAct ? 'none' : '1px solid #CBD5E1',
                                                        backgroundColor: isAct ? tab.activeBg : '#FFFFFF',
                                                        color: isAct ? tab.activeText : '#475569',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    {tab.label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div style={{ position: 'relative', flex: '1 1 170px', maxWidth: '240px' }}>
                                        <Search size={13} color="#64748B" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            value={scarcitySearch}
                                            onChange={e => setScarcitySearch(e.target.value)}
                                            placeholder="Buscar producto o Cód..."
                                            style={{
                                                width: '100%',
                                                padding: '4px 24px 4px 26px',
                                                fontSize: '0.72rem',
                                                fontWeight: '600',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                backgroundColor: '#FFFFFF',
                                                color: '#0F172A',
                                                outline: 'none'
                                            }}
                                        />
                                        {scarcitySearch && (
                                            <button
                                                type="button"
                                                onClick={() => setScarcitySearch('')}
                                                style={{
                                                    position: 'absolute',
                                                    right: '5px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    border: 'none',
                                                    background: 'transparent',
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    display: 'flex',
                                                    color: '#64748B'
                                                }}
                                            >
                                                <X size={12} />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Lista Interactiva de Productos en Alerta de Escasez o Ciclo de Mercado */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.68rem', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                                    {(() => {
                                        const normQ = scarcitySearch.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                                        const filteredList = (inventoryMetrics.scarcityRadarItems || []).filter((item: any) => {
                                            if (scarcityViewTab === 'scarcity' && item.cycleType !== 'scarcity' && !item.opReport) return false;
                                            if (scarcityViewTab === 'reported' && item.cycleType !== 'reported' && !item.opReport) return false;
                                            if (scarcityViewTab === 'abundance' && item.cycleType !== 'abundance') return false;
                                            if (!normQ) return true;
                                            const haystack = `${item.name || ''} ${String(item.accountingId || '')} ${item.inventoryGroup || ''} ${item.cycleStatusLabel || ''} ${item.peakScarcityMonth || ''} ${item.peakAbundanceMonth || ''}`
                                                .toLowerCase()
                                                .normalize('NFD')
                                                .replace(/[\u0300-\u036f]/g, '');
                                            return haystack.includes(normQ);
                                        });

                                        if (filteredList.length === 0) {
                                            return (
                                                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748B', fontSize: '0.78rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px dashed #CBD5E1' }}>
                                                    No se encontraron productos con este criterio de escasez o ciclo de mercado.
                                                </div>
                                            );
                                        }

                                        return filteredList.slice(0, 25).map((p: any, idx: number) => {
                                            const isAbundance = p.cycleType === 'abundance';
                                            const isReported = p.cycleType === 'reported' || !!p.opReport;
                                            const isScarcity = p.cycleType === 'scarcity';
                                            const accentColor = isReported ? '#DC2626' : (isScarcity ? '#EA580C' : (isAbundance ? '#0D7A57' : '#475569'));
                                            const badgeBg = isReported ? '#FEF2F2' : (isScarcity ? '#FFF7ED' : (isAbundance ? '#ECFDF5' : '#F1F5F9'));
                                            const badgeBorder = isReported ? '#FECACA' : (isScarcity ? '#FED7AA' : (isAbundance ? '#BBF7D0' : '#CBD5E1'));
                                            const badgeColor = isReported ? '#DC2626' : (isScarcity ? '#C2410C' : (isAbundance ? '#065F46' : '#334155'));

                                            return (
                                                <div
                                                    key={p.id || idx}
                                                    onClick={() => setSelectedScarcityItem(p)}
                                                    style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '5px',
                                                        padding: '0.7rem 0.9rem',
                                                        backgroundColor: '#F8FAFC',
                                                        borderRadius: '10px',
                                                        border: '1px solid #E2E8F0',
                                                        borderLeft: `4px solid ${accentColor}`,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: '850', color: '#0F172A' }}>{p.name}</span>
                                                            {p.accountingId && (
                                                                <span style={{
                                                                    fontSize: '0.64rem',
                                                                    fontWeight: '700',
                                                                    color: '#475569',
                                                                    backgroundColor: '#FFFFFF',
                                                                    border: '1px solid #E2E8F0',
                                                                    padding: '1px 5px',
                                                                    borderRadius: '4px',
                                                                    fontVariantNumeric: 'tabular-nums'
                                                                }}>
                                                                    Cód: {p.accountingId}
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: '0.64rem', fontWeight: '600', color: '#64748B' }}>
                                                                • {p.inventoryGroup}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontVariantNumeric: 'tabular-nums' }}>
                                                            <span style={{
                                                                fontSize: '0.62rem',
                                                                fontWeight: '850',
                                                                padding: '2px 7px',
                                                                borderRadius: '5px',
                                                                backgroundColor: badgeBg,
                                                                border: `1px solid ${badgeBorder}`,
                                                                color: badgeColor
                                                            }}>
                                                                {p.cycleStatusLabel}
                                                            </span>
                                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', color: p.currentStock > 0 ? '#0F172A' : '#DC2626' }}>
                                                                Stock: {formatNumber(p.currentStock, 1)} {p.unit}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Línea de Telemetría Cíclica & Reportes de Escasez */}
                                                    {p.opReport && (
                                                        <div style={{
                                                            fontSize: '0.68rem',
                                                            fontWeight: '700',
                                                            color: '#991B1B',
                                                            backgroundColor: '#FEF2F2',
                                                            border: '1px solid #FECACA',
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            flexWrap: 'wrap'
                                                        }}>
                                                            <span>
                                                                Alerta Operativa ({p.opReport.incidentsCount} {p.opReport.incidentsCount === 1 ? 'reporte' : 'reportes'}
                                                                {p.opReport.missingKg > 0 ? ` • ${formatNumber(p.opReport.missingKg, 1)} ${p.unit} sin despachar` : ''}): {p.opReport.latestReason}
                                                            </span>
                                                            <span style={{ fontSize: '0.64rem', color: '#B91C1C', fontWeight: '800' }}>
                                                                {p.opReport.latestDate}
                                                            </span>
                                                        </div>
                                                    )}

                                                    {p.recordsCount >= 2 ? (
                                                        <div style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            flexWrap: 'wrap',
                                                            gap: '6px',
                                                            fontSize: '0.68rem',
                                                            color: '#475569',
                                                            fontVariantNumeric: 'tabular-nums'
                                                        }}>
                                                            <span>
                                                                Costo Reciente ({p.latestMonthLabel}): <strong style={{ color: isScarcity ? '#C2410C' : (isAbundance ? '#065F46' : '#0F172A') }}>{formatMoney(p.latestPrice)}</strong> vs Prom. Histórico: <strong>{formatMoney(p.avgHistoricalPrice)}</strong> ({p.deltaPct > 0 ? `+${p.deltaPct}%` : `${p.deltaPct}%`})
                                                            </span>
                                                            <span style={{ fontSize: '0.65rem', fontWeight: '700' }}>
                                                                <span style={{ color: '#DC2626' }}>Pico Escasez: {p.peakScarcityMonth} ({formatMoney(p.maxHistoricalPrice)})</span>
                                                                {' • '}
                                                                <span style={{ color: '#0D7A57' }}>Cosecha: {p.peakAbundanceMonth} ({formatMoney(p.minHistoricalPrice)})</span>
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.66rem', fontWeight: '600', color: '#64748B' }}>
                                                            {p.minStock > 0 ? `Umbral mínimo configurado: ${formatNumber(p.minStock, 0)} ${p.unit}` : 'Monitoreo operativo de despacho y disponibilidad en plaza'}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área de Inventario & Cadena de Suministro"
                        description="Descargue el reporte de existencias en bodega valorizado a costo por Grupo de Inventario, umbrales mínimos reales, reposiciones SAC y mermas."
                        onDownload={() => handleExportExcel('inventory')}
                        exporting={exporting}
                    />

                    {/* Modal Forense de Ciclo Histórico de Escasez & Abundancia del Producto */}
                    {selectedScarcityItem && (
                        <div
                            onClick={() => setSelectedScarcityItem(null)}
                            style={{
                                position: 'fixed',
                                inset: 0,
                                backgroundColor: 'rgba(15, 23, 42, 0.55)',
                                backdropFilter: 'blur(4px)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 1000,
                                padding: '1rem'
                            }}
                        >
                            <div
                                onClick={e => e.stopPropagation()}
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: '16px',
                                    border: '1px solid #E2E8F0',
                                    width: '100%',
                                    maxWidth: '680px',
                                    maxHeight: '88vh',
                                    overflowY: 'auto',
                                    padding: '1.35rem 1.5rem',
                                    boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.85rem', marginBottom: '1rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: '900', color: '#0F172A' }}>
                                                {selectedScarcityItem.name}
                                            </h3>
                                            {selectedScarcityItem.accountingId && (
                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', backgroundColor: '#F1F5F9', padding: '2px 8px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                                                    Cód: {selectedScarcityItem.accountingId}
                                                </span>
                                            )}
                                            <span style={{
                                                fontSize: '0.68rem',
                                                fontWeight: '850',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                backgroundColor: selectedScarcityItem.cycleType === 'abundance' ? '#ECFDF5' : '#FEF2F2',
                                                color: selectedScarcityItem.cycleType === 'abundance' ? '#065F46' : '#DC2626',
                                                border: `1px solid ${selectedScarcityItem.cycleType === 'abundance' ? '#BBF7D0' : '#FECACA'}`
                                            }}>
                                                {selectedScarcityItem.cycleStatusLabel}
                                            </span>
                                        </div>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: '#64748B', fontWeight: '600' }}>
                                            {selectedScarcityItem.inventoryGroup} • Stock Físico Actual: <strong>{formatNumber(selectedScarcityItem.currentStock, 1)} {selectedScarcityItem.unit}</strong>
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedScarcityItem(null)}
                                        style={{
                                            border: '1px solid #CBD5E1',
                                            backgroundColor: '#F8FAFC',
                                            borderRadius: '8px',
                                            padding: '6px',
                                            cursor: 'pointer',
                                            color: '#475569',
                                            display: 'flex'
                                        }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* KPIs del Ciclo del Producto */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1rem', fontVariantNumeric: 'tabular-nums' }}>
                                    <div style={{ padding: '0.7rem 0.85rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Costo Reciente ({selectedScarcityItem.latestMonthLabel})</div>
                                        <div style={{ fontSize: '1rem', fontWeight: '900', color: '#0F172A', marginTop: '2px' }}>{formatMoney(selectedScarcityItem.latestPrice)}</div>
                                    </div>
                                    <div style={{ padding: '0.7rem 0.85rem', backgroundColor: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.66rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Promedio Histórico</div>
                                        <div style={{ fontSize: '1rem', fontWeight: '900', color: '#334155', marginTop: '2px' }}>{formatMoney(selectedScarcityItem.avgHistoricalPrice)}</div>
                                    </div>
                                    <div style={{ padding: '0.7rem 0.85rem', backgroundColor: '#FEF2F2', borderRadius: '10px', border: '1px solid #FECACA' }}>
                                        <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#991B1B', textTransform: 'uppercase' }}>Mes Crítico Escasez</div>
                                        <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#DC2626', marginTop: '2px' }}>
                                            {selectedScarcityItem.peakScarcityMonth || 'N/A'} ({formatMoney(selectedScarcityItem.maxHistoricalPrice)})
                                        </div>
                                    </div>
                                    <div style={{ padding: '0.7rem 0.85rem', backgroundColor: '#ECFDF5', borderRadius: '10px', border: '1px solid #BBF7D0' }}>
                                        <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#065F46', textTransform: 'uppercase' }}>Mes de Abundancia</div>
                                        <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0D7A57', marginTop: '2px' }}>
                                            {selectedScarcityItem.peakAbundanceMonth || 'N/A'} ({formatMoney(selectedScarcityItem.minHistoricalPrice)})
                                        </div>
                                    </div>
                                </div>

                                {/* Historial Mensual de Costos & Disponibilidad */}
                                {selectedScarcityItem.monthlyTimeline && selectedScarcityItem.monthlyTimeline.length > 0 && (
                                    <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '850', color: '#0F172A', marginBottom: '0.65rem' }}>
                                            Curva Histórica de Escasez vs. Abundancia por Mes ({selectedScarcityItem.recordsCount} registros de compra)
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontVariantNumeric: 'tabular-nums' }}>
                                            {selectedScarcityItem.monthlyTimeline.map((mItem: any, i: number) => {
                                                const maxP = Math.max(selectedScarcityItem.maxHistoricalPrice, 1);
                                                const pctW = Math.max(Math.round((mItem.avgPrice / maxP) * 100), 8);
                                                const isPeak = mItem.avgPrice === selectedScarcityItem.maxHistoricalPrice && selectedScarcityItem.monthlyTimeline.length > 1;
                                                const isLow = mItem.avgPrice === selectedScarcityItem.minHistoricalPrice && selectedScarcityItem.monthlyTimeline.length > 1;
                                                const barColor = isPeak ? '#DC2626' : (isLow ? '#0D7A57' : '#64748B');
                                                return (
                                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '85px 1fr 135px', alignItems: 'center', gap: '8px', fontSize: '0.72rem' }}>
                                                        <span style={{ fontWeight: '800', color: '#334155' }}>{mItem.label}</span>
                                                        <div style={{ height: '10px', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: `${pctW}%`, backgroundColor: barColor, borderRadius: '999px' }} />
                                                        </div>
                                                        <span style={{ textAlign: 'right', fontWeight: '850', color: barColor }}>
                                                            {formatMoney(mItem.avgPrice)} {isPeak ? '• Escasez' : isLow ? '• Cosecha' : ''}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Reportes Operativos de Escasez en Despacho si existen */}
                                {selectedScarcityItem.opReport && selectedScarcityItem.opReport.incidents?.length > 0 && (
                                    <div style={{ padding: '0.85rem 1rem', backgroundColor: '#FEF2F2', borderRadius: '12px', border: '1px solid #FECACA' }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '850', color: '#991B1B', marginBottom: '0.5rem' }}>
                                            Historial de Reportes de Escasez / Faltantes en Despacho ({selectedScarcityItem.opReport.incidentsCount})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                            {selectedScarcityItem.opReport.incidents.map((inc: any, k: number) => (
                                                <div key={k} style={{ backgroundColor: '#FFFFFF', padding: '0.55rem 0.75rem', borderRadius: '8px', border: '1px solid #FECACA', fontSize: '0.72rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '800', color: '#991B1B' }}>
                                                        <span>{inc.reason}</span>
                                                        <span>{inc.date} {inc.qty > 0 ? `• ${formatNumber(inc.qty, 1)} ${selectedScarcityItem.unit}` : ''}</span>
                                                    </div>
                                                    {inc.notes && (
                                                        <div style={{ fontSize: '0.66rem', color: '#64748B', marginTop: '2px' }}>{inc.notes}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── ÁREA 3: CLIENTES, RETENCIÓN & EMBUDO CRM (BI DE CONVERSIÓN) ── */}
            {activeArea === 'crm' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Compradores Activos"
                            value={crmMetrics.activeClientsCount}
                            subtitle={`De ${crmMetrics.totalClients} clientes registrados en FruFresco`}
                            icon={<Users size={20} color="#2563EB" />}
                            badgeText="Actividad"
                            badgeBg="#EFF6FF"
                            badgeColor="#1E40AF"
                        />
                        <AreaKPICard
                            title="Embudo Comercial Global"
                            value={`${crmMetrics.globalConversionPct}%`}
                            subtitle={`${crmMetrics.leadsCount} Prospectos ${crmMetrics.buyersCount} Compradores`}
                            icon={<Compass size={20} color="#0D7A57" />}
                            badgeText="Conversión"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Acuerdos B2B Vigentes"
                            value={crmMetrics.agreementsCount}
                            subtitle="Precios pactados y condiciones comerciales activas"
                            icon={<Award size={20} color="#059669" />}
                            badgeText="Contratos"
                            badgeBg="#DCFCE7"
                            badgeColor="#15803D"
                        />
                        <AreaKPICard
                            title="Cotizaciones Registradas"
                            value={crmMetrics.quotesCount}
                            subtitle="Ofertas comerciales presentadas en sistema"
                            icon={<Clock size={20} color="#D97706" />}
                            badgeText="Pipeline"
                            badgeBg="#FEF3C7"
                            badgeColor="#B45309"
                        />
                    </div>

                    {/* ── BI SECTION 1: EMBUDO COMERCIAL DE CONVERSIÓN PASO A PASO ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Compass size={18} color="#2563EB" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '850', color: '#0F172A' }}>
                                        Embudo Visual de Conversión Comercial (Pipeline B2B &amp; B2C)
                                    </h3>
                                </div>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Trazabilidad del ciclo comercial completo desde el primer contacto hasta la recompra activa.
                                </p>
                            </div>
                        </div>

                        <BIFunnelChart stages={crmMetrics.funnelStages} />
                    </div>

                    {/* ── BI SECTION 2: TOP CLIENTES & CONCENTRACIÓN DE FACTURACIÓN Y RENTABILIDAD ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                    Concentración de Facturación y Rentabilidad por Cliente (Pareto de Cartera)
                                </h3>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Clientes de mayor impacto en facturación, margen operativo y volumen movilizado.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>Ordenar por:</span>
                                <button
                                    onClick={() => setParetoSort('spend')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'spend' ? '#0F172A' : '#F1F5F9',
                                        color: paretoSort === 'spend' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor Venta ($)
                                </button>
                                <button
                                    onClick={() => setParetoSort('profit')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'profit' ? '#0D7A57' : '#F1F5F9',
                                        color: paretoSort === 'profit' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor Utilidad ($)
                                </button>
                                <button
                                    onClick={() => setParetoSort('margin')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'margin' ? '#2563EB' : '#F1F5F9',
                                        color: paretoSort === 'margin' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor % Margen
                                </button>
                                <button
                                    onClick={() => setParetoSort('volume')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        backgroundColor: paretoSort === 'volume' ? '#475569' : '#F1F5F9',
                                        color: paretoSort === 'volume' ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    Mayor Volumen (Kg)
                                </button>
                            </div>
                        </div>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Cliente / Empresa</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Tipo</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Órdenes</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Volumen (Kg)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Total Facturado ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Utilidad Bruta ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>% Rentabilidad</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Participación</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {crmMetrics.topClients.map((c, i) => {
                                        const sharePct = commercialMetrics.totalSales > 0 ? ((c.totalSpend / commercialMetrics.totalSales) * 100).toFixed(1) : '0';
                                        const isB2B = c.profile?.role === 'b2b_client' || !!c.profile?.company_name;
                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '0.65rem 0.5rem', fontWeight: '800', color: '#0F172A' }}>
                                                    {c.profile?.company_name || c.profile?.contact_name || 'Cliente Particular'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                                    <span style={{
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        backgroundColor: isB2B ? '#EFF6FF' : '#F1F5F9',
                                                        color: isB2B ? '#1E40AF' : '#475569'
                                                    }}>
                                                        {isB2B ? 'B2B Institucional' : 'B2C Hogar'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#334155' }}>
                                                    {c.ordersCount}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#334155' }}>
                                                    {formatNumber(c.totalKg, 1)} Kg
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '850', color: '#0F172A' }}>
                                                    {formatMoney(c.totalSpend)}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '850', color: c.grossProfit >= 0 ? '#0D7A57' : '#DC2626' }}>
                                                    {formatMoney(c.grossProfit)}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{
                                                        fontWeight: '900',
                                                        fontSize: '0.72rem',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        backgroundColor: c.marginPct >= 25 ? '#DCFCE7' : (c.marginPct >= 15 ? '#FEF3C7' : '#FEE2E2'),
                                                        color: c.marginPct >= 25 ? '#15803D' : (c.marginPct >= 15 ? '#B45309' : '#B91C1C'),
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '2px'
                                                    }}>
                                                        {c.marginPct.toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                                    <span style={{ fontWeight: '800', color: '#2563EB', backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                        {sharePct}%
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área de Clientes & Conversión (CRM)"
                        description="Descargue el directorio comercial de clientes con su historial de consumo acumulado, días de plazo y avance en el embudo."
                        onDownload={() => handleExportExcel('crm')}
                        exporting={exporting}
                    />
                </div>
            )}

            {/* ── ÁREA 4: ABASTECIMIENTO & PRECIOS (BI DE COSTOS & MATRIZ TOP 20 VOLUMEN Y RENTABILIDAD VALOR TOTAL) ── */}
            {activeArea === 'procurement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Frescura de Matriz"
                            value={`${procurementMetrics.freshnessPct}%`}
                            subtitle={`${procurementMetrics.freshSkus} productos con costo vigente (<3 días)`}
                            icon={<ShieldCheck size={20} color="#0D7A57" />}
                            badgeText="SLA Precios"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Costos por Recotizar"
                            value={procurementMetrics.expiredSkus}
                            subtitle="Productos que requieren actualización de compra en Corabastos"
                            icon={<AlertTriangle size={20} color="#DC2626" />}
                            badgeText="Vencidos (>7d)"
                            badgeBg="#FEF2F2"
                            badgeColor="#DC2626"
                        />
                        <AreaKPICard
                            title="Rentabilidad Top 20"
                            value={formatMoney(procurementMetrics.totalTop20Profit)}
                            subtitle={`Utilidad bruta acumulada en ${formatNumber(procurementMetrics.totalTop20Volume, 0)} Kg`}
                            icon={<DollarSign size={20} color="#065F46" />}
                            badgeText="Valor Total ($)"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Margen Promedio Real"
                            value={`${commercialMetrics.marginPct}%`}
                            subtitle={`Sobre ${procurementMetrics.totalMatrixSkus} productos en matriz de costos`}
                            icon={<TrendingUp size={20} color="#0D7A57" />}
                            badgeText="Consolidado"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                    </div>

                    {/* ── BI SECTION 1: RADAR DE SLA DE ACTUALIZACIÓN DE PRECIOS ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                            SLA de Frescura de Costos de Compra (Antigüedad de Matriz)
                        </h3>
                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Control de obsolescencia de cotizaciones de proveedores para evitar erosión involuntaria de margen.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#065F46', fontWeight: '800', fontSize: '0.75rem' }}>
                                    <CheckCircle size={15} /> Óptimo (&lt;3 días)
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#065F46', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                    {procurementMetrics.freshSkus} Productos
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#047857', marginTop: '2px' }}>Precios frescos validados</div>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#92400E', fontWeight: '800', fontSize: '0.75rem' }}>
                                    <Clock size={15} /> Precaución (4-7 días)
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#92400E', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                    {procurementMetrics.acceptableSkus} Productos
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#B45309', marginTop: '2px' }}>Revisar posibles alzas</div>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#DC2626', fontWeight: '800', fontSize: '0.75rem' }}>
                                    <XCircle size={15} /> Desactualizado (&gt;7 días)
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#991B1B', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                    {procurementMetrics.expiredSkus} Productos
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#DC2626', marginTop: '2px' }}>Requiere cotización Corabastos</div>
                            </div>
                        </div>
                    </div>

                    {/* ── BI SECTION 2: MATRIZ DE RENTABILIDAD TOP 20 VOLUMEN Y RENTABILIDAD VALOR TOTAL ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                    }}>
                        {/* Cabecera & Selector Multi-Criterio */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: '850', color: '#0F172A' }}>
                                        Matriz de Rentabilidad — Top 20 Volumen &amp; Rentabilidad Valor Total
                                    </h3>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        backgroundColor: '#ECFDF5',
                                        color: '#065F46',
                                        border: '1px solid #A7F3D0',
                                        padding: '2px 8px',
                                        borderRadius: '9999px'
                                    }}>
                                        BI V2 · Sticky &amp; Omnibox
                                    </span>
                                </div>
                                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Consolidado de productos líderes con volumen movilizado real, costo unitario, precio venta, facturación acumulada y utilidad bruta en pesos ($).
                                </p>
                            </div>

                            {/* Selector Multi-Criterio de Píldoras Rápidas */}
                            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F8FAFC', padding: '3px', borderRadius: '8px', border: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'volume', label: 'Top 20 Volumen (Kg)' },
                                    { id: 'total_profit', label: 'Rentabilidad Total ($)' },
                                    { id: 'revenue', label: 'Facturación Total ($)' },
                                    { id: 'spread', label: '% Margen' },
                                    { id: 'all', label: `Ver Todos (${procurementMetrics.allProductsList?.length || 0})` }
                                ].map(opt => {
                                    const isActive = opt.id === 'all' ? matrixShowAll : (!matrixShowAll && matrixSort === opt.id);
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => handleMatrixQuickPill(opt.id as any)}
                                            style={{
                                                padding: '0.32rem 0.7rem',
                                                fontSize: '0.72rem',
                                                fontWeight: isActive ? '800' : '600',
                                                backgroundColor: isActive ? '#0D7A57' : 'transparent',
                                                color: isActive ? '#FFFFFF' : '#475569',
                                                border: 'none',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Superbuscador Omnibox Universal */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            marginBottom: '0.85rem',
                            backgroundColor: '#F8FAFC',
                            padding: '0.65rem 0.85rem',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: '260px', position: 'relative' }}>
                                <Search size={16} color="#64748B" style={{ position: 'absolute', left: '10px', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    value={matrixSearch}
                                    onChange={(e) => setMatrixSearch(e.target.value)}
                                    placeholder="Buscar por producto, código contable Siigo, grupo de inventario o unidad..."
                                    style={{
                                        width: '100%',
                                        padding: '0.45rem 2rem 0.45rem 2.1rem',
                                        fontSize: '0.78rem',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '8px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#0F172A',
                                        outline: 'none',
                                        transition: 'border-color 0.15s'
                                    }}
                                />
                                {matrixSearch && (
                                    <button
                                        onClick={() => setMatrixSearch('')}
                                        style={{
                                            position: 'absolute',
                                            right: '8px',
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: '#94A3B8',
                                            display: 'flex',
                                            alignItems: 'center',
                                            padding: '2px'
                                        }}
                                        title="Limpiar búsqueda"
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>

                            {/* Badge de conteo de resultados */}
                            <div style={{
                                fontSize: '0.74rem',
                                color: '#475569',
                                fontWeight: '700',
                                fontVariantNumeric: 'tabular-nums',
                                whiteSpace: 'nowrap'
                            }}>
                                Mostrando <strong style={{ color: '#0F172A' }}>{filteredAndSortedMatrixList.length}</strong> de <strong style={{ color: '#64748B' }}>{procurementMetrics.allProductsList?.length || procurementMetrics.priceComparisonList.length}</strong> SKUs
                            </div>
                        </div>

                        {/* KPI Strip Resumen Dinámico */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            padding: '0.6rem 0.9rem',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            marginBottom: '0.85rem',
                            fontSize: '0.74rem',
                            color: '#475569',
                            fontVariantNumeric: 'tabular-nums'
                        }}>
                            <span>
                                Volumen Visible: <strong style={{ color: '#0F172A' }}>{formatNumber(matrixVisibleSummary.volume, 1)} Kg</strong>
                            </span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <span>
                                Facturación Visible: <strong style={{ color: '#0F172A' }}>{formatMoney(matrixVisibleSummary.revenue)}</strong>
                            </span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <span>
                                Rentabilidad Valor Total: <strong style={{ color: '#065F46' }}>{formatMoney(matrixVisibleSummary.profit)}</strong>
                            </span>
                            {matrixSortColumn && (
                                <>
                                    <span style={{ color: '#CBD5E1' }}>•</span>
                                    <span style={{ fontSize: '0.71rem', color: '#64748B' }}>
                                        Orden: <strong style={{ color: '#0D7A57' }}>{matrixSortColumn.toUpperCase()}</strong> ({matrixSortDir === 'desc' ? 'Mayor a menor ↓' : 'Menor a mayor ↑'})
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Contenedor con Scroll y Sticky Headers */}
                        <div style={{
                            maxHeight: '580px',
                            overflowY: 'auto',
                            overflowX: 'auto',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0'
                        }}>
                            <table style={{
                                width: '100%',
                                borderCollapse: 'separate',
                                borderSpacing: 0,
                                fontSize: '0.78rem',
                                fontVariantNumeric: 'tabular-nums'
                            }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', fontSize: '0.71rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        <th
                                            onClick={() => handleMatrixHeaderSort('index')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                width: '40px',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                <span>#</span>
                                                {matrixSortColumn === 'index' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('name')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                minWidth: '180px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Producto</span>
                                                {matrixSortColumn === 'name' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('category')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                minWidth: '140px'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Grupo Inventario</span>
                                                {matrixSortColumn === 'category' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('soldQty')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Volumen</span>
                                                {matrixSortColumn === 'soldQty' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('matrixCost')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Costo Unit. ($)</span>
                                                {matrixSortColumn === 'matrixCost' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('basePrice')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Precio Venta ($)</span>
                                                {matrixSortColumn === 'basePrice' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('totalRevenue')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Facturación ($)</span>
                                                {matrixSortColumn === 'totalRevenue' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('totalProfit')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                textAlign: 'right',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Rentabilidad ($)</span>
                                                {matrixSortColumn === 'totalProfit' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th
                                            onClick={() => handleMatrixHeaderSort('spreadPct')}
                                            style={{
                                                position: 'sticky',
                                                top: 0,
                                                zIndex: 20,
                                                backgroundColor: '#F8FAFC',
                                                borderBottom: '2px solid #CBD5E1',
                                                padding: '0.65rem 0.5rem',
                                                fontWeight: '800',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                <span>% Margen</span>
                                                {matrixSortColumn === 'spreadPct' ? (
                                                    matrixSortDir === 'desc' ? <ArrowDown size={12} color="#0D7A57" /> : <ArrowUp size={12} color="#0D7A57" />
                                                ) : (
                                                    <ArrowUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAndSortedMatrixList.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#64748B' }}>
                                                No se encontraron productos que coincidan con la búsqueda.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAndSortedMatrixList.map((p, idx) => {
                                            const isPositiveProfit = p.totalProfit >= 0;
                                            const marginBadgeBg = p.spreadPct >= 20 ? '#ECFDF5' : p.spreadPct >= 10 ? '#FFFBEB' : '#FEF2F2';
                                            const marginBadgeColor = p.spreadPct >= 20 ? '#065F46' : p.spreadPct >= 10 ? '#92400E' : '#DC2626';
                                            const marginBadgeBorder = p.spreadPct >= 20 ? '#A7F3D0' : p.spreadPct >= 10 ? '#FDE68A' : '#FECACA';

                                            return (
                                                <tr
                                                    key={p.id || idx}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FBFDFB',
                                                        transition: 'background-color 0.12s'
                                                    }}
                                                >
                                                    <td style={{
                                                        padding: '0.65rem 0.5rem',
                                                        fontWeight: '800',
                                                        color: idx < 3 ? '#0D7A57' : '#64748B',
                                                        borderBottom: '1px solid #F1F5F9'
                                                    }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', borderBottom: '1px solid #F1F5F9' }}>
                                                        <div style={{ fontWeight: '800', color: '#0F172A' }}>{p.name}</div>
                                                        {p.accountingId !== '—' && (
                                                            <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '600' }}>
                                                                Cód: {p.accountingId}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', color: '#475569', fontSize: '0.71rem', fontWeight: '600', borderBottom: '1px solid #F1F5F9' }}>
                                                        {p.category.replace(/^INVENTARIO DE /i, '')}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '800', color: '#0F172A', borderBottom: '1px solid #F1F5F9' }}>
                                                        {formatNumber(p.soldQty, 1)} <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600' }}>{p.unit}</span>
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '700', color: '#475569', borderBottom: '1px solid #F1F5F9' }}>
                                                        {formatMoney(p.matrixCost)}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '700', color: '#0F172A', borderBottom: '1px solid #F1F5F9' }}>
                                                        {formatMoney(p.basePrice)}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '800', color: '#0F172A', borderBottom: '1px solid #F1F5F9' }}>
                                                        {formatMoney(p.totalRevenue)}
                                                    </td>
                                                    <td style={{
                                                        padding: '0.65rem 0.5rem',
                                                        textAlign: 'right',
                                                        fontWeight: '900',
                                                        color: isPositiveProfit ? '#065F46' : '#DC2626',
                                                        borderBottom: '1px solid #F1F5F9'
                                                    }}>
                                                        {formatMoney(p.totalProfit)}
                                                    </td>
                                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', borderBottom: '1px solid #F1F5F9' }}>
                                                        <span style={{
                                                            fontWeight: '850',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.72rem',
                                                            backgroundColor: marginBadgeBg,
                                                            color: marginBadgeColor,
                                                            border: `1px solid ${marginBadgeBorder}`
                                                        }}>
                                                            {p.spreadPct}%
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área de Abastecimiento & Precios"
                        description="Descargue la matriz completa de costos y precios de venta: costos de adquisición en Corabastos/campo, precios base y márgenes de rentabilidad calculados."
                        onDownload={() => handleExportExcel('procurement')}
                        exporting={exporting}
                    />
                </div>
            )}

            {/* Modal de Historial Auditable de Reposiciones y Garantías */}
            {showWarrantyHistoryModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '900px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <ShieldAlert size={18} color="#DC2626" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 850, color: '#0F172A' }}>
                                        Historial Forense de Reposiciones & Garantías ($0 COP)
                                    </h3>
                                </div>
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Trazabilidad de {repositionOrdersList.length} despachos autorizados por calidad valorizados a costo de inventario real.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowWarrantyHistoryModal(false)}
                                style={{
                                    backgroundColor: 'transparent',
                                    border: 'none',
                                    color: '#64748B',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '6px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Summary Ribbon */}
                        <div style={{
                            display: 'flex',
                            gap: '12px',
                            padding: '0.85rem 1.5rem',
                            backgroundColor: '#FFFBEB',
                            borderBottom: '1px solid #FDE68A',
                            flexWrap: 'wrap',
                            alignItems: 'center'
                        }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#92400E' }}>
                                Costo Cedido Total: {formatMoney(warrantyTrend.totalCost)}
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#78350F' }}>
                                • Volumen: {formatNumber(warrantyTrend.totalKg, 1)} Kg
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#78350F' }}>
                                • {warrantyTrend.totalCases} Pedidos a $0 COP
                            </div>
                            <div style={{ marginLeft: 'auto' }}>
                                <button
                                    onClick={async () => {
                                        const XLSX = await import('xlsx');
                                        const wb = XLSX.utils.book_new();
                                        const data = repositionOrdersList.map(r => ({
                                            'Consecutivo': `#PED-${r.sequence_id}`,
                                            'Fecha': r.displayDate,
                                            'Cliente': r.clientName,
                                            'Kilaje Repuesto (Kg)': r.weightKg,
                                            'Costo Estimado ($ COP)': r.estimatedCost,
                                            'Ítems': r.itemsCount,
                                            'Notas / Amparo': r.adminNotes
                                        }));
                                        const ws = XLSX.utils.json_to_sheet(data);
                                        XLSX.utils.book_append_sheet(wb, ws, 'Garantias');
                                        XLSX.writeFile(wb, `Frufresco_Garantias_Reposiciones_${new Date().toISOString().split('T')[0]}.xlsx`);
                                    }}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#15803D',
                                        color: '#FFFFFF',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '0.35rem 0.75rem',
                                        fontSize: '0.72rem',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    <FileSpreadsheet size={14} />
                                    Descargar Excel
                                </button>
                            </div>
                        </div>

                        {/* Modal Body Table */}
                        <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                                        <th style={{ padding: '0.5rem' }}>Folio</th>
                                        <th style={{ padding: '0.5rem' }}>Fecha</th>
                                        <th style={{ padding: '0.5rem' }}>Cliente</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Kilaje</th>
                                        <th style={{ padding: '0.5rem', textAlign: 'right' }}>Costo Asumido</th>
                                        <th style={{ padding: '0.5rem' }}>Motivo / Amparo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {repositionOrdersList.map((r, idx) => (
                                        <tr key={r.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '0.6rem 0.5rem', fontWeight: 800, color: '#0D7A57' }}>
                                                #PED-{r.sequence_id}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.5rem', color: '#64748B' }}>
                                                {r.displayDate}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.5rem', fontWeight: 700, color: '#0F172A' }}>
                                                {r.clientName}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 700 }}>
                                                {formatNumber(r.weightKg, 1)} Kg
                                            </td>
                                            <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', fontWeight: 850, color: '#DC2626' }}>
                                                {formatMoney(r.estimatedCost)}
                                            </td>
                                            <td style={{ padding: '0.6rem 0.5rem', color: '#475569', fontSize: '0.72rem', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.adminNotes}>
                                                {r.adminNotes}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── SUBCOMPONENTES VISUALES BI & SVG CHARTS ──

function BITimeSeriesChart({
    data,
    metric
}: {
    data: {
        date: string;
        displayDate: string;
        sales: number;
        kg: number;
        orders: number;
        profit: number;
        warrantyCost?: number;
        warrantyKg?: number;
        warrantyOrders?: number;
        warrantyClients?: string[];
    }[];
    metric: 'sales' | 'kg' | 'orders' | 'profit' | 'warranties';
}) {
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    if (!data || data.length === 0) {
        return (
            <div style={{ height: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: '12px', color: '#94A3B8', fontSize: '0.82rem' }}>
                <Info size={24} style={{ marginBottom: '6px', color: '#CBD5E1' }} />
                <span>No hay datos registrados en el rango de fechas seleccionado</span>
            </div>
        );
    }

    const isHistogram = metric === 'warranties';
    const values = data.map(d => isHistogram ? (d.warrantyCost || 0) : d[metric]);
    const maxVal = Math.max(...values, isHistogram ? 100000 : 1);
    const minVal = 0;
    const height = 180;
    const width = 800;
    const paddingX = 40;
    const paddingY = 25;

    const points = data.map((d, i) => {
        const val = isHistogram ? (d.warrantyCost || 0) : d[metric];
        const x = paddingX + (i / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
        const y = height - paddingY - ((val - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
        return { x, y, item: d, val };
    });

    const pathD = points.length > 1
        ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
        : `M ${paddingX} ${height / 2} L ${width - paddingX} ${height / 2}`;

    const areaD = points.length > 1 && !isHistogram
        ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
        : '';

    // Trendline calculation for histogram (moving average window 5)
    const trendlinePoints = (!isHistogram || points.length < 2)
        ? []
        : points.map((p, idx) => {
            const start = Math.max(0, idx - 2);
            const end = Math.min(points.length, idx + 3);
            const slice = points.slice(start, end);
            const avgY = slice.reduce((acc, curr) => acc + curr.y, 0) / slice.length;
            return { x: p.x, y: avgY };
        });

    const trendlinePath = trendlinePoints.length > 1
        ? `M ${trendlinePoints[0].x} ${trendlinePoints[0].y} ` + trendlinePoints.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
        : '';

    const formatVal = (v: number) => {
        if (metric === 'sales' || metric === 'profit' || metric === 'warranties') return formatMoney(v);
        if (metric === 'kg') return `${formatNumber(v, 1)} Kg`;
        return `${formatNumber(v, 0)} ord`;
    };

    const stepWidth = (width - paddingX * 2) / Math.max(data.length - 1, 1);
    const barWidth = Math.max(6, Math.min(22, stepWidth * 0.75));

    return (
        <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                style={{ width: '100%', height: '220px', overflow: 'visible' }}
            >
                <defs>
                    <linearGradient id="biAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0D7A57" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#0D7A57" stopOpacity="0.0" />
                    </linearGradient>
                </defs>

                {/* Gridlines */}
                {[0, 0.33, 0.66, 1].map((ratio, idx) => {
                    const y = height - paddingY - ratio * (height - paddingY * 2);
                    const gridVal = minVal + ratio * (maxVal - minVal);
                    return (
                        <g key={idx}>
                            <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#E2E8F0" strokeDasharray="3 3" strokeWidth="1" />
                            <text x={paddingX - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94A3B8" fontWeight="600">
                                {formatVal(gridVal)}
                            </text>
                        </g>
                    );
                })}

                {/* Linear Chart Mode (Sales, Kg, Orders, Profit) */}
                {!isHistogram && (
                    <>
                        {areaD && <path d={areaD} fill="url(#biAreaGrad)" />}
                        <path d={pathD} fill="none" stroke="#0D7A57" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        {points.map((p, i) => (
                            <g key={i}>
                                <circle
                                    cx={p.x}
                                    cy={p.y}
                                    r={hoverIndex === i ? 6 : 3.5}
                                    fill={hoverIndex === i ? '#0D7A57' : '#FFFFFF'}
                                    stroke="#0D7A57"
                                    strokeWidth="2.5"
                                    style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={() => setHoverIndex(i)}
                                    onMouseLeave={() => setHoverIndex(null)}
                                />
                                {(data.length <= 15 || i % Math.ceil(data.length / 10) === 0) && (
                                    <text x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="#64748B" fontWeight="600">
                                        {p.item.displayDate}
                                    </text>
                                )}
                            </g>
                        ))}
                    </>
                )}

                {/* Histogram Mode (Warranties & Repositions Cost) */}
                {isHistogram && (
                    <>
                        {/* Bars */}
                        {points.map((p, i) => {
                            const val = p.val;
                            const barH = Math.max(3, height - paddingY - p.y);
                            const barY = height - paddingY - barH;
                            const isHigh = val > 200000;
                            const isMid = val > 0 && val <= 200000;
                            const barFill = val === 0 ? '#E2E8F0' : isHigh ? '#DC2626' : '#D97706';
                            const isHovered = hoverIndex === i;

                            return (
                                <g key={i}>
                                    <rect
                                        x={p.x - barWidth / 2}
                                        y={barY}
                                        width={barWidth}
                                        height={barH}
                                        rx={Math.min(4, barWidth / 2)}
                                        fill={barFill}
                                        fillOpacity={isHovered ? 1 : 0.85}
                                        stroke={isHovered ? '#0F172A' : 'none'}
                                        strokeWidth={1.5}
                                        style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                                        onMouseEnter={() => setHoverIndex(i)}
                                        onMouseLeave={() => setHoverIndex(null)}
                                    />
                                    {(data.length <= 15 || i % Math.ceil(data.length / 10) === 0) && (
                                        <text x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="#64748B" fontWeight="600">
                                            {p.item.displayDate}
                                        </text>
                                    )}
                                </g>
                            );
                        })}

                        {/* Trendline over histogram */}
                        {trendlinePath && (
                            <path
                                d={trendlinePath}
                                fill="none"
                                stroke="#991B1B"
                                strokeWidth="2.5"
                                strokeDasharray="4 3"
                                strokeLinecap="round"
                            />
                        )}
                    </>
                )}
            </svg>

            {/* Hover Tooltip */}
            {hoverIndex !== null && points[hoverIndex] && (
                <div style={{
                    position: 'absolute',
                    top: '10px',
                    left: `${(points[hoverIndex].x / width) * 100}%`,
                    transform: 'translateX(-50%)',
                    backgroundColor: '#0F172A',
                    color: '#FFFFFF',
                    padding: '0.45rem 0.85rem',
                    borderRadius: '8px',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    pointerEvents: 'none',
                    boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                    whiteSpace: 'nowrap',
                    zIndex: 10
                }}>
                    <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>Fecha: {points[hoverIndex].item.date}</div>
                    <div style={{ color: isHistogram ? '#FCA5A5' : '#34D399', fontSize: '0.85rem', fontWeight: '900', marginTop: '2px' }}>
                        {isHistogram
                            ? `Costo Fuga: ${formatMoney(points[hoverIndex].item.warrantyCost || 0)}`
                            : formatVal(points[hoverIndex].item[metric])}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#E2E8F0', marginTop: '2px' }}>
                        {isHistogram
                            ? `${points[hoverIndex].item.warrantyOrders || 0} garantías • ${formatNumber(points[hoverIndex].item.warrantyKg || 0, 1)} Kg cedidos`
                            : `${points[hoverIndex].item.orders} pedidos • ${formatNumber(points[hoverIndex].item.kg, 1)} Kg`}
                    </div>
                    {isHistogram && points[hoverIndex].item.warrantyClients && points[hoverIndex].item.warrantyClients.length > 0 && (
                        <div style={{ fontSize: '0.62rem', color: '#CBD5E1', marginTop: '3px', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {points[hoverIndex].item.warrantyClients.slice(0, 2).join(', ')}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function BIChannelPerformanceMatrix({ metrics }: { metrics: any }) {
    const totalSales = metrics.totalSales || 1;
    const b2bSales = metrics.b2bSales || 0;
    const b2cSales = metrics.b2cSales || 0;

    const b2bSalesMix = Math.min(Math.max((b2bSales / totalSales) * 100, 0), 100);
    const b2cSalesMix = Math.max(100 - b2bSalesMix, 0);

    const grossProfit = metrics.grossProfit || 1;
    const b2bProfit = metrics.b2bProfit || 0;
    const b2cProfit = metrics.b2cProfit || 0;

    const b2bProfitMix = grossProfit > 0 ? Math.min(Math.max((b2bProfit / grossProfit) * 100, 0), 100) : 100;
    const b2cProfitMix = Math.max(100 - b2bProfitMix, 0);

    const b2bMargin = metrics.b2bMarginPct || 0;
    const b2cMargin = metrics.b2cMarginPct || 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {/* 1. BARRAS COMPARATIVAS DUALES (Mix Venta vs Mix Utilidad) */}
            <div style={{
                backgroundColor: '#F8FAFC',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
            }}>
                {/* Mix Facturación */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '800', color: '#0F172A' }}>
                            <DollarSign size={13} color="#0D7A57" strokeWidth={2.4} />
                            <span>Mix Facturación ($)</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                            <span style={{ color: '#0D7A57' }}>B2B: {b2bSalesMix.toFixed(1)}%</span>
                            <span style={{ margin: '0 4px', color: '#CBD5E1' }}>|</span>
                            <span style={{ color: '#0284C7' }}>B2C: {b2cSalesMix.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div style={{ height: '8px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${b2bSalesMix}%`, backgroundColor: '#0D7A57', transition: 'width 0.4s ease' }} />
                        <div style={{ width: `${b2cSalesMix}%`, backgroundColor: '#0284C7', transition: 'width 0.4s ease' }} />
                    </div>
                </div>

                {/* Mix Utilidad Bruta */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.73rem', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: '800', color: '#0F172A' }}>
                            <BarChart3 size={13} color="#2563EB" strokeWidth={2.4} />
                            <span>Mix Utilidad Bruta ($)</span>
                        </div>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700' }}>
                            <span style={{ color: '#0D7A57' }}>B2B: {b2bProfitMix.toFixed(1)}%</span>
                            <span style={{ margin: '0 4px', color: '#CBD5E1' }}>|</span>
                            <span style={{ color: '#0284C7' }}>B2C: {b2cProfitMix.toFixed(1)}%</span>
                        </div>
                    </div>
                    <div style={{ height: '8px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '999px', overflow: 'hidden', display: 'flex' }}>
                        <div style={{ width: `${b2bProfitMix}%`, backgroundColor: '#059669', transition: 'width 0.4s ease' }} />
                        <div style={{ width: `${b2cProfitMix}%`, backgroundColor: '#38BDF8', transition: 'width 0.4s ease' }} />
                    </div>
                </div>
            </div>

            {/* 2. TARJETAS DE DESGLOSE FINANCIERO PROFUNDO POR CANAL */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                {/* B2B Card */}
                <div style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: '#F0FDF4',
                    borderRadius: '12px',
                    border: '1.5px solid #BBF7D0',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Building2 size={16} color="#0D7A57" strokeWidth={2.2} />
                            <span style={{ fontSize: '0.82rem', fontWeight: '850', color: '#14532D' }}>B2B Institucional</span>
                        </div>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '850',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: '#DCFCE7',
                            color: '#15803D'
                        }}>
                            {b2bSalesMix.toFixed(1)}% Venta
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Facturación</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>{formatMoney(b2bSales)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Utilidad Bruta</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0D7A57' }}>{formatMoney(b2bProfit)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #DCFCE7' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#166534' }}>
                            % Margen Bruto:
                        </span>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '900',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: b2bMargin >= 20 ? '#DCFCE7' : '#FEF3C7',
                            color: b2bMargin >= 20 ? '#15803D' : '#B45309'
                        }}>
                            {b2bMargin.toFixed(1)}%
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569', fontWeight: '600', paddingTop: '2px' }}>
                        <span>Órdenes: <strong>{metrics.b2bOrdersCount || 0}</strong></span>
                        <span>Volumen: <strong>{formatNumber(metrics.b2bKg || 0, 0)} Kg</strong></span>
                        <span>Ticket: <strong>{formatMoney(metrics.b2bAvgTicket || 0)}</strong></span>
                    </div>
                </div>

                {/* B2C Card */}
                <div style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: '#F0F9FF',
                    borderRadius: '12px',
                    border: '1.5px solid #BAE6FD',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.04)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Home size={16} color="#0284C7" strokeWidth={2.2} />
                            <span style={{ fontSize: '0.82rem', fontWeight: '850', color: '#075985' }}>B2C Hogar</span>
                        </div>
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: '850',
                            padding: '2px 7px',
                            borderRadius: '6px',
                            backgroundColor: '#E0F2FE',
                            color: '#0369A1'
                        }}>
                            {b2cSalesMix.toFixed(1)}% Venta
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '2px' }}>
                        <div>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Facturación</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>{formatMoney(b2cSales)}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Utilidad Bruta</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0284C7' }}>{formatMoney(b2cProfit)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid #E0F2FE' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0369A1' }}>
                            % Margen Bruto:
                        </span>
                        <span style={{
                            fontSize: '0.75rem',
                            fontWeight: '900',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            backgroundColor: b2cMargin >= 25 ? '#DCFCE7' : (b2cMargin >= 15 ? '#FEF3C7' : '#FEE2E2'),
                            color: b2cMargin >= 25 ? '#15803D' : (b2cMargin >= 15 ? '#B45309' : '#B91C1C')
                        }}>
                            {b2cMargin.toFixed(1)}%
                        </span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#475569', fontWeight: '600', paddingTop: '2px' }}>
                        <span>Órdenes: <strong>{metrics.b2cOrdersCount || 0}</strong></span>
                        <span>Volumen: <strong>{formatNumber(metrics.b2cKg || 0, 0)} Kg</strong></span>
                        <span>Ticket: <strong>{formatMoney(metrics.b2cAvgTicket || 0)}</strong></span>
                    </div>
                </div>
            </div>

            {/* 3. INSIGHT DE INTELIGENCIA DE CANALES */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '0.65rem 0.85rem',
                backgroundColor: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '0.72rem',
                color: '#475569'
            }}>
                <Sparkles size={14} color="#0D7A57" style={{ flexShrink: 0 }} />
                <span>
                    <strong>Lectura Estratégica:</strong> El canal Institucional B2B aporta el <strong>{b2cSalesMix < 100 ? b2bProfitMix.toFixed(1) : '0'}%</strong> de la utilidad neta operativa con margen del <strong>{b2bMargin.toFixed(1)}%</strong>, mientras Hogar B2C registra un margen del <strong>{b2cMargin.toFixed(1)}%</strong>.
                </span>
            </div>
        </div>
    );
}

function BIProductParetoRanking({ products, sortBy = 'volume' }: { products: any[]; sortBy?: 'volume' | 'profit' | 'revenue' }) {
    if (!products || products.length === 0) {
        return <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No hay ventas registradas en el período</div>;
    }

    const maxMetric = Math.max(
        ...products.map(p => sortBy === 'volume' ? p.qty : sortBy === 'profit' ? Math.max(p.profit, 0) : p.revenue),
        1
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px', fontVariantNumeric: 'tabular-nums' }}>
            {products.map((p, idx) => {
                const metricVal = sortBy === 'volume' ? p.qty : sortBy === 'profit' ? Math.max(p.profit, 0) : p.revenue;
                const widthPct = Math.max(Math.round((metricVal / maxMetric) * 100), 4);
                return (
                    <div key={p.id || idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', marginBottom: '3px', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: idx < 3 ? '#ECFDF5' : '#F1F5F9', color: idx < 3 ? '#065F46' : '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.64rem', fontWeight: '800', flexShrink: 0 }}>
                                    {idx + 1}
                                </span>
                                <span style={{ fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: '700', flexShrink: 0 }}>
                                    {formatNumber(p.qty, 1)} {p.unit || 'Kg'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600' }} title="Facturación Total">
                                    Venta: {formatMoney(p.revenue)}
                                </span>
                                <span style={{ fontWeight: '900', color: p.profit >= 0 ? '#065F46' : '#DC2626', fontSize: '0.73rem' }} title="Rentabilidad Valor Total ($)">
                                    Util: {formatMoney(p.profit)}
                                </span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: '850',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: p.marginPct >= 20 ? '#ECFDF5' : p.marginPct >= 10 ? '#FFFBEB' : '#FEF2F2',
                                    color: p.marginPct >= 20 ? '#065F46' : p.marginPct >= 10 ? '#92400E' : '#DC2626',
                                    border: `1px solid ${p.marginPct >= 20 ? '#A7F3D0' : p.marginPct >= 10 ? '#FDE68A' : '#FECACA'}`
                                }}>
                                    {p.marginPct}%
                                </span>
                            </div>
                        </div>

                        <div style={{ height: '6px', width: '100%', backgroundColor: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${widthPct}%`,
                                backgroundColor: idx < 3 ? '#0D7A57' : idx < 10 ? '#047857' : '#059669',
                                borderRadius: '999px'
                            }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function BIMovementFlowChart({ movements }: { movements: { date: string; displayDate: string; inbound: number; outbound: number; waste: number }[] }) {
    if (!movements || movements.length === 0) {
        return (
            <div style={{ height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderRadius: '10px', color: '#94A3B8', fontSize: '0.8rem' }}>
                No hay movimientos de inventario en el período seleccionado
            </div>
        );
    }

    const maxKg = Math.max(...movements.map(m => Math.max(m.inbound, m.outbound, m.waste)), 10);

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', height: '180px', paddingTop: '20px', overflowX: 'auto', paddingBottom: '10px' }}>
            {movements.map((m, idx) => {
                const inHeight = Math.max((m.inbound / maxKg) * 120, 4);
                const outHeight = Math.max((m.outbound / maxKg) * 120, 4);
                const wasteHeight = Math.max((m.waste / maxKg) * 120, 2);

                return (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: '1 0 45px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '130px' }}>
                            {/* Inbound Bar */}
                            <div
                                title={`Entradas: ${formatNumber(m.inbound, 1)} Kg`}
                                style={{ width: '10px', height: `${inHeight}px`, backgroundColor: '#0D7A57', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Outbound Bar */}
                            <div
                                title={`Salidas: ${formatNumber(m.outbound, 1)} Kg`}
                                style={{ width: '10px', height: `${outHeight}px`, backgroundColor: '#475569', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Waste Bar */}
                            <div
                                title={`Mermas: ${formatNumber(m.waste, 1)} Kg`}
                                style={{ width: '6px', height: `${wasteHeight}px`, backgroundColor: '#DC2626', borderRadius: '2px 2px 0 0' }}
                            />
                        </div>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>{m.displayDate}</span>
                    </div>
                );
            })}
        </div>
    );
}

function BIFunnelChart({ stages }: { stages: any[] }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
            {stages.map((st, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: '220px', fontSize: '0.78rem', fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ color: st.color }}>{st.icon}</div>
                        <span>{st.name}</span>
                    </div>

                    <div style={{ flex: 1, height: '28px', backgroundColor: '#F1F5F9', borderRadius: '8px', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center' }}>
                        <div style={{
                            height: '100%',
                            width: `${st.pct}%`,
                            backgroundColor: st.color,
                            borderRadius: '8px',
                            transition: 'width 0.6s ease'
                        }} />
                        <span style={{
                            position: 'absolute',
                            left: '12px',
                            fontSize: '0.78rem',
                            fontWeight: '900',
                            color: st.pct > 30 ? '#FFFFFF' : '#0F172A'
                        }}>
                            {st.count} cuentas ({st.pct}%)
                        </span>
                    </div>

                    {i < stages.length - 1 && (
                        <div style={{ width: '65px', fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textAlign: 'right' }}>
                            {stages[i + 1].pct}% conv
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

function AreaKPICard({
    title,
    value,
    subtitle,
    icon,
    badgeText,
    badgeBg,
    badgeColor
}: {
    title: string;
    value: string | number;
    subtitle: string;
    icon: React.ReactNode;
    badgeText: string;
    badgeBg: string;
    badgeColor: string;
}) {
    return (
        <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            padding: '1.2rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
            minHeight: '140px',
            transition: 'all 0.15s ease'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {title}
                    </span>
                    <div style={{ fontSize: '1.65rem', fontWeight: '900', color: '#0F172A', marginTop: '0.2rem', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                        {value}
                    </div>
                </div>
                <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: badgeBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                }}>
                    {icon}
                </div>
            </div>

            <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                <span style={{ color: '#64748B', fontWeight: '500' }}>
                    {subtitle}
                </span>
                <span style={{
                    backgroundColor: badgeBg,
                    color: badgeColor,
                    fontWeight: '800',
                    fontSize: '0.68rem',
                    padding: '1px 7px',
                    borderRadius: '10px'
                }}>
                    {badgeText}
                </span>
            </div>
        </div>
    );
}

function DownloadCallout({
    areaTitle,
    description,
    onDownload,
    exporting
}: {
    areaTitle: string;
    description: string;
    onDownload: () => void;
    exporting: boolean;
}) {
    return (
        <div style={{
            backgroundColor: '#F0FDF4',
            borderRadius: '14px',
            border: '1px solid #BBF7D0',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
        }}>
            <div style={{ flex: '1 1 400px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileSpreadsheet size={20} color="#15803D" />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '850', color: '#14532D' }}>
                        Descarga Completa de Datos ({areaTitle})
                    </h3>
                </div>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: '#166534', lineHeight: 1.4 }}>
                    {description}
                </p>
            </div>

            <button
                onClick={onDownload}
                disabled={exporting}
                style={{
                    backgroundColor: '#15803D',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '0.65rem 1.35rem',
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(21, 128, 61, 0.25)',
                    transition: 'all 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#166534'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#15803D'}
            >
                <Download size={16} />
                <span>{exporting ? 'Generando archivo...' : 'Exportar a Excel (.xlsx)'}</span>
            </button>
        </div>
    );
}
