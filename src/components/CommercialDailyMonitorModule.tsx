'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { CATEGORY_MAP } from '@/lib/constants';
import {
    Calendar,
    ChevronUp,
    ChevronsUpDown,
    Search,
    Download,
    TrendingUp,
    Users,
    Package,
    ShieldAlert,
    AlertCircle,
    CheckCircle2,
    DollarSign,
    RefreshCw,
    ChevronRight,
    ArrowUpRight,
    Building2,
    Truck,
    Layers,
    FileSpreadsheet,
    HelpCircle,
    ExternalLink,
    Filter,
    Check,
    X,
    CalendarRange,
    ChevronDown
} from 'lucide-react';

interface DateEntry {
    date: string; // YYYY-MM-DD
    orderCount: number;
    totalSales: number;
}

interface OrderDetail {
    id: string;
    branchName?: string;
    parentName?: string | null;
    sequenceId: number | string;
    friendlyId?: string;
    status?: string;
    subtotal?: number;
    tax?: number;
    profileId: string;
    clientName: string;
    companyName: string;
    nit: string;
    zone: string;
    address: string;
    type: 'b2b' | 'b2c';
    documentType: string; // Remisión / Factura
    paymentMethod: string;
    paymentStatus: string;
    total: number;
    totalWeightKg: number;
    itemsCount: number;
    estimatedCost: number;
    grossProfit: number;
    marginPct: number;
    hasEqualValueAlert?: boolean;
    hasMultipleOrdersAlert?: boolean;
    hasUnderMinimumAlert?: boolean;
    items: OrderItemDetail[];
}

interface OrderItemDetail {
    id: string;
    orderId: string;
    productId: string;
    productName: string;
    sku: string;
    accountingId?: string | number | null;
    category: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    unitCost: number;
    totalItemSales: number;
    totalItemCost: number;
    itemProfit: number;
    itemMarginPct: number;
}

interface ProductConsolidated {
    productId: string;
    productName: string;
    sku: string;
    accountingId?: string | number | null;
    category: string;
    unit: string;
    totalQuantity: number;
    totalSales: number;
    totalCost: number;
    avgSellingPrice: number;
    avgUnitCost: number;
    grossProfit: number;
    marginPct: number;
    ordersCount: number;
}

type ActiveView = 'clients' | 'products' | 'product_drilldown';
type PokaYokeFilter = 'all' | 'equal_value' | 'multiple_orders' | 'under_minimum';

function parseClientBranchInfo(clientName: string, razonSocial?: string): {
    branchName: string;
    parentName: string | null;
} {
    const raw = (clientName || '').trim();
    if (!raw) return { branchName: 'Cliente Institucional', parentName: null };

    // Check for " - " split (e.g., "IRCC S.A.S... - BEER STATION FLORESTA")
    const parts = raw.split(/\s+[-–—]\s+/);
    if (parts.length >= 2) {
        const parent = parts[0].trim();
        const branch = parts.slice(1).join(' - ').trim();
        if (parent.toLowerCase() === branch.toLowerCase()) {
            return { branchName: branch, parentName: null };
        }
        return { branchName: branch, parentName: parent };
    }

    // If there is a distinct legal razon_social
    if (razonSocial && razonSocial.trim().toLowerCase() !== raw.toLowerCase()) {
        return { branchName: raw, parentName: razonSocial.trim() };
    }

    return { branchName: raw, parentName: null };
}

export default function CommercialDailyMonitorModule() {
    // 1. Selector de fechas (Sidebar con Boxing de 6 meses)
    const [availableDates, setAvailableDates] = useState<DateEntry[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedMonthOffset, setSelectedMonthOffset] = useState<number>(0); // 0 = Mes actual, 1 = Hace 1 mes... hasta 5 (6 meses)
    const [loadingDates, setLoadingDates] = useState<boolean>(true);

    // 2. Data del día seleccionado
    const [loadingDayData, setLoadingDayData] = useState<boolean>(false);
    const [dayOrders, setDayOrders] = useState<OrderDetail[]>([]);
    const [productConsolidated, setProductConsolidated] = useState<ProductConsolidated[]>([]);

    // 3. Estado de Vistas y Filtros
    const [activeView, setActiveView] = useState<ActiveView>('clients');
    const [selectedDrilldownProductId, setSelectedDrilldownProductId] = useState<string>('');
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [exportScope, setExportScope] = useState<'day' | 'month' | 'custom'>('day');
    const [customStartDate, setCustomStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customEndDate, setCustomEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [isExporting, setIsExporting] = useState(false);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [activePokaYoke, setActivePokaYoke] = useState<PokaYokeFilter>('all');

    // 3.1 Estados de Ordenamiento de Columnas
    const [orderSortColumn, setOrderSortColumn] = useState<'consecutivo' | 'client' | 'document' | 'total' | 'margin'>('consecutivo');
    const [orderSortDirection, setOrderSortDirection] = useState<'asc' | 'desc'>('asc');

    const handleOrderSort = (col: 'consecutivo' | 'client' | 'document' | 'total' | 'margin') => {
        if (orderSortColumn === col) {
            setOrderSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setOrderSortColumn(col);
            setOrderSortDirection(col === 'total' || col === 'margin' ? 'desc' : 'asc');
        }
    };

    const [productSortColumn, setProductSortColumn] = useState<'name' | 'category' | 'quantity' | 'orders' | 'avg_price' | 'cost' | 'sales' | 'profit' | 'margin'>('quantity');
    const [productSortDirection, setProductSortDirection] = useState<'asc' | 'desc'>('desc');

    const handleProductSort = (col: 'name' | 'category' | 'quantity' | 'orders' | 'avg_price' | 'cost' | 'sales' | 'profit' | 'margin') => {
        if (productSortColumn === col) {
            setProductSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setProductSortColumn(col);
            setProductSortDirection(col === 'name' || col === 'category' ? 'asc' : 'desc');
        }
    };

    // 4. Catálogos auxiliares de costos y productos
    const [costMap, setCostMap] = useState<Map<string, number>>(new Map());
    const [productsMap, setProductsMap] = useState<Map<string, any>>(new Map());
    const [profilesMap, setProfilesMap] = useState<Map<string, any>>(new Map());

    // Cargar Catálogos Iniciales (Matriz de Costos, Productos y Clientes)
    useEffect(() => {
        async function loadCatalogs() {
            try {
                const [matrixRes, productsRes, profilesRes] = await Promise.all([
                    supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true).range(0, 4999),
                    supabase.from('products').select('id, name, sku, category, unit_of_measure, accounting_id').range(0, 4999),
                    supabase.from('profiles').select('id, company_name, contact_name, nit, address, role, document_type, razon_social, branch_id').range(0, 4999)
                ]);

                const cMap = new Map<string, number>();
                (matrixRes.data || []).forEach((m: any) => {
                    if (m.manual_cost && Number(m.manual_cost) > 0) {
                        cMap.set(m.product_id, Number(m.manual_cost));
                    }
                });
                setCostMap(cMap);

                const pMap = new Map<string, any>();
                (productsRes.data || []).forEach((p: any) => pMap.set(p.id, p));
                setProductsMap(pMap);

                const profMap = new Map<string, any>();
                (profilesRes.data || []).forEach((pr: any) => profMap.set(pr.id, pr));
                setProfilesMap(profMap);
            } catch (err) {
                console.error('Error loading catalogs in Daily Monitor:', err);
            }
        }
        loadCatalogs();
    }, []);

    // Cargar Lista de Fechas con Boxing de 6 Meses
    const fetchDates = useCallback(async () => {
        setLoadingDates(true);
        try {
            const sixMonthsAgo = new Date();
            sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
            const minDateIso = sixMonthsAgo.toISOString().split('T')[0];

            const { data, error } = await supabase
                .from('orders')
                .select('delivery_date, total')
                .gte('delivery_date', minDateIso)
                .neq('status', 'cancelled')
                .order('delivery_date', { ascending: false });

            if (error) throw error;

            const aggMap = new Map<string, { count: number; total: number }>();
            (data || []).forEach((row: any) => {
                const d = row.delivery_date || '';
                if (d) {
                    if (!aggMap.has(d)) {
                        aggMap.set(d, { count: 0, total: 0 });
                    }
                    const cur = aggMap.get(d)!;
                    cur.count += 1;
                    cur.total += Number(row.total || 0);
                }
            });

            const dateList: DateEntry[] = Array.from(aggMap.entries()).map(([date, val]) => ({
                date,
                orderCount: val.count,
                totalSales: val.total
            })).sort((a, b) => b.date.localeCompare(a.date));

            setAvailableDates(dateList);

            // Seleccionar la fecha más reciente por defecto si no hay seleccionada
            if (dateList.length > 0 && !selectedDate) {
                setSelectedDate(dateList[0].date);
            }
        } catch (err) {
            console.error('Error fetching delivery dates:', err);
        } finally {
            setLoadingDates(false);
        }
    }, [selectedDate]);

    useEffect(() => {
        fetchDates();
    }, [fetchDates]);

    // Cargar Detalle de Órdenes e Ítems del Día Seleccionado
    const fetchDayOrders = useCallback(async (date: string) => {
        if (!date) return;
        setLoadingDayData(true);
        try {
            // 1. Órdenes del día
            const { data: ordersData, error: ordersErr } = await supabase
                .from('orders')
                .select('*')
                .eq('delivery_date', date)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: true });

            if (ordersErr) throw ordersErr;

            const ordersList = ordersData || [];
            const orderIds = ordersList.map((o: any) => o.id);

            // 2. Traer order_items por lotes
            let allItems: any[] = [];
            if (orderIds.length > 0) {
                for (let i = 0; i < orderIds.length; i += 60) {
                    const chunk = orderIds.slice(i, i + 60);
                    const { data: itemsBatch } = await supabase
                        .from('order_items')
                        .select('*')
                        .in('order_id', chunk);
                    if (itemsBatch) allItems.push(...itemsBatch);
                }
            }

            // Agrupar items por orden
            const itemsByOrder = new Map<string, any[]>();
            allItems.forEach((it: any) => {
                if (!itemsByOrder.has(it.order_id)) itemsByOrder.set(it.order_id, []);
                itemsByOrder.get(it.order_id)!.push(it);
            });

            // 3. Procesar órdenes y calcular costos/márgenes
            const processedOrders: OrderDetail[] = ordersList.map((ord: any) => {
                const profile = profilesMap.get(ord.profile_id) || {};
                const itemsRaw = itemsByOrder.get(ord.id) || [];

                let orderEstimatedCost = 0;
                let calculatedWeight = 0;

                const processedItems: OrderItemDetail[] = itemsRaw.map((it: any) => {
                    const prod = productsMap.get(it.product_id) || {};
                    const unitPrice = Number(it.unit_price || 0);
                    const qty = Number(it.quantity || 0);
                    const totalSales = unitPrice * qty;

                    // Costo de matriz o estimación 70% si no existe
                    const unitCost = costMap.get(it.product_id) || (unitPrice > 0 ? unitPrice * 0.70 : 0);
                    const totalCost = unitCost * qty;
                    const itemProfit = totalSales - totalCost;
                    const itemMarginPct = totalSales > 0 ? (itemProfit / totalSales) * 100 : 0;

                    orderEstimatedCost += totalCost;
                    calculatedWeight += (it.unit?.toLowerCase().includes('kg') ? qty : qty * 0.5);

                    return {
                        id: it.id,
                        orderId: ord.id,
                        productId: it.product_id,
                        productName: prod.name || it.variant_label || 'Producto Agro',
                        sku: prod.sku || 'SKU-00',
                        category: prod.category || 'General',
                        quantity: qty,
                        unit: it.unit || prod.unit_of_measure || 'Kg',
                        unitPrice,
                        unitCost,
                        totalItemSales: totalSales,
                        totalItemCost: totalCost,
                        itemProfit,
                        itemMarginPct
                    };
                });

                const totalSales = Number(ord.total || 0);
                const grossProfit = totalSales - orderEstimatedCost;
                const marginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

                const friendlyId = getFriendlyOrderId(ord);
                const clientName = profile.company_name || profile.razon_social || profile.contact_name || ord.customer_name || 'Cliente Institucional';
                const companyName = profile.razon_social || profile.company_name || 'Sin Razón Social';
                const nit = profile.nit || ord.customer_nit || 'Sin NIT';
                const isB2B = profile.role === 'b2b_client' || profile.role === 'corporate' || Boolean(profile.parent_id) || Boolean(profile.nit && profile.nit.length > 5) || ord.type === 'b2b';
                const clientType: 'b2b' | 'b2c' = isB2B ? 'b2b' : 'b2c';
                const isInvoice = profile.document_type === 'invoice' || Boolean(ord.invoice_id);
                const documentType = isInvoice ? 'Factura' : 'Remisión';
                const { branchName, parentName } = parseClientBranchInfo(clientName, profile.razon_social);

                return {
                    id: ord.id,
                    sequenceId: ord.sequence_id || ord.id.slice(0, 8),
                    friendlyId,
                    profileId: ord.profile_id,
                    clientName,
                    branchName,
                    parentName,
                    companyName,
                    nit,
                    zone: ord.logistics_data?.zone_name || ord.shipping_address?.split(',')[1]?.trim() || 'Bogotá Principal',
                    address: ord.shipping_address || profile.address || 'Entrega en Sede Principal',
                    type: clientType,
                    documentType,
                    status: ord.status || 'Confirmado',
                    subtotal: Number(ord.subtotal || ord.total || 0),
                    tax: Number(ord.tax || 0),
                    paymentMethod: ord.payment_method === 'payroll_deduction' ? 'Nómina' : (ord.payment_method === 'wompi' ? 'Wompi' : 'Crédito/Contra Entrega'),
                    paymentStatus: ord.payment_status || 'Pendiente',
                    total: totalSales,
                    totalWeightKg: ord.total_weight_kg || calculatedWeight,
                    itemsCount: processedItems.length,
                    estimatedCost: orderEstimatedCost,
                    grossProfit,
                    marginPct,
                    items: processedItems
                };
            });

            // 4. Evaluar Banners Poka-Yoke del Gemba
            // A) Valores Iguales: Misma sucursal (profile_id) con 2 o más pedidos con mismo valor
            const branchValueCount = new Map<string, number>();
            processedOrders.forEach(o => {
                const key = `${o.profileId}_${Math.round(o.total)}`;
                branchValueCount.set(key, (branchValueCount.get(key) || 0) + 1);
            });

            // B) Más de un pedido por sucursal en el día
            const branchOrderCount = new Map<string, number>();
            processedOrders.forEach(o => {
                branchOrderCount.set(o.profileId, (branchOrderCount.get(o.profileId) || 0) + 1);
            });

            processedOrders.forEach(o => {
                const key = `${o.profileId}_${Math.round(o.total)}`;
                const equalCount = branchValueCount.get(key) || 0;
                const totalBranchCount = branchOrderCount.get(o.profileId) || 0;

                o.hasEqualValueAlert = equalCount > 1;
                o.hasMultipleOrdersAlert = totalBranchCount > 1;
                // Umbral pedido mínimo: < $150.000 para B2B o < $50.000 para B2C
                o.hasUnderMinimumAlert = (o.type === 'b2b' && o.total < 150000 && o.total > 0) || (o.type === 'b2c' && o.total < 50000 && o.total > 0);
            });

            setDayOrders(processedOrders);

            // 5. Consolidar Demanda por Producto (Vista 2)
            const prodAggMap = new Map<string, {
                productName: string;
                sku: string;
                category: string;
                unit: string;
                totalQty: number;
                totalSales: number;
                totalCost: number;
                orderIds: Set<string>;
            }>();

            processedOrders.forEach(ord => {
                ord.items.forEach(it => {
                    if (!prodAggMap.has(it.productId)) {
                        prodAggMap.set(it.productId, {
                            productName: it.productName,
                            sku: it.sku,
                            category: it.category,
                            unit: it.unit,
                            totalQty: 0,
                            totalSales: 0,
                            totalCost: 0,
                            orderIds: new Set()
                        });
                    }
                    const cur = prodAggMap.get(it.productId)!;
                    cur.totalQty += it.quantity;
                    cur.totalSales += it.totalItemSales;
                    cur.totalCost += it.totalItemCost;
                    cur.orderIds.add(ord.id);
                });
            });

            const consolidatedList: ProductConsolidated[] = Array.from(prodAggMap.entries()).map(([pId, val]) => {
                const avgSellingPrice = val.totalQty > 0 ? val.totalSales / val.totalQty : 0;
                const avgUnitCost = val.totalQty > 0 ? val.totalCost / val.totalQty : 0;
                const grossProfit = val.totalSales - val.totalCost;
                const marginPct = val.totalSales > 0 ? (grossProfit / val.totalSales) * 100 : 0;

                return {
                    productId: pId,
                    productName: val.productName,
                    sku: val.sku,
                    category: val.category,
                    unit: val.unit,
                    totalQuantity: val.totalQty,
                    totalSales: val.totalSales,
                    totalCost: val.totalCost,
                    avgSellingPrice,
                    avgUnitCost,
                    grossProfit,
                    marginPct,
                    ordersCount: val.orderIds.size
                };
            }).sort((a, b) => b.totalQuantity - a.totalQuantity);

            setProductConsolidated(consolidatedList);

            // Auto-seleccionar primer producto para drill-down si no hay ninguno
            if (consolidatedList.length > 0 && !selectedDrilldownProductId) {
                setSelectedDrilldownProductId(consolidatedList[0].productId);
            }
        } catch (err) {
            console.error('Error loading day details:', err);
        } finally {
            setLoadingDayData(false);
        }
    }, [profilesMap, productsMap, costMap, selectedDrilldownProductId]);

    useEffect(() => {
        if (selectedDate && productsMap.size > 0) {
            fetchDayOrders(selectedDate);
        }
    }, [selectedDate, productsMap, fetchDayOrders]);

    // Resumen de Alertas Poka-Yoke
    const pokaYokeCounts = useMemo(() => {
        let equalVal = 0;
        let multiple = 0;
        let underMin = 0;

        dayOrders.forEach(o => {
            if (o.hasEqualValueAlert) equalVal++;
            if (o.hasMultipleOrdersAlert) multiple++;
            if (o.hasUnderMinimumAlert) underMin++;
        });

        return { equalVal, multiple, underMin };
    }, [dayOrders]);

    // Filtrar órdenes por Poka-Yoke y Búsqueda
    const filteredOrders = useMemo(() => {
        return dayOrders.filter(o => {
            // Filtro Poka-Yoke
            if (activePokaYoke === 'equal_value' && !o.hasEqualValueAlert) return false;
            if (activePokaYoke === 'multiple_orders' && !o.hasMultipleOrdersAlert) return false;
            if (activePokaYoke === 'under_minimum' && !o.hasUnderMinimumAlert) return false;

            // Filtro de Búsqueda
            if (searchTerm.trim()) {
                const s = searchTerm.toLowerCase();
                return o.clientName.toLowerCase().includes(s) ||
                    (o.friendlyId && o.friendlyId.toLowerCase().includes(s)) ||
                    o.sequenceId.toString().toLowerCase().includes(s) ||
                    o.zone.toLowerCase().includes(s) ||
                    o.address.toLowerCase().includes(s) ||
                    o.nit.toLowerCase().includes(s);
            }
            return true;
        });
    }, [dayOrders, activePokaYoke, searchTerm]);

    // Filtrar consolidado de productos por búsqueda
    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return productConsolidated;
        const s = searchTerm.toLowerCase();
        return productConsolidated.filter(p =>
            p.productName.toLowerCase().includes(s) ||
            p.sku.toLowerCase().includes(s) ||
            p.category.toLowerCase().includes(s)
        );
    }, [productConsolidated, searchTerm]);

        // Ordenamiento dinámico de pedidos filtrados (Vista 1)
    const sortedFilteredOrders = useMemo(() => {
        const list = [...filteredOrders];
        list.sort((a, b) => {
            let valA: any;
            let valB: any;

            if (orderSortColumn === 'consecutivo') {
                valA = Number(a.sequenceId) || 0;
                valB = Number(b.sequenceId) || 0;
            } else if (orderSortColumn === 'client') {
                valA = (a.branchName || a.clientName || '').toLowerCase();
                valB = (b.branchName || b.clientName || '').toLowerCase();
                const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
                return orderSortDirection === 'asc' ? cmp : -cmp;
            } else if (orderSortColumn === 'document') {
                valA = `${a.documentType || ''}_${a.paymentMethod || ''}`.toLowerCase();
                valB = `${b.documentType || ''}_${b.paymentMethod || ''}`.toLowerCase();
                const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
                return orderSortDirection === 'asc' ? cmp : -cmp;
            } else if (orderSortColumn === 'total') {
                valA = Number(a.total) || 0;
                valB = Number(b.total) || 0;
            } else if (orderSortColumn === 'margin') {
                valA = Number(a.grossProfit) || 0;
                valB = Number(b.grossProfit) || 0;
            } else {
                return 0;
            }

            if (valA < valB) return orderSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return orderSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredOrders, orderSortColumn, orderSortDirection]);

    // Ordenamiento dinámico de productos filtrados (Vista 2)
    const sortedFilteredProducts = useMemo(() => {
        const list = [...filteredProducts];
        list.sort((a, b) => {
            let valA: any;
            let valB: any;

            if (productSortColumn === 'name') {
                valA = (a.productName || '').toLowerCase();
                valB = (b.productName || '').toLowerCase();
                const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
                return productSortDirection === 'asc' ? cmp : -cmp;
            } else if (productSortColumn === 'category') {
                valA = (a.category || '').toLowerCase();
                valB = (b.category || '').toLowerCase();
                const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base' });
                return productSortDirection === 'asc' ? cmp : -cmp;
            } else if (productSortColumn === 'quantity') {
                valA = Number(a.totalQuantity) || 0;
                valB = Number(b.totalQuantity) || 0;
            } else if (productSortColumn === 'orders') {
                valA = Number(a.ordersCount) || 0;
                valB = Number(b.ordersCount) || 0;
            } else if (productSortColumn === 'avg_price') {
                valA = Number(a.avgSellingPrice) || 0;
                valB = Number(b.avgSellingPrice) || 0;
            } else if (productSortColumn === 'cost') {
                valA = Number(a.avgUnitCost) || 0;
                valB = Number(b.avgUnitCost) || 0;
            } else if (productSortColumn === 'sales') {
                valA = Number(a.totalSales) || 0;
                valB = Number(b.totalSales) || 0;
            } else if (productSortColumn === 'profit') {
                valA = Number(a.grossProfit) || 0;
                valB = Number(b.grossProfit) || 0;
            } else if (productSortColumn === 'margin') {
                valA = Number(a.marginPct) || 0;
                valB = Number(b.marginPct) || 0;
            } else {
                return 0;
            }

            if (valA < valB) return productSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return productSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredProducts, productSortColumn, productSortDirection]);

    // Detalle Drill-Down: Quién pidió el producto seleccionado hoy
    const drilldownData = useMemo(() => {
        if (!selectedDrilldownProductId) return [];
        const rows: {
            orderSequenceId: string | number;
            orderId: string;
            clientName: string;
            zone: string;
            quantity: number;
            unit: string;
            unitPrice: number;
            unitCost: number;
            totalSales: number;
            profit: number;
            marginPct: number;
        }[] = [];

        dayOrders.forEach(ord => {
            const match = ord.items.find(it => it.productId === selectedDrilldownProductId);
            if (match) {
                rows.push({
                    orderSequenceId: ord.sequenceId,
                    orderId: ord.id,
                    clientName: ord.clientName,
                    zone: ord.zone,
                    quantity: match.quantity,
                    unit: match.unit,
                    unitPrice: match.unitPrice,
                    unitCost: match.unitCost,
                    totalSales: match.totalItemSales,
                    profit: match.itemProfit,
                    marginPct: match.itemMarginPct
                });
            }
        });

        return rows.sort((a, b) => b.quantity - a.quantity);
    }, [dayOrders, selectedDrilldownProductId]);

    // Totales del Día
    const dayTotals = useMemo(() => {
        let totalSales = 0;
        let totalCost = 0;
        let totalKg = 0;

        dayOrders.forEach(o => {
            totalSales += o.total;
            totalCost += o.estimatedCost;
            totalKg += o.totalWeightKg;
        });

        const grossProfit = totalSales - totalCost;
        const marginPct = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

        return {
            totalSales,
            totalCost,
            grossProfit,
            marginPct,
            totalKg,
            ordersCount: dayOrders.length
        };
    }, [dayOrders]);

    // Selector de Boxing (Meses)
    const monthOptions = useMemo(() => {
        const options: { offset: number; label: string; yearMonth: string }[] = [];
        const now = new Date();
        for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = d.toLocaleString('es-CO', { month: 'long', year: 'numeric' });
            const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            options.push({
                offset: i,
                label: label.charAt(0).toUpperCase() + label.slice(1),
                yearMonth: ym
            });
        }
        return options;
    }, []);

    // Fechas filtradas según el mes seleccionado en el boxing
    const visibleDates = useMemo(() => {
        const targetYm = monthOptions[selectedMonthOffset]?.yearMonth;
        if (!targetYm) return availableDates;
        return availableDates.filter(d => d.date.startsWith(targetYm));
    }, [availableDates, monthOptions, selectedMonthOffset]);

        // Exportar a Excel (.xlsx) con Selector de Período (Día, Mes Completo o Rango Personalizado)
    const handleExportExcel = async (scope: 'day' | 'month' | 'custom' = exportScope) => {
        setIsExporting(true);
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            if (scope === 'day') {
                if (activeView === 'clients') {
                    const data = filteredOrders.map(o => ({
                        'Consecutivo Planta': o.friendlyId || o.sequenceId,
                        'No. Sistema': o.sequenceId,
                        'Cliente / Sucursal': o.clientName,
                        'Razón Social': o.companyName,
                        'NIT': o.nit,
                        'Zona': o.zone,
                        'Dirección': o.address,
                        'Canal': o.type === 'b2b' ? 'B2B Institucional' : 'B2C Hogar',
                        'Modalidad Documental': o.documentType,
                        'Medio de Pago': o.paymentMethod,
                        'Estado Operativo': o.status || 'Confirmado',
                        'Total Kilos (Kg)': Number(o.totalWeightKg.toFixed(2)),
                        'Total Pedido ($)': Math.round(o.total),
                        'Costo Estimado ($)': Math.round(o.estimatedCost),
                        'Utilidad Bruta ($)': Math.round(o.grossProfit),
                        'Margen (%)': `${o.marginPct.toFixed(1)}%`,
                        'Alerta Gemba': o.hasEqualValueAlert ? 'Valor Duplicado' : (o.hasMultipleOrdersAlert ? 'Multipedido' : (o.hasUnderMinimumAlert ? 'Bajo Mínimo' : 'OK'))
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, `Relacion_Pedidos_${selectedDate}`);
                    XLSX.writeFile(wb, `Relacion_Diaria_Pedidos_${selectedDate}.xlsx`);
                    setIsExportModalOpen(false);
                    return;
                } else if (activeView === 'products') {
                    const data = filteredProducts.map(p => ({
                        'Cód. Contable': p.accountingId || p.sku,
                        'Código SKU': p.sku,
                        'Producto': p.productName,
                        'Categoría': CATEGORY_MAP[p.category] || p.category,
                        'Unidad': p.unit,
                        'Cantidad Pedida': Number(p.totalQuantity.toFixed(2)),
                        'No. Pedidos': p.ordersCount,
                        'Precio Prom. Facturado ($)': Math.round(p.avgSellingPrice),
                        'Costo Base Matriz ($)': Math.round(p.avgUnitCost),
                        'Total Venta ($)': Math.round(p.totalSales),
                        'Total Costo ($)': Math.round(p.totalCost),
                        'Utilidad Bruta ($)': Math.round(p.grossProfit),
                        'Margen Ponderado (%)': `${p.marginPct.toFixed(1)}%`
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, `Ventas_Productos_${selectedDate}`);
                    XLSX.writeFile(wb, `Reporte_Comercial_BI_${selectedDate}_products.xlsx`);
                    setIsExportModalOpen(false);
                    return;
                } else {
                    const selProd = productsMap.get(selectedDrilldownProductId);
                    const data = drilldownData.map(d => ({
                        'No. Pedido': d.orderSequenceId,
                        'Cliente / Sucursal': d.clientName,
                        'Zona': d.zone,
                        'Producto': selProd?.name || 'Producto Seleccionado',
                        'Cantidad': d.quantity,
                        'Unidad': d.unit,
                        'Precio Facturado ($)': Math.round(d.unitPrice),
                        'Costo Base ($)': Math.round(d.unitCost),
                        'Total Facturado ($)': Math.round(d.totalSales),
                        'Utilidad Bruta ($)': Math.round(d.profit),
                        'Margen (%)': `${d.marginPct.toFixed(1)}%`
                    }));
                    const ws = XLSX.utils.json_to_sheet(data);
                    XLSX.utils.book_append_sheet(wb, ws, `Drilldown_${selectedDate}`);
                    XLSX.writeFile(wb, `Reporte_Comercial_BI_${selectedDate}_drilldown.xlsx`);
                    setIsExportModalOpen(false);
                    return;
                }
            }

            // Exportación Multi-Día (Mes Completo o Rango Personalizado)
            let startIso = '';
            let endIso = '';
            let filenameScope = '';

            if (scope === 'month') {
                const currentYm = monthOptions[selectedMonthOffset]?.yearMonth || (selectedDate ? selectedDate.slice(0, 7) : new Date().toISOString().slice(0, 7));
                const [y, m] = currentYm.split('-').map(Number);
                const lastDay = new Date(y, m, 0).getDate();
                startIso = `${currentYm}-01`;
                endIso = `${currentYm}-${String(lastDay).padStart(2, '0')}`;
                filenameScope = `Mes_${currentYm}`;
            } else {
                startIso = customStartDate;
                endIso = customEndDate;
                filenameScope = `${customStartDate}_a_${customEndDate}`;
            }

            const { data: rangeOrders, error: rangeErr } = await supabase
                .from('orders')
                .select('*')
                .gte('delivery_date', startIso)
                .lte('delivery_date', endIso)
                .neq('status', 'cancelled')
                .order('delivery_date', { ascending: true })
                .order('sequence_id', { ascending: true })
                .range(0, 4999);

            if (rangeErr) throw rangeErr;

            const data = (rangeOrders || []).map((ord: any) => {
                const profile = profilesMap.get(ord.profile_id) || {};
                const friendlyId = getFriendlyOrderId(ord);
                const clientName = profile.company_name || profile.razon_social || profile.contact_name || ord.customer_name || 'Cliente Institucional';
                const companyName = profile.razon_social || profile.company_name || 'Sin Razón Social';
                const nit = profile.nit || ord.customer_nit || 'Sin NIT';
                const isB2B = profile.role === 'b2b_client' || profile.role === 'corporate' || Boolean(profile.parent_id) || Boolean(profile.nit && profile.nit.length > 5) || ord.type === 'b2b';
                const clientType = isB2B ? 'B2B Institucional' : 'B2C Hogar';
                const isInvoice = profile.document_type === 'invoice' || Boolean(ord.invoice_id);
                const documentType = isInvoice ? 'Factura' : 'Remisión';

                return {
                    'Fecha Entrega': ord.delivery_date,
                    'Consecutivo Planta': friendlyId,
                    'No. Sistema': ord.sequence_id,
                    'Cliente / Sucursal': clientName,
                    'Razón Social': companyName,
                    'NIT': nit,
                    'Zona': ord.logistics_data?.zone_name || ord.shipping_address?.split(',')[1]?.trim() || 'Bogotá Principal',
                    'Dirección': ord.shipping_address || profile.address || 'Entrega en Sede Principal',
                    'Canal': clientType,
                    'Modalidad Documental': documentType,
                    'Medio de Pago': ord.payment_method === 'payroll_deduction' ? 'Nómina' : (ord.payment_method === 'wompi' ? 'Wompi' : 'Crédito/Contra Entrega'),
                    'Estado Operativo': ord.status || 'Confirmado',
                    'Total Kilos (Kg)': Number((ord.total_weight_kg || 0).toFixed(2)),
                    'Total Pedido ($)': Math.round(ord.total || 0)
                };
            });

            const ws = XLSX.utils.json_to_sheet(data);
            XLSX.utils.book_append_sheet(wb, ws, `Relacion_${filenameScope.slice(0, 20)}`);
            XLSX.writeFile(wb, `Relacion_Pedidos_${filenameScope}.xlsx`);
            setIsExportModalOpen(false);
        } catch (err) {
            console.error('Error exporting range orders:', err);
            alert('Ocurrió un error al generar la exportación consolidada.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 0' }}>
            {/* CABECERA INDUSTRIAL DEL SUBMÓDULO */}
            <div style={{
                backgroundColor: 'white',
                borderRadius: THEME.radius.lg,
                padding: '1.25rem 1.75rem',
                border: `1px solid ${THEME.colors.border}`,
                boxShadow: THEME.shadow.sm,
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{
                            backgroundColor: '#E0F2FE',
                            color: '#0369A1',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: '800',
                            letterSpacing: '0.05em'
                        }}>
                            BUSINESS INTELLIGENCE • DESPACHO & PRECIOS FACTURADOS
                        </span>
                        <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                            Política de Boxing: 6 Meses (180 Días)
                        </span>
                    </div>
                    <h1 style={{
                        fontSize: '1.45rem',
                        fontWeight: '800',
                        color: THEME.colors.textMain,
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                    }}>
                        Monitor Diario de Pedidos, Productos & Márgenes
                        {selectedDate && (
                            <span style={{
                                backgroundColor: THEME.colors.primaryLight,
                                color: THEME.colors.primary,
                                fontSize: '0.9rem',
                                padding: '3px 10px',
                                borderRadius: '8px',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Calendar size={15} /> {selectedDate}
                            </span>
                        )}
                    </h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={() => fetchDayOrders(selectedDate)}
                        disabled={loadingDayData}
                        style={{
                            padding: '0.55rem 0.95rem',
                            borderRadius: THEME.radius.md,
                            backgroundColor: '#F8FAFC',
                            border: `1px solid ${THEME.colors.border}`,
                            color: THEME.colors.textMain,
                            fontWeight: '700',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <RefreshCw size={15} className={loadingDayData ? 'animate-spin' : ''} />
                        Actualizar
                    </button>

                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'stretch',
                        borderRadius: THEME.radius.md,
                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)',
                        overflow: 'hidden'
                    }}>
                        <button
                            type="button"
                            onClick={() => handleExportExcel('day')}
                            disabled={isExporting}
                            style={{
                                padding: '0.55rem 1rem',
                                backgroundColor: '#0D7A57',
                                border: 'none',
                                borderRight: '1px solid rgba(255,255,255,0.25)',
                                color: 'white',
                                fontWeight: '700',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'background-color 0.15s ease'
                            }}
                            title="Descargar de inmediato la jornada seleccionada en pantalla"
                        >
                            <FileSpreadsheet size={16} />
                            {isExporting ? 'Generando...' : (activeView === 'clients' ? 'Descargar Relación (.xlsx)' : 'Descargar Excel (.xlsx)')}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsExportModalOpen(true)}
                            disabled={isExporting}
                            style={{
                                padding: '0.55rem 0.75rem',
                                backgroundColor: '#0A6346',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                transition: 'background-color 0.15s ease'
                            }}
                            title="Seleccionar período: Día, Mes Completo o Rango Personalizado"
                        >
                            <CalendarRange size={14} />
                            <span>Período</span>
                            <ChevronDown size={13} />
                        </button>
                    </div>
                </div>
            </div>

            {/* LAYOUT PRINCIPAL: SIDEBAR DE FECHAS (280px) + CONTENIDO ANALÍTICO */}
            <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
                
                {/* SIDEBAR DE FECHAS DE ENTREGA CON BOXING DE 6 MESES */}
                <div style={{
                    backgroundColor: 'white',
                    borderRadius: THEME.radius.lg,
                    border: `1px solid ${THEME.colors.border}`,
                    boxShadow: THEME.shadow.sm,
                    overflow: 'hidden',
                    position: 'sticky',
                    top: '90px'
                }}>
                    <div style={{
                        padding: '1rem',
                        backgroundColor: '#F8FAFC',
                        borderBottom: `1px solid ${THEME.colors.border}`
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Calendar size={14} /> Fechas de Entrega
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#0369A1', backgroundColor: '#E0F2FE', padding: '1px 6px', borderRadius: '4px' }}>
                                6 Meses
                            </span>
                        </div>

                        {/* Selector de Mes (Boxing Filter) */}
                        <select
                            value={selectedMonthOffset}
                            onChange={(e) => setSelectedMonthOffset(Number(e.target.value))}
                            style={{
                                width: '100%',
                                padding: '0.45rem 0.6rem',
                                borderRadius: THEME.radius.sm,
                                border: `1px solid ${THEME.colors.border}`,
                                fontSize: '0.82rem',
                                fontWeight: '700',
                                color: THEME.colors.textMain,
                                backgroundColor: 'white'
                            }}
                        >
                            {monthOptions.map(m => (
                                <option key={m.offset} value={m.offset}>{m.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Lista Vertical de Días */}
                    <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }} className="custom-scrollbar">
                        {loadingDates ? (
                            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                Cargando calendario de entregas...
                            </div>
                        ) : visibleDates.length === 0 ? (
                            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                No hay despachos registrados en este mes.
                            </div>
                        ) : (
                            visibleDates.map(item => {
                                const isSelected = selectedDate === item.date;
                                return (
                                    <button
                                        key={item.date}
                                        onClick={() => setSelectedDate(item.date)}
                                        style={{
                                            width: '100%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.75rem 1rem',
                                            border: 'none',
                                            borderBottom: `1px solid #F1F5F9`,
                                            backgroundColor: isSelected ? '#F0FDF4' : 'white',
                                            borderLeft: isSelected ? `4px solid ${THEME.colors.primary}` : '4px solid transparent',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div>
                                            <div style={{
                                                fontSize: '0.88rem',
                                                fontWeight: isSelected ? '800' : '600',
                                                color: isSelected ? THEME.colors.primary : THEME.colors.textMain
                                            }}>
                                                {item.date}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                                                {formatMoney(item.totalSales)}
                                            </div>
                                        </div>

                                        <span style={{
                                            backgroundColor: isSelected ? THEME.colors.primary : '#F1F5F9',
                                            color: isSelected ? 'white' : '#475569',
                                            padding: '3px 8px',
                                            borderRadius: '999px',
                                            fontSize: '0.72rem',
                                            fontWeight: '800'
                                        }}>
                                            {item.orderCount} {item.orderCount === 1 ? 'pedido' : 'pedidos'}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* CONTENIDO PRINCIPAL: KPIS + BANNERS POKA-YOKE + TABLAS */}
                <div>
                    {/* TARJETAS RESUMEN KPIS DEL DÍA */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                        gap: '1rem',
                        marginBottom: '1rem'
                    }}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: THEME.radius.lg,
                            padding: '1rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                Venta Facturada Día
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '800', color: THEME.colors.textMain, marginTop: '4px' }}>
                                {formatMoney(dayTotals.totalSales)}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                {dayTotals.ordersCount} pedidos confirmados
                            </div>
                        </div>

                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: THEME.radius.lg,
                            padding: '1rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                Margen Bruto Ponderado
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '800', color: dayTotals.marginPct >= 20 ? '#0D7A57' : '#D97706', marginTop: '4px' }}>
                                {dayTotals.marginPct.toFixed(1)}%
                            </div>
                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                Utilidad: {formatMoney(dayTotals.grossProfit)}
                            </div>
                        </div>

                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: THEME.radius.lg,
                            padding: '1rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                Volumen Despachado
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#0369A1', marginTop: '4px' }}>
                                {formatNumber(dayTotals.totalKg, 1)} Kg
                            </div>
                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                Peso neto estimado en alimentos
                            </div>
                        </div>

                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: THEME.radius.lg,
                            padding: '1rem',
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>
                                Variedad de Productos
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: '800', color: '#6366F1', marginTop: '4px' }}>
                                {productConsolidated.length} SKUs
                            </div>
                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                En la canasta activa del día
                            </div>
                        </div>
                    </div>

                    {/* TRIADA DE BANNERS POKA-YOKE DEL GEMBA (CONTROL DE ANOMALÍAS) */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '0.75rem',
                        marginBottom: '1.25rem'
                    }}>
                        {/* 1. Alerta Valores Iguales (Rojo) */}
                        <div
                            onClick={() => setActivePokaYoke(activePokaYoke === 'equal_value' ? 'all' : 'equal_value')}
                            style={{
                                backgroundColor: activePokaYoke === 'equal_value' ? '#FEE2E2' : '#FEF2F2',
                                border: `1px solid ${activePokaYoke === 'equal_value' ? '#EF4444' : '#FCA5A5'}`,
                                borderRadius: THEME.radius.md,
                                padding: '0.85rem 1rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    backgroundColor: '#DC2626',
                                    color: 'white',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '999px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '800',
                                    fontSize: '0.85rem'
                                }}>
                                    {pokaYokeCounts.equalVal}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#991B1B' }}>
                                        Revisión valores iguales
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#B91C1C' }}>
                                        Misma sucursal con pedidos de igual valor
                                    </div>
                                </div>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#991B1B', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                {activePokaYoke === 'equal_value' ? <><Check size={12} strokeWidth={2.5} /> Filtro Activo</> : 'Filtrar'}
                            </span>
                        </div>

                        {/* 2. Alerta Más de un Pedido por Sucursal (Morado) */}
                        <div
                            onClick={() => setActivePokaYoke(activePokaYoke === 'multiple_orders' ? 'all' : 'multiple_orders')}
                            style={{
                                backgroundColor: activePokaYoke === 'multiple_orders' ? '#F3E8FF' : '#FAF5FF',
                                border: `1px solid ${activePokaYoke === 'multiple_orders' ? '#A855F7' : '#D8B4FE'}`,
                                borderRadius: THEME.radius.md,
                                padding: '0.85rem 1rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    backgroundColor: '#9333EA',
                                    color: 'white',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '999px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '800',
                                    fontSize: '0.85rem'
                                }}>
                                    {pokaYokeCounts.multiple}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#6B21A8' }}>
                                        Más de un pedido por sucursal
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#7E22CE' }}>
                                        Pedidos fraccionados en la misma fecha
                                    </div>
                                </div>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6B21A8', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                {activePokaYoke === 'multiple_orders' ? <><Check size={12} strokeWidth={2.5} /> Filtro Activo</> : 'Filtrar'}
                            </span>
                        </div>

                        {/* 3. Alerta Valor Mínimo (Naranja) */}
                        <div
                            onClick={() => setActivePokaYoke(activePokaYoke === 'under_minimum' ? 'all' : 'under_minimum')}
                            style={{
                                backgroundColor: activePokaYoke === 'under_minimum' ? '#FFEDD5' : '#FFF7ED',
                                border: `1px solid ${activePokaYoke === 'under_minimum' ? '#F97316' : '#FDBA74'}`,
                                borderRadius: THEME.radius.md,
                                padding: '0.85rem 1rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{
                                    backgroundColor: '#EA580C',
                                    color: 'white',
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '999px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: '800',
                                    fontSize: '0.85rem'
                                }}>
                                    {pokaYokeCounts.underMin}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#9A3412' }}>
                                        Revisión del valor mínimo
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#C2410C' }}>
                                        Bajo el umbral mínimo de despacho
                                    </div>
                                </div>
                            </div>
                            <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9A3412', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                {activePokaYoke === 'under_minimum' ? <><Check size={12} strokeWidth={2.5} /> Filtro Activo</> : 'Filtrar'}
                            </span>
                        </div>
                    </div>

                                        {/* SELECTOR DE LAS 3 VISTAS ANALÍTICAS + BUSCADOR OMNIBOX (LÍNEA 1 STICKY DOCKED) */}
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: `${THEME.radius.lg} ${THEME.radius.lg} 0 0`,
                        border: `1px solid ${THEME.colors.border}`,
                        borderBottom: `1px solid ${THEME.colors.border}`,
                        padding: '0.55rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'nowrap',
                        gap: '0.75rem',
                        position: 'sticky',
                        top: '85px',
                        zIndex: 40,
                        boxShadow: '0 2px 4px rgba(0,0,0,0.03)'
                    }}>
                        {/* Selector de Píldoras de Vistas (Compacto en 1 sola línea) */}
                        <div style={{
                            display: 'inline-flex',
                            backgroundColor: '#F1F5F9',
                            padding: '3px',
                            borderRadius: '9px',
                            gap: '3px',
                            flexShrink: 0
                        }}>
                            <button
                                onClick={() => setActiveView('clients')}
                                style={{
                                    padding: '0.4rem 0.85rem',
                                    border: 'none',
                                    borderRadius: '6px',
                                    backgroundColor: activeView === 'clients' ? 'white' : 'transparent',
                                    color: activeView === 'clients' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontWeight: activeView === 'clients' ? '800' : '600',
                                    fontSize: '0.80rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: activeView === 'clients' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <Users size={14} /> 1. Ventas por Cliente ({dayOrders.length})
                            </button>

                            <button
                                onClick={() => setActiveView('products')}
                                style={{
                                    padding: '0.4rem 0.85rem',
                                    border: 'none',
                                    borderRadius: '6px',
                                    backgroundColor: activeView === 'products' ? 'white' : 'transparent',
                                    color: activeView === 'products' ? THEME.colors.primary : THEME.colors.textSecondary,
                                    fontWeight: activeView === 'products' ? '800' : '600',
                                    fontSize: '0.80rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: activeView === 'products' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <Package size={14} /> 2. Ventas por Producto ({productConsolidated.length})
                            </button>

                            <button
                                onClick={() => setActiveView('product_drilldown')}
                                style={{
                                    padding: '0.4rem 0.85rem',
                                    border: 'none',
                                    borderRadius: '6px',
                                    backgroundColor: activeView === 'product_drilldown' ? 'white' : 'transparent',
                                    color: activeView === 'product_drilldown' ? '#0369A1' : THEME.colors.textSecondary,
                                    fontWeight: activeView === 'product_drilldown' ? '800' : '600',
                                    fontSize: '0.80rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: activeView === 'product_drilldown' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                                }}
                            >
                                <Search size={14} /> 3. ¿Quién pidió este producto? (Drill-down)
                            </button>
                        </div>

                        {/* Buscador Omnibox Alineado a la Derecha en la Misma Fila */}
                        <div style={{ position: 'relative', width: '290px', maxWidth: '320px', flexShrink: 1 }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                            <input
                                type="text"
                                placeholder={activeView === 'clients' ? 'Buscar cliente, pedido o zona...' : 'Buscar producto o SKU...'}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem 1rem 0.5rem 2.2rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.85rem',
                                    outline: 'none',
                                    backgroundColor: '#F8FAFC'
                                }}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    style={{
                                        position: 'absolute',
                                        right: '10px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        border: 'none',
                                        background: 'transparent',
                                        color: THEME.colors.textSecondary,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '2px'
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                                        {activeView === 'clients' && (
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: `0 0 ${THEME.radius.lg} ${THEME.radius.lg}`,
                            border: `1px solid ${THEME.colors.border}`,
                            overflow: 'visible',
                            borderTop: 'none'
                        }}>
                                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: '137px', zIndex: 35 }}>
                                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                                        <th 
                                            onClick={() => handleOrderSort('consecutivo')}
                                            title="Ordenar por Consecutivo de Planta"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '14%', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Consecutivo & Zona</span>
                                                {orderSortColumn === 'consecutivo' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('client')}
                                            title="Ordenar por Cliente / Sucursal"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '36%', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Cliente & Sucursal</span>
                                                {orderSortColumn === 'client' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('document')}
                                            title="Ordenar por Modalidad Documental y Pago"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '16%', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Documento & Pago</span>
                                                {orderSortColumn === 'document' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('total')}
                                            title="Ordenar por Total Facturado"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '14%', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Facturación & Carga</span>
                                                {orderSortColumn === 'total' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleOrderSort('margin')}
                                            title="Ordenar por Utilidad / Margen"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '13%', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Rentabilidad BI</span>
                                                {orderSortColumn === 'margin' ? (
                                                    orderSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 1rem', width: '7%', textAlign: 'center', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                            Acción
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedFilteredOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '3.5rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                No se encontraron pedidos para los filtros aplicados.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedFilteredOrders.map((ord) => (
                                            <tr
                                                key={ord.id}
                                                style={{
                                                    borderBottom: '1px solid #F1F5F9',
                                                    backgroundColor: ord.hasEqualValueAlert ? '#FEF2F2' : (ord.hasMultipleOrdersAlert ? '#FAF5FF' : 'white'),
                                                    transition: 'background-color 0.15s ease'
                                                }}
                                            >
                                                {/* 1. Consecutivo & Zona */}
                                                <td style={{ padding: '1rem 1.25rem', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.primary, fontFamily: 'monospace', fontSize: '0.90rem', letterSpacing: '0.02em' }}>
                                                        {ord.friendlyId || ord.sequenceId}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        <span style={{ fontWeight: '600' }}>#{ord.sequenceId}</span>
                                                        <span>•</span>
                                                        <span style={{ backgroundColor: '#F1F5F9', color: '#475569', padding: '1px 5px', borderRadius: '4px', fontWeight: '600', fontSize: '0.70rem' }}>
                                                            {ord.zone}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* 2. Cliente & Sucursal (Desacople Limpio Sede vs Matriz) */}
                                                <td style={{ padding: '1rem 1.25rem', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.92rem', letterSpacing: '-0.01em' }}>
                                                                {ord.branchName || ord.clientName}
                                                            </span>
                                                            <span style={{
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.68rem',
                                                                fontWeight: '800',
                                                                backgroundColor: ord.type === 'b2b' ? '#EFF6FF' : '#F0FDF4',
                                                                color: ord.type === 'b2b' ? '#1D4ED8' : '#15803D',
                                                                border: `1px solid ${ord.type === 'b2b' ? '#BFDBFE' : '#BBF7D0'}`
                                                            }}>
                                                                {ord.type === 'b2b' ? 'B2B INSTITUCIONAL' : 'B2C HOGAR'}
                                                            </span>
                                                        </div>
                                                        {ord.parentName && (
                                                            <div style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: '500' }}>
                                                                Matriz: <span style={{ color: '#334155', fontWeight: '700' }}>{ord.parentName}</span>
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '1px' }}>
                                                            {ord.nit && ord.nit !== 'Sin NIT' && (
                                                                <span style={{ fontWeight: '600', color: '#475569' }}>NIT: {ord.nit}</span>
                                                            )}
                                                            <span>•</span>
                                                            <span style={{ color: '#64748B' }}>{ord.address}</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 3. Documento & Pago */}
                                                <td style={{ padding: '1rem 1.25rem', verticalAlign: 'top' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <div>
                                                            <span style={{
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: '800',
                                                                backgroundColor: ord.documentType === 'Factura' ? '#EFF6FF' : '#ECFDF5',
                                                                color: ord.documentType === 'Factura' ? '#1D4ED8' : '#047857',
                                                                border: `1px solid ${ord.documentType === 'Factura' ? '#BFDBFE' : '#A7F3D0'}`
                                                            }}>
                                                                {ord.documentType}
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem', color: '#475569', fontWeight: '600' }}>
                                                            {ord.paymentMethod}
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* 4. Facturación & Carga */}
                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', fontSize: '0.98rem', color: THEME.colors.textMain }}>
                                                        {formatMoney(ord.total)}
                                                    </div>
                                                    <div style={{ fontSize: '0.73rem', color: THEME.colors.textSecondary, marginTop: '3px' }}>
                                                        <strong style={{ color: '#0369A1' }}>{formatNumber(ord.totalWeightKg, 1)} Kg</strong> • {ord.itemsCount} {ord.itemsCount === 1 ? 'ítem' : 'ítems'}
                                                    </div>
                                                </td>

                                                {/* 5. Rentabilidad BI */}
                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'right', verticalAlign: 'top' }}>
                                                    <div style={{ fontWeight: '800', fontSize: '0.88rem', color: ord.grossProfit >= 0 ? '#0D7A57' : '#DC2626' }}>
                                                        {formatMoney(ord.grossProfit)}
                                                    </div>
                                                    <div style={{ marginTop: '4px' }}>
                                                        <span style={{
                                                            padding: '2px 7px',
                                                            borderRadius: '999px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            backgroundColor: ord.marginPct >= 20 ? '#DCFCE7' : (ord.marginPct >= 10 ? '#FEF3C7' : '#FEE2E2'),
                                                            color: ord.marginPct >= 20 ? '#15803D' : (ord.marginPct >= 10 ? '#B45309' : '#B91C1C'),
                                                            border: `1px solid ${ord.marginPct >= 20 ? '#86EFAC' : (ord.marginPct >= 10 ? '#FDE68A' : '#FECACA')}`
                                                        }}>
                                                            {ord.marginPct.toFixed(1)}% margen
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* 6. Acción */}
                                                <td style={{ padding: '1rem 1.25rem', textAlign: 'center', verticalAlign: 'middle' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                        {ord.hasEqualValueAlert && (
                                                            <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: '800', backgroundColor: '#FEE2E2', color: '#B91C1C' }}>
                                                                Duplicado
                                                            </span>
                                                        )}
                                                        {ord.hasMultipleOrdersAlert && !ord.hasEqualValueAlert && (
                                                            <span style={{ padding: '1px 5px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: '800', backgroundColor: '#F3E8FF', color: '#7E22CE' }}>
                                                                Multipedido
                                                            </span>
                                                        )}
                                                        <a
                                                            href={`/admin/orders/contingency-print?mode=remissions&orderId=${ord.id}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{
                                                                color: THEME.colors.primary,
                                                                padding: '5px 10px',
                                                                borderRadius: '6px',
                                                                backgroundColor: THEME.colors.primaryLight,
                                                                fontSize: '0.74rem',
                                                                fontWeight: '700',
                                                                textDecoration: 'none',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '3px',
                                                                transition: 'all 0.15s ease'
                                                            }}
                                                        >
                                                            Verificar <ChevronRight size={13} />
                                                        </a>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* VISTA 2: VENTAS POR PRODUCTO */}

{/* VISTA 2: VENTAS POR PRODUCTO (CONSOLIDADO) */}
                    {activeView === 'products' && (
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: `0 0 ${THEME.radius.lg} ${THEME.radius.lg}`,
                            border: `1px solid ${THEME.colors.border}`,
                            borderTop: 'none',
                            overflow: 'visible'
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: '137px', zIndex: 35 }}>
                                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                                        <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>No.</th>
                                        
                                        <th 
                                            onClick={() => handleProductSort('name')}
                                            title="Ordenar por Nombre de Producto"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Producto</span>
                                                {productSortColumn === 'name' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('category')}
                                            title="Ordenar por Categoría"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <span>Categoría</span>
                                                {productSortColumn === 'category' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('quantity')}
                                            title="Ordenar por Cantidad Total Demandada"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Cantidad Total</span>
                                                {productSortColumn === 'quantity' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('orders')}
                                            title="Ordenar por Cantidad de Pedidos"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'center', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                <span>Pedidos</span>
                                                {productSortColumn === 'orders' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('avg_price')}
                                            title="Ordenar por Precio Promedio Facturado"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Precio Prom.</span>
                                                {productSortColumn === 'avg_price' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('cost')}
                                            title="Ordenar por Costo Base Matriz"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Costo Base</span>
                                                {productSortColumn === 'cost' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('sales')}
                                            title="Ordenar por Total Venta ($)"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Total Venta</span>
                                                {productSortColumn === 'sales' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('profit')}
                                            title="Ordenar por Utilidad Bruta ($)"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Utilidad</span>
                                                {productSortColumn === 'profit' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th 
                                            onClick={() => handleProductSort('margin')}
                                            title="Ordenar por Margen Ponderado (%)"
                                            style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                                <span>Margen (%)</span>
                                                {productSortColumn === 'margin' ? (
                                                    productSortDirection === 'asc' ? <ChevronUp size={13} color={THEME.colors.primary} /> : <ChevronDown size={13} color={THEME.colors.primary} />
                                                ) : (
                                                    <ChevronsUpDown size={11} color="#94A3B8" />
                                                )}
                                            </div>
                                        </th>

                                        <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'center', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Drill-Down</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProducts.length === 0 ? (
                                        <tr>
                                            <td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                No se encontraron productos para los criterios de búsqueda.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedFilteredProducts.map((p, idx) => (
                                            <tr key={p.productId} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                                    {idx + 1}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem' }}>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain }}>{p.productName}</div>
                                                    <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                        {p.accountingId ? `Cód: ${p.accountingId}` : `SKU: ${p.sku}`}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary }}>
                                                    <span style={{ backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '5px', fontSize: '0.76rem', fontWeight: '600', color: '#334155' }}>
                                                        {CATEGORY_MAP[p.category] || p.category}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#0369A1' }}>
                                                    {formatNumber(p.totalQuantity, 1)} {p.unit}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                                    {p.ordersCount}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '700', color: THEME.colors.textMain }}>
                                                    {formatMoney(p.avgSellingPrice)}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                    {formatMoney(p.avgUnitCost)}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain }}>
                                                    {formatMoney(p.totalSales)}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '700', color: p.grossProfit >= 0 ? '#0D7A57' : '#DC2626' }}>
                                                    {formatMoney(p.grossProfit)}
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: p.marginPct >= 20 ? '#0D7A57' : '#D97706' }}>
                                                    {p.marginPct.toFixed(1)}%
                                                </td>
                                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => {
                                                            setSelectedDrilldownProductId(p.productId);
                                                            setActiveView('product_drilldown');
                                                        }}
                                                        style={{
                                                            padding: '4px 10px',
                                                            backgroundColor: '#E0F2FE',
                                                            color: '#0369A1',
                                                            border: 'none',
                                                            borderRadius: '6px',
                                                            fontWeight: '800',
                                                            fontSize: '0.75rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        Ver quién pidió <ChevronRight size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* VISTA 3: PRODUCTO POR CLIENTE (DRILL-DOWN) */}
                    {activeView === 'product_drilldown' && (
                        <div>
                            {/* Selector Rápido del Producto a Inspeccionar */}
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                padding: '1rem',
                                borderLeft: `1px solid ${THEME.colors.border}`,
                                borderRight: `1px solid ${THEME.colors.border}`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                flexWrap: 'wrap'
                            }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                    Seleccionar Producto:
                                </label>
                                <select
                                    value={selectedDrilldownProductId}
                                    onChange={(e) => setSelectedDrilldownProductId(e.target.value)}
                                    style={{
                                        flex: 1,
                                        maxWidth: '450px',
                                        padding: '0.5rem 0.75rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1px solid ${THEME.colors.border}`,
                                        fontSize: '0.85rem',
                                        fontWeight: '700',
                                        color: THEME.colors.textMain,
                                        backgroundColor: 'white'
                                    }}
                                >
                                    {productConsolidated.map(p => (
                                        <option key={p.productId} value={p.productId}>
                                            {p.productName} ({formatNumber(p.totalQuantity, 1)} {p.unit} • {p.ordersCount} pedidos)
                                        </option>
                                    ))}
                                </select>

                                {selectedDrilldownProductId && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', color: THEME.colors.textSecondary }}>
                                        <span>Total Clientes: <strong style={{ color: THEME.colors.textMain }}>{drilldownData.length}</strong></span>
                                        <span>•</span>
                                        <span>Total Kilos: <strong style={{ color: '#0369A1' }}>{formatNumber(drilldownData.reduce((acc, r) => acc + r.quantity, 0), 1)} Kg</strong></span>
                                    </div>
                                )}
                            </div>

                            <div style={{
                                backgroundColor: 'white',
                                borderRadius: `0 0 ${THEME.radius.lg} ${THEME.radius.lg}`,
                                border: `1px solid ${THEME.colors.border}`,
                                borderTop: 'none',
                                overflow: 'visible'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem', textAlign: 'left' }}>
                                    <thead style={{ position: 'sticky', top: '137px', zIndex: 35 }}>
                                        <tr style={{ backgroundColor: '#F8FAFC' }}>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>No. Pedido</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cliente (Sucursal Receptora)</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Zona Logística</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Cantidad Pedida</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Precio Facturado</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Costo Base</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Total Facturado</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Utilidad</th>
                                            <th style={{ position: 'sticky', top: '137px', zIndex: 35, backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '0.70rem 0.85rem', textAlign: 'right', color: '#64748B', fontWeight: '700', fontSize: '0.75rem', textTransform: 'uppercase' }}>Margen (%)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {drilldownData.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                                    Ningún cliente solicitó este producto en la fecha seleccionada.
                                                </td>
                                            </tr>
                                        ) : (
                                            drilldownData.map((row, idx) => (
                                                <tr key={`${row.orderId}_${idx}`} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                        {row.orderSequenceId}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                        {row.clientName}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary }}>
                                                        <span style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                                            {row.zone}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: '#0369A1' }}>
                                                        {formatNumber(row.quantity, 1)} {row.unit}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain }}>
                                                        {formatMoney(row.unitPrice)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: THEME.colors.textSecondary }}>
                                                        {formatMoney(row.unitCost)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain }}>
                                                        {formatMoney(row.totalSales)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '700', color: row.profit >= 0 ? '#0D7A57' : '#DC2626' }}>
                                                        {formatMoney(row.profit)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: row.marginPct >= 20 ? '#0D7A57' : '#D97706' }}>
                                                        {row.marginPct.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* MODAL DE SELECCIÓN DE PERÍODO PARA EXPORTACIÓN EXCEL */}
            {isExportModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: THEME.radius.lg,
                        maxWidth: '520px',
                        width: '100%',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        border: `1px solid ${THEME.colors.border}`,
                        overflow: 'hidden'
                    }}>
                        {/* Cabecera del Modal */}
                        <div style={{
                            padding: '1.25rem 1.5rem',
                            borderBottom: `1px solid ${THEME.colors.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileSpreadsheet size={18} color="#0D7A57" />
                                    Exportar Relación de Pedidos (.xlsx)
                                </h3>
                                <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                    Selecciona el período de tiempo que deseas consolidar en el archivo Excel
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                disabled={isExporting}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    color: THEME.colors.textSecondary,
                                    padding: '4px',
                                    borderRadius: '6px'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Opciones de Período */}
                        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* 1. Día Activo */}
                            <label style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '1rem',
                                borderRadius: THEME.radius.md,
                                border: `2px solid ${exportScope === 'day' ? '#0D7A57' : '#E2E8F0'}`,
                                backgroundColor: exportScope === 'day' ? '#F0FDF4' : 'white',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}>
                                <input
                                    type="radio"
                                    name="exportScope"
                                    checked={exportScope === 'day'}
                                    onChange={() => setExportScope('day')}
                                    style={{ marginTop: '3px', accentColor: '#0D7A57' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '800', fontSize: '0.90rem', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>📅 Jornada Activa Seleccionada</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#DCFCE7', color: '#15803D', padding: '2px 8px', borderRadius: '6px' }}>
                                            {selectedDate}
                                        </span>
                                    </div>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: THEME.colors.textSecondary }}>
                                        Descarga los {filteredOrders.length} pedidos confirmados de la fecha activa en pantalla, incluyendo costos, márgenes e indicadores.
                                    </p>
                                </div>
                            </label>

                            {/* 2. Mes Completo */}
                            <label style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '1rem',
                                borderRadius: THEME.radius.md,
                                border: `2px solid ${exportScope === 'month' ? '#0D7A57' : '#E2E8F0'}`,
                                backgroundColor: exportScope === 'month' ? '#F0FDF4' : 'white',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}>
                                <input
                                    type="radio"
                                    name="exportScope"
                                    checked={exportScope === 'month'}
                                    onChange={() => setExportScope('month')}
                                    style={{ marginTop: '3px', accentColor: '#0D7A57' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '800', fontSize: '0.90rem', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>🗓️ Mes Completo ({monthOptions[selectedMonthOffset]?.label || 'Mes Activo'})</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', backgroundColor: '#E0F2FE', color: '#0369A1', padding: '2px 8px', borderRadius: '6px' }}>
                                            Acumulado Mensual
                                        </span>
                                    </div>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: THEME.colors.textSecondary }}>
                                        Consolida todos los despachos realizados durante todo el mes seleccionado, ordenados por fecha de entrega y consecutivo.
                                    </p>
                                </div>
                            </label>

                            {/* 3. Rango Personalizado */}
                            <label style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '1rem',
                                borderRadius: THEME.radius.md,
                                border: `2px solid ${exportScope === 'custom' ? '#0D7A57' : '#E2E8F0'}`,
                                backgroundColor: exportScope === 'custom' ? '#F0FDF4' : 'white',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}>
                                <input
                                    type="radio"
                                    name="exportScope"
                                    checked={exportScope === 'custom'}
                                    onChange={() => setExportScope('custom')}
                                    style={{ marginTop: '3px', accentColor: '#0D7A57' }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '800', fontSize: '0.90rem', color: THEME.colors.textMain }}>
                                        📆 Rango Personalizado de Fechas
                                    </div>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.76rem', color: THEME.colors.textSecondary }}>
                                        Define un intervalo libre de fechas para liquidaciones de quincena, semanas específicas o auditorías.
                                    </p>

                                    {exportScope === 'custom' && (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }} onClick={e => e.stopPropagation()}>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '3px' }}>
                                                    Fecha Inicial:
                                                </label>
                                                <input
                                                    type="date"
                                                    value={customStartDate}
                                                    onChange={e => setCustomStartDate(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.45rem 0.6rem',
                                                        borderRadius: THEME.radius.sm,
                                                        border: `1px solid ${THEME.colors.border}`,
                                                        fontSize: '0.82rem',
                                                        fontWeight: '600'
                                                    }}
                                                />
                                            </div>
                                            <div>
                                                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, display: 'block', marginBottom: '3px' }}>
                                                    Fecha Final:
                                                </label>
                                                <input
                                                    type="date"
                                                    value={customEndDate}
                                                    onChange={e => setCustomEndDate(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '0.45rem 0.6rem',
                                                        borderRadius: THEME.radius.sm,
                                                        border: `1px solid ${THEME.colors.border}`,
                                                        fontSize: '0.82rem',
                                                        fontWeight: '600'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </label>
                        </div>

                        {/* Pie del Modal con Acciones */}
                        <div style={{
                            padding: '1rem 1.5rem',
                            borderTop: `1px solid ${THEME.colors.border}`,
                            backgroundColor: '#F8FAFC',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setIsExportModalOpen(false)}
                                disabled={isExporting}
                                style={{
                                    padding: '0.55rem 1.1rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.border}`,
                                    backgroundColor: 'white',
                                    color: THEME.colors.textSecondary,
                                    fontWeight: '700',
                                    fontSize: '0.82rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={() => handleExportExcel(exportScope)}
                                disabled={isExporting}
                                style={{
                                    padding: '0.55rem 1.35rem',
                                    borderRadius: THEME.radius.md,
                                    border: 'none',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                                }}
                            >
                                <Download size={15} />
                                {isExporting ? 'Procesando archivo...' : 'Descargar Excel (.xlsx)'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
