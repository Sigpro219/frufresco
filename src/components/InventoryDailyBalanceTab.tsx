'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    FileSpreadsheet, 
    Calendar, 
    Search, 
    Filter, 
    RefreshCw, 
    Plus, 
    TrendingUp, 
    TrendingDown, 
    Scale, 
    Trash2, 
    AlertTriangle, 
    CheckCircle2, 
    Camera, 
    User, 
    ShoppingCart, 
    Layers, 
    ChevronRight, 
    ChevronDown,
    ChevronLeft,
    ChevronsLeft,
    ChevronsRight,
    FolderPlus,
    FolderMinus,
    ArrowUpDown, 
    ExternalLink,
    X,
    Eye,
    BarChart3,
    Apple,
    Carrot,
    Salad,
    Boxes,
    Package,
    Milk,
    Sprout,
    Beef,
    Wheat,
    FileText,
    ArrowDownToLine,
    Columns
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { WorkCell } from '@/types/workCells';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';

const renderCellLucideIcon = (cell?: WorkCell | null, size = 12) => {
    if (!cell) return <Layers size={size} />;
    const iconKey = (cell.icon || '').toLowerCase();
    const name = (cell.short_name || cell.name || '').toLowerCase();
    if (iconKey === 'sprout' || iconKey === '🥬' || name.includes('hortaliza')) return <Sprout size={size} />;
    if (iconKey === 'carrot' || iconKey === '🥦' || name.includes('verdura')) return <Carrot size={size} />;
    if (iconKey === 'apple' || iconKey === '🍎' || name.includes('fruta')) return <Apple size={size} />;
    if (iconKey === 'boxes' || iconKey === '🧀' || name.includes('abarrote') || name.includes('seco')) return <Boxes size={size} />;
    if (iconKey === 'layers' || iconKey === '🥔' || name.includes('tuberculo') || name.includes('papa') || name.includes('tomate')) return <Layers size={size} />;
    if (iconKey === 'milk' || iconKey === '🥛' || name.includes('lacteo') || name.includes('lácteo')) return <Milk size={size} />;
    if (iconKey === 'beef' || iconKey === '🥩' || name.includes('carne')) return <Beef size={size} />;
    if (iconKey === 'wheat' || iconKey === '🌾' || name.includes('grano')) return <Wheat size={size} />;
    return <Package size={size} />;
};
import { INVENTORY_MOVEMENT_SUBTYPES } from '@/lib/constants';
import InventoryWasteModal from '@/components/InventoryWasteModal';
import InventoryPayrollModal from '@/components/InventoryPayrollModal';
import InventoryAdditionalSalesModal from '@/components/InventoryAdditionalSalesModal';

interface ProductItem {
    id: string;
    name: string;
    sku?: string;
    accounting_id?: number | null;
    unit_of_measure: string;
    category?: string;
    inventory_group?: string | null;
    base_price?: number;
    parent_id?: string | null;
    is_active?: boolean;
    inventory_stocks?: {
        id?: string;
        warehouse_id?: string;
        quantity: number;
    }[];
}

interface RawMovement {
    id: string;
    product_id: string;
    warehouse_id?: string;
    quantity: number;
    type: string;
    reference_type?: string | null;
    reference_id?: string | null;
    notes?: string | null;
    evidence_url?: string | null;
    created_at: string;
}

export interface InventoryDailyRow {
    productId: string;
    sku?: string;
    parent_id?: string | null;
    is_active?: boolean;
    // A: Fecha Inventario
    colA_date: string;
    // B: idProducto (accounting_id)
    colB_idProducto: number | string;
    // C: Lista de Inventario (Célula / Grupo)
    colC_inventoryGroup: string;
    // D: Producto
    colD_productName: string;
    unit_of_measure: string;
    base_price: number;
    // E: Inventario inicial (+)
    colE_initialStock: number;
    // F: Corrección de inventario (+/-)
    colF_corrections: number;
    // G: Compra del día (+)
    colG_purchases: number;
    // H: Venta del día KG (-)
    colH_salesKg: number;
    // I: Venta del día UN (Informativo)
    colI_salesUnits: number;
    // J: Peso Venta UN (-)
    colJ_weightSalesUnits: number;
    // K: Producto escaso (-)
    colK_shortage: number;
    // L: Producto sin enviar (+)
    colL_unshipped: number;
    // M: Venta adicional cliente (-)
    colM_additionalSales: number;
    // N: Venta adicional empleado (-)
    colN_employeeSales: number;
    // O: Devoluciones (+)
    colO_returns: number;
    // P: Pesada (-)
    colP_weighingWaste: number;
    // Q: Desperdicio (-)
    colQ_damageWaste: number;
    evidencePhotosQ: string[];
    // R: Basura (-)
    colR_cleaningWaste: number;
    evidencePhotosR: string[];
    // S: Inventario calculado
    // S = E + F + G - H - J - K + L - M - N + O - P - Q - R
    colS_calculated: number;
    // T: Inventario agregado bodega (conteo a ciegas)
    colT_physicalCount: number | null;
    hasPhysicalCount: boolean;
    // U: Inventario bodega post-10 AM (U = T + O)
    colU_bodegaPost10am: number | null;
    // V: Faltantes (min(0, T - S))
    colV_missing: number;
    // W: Sobrantes (max(0, T - S))
    colW_surplus: number;
    // X: Banco de alimentos (Informativo / donación)
    colX_foodBank: number;
    evidencePhotosX: string[];
}

export interface DailyFamily {
    id: string;
    parent: InventoryDailyRow;
    isParent: boolean;
    children: InventoryDailyRow[];
    consolidated: InventoryDailyRow;
}

interface InventoryDailyBalanceTabProps {
    workCells: WorkCell[];
}

export default function InventoryDailyBalanceTab({ workCells }: InventoryDailyBalanceTabProps) {
    const todayStr = new Date().toISOString().split('T')[0];
    const [balanceDate, setBalanceDate] = useState<string>(todayStr);
    const [selectedCell, setSelectedCell] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);

    const [products, setProducts] = useState<ProductItem[]>([]);
    const [movements, setMovements] = useState<RawMovement[]>([]);

    // Modales de apoyo
    const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
    const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
    const [isAdditionalSalesModalOpen, setIsAdditionalSalesModalOpen] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    // Medición reactiva de la Toolbar Dock para sincronización con cabecera de tabla
    const dockRef = useRef<HTMLDivElement>(null);
    const [dockHeight, setDockHeight] = useState(48);

    useEffect(() => {
        if (!dockRef.current) return;
        const updateHeight = () => {
            if (dockRef.current) {
                setDockHeight(dockRef.current.offsetHeight);
            }
        };
        updateHeight();
        const observer = new ResizeObserver(updateHeight);
        observer.observe(dockRef.current);
        window.addEventListener('resize', updateHeight);
        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateHeight);
        };
    }, []);

    // Control de ancho compacto en columnas de identificación A-D (ahorra 235px en X)
    const [isCompactIdentification, setIsCompactIdentification] = useState(true);

    // Offsets dinámicos para salto horizontal exacto según el modo de visualización
    const blockOffsets = useMemo(() => ({
        identificacion: 0,
        entradas: isCompactIdentification ? 240 : 475,
        ventas: isCompactIdentification ? 495 : 730,
        excepciones: isCompactIdentification ? 785 : 1020,
        mermas: isCompactIdentification ? 1165 : 1400,
        cierre: isCompactIdentification ? 1545 : 1780,
        conciliacion: isCompactIdentification ? 1915 : 2150,
    }), [isCompactIdentification]);

    // Referencia al contenedor de la sábana de 24 columnas y helpers de navegación
    const tableScrollRef = useRef<HTMLDivElement>(null);

    const scrollToColumnGroup = (targetX: number) => {
        if (tableScrollRef.current) {
            tableScrollRef.current.scrollTo({ left: targetX, behavior: 'smooth' });
        }
    };

    const scrollStepHorizontal = (direction: 'left' | 'right') => {
        if (tableScrollRef.current) {
            const step = 380;
            tableScrollRef.current.scrollBy({ left: direction === 'left' ? -step : step, behavior: 'smooth' });
        }
    };

    // Carga de datos
    const loadDailyData = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);

        try {
            // 1. Cargar productos maestros con stock actual (ESTRICTAMENTE ACTIVOS)
            let allActiveProducts: ProductItem[] = [];
            let from = 0;
            const limit = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: batch, error: prodErr } = await supabase
                    .from('products')
                    .select(`
                        id, name, sku, accounting_id, unit_of_measure, category, inventory_group, base_price, parent_id, is_active,
                        inventory_stocks (id, warehouse_id, quantity)
                    `)
                    .eq('is_active', true)
                    .order('accounting_id', { ascending: true })
                    .range(from, from + limit - 1);

                if (prodErr) throw prodErr;

                if (batch && batch.length > 0) {
                    allActiveProducts = [...allActiveProducts, ...(batch as any)];
                    from += limit;
                    if (batch.length < limit) hasMore = false;
                } else {
                    hasMore = false;
                }
            }
            setProducts(allActiveProducts);

            // 2. Cargar movimientos desde el inicio del día seleccionado hasta el presente (para cálculo retroactivo)
            const startOfDayIso = `${balanceDate}T00:00:00.000Z`;
            const endOfDayIso = `${balanceDate}T23:59:59.999Z`;

            const { data: movData, error: movErr } = await supabase
                .from('inventory_movements')
                .select(`
                    id, product_id, warehouse_id, quantity, type, reference_type, reference_id, notes, evidence_url, created_at
                `)
                .gte('created_at', startOfDayIso)
                .order('created_at', { ascending: false });

            if (movErr) throw movErr;
            setMovements((movData as any) || []);
        } catch (err: any) {
            console.error('Error cargando balance diario de inventario:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [balanceDate]);

    useEffect(() => {
        loadDailyData();
    }, [loadDailyData]);

    // Mapeo Células de Trabajo
    const cellByGroup = useMemo(() => {
        const map = new Map<string, WorkCell>();
        workCells.forEach(c => {
            if (c.inventory_group) {
                map.set(c.inventory_group.trim().toUpperCase(), c);
            }
        });
        return map;
    }, [workCells]);

    // Procesar las 24 columnas para cada producto
    const dailyRows: InventoryDailyRow[] = useMemo(() => {
        const startOfDayIso = `${balanceDate}T00:00:00.000Z`;
        const endOfDayIso = `${balanceDate}T23:59:59.999Z`;

        // Agrupar movimientos por producto que ocurrieron en el día específico
        const dayMovementsByProduct = new Map<string, RawMovement[]>();
        // Agrupar movimientos ocurridos DESPUÉS del final del día (para retroactividad en fechas pasadas)
        const laterMovementsByProduct = new Map<string, RawMovement[]>();

        movements.forEach(m => {
            if (m.created_at >= startOfDayIso && m.created_at <= endOfDayIso) {
                const list = dayMovementsByProduct.get(m.product_id) || [];
                list.push(m);
                dayMovementsByProduct.set(m.product_id, list);
            } else if (m.created_at > endOfDayIso) {
                const list = laterMovementsByProduct.get(m.product_id) || [];
                list.push(m);
                laterMovementsByProduct.set(m.product_id, list);
            }
        });

        return products.map(p => {
            const currentStock = p.inventory_stocks?.reduce((acc, s) => acc + (Number(s.quantity) || 0), 0) ?? 0;
            const dayMovs = dayMovementsByProduct.get(p.id) || [];
            const laterMovs = laterMovementsByProduct.get(p.id) || [];

            // Suma de movimientos del día
            let f_corrections = 0;
            let g_purchases = 0;
            let h_salesKg = 0;
            let i_salesUnits = 0;
            let j_weightSalesUnits = 0;
            let k_shortage = 0;
            let l_unshipped = 0;
            let m_additionalSales = 0;
            let n_employeeSales = 0;
            let o_returns = 0;
            let p_weighingWaste = 0;
            let q_damageWaste = 0;
            let r_cleaningWaste = 0;
            let x_foodBank = 0;

            let physicalCount: number | null = null;
            let hasPhysical = false;

            const evidenceQ: string[] = [];
            const evidenceR: string[] = [];
            const evidenceX: string[] = [];

            const isUnit = ['un', 'und', 'unidad', 'bandeja', 'atado', 'paquete'].includes((p.unit_of_measure || '').toLowerCase());

            dayMovs.forEach(m => {
                const rawQty = Math.abs(Number(m.quantity) || 0);
                const signedQty = Number(m.quantity) || 0;
                const ref = (m.reference_type || '').toLowerCase();

                // F: Corrección de inventario
                if (ref === INVENTORY_MOVEMENT_SUBTYPES.CORRECTION || (m.type === 'adjustment' && ref !== INVENTORY_MOVEMENT_SUBTYPES.BLIND_COUNT)) {
                    f_corrections += signedQty;
                }
                // G: Compra del día (+)
                else if (m.type === 'entry' && (ref === 'purchase_reception' || ref === 'purchase' || ref === 'entry')) {
                    g_purchases += rawQty;
                }
                // H: Venta del día KG (-) & I/J: Venta UN
                else if (m.type === 'exit' && (ref === 'order_item' || ref === 'sale' || ref === 'dispatch')) {
                    if (isUnit) {
                        i_salesUnits += rawQty;
                        // Si hay nota con peso real o báscula
                        const weightMatch = (m.notes || '').match(/peso:\s*([0-9.,]+)/i);
                        if (weightMatch) {
                            j_weightSalesUnits += parseFloat(weightMatch[1].replace(',', '.'));
                        } else {
                            // Si no se reportó báscula separada, asumir peso proporcional o el mismo rawQty
                            j_weightSalesUnits += rawQty;
                        }
                    } else {
                        h_salesKg += rawQty;
                    }
                }
                // K: Producto escaso (-)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.ORDER_SHORTAGE || ref === 'shortage') {
                    k_shortage += rawQty;
                }
                // L: Producto sin enviar (+)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.ORDER_UNSHIPPED || ref === 'unshipped') {
                    l_unshipped += rawQty;
                }
                // M: Venta adicional cliente (-)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.ADDITIONAL_SALE) {
                    m_additionalSales += rawQty;
                }
                // N: Venta adicional empleado (-)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE) {
                    n_employeeSales += rawQty;
                }
                // O: Devoluciones (+)
                else if (ref === 'route_return' || ref === 'return' || ref === 'devolucion') {
                    o_returns += rawQty;
                }
                // P: Pesada (-)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.WASTE_WEIGHING) {
                    p_weighingWaste += rawQty;
                }
                // Q: Desperdicio (-)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE) {
                    q_damageWaste += rawQty;
                    if (m.evidence_url) evidenceQ.push(m.evidence_url);
                }
                // R: Basura / Descapote (-)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING) {
                    r_cleaningWaste += rawQty;
                    if (m.evidence_url) evidenceR.push(m.evidence_url);
                }
                // X: Banco de Alimentos
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.FOOD_BANK) {
                    x_foodBank += rawQty;
                    if (m.evidence_url) evidenceX.push(m.evidence_url);
                }
                // T: Conteo Agregado Bodega (Cruce a ciegas)
                else if (ref === INVENTORY_MOVEMENT_SUBTYPES.BLIND_COUNT || (m.notes && m.notes.includes('Cruce a ciegas'))) {
                    hasPhysical = true;
                    // El conteo físico queda registrado en la nota o calculado
                    const match = (m.notes || '').match(/Contado:\s*([0-9.,]+)/i);
                    if (match) {
                        physicalCount = parseFloat(match[1].replace(',', '.'));
                    } else {
                        // Stock al que quedó ajustado
                        physicalCount = currentStock;
                    }
                }
            });

            // Reconstrucción matemática del Inventario Inicial (Col E):
            // Stock Inicial = Stock Actual - sum(movimientos desde el inicio del balanceDate hasta hoy)
            const sumDeltasSinceStart = dayMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0) +
                                       laterMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
            const initialStock = Math.max(0, currentStock - sumDeltasSinceStart);

            // S: Inventario Calculado
            // S = E + F + G - H - J - K + L - M - N + O - P - Q - R
            const calculatedStock = initialStock + f_corrections + g_purchases - h_salesKg - j_weightSalesUnits - k_shortage + l_unshipped - m_additionalSales - n_employeeSales + o_returns - p_weighingWaste - q_damageWaste - r_cleaningWaste;

            // U: Inventario Bodega post-10 AM = T + O
            const bodegaPost10 = physicalCount !== null ? physicalCount + o_returns : null;

            // V & W: Faltantes y Sobrantes
            let missing = 0;
            let surplus = 0;
            if (physicalCount !== null) {
                const diff = physicalCount - calculatedStock;
                if (diff < -0.001) missing = diff;
                else if (diff > 0.001) surplus = diff;
            }

            return {
                productId: p.id,
                sku: p.sku || '',
                parent_id: p.parent_id,
                is_active: p.is_active !== false,
                colA_date: balanceDate,
                colB_idProducto: p.accounting_id || p.sku || 'S/N',
                colC_inventoryGroup: p.inventory_group || 'GENERAL',
                colD_productName: p.name,
                unit_of_measure: p.unit_of_measure || 'KG',
                base_price: p.base_price || 0,
                colE_initialStock: initialStock,
                colF_corrections: f_corrections,
                colG_purchases: g_purchases,
                colH_salesKg: h_salesKg,
                colI_salesUnits: i_salesUnits,
                colJ_weightSalesUnits: j_weightSalesUnits,
                colK_shortage: k_shortage,
                colL_unshipped: l_unshipped,
                colM_additionalSales: m_additionalSales,
                colN_employeeSales: n_employeeSales,
                colO_returns: o_returns,
                colP_weighingWaste: p_weighingWaste,
                colQ_damageWaste: q_damageWaste,
                evidencePhotosQ: evidenceQ,
                colR_cleaningWaste: r_cleaningWaste,
                evidencePhotosR: evidenceR,
                colS_calculated: calculatedStock,
                colT_physicalCount: physicalCount,
                hasPhysicalCount: hasPhysical,
                colU_bodegaPost10am: bodegaPost10,
                colV_missing: missing,
                colW_surplus: surplus,
                colX_foodBank: x_foodBank,
                evidencePhotosX: evidenceX
            };
        });
    }, [balanceDate, products, movements]);

    // Agrupamiento Jerárquico Padre - Hijo (Familias de Inventario tipo Kardex)
    const dailyFamilies: DailyFamily[] = useMemo(() => {
        // 1. Identificar hijos activos y mapear por parent_id
        const childrenByParent = new Map<string, InventoryDailyRow[]>();
        const childProductIds = new Set<string>();

        dailyRows.forEach(row => {
            if (row.parent_id && row.parent_id !== row.productId) {
                childProductIds.add(row.productId);
                const list = childrenByParent.get(row.parent_id) || [];
                list.push(row);
                childrenByParent.set(row.parent_id, list);
            }
        });

        // 2. Construir familias a partir de productos padres o independientes
        const families: DailyFamily[] = [];
        const processedIds = new Set<string>();

        dailyRows.forEach(row => {
            if (childProductIds.has(row.productId)) {
                // Si el padre existe en dailyRows, este hijo se anidará bajo él
                const parentExists = dailyRows.some(r => r.productId === row.parent_id);
                if (parentExists) return;
            }

            if (processedIds.has(row.productId)) return;
            processedIds.add(row.productId);

            const hasChildren = childrenByParent.has(row.productId);
            const children = (childrenByParent.get(row.productId) || []).sort(
                (a, b) => (Number(a.colB_idProducto) || 0) - (Number(b.colB_idProducto) || 0)
            );

            // Calcular consolidado de la familia para las 24 columnas
            const consolidated: InventoryDailyRow = hasChildren ? {
                ...row,
                colD_productName: row.colD_productName,
                colE_initialStock: row.colE_initialStock + children.reduce((s, c) => s + c.colE_initialStock, 0),
                colF_corrections: row.colF_corrections + children.reduce((s, c) => s + c.colF_corrections, 0),
                colG_purchases: row.colG_purchases + children.reduce((s, c) => s + c.colG_purchases, 0),
                colH_salesKg: row.colH_salesKg + children.reduce((s, c) => s + c.colH_salesKg, 0),
                colI_salesUnits: row.colI_salesUnits + children.reduce((s, c) => s + c.colI_salesUnits, 0),
                colJ_weightSalesUnits: row.colJ_weightSalesUnits + children.reduce((s, c) => s + c.colJ_weightSalesUnits, 0),
                colK_shortage: row.colK_shortage + children.reduce((s, c) => s + c.colK_shortage, 0),
                colL_unshipped: row.colL_unshipped + children.reduce((s, c) => s + c.colL_unshipped, 0),
                colM_additionalSales: row.colM_additionalSales + children.reduce((s, c) => s + c.colM_additionalSales, 0),
                colN_employeeSales: row.colN_employeeSales + children.reduce((s, c) => s + c.colN_employeeSales, 0),
                colO_returns: row.colO_returns + children.reduce((s, c) => s + c.colO_returns, 0),
                colP_weighingWaste: row.colP_weighingWaste + children.reduce((s, c) => s + c.colP_weighingWaste, 0),
                colQ_damageWaste: row.colQ_damageWaste + children.reduce((s, c) => s + c.colQ_damageWaste, 0),
                colR_cleaningWaste: row.colR_cleaningWaste + children.reduce((s, c) => s + c.colR_cleaningWaste, 0),
                colS_calculated: row.colS_calculated + children.reduce((s, c) => s + c.colS_calculated, 0),
                colT_physicalCount: (row.hasPhysicalCount || children.some(c => c.hasPhysicalCount)) 
                    ? ((row.colT_physicalCount || 0) + children.reduce((s, c) => s + (c.colT_physicalCount || 0), 0))
                    : null,
                hasPhysicalCount: row.hasPhysicalCount || children.some(c => c.hasPhysicalCount),
                colU_bodegaPost10am: (row.hasPhysicalCount || children.some(c => c.hasPhysicalCount))
                    ? (((row.colT_physicalCount || 0) + children.reduce((s, c) => s + (c.colT_physicalCount || 0), 0)) + (row.colO_returns + children.reduce((s, c) => s + c.colO_returns, 0)))
                    : null,
                colV_missing: Math.min(0, ((row.hasPhysicalCount || children.some(c => c.hasPhysicalCount))
                    ? ((row.colT_physicalCount || 0) + children.reduce((s, c) => s + (c.colT_physicalCount || 0), 0)) - (row.colS_calculated + children.reduce((s, c) => s + c.colS_calculated, 0))
                    : 0)),
                colW_surplus: Math.max(0, ((row.hasPhysicalCount || children.some(c => c.hasPhysicalCount))
                    ? ((row.colT_physicalCount || 0) + children.reduce((s, c) => s + (c.colT_physicalCount || 0), 0)) - (row.colS_calculated + children.reduce((s, c) => s + c.colS_calculated, 0))
                    : 0)),
                colX_foodBank: row.colX_foodBank + children.reduce((s, c) => s + c.colX_foodBank, 0),
                evidencePhotosQ: [...row.evidencePhotosQ, ...children.flatMap(c => c.evidencePhotosQ)],
                evidencePhotosR: [...row.evidencePhotosR, ...children.flatMap(c => c.evidencePhotosR)],
                evidencePhotosX: [...row.evidencePhotosX, ...children.flatMap(c => c.evidencePhotosX)]
            } : row;

            families.push({
                id: row.productId,
                parent: row,
                isParent: hasChildren,
                children,
                consolidated
            });
        });

        return families;
    }, [dailyRows]);

    // Filtrado interactivo sobre las familias
    const filteredFamilies = useMemo(() => {
        return dailyFamilies.filter(family => {
            // Filtro por Célula / Grupo
            if (selectedCell !== 'ALL') {
                const groupUpper = (family.parent.colC_inventoryGroup || '').toUpperCase();
                const cellUpper = selectedCell.toUpperCase();
                const parentMatches = groupUpper.includes(cellUpper) || cellUpper.includes(groupUpper);
                const childMatches = family.children.some(c => {
                    const g = (c.colC_inventoryGroup || '').toUpperCase();
                    return g.includes(cellUpper) || cellUpper.includes(g);
                });
                if (!parentMatches && !childMatches) return false;
            }

            // Filtro por búsqueda
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchParentName = family.parent.colD_productName.toLowerCase().includes(q);
                const matchParentId = family.parent.colB_idProducto.toString().toLowerCase().includes(q);
                const matchParentGroup = family.parent.colC_inventoryGroup.toLowerCase().includes(q);
                const matchParentSku = (family.parent.sku || '').toLowerCase().includes(q);

                const matchChildren = family.children.some(c =>
                    c.colD_productName.toLowerCase().includes(q) ||
                    c.colB_idProducto.toString().toLowerCase().includes(q) ||
                    (c.sku || '').toLowerCase().includes(q)
                );

                if (!matchParentName && !matchParentId && !matchParentGroup && !matchParentSku && !matchChildren) {
                    return false;
                }
            }

            return true;
        });
    }, [dailyFamilies, selectedCell, searchQuery]);

    // Total de SKUs activos representados (padres + hijos)
    const totalActiveSkusCount = useMemo(() => {
        return filteredFamilies.reduce((acc, f) => acc + 1 + f.children.length, 0);
    }, [filteredFamilies]);

    // Paginación
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState<number | 'ALL'>(50);

    const totalPages = useMemo(() => {
        if (pageSize === 'ALL') return 1;
        return Math.max(1, Math.ceil(filteredFamilies.length / pageSize));
    }, [filteredFamilies.length, pageSize]);

    const paginatedFamilies = useMemo(() => {
        if (pageSize === 'ALL') return filteredFamilies;
        const startIndex = (currentPage - 1) * pageSize;
        return filteredFamilies.slice(startIndex, startIndex + pageSize);
    }, [filteredFamilies, currentPage, pageSize]);

    // Estado colapsado de familias (por defecto colapsadas para vista ejecutiva compacta)
    const [collapsedFamilies, setCollapsedFamilies] = useState<Record<string, boolean>>({});

    const toggleFamily = useCallback((familyId: string) => {
        setCollapsedFamilies(prev => {
            const isCurrentlyCollapsed = prev[familyId] !== false; // default true
            return {
                ...prev,
                [familyId]: !isCurrentlyCollapsed
            };
        });
    }, []);

    // Determinar si todas las familias con hijos en el filtro están colapsadas
    const allCollapsed = useMemo(() => {
        const parents = filteredFamilies.filter(f => f.isParent);
        if (parents.length === 0) return true;
        return parents.every(f => collapsedFamilies[f.id] !== false);
    }, [filteredFamilies, collapsedFamilies]);

    const toggleAllFamilies = useCallback(() => {
        setCollapsedFamilies(prev => {
            const newTarget = !allCollapsed;
            const updated: Record<string, boolean> = { ...prev };
            filteredFamilies.forEach(f => {
                if (f.isParent) {
                    updated[f.id] = newTarget;
                }
            });
            return updated;
        });
    }, [allCollapsed, filteredFamilies]);

    // KPIs Lean Agregados sobre todas las familias filtradas
    const kpis = useMemo(() => {
        let totalEntradas = 0;
        let totalSalidas = 0;
        let totalWasteKg = 0;
        let totalDamageKg = 0;
        let totalCleaningKg = 0;
        let totalMissingKg = 0;
        let totalMissingVal = 0;
        let totalSurplusKg = 0;
        let totalSurplusVal = 0;
        let totalFoodBankKg = 0;
        let totalEmployeeSalesKg = 0;
        let totalEmployeeSalesVal = 0;

        filteredFamilies.forEach(f => {
            const r = f.isParent ? f.consolidated : f.parent;
            const entradas = r.colE_initialStock + (r.colF_corrections > 0 ? r.colF_corrections : 0) + r.colG_purchases + r.colL_unshipped + r.colO_returns;
            const salidas = r.colH_salesKg + r.colJ_weightSalesUnits + r.colK_shortage + r.colM_additionalSales + r.colN_employeeSales + r.colP_weighingWaste + r.colQ_damageWaste + r.colR_cleaningWaste;

            totalEntradas += entradas;
            totalSalidas += salidas;
            totalWasteKg += (r.colP_weighingWaste + r.colQ_damageWaste + r.colR_cleaningWaste);
            totalDamageKg += r.colQ_damageWaste;
            totalCleaningKg += r.colR_cleaningWaste;
            totalFoodBankKg += r.colX_foodBank;
            totalEmployeeSalesKg += r.colN_employeeSales;
            totalEmployeeSalesVal += (r.colN_employeeSales * r.base_price);

            if (r.colV_missing < 0) {
                totalMissingKg += Math.abs(r.colV_missing);
                totalMissingVal += (Math.abs(r.colV_missing) * r.base_price);
            }
            if (r.colW_surplus > 0) {
                totalSurplusKg += r.colW_surplus;
                totalSurplusVal += (r.colW_surplus * r.base_price);
            }
        });

        const wastePercent = totalEntradas > 0 ? (totalWasteKg / totalEntradas) * 100 : 0;

        return {
            totalEntradas,
            totalSalidas,
            totalWasteKg,
            totalDamageKg,
            totalCleaningKg,
            wastePercent,
            totalMissingKg,
            totalMissingVal,
            totalSurplusKg,
            totalSurplusVal,
            totalFoodBankKg,
            totalEmployeeSalesKg,
            totalEmployeeSalesVal
        };
    }, [filteredFamilies]);

    // Exportador XLSX exacto de las 24 columnas con formato oficial del cliente y jerarquía
    const handleExportOfficialExcel = () => {
        try {
            const rowsForExcel: any[] = [];

            filteredFamilies.forEach(f => {
                const p = f.parent;
                // Fila principal / consolidada
                rowsForExcel.push({
                    'Fecha inventario': p.colA_date,
                    'idProducto': p.colB_idProducto,
                    'Lista de Inventario': p.colC_inventoryGroup,
                    'Tipo Registro': f.isParent ? 'Familia' : 'Estándar',
                    'Producto': f.isParent ? `${p.colD_productName} (Consolidado)` : p.colD_productName,
                    'Inventario inicial': Number((f.isParent ? f.consolidated.colE_initialStock : p.colE_initialStock).toFixed(2)),
                    'Corrección de inventario': Number((f.isParent ? f.consolidated.colF_corrections : p.colF_corrections).toFixed(2)),
                    'Compra del día': Number((f.isParent ? f.consolidated.colG_purchases : p.colG_purchases).toFixed(2)),
                    'Venta del día (KG)': Number((f.isParent ? f.consolidated.colH_salesKg : p.colH_salesKg).toFixed(2)),
                    'Venta del día (UN)': (f.isParent ? f.consolidated.colI_salesUnits : p.colI_salesUnits) > 0 ? Number((f.isParent ? f.consolidated.colI_salesUnits : p.colI_salesUnits).toFixed(0)) : '',
                    'Peso Venta UN': Number((f.isParent ? f.consolidated.colJ_weightSalesUnits : p.colJ_weightSalesUnits).toFixed(2)),
                    'Producto escaso': Number((f.isParent ? f.consolidated.colK_shortage : p.colK_shortage).toFixed(2)),
                    'Producto sin enviar': Number((f.isParent ? f.consolidated.colL_unshipped : p.colL_unshipped).toFixed(2)),
                    'Venta adicional cliente': Number((f.isParent ? f.consolidated.colM_additionalSales : p.colM_additionalSales).toFixed(2)),
                    'Venta adicional empleado': Number((f.isParent ? f.consolidated.colN_employeeSales : p.colN_employeeSales).toFixed(2)),
                    'Devoluciones': Number((f.isParent ? f.consolidated.colO_returns : p.colO_returns).toFixed(2)),
                    'Pesada': Number((f.isParent ? f.consolidated.colP_weighingWaste : p.colP_weighingWaste).toFixed(2)),
                    'Desperdicio': Number((f.isParent ? f.consolidated.colQ_damageWaste : p.colQ_damageWaste).toFixed(2)),
                    'Basura': Number((f.isParent ? f.consolidated.colR_cleaningWaste : p.colR_cleaningWaste).toFixed(2)),
                    'Inventario calculado': Number((f.isParent ? f.consolidated.colS_calculated : p.colS_calculated).toFixed(2)),
                    'Inventario agregado bodega': (f.isParent ? f.consolidated.colT_physicalCount : p.colT_physicalCount) !== null ? Number((f.isParent ? f.consolidated.colT_physicalCount! : p.colT_physicalCount!).toFixed(2)) : '',
                    'Inventario bodega': (f.isParent ? f.consolidated.colU_bodegaPost10am : p.colU_bodegaPost10am) !== null ? Number((f.isParent ? f.consolidated.colU_bodegaPost10am! : p.colU_bodegaPost10am!).toFixed(2)) : '',
                    'Faltantes': (f.isParent ? f.consolidated.colV_missing : p.colV_missing) < 0 ? Number((f.isParent ? f.consolidated.colV_missing : p.colV_missing).toFixed(2)) : '',
                    'Sobrantes': (f.isParent ? f.consolidated.colW_surplus : p.colW_surplus) > 0 ? Number((f.isParent ? f.consolidated.colW_surplus : p.colW_surplus).toFixed(2)) : '',
                    'Banco de alimentos': Number((f.isParent ? f.consolidated.colX_foodBank : p.colX_foodBank).toFixed(2))
                });

                // Si tiene presentaciones hijas, exportar cada una anidada
                if (f.isParent) {
                    f.children.forEach(ch => {
                        rowsForExcel.push({
                            'Fecha inventario': ch.colA_date,
                            'idProducto': ch.colB_idProducto,
                            'Lista de Inventario': ch.colC_inventoryGroup,
                            'Tipo Registro': '↳ Presentación',
                            'Producto': `    ↳ ${ch.colD_productName}`,
                            'Inventario inicial': Number(ch.colE_initialStock.toFixed(2)),
                            'Corrección de inventario': Number(ch.colF_corrections.toFixed(2)),
                            'Compra del día': Number(ch.colG_purchases.toFixed(2)),
                            'Venta del día (KG)': Number(ch.colH_salesKg.toFixed(2)),
                            'Venta del día (UN)': ch.colI_salesUnits > 0 ? Number(ch.colI_salesUnits.toFixed(0)) : '',
                            'Peso Venta UN': Number(ch.colJ_weightSalesUnits.toFixed(2)),
                            'Producto escaso': Number(ch.colK_shortage.toFixed(2)),
                            'Producto sin enviar': Number(ch.colL_unshipped.toFixed(2)),
                            'Venta adicional cliente': Number(ch.colM_additionalSales.toFixed(2)),
                            'Venta adicional empleado': Number(ch.colN_employeeSales.toFixed(2)),
                            'Devoluciones': Number(ch.colO_returns.toFixed(2)),
                            'Pesada': Number(ch.colP_weighingWaste.toFixed(2)),
                            'Desperdicio': Number(ch.colQ_damageWaste.toFixed(2)),
                            'Basura': Number(ch.colR_cleaningWaste.toFixed(2)),
                            'Inventario calculado': Number(ch.colS_calculated.toFixed(2)),
                            'Inventario agregado bodega': ch.colT_physicalCount !== null ? Number(ch.colT_physicalCount.toFixed(2)) : '',
                            'Inventario bodega': ch.colU_bodegaPost10am !== null ? Number(ch.colU_bodegaPost10am.toFixed(2)) : '',
                            'Faltantes': ch.colV_missing < 0 ? Number(ch.colV_missing.toFixed(2)) : '',
                            'Sobrantes': ch.colW_surplus > 0 ? Number(ch.colW_surplus.toFixed(2)) : '',
                            'Banco de alimentos': Number(ch.colX_foodBank.toFixed(2))
                        });
                    });
                }
            });

            const ws = XLSX.utils.json_to_sheet(rowsForExcel);

            // Anchos de columna optimizados para las 24 columnas (A a X)
            ws['!cols'] = [
                { wch: 14 }, // A Fecha
                { wch: 12 }, // B idProducto
                { wch: 28 }, // C Lista de Inventario
                { wch: 32 }, // D Producto
                { wch: 16 }, // E Inicial
                { wch: 18 }, // F Corrección
                { wch: 15 }, // G Compras
                { wch: 16 }, // H Venta KG
                { wch: 16 }, // I Venta UN
                { wch: 15 }, // J Peso UN
                { wch: 15 }, // K Escaso
                { wch: 17 }, // L Sin Enviar
                { wch: 18 }, // M Venta Adic Cliente
                { wch: 18 }, // N Venta Adic Empleado
                { wch: 14 }, // O Devoluciones
                { wch: 12 }, // P Pesada
                { wch: 14 }, // Q Desperdicio
                { wch: 12 }, // R Basura
                { wch: 18 }, // S Calculado
                { wch: 20 }, // T Agregado Bodega
                { wch: 16 }, // U Bodega Post-10
                { wch: 14 }, // V Faltantes
                { wch: 14 }, // W Sobrantes
                { wch: 16 }  // X Banco Alimentos
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Balance_Diario_24Col');
            XLSX.writeFile(wb, `Balance_Diario_FruFresco_24Col_${balanceDate}.xlsx`);
        } catch (err: any) {
            console.error('Error exportando Excel 24 columnas:', err);
            alert('Error al exportar reporte: ' + err.message);
        }
    };

    const numFormat = (n: number | null | undefined, decimals = 2) => {
        if (n === null || n === undefined || isNaN(n) || n === 0) return '-';
        return n.toFixed(decimals);
    };

    const renderNumericCell = (n: number | null | undefined, decimals = 2, prefix = '') => {
        if (n === null || n === undefined || isNaN(n) || n === 0) {
            return <span style={{ color: '#CBD5E1', fontWeight: '400' }}>-</span>;
        }
        return (
            <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace, sans-serif' }}>
                {prefix}{n.toFixed(decimals)}
            </span>
        );
    };

    // Función unificada para renderizar cada fila de la sábana de 24 columnas
    const renderRow = (
        row: InventoryDailyRow,
        key: string,
        opts: {
            isChild?: boolean;
            isParent?: boolean;
            isCollapsed?: boolean;
            onToggle?: () => void;
            childCount?: number;
            isAlternate?: boolean;
        } = {}
    ) => {
        const { isChild = false, isParent = false, isCollapsed = true, onToggle, childCount = 0, isAlternate = false } = opts;
        const cellInfo = cellByGroup.get((row.colC_inventoryGroup || '').toUpperCase());
        const rowBg = isChild ? '#F8FAFC' : (isAlternate ? '#F8FAFC' : '#FFFFFF');

        return (
            <tr
                key={key}
                style={{
                    backgroundColor: rowBg,
                    borderBottom: '1px solid #E2E8F0',
                    borderLeft: isParent ? '4px solid #6366F1' : (isChild ? '4px solid #CBD5E1' : 'none'),
                    transition: 'background-color 0.15s'
                }}
            >
                {/* IDENTIFICACIÓN: MODO COMPACTO (1 TD 240px) O TRADICIONAL (4 TDS 475px) */}
                {isCompactIdentification ? (
                    <td style={{ 
                        padding: '6px 8px', 
                        width: '240px',
                        minWidth: '240px',
                        maxWidth: '240px',
                        position: 'sticky',
                        left: 0,
                        zIndex: 10,
                        backgroundColor: rowBg,
                        borderRight: '2px solid #CBD5E1',
                        borderBottom: '1px solid #E2E8F0',
                        boxShadow: '4px 0 10px -2px rgba(0,0,0,0.06)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', overflow: 'hidden' }}>
                            {/* Fila 1: Producto + Expandir/Indent + Unidad/Familia */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', minWidth: 0 }}>
                                    {isParent ? (
                                        <button
                                            type="button"
                                            onClick={onToggle}
                                            style={{
                                                background: isCollapsed ? '#EEF2FF' : '#4F46E5',
                                                border: '1px solid #C7D2FE',
                                                cursor: 'pointer',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                                color: isCollapsed ? '#4F46E5' : '#FFFFFF',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '2px',
                                                fontSize: '0.62rem',
                                                fontWeight: '800',
                                                flexShrink: 0
                                            }}
                                            title={isCollapsed ? `Expandir ${childCount} presentaciones` : "Colapsar familia"}
                                        >
                                            {isCollapsed ? <ChevronRight size={10} strokeWidth={2.5} /> : <ChevronDown size={10} strokeWidth={2.5} />}
                                            <span>{childCount}</span>
                                        </button>
                                    ) : isChild ? (
                                        <span style={{ color: '#94A3B8', fontWeight: '900', fontSize: '0.72rem', flexShrink: 0, paddingLeft: '8px' }}>↳</span>
                                    ) : null}

                                    <span 
                                        style={{ 
                                            fontWeight: isParent ? '800' : isChild ? '600' : '700', 
                                            color: isParent ? '#1E1B4B' : isChild ? '#334155' : '#0F172A',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            fontSize: '0.75rem'
                                        }}
                                        title={row.colD_productName}
                                    >
                                        {row.colD_productName}
                                    </span>
                                </div>

                                {isParent ? (
                                    <span style={{ fontSize: '0.58rem', fontWeight: '800', color: '#4F46E5', backgroundColor: '#EEF2FF', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>
                                        FAMILIA
                                    </span>
                                ) : row.unit_of_measure ? (
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 4px', borderRadius: '3px', flexShrink: 0 }}>
                                        {row.unit_of_measure}
                                    </span>
                                ) : null}
                            </div>

                            {/* Fila 2: ID + Célula con icono Lucide */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.66rem' }}>
                                <span style={{ 
                                    backgroundColor: isChild ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)', 
                                    color: isChild ? '#64748B' : '#0F172A',
                                    padding: '1px 4px', 
                                    borderRadius: '3px',
                                    fontWeight: '800',
                                    fontSize: '0.64rem',
                                    flexShrink: 0
                                }}>
                                    #{row.colB_idProducto}
                                </span>

                                {cellInfo ? (
                                    <span style={{
                                        backgroundColor: cellInfo.badge_bg || '#FEF3C7',
                                        color: cellInfo.badge_text || '#92400E',
                                        padding: '1px 5px',
                                        borderRadius: '4px',
                                        fontSize: '0.63rem',
                                        fontWeight: '700',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {renderCellLucideIcon(cellInfo, 10)}
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {cellInfo.short_name || cellInfo.name}
                                        </span>
                                    </span>
                                ) : (
                                    <span style={{ color: '#64748B', fontSize: '0.64rem' }}>
                                        {row.colC_inventoryGroup}
                                    </span>
                                )}
                            </div>
                        </div>
                    </td>
                ) : (
                    <>
                        {/* A: Fecha (Sticky) */}
                        <td style={{ 
                            padding: '6px 8px', 
                            color: isChild ? '#94A3B8' : '#64748B', 
                            fontSize: '0.72rem',
                            position: 'sticky',
                            left: 0,
                            zIndex: 10,
                            backgroundColor: rowBg,
                            borderBottom: '1px solid #E2E8F0'
                        }}>
                            {row.colA_date}
                        </td>

                        {/* B: ID Prod (Sticky) */}
                        <td style={{ 
                            padding: '6px 8px', 
                            textAlign: 'center', 
                            fontWeight: '800', 
                            color: '#1E293B',
                            position: 'sticky',
                            left: '85px',
                            zIndex: 10,
                            backgroundColor: rowBg,
                            borderBottom: '1px solid #E2E8F0'
                        }}>
                            <span style={{ 
                                backgroundColor: isChild ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)', 
                                color: isChild ? '#64748B' : '#0F172A',
                                padding: '2px 5px', 
                                borderRadius: '4px',
                                fontSize: '0.7rem'
                            }}>
                                #{row.colB_idProducto}
                            </span>
                        </td>

                        {/* C: Célula / Lista (Sticky) */}
                        <td style={{ 
                            padding: '6px 8px',
                            position: 'sticky',
                            left: '155px',
                            zIndex: 10,
                            backgroundColor: rowBg,
                            borderBottom: '1px solid #E2E8F0'
                        }}>
                            {cellInfo ? (
                                <span style={{
                                    backgroundColor: cellInfo.badge_bg || '#FEF3C7',
                                    color: cellInfo.badge_text || '#92400E',
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    fontSize: '0.67rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    {renderCellLucideIcon(cellInfo, 11)}
                                    <span>{cellInfo.short_name || cellInfo.name}</span>
                                </span>
                            ) : (
                                <span style={{ color: '#64748B', fontSize: '0.7rem' }}>
                                    {row.colC_inventoryGroup}
                                </span>
                            )}
                        </td>

                        {/* D: Producto (Sticky) */}
                        <td style={{ 
                            padding: '6px 10px', 
                            fontWeight: '700', 
                            color: '#0F172A', 
                            borderRight: '2px solid #CBD5E1',
                            borderBottom: '1px solid #E2E8F0',
                            position: 'sticky',
                            left: '285px',
                            zIndex: 10,
                            backgroundColor: rowBg,
                            boxShadow: '4px 0 10px -2px rgba(0,0,0,0.06)'
                        }}>
                            {isParent ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={onToggle}
                                        style={{
                                            background: isCollapsed ? '#EEF2FF' : '#4F46E5',
                                            border: '1px solid #C7D2FE',
                                            cursor: 'pointer',
                                            padding: '2px 6px',
                                            borderRadius: '5px',
                                            color: isCollapsed ? '#4F46E5' : '#FFFFFF',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px',
                                            fontSize: '0.66rem',
                                            fontWeight: '800',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title={isCollapsed ? `Expandir ${childCount} presentaciones` : "Colapsar familia"}
                                    >
                                        {isCollapsed ? <ChevronRight size={11} strokeWidth={2.5} /> : <ChevronDown size={11} strokeWidth={2.5} />}
                                        <span>{childCount} pres.</span>
                                    </button>
                                    <span style={{ fontWeight: '800', color: '#1E1B4B' }}>{row.colD_productName}</span>
                                    <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#4F46E5', backgroundColor: '#EEF2FF', padding: '1px 5px', borderRadius: '4px' }}>
                                        FAMILIA
                                    </span>
                                </div>
                            ) : isChild ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '18px' }}>
                                    <span style={{ color: '#94A3B8', fontWeight: '900', fontSize: '0.75rem' }}>↳</span>
                                    <span style={{ fontWeight: '600', color: '#334155' }}>{row.colD_productName}</span>
                                    <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px' }}>
                                        {row.unit_of_measure}
                                    </span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontWeight: '800' }}>{row.colD_productName}</span>
                                    <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px' }}>
                                        {row.unit_of_measure}
                                    </span>
                                </div>
                            )}
                        </td>
                    </>
                )}

                {/* E: Inventario Inicial (+) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700', color: row.colE_initialStock > 0 ? '#0D7A57' : '#94A3B8', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colE_initialStock)}
                </td>

                {/* F: Corrección (±) */}
                <td style={{
                    padding: '6px 8px',
                    textAlign: 'right',
                    fontWeight: row.colF_corrections !== 0 ? '700' : '400',
                    color: row.colF_corrections > 0 ? '#059669' : row.colF_corrections < 0 ? '#DC2626' : '#94A3B8',
                    borderBottom: '1px solid #E2E8F0'
                }}>
                    {row.colF_corrections > 0 ? renderNumericCell(row.colF_corrections, 2, '+') : renderNumericCell(row.colF_corrections)}
                </td>

                {/* G: Compra del Día (+) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700', color: row.colG_purchases > 0 ? '#0F172A' : '#94A3B8', borderRight: '2px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colG_purchases)}
                </td>

                {/* H: Venta del Día KG (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colH_salesKg > 0 ? '#1E40AF' : '#94A3B8', fontWeight: '700', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colH_salesKg)}
                </td>

                {/* I: Venta del Día UN (Informativo) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: '#64748B', borderBottom: '1px solid #E2E8F0' }}>
                    {row.colI_salesUnits > 0 ? <span style={{ fontVariantNumeric: 'tabular-nums' }}>{row.colI_salesUnits} un</span> : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* J: Peso Venta UN (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colJ_weightSalesUnits > 0 ? '#1E40AF' : '#94A3B8', borderRight: '2px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colJ_weightSalesUnits)}
                </td>

                {/* K: Producto Escaso (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colK_shortage > 0 ? '#DC2626' : '#94A3B8', fontWeight: row.colK_shortage > 0 ? '700' : '400', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colK_shortage)}
                </td>

                {/* L: Producto Sin Enviar (+) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colL_unshipped > 0 ? '#059669' : '#94A3B8', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colL_unshipped)}
                </td>

                {/* M: Venta Adicional Cliente (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colM_additionalSales > 0 ? '#7E22CE' : '#94A3B8', fontWeight: row.colM_additionalSales > 0 ? '700' : '400', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colM_additionalSales)}
                </td>

                {/* N: Venta Adicional Empleado (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colN_employeeSales > 0 ? '#2563EB' : '#94A3B8', fontWeight: row.colN_employeeSales > 0 ? '700' : '400', borderRight: '2px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colN_employeeSales)}
                </td>

                {/* O: Devoluciones (+) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colO_returns > 0 ? '#D97706' : '#94A3B8', fontWeight: row.colO_returns > 0 ? '700' : '400', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colO_returns)}
                </td>

                {/* P: Pesada (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colP_weighingWaste > 0 ? '#D97706' : '#94A3B8', fontWeight: row.colP_weighingWaste > 0 ? '700' : '400', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colP_weighingWaste)}
                </td>

                {/* Q: Desperdicio (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colQ_damageWaste > 0 ? '#DC2626' : '#94A3B8', fontWeight: row.colQ_damageWaste > 0 ? '700' : '400', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                        {renderNumericCell(row.colQ_damageWaste)}
                        {row.evidencePhotosQ?.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setPreviewImageUrl(row.evidencePhotosQ[0])}
                                title="Ver evidencia fotográfica"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#DC2626' }}
                            >
                                <Camera size={12} />
                            </button>
                        )}
                    </div>
                </td>

                {/* R: Basura (-) */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colR_cleaningWaste > 0 ? '#B45309' : '#94A3B8', fontWeight: row.colR_cleaningWaste > 0 ? '700' : '400', borderRight: '2px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                        {renderNumericCell(row.colR_cleaningWaste)}
                        {row.evidencePhotosR?.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setPreviewImageUrl(row.evidencePhotosR[0])}
                                title="Ver evidencia de limpieza"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#B45309' }}
                            >
                                <Camera size={12} />
                            </button>
                        )}
                    </div>
                </td>

                {/* S: Inventario Calculado */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: '#0F172A', backgroundColor: isChild ? '#F1F5F9' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {renderNumericCell(row.colS_calculated)}
                </td>

                {/* T: Conteo Físico Real */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.hasPhysicalCount ? '#0D7A57' : '#94A3B8', backgroundColor: isChild ? '#F1F5F9' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                    {row.hasPhysicalCount ? renderNumericCell(row.colT_physicalCount) : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* U: Bodega Post-10 AM */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: '#0F172A', backgroundColor: isChild ? '#F1F5F9' : '#F8FAFC', borderRight: '2px solid #CBD5E1', borderBottom: '1px solid #E2E8F0' }}>
                    {row.colU_bodegaPost10am !== null ? renderNumericCell(row.colU_bodegaPost10am) : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* V: Faltantes */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.colV_missing < 0 ? '#DC2626' : '#94A3B8', borderBottom: '1px solid #E2E8F0' }}>
                    {row.colV_missing < 0 ? renderNumericCell(row.colV_missing) : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* W: Sobrantes */}
                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.colW_surplus > 0 ? '#059669' : '#94A3B8', borderRight: '2px solid #CBD5E1', borderBottom: '1px solid #E2E8F0' }}>
                    {row.colW_surplus > 0 ? renderNumericCell(row.colW_surplus, 2, '+') : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* X: Banco de Alimentos */}
                <td style={{ padding: '6px 8px', textAlign: 'right', color: row.colX_foodBank > 0 ? '#EC4899' : '#94A3B8', fontWeight: row.colX_foodBank > 0 ? '700' : '400', borderBottom: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                        {renderNumericCell(row.colX_foodBank)}
                        {row.evidencePhotosX?.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setPreviewImageUrl(row.evidencePhotosX[0])}
                                title="Ver evidencia banco alimentos"
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#EC4899' }}
                            >
                                <Camera size={12} />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontFamily: 'var(--font-outfit), sans-serif' }}>
            <style>{`
                .daily-balance-table tr:hover td {
                    background-color: #F1F5F9 !important;
                }
            `}</style>

            {/* 1. TARJETAS DE KPIS NANO-BENTO (ALTURA REDUCIDA ~64px) */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: '0.55rem',
                marginBottom: '0.15rem'
            }}>
                {/* 1. Balance Masa */}
                <div 
                    style={{
                        backgroundColor: '#FFFFFF',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.02)'; }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                            Balance Masa
                        </span>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: '#EAEFEA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Scale size={12} color="#0D7A57" />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#1A231E', marginTop: '2px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        {kpis.totalEntradas.toFixed(1)} <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>kg in</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                        Salidas: <b style={{ color: '#1A231E' }}>{kpis.totalSalidas.toFixed(1)} kg</b>
                    </div>
                </div>

                {/* 2. % Merma Lean */}
                <div 
                    style={{
                        backgroundColor: '#FFFFFF',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.02)'; }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#D97706' }}>
                            % Merma Lean
                        </span>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Trash2 size={12} color="#D97706" />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#D97706', marginTop: '2px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        {kpis.wastePercent.toFixed(2)}%
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                        Total: <b style={{ color: '#1A231E' }}>{kpis.totalWasteKg.toFixed(1)} kg</b>
                    </div>
                </div>

                {/* 3. Faltantes */}
                <div 
                    style={{
                        backgroundColor: '#FFFFFF',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.02)'; }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#DC2626' }}>
                            Faltantes (Col V)
                        </span>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingDown size={12} color="#DC2626" />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#DC2626', marginTop: '2px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        -{kpis.totalMissingKg.toFixed(1)} <span style={{ fontSize: '0.68rem', fontWeight: '700' }}>kg</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#DC2626', marginTop: '1px', fontWeight: '800' }}>
                        ${Math.round(kpis.totalMissingVal).toLocaleString('es-CO')}
                    </div>
                </div>

                {/* 4. Sobrantes */}
                <div 
                    style={{
                        backgroundColor: '#FFFFFF',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.02)'; }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#059669' }}>
                            Sobrantes (Col W)
                        </span>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingUp size={12} color="#059669" />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#059669', marginTop: '2px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        +{kpis.totalSurplusKg.toFixed(1)} <span style={{ fontSize: '0.68rem', fontWeight: '700' }}>kg</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: '1px', fontWeight: '800' }}>
                        ${Math.round(kpis.totalSurplusVal).toLocaleString('es-CO')}
                    </div>
                </div>

                {/* 5. Ventas Nómina */}
                <div 
                    style={{
                        backgroundColor: '#FFFFFF',
                        padding: '0.55rem 0.85rem',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.04)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.02)'; }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#2563EB' }}>
                            Ventas Nómina
                        </span>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <User size={12} color="#2563EB" />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#2563EB', marginTop: '2px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        ${Math.round(kpis.totalEmployeeSalesVal).toLocaleString('es-CO')}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                        Volumen: <b style={{ color: '#1A231E' }}>{kpis.totalEmployeeSalesKg.toFixed(1)} kg</b>
                    </div>
                </div>
            </div>

            {/* 2. TOOLBAR UNIFICADA ULTRA-COMPACTA (STICKY FLOTANTE COMO EN LAS DEMÁS PESTAÑAS) */}
            <div 
                ref={dockRef}
                style={{
                    position: 'sticky',
                    top: '85px',
                    zIndex: 50,
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: '12px',
                    border: '1px solid #E2E8F0',
                    padding: '0.45rem 0.85rem',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    flexWrap: 'wrap',
                    transition: 'all 0.2s ease-in-out'
                }}
            >
                {/* IZQUIERDA: Filtros Compactos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: 1, minWidth: '320px' }}>
                    {/* Fecha */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Fecha:</span>
                        <input
                            type="date"
                            value={balanceDate}
                            onChange={e => { setBalanceDate(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '0.3rem 0.55rem',
                                borderRadius: '7px',
                                border: '1.5px solid #0D7A57',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                color: '#0F172A',
                                outline: 'none',
                                backgroundColor: '#FFFFFF'
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => { setBalanceDate(todayStr); setCurrentPage(1); }}
                            style={{
                                padding: '0.3rem 0.55rem',
                                borderRadius: '7px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: balanceDate === todayStr ? '#EAEFEA' : '#FFFFFF',
                                color: balanceDate === todayStr ? '#0D7A57' : '#64748B',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                cursor: 'pointer'
                            }}
                        >
                            Hoy
                        </button>
                    </div>

                    <div style={{ height: '18px', width: '1px', backgroundColor: '#E2E8F0' }} />

                    {/* Célula */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Célula:</span>
                        <select
                            value={selectedCell}
                            onChange={e => { setSelectedCell(e.target.value); setCurrentPage(1); }}
                            style={{
                                padding: '0.3rem 0.6rem',
                                borderRadius: '7px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                backgroundColor: '#FFFFFF',
                                color: '#1E293B',
                                outline: 'none',
                                maxWidth: '190px'
                            }}
                        >
                            <option value="ALL">Todas ({workCells.length})</option>
                            {workCells.map(c => (
                                <option key={c.id} value={c.inventory_group || c.name}>
                                    {c.short_name || c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Buscador */}
                    <div style={{ position: 'relative', flex: 1, minWidth: '150px', maxWidth: '240px' }}>
                        <Search size={13} style={{ position: 'absolute', left: '8px', top: '7px', color: '#94A3B8' }} />
                        <input
                            type="text"
                            placeholder="Buscar SKU, ID..."
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            style={{
                                width: '100%',
                                padding: '0.28rem 0.5rem 0.28rem 1.7rem',
                                borderRadius: '7px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.78rem',
                                boxSizing: 'border-box',
                                outline: 'none'
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                                style={{ position: 'absolute', right: '6px', top: '6px', border: 'none', background: 'transparent', cursor: 'pointer', color: '#94A3B8', padding: 0 }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Toggle expandir / colapsar familias */}
                    <button
                        type="button"
                        onClick={toggleAllFamilies}
                        style={{
                            padding: '0.28rem 0.55rem',
                            borderRadius: '7px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: '#F8FAFC',
                            color: '#475569',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                        title={allCollapsed ? "Expandir todas las presentaciones" : "Colapsar todas las familias"}
                    >
                        {allCollapsed ? <FolderPlus size={13} /> : <FolderMinus size={13} />}
                        <span>{allCollapsed ? "Expandir" : "Colapsar"}</span>
                    </button>
                </div>

                {/* DERECHA: Botones de Acción */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => setIsWasteModalOpen(true)}
                        style={{
                            padding: '0.36rem 0.75rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            fontSize: '0.76rem',
                            fontWeight: '800',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer',
                            boxShadow: '0 1px 4px rgba(13, 122, 87, 0.25)',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0A5F43')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0D7A57')}
                    >
                        <Plus size={14} />
                        <span>+ Merma / Novedad</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsPayrollModalOpen(true)}
                        style={{
                            padding: '0.36rem 0.65rem',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: '#FFFFFF',
                            color: '#334155',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    >
                        <User size={13} color="#2563EB" />
                        <span>Nómina (Col N)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsAdditionalSalesModalOpen(true)}
                        style={{
                            padding: '0.36rem 0.65rem',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: '#FFFFFF',
                            color: '#334155',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0'; }}
                    >
                        <ShoppingCart size={13} color="#7E22CE" />
                        <span>Extra (Col M)</span>
                    </button>

                    <button
                        type="button"
                        onClick={handleExportOfficialExcel}
                        style={{
                            padding: '0.36rem 0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #0D7A57',
                            backgroundColor: '#ECFDF5',
                            color: '#0D7A57',
                            fontSize: '0.76rem',
                            fontWeight: '800',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'pointer'
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#D1FAE5')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ECFDF5')}
                    >
                        <FileSpreadsheet size={13} color="#0D7A57" />
                        <span>Excel 24 Col</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsCompactIdentification(!isCompactIdentification)}
                        title={isCompactIdentification ? "Cambiar a vista de 24 columnas separadas" : "Compactar identificación A-D (ahorra 235px)"}
                        style={{
                            padding: '0.36rem 0.65rem',
                            borderRadius: '8px',
                            border: isCompactIdentification ? '1px solid #CBD5E1' : '1px solid #E2E8F0',
                            backgroundColor: isCompactIdentification ? '#F1F5F9' : '#FFFFFF',
                            color: isCompactIdentification ? '#1E293B' : '#475569',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#E2E8F0'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = isCompactIdentification ? '#F1F5F9' : '#FFFFFF'; }}
                    >
                        <Columns size={13} color={isCompactIdentification ? '#0D7A57' : '#64748B'} />
                        <span>{isCompactIdentification ? 'Identificación Compacta' : 'Cols A-D Separadas'}</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => loadDailyData(true)}
                        title="Refrescar balance"
                        style={{
                            padding: '0.36rem 0.5rem',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: '#FFFFFF',
                            color: '#64748B',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* BARRA DE NAVEGACIÓN Y SELECTORES DE BLOQUES DE COLUMNAS */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
                padding: '0.4rem 0.85rem',
                backgroundColor: '#F8FAFC',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                marginBottom: '0.55rem',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                fontSize: '0.72rem',
                fontWeight: '700',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'nowrap' }}>
                    <span style={{ color: '#64748B', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Layers size={13} color="#0D7A57" />
                        <span>Saltar a Bloque:</span>
                    </span>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(0)}
                        title="Ir a columnas de Identificación (Cols A - D)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#334155',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                    >
                        <FileText size={12} color="#475569" />
                        <span>Identificación (A-D)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(blockOffsets.entradas)}
                        title="Ir a columnas de Entradas y Compras (Cols E - G)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #86EFAC',
                            backgroundColor: '#F0FDF4',
                            color: '#15803D',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DCFCE7'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F0FDF4'}
                    >
                        <ArrowDownToLine size={12} color="#15803D" />
                        <span>Entradas (E-G)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(blockOffsets.ventas)}
                        title="Ir a columnas de Ventas y Pedidos (Cols H - J)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #93C5FD',
                            backgroundColor: '#EFF6FF',
                            color: '#1D4ED8',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#DBEAFE'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#EFF6FF'}
                    >
                        <ShoppingCart size={12} color="#1D4ED8" />
                        <span>Ventas (H-J)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(blockOffsets.excepciones)}
                        title="Ir a columnas de Excepciones y Ventas Extras (Cols K - N)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #D8B4FE',
                            backgroundColor: '#FAF5FF',
                            color: '#7E22CE',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F3E8FF'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FAF5FF'}
                    >
                        <AlertTriangle size={12} color="#7E22CE" />
                        <span>Excepciones (K-N)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(blockOffsets.mermas)}
                        title="Ir a columnas de Devoluciones y Mermas (Cols O - R)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #FCD34D',
                            backgroundColor: '#FFFBEB',
                            color: '#B45309',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FEF3C7'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFBEB'}
                    >
                        <Trash2 size={12} color="#B45309" />
                        <span>Mermas (O-R)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(blockOffsets.cierre)}
                        title="Ir a columnas de Cierre y Bodega Post-10 (Cols S - U)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #5EEAD4',
                            backgroundColor: '#F0FDFA',
                            color: '#0F766E',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#CCFBF1'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F0FDFA'}
                    >
                        <Package size={12} color="#0F766E" />
                        <span>Cierre & Bodega (S-U)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => scrollToColumnGroup(blockOffsets.conciliacion)}
                        title="Ir a columnas de Conciliación y Diferencias (Cols V - X)"
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #6EE7B7',
                            backgroundColor: '#ECFDF5',
                            color: '#065F46',
                            cursor: 'pointer',
                            fontSize: '0.72rem',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1FAE5'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                    >
                        <Scale size={12} color="#065F46" />
                        <span>Conciliación (V-X)</span>
                    </button>
                </div>

                {/* Flechas de desplazamiento lateral paso a paso */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <button
                        type="button"
                        onClick={() => scrollStepHorizontal('left')}
                        title="Desplazar columnas a la izquierda"
                        style={{
                            padding: '3px 6px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        <ChevronLeft size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollStepHorizontal('right')}
                        title="Desplazar columnas a la derecha"
                        style={{
                            padding: '3px 6px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center'
                        }}
                    >
                        <ChevronRight size={13} />
                    </button>
                </div>
            </div>

            {/* TABLA DE 24 COLUMNAS LEAN ENTERPRISE */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
                position: 'relative'
            }}>
                <div 
                    ref={tableScrollRef}
                    style={{ 
                        overflow: 'auto', 
                        maxHeight: 'calc(100vh - 215px)',
                        position: 'relative' 
                    }}
                >
                    <table className="daily-balance-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {/* Cabecera Nivel 1: Grupos Temáticos de Columnas */}
                        <thead style={{ 
                            position: 'sticky', 
                            top: 0, 
                            zIndex: 40, 
                            backgroundColor: '#0F172A', 
                            color: '#F8FAFC',
                            boxShadow: '0 4px 10px -2px rgba(0, 0, 0, 0.15)'
                        }}>
                            <tr>
                                <th 
                                    colSpan={isCompactIdentification ? 1 : 4} 
                                    onClick={() => scrollToColumnGroup(0)}
                                    title="Clic para enfocar Identificación"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderRight: '2px solid #334155', 
                                        borderTop: '3px solid #64748B',
                                        fontWeight: '800', 
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 45,
                                        width: isCompactIdentification ? '240px' : undefined,
                                        minWidth: isCompactIdentification ? '240px' : undefined,
                                        maxWidth: isCompactIdentification ? '240px' : undefined,
                                        boxShadow: '4px 0 10px -2px rgba(0,0,0,0.3)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(100, 116, 139, 0.25)', 
                                        color: '#CBD5E1', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        IDENTIFICACIÓN (Cols A - D)
                                    </span>
                                </th>
                                <th 
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup(blockOffsets.entradas)}
                                    title="Clic para enfocar Entradas (+)"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderRight: '2px solid #334155', 
                                        borderTop: '3px solid #10B981',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(16, 185, 129, 0.18)', 
                                        color: '#34D399', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        ENTRADAS (+) (Cols E - G)
                                    </span>
                                </th>
                                <th 
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup(blockOffsets.ventas)}
                                    title="Clic para enfocar Ventas & Pedidos (-)"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderRight: '2px solid #334155', 
                                        borderTop: '3px solid #3B82F6',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(59, 130, 246, 0.18)', 
                                        color: '#60A5FA', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        VENTAS & PEDIDOS (-) (Cols H - J)
                                    </span>
                                </th>
                                <th 
                                    colSpan={4} 
                                    onClick={() => scrollToColumnGroup(blockOffsets.excepciones)}
                                    title="Clic para enfocar Excepciones"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderRight: '2px solid #334155', 
                                        borderTop: '3px solid #A855F7',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(168, 85, 247, 0.18)', 
                                        color: '#C084FC', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        EXCEPCIONES (Cols K - N)
                                    </span>
                                </th>
                                <th 
                                    colSpan={4} 
                                    onClick={() => scrollToColumnGroup(blockOffsets.mermas)}
                                    title="Clic para enfocar Devoluciones & Mermas"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderRight: '2px solid #334155', 
                                        borderTop: '3px solid #F59E0B',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(245, 158, 11, 0.18)', 
                                        color: '#FBBF24', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        DEVOLUCIONES & MERMAS (Cols O - R)
                                    </span>
                                </th>
                                <th 
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup(blockOffsets.cierre)}
                                    title="Clic para enfocar Cierre & Bodega"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderRight: '2px solid #334155', 
                                        borderTop: '3px solid #0D9488',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(13, 148, 136, 0.18)', 
                                        color: '#2DD4BF', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        CIERRE & BODEGA (Cols S - U)
                                    </span>
                                </th>
                                <th 
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup(blockOffsets.conciliacion)}
                                    title="Clic para enfocar Conciliación"
                                    style={{ 
                                        padding: '7px 10px', 
                                        textAlign: 'center', 
                                        backgroundColor: '#0F172A', 
                                        borderBottom: '1px solid #1E293B',
                                        borderTop: '3px solid #0D7A57',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ 
                                        backgroundColor: 'rgba(13, 122, 87, 0.25)', 
                                        color: '#6EE7B7', 
                                        padding: '2px 8px', 
                                        borderRadius: '5px', 
                                        fontSize: '0.66rem', 
                                        letterSpacing: '0.05em' 
                                    }}>
                                        CONCILIACIÓN (Cols V - X)
                                    </span>
                                </th>
                            </tr>

                            {/* Cabecera Nivel 2: Nombres exactos de las columnas */}
                            <tr style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: '2px solid #334155' }}>
                                {/* Sticky A, B, C, D (Compacto o Tradicional) */}
                                {isCompactIdentification ? (
                                    <th style={{
                                        padding: '6px 10px',
                                        textAlign: 'left',
                                        width: '240px',
                                        minWidth: '240px',
                                        maxWidth: '240px',
                                        borderRight: '2px solid #334155',
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 45,
                                        backgroundColor: '#0F172A',
                                        boxShadow: '4px 0 10px -2px rgba(0,0,0,0.3)',
                                        fontSize: '0.7rem',
                                        color: '#E2E8F0'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>A-D: PRODUCTO & SKU</span>
                                            <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: '500', textTransform: 'none' }}>Célula / Fecha</span>
                                        </div>
                                    </th>
                                ) : (
                                    <>
                                        <th style={{ padding: '6px 8px', textAlign: 'left', width: '85px', minWidth: '85px', position: 'sticky', left: 0, zIndex: 45, backgroundColor: '#0F172A' }}>A: Fecha</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '70px', minWidth: '70px', position: 'sticky', left: '85px', zIndex: 45, backgroundColor: '#0F172A' }}>B: ID Prod</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'left', width: '130px', minWidth: '130px', position: 'sticky', left: '155px', zIndex: 45, backgroundColor: '#0F172A' }}>C: Célula</th>
                                        <th style={{ padding: '6px 10px', textAlign: 'left', width: '190px', minWidth: '190px', borderRight: '2px solid #334155', position: 'sticky', left: '285px', zIndex: 45, backgroundColor: '#0F172A', boxShadow: '4px 0 10px -2px rgba(0,0,0,0.3)' }}>D: Producto</th>
                                    </>
                                )}

                                {/* Columnas E - G */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399' }}>E: Inicial (+)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399' }}>F: Correc. (±)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', borderRight: '2px solid #334155' }}>G: Compra (+)</th>

                                {/* Columnas H - J */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#60A5FA' }}>H: Venta KG (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#94A3B8' }}>I: Venta UN (Info)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#60A5FA', borderRight: '2px solid #334155' }}>J: Peso UN (-)</th>

                                {/* Columnas K - N */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F87171' }}>K: Escaso (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399' }}>L: Sin Enviar (+)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#C084FC' }}>M: Vta Extra (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#60A5FA', borderRight: '2px solid #334155' }}>N: Vta Nómina (-)</th>

                                {/* Columnas O - R */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#FBBF24' }}>O: Devol. (+)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#FBBF24' }}>P: Pesada (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F87171' }}>Q: Desperd. (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#FBBF24', borderRight: '2px solid #334155' }}>R: Basura (-)</th>

                                {/* Columnas S - U */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F8FAFC', backgroundColor: '#1E293B' }}>S: Calc. Final</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', backgroundColor: '#1E293B' }}>T: Conteo Real</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F8FAFC', backgroundColor: '#1E293B', borderRight: '2px solid #334155' }}>U: Bodega Post-10</th>

                                {/* Columnas V - X */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F87171' }}>V: Faltantes</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399' }}>W: Sobrantes</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F472B6' }}>X: Donación</th>
                            </tr>
                        </thead>

                        {/* Cuerpo de Datos con Jerarquía Padre - Hijo */}
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={isCompactIdentification ? 21 : 24} style={{ textAlign: 'center', padding: '3.5rem', color: '#64748B' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                                            <RefreshCw size={24} className="animate-spin text-emerald-600" />
                                            <span style={{ fontWeight: '700', fontSize: '0.88rem' }}>Consolidando sábanas operativas de turno...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedFamilies.length === 0 ? (
                                <tr>
                                    <td colSpan={isCompactIdentification ? 21 : 24} style={{ textAlign: 'center', padding: '3.5rem', color: '#94A3B8' }}>
                                        <Package size={32} strokeWidth={1.5} style={{ margin: '0 auto 0.5rem', opacity: 0.6 }} />
                                        <div style={{ fontWeight: '700', color: '#475569', fontSize: '0.9rem' }}>No se encontraron productos activos con los filtros seleccionados</div>
                                        <p style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>Verifica el término de búsqueda o selecciona otra célula de trabajo.</p>
                                    </td>
                                </tr>
                            ) : (
                                paginatedFamilies.map((family, idx) => {
                                    const isAlternate = idx % 2 === 1;
                                    const isCollapsed = collapsedFamilies[family.id] !== false; // default true

                                    if (family.isParent) {
                                        return (
                                            <React.Fragment key={`family-${family.id}`}>
                                                {/* Fila Padre / Consolidada */}
                                                {renderRow(family.consolidated, `parent-${family.id}`, {
                                                    isParent: true,
                                                    isCollapsed,
                                                    onToggle: () => toggleFamily(family.id),
                                                    childCount: family.children.length,
                                                    isAlternate
                                                })}

                                                {/* Filas Hijas (si está expandido) */}
                                                {!isCollapsed && family.children.map((child, chIdx) => 
                                                    renderRow(child, `child-${child.productId}`, {
                                                        isChild: true,
                                                        isAlternate: chIdx % 2 === 1
                                                    })
                                                )}
                                            </React.Fragment>
                                        );
                                    }

                                    // Producto independiente sin hijos
                                    return renderRow(family.parent, `standalone-${family.id}`, {
                                        isAlternate
                                    });
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* BARRA DE PAGINACIÓN Y CONTROL DE LONGITUD */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0.85rem',
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                flexWrap: 'wrap',
                gap: '0.65rem',
                fontSize: '0.78rem',
                color: '#64748B'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span>
                        Mostrando <strong>{pageSize === 'ALL' ? filteredFamilies.length : Math.min((currentPage - 1) * pageSize + 1, filteredFamilies.length)}</strong> - <strong>{pageSize === 'ALL' ? filteredFamilies.length : Math.min(currentPage * pageSize, filteredFamilies.length)}</strong> de <strong>{filteredFamilies.length}</strong> familias ({totalActiveSkusCount} SKUs activos)
                    </span>
                    <div style={{ height: '14px', width: '1px', backgroundColor: '#CBD5E1' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span>Por página:</span>
                        <select
                            value={pageSize}
                            onChange={e => {
                                const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                                setPageSize(val);
                                setCurrentPage(1);
                            }}
                            style={{
                                padding: '0.2rem 0.45rem',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.76rem',
                                fontWeight: '700',
                                color: '#1E293B',
                                outline: 'none',
                                backgroundColor: '#F8FAFC'
                            }}
                        >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value="ALL">Todas</option>
                        </select>
                    </div>
                </div>

                {pageSize !== 'ALL' && totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            style={{
                                padding: '0.25rem 0.45rem',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: currentPage === 1 ? '#F8FAFC' : '#FFFFFF',
                                color: currentPage === 1 ? '#CBD5E1' : '#334155',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                fontSize: '0.74rem',
                                display: 'inline-flex',
                                alignItems: 'center'
                            }}
                            title="Primera página"
                        >
                            <ChevronsLeft size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: currentPage === 1 ? '#F8FAFC' : '#FFFFFF',
                                color: currentPage === 1 ? '#CBD5E1' : '#334155',
                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px'
                            }}
                        >
                            <ChevronLeft size={13} />
                            <span>Anterior</span>
                        </button>

                        <span style={{ padding: '0 0.45rem', fontSize: '0.76rem', fontWeight: '800', color: '#1E293B' }}>
                            Pág. {currentPage} / {totalPages}
                        </span>

                        <button
                            type="button"
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages}
                            style={{
                                padding: '0.25rem 0.55rem',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: currentPage === totalPages ? '#F8FAFC' : '#FFFFFF',
                                color: currentPage === totalPages ? '#CBD5E1' : '#334155',
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                fontSize: '0.74rem',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '2px'
                            }}
                        >
                            <span>Siguiente</span>
                            <ChevronRight size={13} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                            style={{
                                padding: '0.25rem 0.45rem',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: currentPage === totalPages ? '#F8FAFC' : '#FFFFFF',
                                color: currentPage === totalPages ? '#CBD5E1' : '#334155',
                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                fontSize: '0.74rem',
                                display: 'inline-flex',
                                alignItems: 'center'
                            }}
                            title="Última página"
                        >
                            <ChevronsRight size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* MODAL LIGHTBOX PARA VISUALIZAR FOTO DE EVIDENCIA */}
            {previewImageUrl && (
                <div
                    onClick={() => setPreviewImageUrl(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 10000,
                        backgroundColor: 'rgba(0, 0, 0, 0.85)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1.5rem'
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'relative',
                            maxWidth: '720px',
                            maxHeight: '90vh',
                            backgroundColor: '#1E293B',
                            borderRadius: '12px',
                            padding: '1rem',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                    >
                        <button
                            onClick={() => setPreviewImageUrl(null)}
                            style={{
                                position: 'absolute',
                                top: '10px',
                                right: '10px',
                                backgroundColor: '#EF4444',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer'
                            }}
                        >
                            <X size={18} />
                        </button>
                        <div style={{ color: '#F8FAFC', fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Camera size={16} />
                            <span>Evidencia Fotográfica en Báscula</span>
                        </div>
                        <img
                            src={previewImageUrl}
                            alt="Evidencia báscula"
                            style={{ maxWidth: '100%', maxHeight: '75vh', borderRadius: '8px', objectFit: 'contain' }}
                        />
                    </div>
                </div>
            )}

            {/* MODALES EXTERNOS */}
            <InventoryWasteModal
                isOpen={isWasteModalOpen}
                onClose={() => setIsWasteModalOpen(false)}
                onSuccess={() => loadDailyData(true)}
                products={products}
            />

            <InventoryPayrollModal
                isOpen={isPayrollModalOpen}
                onClose={() => setIsPayrollModalOpen(false)}
            />

            <InventoryAdditionalSalesModal
                isOpen={isAdditionalSalesModalOpen}
                onClose={() => setIsAdditionalSalesModalOpen(false)}
            />
        </div>
    );
}
