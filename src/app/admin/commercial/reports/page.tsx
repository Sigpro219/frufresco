'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import {
    ArrowLeft,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Package,
    Building2,
    Calendar,
    Download,
    RefreshCw,
    Search,
    ShieldAlert,
    AlertTriangle,
    BarChart3,
    Layers,
    FileSpreadsheet,
    Scale,
    Filter,
    ChevronDown,
    ArrowUpRight,
    ArrowDownRight,
    Users,
    CheckCircle2
} from 'lucide-react';
import * as XLSX from 'xlsx';

type TimeRange = 'today' | '7d' | '15d' | '30d' | 'this_month' | 'all';
type SegmentFilter = 'all' | 'b2b' | 'b2c';
type ReportTab = 'clients' | 'products' | 'margin_compression';

interface ClientReportRow {
    id: string;
    name: string;
    nit: string;
    isB2B: boolean;
    isMatrix: boolean;
    orderCount: number;
    totalVolumeKg: number;
    totalSales: number;
    totalCost: number;
    grossProfit: number;
    marginPct: number;
    avgTicket: number;
    riskStatus: 'healthy' | 'warning' | 'critical';
}

interface ProductReportRow {
    id: string;
    name: string;
    sku: string;
    accountingId: string;
    category: string;
    unitOfMeasure: string;
    quantitySold: number;
    totalSales: number;
    avgSellingPrice: number;
    avgUnitCost: number;
    totalCost: number;
    grossProfit: number;
    marginPct: number;
    abcClass: 'A' | 'B' | 'C';
}

interface CompressionRow {
    productId: string;
    productName: string;
    sku: string;
    category: string;
    matrixCost: number;
    latestPurchaseCost: number;
    catalogPrice: number;
    currentMarginPct: number;
    costGapPct: number;
    severity: 'critical' | 'warning' | 'normal';
}

export default function CommercialReportsPage() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);

    const [timeRange, setTimeRange] = useState<TimeRange>('30d');
    const [segmentFilter, setSegmentFilter] = useState<SegmentFilter>('all');
    const [activeTab, setActiveTab] = useState<ReportTab>('clients');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Data tables
    const [clientRows, setClientRows] = useState<ClientReportRow[]>([]);
    const [productRows, setProductRows] = useState<ProductReportRow[]>([]);
    const [compressionRows, setCompressionRows] = useState<CompressionRow[]>([]);

    // KPI Summary
    const [summaryKpis, setSummaryKpis] = useState({
        totalSales: 0,
        totalCost: 0,
        grossProfit: 0,
        weightedMargin: 0,
        totalVolumeKg: 0,
        orderCount: 0,
        avgTicket: 0,
        activeClientsCount: 0
    });

    const hasViewPermission = () => {
        if (!profile) return false;
        if (profile.role === 'admin' || profile.role === 'sys_admin') return true;
        return checkUserPermission(profile, 'admin.commercial.reports', roles) ||
               checkUserPermission(profile, 'admin.commercial', roles) ||
               checkUserPermission(profile, 'admin.reports', roles);
    };

    const getDateRangeIso = useCallback((range: TimeRange) => {
        const now = new Date();
        let startDate: Date;
        switch (range) {
            case 'today':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                break;
            case '7d':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '15d':
                startDate = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
                break;
            case 'this_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'all':
                startDate = new Date(2020, 0, 1);
                break;
            case '30d':
            default:
                startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
        }
        return startDate.toISOString();
    }, []);

    const fetchReportData = useCallback(async () => {
        setRefreshing(true);
        try {
            const startIso = getDateRangeIso(timeRange);

            // 0. Fetch Roles
            const { data: rolesData } = await supabase
                .from('app_settings')
                .select('key, value')
                .eq('key', 'system_roles')
                .maybeSingle();

            if (rolesData?.value) {
                try {
                    setRoles(JSON.parse(rolesData.value));
                } catch (e) {
                    // Ignore parsing error
                }
            }

            // 1. Fetch Profiles, Products, Matrix Costs, Purchases, Model Prices
            const [profilesRes, productsRes, matrixRes, purchasesRes, modelPricesRes] = await Promise.all([
                supabase.from('profiles').select('id, role, company_name, contact_name, nit, is_corporate_parent, parent_id'),
                supabase.from('products').select('id, name, sku, accounting_id, category, unit_of_measure, is_active').eq('is_active', true),
                supabase.from('commercial_cost_matrix').select('product_id, manual_cost, updated_at, is_active').eq('is_active', true),
                supabase.from('purchases').select('product_id, unit_price, created_at').order('created_at', { ascending: false }),
                supabase.from('pricing_model_prices').select('product_id, price').eq('model_id', 'd90a91e5-827c-473d-9d4f-3e28c7c91e15')
            ]);

            const profileMap = new Map<string, any>();
            (profilesRes.data || []).forEach(p => profileMap.set(p.id, p));

            const productMap = new Map<string, any>();
            (productsRes.data || []).forEach(p => productMap.set(p.id, p));

            const costMap = new Map<string, number>();
            (matrixRes.data || []).forEach(m => {
                if (m.manual_cost && Number(m.manual_cost) > 0) {
                    costMap.set(m.product_id, Number(m.manual_cost));
                }
            });

            // Latest purchase cost fallback
            const latestPurchaseMap = new Map<string, number>();
            (purchasesRes.data || []).forEach(pc => {
                if (!latestPurchaseMap.has(pc.product_id) && pc.unit_price && Number(pc.unit_price) > 0) {
                    latestPurchaseMap.set(pc.product_id, Number(pc.unit_price));
                    if (!costMap.has(pc.product_id)) {
                        costMap.set(pc.product_id, Number(pc.unit_price));
                    }
                }
            });

            const modelPriceMap = new Map<string, number>();
            (modelPricesRes.data || []).forEach(mp => {
                if (mp.price && Number(mp.price) > 0) {
                    modelPriceMap.set(mp.product_id, Number(mp.price));
                }
            });

            // 2. Fetch Orders in range
            const { data: ordersData } = await supabase
                .from('orders')
                .select('id, profile_id, total, status, delivery_date, created_at, is_b2b')
                .gte('created_at', startIso)
                .neq('status', 'cancelled');

            const orders = ordersData || [];
            const orderIds = orders.map(o => o.id);

            // 3. Batch fetch order_items in chunks of 80
            let orderItems: any[] = [];
            if (orderIds.length > 0) {
                for (let i = 0; i < orderIds.length; i += 80) {
                    const slice = orderIds.slice(i, i + 80);
                    const { data: batch } = await supabase
                        .from('order_items')
                        .select('id, order_id, product_id, quantity, unit_price')
                        .in('order_id', slice);
                    if (batch) orderItems.push(...batch);
                }
            }

            const itemsByOrder = new Map<string, any[]>();
            orderItems.forEach(it => {
                if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
                itemsByOrder.get(it.order_id)!.push(it);
            });

            // 4. Aggregations
            let totalSalesSum = 0;
            let totalCostSum = 0;
            let totalVolKgSum = 0;
            const activeClients = new Set<string>();

            const clientAgg = new Map<string, {
                sales: number;
                cost: number;
                volume: number;
                orderCount: number;
            }>();

            const productAgg = new Map<string, {
                qty: number;
                sales: number;
                cost: number;
            }>();

            orders.forEach(o => {
                const prof = profileMap.get(o.profile_id);
                const isB2B = o.is_b2b || prof?.role === 'b2b_client' || (prof?.company_name && prof?.role !== 'b2c_client');

                // Segment filtering
                if (segmentFilter === 'b2b' && !isB2B) return;
                if (segmentFilter === 'b2c' && isB2B) return;

                const oTotal = Number(o.total || 0);
                totalSalesSum += oTotal;
                if (o.profile_id) activeClients.add(o.profile_id);

                const cKey = o.profile_id || 'unassigned';
                if (!clientAgg.has(cKey)) {
                    clientAgg.set(cKey, { sales: 0, cost: 0, volume: 0, orderCount: 0 });
                }
                const cEntry = clientAgg.get(cKey)!;
                cEntry.sales += oTotal;
                cEntry.orderCount += 1;

                const items = itemsByOrder.get(o.id) || [];
                items.forEach(it => {
                    const qty = Number(it.quantity || 0);
                    const unitPrice = Number(it.unit_price || 0);
                    const itSales = qty * unitPrice;
                    const itCostUnit = costMap.get(it.product_id) || (unitPrice * 0.7); // Fallback: 30% margin assumption
                    const itCost = qty * itCostUnit;

                    totalCostSum += itCost;
                    totalVolKgSum += qty;
                    cEntry.cost += itCost;
                    cEntry.volume += qty;

                    if (!productAgg.has(it.product_id)) {
                        productAgg.set(it.product_id, { qty: 0, sales: 0, cost: 0 });
                    }
                    const pEntry = productAgg.get(it.product_id)!;
                    pEntry.qty += qty;
                    pEntry.sales += itSales;
                    pEntry.cost += itCost;
                });
            });

            // 5. Build Client Report Rows
            const cRows: ClientReportRow[] = [];
            clientAgg.forEach((agg, profId) => {
                const prof = profileMap.get(profId);
                const name = prof?.company_name || prof?.contact_name || 'Cliente sin registrar';
                const nit = prof?.nit || '---';
                const isB2B = prof?.role === 'b2b_client' || !!prof?.company_name;
                const isMatrix = !!prof?.is_corporate_parent;
                const grossProfit = agg.sales - agg.cost;
                const marginPct = agg.sales > 0 ? (grossProfit / agg.sales) * 100 : 0;
                const avgTicket = agg.orderCount > 0 ? agg.sales / agg.orderCount : 0;

                let riskStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
                if (marginPct < 15) riskStatus = 'critical';
                else if (marginPct < 22) riskStatus = 'warning';

                cRows.push({
                    id: profId,
                    name,
                    nit,
                    isB2B,
                    isMatrix,
                    orderCount: agg.orderCount,
                    totalVolumeKg: agg.volume,
                    totalSales: agg.sales,
                    totalCost: agg.cost,
                    grossProfit,
                    marginPct,
                    avgTicket,
                    riskStatus
                });
            });
            cRows.sort((a, b) => b.totalSales - a.totalSales);
            setClientRows(cRows);

            // 6. Build Product Report Rows with Pareto ABC
            const pRows: ProductReportRow[] = [];
            productAgg.forEach((agg, pId) => {
                const p = productMap.get(pId);
                if (!p) return;
                const grossProfit = agg.sales - agg.cost;
                const marginPct = agg.sales > 0 ? (grossProfit / agg.sales) * 100 : 0;
                const avgSelling = agg.qty > 0 ? agg.sales / agg.qty : 0;
                const avgCost = agg.qty > 0 ? agg.cost / agg.qty : 0;

                pRows.push({
                    id: pId,
                    name: p.name || 'Sin nombre',
                    sku: p.sku || '---',
                    accountingId: p.accounting_id || '---',
                    category: p.category || 'Varios',
                    unitOfMeasure: p.unit_of_measure || 'Kg',
                    quantitySold: agg.qty,
                    totalSales: agg.sales,
                    avgSellingPrice: avgSelling,
                    avgUnitCost: avgCost,
                    totalCost: agg.cost,
                    grossProfit,
                    marginPct,
                    abcClass: 'C' // Will calculate below
                });
            });

            // Sort products by sales desc for Pareto
            pRows.sort((a, b) => b.totalSales - a.totalSales);
            let accumSales = 0;
            const totalProdSales = pRows.reduce((acc, p) => acc + p.totalSales, 0);

            pRows.forEach(p => {
                accumSales += p.totalSales;
                const accumPct = totalProdSales > 0 ? (accumSales / totalProdSales) * 100 : 0;
                if (accumPct <= 80) p.abcClass = 'A';
                else if (accumPct <= 95) p.abcClass = 'B';
                else p.abcClass = 'C';
            });
            setProductRows(pRows);

            // 7. Build Margin Compression Audit Rows
            const compRows: CompressionRow[] = [];
            productsRes.data?.forEach(p => {
                const mCost = costMap.get(p.id) || 0;
                const pCost = latestPurchaseMap.get(p.id) || 0;
                const catPrice = modelPriceMap.get(p.id) || 0;

                if (catPrice > 0 && (mCost > 0 || pCost > 0)) {
                    const effectiveCost = mCost > 0 ? mCost : pCost;
                    const margin = ((catPrice - effectiveCost) / catPrice) * 100;
                    const costGap = pCost > 0 && mCost > 0 ? ((pCost - mCost) / mCost) * 100 : 0;

                    let severity: 'critical' | 'warning' | 'normal' = 'normal';
                    if (margin < 12 || costGap > 18) severity = 'critical';
                    else if (margin < 20 || costGap > 10) severity = 'warning';

                    if (severity !== 'normal') {
                        compRows.push({
                            productId: p.id,
                            productName: p.name,
                            sku: p.sku || '---',
                            category: p.category || 'Varios',
                            matrixCost: mCost,
                            latestPurchaseCost: pCost,
                            catalogPrice: catPrice,
                            currentMarginPct: margin,
                            costGapPct: costGap,
                            severity
                        });
                    }
                }
            });
            compRows.sort((a, b) => a.currentMarginPct - b.currentMarginPct);
            setCompressionRows(compRows);

            // 8. Overall KPI calculations
            const grossProfitSum = totalSalesSum - totalCostSum;
            const weightedMargin = totalSalesSum > 0 ? (grossProfitSum / totalSalesSum) * 100 : 0;
            const avgTicket = orders.length > 0 ? totalSalesSum / orders.length : 0;

            setSummaryKpis({
                totalSales: totalSalesSum,
                totalCost: totalCostSum,
                grossProfit: grossProfitSum,
                weightedMargin,
                totalVolumeKg: totalVolKgSum,
                orderCount: orders.length,
                avgTicket,
                activeClientsCount: activeClients.size
            });

        } catch (err) {
            console.error('Error fetching commercial reports data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [timeRange, segmentFilter, getDateRangeIso]);

    useEffect(() => {
        fetchReportData();
    }, [fetchReportData]);

    // Filtered data based on search term
    const filteredClients = useMemo(() => {
        if (!searchTerm.trim()) return clientRows;
        const term = searchTerm.toLowerCase();
        return clientRows.filter(c => 
            c.name.toLowerCase().includes(term) || 
            c.nit.toLowerCase().includes(term)
        );
    }, [clientRows, searchTerm]);

    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return productRows;
        const term = searchTerm.toLowerCase();
        return productRows.filter(p => 
            p.name.toLowerCase().includes(term) || 
            p.sku.toLowerCase().includes(term) ||
            p.category.toLowerCase().includes(term)
        );
    }, [productRows, searchTerm]);

    const filteredCompression = useMemo(() => {
        if (!searchTerm.trim()) return compressionRows;
        const term = searchTerm.toLowerCase();
        return compressionRows.filter(c => 
            c.productName.toLowerCase().includes(term) || 
            c.sku.toLowerCase().includes(term) ||
            c.category.toLowerCase().includes(term)
        );
    }, [compressionRows, searchTerm]);

    // Excel Export Handlers with Rule 32K Protection
    const handleExportExcel = () => {
        try {
            const wb = XLSX.utils.book_new();

            // Sheet 1: Clientes
            const clientExportData = filteredClients.map(c => ({
                'Cliente / Razón Social': c.name.slice(0, 3000),
                'NIT': c.nit,
                'Tipo': c.isB2B ? (c.isMatrix ? 'B2B Matriz' : 'B2B Institucional') : 'B2C Hogar',
                'N° Pedidos': c.orderCount,
                'Volumen (Kg)': Math.round(c.totalVolumeKg),
                'Ventas Totales ($)': Math.round(c.totalSales),
                'Costo Mercancía ($)': Math.round(c.totalCost),
                'Utilidad Bruta ($)': Math.round(c.grossProfit),
                'Margen Bruto (%)': Number(c.marginPct.toFixed(1)),
                'Ticket Promedio ($)': Math.round(c.avgTicket),
                'Estado Riesgo': c.riskStatus.toUpperCase()
            }));
            const wsClients = XLSX.utils.json_to_sheet(clientExportData);
            XLSX.utils.book_append_sheet(wb, wsClients, 'Rentabilidad_Clientes');

            // Sheet 2: Productos
            const productExportData = filteredProducts.map(p => ({
                'SKU': p.sku,
                'ID Contable': p.accountingId,
                'Producto': p.name.slice(0, 3000),
                'Categoría': p.category,
                'Unidad': p.unitOfMeasure,
                'Cantidad Vendida': Math.round(p.quantitySold),
                'Ventas ($)': Math.round(p.totalSales),
                'Precio Promedio ($)': Math.round(p.avgSellingPrice),
                'Costo Promedio ($)': Math.round(p.avgUnitCost),
                'Utilidad Bruta ($)': Math.round(p.grossProfit),
                'Margen (%)': Number(p.marginPct.toFixed(1)),
                'Pareto ABC': p.abcClass
            }));
            const wsProducts = XLSX.utils.json_to_sheet(productExportData);
            XLSX.utils.book_append_sheet(wb, wsProducts, 'Ventas_Productos_Pareto');

            // Sheet 3: Compresión de Margen
            const compExportData = filteredCompression.map(c => ({
                'SKU': c.sku,
                'Producto': c.productName.slice(0, 3000),
                'Categoría': c.category,
                'Costo Matriz ($)': Math.round(c.matrixCost),
                'Última Compra Plaza ($)': Math.round(c.latestPurchaseCost),
                'Precio Catálogo ($)': Math.round(c.catalogPrice),
                'Margen Actual (%)': Number(c.currentMarginPct.toFixed(1)),
                'Brecha Costo Plaza (%)': Number(c.costGapPct.toFixed(1)),
                'Severidad': c.severity.toUpperCase()
            }));
            const wsComp = XLSX.utils.json_to_sheet(compExportData);
            XLSX.utils.book_append_sheet(wb, wsComp, 'Compresion_Margen');

            const nowStr = new Date().toISOString().split('T')[0];
            XLSX.writeFile(wb, `Reporte_Comercial_Margen_Ventas_${nowStr}.xlsx`);
        } catch (err) {
            console.error('Error exporting report to Excel:', err);
            alert('Error al generar el archivo Excel. Por favor intente nuevamente.');
        }
    };

    if (!hasViewPermission()) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: THEME.colors.surface,
                    borderRadius: '16px',
                    boxShadow: THEME.shadow.md,
                    maxWidth: '480px',
                    border: `1px solid ${THEME.colors.border}`,
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        marginBottom: '1.5rem',
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: THEME.colors.textMain, marginBottom: '0.75rem' }}>
                        Acceso Restringido
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', lineHeight: '1.5' }}>
                        No tienes los privilegios requeridos para consultar los reportes de margen y auditoría comercial.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '1.5rem 2rem' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* BREADCRUMB & HEADER */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Link 
                            href="/admin/commercial"
                            style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                width: '36px', 
                                height: '36px', 
                                borderRadius: '10px', 
                                backgroundColor: 'white', 
                                border: `1px solid ${THEME.colors.border}`,
                                color: THEME.colors.textSecondary,
                                transition: 'all 0.2s',
                                textDecoration: 'none'
                            }}
                            title="Volver a la consola comercial"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Dirección Comercial • Dominio 7
                                </span>
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#ECFDF5', color: '#047857', padding: '2px 8px', borderRadius: '4px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <BarChart3 size={12} /> Auditoría Comercial B2B
                                </span>
                            </div>
                            <h1 style={{ margin: '4px 0 0 0', fontSize: '1.4rem', fontWeight: 800, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <TrendingUp size={24} color={THEME.colors.primary} /> Reportes de Margen, Ventas & Consumo Institucional
                            </h1>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={fetchReportData}
                            disabled={refreshing}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.5rem 0.9rem',
                                borderRadius: '8px',
                                backgroundColor: 'white',
                                border: `1px solid ${THEME.colors.border}`,
                                color: THEME.colors.textMain,
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: refreshing ? 'not-allowed' : 'pointer'
                            }}
                        >
                            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                            {refreshing ? 'Actualizando...' : 'Refrescar'}
                        </button>

                        <button
                            onClick={handleExportExcel}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                backgroundColor: THEME.colors.primary,
                                color: 'white',
                                border: 'none',
                                fontSize: '0.8rem',
                                fontWeight: 800,
                                cursor: 'pointer',
                                boxShadow: '0 2px 4px rgba(13,122,87,0.2)'
                            }}
                        >
                            <FileSpreadsheet size={15} />
                            Exportar Excel (XLSX)
                        </button>
                    </div>
                </div>

                {/* CONTROL BAR: TIME RANGE, SEGMENT & SEARCH */}
                <div style={{
                    backgroundColor: 'white',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '12px',
                    border: `1px solid ${THEME.colors.border}`,
                    boxShadow: THEME.shadow.sm,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem'
                }}>
                    {/* Time Range Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: THEME.colors.textSecondary, padding: '0 6px' }}>Período:</span>
                        {[
                            { id: 'today', label: 'Hoy' },
                            { id: '7d', label: '7 días' },
                            { id: '15d', label: '15 días' },
                            { id: '30d', label: '30 días' },
                            { id: 'this_month', label: 'Mes actual' },
                            { id: 'all', label: 'Histórico' }
                        ].map(r => (
                            <button
                                key={r.id}
                                onClick={() => setTimeRange(r.id as TimeRange)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: timeRange === r.id ? 800 : 600,
                                    backgroundColor: timeRange === r.id ? THEME.colors.primary : 'transparent',
                                    color: timeRange === r.id ? 'white' : THEME.colors.textSecondary,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>

                    {/* Segment Filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', padding: '4px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: THEME.colors.textSecondary, padding: '0 6px' }}>Segmento:</span>
                        {[
                            { id: 'all', label: 'Todos' },
                            { id: 'b2b', label: 'Solo B2B' },
                            { id: 'b2c', label: 'Solo Hogar' }
                        ].map(s => (
                            <button
                                key={s.id}
                                onClick={() => setSegmentFilter(s.id as SegmentFilter)}
                                style={{
                                    padding: '0.35rem 0.75rem',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.75rem',
                                    fontWeight: segmentFilter === s.id ? 800 : 600,
                                    backgroundColor: segmentFilter === s.id ? '#1E293B' : 'transparent',
                                    color: segmentFilter === s.id ? 'white' : THEME.colors.textSecondary,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                {s.label}
                            </button>
                        ))}
                    </div>

                    {/* Search Omnibox */}
                    <div style={{ position: 'relative', width: '280px' }}>
                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                        <input
                            type="text"
                            placeholder="Buscar cliente, SKU, categoría..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.45rem 0.75rem 0.45rem 2rem',
                                borderRadius: '8px',
                                border: `1px solid ${THEME.colors.border}`,
                                fontSize: '0.78rem',
                                outline: 'none',
                                backgroundColor: '#F8FAFC'
                            }}
                        />
                    </div>
                </div>

                {/* STAT CARDS / EXECUTIVE TELEMETRY */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Ventas Totales</span>
                            <DollarSign size={16} color={THEME.colors.primary} />
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: THEME.colors.textMain }}>
                            {formatMoney(summaryKpis.totalSales)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                            {summaryKpis.orderCount} pedidos facturados
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Margen Ponderado</span>
                            <TrendingUp size={16} color={summaryKpis.weightedMargin >= 28 ? '#047857' : '#D97706'} />
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: summaryKpis.weightedMargin >= 28 ? '#047857' : summaryKpis.weightedMargin >= 20 ? '#D97706' : '#EF4444' }}>
                            {summaryKpis.weightedMargin.toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                            Utilidad: {formatMoney(summaryKpis.grossProfit)}
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Volumen Despachado</span>
                            <Package size={16} color="#3B82F6" />
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: THEME.colors.textMain }}>
                            {(summaryKpis.totalVolumeKg / 1000).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Ton
                        </div>
                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                            {Math.round(summaryKpis.totalVolumeKg).toLocaleString('es-CO')} Kg en total
                        </div>
                    </div>

                    <div style={{ backgroundColor: 'white', padding: '1rem 1.25rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>Ticket Promedio</span>
                            <BarChart3 size={16} color="#8B5CF6" />
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: THEME.colors.textMain }}>
                            {formatMoney(summaryKpis.avgTicket)}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                            {summaryKpis.activeClientsCount} clientes activos
                        </div>
                    </div>
                </div>

                {/* REPORT SUBTABS */}
                <div style={{
                    display: 'flex',
                    gap: '4px',
                    backgroundColor: '#F1F5F9',
                    padding: '4px',
                    borderRadius: '10px',
                    width: 'fit-content'
                }}>
                    <button
                        onClick={() => setActiveTab('clients')}
                        style={{
                            padding: '0.5rem 1.2rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeTab === 'clients' ? 'white' : 'transparent',
                            color: activeTab === 'clients' ? THEME.colors.primary : THEME.colors.textSecondary,
                            fontWeight: activeTab === 'clients' ? 800 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: activeTab === 'clients' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <Building2 size={15} /> Rentabilidad por Cliente ({filteredClients.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('products')}
                        style={{
                            padding: '0.5rem 1.2rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeTab === 'products' ? 'white' : 'transparent',
                            color: activeTab === 'products' ? THEME.colors.primary : THEME.colors.textSecondary,
                            fontWeight: activeTab === 'products' ? 800 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: activeTab === 'products' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <Package size={15} /> Ventas & Rotación SKU ({filteredProducts.length})
                    </button>

                    <button
                        onClick={() => setActiveTab('margin_compression')}
                        style={{
                            padding: '0.5rem 1.2rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeTab === 'margin_compression' ? 'white' : 'transparent',
                            color: activeTab === 'margin_compression' ? '#DC2626' : THEME.colors.textSecondary,
                            fontWeight: activeTab === 'margin_compression' ? 800 : 600,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: activeTab === 'margin_compression' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                        }}
                    >
                        <AlertTriangle size={15} color="#DC2626" /> Compresión de Margen ({filteredCompression.length})
                    </button>
                </div>

                {/* TABLE CONTAINER */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    border: `1px solid ${THEME.colors.border}`,
                    boxShadow: THEME.shadow.sm,
                    overflow: 'hidden'
                }}>
                    {loading ? (
                        <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                            <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: THEME.colors.primary }} />
                            <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Consolidando reportes de ventas y márgenes...</div>
                        </div>
                    ) : (
                        <>
                            {/* TAB 1: CLIENTS REPORT */}
                            {activeTab === 'clients' && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left', color: THEME.colors.textSecondary }}>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>CLIENTE / RAZÓN SOCIAL</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>TIPO</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>PEDIDOS</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>VOLUMEN</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>VENTAS ($)</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>UTILIDAD ($)</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>MARGEN</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>TICKET PROM.</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredClients.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                        No se encontraron consumos de clientes en el período seleccionado.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredClients.map((c, idx) => (
                                                    <tr key={c.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <div style={{ fontWeight: 800, color: THEME.colors.textMain }}>{c.name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>NIT: {c.nit}</div>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <span style={{
                                                                fontSize: '0.68rem',
                                                                fontWeight: 800,
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                backgroundColor: c.isB2B ? '#ECFDF5' : '#F1F5F9',
                                                                color: c.isB2B ? '#047857' : '#475569',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}>
                                                                {c.isMatrix ? 'Matriz' : c.isB2B ? 'Institucional' : 'Hogar'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                                                            {c.orderCount}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                                                            {c.totalVolumeKg >= 1000 ? `${(c.totalVolumeKg / 1000).toFixed(2)} Ton` : `${Math.round(c.totalVolumeKg)} Kg`}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: THEME.colors.textMain }}>
                                                            {formatMoney(c.totalSales)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: c.grossProfit >= 0 ? '#047857' : '#DC2626' }}>
                                                            {formatMoney(c.grossProfit)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 800,
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                backgroundColor: c.marginPct >= 28 ? '#ECFDF5' : c.marginPct >= 18 ? '#FEF3C7' : '#FEE2E2',
                                                                color: c.marginPct >= 28 ? '#047857' : c.marginPct >= 18 ? '#D97706' : '#DC2626'
                                                            }}>
                                                                {c.marginPct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                            {formatMoney(c.avgTicket)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* TAB 2: PRODUCTS REPORT */}
                            {activeTab === 'products' && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left', color: THEME.colors.textSecondary }}>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>SKU / PRODUCTO</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>CATEGORÍA</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>PARETO</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>CANTIDAD</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>PRECIO PROM.</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>COSTO PROM.</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>VENTAS ($)</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>MARGEN</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredProducts.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                        No se registraron ventas de productos en el período seleccionado.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredProducts.map((p, idx) => (
                                                    <tr key={p.id || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <div style={{ fontWeight: 800, color: THEME.colors.textMain }}>{p.name}</div>
                                                            <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>SKU: {p.sku} | ID: {p.accountingId}</div>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary }}>
                                                            {p.category}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                            <span style={{
                                                                fontSize: '0.7rem',
                                                                fontWeight: 900,
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                backgroundColor: p.abcClass === 'A' ? '#EFF6FF' : p.abcClass === 'B' ? '#FDF2F8' : '#F1F5F9',
                                                                color: p.abcClass === 'A' ? '#1D4ED8' : p.abcClass === 'B' ? '#BE185D' : '#64748B'
                                                            }}>
                                                                Tipo {p.abcClass}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                                                            {Math.round(p.quantitySold).toLocaleString('es-CO')} {p.unitOfMeasure}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                            {formatMoney(p.avgSellingPrice)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                            {formatMoney(p.avgUnitCost)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800, color: THEME.colors.textMain }}>
                                                            {formatMoney(p.totalSales)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 800,
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                backgroundColor: p.marginPct >= 28 ? '#ECFDF5' : p.marginPct >= 18 ? '#FEF3C7' : '#FEE2E2',
                                                                color: p.marginPct >= 28 ? '#047857' : p.marginPct >= 18 ? '#D97706' : '#DC2626'
                                                            }}>
                                                                {p.marginPct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* TAB 3: MARGIN COMPRESSION AUDIT */}
                            {activeTab === 'margin_compression' && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left', color: THEME.colors.textSecondary }}>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>SKU / INSUMO EN ALERTA</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800 }}>CATEGORÍA</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>COSTO MATRIZ</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>COMPRA PLAZA</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>PRECIO CATÁLOGO</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>MARGEN RESTANTE</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'right' }}>BRECHA COSTO</th>
                                                <th style={{ padding: '0.75rem 1rem', fontWeight: 800, textAlign: 'center' }}>SEVERIDAD</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredCompression.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                        <CheckCircle2 size={32} color="#047857" style={{ margin: '0 auto 8px auto' }} />
                                                        <div style={{ fontWeight: 800, color: '#047857' }}>Catálogo Comercial Blindado</div>
                                                        <div style={{ fontSize: '0.75rem' }}>No se detectaron compresiones críticas de margen en los productos activos.</div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredCompression.map((c, idx) => (
                                                    <tr key={c.productId || idx} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                        <td style={{ padding: '0.75rem 1rem' }}>
                                                            <div style={{ fontWeight: 800, color: THEME.colors.textMain }}>{c.productName}</div>
                                                            <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>SKU: {c.sku}</div>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary }}>
                                                            {c.category}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                            {formatMoney(c.matrixCost)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: c.latestPurchaseCost > c.matrixCost ? '#DC2626' : THEME.colors.textMain }}>
                                                            {formatMoney(c.latestPurchaseCost)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 800 }}>
                                                            {formatMoney(c.catalogPrice)}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                                            <span style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: 800,
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                backgroundColor: c.currentMarginPct < 12 ? '#FEE2E2' : '#FEF3C7',
                                                                color: c.currentMarginPct < 12 ? '#DC2626' : '#D97706'
                                                            }}>
                                                                {c.currentMarginPct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: c.costGapPct > 0 ? '#DC2626' : '#047857' }}>
                                                            {c.costGapPct > 0 ? `+${c.costGapPct.toFixed(1)}%` : `${c.costGapPct.toFixed(1)}%`}
                                                        </td>
                                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                            <span style={{
                                                                fontSize: '0.68rem',
                                                                fontWeight: 900,
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                backgroundColor: c.severity === 'critical' ? '#FEE2E2' : '#FEF3C7',
                                                                color: c.severity === 'critical' ? '#DC2626' : '#D97706'
                                                            }}>
                                                                {c.severity === 'critical' ? 'CRÍTICO' : 'ALERTA'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>

            </div>
        </main>
    );
}
