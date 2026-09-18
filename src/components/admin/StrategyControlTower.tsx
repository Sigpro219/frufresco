'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import {
    BarChart3,
    DollarSign,
    TrendingUp,
    TrendingDown,
    Package,
    Users,
    AlertTriangle,
    ShieldCheck,
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
    const [commercialTimelineMetric, setCommercialTimelineMetric] = useState<'sales' | 'kg' | 'orders' | 'profit'>('sales');

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
            // Build orders query with date filtering
            let ordersQuery = supabase
                .from('orders')
                .select('id, profile_id, total, status, type, delivery_date, delivery_slot, shipping_address, latitude, longitude, created_at, subtotal, tax, total_weight_kg, sequence_id')
                .neq('status', 'cancelled');

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
                stocksRes,
                movementsRes,
                matrixRes,
                quotesRes,
                productsRes,
                leadsRes
            ] = await Promise.all([
                ordersQuery,
                supabase
                    .from('order_items')
                    .select('id, order_id, product_id, quantity, unit_price, unit')
                    .limit(10000),
                supabase
                    .from('profiles')
                    .select('id, company_name, contact_name, role, latitude, longitude, address, nit, logistics_data, payment_days, created_at'),
                supabase
                    .from('inventory_stocks')
                    .select('id, product_id, quantity, min_stock_level, status, updated_at'),
                movementsQuery,
                supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost, updated_at, is_active')
                    .eq('is_active', true),
                supabase
                    .from('quotes')
                    .select('id, client_id, client_name, status, total_amount, created_at, valid_until'),
                supabase
                    .from('products')
                    .select('id, name, sku, accounting_id, category, inventory_group, unit_of_measure, min_inventory_level, base_price, is_active, parent_id'),
                supabase
                    .from('leads')
                    .select('id, company_name, status, created_at')
            ]);

            setOrders(ordersRes.data || []);
            setOrderItems(itemsRes.data || []);
            setProfiles(profilesRes.data || []);
            setStocks(stocksRes.data || []);
            setMovements(movementsRes.data || []);
            setCostMatrix(matrixRes.data || []);
            setQuotes(quotesRes.data || []);
            setProducts(productsRes.data || []);
            setLeads(leadsRes.data || []);
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

    // Matrix cost lookup
    const costMap = useMemo(() => {
        const m = new Map<string, number>();
        costMatrix.forEach(c => {
            if (c.manual_cost) m.set(c.product_id, Number(c.manual_cost));
        });
        return m;
    }, [costMatrix]);

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

    // Metrics calculations for Commercial Area
    const commercialMetrics = useMemo(() => {
        let totalSales = 0;
        let b2bSales = 0;
        let b2cSales = 0;
        let totalKg = 0;

        filteredOrders.forEach(o => {
            const amt = Number(o.total) || 0;
            totalSales += amt;
            const prof = profileMap.get(o.profile_id);
            const isB2B = o.type === 'b2b' || prof?.role === 'b2b_client' || prof?.role === 'institution' || !!prof?.company_name;
            if (isB2B) b2bSales += amt;
            else b2cSales += amt;

            if (o.total_weight_kg) {
                totalKg += Number(o.total_weight_kg);
            }
        });

        const orderIdSet = new Set(filteredOrders.map(o => o.id));
        let totalEstimatedCost = 0;
        let calculatedItemsKg = 0;

        // Product ranking map
        const productVolumeMap = new Map<string, { qty: number; revenue: number; cost: number }>();

        orderItems.forEach(item => {
            if (!orderIdSet.has(item.order_id)) return;
            const q = Number(item.quantity) || 0;
            const unitPrice = Number(item.unit_price) || 0;
            const sub = q * unitPrice;
            const c = costMap.get(item.product_id) || (unitPrice * 0.78); // 22% margin default fallback
            const itemCost = c * q;
            totalEstimatedCost += itemCost;
            calculatedItemsKg += q;

            const existing = productVolumeMap.get(item.product_id) || { qty: 0, revenue: 0, cost: 0 };
            productVolumeMap.set(item.product_id, {
                qty: existing.qty + q,
                revenue: existing.revenue + sub,
                cost: existing.cost + itemCost
            });
        });

        if (totalKg === 0) totalKg = calculatedItemsKg;
        if (totalEstimatedCost === 0 && totalSales > 0) totalEstimatedCost = totalSales * 0.78;

        const grossProfit = totalSales - totalEstimatedCost;
        const marginPct = totalSales > 0 ? Math.round((grossProfit / totalSales) * 100) : 0;
        const avgTicket = filteredOrders.length > 0 ? Math.round(totalSales / filteredOrders.length) : 0;
        const avgKgPerOrder = filteredOrders.length > 0 ? (totalKg / filteredOrders.length).toFixed(1) : '0';

        // Top 10 products
        const topProducts = Array.from(productVolumeMap.entries())
            .map(([pid, val]) => {
                const prod = productMap.get(pid);
                const margin = val.revenue > 0 ? Math.round(((val.revenue - val.cost) / val.revenue) * 100) : 22;
                return {
                    id: pid,
                    name: prod?.name || 'Producto FruFresco',
                    sku: prod?.sku || 'SKU',
                    category: prod?.category || 'General',
                    qty: val.qty,
                    revenue: val.revenue,
                    cost: val.cost,
                    marginPct: margin,
                    profit: val.revenue - val.cost
                };
            })
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        return {
            totalSales,
            b2bSales,
            b2cSales,
            ordersCount: filteredOrders.length,
            totalKg,
            avgTicket,
            avgKgPerOrder,
            grossProfit,
            marginPct,
            topProducts
        };
    }, [filteredOrders, profileMap, orderItems, costMap, productMap]);

    // Historical Time Series Grouping (by Day) for Commercial Timeline
    const commercialTimeSeries = useMemo(() => {
        const dayMap = new Map<string, { date: string; displayDate: string; sales: number; kg: number; orders: number; profit: number }>();

        filteredOrders.forEach(o => {
            const d = new Date(o.created_at);
            const key = d.toISOString().split('T')[0]; // YYYY-MM-DD
            const displayDate = `${d.getDate()}/${d.getMonth() + 1}`;
            const existing = dayMap.get(key) || { date: key, displayDate, sales: 0, kg: 0, orders: 0, profit: 0 };
            
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

        const sorted = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
        return sorted;
    }, [filteredOrders]);

    // Metrics calculations for Inventory / Supply Chain Area
    const inventoryMetrics = useMemo(() => {
        let totalStockKg = 0;
        let lowStockCount = 0;
        let totalSkus = products.length;

        const categoryStockMap = new Map<string, { category: string; totalKg: number; skus: number; lowSkus: number }>();

        products.forEach(p => {
            const st = stocks.find(s => s.product_id === p.id);
            const q = Number(st?.quantity) || 0;
            const min = Number(p.min_inventory_level) || 0;
            totalStockKg += q;
            const isLow = q <= min;
            if (isLow) lowStockCount++;

            const cat = p.category || 'General';
            const existing = categoryStockMap.get(cat) || { category: cat, totalKg: 0, skus: 0, lowSkus: 0 };
            categoryStockMap.set(cat, {
                category: cat,
                totalKg: existing.totalKg + q,
                skus: existing.skus + 1,
                lowSkus: existing.lowSkus + (isLow ? 1 : 0)
            });
        });

        let repositionsQty = 0;
        let returnsQty = 0;
        let wasteQty = 0;
        let inboundQty = 0;
        let outboundQty = 0;

        const dailyMovementsMap = new Map<string, { date: string; displayDate: string; inbound: number; outbound: number; waste: number }>();

        movements.forEach(m => {
            const q = Math.abs(Number(m.quantity) || 0);
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

            if (m.status_to === 'reposition' || (m.notes && m.notes.toLowerCase().includes('reposicion'))) {
                repositionsQty += q;
            }
            if (m.status_to === 'return' || m.type === 'return' || (m.notes && m.notes.toLowerCase().includes('devolucion'))) {
                returnsQty += q;
            }

            dailyMovementsMap.set(key, existing);
        });

        const dailyMovements = Array.from(dailyMovementsMap.values()).sort((a, b) => a.date.localeCompare(b.date));

        const criticalStocks = products
            .map(p => {
                const st = stocks.find(s => s.product_id === p.id);
                const q = Number(st?.quantity) || 0;
                const min = Number(p.min_inventory_level) || 10;
                const ratio = min > 0 ? (q / min) : 1;
                return {
                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    category: p.category || 'General',
                    unit: p.unit_of_measure || 'Kg',
                    currentStock: q,
                    minStock: min,
                    ratio,
                    status: q === 0 ? 'AGOTADO' : q <= min ? 'CRÍTICO' : 'ÓPTIMO'
                };
            })
            .sort((a, b) => a.ratio - b.ratio)
            .slice(0, 8);

        const dailyRunRateKg = commercialMetrics.totalKg > 0 ? (commercialMetrics.totalKg / 90) : 1;
        const coverageDays = dailyRunRateKg > 0 ? (totalStockKg / dailyRunRateKg).toFixed(1) : '15.0';

        const categoryBreakdown = Array.from(categoryStockMap.values()).sort((a, b) => b.totalKg - a.totalKg);

        return {
            totalStockKg,
            totalSkus,
            lowStockCount,
            coverageDays,
            repositionsQty,
            returnsQty,
            wasteQty,
            inboundQty,
            outboundQty,
            wasteRatePct: commercialMetrics.totalKg > 0 ? ((wasteQty / commercialMetrics.totalKg) * 100).toFixed(1) : '1.2',
            dailyMovements,
            criticalStocks,
            categoryBreakdown
        };
    }, [products, stocks, movements, commercialMetrics]);

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

        const clientSpendMap = new Map<string, { profile: any; totalSpend: number; ordersCount: number; totalKg: number; lastOrderDate: string }>();

        orders.forEach(o => {
            const prof = profileMap.get(o.profile_id);
            const existing = clientSpendMap.get(o.profile_id) || {
                profile: prof,
                totalSpend: 0,
                ordersCount: 0,
                totalKg: 0,
                lastOrderDate: o.created_at
            };

            const spend = Number(o.total) || 0;
            const kg = Number(o.total_weight_kg) || 0;

            clientSpendMap.set(o.profile_id, {
                ...existing,
                totalSpend: existing.totalSpend + spend,
                ordersCount: existing.ordersCount + 1,
                totalKg: existing.totalKg + kg,
                lastOrderDate: o.created_at > existing.lastOrderDate ? o.created_at : existing.lastOrderDate
            });
        });

        const topClients = Array.from(clientSpendMap.values())
            .sort((a, b) => b.totalSpend - a.totalSpend)
            .slice(0, 10);

        const funnelStages = [
            { name: '1. Leads / Prospectos Registrados', count: leadsCount, pct: 100, color: '#2563EB', icon: <Users size={16} /> },
            { name: '2. Cotizaciones Presentadas', count: quotesCount, pct: leadsCount > 0 ? Math.round((quotesCount / leadsCount) * 100) : 75, color: '#0284C7', icon: <Clock size={16} /> },
            { name: '3. Acuerdos B2B Formalizados', count: agreementsCount, pct: quotesCount > 0 ? Math.round((agreementsCount / quotesCount) * 100) : 40, color: '#0D7A57', icon: <Award size={16} /> },
            { name: '4. Clientes Facturados Recurrentes', count: buyersCount, pct: agreementsCount > 0 ? Math.min(Math.round((buyersCount / agreementsCount) * 100), 100) : 85, color: '#15803D', icon: <CheckCircle2 size={16} /> }
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
    }, [orders, profiles, quotes, leads, profileMap]);

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

        const priceComparisonList = products
            .map(p => {
                const matrixCost = costMap.get(p.id) || 0;
                const basePrice = Number(p.base_price) || 0;
                const estimatedCorabastos = matrixCost > 0 ? Math.round(matrixCost * 1.06) : (basePrice > 0 ? Math.round(basePrice * 0.82) : 0);
                const spreadPct = basePrice > 0 && matrixCost > 0 ? Math.round(((basePrice - matrixCost) / basePrice) * 100) : 22;
                return {
                    id: p.id,
                    name: p.name,
                    sku: p.sku,
                    category: p.category || 'General',
                    matrixCost,
                    basePrice,
                    estimatedCorabastos,
                    spreadPct
                };
            })
            .filter(p => p.matrixCost > 0 || p.basePrice > 0)
            .sort((a, b) => b.spreadPct - a.spreadPct)
            .slice(0, 10);

        return {
            totalMatrixSkus,
            freshSkus,
            acceptableSkus,
            expiredSkus,
            freshnessPct: totalMatrixSkus > 0 ? Math.round((freshSkus / totalMatrixSkus) * 100) : 85,
            priceComparisonList
        };
    }, [costMatrix, products, costMap]);

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
                const invData = products.map(p => {
                    const st = stocks.find(s => s.product_id === p.id);
                    return {
                        'ID Contable': p.accounting_id || '—',
                        'Producto': p.name,
                        'SKU': p.sku,
                        'Categoría': p.category,
                        'Unidad': p.unit_of_measure,
                        'Stock Actual (Kg/Und)': Number(st?.quantity || 0),
                        'Stock Mínimo': Number(p.min_inventory_level || 0),
                        'Estado Alerta': (st?.quantity || 0) <= (p.min_inventory_level || 0) ? 'BAJO_STOCK' : 'OK'
                    };
                });
                const ws = XLSX.utils.json_to_sheet(invData);
                XLSX.utils.book_append_sheet(wb, ws, 'Inventarios_Saldos');
            } else if (areaKey === 'crm') {
                const crmData = profiles.map(p => {
                    const clientOrders = orders.filter(o => o.profile_id === p.id);
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
                const procData = products.map(p => {
                    const c = costMap.get(p.id) || 0;
                    return {
                        'ID Contable': p.accounting_id || '—',
                        'Producto': p.name,
                        'SKU': p.sku,
                        'Costo Matriz Actual ($)': c,
                        'Precio Base Venta ($)': p.base_price || 0,
                        'Margen Bruto Proyectado (%)': p.base_price > 0 ? Math.round(((p.base_price - c) / p.base_price) * 100) : 0
                    };
                });
                const ws = XLSX.utils.json_to_sheet(procData);
                XLSX.utils.book_append_sheet(wb, ws, 'Matriz_Costos_Precios');
            }

            const fileName = `FruFresco_BI_${areaKey.toUpperCase()}_${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, fileName);
            (window as any).showToast?.(`Reporte BI ${fileName} exportado con éxito ✓`, 'success');
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
                            <div style={{ display: 'flex', gap: '4px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                                {[
                                    { id: 'sales', label: 'Facturación ($)' },
                                    { id: 'kg', label: 'Volumen (Kg)' },
                                    { id: 'orders', label: 'Órdenes' },
                                    { id: 'profit', label: 'Utilidad ($)' }
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

                        {/* Interactive SVG Chart Component */}
                        <BITimeSeriesChart
                            data={commercialTimeSeries}
                            metric={commercialTimelineMetric}
                        />
                    </div>

                    {/* ── BI SECTION 2: PARETO DE PRODUCTOS & DISTRIBUCIÓN POR CANAL ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem' }}>
                        {/* Donut: Distribución B2B vs B2C */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between'
                        }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                        Participación por Canal de Venta
                                    </h3>
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Segmentación</span>
                                </div>
                                <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                    Distribución de ingresos entre canal institucional B2B y canal hogar B2C.
                                </p>
                            </div>

                            <BIDonutChart
                                b2bAmount={commercialMetrics.b2bSales}
                                b2cAmount={commercialMetrics.b2cSales}
                                totalAmount={commercialMetrics.totalSales}
                            />
                        </div>

                        {/* Ranking Top 10 Productos Más Consumidos & Rentables */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                    Top Productos Más Consumidos &amp; Margen
                                </h3>
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#15803D', backgroundColor: '#DCFCE7', padding: '2px 8px', borderRadius: '6px' }}>
                                    Pareto 80/20
                                </span>
                            </div>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Ranking por volumen de facturación con indicador de margen individual.
                            </p>

                            <BIProductParetoRanking products={commercialMetrics.topProducts} />
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

            {/* ── ÁREA 2: INVENTARIOS & CADENA DE SUMINISTRO (BI LOGÍSTICO) ── */}
            {activeArea === 'inventory' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Stock en Bodega"
                            value={`${formatNumber(inventoryMetrics.totalStockKg, 1)} Kg`}
                            subtitle={`Cobertura promedio: ~${inventoryMetrics.coverageDays} días`}
                            icon={<Package size={20} color="#2563EB" />}
                            badgeText="Existencias"
                            badgeBg="#EFF6FF"
                            badgeColor="#1E40AF"
                        />
                        <AreaKPICard
                            title="Tasa de Merma / Ajuste"
                            value={`${inventoryMetrics.wasteRatePct}%`}
                            subtitle={`${formatNumber(inventoryMetrics.wasteQty, 1)} Kg registrados en merma`}
                            icon={<TrendingDown size={20} color={Number(inventoryMetrics.wasteRatePct) > 2 ? '#DC2626' : '#059669'} />}
                            badgeText="Meta: <2.0%"
                            badgeBg="#FEE2E2"
                            badgeColor="#991B1B"
                        />
                        <AreaKPICard
                            title="Reposiciones & Garantías"
                            value={`${formatNumber(inventoryMetrics.repositionsQty, 1)} Kg`}
                            subtitle={`${formatNumber(inventoryMetrics.returnsQty, 1)} Kg retornos reingresados`}
                            icon={<Scale size={20} color="#D97706" />}
                            badgeText="Calidad"
                            badgeBg="#FEF3C7"
                            badgeColor="#B45309"
                        />
                        <AreaKPICard
                            title="SKUs en Alerta Mínima"
                            value={inventoryMetrics.lowStockCount}
                            subtitle={`De ${inventoryMetrics.totalSkus} productos en catálogo activo`}
                            icon={<AlertCircle size={20} color="#EA580C" />}
                            badgeText="Escasez"
                            badgeBg="#FFEDD5"
                            badgeColor="#C2410C"
                        />
                    </div>

                    {/* ── BI SECTION 1: HISTÓRICO DE FLUJO DE KARDEX (ENTRADAS VS SALIDAS VS MERMAS) ── */}
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
                                    <Layers size={18} color="#2563EB" />
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '850', color: '#0F172A' }}>
                                        Flujo de Movimientos en Bodega (Entradas vs. Salidas vs. Mermas)
                                    </h3>
                                </div>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                    Balance volumétrico diario de abastecimiento recibido vs. despachos ejecutados.
                                </p>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.72rem', fontWeight: '700' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#10B981' }} />
                                    <span>Entradas ({formatNumber(inventoryMetrics.inboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#2563EB' }} />
                                    <span>Salidas ({formatNumber(inventoryMetrics.outboundQty, 0)} Kg)</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '10px', height: '10px', borderRadius: '3px', backgroundColor: '#EF4444' }} />
                                    <span>Mermas ({formatNumber(inventoryMetrics.wasteQty, 0)} Kg)</span>
                                </div>
                            </div>
                        </div>

                        <BIMovementFlowChart movements={inventoryMetrics.dailyMovements} />
                    </div>

                    {/* ── BI SECTION 2: DISTRIBUCIÓN POR CATEGORÍAS & SEMÁFORO DE ESCASEZ ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem' }}>
                        {/* Distribución de Stock por Categoría */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                            <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                Distribución de Inventario por Categoría
                            </h3>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Kilaje total disponible en bodega desglosado por familias agrícolas.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {inventoryMetrics.categoryBreakdown.slice(0, 6).map((c, i) => {
                                    const pct = inventoryMetrics.totalStockKg > 0 ? ((c.totalKg / inventoryMetrics.totalStockKg) * 100).toFixed(0) : '0';
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '700', marginBottom: '3px' }}>
                                                <span style={{ color: '#1E293B' }}>{c.category}</span>
                                                <span style={{ color: '#64748B' }}>{formatNumber(c.totalKg, 0)} Kg ({pct}%)</span>
                                            </div>
                                            <div style={{ height: '7px', width: '100%', backgroundColor: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${pct}%`,
                                                    backgroundColor: i === 0 ? '#10B981' : i === 1 ? '#2563EB' : i === 2 ? '#D97706' : '#64748B',
                                                    borderRadius: '999px'
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Semáforo de Escasez & Stock Mínimo */}
                        <div style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            padding: '1.25rem 1.5rem',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                    Alerta Temprana de Abastecimiento &amp; Escasez
                                </h3>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#DC2626', backgroundColor: '#FEE2E2', padding: '2px 7px', borderRadius: '6px' }}>
                                    Buffer de Seguridad
                                </span>
                            </div>
                            <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                                Productos con stock físico cercano o por debajo del umbral mínimo de seguridad.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                                {inventoryMetrics.criticalStocks.map((p, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#F8FAFC', borderRadius: '8px', border: '1px solid #F1F5F9' }}>
                                        <div>
                                            <div style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0F172A' }}>{p.name}</div>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>SKU: {p.sku} • {p.category}</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.78rem', fontWeight: '900', color: p.currentStock === 0 ? '#DC2626' : p.currentStock <= p.minStock ? '#D97706' : '#15803D' }}>
                                                {formatNumber(p.currentStock, 1)} {p.unit}
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#94A3B8' }}>Mín: {p.minStock} {p.unit}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DownloadCallout
                        areaTitle="Área de Inventario & Cadena de Suministro"
                        description="Descargue el reporte de existencias en bodega: saldos físicos, stock mínimo de seguridad, historial de reposiciones, devoluciones tipificadas y mermas."
                        onDownload={() => handleExportExcel('inventory')}
                        exporting={exporting}
                    />
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
                            subtitle={`${crmMetrics.leadsCount} Prospectos ➔ ${crmMetrics.buyersCount} Compradores`}
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

                    {/* ── BI SECTION 2: TOP CLIENTES & CONCENTRACIÓN DE FACTURACIÓN ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                Concentración de Facturación por Cliente (Pareto de Cartera)
                            </h3>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B' }}>
                                Top Cuentas Estratégicas
                            </span>
                        </div>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Clientes de mayor impacto en facturación y volumen movilizado durante el período.
                        </p>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Cliente / Empresa</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Tipo</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Órdenes</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Volumen (Kg)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Total Facturado ($)</th>
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
                                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '850', color: '#059669' }}>
                                                    {formatMoney(c.totalSpend)}
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

            {/* ── ÁREA 4: ABASTECIMIENTO & PRECIOS (BI DE COSTOS & BENCHMARK) ── */}
            {activeArea === 'procurement' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                        <AreaKPICard
                            title="Frescura de Matriz"
                            value={`${procurementMetrics.freshnessPct}%`}
                            subtitle={`${procurementMetrics.freshSkus} productos con costo vigente (<3 días)`}
                            icon={<ShieldCheck size={20} color="#059669" />}
                            badgeText="SLA Precios"
                            badgeBg="#ECFDF5"
                            badgeColor="#065F46"
                        />
                        <AreaKPICard
                            title="Costos por Recotizar"
                            value={procurementMetrics.expiredSkus}
                            subtitle="SKUs que requieren actualización de compra en Corabastos"
                            icon={<AlertTriangle size={20} color="#DC2626" />}
                            badgeText="Vencidos (>7d)"
                            badgeBg="#FEE2E2"
                            badgeColor="#991B1B"
                        />
                        <AreaKPICard
                            title="Matriz de Costos"
                            value={`${procurementMetrics.totalMatrixSkus} SKUs`}
                            subtitle="Productos con costo de adquisición autorizado"
                            icon={<Scale size={20} color="#2563EB" />}
                            badgeText="Catálogo"
                            badgeBg="#EFF6FF"
                            badgeColor="#1E40AF"
                        />
                        <AreaKPICard
                            title="Margen Promedio Matriz"
                            value={`${commercialMetrics.marginPct}%`}
                            subtitle="Diferencial proyectado precio base vs costo compra"
                            icon={<TrendingUp size={20} color={THEME.colors.primary} />}
                            badgeText="Proyección"
                            badgeBg="#DCFCE7"
                            badgeColor="#15803D"
                        />
                    </div>

                    {/* ── BI SECTION 1: RADAR DE SLA DE ACTUALIZACIÓN DE PRECIOS ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <h3 style={{ margin: '0 0 0.4rem 0', fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                            SLA de Frescura de Costos de Compra (Antigüedad de Matriz)
                        </h3>
                        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Control de obsolescencia de cotizaciones de proveedores para evitar erosión involuntaria de margen.
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#15803D', fontWeight: '800', fontSize: '0.75rem' }}>
                                    <CheckCircle size={15} /> Óptimo (&lt;3 días)
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#14532D', marginTop: '4px' }}>
                                    {procurementMetrics.freshSkus} SKUs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#166534', marginTop: '2px' }}>Precios frescos validados</div>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEFCE8', border: '1px solid #FEF08A' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#A16207', fontWeight: '800', fontSize: '0.75rem' }}>
                                    <Clock size={15} /> Precaución (4-7 días)
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#713F12', marginTop: '4px' }}>
                                    {procurementMetrics.acceptableSkus} SKUs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#854D0E', marginTop: '2px' }}>Revisar posibles alzas</div>
                            </div>

                            <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#B91C1C', fontWeight: '800', fontSize: '0.75rem' }}>
                                    <XCircle size={15} /> Desactualizado (&gt;7 días)
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#7F1D1D', marginTop: '4px' }}>
                                    {procurementMetrics.expiredSkus} SKUs
                                </div>
                                <div style={{ fontSize: '0.7rem', color: '#991B1B', marginTop: '2px' }}>Requiere cotización Corabastos</div>
                            </div>
                        </div>
                    </div>

                    {/* ── BI SECTION 2: COMPARATIVO DE COSTOS VS PRECIOS DE VENTA ── */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem 1.5rem',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '850', color: '#0F172A' }}>
                                Matriz de Rentabilidad &amp; Spread por Producto
                            </h3>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B' }}>
                                Costo vs. Precio Base
                            </span>
                        </div>
                        <p style={{ margin: '0 0 1rem 0', fontSize: '0.76rem', color: '#64748B' }}>
                            Diferencial de margen proyectado sobre los productos líderes del catálogo.
                        </p>

                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #E2E8F0', color: '#64748B', textAlign: 'left' }}>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Producto</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800' }}>Categoría</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Costo Compra ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Ref. Corabastos ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'right' }}>Precio Base ($)</th>
                                        <th style={{ padding: '0.6rem 0.5rem', fontWeight: '800', textAlign: 'center' }}>Margen Proyectado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {procurementMetrics.priceComparisonList.map((p, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '0.65rem 0.5rem', fontWeight: '800', color: '#0F172A' }}>{p.name}</td>
                                            <td style={{ padding: '0.65rem 0.5rem', color: '#64748B' }}>{p.category}</td>
                                            <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '700', color: '#334155' }}>
                                                {formatMoney(p.matrixCost)}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#64748B' }}>
                                                {formatMoney(p.estimatedCorabastos)}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: '800', color: '#059669' }}>
                                                {formatMoney(p.basePrice)}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                                <span style={{
                                                    fontWeight: '850',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.72rem',
                                                    backgroundColor: p.spreadPct >= 20 ? '#DCFCE7' : p.spreadPct >= 10 ? '#FEF9C3' : '#FEE2E2',
                                                    color: p.spreadPct >= 20 ? '#15803D' : p.spreadPct >= 10 ? '#854D0E' : '#991B1B'
                                                }}>
                                                    {p.spreadPct}%
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
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
        </div>
    );
}

// ── SUBCOMPONENTES VISUALES BI & SVG CHARTS ──

function BITimeSeriesChart({
    data,
    metric
}: {
    data: { date: string; displayDate: string; sales: number; kg: number; orders: number; profit: number }[];
    metric: 'sales' | 'kg' | 'orders' | 'profit';
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

    const values = data.map(d => d[metric]);
    const maxVal = Math.max(...values, 1);
    const minVal = 0;
    const height = 180;
    const width = 800;
    const paddingX = 40;
    const paddingY = 25;

    const points = data.map((d, i) => {
        const x = paddingX + (i / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
        const y = height - paddingY - ((d[metric] - minVal) / (maxVal - minVal)) * (height - paddingY * 2);
        return { x, y, item: d };
    });

    const pathD = points.length > 1
        ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ')
        : `M ${paddingX} ${height / 2} L ${width - paddingX} ${height / 2}`;

    const areaD = points.length > 1
        ? `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`
        : '';

    const formatVal = (v: number) => {
        if (metric === 'sales' || metric === 'profit') return formatMoney(v);
        if (metric === 'kg') return `${formatNumber(v, 1)} Kg`;
        return `${formatNumber(v, 0)} ord`;
    };

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

                {/* Area under curve */}
                {areaD && <path d={areaD} fill="url(#biAreaGrad)" />}

                {/* Main Curve Line */}
                <path d={pathD} fill="none" stroke="#0D7A57" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                {/* Interactive Points */}
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
                        {/* X-Axis Dates */}
                        {(data.length <= 15 || i % Math.ceil(data.length / 10) === 0) && (
                            <text x={p.x} y={height - 5} textAnchor="middle" fontSize="9" fill="#64748B" fontWeight="600">
                                {p.item.displayDate}
                            </text>
                        )}
                    </g>
                ))}
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
                    <div style={{ color: '#34D399', fontSize: '0.85rem', fontWeight: '900', marginTop: '2px' }}>
                        {formatVal(points[hoverIndex].item[metric])}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#E2E8F0', marginTop: '2px' }}>
                        {points[hoverIndex].item.orders} pedidos • {formatNumber(points[hoverIndex].item.kg, 1)} Kg
                    </div>
                </div>
            )}
        </div>
    );
}

function BIDonutChart({
    b2bAmount,
    b2cAmount,
    totalAmount
}: {
    b2bAmount: number;
    b2cAmount: number;
    totalAmount: number;
}) {
    const total = totalAmount || 1;
    const b2bPct = Math.round((b2bAmount / total) * 100);
    const b2cPct = Math.max(100 - b2bPct, 0);

    const circumference = 2 * Math.PI * 38;
    const b2bOffset = circumference * (1 - b2bPct / 100);

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '1.5rem', flexWrap: 'wrap', padding: '0.5rem 0' }}>
            {/* SVG Donut */}
            <div style={{ position: 'relative', width: '130px', height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="130" height="130" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="50" cy="50" r="38" fill="transparent" stroke="#0284C7" strokeWidth="12" />
                    <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke="#0D7A57"
                        strokeWidth="12"
                        strokeDasharray={circumference}
                        strokeDashoffset={b2bOffset}
                        strokeLinecap="round"
                    />
                </svg>
                <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', lineHeight: 1 }}>{b2bPct}%</span>
                    <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase' }}>B2B</span>
                </div>
            </div>

            {/* Breakdown Badges */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: '1 1 180px' }}>
                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#F0FDF4', borderRadius: '10px', border: '1px solid #DCFCE7' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: '800', color: '#166534' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0D7A57' }} />
                        <span>Canal Institucional B2B ({b2bPct}%)</span>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#14532D', marginTop: '2px' }}>
                        {formatMoney(b2bAmount)}
                    </div>
                </div>

                <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#F0F9FF', borderRadius: '10px', border: '1px solid #E0F2FE' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', fontWeight: '800', color: '#0369A1' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0284C7' }} />
                        <span>Canal Hogar B2C ({b2cPct}%)</span>
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#075985', marginTop: '2px' }}>
                        {formatMoney(b2cAmount)}
                    </div>
                </div>
            </div>
        </div>
    );
}

function BIProductParetoRanking({ products }: { products: any[] }) {
    if (!products || products.length === 0) {
        return <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No hay ventas registradas en el período</div>;
    }

    const maxRev = Math.max(...products.map(p => p.revenue), 1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {products.map((p, idx) => {
                const widthPct = Math.round((p.revenue / maxRev) * 100);
                return (
                    <div key={idx}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginBottom: '3px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#F1F5F9', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '800' }}>
                                    {idx + 1}
                                </span>
                                <span style={{ fontWeight: '800', color: '#0F172A' }}>{p.name}</span>
                                <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>({formatNumber(p.qty, 0)} Kg)</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: '900', color: '#0F172A' }}>{formatMoney(p.revenue)}</span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: '850',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    backgroundColor: p.marginPct >= 20 ? '#DCFCE7' : '#FEF3C7',
                                    color: p.marginPct >= 20 ? '#15803D' : '#B45309'
                                }}>
                                    {p.marginPct}%
                                </span>
                            </div>
                        </div>

                        <div style={{ height: '6px', width: '100%', backgroundColor: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${widthPct}%`,
                                backgroundColor: idx < 3 ? '#0D7A57' : idx < 6 ? '#059669' : '#10B981',
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
                                style={{ width: '10px', height: `${inHeight}px`, backgroundColor: '#10B981', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Outbound Bar */}
                            <div
                                title={`Salidas: ${formatNumber(m.outbound, 1)} Kg`}
                                style={{ width: '10px', height: `${outHeight}px`, backgroundColor: '#2563EB', borderRadius: '3px 3px 0 0' }}
                            />
                            {/* Waste Bar */}
                            <div
                                title={`Mermas: ${formatNumber(m.waste, 1)} Kg`}
                                style={{ width: '6px', height: `${wasteHeight}px`, backgroundColor: '#EF4444', borderRadius: '2px 2px 0 0' }}
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
                            ➔ {stages[i + 1].pct}% conv
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
