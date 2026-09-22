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
    ChevronsUpDown,
    Check,
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
    Columns,
    Database,
    Sparkles,
    Info,
    Dna,
    Upload,
    Zap,
    Lock,
    Unlock
} from 'lucide-react';
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
import DailyBalanceExcelImportModal from '@/components/DailyBalanceExcelImportModal';

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
    isP?: boolean;
    isH?: boolean;
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
    isP: boolean;
    isH: boolean;
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
    const [isCellComboboxOpen, setIsCellComboboxOpen] = useState(false);
    const [cellComboboxSearch, setCellComboboxSearch] = useState('');
    const cellComboboxRef = useRef<HTMLDivElement>(null);

    const cellOptions = useMemo(() => [
        { value: 'ALL', label: `Todas (${workCells.length})`, icon: <Boxes size={14} color="#0D7A57" strokeWidth={2} /> },
        ...workCells.map(c => ({
            value: c.inventory_group || c.name,
            label: c.short_name || c.name,
            icon: renderCellLucideIcon(c, 14)
        }))
    ], [workCells]);

    const selectedCellOption = useMemo(() => {
        return cellOptions.find(opt => opt.value === selectedCell) || cellOptions[0];
    }, [cellOptions, selectedCell]);

    const filteredCellOptions = useMemo(() => {
        if (!cellComboboxSearch.trim()) return cellOptions;
        const term = cellComboboxSearch.toLowerCase().trim();
        return cellOptions.filter(opt => opt.label.toLowerCase().includes(term));
    }, [cellOptions, cellComboboxSearch]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (cellComboboxRef.current && !cellComboboxRef.current.contains(event.target as Node)) {
                setIsCellComboboxOpen(false);
            }
        };
        if (isCellComboboxOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isCellComboboxOpen]);

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showHelpTooltip, setShowHelpTooltip] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);

    const [products, setProducts] = useState<ProductItem[]>([]);
    const [movements, setMovements] = useState<RawMovement[]>([]);

    // Modales de apoyo
    const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
    const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
    const [isAdditionalSalesModalOpen, setIsAdditionalSalesModalOpen] = useState(false);
    const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

    // Estado de Cierre Diario Oficial y Congelación Contable (SPEC.md v1.5.0)
    const [closingRecord, setClosingRecord] = useState<{
        id: string;
        closing_date: string;
        closed_at: string;
        closed_by_name: string;
        is_locked: boolean;
        notes?: string;
        total_calculated?: number;
        total_physical?: number;
        total_missing?: number;
        total_surplus?: number;
        snapshot_items?: any[];
    } | null>(null);
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
    const [closingNotes, setClosingNotes] = useState('');
    const [isSubmittingClosing, setIsSubmittingClosing] = useState(false);
    const [previousClosingMap, setPreviousClosingMap] = useState<Record<string, number>>({});

    const [editingCell, setEditingCell] = useState<{
        productId: string;
        colKey: string;
        initialValue: number;
        currentValue: string;
    } | null>(null);
    const [isSavingCell, setIsSavingCell] = useState(false);

    // Notificaciones corporativas tipo Toast accesibles (sin window.alert bloqueante)
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' | 'info' } | null>(null);
    const notify = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
        setToast({ message, type });
        if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast(message, type === 'warning' ? 'info' : type);
        }
        setTimeout(() => {
            setToast(prev => (prev?.message === message ? null : prev));
        }, 4500);
    }, []);

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

    // Filtro para mostrar únicamente SKUs y familias con movimientos en el día
    const [onlyWithMovement, setOnlyWithMovement] = useState(false);

    // Control de ancho en columnas de identificación A-D (por defecto false para vista clásica tabular completa)
    const [isCompactIdentification, setIsCompactIdentification] = useState(false);

    // Modo colapsado de la columna Célula (auto al navegar a la derecha, o manual por clic)
    const [cellColumnMode, setCellColumnMode] = useState<'auto' | 'collapsed' | 'expanded'>('auto');
    const [isScrolledRight, setIsScrolledRight] = useState(false);

    const isCellCollapsed = !isCompactIdentification && (
        cellColumnMode === 'collapsed'
            ? true
            : (cellColumnMode === 'expanded' ? false : isScrolledRight)
    );

    type ColumnBlockId = 'identificacion' | 'entradas' | 'ventas' | 'excepciones' | 'mermas' | 'cierre' | 'conciliacion';
    const [activeBlock, setActiveBlock] = useState<ColumnBlockId>('identificacion');

    // Referencia al contenedor de la sábana de 24 columnas y helpers de navegación
    const tableScrollRef = useRef<HTMLDivElement>(null);

    const handleTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const scrollX = e.currentTarget.scrollLeft;
        if (scrollX > 35) {
            setIsScrolledRight(true);
        } else if (scrollX <= 15) {
            setIsScrolledRight(false);
            setCellColumnMode('auto');
            setActiveBlock('identificacion');
        }
    }, []);

    // Centrado dinámico inteligente de bloque en el espacio disponible visible (a la derecha de Cols A-D)
    const scrollToColumnGroup = (blockId: ColumnBlockId) => {
        const container = tableScrollRef.current;
        if (!container) return;

        setActiveBlock(blockId);

        if (blockId === 'identificacion') {
            container.scrollTo({ left: 0, behavior: 'smooth' });
            setIsScrolledRight(false);
            setCellColumnMode('auto');
            return;
        }

        // Si Célula está en modo auto y aún no está colapsada, colapsarla para maximizar el espacio útil de lectura
        const shouldTriggerCollapse = !isCellCollapsed && !isCompactIdentification && cellColumnMode === 'auto';
        if (shouldTriggerCollapse) {
            setIsScrolledRight(true);
        }

        const doScroll = () => {
            if (!container) return;
            const containerRect = container.getBoundingClientRect();

            // Detectar el borde derecho exacto en pantalla donde terminan las columnas fijas (A-D)
            const stickyHeader = container.querySelector('[data-sticky-last="true"]');
            const stickyRect = stickyHeader?.getBoundingClientRect();
            const frozenWidth = stickyRect 
                ? Math.round(stickyRect.right - containerRect.left)
                : (isCompactIdentification ? 240 : (isCellCollapsed ? 389 : 475));

            // Espacio disponible en la pantalla para ver datos (ancho del viewport menos columnas fijas)
            const availableWidth = Math.max(100, container.clientWidth - frozenWidth);

            // Elemento cabecera del bloque correspondiente
            const blockHeader = container.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement;
            if (!blockHeader) return;

            const blockRect = blockHeader.getBoundingClientRect();
            const blockWidth = blockRect.width;

            let targetScrollLeft: number;

            if (blockWidth >= availableWidth) {
                // Si el bloque es más ancho que el espacio disponible, alinear su inicio al borde de las columnas fijas
                const currentScreenLeft = blockRect.left - containerRect.left;
                const deltaX = currentScreenLeft - frozenWidth;
                targetScrollLeft = container.scrollLeft + deltaX;
            } else {
                // Centrar perfectamente el bloque en el espacio disponible:
                // 1. Centro deseado en coordenadas de pantalla del contenedor (entre frozenWidth y clientWidth):
                const desiredScreenCenter = frozenWidth + (availableWidth / 2);
                // 2. Centro actual del bloque en coordenadas de pantalla del contenedor:
                const currentScreenCenter = (blockRect.left - containerRect.left) + (blockWidth / 2);
                // 3. Ajuste de scroll:
                const deltaX = currentScreenCenter - desiredScreenCenter;
                targetScrollLeft = container.scrollLeft + deltaX;
            }

            const maxScrollLeft = container.scrollWidth - container.clientWidth;
            const clampedScroll = Math.max(0, Math.min(Math.round(targetScrollLeft), maxScrollLeft));

            container.scrollTo({ left: clampedScroll, behavior: 'smooth' });
        };

        if (shouldTriggerCollapse) {
            // Permitir que el navegador aplique el colapso de la Célula (ahorro de 86px) antes de medir
            requestAnimationFrame(() => {
                setTimeout(doScroll, 40);
            });
        } else {
            doScroll();
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
            // 0. Cargar estado de cierre oficial de la fecha seleccionada
            try {
                const { data: closeData } = await supabase
                    .from('daily_inventory_closings')
                    .select('*')
                    .eq('closing_date', balanceDate)
                    .maybeSingle();
                setClosingRecord(closeData || null);
            } catch (closeErr) {
                console.warn('daily_inventory_closings no disponible o tabla pendiente:', closeErr);
                setClosingRecord(null);
            }

            // 0.1 Cargar último cierre oficial previo (D-1 flexible) para heredar el saldo inicial oficial inmutable
            const prevClosingSnapshots: Record<string, number> = {};
            try {
                const { data: prevCloseData } = await supabase
                    .from('daily_inventory_closings')
                    .select('snapshot_items, closing_date')
                    .lt('closing_date', balanceDate)
                    .order('closing_date', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (prevCloseData?.snapshot_items && Array.isArray(prevCloseData.snapshot_items)) {
                    prevCloseData.snapshot_items.forEach((item: any) => {
                        const finalStock = item.physicalCount !== null && item.physicalCount !== undefined
                            ? Number(item.physicalCount)
                            : Number(item.calculatedStock || 0);
                        if (item.productId) {
                            prevClosingSnapshots[item.productId] = finalStock;
                        }
                    });
                }
            } catch (prevErr) {
                console.warn('No se pudo cargar cierre del día anterior:', prevErr);
            }
            setPreviousClosingMap(prevClosingSnapshots);

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

        // Pre-calcular Set indexado O(1) de padres con hijos para evitar cuello de botella O(N^2)
        const parentIdsWithChildren = new Set<string>();
        products.forEach(p => {
            if (p.parent_id && p.parent_id !== p.id) {
                parentIdsWithChildren.add(p.parent_id);
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

            // Inventario Inicial (Col E):
            // 1. Si existe Cierre Oficial del día anterior (D-1), se hereda su saldo final de forma inmutable (SPEC.md v1.5.0)
            // 2. Si no existe cierre oficial, se aplica reconstrucción retroactiva: Stock Actual - sum(deltas posteriores).
            const sumDeltasSinceStart = dayMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0) +
                                       laterMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
            const initialStock = previousClosingMap[p.id] !== undefined
                ? previousClosingMap[p.id]
                : Math.max(0, currentStock - sumDeltasSinceStart);

            // S: Inventario Calculado
            // S = E + F + G - H - J - K + L - M - N + O - P - Q - R
            const calculatedStock = initialStock + f_corrections + g_purchases - h_salesKg - j_weightSalesUnits - k_shortage + l_unshipped - m_additionalSales - n_employeeSales + o_returns - p_weighingWaste - q_damageWaste - r_cleaningWaste;

            // U: Inventario Bodega post-10 AM = T + O
            const bodegaPost10 = physicalCount !== null ? physicalCount + o_returns : null;

            // V & W: Faltantes y Sobrantes (Magnitudes positivas como en el Excel del cliente)
            let missing = 0;
            let surplus = 0;
            if (physicalCount !== null) {
                const diff = physicalCount - calculatedStock;
                if (diff < -0.001) missing = Math.abs(diff);
                else if (diff > 0.001) surplus = diff;
            }

            // Jerarquía dual P/H (Sincronizada con Maestro SKU)
            const isSelfParentChild = p.parent_id === p.id;
            const hasOtherChildren = parentIdsWithChildren.has(p.id);
            const isP = isSelfParentChild || hasOtherChildren;
            const isH = isSelfParentChild || Boolean(p.parent_id && p.parent_id !== p.id);

            return {
                productId: p.id,
                sku: p.sku || '',
                parent_id: p.parent_id,
                is_active: p.is_active !== false,
                isP,
                isH,
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
    }, [balanceDate, products, movements, previousClosingMap]);

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
        const dailyRowProductIds = new Set<string>(dailyRows.map(r => r.productId));

        dailyRows.forEach(row => {
            if (childProductIds.has(row.productId)) {
                // Si el padre existe en dailyRows, este hijo se anidará bajo él
                const parentExists = row.parent_id ? dailyRowProductIds.has(row.parent_id) : false;
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
                colV_missing: (row.hasPhysicalCount || children.some(c => c.hasPhysicalCount))
                    ? Math.max(0, (row.colS_calculated + children.reduce((s, c) => s + c.colS_calculated, 0)) - ((row.colT_physicalCount || 0) + children.reduce((s, c) => s + (c.colT_physicalCount || 0), 0)))
                    : 0,
                colW_surplus: (row.hasPhysicalCount || children.some(c => c.hasPhysicalCount))
                    ? Math.max(0, ((row.colT_physicalCount || 0) + children.reduce((s, c) => s + (c.colT_physicalCount || 0), 0)) - (row.colS_calculated + children.reduce((s, c) => s + c.colS_calculated, 0)))
                    : 0,
                colX_foodBank: row.colX_foodBank + children.reduce((s, c) => s + c.colX_foodBank, 0),
                evidencePhotosQ: [...row.evidencePhotosQ, ...children.flatMap(c => c.evidencePhotosQ)],
                evidencePhotosR: [...row.evidencePhotosR, ...children.flatMap(c => c.evidencePhotosR)],
                evidencePhotosX: [...row.evidencePhotosX, ...children.flatMap(c => c.evidencePhotosX)]
            } : row;

            families.push({
                id: row.productId,
                parent: row,
                isParent: hasChildren,
                isP: Boolean(row.isP),
                isH: Boolean(row.isH),
                children,
                consolidated
            });
        });

        return families;
    }, [dailyRows]);

    // Lógica de búsqueda inteligente y etiquetas (#ID, @tags, multi-búsqueda por comas)
    const matchSearchSegment = (row: InventoryDailyRow, segment: string): boolean => {
        const trimmed = segment.trim();
        if (!trimmed) return true;

        // Soporte #ID (ej: #15, #1528)
        if (trimmed.startsWith('#')) {
            const id = trimmed.slice(1).trim();
            return row.colB_idProducto?.toString() === id;
        }

        const parts = trimmed.split(/\s+/);
        const tags = parts.filter(pt => pt.startsWith('@')).map(t => t.slice(1).toLowerCase());
        const searchTerms = parts.filter(pt => !pt.startsWith('@')).map(t => t.toLowerCase());

        const matchesText = searchTerms.every(term => 
            row.colD_productName?.toLowerCase().includes(term) ||
            (row.sku || '')?.toLowerCase().includes(term) ||
            row.colB_idProducto?.toString()?.toLowerCase().includes(term) ||
            row.colC_inventoryGroup?.toLowerCase().includes(term)
        );

        if (!matchesText && searchTerms.length > 0) return false;

        const matchesTags = tags.every(tag => {
            if (tag === 'alerta' || tag === 'bajo' || tag === 'critico') {
                return row.colV_missing > 0;
            }
            if (tag === 'disponible' || tag === 'ok' || tag === 'positivo' || tag === 'constock' || tag === 'con_stock') {
                return (row.colS_calculated || 0) > 0;
            }
            if (tag === 'agotado' || tag === 'cero' || tag === 'sin_stock' || tag === 'sinstock') {
                return (row.colS_calculated || 0) <= 0;
            }
            if (tag === 'sobrante' || tag === 'sobrantes') return row.colW_surplus > 0;
            if (tag === 'faltante' || tag === 'faltantes') return row.colV_missing > 0;
            if (tag === 'merma' || tag === 'desperdicio') return (row.colQ_damageWaste > 0 || row.colR_cleaningWaste > 0 || row.colP_weighingWaste > 0);
            
            // Filtros de Jerarquía 1:1 con Maestro SKU
            if (tag === 'padre') return Boolean(row.isP);
            if (tag === 'hijo') return Boolean(row.isH);
            if (tag === 'padrehijo' || tag === 'padre-hijo' || tag === 'ambos') return Boolean(row.isP && row.isH);

            // Filtro por grupo / célula de inventario (@fresas, @hortalizas, @verduras, @frutas, @papas, @abarrotes...)
            if (row.colC_inventoryGroup?.toLowerCase().includes(tag)) return true;

            return false;
        });

        return matchesTags;
    };

    // Helper para determinar si una fila específica tiene cualquier movimiento o saldo en las columnas E a X
    const hasRowMovement = useCallback((r: InventoryDailyRow | undefined | null): boolean => {
        if (!r) return false;
        return (
            (r.colE_initialStock || 0) > 0.001 ||
            Math.abs(r.colF_corrections || 0) > 0.001 ||
            (r.colG_purchases || 0) > 0.001 ||
            (r.colH_salesKg || 0) > 0.001 ||
            (r.colI_salesUnits || 0) > 0.001 ||
            (r.colJ_weightSalesUnits || 0) > 0.001 ||
            (r.colK_shortage || 0) > 0.001 ||
            (r.colL_unshipped || 0) > 0.001 ||
            (r.colM_additionalSales || 0) > 0.001 ||
            (r.colN_employeeSales || 0) > 0.001 ||
            (r.colO_returns || 0) > 0.001 ||
            (r.colP_weighingWaste || 0) > 0.001 ||
            (r.colQ_damageWaste || 0) > 0.001 ||
            (r.colR_cleaningWaste || 0) > 0.001 ||
            Math.abs(r.colS_calculated || 0) > 0.001 ||
            (Boolean(r.hasPhysicalCount) && r.colT_physicalCount !== null) ||
            (r.colU_bodegaPost10am !== null && (r.colU_bodegaPost10am || 0) > 0.001) ||
            (r.colV_missing || 0) > 0.001 ||
            (r.colW_surplus || 0) > 0.001 ||
            (r.colX_foodBank || 0) > 0.001
        );
    }, []);

    // Helper para determinar si una familia entera (padre o cualquiera de sus hijos) tuvo movimientos
    const hasFamilyMovement = useCallback((family: DailyFamily): boolean => {
        if (family.isParent) {
            if (hasRowMovement(family.consolidated)) return true;
            if (hasRowMovement(family.parent)) return true;
            return family.children.some(child => hasRowMovement(child));
        }
        return hasRowMovement(family.parent);
    }, [hasRowMovement]);

    // Conteo total de familias que registraron movimientos en el día
    const countFamiliesWithMovement = useMemo(() => {
        return dailyFamilies.filter(f => hasFamilyMovement(f)).length;
    }, [dailyFamilies, hasFamilyMovement]);

    // Filtrado interactivo sobre las familias
    const filteredFamilies = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const segments = query ? query.split(',').map(s => s.trim()).filter(Boolean) : [];

        return dailyFamilies.filter(family => {
            // Filtro exclusivo: Solo familias/SKUs con movimiento en el turno
            if (onlyWithMovement && !hasFamilyMovement(family)) {
                return false;
            }

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

            // Filtro por búsqueda inteligente avanzada
            if (segments.length > 0) {
                const matchFamily = segments.every(seg => {
                    if (matchSearchSegment(family.parent, seg)) return true;
                    if (matchSearchSegment(family.consolidated, seg)) return true;
                    if (family.children.some(child => matchSearchSegment(child, seg))) return true;
                    return false;
                });
                if (!matchFamily) return false;
            }

            return true;
        });
    }, [dailyFamilies, selectedCell, searchQuery, onlyWithMovement, hasFamilyMovement]);

    // Total de SKUs activos representados (padres + hijos)
    const totalActiveSkusCount = useMemo(() => {
        return filteredFamilies.reduce((acc, f) => acc + 1 + f.children.length, 0);
    }, [filteredFamilies]);

    // Modo Lista Continua (100% de las familias y SKUs en una sola sábana continua sin fragmentación)
    const displayedFamilies = filteredFamilies;

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

            if (r.colV_missing > 0) {
                totalMissingKg += r.colV_missing;
                totalMissingVal += (r.colV_missing * r.base_price);
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

    // Totales verticales para cada una de las 24 columnas (Consolidado sin duplicación Padre-Hijo)
    const columnTotals = useMemo(() => {
        const list = filteredFamilies.map(f => f.isParent ? f.consolidated : f.parent);
        return {
            totalE: list.reduce((acc, r) => acc + (r.colE_initialStock || 0), 0),
            totalF: list.reduce((acc, r) => acc + (r.colF_corrections || 0), 0),
            totalG: list.reduce((acc, r) => acc + (r.colG_purchases || 0), 0),
            totalH: list.reduce((acc, r) => acc + (r.colH_salesKg || 0), 0),
            totalI: list.reduce((acc, r) => acc + (r.colI_salesUnits || 0), 0),
            totalJ: list.reduce((acc, r) => acc + (r.colJ_weightSalesUnits || 0), 0),
            totalK: list.reduce((acc, r) => acc + (r.colK_shortage || 0), 0),
            totalL: list.reduce((acc, r) => acc + (r.colL_unshipped || 0), 0),
            totalM: list.reduce((acc, r) => acc + (r.colM_additionalSales || 0), 0),
            totalN: list.reduce((acc, r) => acc + (r.colN_employeeSales || 0), 0),
            totalO: list.reduce((acc, r) => acc + (r.colO_returns || 0), 0),
            totalP: list.reduce((acc, r) => acc + (r.colP_weighingWaste || 0), 0),
            totalQ: list.reduce((acc, r) => acc + (r.colQ_damageWaste || 0), 0),
            totalR: list.reduce((acc, r) => acc + (r.colR_cleaningWaste || 0), 0),
            totalS: list.reduce((acc, r) => acc + (r.colS_calculated || 0), 0),
            totalT: list.reduce((acc, r) => acc + (r.hasPhysicalCount && r.colT_physicalCount !== null ? r.colT_physicalCount : 0), 0),
            totalU: list.reduce((acc, r) => acc + (r.colU_bodegaPost10am || 0), 0),
            totalV: list.reduce((acc, r) => acc + (r.colV_missing || 0), 0),
            totalW: list.reduce((acc, r) => acc + (r.colW_surplus || 0), 0),
            totalX: list.reduce((acc, r) => acc + (r.colX_foodBank || 0), 0),
        };
    }, [filteredFamilies]);

    // Realizar Cierre Diario Oficial y Congelación Contable (SPEC.md v1.5.0)
    const handleOfficialClosing = async () => {
        if (dailyRows.length === 0) {
            notify('No hay datos en la sábana para cerrar la jornada.', 'warning');
            return;
        }

        try {
            setIsSubmittingClosing(true);

            const totalCalculated = dailyRows.reduce((acc, r) => acc + (r.colS_calculated || 0), 0);
            const totalPhysical = dailyRows.reduce((acc, r) => acc + (r.colT_physicalCount !== null ? r.colT_physicalCount : 0), 0);
            const totalMissing = dailyRows.reduce((acc, r) => acc + (r.colV_missing || 0), 0);
            const totalSurplus = dailyRows.reduce((acc, r) => acc + (r.colW_surplus || 0), 0);

            // Generar Snapshot inmutable de las 24 columnas
            const snapshotItems = dailyRows.map(r => ({
                productId: r.productId,
                sku: r.sku,
                accountingId: r.colB_idProducto,
                inventoryGroup: r.colC_inventoryGroup,
                productName: r.colD_productName,
                initialStock: r.colE_initialStock,
                corrections: r.colF_corrections,
                purchases: r.colG_purchases,
                salesKg: r.colH_salesKg,
                salesUnits: r.colI_salesUnits,
                weightSalesUnits: r.colJ_weightSalesUnits,
                shortage: r.colK_shortage,
                unshipped: r.colL_unshipped,
                additionalSales: r.colM_additionalSales,
                employeeSales: r.colN_employeeSales,
                returns: r.colO_returns,
                weighingWaste: r.colP_weighingWaste,
                damageWaste: r.colQ_damageWaste,
                cleaningWaste: r.colR_cleaningWaste,
                calculatedStock: r.colS_calculated,
                physicalCount: r.colT_physicalCount,
                bodegaPost10am: r.colU_bodegaPost10am,
                missing: r.colV_missing,
                surplus: r.colW_surplus,
                foodBank: r.colX_foodBank
            }));

            const { data, error } = await supabase
                .from('daily_inventory_closings')
                .upsert({
                    closing_date: balanceDate,
                    closed_at: new Date().toISOString(),
                    closed_by_name: 'Supervisor de Operaciones',
                    notes: closingNotes || 'Cierre oficial ejecutado desde la Sábana Diaria',
                    total_calculated: totalCalculated,
                    total_physical: totalPhysical,
                    total_missing: totalMissing,
                    total_surplus: totalSurplus,
                    is_locked: true,
                    snapshot_items: snapshotItems,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'closing_date' })
                .select()
                .single();

            if (error) throw error;

            setClosingRecord(data);
            setIsClosingModalOpen(false);
            setClosingNotes('');
            notify(`Jornada del ${balanceDate} cerrada oficialmente y congelada para contabilidad.`, 'success');
        } catch (err: any) {
            console.error('Error al realizar cierre oficial:', err);
            notify('Error al realizar cierre oficial: ' + (err.message || err), 'error');
        } finally {
            setIsSubmittingClosing(false);
        }
    };

    const handleReopenClosing = async () => {
        if (!confirm(`¿Estás seguro de reabrir la jornada contable del ${balanceDate}? Se desbloqueará la edición de registros para esta fecha.`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('daily_inventory_closings')
                .update({
                    is_locked: false,
                    notes: `${closingRecord?.notes || ''} | Reabierto el ${new Date().toLocaleString()}`,
                    updated_at: new Date().toISOString()
                })
                .eq('closing_date', balanceDate);

            if (error) throw error;

            setClosingRecord(prev => prev ? { ...prev, is_locked: false } : null);
            notify(`Jornada del ${balanceDate} reabierta exitosamente.`, 'success');
        } catch (err: any) {
            console.error('Error al reabrir jornada:', err);
            notify('Error al reabrir jornada: ' + (err.message || err), 'error');
        }
    };

    // Exportador XLSX exacto de las 24 columnas con FÓRMULAS NATIVAS de Excel y Jerarquía (SPEC.md v1.5.0)
    const handleExportOfficialExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const rowsForExcel: any[] = [];

            filteredFamilies.forEach(f => {
                const p = f.parent;
                const rowObj = f.isParent ? f.consolidated : p;

                rowsForExcel.push({
                    'Fecha inventario': p.colA_date,
                    'idProducto': p.colB_idProducto,
                    'Lista de Inventario': p.colC_inventoryGroup,
                    'Tipo Registro': f.isParent ? 'Familia' : 'Estándar',
                    'Producto': f.isParent ? `${p.colD_productName} (Consolidado)` : p.colD_productName,
                    'Inventario inicial': Number(rowObj.colE_initialStock.toFixed(2)),
                    'Corrección de inventario': Number(rowObj.colF_corrections.toFixed(2)),
                    'Compra del día': Number(rowObj.colG_purchases.toFixed(2)),
                    'Venta del día (KG)': Number(rowObj.colH_salesKg.toFixed(2)),
                    'Venta del día (UN)': rowObj.colI_salesUnits > 0 ? Number(rowObj.colI_salesUnits.toFixed(0)) : 0,
                    'Peso Venta UN': Number(rowObj.colJ_weightSalesUnits.toFixed(2)),
                    'Producto escaso': Number(rowObj.colK_shortage.toFixed(2)),
                    'Producto sin enviar': Number(rowObj.colL_unshipped.toFixed(2)),
                    'Venta adicional cliente': Number(rowObj.colM_additionalSales.toFixed(2)),
                    'Venta adicional empleado': Number(rowObj.colN_employeeSales.toFixed(2)),
                    'Devoluciones': Number(rowObj.colO_returns.toFixed(2)),
                    'Pesada': Number(rowObj.colP_weighingWaste.toFixed(2)),
                    'Desperdicio': Number(rowObj.colQ_damageWaste.toFixed(2)),
                    'Basura': Number(rowObj.colR_cleaningWaste.toFixed(2)),
                    'Inventario calculado': Number(rowObj.colS_calculated.toFixed(2)),
                    'Inventario agregado bodega': rowObj.colT_physicalCount !== null ? Number(rowObj.colT_physicalCount.toFixed(2)) : '',
                    'Inventario bodega': rowObj.colU_bodegaPost10am !== null ? Number(rowObj.colU_bodegaPost10am.toFixed(2)) : '',
                    'Faltantes': rowObj.colV_missing > 0 ? Number(rowObj.colV_missing.toFixed(2)) : 0,
                    'Sobrantes': rowObj.colW_surplus > 0 ? Number(rowObj.colW_surplus.toFixed(2)) : 0,
                    'Banco de alimentos': Number(rowObj.colX_foodBank.toFixed(2))
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
                            'Venta del día (UN)': ch.colI_salesUnits > 0 ? Number(ch.colI_salesUnits.toFixed(0)) : 0,
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
                            'Faltantes': ch.colV_missing > 0 ? Number(ch.colV_missing.toFixed(2)) : 0,
                            'Sobrantes': ch.colW_surplus > 0 ? Number(ch.colW_surplus.toFixed(2)) : 0,
                            'Banco de alimentos': Number(ch.colX_foodBank.toFixed(2))
                        });
                    });
                }
            });

            const ws = XLSX.utils.json_to_sheet(rowsForExcel);

            // Inyectar Fórmulas Nativas de Excel fila por fila (Row 2 a Row N)
            for (let i = 0; i < rowsForExcel.length; i++) {
                const rNum = i + 2; // Fila 1 es cabecera (1-indexed)
                
                // Col T: Inventario Calculado
                // T = F + G + H - I - K - L + M - N - O + P - Q - R - S
                const calcFormula = `F${rNum}+G${rNum}+H${rNum}-I${rNum}-K${rNum}-L${rNum}+M${rNum}-N${rNum}-O${rNum}+P${rNum}-Q${rNum}-R${rNum}-S${rNum}`;
                ws[`T${rNum}`] = { t: 'n', f: calcFormula, v: rowsForExcel[i]['Inventario calculado'] };

                // Col V: Bodega Post-10 AM (U + P)
                const post10Formula = `IF(OR(ISBLANK(U${rNum}), U${rNum}=""), "", U${rNum}+P${rNum})`;
                ws[`V${rNum}`] = { t: 'n', f: post10Formula, v: rowsForExcel[i]['Inventario bodega'] };

                // Col W: Faltantes (Si U < T => T - U)
                const missingFormula = `IF(OR(ISBLANK(U${rNum}), U${rNum}=""), 0, IF(U${rNum}<T${rNum}, T${rNum}-U${rNum}, 0))`;
                ws[`W${rNum}`] = { t: 'n', f: missingFormula, v: rowsForExcel[i]['Faltantes'] };

                // Col X: Sobrantes (Si U > T => U - T)
                const surplusFormula = `IF(OR(ISBLANK(U${rNum}), U${rNum}=""), 0, IF(U${rNum}>T${rNum}, U${rNum}-T${rNum}, 0))`;
                ws[`X${rNum}`] = { t: 'n', f: surplusFormula, v: rowsForExcel[i]['Sobrantes'] };
            }

            // Agregar Fila de Totales Matemáticos al pie
            const lastDataRow = rowsForExcel.length + 1;
            const totalRow = lastDataRow + 1;

            const formulaCols = ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y'];
            ws[`E${totalRow}`] = { t: 's', v: 'TOTALES GENERALES:' };
            formulaCols.forEach(c => {
                ws[`${c}${totalRow}`] = {
                    t: 'n',
                    f: `SUMIF(D2:D${lastDataRow}, "<>↳ Presentación", ${c}2:${c}${lastDataRow})`
                };
            });

            // Actualizar rango !ref
            ws['!ref'] = `A1:Y${totalRow}`;

            // Anchos de columna optimizados
            ws['!cols'] = [
                { wch: 14 }, // A Fecha
                { wch: 12 }, // B idProducto
                { wch: 28 }, // C Lista de Inventario
                { wch: 16 }, // D Tipo Registro
                { wch: 34 }, // E Producto
                { wch: 16 }, // F Inicial
                { wch: 18 }, // G Corrección
                { wch: 15 }, // H Compras
                { wch: 16 }, // I Venta KG
                { wch: 15 }, // J Venta UN
                { wch: 15 }, // K Peso UN
                { wch: 15 }, // L Escaso
                { wch: 17 }, // M Sin Enviar
                { wch: 18 }, // N Venta Adic Cliente
                { wch: 18 }, // O Venta Adic Empleado
                { wch: 14 }, // P Devoluciones
                { wch: 12 }, // Q Pesada
                { wch: 14 }, // R Desperdicio
                { wch: 12 }, // S Basura
                { wch: 18 }, // T Calculado
                { wch: 20 }, // U Agregado Bodega
                { wch: 16 }, // V Bodega Post-10
                { wch: 14 }, // W Faltantes
                { wch: 14 }, // X Sobrantes
                { wch: 16 }  // Y Banco Alimentos
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Balance_Diario_24Col');
            XLSX.writeFile(wb, `Balance_Diario_FruFresco_24Col_${balanceDate}.xlsx`);
            notify('Reporte Excel oficial con fórmulas descargado con éxito', 'success');
        } catch (err: any) {
            console.error('Error exportando Excel con fórmulas:', err);
            notify('Error al exportar reporte: ' + err.message, 'error');
        }
    };

    // Helper de parseo numérico con norma colombiana (punto = miles, coma = decimales)
    const parseColombianInput = (val: string): number => {
        const trimmed = val.trim();
        if (!trimmed) return 0;
        if (trimmed.includes(',')) {
            const normalized = trimmed.replace(/\./g, '').replace(',', '.');
            const parsed = parseFloat(normalized);
            return isNaN(parsed) ? 0 : parsed;
        }
        if (trimmed.includes('.')) {
            const parts = trimmed.split('.');
            if (parts.length > 2 || parts[1].length === 3) {
                const normalized = trimmed.replace(/\./g, '');
                const parsed = parseFloat(normalized);
                return isNaN(parsed) ? 0 : parsed;
            }
            const parsed = parseFloat(trimmed);
            return isNaN(parsed) ? 0 : parsed;
        }
        const parsed = parseFloat(trimmed);
        return isNaN(parsed) ? 0 : parsed;
    };

    const numFormat = (n: number | null | undefined, decimals = 2) => {
        if (n === null || n === undefined || isNaN(n) || n === 0) return '-';
        return formatNumber(n, decimals);
    };

    const renderNumericCell = (n: number | null | undefined, decimals = 2, prefix = '') => {
        if (n === null || n === undefined || isNaN(n) || n === 0) {
            return <span style={{ color: '#CBD5E1', fontWeight: '400' }}>-</span>;
        }
        return (
            <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'monospace, sans-serif' }}>
                {prefix}{formatNumber(n, decimals)}
            </span>
        );
    };

    // Guardado de edición en celda estilo Excel (Idempotente y a prueba de acumulaciones erróneas)
    const handleCommitCellEdit = async () => {
        if (!editingCell || isSavingCell) return;
        const { productId, colKey, initialValue, currentValue } = editingCell;
        const newVal = parseColombianInput(currentValue);

        if (isNaN(newVal) || Math.abs(newVal - initialValue) < 0.0001) {
            setEditingCell(null);
            return;
        }

        setIsSavingCell(true);

        try {
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
            const warehouseId = whData?.id;
            const timestampIso = `${balanceDate}T12:00:00.000Z`;

            let movType: 'entry' | 'exit' | 'adjustment' = 'adjustment';
            let refType: string = INVENTORY_MOVEMENT_SUBTYPES.CORRECTION;
            let qty = newVal;
            let noteDesc = `[EDICIÓN MANUAL] Columna ${colKey}: ${formatNumber(newVal, 2)}`;

            if (colKey === 'E' || colKey === 'F') {
                movType = 'adjustment';
                refType = INVENTORY_MOVEMENT_SUBTYPES.CORRECTION;
                qty = newVal;
            } else if (colKey === 'G') {
                movType = 'entry';
                refType = 'purchase_reception';
                qty = newVal;
            } else if (colKey === 'H' || colKey === 'J') {
                movType = 'exit';
                refType = 'order_item';
                qty = -newVal;
            } else if (colKey === 'I') {
                movType = 'exit';
                refType = 'order_item';
                qty = -newVal;
                noteDesc = `[EDICIÓN MANUAL] Venta UN: ${newVal} un`;
            } else if (colKey === 'K') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.ORDER_SHORTAGE;
                qty = -newVal;
            } else if (colKey === 'L') {
                movType = 'entry';
                refType = INVENTORY_MOVEMENT_SUBTYPES.ORDER_UNSHIPPED;
                qty = newVal;
            } else if (colKey === 'M') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.ADDITIONAL_SALE;
                qty = -newVal;
            } else if (colKey === 'N') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE;
                qty = -newVal;
            } else if (colKey === 'O') {
                movType = 'entry';
                refType = 'route_return';
                qty = newVal;
            } else if (colKey === 'P') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.WASTE_WEIGHING;
                qty = -newVal;
            } else if (colKey === 'Q') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.WASTE_DAMAGE;
                qty = -newVal;
            } else if (colKey === 'R') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.WASTE_CLEANING;
                qty = -newVal;
            } else if (colKey === 'X') {
                movType = 'exit';
                refType = INVENTORY_MOVEMENT_SUBTYPES.FOOD_BANK;
                qty = -newVal;
            } else if (colKey === 'T') {
                movType = 'adjustment';
                refType = INVENTORY_MOVEMENT_SUBTYPES.BLIND_COUNT;
                qty = 0;
                noteDesc = `[EDICIÓN MANUAL] Cruce a ciegas fin de turno | Contado: ${formatNumber(newVal, 2)}`;
            }

            // Si el nuevo valor es 0, eliminar movimientos de esta columna para este producto y fecha
            if (Math.abs(newVal) < 0.0001) {
                const { error: delErr } = await supabase
                    .from('inventory_movements')
                    .delete()
                    .eq('product_id', productId)
                    .eq('reference_type', refType)
                    .gte('created_at', `${balanceDate}T00:00:00.000Z`)
                    .lte('created_at', `${balanceDate}T23:59:59.999Z`);

                if (delErr) throw delErr;

                // Actualizar estado local eliminando los movimientos
                setMovements(prev => prev.filter(m => {
                    const mDate = (m.created_at || '').split('T')[0];
                    return !(m.product_id === productId && m.reference_type === refType && mDate === balanceDate);
                }));

                (window as any).showToast?.(`Columna ${colKey} restablecida a 0,00`, 'info');
            } else {
                // Si el valor es > 0, buscar movimientos existentes para actualizar en lugar de acumular deltas
                const { data: existingMovs } = await supabase
                    .from('inventory_movements')
                    .select('id')
                    .eq('product_id', productId)
                    .eq('reference_type', refType)
                    .gte('created_at', `${balanceDate}T00:00:00.000Z`)
                    .lte('created_at', `${balanceDate}T23:59:59.999Z`);

                if (existingMovs && existingMovs.length > 0) {
                    const targetId = existingMovs[0].id;
                    const { data: updatedMov, error: updErr } = await supabase
                        .from('inventory_movements')
                        .update({
                            quantity: qty,
                            type: movType,
                            notes: noteDesc
                        })
                        .eq('id', targetId)
                        .select()
                        .single();

                    if (updErr) throw updErr;

                    // Si existían duplicados anteriores, eliminarlos
                    if (existingMovs.length > 1) {
                        const extraIds = existingMovs.slice(1).map(x => x.id);
                        await supabase.from('inventory_movements').delete().in('id', extraIds);
                    }

                    // Sincronizar estado local
                    setMovements(prev => {
                        const filtered = prev.filter(m => !existingMovs.slice(1).some(ex => ex.id === m.id));
                        return filtered.map(m => m.id === targetId ? (updatedMov as any) : m);
                    });
                } else {
                    // Insertar nuevo registro limpio
                    const { data: insertedMov, error: insErr } = await supabase
                        .from('inventory_movements')
                        .insert([{
                            product_id: productId,
                            warehouse_id: warehouseId,
                            quantity: qty,
                            type: movType,
                            reference_type: refType,
                            notes: noteDesc,
                            created_at: timestampIso
                        }])
                        .select()
                        .single();

                    if (insErr) throw insErr;

                    if (insertedMov) {
                        setMovements(prev => [insertedMov as any, ...prev]);
                    }
                }

                (window as any).showToast?.(`Columna ${colKey} actualizada a ${formatNumber(newVal, 2)}`, 'success');
            }
        } catch (err: any) {
            console.error('Error en edición de celda:', err);
            notify('Error al guardar cambio: ' + (err.message || 'Error desconocido'), 'error');
        } finally {
            setIsSavingCell(false);
            setEditingCell(null);
        }
    };

    // Renderizado de celda editable invisible estilo Excel
    const renderEditableCell = (
        productId: string,
        colKey: string,
        val: number | null,
        style: React.CSSProperties = {},
        decimals: number = 2,
        isReadonly: boolean = false,
        extraChildren?: React.ReactNode
    ) => {
        const isEditing = !isReadonly && editingCell?.productId === productId && editingCell?.colKey === colKey;

        if (isEditing) {
            return (
                <td style={{ ...style, padding: '2px 4px', textAlign: 'right' }}>
                    <input
                        type="text"
                        autoFocus
                        value={editingCell.currentValue}
                        onFocus={e => e.target.select()}
                        onChange={e => setEditingCell(prev => prev ? { ...prev, currentValue: e.target.value } : null)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') handleCommitCellEdit();
                            if (e.key === 'Escape') setEditingCell(null);
                            if (e.key === 'Tab') {
                                e.preventDefault();
                                handleCommitCellEdit();
                            }
                        }}
                        onBlur={handleCommitCellEdit}
                        style={{
                            width: '100%',
                            minWidth: '55px',
                            maxWidth: '85px',
                            padding: '2px 4px',
                            borderRadius: '4px',
                            border: '1.5px solid #0D7A57',
                            textAlign: 'right',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            fontFamily: 'monospace, sans-serif',
                            backgroundColor: '#FFFFFF',
                            color: '#0F172A',
                            outline: 'none',
                            boxShadow: '0 0 0 2px rgba(13, 122, 87, 0.25)'
                        }}
                    />
                </td>
            );
        }

        return (
            <td
                onClick={() => {
                    if (closingRecord?.is_locked) {
                        notify(`La jornada del ${balanceDate} está cerrada y congelada oficialmente. Para modificar registros debes reabrir la jornada contable.`, 'warning');
                        return;
                    }
                    if (!isReadonly) {
                        setEditingCell({
                            productId,
                            colKey,
                            initialValue: val || 0,
                            currentValue: (val === null || val === 0) ? '' : formatNumber(val, decimals)
                        });
                    }
                }}
                style={{
                    ...style,
                    cursor: isReadonly ? 'default' : 'pointer',
                    userSelect: 'none'
                }}
                title={isReadonly ? undefined : 'Clic para editar este valor'}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                    {val !== null ? renderNumericCell(val, decimals) : <span style={{ color: '#94A3B8', fontWeight: '600' }}>-</span>}
                    {extraChildren}
                </div>
            </td>
        );
    };

    // Función unificada para renderizar cada fila de la sábana de 24 columnas
    const renderRow = (
        row: InventoryDailyRow,
        key: string,
        opts: {
            isChild?: boolean;
            isBaseChild?: boolean;
            isParent?: boolean;
            isCollapsed?: boolean;
            onToggle?: () => void;
            childCount?: number;
            isAlternate?: boolean;
            isConsolidatedSummary?: boolean;
        } = {}
    ) => {
        const { isChild = false, isBaseChild = false, isParent = false, isCollapsed = true, onToggle, childCount = 0, isAlternate = false } = opts;
        const cellInfo = cellByGroup.get((row.colC_inventoryGroup || '').toUpperCase());
        const rowBg = isParent 
            ? '#FEF9C3' // Amarillo cálido idéntico al Excel oficial (#FFFF00)
            : (isChild ? (isAlternate ? '#FBFDFF' : '#FFFFFF') : (isAlternate ? '#F8FAFC' : '#FFFFFF'));

        const cellBorderBottom = isParent ? '2px solid #FACC15' : (isChild ? '1px solid #F1F5F9' : '1px solid #E2E8F0');

        return (
            <tr
                key={key}
                style={{
                    backgroundColor: rowBg,
                    borderBottom: cellBorderBottom,
                    borderTop: isParent ? '2px solid #FACC15' : undefined,
                    borderLeft: isParent ? '4px solid #EAB308' : (isChild ? '4px solid #CBD5E1' : 'none'),
                    boxShadow: isParent && !isCollapsed ? '0 2px 6px -1px rgba(234, 179, 8, 0.25)' : undefined,
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
                        borderBottom: cellBorderBottom,
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
                                                background: isCollapsed ? '#FEF08A' : '#EAB308',
                                                border: isCollapsed ? '1px solid #FDE047' : '1px solid #CA8A04',
                                                cursor: 'pointer',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                                color: isCollapsed ? '#854D0E' : '#FFFFFF',
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
                                            fontWeight: isParent ? '900' : isChild ? '600' : '700', 
                                            color: isParent ? '#854D0E' : isChild ? '#334155' : '#0F172A',
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
                                    <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                                        <div style={{
                                            fontSize: '0.58rem',
                                            fontWeight: '700',
                                            padding: '1px 4px',
                                            borderRadius: '3px',
                                            backgroundColor: '#4F46E5',
                                            color: 'white',
                                            display: 'inline-flex',
                                            minWidth: '14px',
                                            justifyContent: 'center',
                                            lineHeight: '1.2'
                                        }} title="Producto Padre (Cabeza de Familia)">
                                            P
                                        </div>
                                        <span style={{ fontSize: '0.58rem', fontWeight: '800', color: '#854D0E', backgroundColor: '#FEF08A', border: '1px solid #FDE047', padding: '1px 5px', borderRadius: '4px' }}>
                                            FAMILIA
                                        </span>
                                    </div>
                                ) : isChild ? (
                                    <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                                        <div style={{
                                            fontSize: '0.58rem',
                                            fontWeight: '700',
                                            padding: '1px 4px',
                                            borderRadius: '3px',
                                            backgroundColor: '#0D7A57',
                                            color: 'white',
                                            display: 'inline-flex',
                                            minWidth: '14px',
                                            justifyContent: 'center',
                                            lineHeight: '1.2'
                                        }} title={isBaseChild ? "Producto Hijo / SKU Base de la Familia" : "Producto Hijo / SKU Fraccionado"}>
                                            H
                                        </div>
                                        {row.unit_of_measure ? (
                                            <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>
                                                {row.unit_of_measure}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center', flexShrink: 0 }}>
                                        {row.isP && (
                                            <div style={{
                                                fontSize: '0.58rem',
                                                fontWeight: '700',
                                                padding: '1px 4px',
                                                borderRadius: '3px',
                                                backgroundColor: '#4F46E5',
                                                color: 'white',
                                                display: 'inline-flex',
                                                minWidth: '14px',
                                                justifyContent: 'center',
                                                lineHeight: '1.2'
                                            }} title="Producto Padre">
                                                P
                                            </div>
                                        )}
                                        {row.isH && (
                                            <div style={{
                                                fontSize: '0.58rem',
                                                fontWeight: '700',
                                                padding: '1px 4px',
                                                borderRadius: '3px',
                                                backgroundColor: '#0D7A57',
                                                color: 'white',
                                                display: 'inline-flex',
                                                minWidth: '14px',
                                                justifyContent: 'center',
                                                lineHeight: '1.2'
                                            }} title="Producto Hijo">
                                                H
                                            </div>
                                        )}
                                        {row.unit_of_measure ? (
                                            <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>
                                                {row.unit_of_measure}
                                            </span>
                                        ) : null}
                                    </div>
                                )}
                            </div>

                            {/* Fila 2: ID + Célula con icono Lucide */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.66rem' }}>
                                <span style={{ 
                                    backgroundColor: isParent ? '#FEF08A' : (isChild ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)'), 
                                    color: isParent ? '#854D0E' : (isChild ? '#64748B' : '#0F172A'),
                                    border: isParent ? '1px solid #FDE047' : undefined,
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
                            color: isParent ? '#854D0E' : (isChild ? '#94A3B8' : '#64748B'), 
                            fontSize: '0.72rem',
                            fontWeight: isParent ? '800' : 'normal',
                            position: 'sticky',
                            left: 0,
                            zIndex: 10,
                            backgroundColor: rowBg,
                            borderBottom: cellBorderBottom
                        }}>
                            {row.colA_date}
                        </td>

                        {/* B: ID Prod (Sticky) */}
                        <td style={{ 
                            padding: '6px 8px', 
                            textAlign: 'center', 
                            fontWeight: '800', 
                            color: isParent ? '#854D0E' : '#1E293B',
                            position: 'sticky',
                            left: '85px',
                            zIndex: 10,
                            backgroundColor: rowBg,
                            borderBottom: cellBorderBottom
                        }}>
                            <span style={{ 
                                backgroundColor: isParent ? '#FEF08A' : (isChild ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.06)'), 
                                color: isParent ? '#854D0E' : (isChild ? '#64748B' : '#0F172A'),
                                border: isParent ? '1px solid #FDE047' : undefined,
                                padding: '2px 5px', 
                                borderRadius: '4px',
                                fontSize: '0.7rem'
                            }}>
                                #{row.colB_idProducto}
                            </span>
                        </td>

                        {/* C: Célula / Lista (Sticky - Colapsable a Icono + Inicial) */}
                        <td 
                            title={isCellCollapsed ? (cellInfo ? `Célula: ${cellInfo.name || cellInfo.short_name}` : `Célula: ${row.colC_inventoryGroup}`) : undefined}
                            style={{ 
                                padding: isCellCollapsed ? '6px 4px' : '6px 8px', 
                                textAlign: isCellCollapsed ? 'center' : 'left', 
                                position: 'sticky', 
                                left: '155px', 
                                zIndex: 10, 
                                backgroundColor: rowBg, 
                                borderBottom: cellBorderBottom,
                                width: isCellCollapsed ? '44px' : '130px', 
                                minWidth: isCellCollapsed ? '44px' : '130px', 
                                maxWidth: isCellCollapsed ? '44px' : '130px', 
                                transition: 'width 0.2s ease, min-width 0.2s ease, padding 0.2s ease'
                            }}
                        >
                            {cellInfo ? (
                                <span style={{
                                    backgroundColor: cellInfo.badge_bg || '#FEF3C7',
                                    color: cellInfo.badge_text || '#92400E',
                                    padding: isCellCollapsed ? '2px 4px' : '2px 6px',
                                    borderRadius: '5px',
                                    fontSize: '0.67rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: isCellCollapsed ? '3px' : '4px',
                                    boxShadow: isCellCollapsed ? '0 1px 2px rgba(0,0,0,0.04)' : undefined
                                }}>
                                    {renderCellLucideIcon(cellInfo, 11)}
                                    {isCellCollapsed ? (
                                        <span style={{ fontSize: '0.66rem', fontWeight: '900' }}>
                                            {(cellInfo.short_name || cellInfo.name || 'G').charAt(0).toUpperCase()}
                                        </span>
                                    ) : (
                                        <span>{cellInfo.short_name || cellInfo.name}</span>
                                    )}
                                </span>
                            ) : (
                                <span style={{ 
                                    color: '#64748B', 
                                    fontSize: isCellCollapsed ? '0.66rem' : '0.7rem',
                                    fontWeight: isCellCollapsed ? '800' : 'normal',
                                    backgroundColor: isCellCollapsed ? 'rgba(0,0,0,0.04)' : undefined,
                                    padding: isCellCollapsed ? '2px 4px' : undefined,
                                    borderRadius: isCellCollapsed ? '4px' : undefined,
                                    display: isCellCollapsed ? 'inline-block' : undefined
                                }}>
                                    {isCellCollapsed 
                                        ? (row.colC_inventoryGroup || 'G').charAt(0).toUpperCase()
                                        : row.colC_inventoryGroup
                                    }
                                </span>
                            )}
                        </td>

                        {/* D: Producto (Sticky) */}
                        <td style={{ 
                            padding: '6px 10px', 
                            fontWeight: isParent ? '800' : '700', 
                            color: isParent ? '#854D0E' : '#0F172A', 
                            borderRight: '2px solid #CBD5E1',
                            borderBottom: cellBorderBottom,
                            position: 'sticky', 
                            left: isCellCollapsed ? '199px' : '285px', 
                            zIndex: 10, 
                            backgroundColor: rowBg, 
                            boxShadow: '4px 0 10px -2px rgba(0,0,0,0.06)', 
                            transition: 'left 0.2s ease'
                        }}>
                            {isParent ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        type="button"
                                        onClick={onToggle}
                                        style={{
                                            background: isCollapsed ? '#FEF08A' : '#EAB308',
                                            border: isCollapsed ? '1px solid #FDE047' : '1px solid #CA8A04',
                                            cursor: 'pointer',
                                            padding: '2px 6px',
                                            borderRadius: '5px',
                                            color: isCollapsed ? '#854D0E' : '#FFFFFF',
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
                                    <span style={{ fontWeight: '900', color: '#854D0E', fontSize: '0.8rem' }}>{row.colD_productName}</span>
                                    
                                    <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
                                        <div style={{
                                            fontSize: '0.6rem',
                                            fontWeight: '700',
                                            padding: '1px 5px',
                                            borderRadius: '3px',
                                            backgroundColor: '#4F46E5',
                                            color: 'white',
                                            display: 'inline-flex',
                                            minWidth: '15px',
                                            justifyContent: 'center',
                                            lineHeight: '1.2'
                                        }} title="Producto Padre (Cabeza de Familia)">
                                            P
                                        </div>
                                        <span style={{ 
                                            fontSize: '0.6rem', 
                                            fontWeight: '800', 
                                            color: '#854D0E', 
                                            backgroundColor: '#FEF08A', 
                                            border: '1px solid #FDE047', 
                                            padding: '1px 5px', 
                                            borderRadius: '4px', 
                                            letterSpacing: '0.04em' 
                                        }}>
                                            FAMILIA
                                        </span>
                                    </div>
                                </div>
                            ) : isChild ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', paddingLeft: '18px' }}>
                                    <span style={{ color: '#94A3B8', fontWeight: '900', fontSize: '0.75rem' }}>↳</span>
                                    <span style={{ fontWeight: '600', color: '#334155' }}>{row.colD_productName}</span>
                                    <div style={{
                                        fontSize: '0.6rem',
                                        fontWeight: '700',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                        backgroundColor: '#0D7A57',
                                        color: 'white',
                                        display: 'inline-flex',
                                        minWidth: '15px',
                                        justifyContent: 'center',
                                        lineHeight: '1.2'
                                    }} title={isBaseChild ? "Producto Hijo / SKU Base de la Familia" : "Producto Hijo / SKU Fraccionado"}>
                                        H
                                    </div>
                                    <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px' }}>
                                        {row.unit_of_measure}
                                    </span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <span style={{ fontWeight: '800' }}>{row.colD_productName}</span>
                                    {row.isP && (
                                        <div style={{
                                            fontSize: '0.6rem',
                                            fontWeight: '700',
                                            padding: '1px 5px',
                                            borderRadius: '3px',
                                            backgroundColor: '#4F46E5',
                                            color: 'white',
                                            display: 'inline-flex',
                                            minWidth: '15px',
                                            justifyContent: 'center',
                                            lineHeight: '1.2'
                                        }} title="Producto Padre">
                                            P
                                        </div>
                                    )}
                                    {row.isH && (
                                        <div style={{
                                            fontSize: '0.6rem',
                                            fontWeight: '700',
                                            padding: '1px 5px',
                                            borderRadius: '3px',
                                            backgroundColor: '#0D7A57',
                                            color: 'white',
                                            display: 'inline-flex',
                                            minWidth: '15px',
                                            justifyContent: 'center',
                                            lineHeight: '1.2'
                                        }} title="Producto Hijo">
                                            H
                                        </div>
                                    )}
                                    <span style={{ fontSize: '0.62rem', fontWeight: '700', color: '#64748B', backgroundColor: '#E2E8F0', padding: '1px 5px', borderRadius: '4px' }}>
                                        {row.unit_of_measure}
                                    </span>
                                </div>
                            )}
                        </td>
                    </>
                )}

                {/* E: Inventario Inicial (+) - Estrictamente de Solo Lectura (Heredado de Cierre D-1) */}
                <td style={{
                    width: '95px', minWidth: '95px', maxWidth: '95px',
                    padding: '4px 6px', textAlign: 'right',
                    fontWeight: isParent ? '800' : '700',
                    color: row.colE_initialStock > 0 ? (isParent ? '#065F46' : '#0D7A57') : '#94A3B8',
                    borderBottom: cellBorderBottom,
                    backgroundColor: 'transparent'
                }} title="Inventario Inicial oficial heredado (Solo Lectura. Para ajustes use Col F Corrección)">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {renderNumericCell(row.colE_initialStock, 2)}
                    </div>
                </td>

                {/* F: Corrección (±) */}
                {renderEditableCell(row.productId, 'F', row.colF_corrections, {
                    width: '95px', minWidth: '95px', maxWidth: '95px',
                    padding: '4px 6px',
                    textAlign: 'right',
                    fontWeight: isParent ? '800' : (row.colF_corrections !== 0 ? '700' : '400'),
                    color: row.colF_corrections > 0 ? '#059669' : row.colF_corrections < 0 ? '#DC2626' : '#94A3B8',
                    borderBottom: cellBorderBottom
                }, 2)}

                {/* G: Compra del Día (+) */}
                {renderEditableCell(row.productId, 'G', row.colG_purchases, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: isParent ? '800' : '700', color: row.colG_purchases > 0 ? '#0F172A' : '#94A3B8', borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2)}

                {/* H: Venta del Día KG (-) */}
                {renderEditableCell(row.productId, 'H', row.colH_salesKg, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colH_salesKg > 0 ? '#1E40AF' : '#94A3B8', fontWeight: isParent ? '800' : '700', borderBottom: cellBorderBottom }, 2)}

                {/* I: Venta del Día UN (Informativo) */}
                {renderEditableCell(row.productId, 'I', row.colI_salesUnits, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: '#64748B', fontWeight: isParent ? '700' : '400', borderBottom: cellBorderBottom }, 0)}

                {/* J: Peso Venta UN (-) */}
                {renderEditableCell(row.productId, 'J', row.colJ_weightSalesUnits, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colJ_weightSalesUnits > 0 ? '#1E40AF' : '#94A3B8', fontWeight: isParent ? '800' : '400', borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2)}

                {/* K: Producto Escaso (-) */}
                {renderEditableCell(row.productId, 'K', row.colK_shortage, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colK_shortage > 0 ? '#DC2626' : '#94A3B8', fontWeight: isParent ? '800' : (row.colK_shortage > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2)}

                {/* L: Producto Sin Enviar (+) */}
                {renderEditableCell(row.productId, 'L', row.colL_unshipped, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colL_unshipped > 0 ? '#059669' : '#94A3B8', fontWeight: isParent ? '800' : '400', borderBottom: cellBorderBottom }, 2)}

                {/* M: Venta Adicional Cliente (-) */}
                {renderEditableCell(row.productId, 'M', row.colM_additionalSales, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colM_additionalSales > 0 ? '#7E22CE' : '#94A3B8', fontWeight: isParent ? '800' : (row.colM_additionalSales > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2)}

                {/* N: Venta Adicional Empleado (-) */}
                {renderEditableCell(row.productId, 'N', row.colN_employeeSales, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colN_employeeSales > 0 ? '#2563EB' : '#94A3B8', fontWeight: isParent ? '800' : (row.colN_employeeSales > 0 ? '700' : '400'), borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2)}

                {/* O: Devoluciones (+) */}
                {renderEditableCell(row.productId, 'O', row.colO_returns, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colO_returns > 0 ? '#D97706' : '#94A3B8', fontWeight: isParent ? '800' : (row.colO_returns > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2)}

                {/* P: Pesada (-) */}
                {renderEditableCell(row.productId, 'P', row.colP_weighingWaste, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colP_weighingWaste > 0 ? '#D97706' : '#94A3B8', fontWeight: isParent ? '800' : (row.colP_weighingWaste > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2)}

                {/* Q: Desperdicio (-) */}
                {renderEditableCell(row.productId, 'Q', row.colQ_damageWaste, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colQ_damageWaste > 0 ? '#DC2626' : '#94A3B8', fontWeight: isParent ? '800' : (row.colQ_damageWaste > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2, false,
                    row.evidencePhotosQ?.length > 0 ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewImageUrl(row.evidencePhotosQ[0]); }}
                            title="Ver evidencia fotográfica"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#DC2626' }}
                        >
                            <Camera size={12} />
                        </button>
                    ) : null
                )}

                {/* R: Basura (-) */}
                {renderEditableCell(row.productId, 'R', row.colR_cleaningWaste, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colR_cleaningWaste > 0 ? '#B45309' : '#94A3B8', fontWeight: isParent ? '800' : (row.colR_cleaningWaste > 0 ? '700' : '400'), borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2, false,
                    row.evidencePhotosR?.length > 0 ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewImageUrl(row.evidencePhotosR[0]); }}
                            title="Ver evidencia de limpieza"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#B45309' }}
                        >
                            <Camera size={12} />
                        </button>
                    ) : null
                )}

                {/* S: Inventario Calculado (RESALTADO GLASSMORPHISM RESULTADO) */}
                <td style={{ 
                    padding: '6px 8px', 
                    textAlign: 'right', 
                    fontWeight: '900', 
                    width: '95px',
                    minWidth: '95px',
                    maxWidth: '95px',
                    color: isParent ? '#064E3B' : '#0F172A', 
                    backgroundColor: isParent ? 'rgba(13, 148, 136, 0.18)' : (isChild ? 'rgba(13, 148, 136, 0.05)' : 'rgba(13, 148, 136, 0.08)'),
                    borderLeft: '2px solid #0D9488',
                    borderRight: '2px solid #0D9488',
                    borderBottom: cellBorderBottom,
                    boxShadow: isParent ? 'inset 0 0 0 1px rgba(13, 148, 136, 0.3)' : undefined,
                    fontFamily: 'monospace, sans-serif'
                }}>
                    {renderNumericCell(row.colS_calculated)}
                </td>

                {/* T: Conteo Físico Real */}
                {renderEditableCell(row.productId, 'T', row.colT_physicalCount, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.hasPhysicalCount ? '#0D7A57' : '#94A3B8', backgroundColor: isParent ? (isCollapsed ? '#F1F5F9' : '#E0E7FF') : (isChild ? '#FFFFFF' : '#F8FAFC'), borderBottom: cellBorderBottom }, 2)}

                {/* U: Bodega Post-10 AM */}
                <td style={{ width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: isParent ? '#1E1B4B' : '#0F172A', backgroundColor: isParent ? (isCollapsed ? '#F1F5F9' : '#E0E7FF') : (isChild ? '#FFFFFF' : '#F8FAFC'), borderRight: '2px solid #CBD5E1', borderBottom: cellBorderBottom }}>
                    {row.colU_bodegaPost10am !== null ? renderNumericCell(row.colU_bodegaPost10am) : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* V: Faltantes */}
                <td style={{ width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.colV_missing > 0 ? '#DC2626' : '#94A3B8', borderBottom: cellBorderBottom }}>
                    {row.colV_missing > 0 ? renderNumericCell(row.colV_missing) : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* W: Sobrantes */}
                <td style={{ width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.colW_surplus > 0 ? '#059669' : '#94A3B8', borderRight: '2px solid #CBD5E1', borderBottom: cellBorderBottom }}>
                    {row.colW_surplus > 0 ? renderNumericCell(row.colW_surplus) : <span style={{ color: '#CBD5E1' }}>-</span>}
                </td>

                {/* X: Banco de Alimentos */}
                {renderEditableCell(row.productId, 'X', row.colX_foodBank, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colX_foodBank > 0 ? '#EC4899' : '#94A3B8', fontWeight: isParent ? '800' : (row.colX_foodBank > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2, false,
                    row.evidencePhotosX?.length > 0 ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPreviewImageUrl(row.evidencePhotosX[0]); }}
                            title="Ver evidencia banco alimentos"
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, color: '#EC4899' }}
                        >
                            <Camera size={12} />
                        </button>
                    ) : null
                )}
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

            {/* Notificación Toast Corporativa Accesible */}
            {toast && (
                <div style={{
                    position: 'fixed',
                    bottom: '24px',
                    right: '24px',
                    zIndex: 9999,
                    backgroundColor: toast.type === 'error' ? '#FEF2F2' : toast.type === 'warning' ? '#FFFBEB' : '#F0FDF4',
                    border: `1.5px solid ${toast.type === 'error' ? '#EF4444' : toast.type === 'warning' ? '#F59E0B' : '#10B981'}`,
                    color: toast.type === 'error' ? '#991B1B' : toast.type === 'warning' ? '#92400E' : '#065F46',
                    padding: '0.75rem 1.25rem',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.12), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontWeight: '700',
                    fontSize: '0.85rem'
                }}>
                    {toast.type === 'error' ? <AlertTriangle size={18} color="#EF4444" /> : toast.type === 'warning' ? <AlertTriangle size={18} color="#F59E0B" /> : <CheckCircle2 size={18} color="#10B981" />}
                    <span>{toast.message}</span>
                    <button
                        type="button"
                        onClick={() => setToast(null)}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: 'inherit', marginLeft: '6px' }}
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

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
                        {formatNumber(kpis.totalEntradas, 1)} <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>kg in</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                        Salidas: <b style={{ color: '#1A231E' }}>{formatNumber(kpis.totalSalidas, 1)} kg</b>
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
                        {formatNumber(kpis.wastePercent, 2)}%
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                        Total: <b style={{ color: '#1A231E' }}>{formatNumber(kpis.totalWasteKg, 1)} kg</b>
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
                        -{formatNumber(kpis.totalMissingKg, 1)} <span style={{ fontSize: '0.68rem', fontWeight: '700' }}>kg</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#DC2626', marginTop: '1px', fontWeight: '800' }}>
                        ${formatNumber(Math.round(kpis.totalMissingVal), 0)}
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
                        +{formatNumber(kpis.totalSurplusKg, 1)} <span style={{ fontSize: '0.68rem', fontWeight: '700' }}>kg</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#059669', marginTop: '1px', fontWeight: '800' }}>
                        ${formatNumber(Math.round(kpis.totalSurplusVal), 0)}
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
                        ${formatNumber(Math.round(kpis.totalEmployeeSalesVal), 0)}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '1px' }}>
                        Volumen: <b style={{ color: '#1A231E' }}>{formatNumber(kpis.totalEmployeeSalesKg, 1)} kg</b>
                    </div>
                </div>
            </div>

            {/* 2. MASTER COMMAND CONSOLE: TOOLBAR ENTERPRISE UNIFICADA DE 2 NIVELES */}
            <div 
                ref={dockRef}
                style={{
                    position: 'sticky',
                    top: '80px',
                    zIndex: 70,
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    borderRadius: '14px',
                    border: '1px solid #E2E8F0',
                    padding: '0.55rem 0.85rem',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    marginBottom: '0.55rem',
                    transition: 'all 0.2s ease-in-out'
                }}
            >
                {/* FILA 1: CONTEXTO OPERATIVO, FILTRO DE MOVIMIENTO, BÚSQUEDA Y ACCIONES PRINCIPALES */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    flexWrap: 'nowrap'
                }}>
                    {/* IZQUIERDA: Selector Temporal + Célula + Toggle "Solo con Movimiento" */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                        {/* Selector de Fecha */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '2px 4px 2px 7px',
                            gap: '5px',
                            height: '32px',
                            boxSizing: 'border-box',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                            <Calendar size={13} color="#0D7A57" strokeWidth={2.2} />
                            <input
                                type="date"
                                value={balanceDate}
                                onChange={e => setBalanceDate(e.target.value)}
                                style={{
                                    padding: '0.15rem 0.2rem',
                                    borderRadius: '4px',
                                    border: 'none',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    color: '#0F172A',
                                    outline: 'none',
                                    backgroundColor: 'transparent',
                                    cursor: 'pointer'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setBalanceDate(todayStr)}
                                style={{
                                    padding: '0.2rem 0.45rem',
                                    borderRadius: '5px',
                                    border: 'none',
                                    backgroundColor: balanceDate === todayStr ? '#0D7A57' : '#FFFFFF',
                                    color: balanceDate === todayStr ? '#FFFFFF' : '#64748B',
                                    fontSize: '0.7rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    boxShadow: balanceDate === todayStr ? '0 1px 2px rgba(13, 122, 87, 0.3)' : '0 1px 2px rgba(0,0,0,0.05)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                Hoy
                            </button>
                        </div>

                        {/* Combobox de Célula */}
                        <div ref={cellComboboxRef} style={{ position: 'relative' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsCellComboboxOpen(prev => !prev);
                                    setCellComboboxSearch('');
                                }}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '0 0.65rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${selectedCell !== 'ALL' ? '#0D7A57' : '#CBD5E1'}`,
                                    backgroundColor: selectedCell !== 'ALL' ? '#EAEFEA' : '#FFFFFF',
                                    color: selectedCell !== 'ALL' ? '#0D7A57' : '#1E293B',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                    transition: 'all 0.2s',
                                    height: '32px',
                                    maxWidth: '180px'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#0D7A57'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = selectedCell !== 'ALL' ? '#0D7A57' : '#CBD5E1'}
                                title="Filtrar por Célula / Grupo de Inventario"
                            >
                                <span style={{ display: 'flex', alignItems: 'center' }}>
                                    {selectedCellOption.icon}
                                </span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedCellOption.label}
                                </span>
                                <ChevronsUpDown size={12} strokeWidth={2} style={{ opacity: 0.6, flexShrink: 0, marginLeft: '2px' }} />
                            </button>

                            {isCellComboboxOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: 'calc(100% + 4px)',
                                    left: 0,
                                    width: '260px',
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: '12px',
                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                                    border: '1px solid #E2E8F0',
                                    zIndex: 100,
                                    padding: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px'
                                }}>
                                    {/* Buscador interno del Combobox */}
                                    <div style={{ position: 'relative', padding: '2px 4px 6px 4px', borderBottom: '1px solid #E2E8F0' }}>
                                        <Search size={13} strokeWidth={2} style={{ position: 'absolute', left: '12px', top: '40%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                        <input
                                            type="text"
                                            placeholder="Buscar célula..."
                                            value={cellComboboxSearch}
                                            onChange={(e) => setCellComboboxSearch(e.target.value)}
                                            autoFocus
                                            style={{
                                                width: '100%',
                                                padding: '0.35rem 0.5rem 0.35rem 1.8rem',
                                                fontSize: '0.78rem',
                                                fontWeight: '500',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                outline: 'none',
                                                backgroundColor: '#F8FAF9',
                                                color: '#0F172A',
                                                boxSizing: 'border-box'
                                            }}
                                            onFocus={(e) => e.currentTarget.style.borderColor = '#0D7A57'}
                                            onBlur={(e) => e.currentTarget.style.borderColor = '#CBD5E1'}
                                        />
                                    </div>

                                    {/* Lista de opciones */}
                                    <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                        {filteredCellOptions.length === 0 ? (
                                            <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: '0.75rem', color: '#94A3B8' }}>
                                                No se encontraron células
                                            </div>
                                        ) : (
                                            filteredCellOptions.map((opt) => {
                                                const isSelected = selectedCell === opt.value;
                                                return (
                                                    <button
                                                        key={opt.value}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedCell(opt.value);
                                                            setIsCellComboboxOpen(false);
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '0.45rem 0.65rem',
                                                            borderRadius: '6px',
                                                            border: 'none',
                                                            backgroundColor: isSelected ? '#EAEFEA' : 'transparent',
                                                            color: isSelected ? '#0D7A57' : '#1E293B',
                                                            fontWeight: isSelected ? '700' : '500',
                                                            fontSize: '0.76rem',
                                                            cursor: 'pointer',
                                                            textAlign: 'left',
                                                            transition: 'all 0.12s ease',
                                                            width: '100%'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            if (!isSelected) e.currentTarget.style.backgroundColor = '#F1F5F9';
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                                            <span style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                                                {opt.icon}
                                                            </span>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {opt.label}
                                                            </span>
                                                        </div>
                                                        {isSelected && (
                                                            <Check size={14} strokeWidth={2.5} style={{ color: '#0D7A57', flexShrink: 0, marginLeft: '6px' }} />
                                                        )}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* SEGMENTED CONTROL: Solo con Movimiento vs Todos */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#F1F5F9',
                            borderRadius: '8px',
                            padding: '2px',
                            border: '1px solid #CBD5E1',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            height: '32px',
                            boxSizing: 'border-box'
                        }}>
                            <button
                                type="button"
                                onClick={() => setOnlyWithMovement(true)}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: onlyWithMovement ? '#0D7A57' : 'transparent',
                                    color: onlyWithMovement ? '#FFFFFF' : '#475569',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: onlyWithMovement ? '0 1px 3px rgba(13, 122, 87, 0.3)' : 'none'
                                }}
                                title="Mostrar exclusivamente familias y productos que registraron movimientos o existencias hoy (Col E a X)"
                            >
                                <Zap size={12} color={onlyWithMovement ? '#FCD34D' : '#0D7A57'} strokeWidth={2.5} />
                                <span>Con Movimiento</span>
                                <span style={{
                                    backgroundColor: onlyWithMovement ? 'rgba(255,255,255,0.22)' : '#E2E8F0',
                                    color: onlyWithMovement ? '#FFFFFF' : '#0F172A',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontSize: '0.64rem',
                                    fontWeight: '900'
                                }}>
                                    {countFamiliesWithMovement}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setOnlyWithMovement(false)}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: !onlyWithMovement ? '#FFFFFF' : 'transparent',
                                    color: !onlyWithMovement ? '#0F172A' : '#64748B',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: !onlyWithMovement ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                }}
                                title="Mostrar todo el catálogo de familias activas"
                            >
                                <span>Todos</span>
                                <span style={{
                                    backgroundColor: !onlyWithMovement ? '#F1F5F9' : '#E2E8F0',
                                    color: !onlyWithMovement ? '#0F172A' : '#64748B',
                                    padding: '1px 5px',
                                    borderRadius: '4px',
                                    fontSize: '0.64rem',
                                    fontWeight: '800'
                                }}>
                                    {dailyFamilies.length}
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* CENTRO: Buscador Inteligente Potenciado + Contador + Info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <div style={{ position: 'absolute', left: '0.65rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', display: 'flex', alignItems: 'center' }}>
                                <Search size={14} strokeWidth={1.8} />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar nombre, #ID, @tag..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.35rem 1.8rem 0.35rem 2rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem',
                                    fontWeight: '500',
                                    backgroundColor: '#F8FAF9',
                                    color: '#0F172A',
                                    outline: 'none',
                                    height: '32px',
                                    boxSizing: 'border-box',
                                    transition: 'all 0.2s'
                                }}
                                onFocus={(e) => {
                                    e.currentTarget.style.borderColor = '#0D7A57';
                                    e.currentTarget.style.backgroundColor = '#FFFFFF';
                                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(13, 122, 87, 0.15)';
                                }}
                                onBlur={(e) => {
                                    e.currentTarget.style.borderColor = '#CBD5E1';
                                    e.currentTarget.style.backgroundColor = '#F8FAF9';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    style={{
                                        position: 'absolute',
                                        right: '0.5rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#64748B',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '2px',
                                        borderRadius: '50%',
                                        backgroundColor: '#EAEFEA'
                                    }}
                                    title="Limpiar búsqueda"
                                >
                                    <X size={12} strokeWidth={2} />
                                </button>
                            )}
                        </div>

                        {/* Contador de Familias Filtradas + Botón Info FUSIONADOS */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            height: '32px',
                            backgroundColor: (searchQuery || selectedCell !== 'ALL') ? '#EAEFEA' : '#F8FAFC',
                            color: (searchQuery || selectedCell !== 'ALL') ? '#0D7A57' : '#64748B',
                            border: `1px solid ${(searchQuery || selectedCell !== 'ALL') ? '#0D7A57' : '#CBD5E1'}`,
                            borderRadius: '8px',
                            padding: '0 0 0 0.55rem',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            flexShrink: 0,
                            position: 'relative',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            transition: 'all 0.2s ease'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap', paddingRight: '0.35rem' }}>
                                {(searchQuery || selectedCell !== 'ALL') ? <Search size={12} strokeWidth={2} /> : <Database size={12} strokeWidth={2} />}
                                <span>
                                    <strong style={{ color: (searchQuery || selectedCell !== 'ALL') ? '#0D7A57' : '#0F172A' }}>{formatNumber(filteredFamilies.length)}</strong>
                                </span>
                            </div>

                            <div style={{ width: '1px', height: '16px', backgroundColor: (searchQuery || selectedCell !== 'ALL') ? '#A7D7C5' : '#E2E8F0' }} />

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowHelpTooltip(prev => !prev);
                                }}
                                style={{
                                    height: '100%',
                                    padding: '0 0.5rem',
                                    border: 'none',
                                    backgroundColor: showHelpTooltip ? '#0D7A57' : 'transparent',
                                    color: showHelpTooltip ? '#FFFFFF' : '#0D7A57',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderTopRightRadius: '7px',
                                    borderBottomRightRadius: '7px',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Ver guía de comandos (@ / #)"
                            >
                                <Info size={13} strokeWidth={2.2} />
                            </button>

                            {/* Dropdown del Tooltip con Backdrop */}
                            {showHelpTooltip && (
                                <>
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowHelpTooltip(false);
                                        }}
                                        style={{
                                            position: 'fixed',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            zIndex: 99998,
                                            cursor: 'default'
                                        }}
                                    />
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 6px)',
                                        right: '0',
                                        width: '340px',
                                        backgroundColor: '#111827',
                                        color: 'white',
                                        padding: '1.1rem',
                                        borderRadius: '14px',
                                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
                                        zIndex: 99999,
                                        fontSize: '0.78rem',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        lineHeight: '1.5',
                                        animation: 'fadeInDown 0.2s ease-out'
                                    }}>
                                        <div style={{ fontWeight: '800', color: '#10B981', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Dna size={14} strokeWidth={2} /> COMANDOS DE BÚSQUEDA (@ / #)
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 'normal' }}>Clic para aplicar</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 9px' }}>
                                            {[
                                                { tag: '@bajo', desc: 'Bajo stock / Faltante' },
                                                { tag: '@disponible', desc: 'Stock positivo' },
                                                { tag: '@agotado', desc: 'Sin stock' },
                                                { tag: '@sobrantes', desc: 'Con sobrantes (+)' },
                                                { tag: '@padre', desc: 'Familias / Cabezas' },
                                                { tag: '@hijo', desc: 'Presentaciones' },
                                                { tag: '@padrehijo', desc: 'Doble rol (P y H)' },
                                                { tag: '@fresas', desc: 'Fresas y Moras' },
                                                { tag: '@hortalizas', desc: 'Hortalizas' },
                                                { tag: '@verduras', desc: 'Verduras' },
                                                { tag: '@frutas', desc: 'Frutas y Otros' },
                                                { tag: '@papas', desc: 'Papas & Plátano' },
                                                { tag: '#ID', desc: 'ID Contable (#12)' }
                                            ].map((item, i) => (
                                                <div
                                                    key={i}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const cleanTag = item.tag === '#ID' ? '#' : item.tag;
                                                        setSearchQuery(prev => {
                                                            if (!prev) return cleanTag;
                                                            if (prev.toLowerCase().includes(cleanTag.toLowerCase())) return prev;
                                                            return `${prev}, ${cleanTag}`;
                                                        });
                                                    }}
                                                    style={{
                                                        cursor: 'pointer',
                                                        padding: '4px 6px',
                                                        borderRadius: '6px',
                                                        backgroundColor: 'rgba(255,255,255,0.05)',
                                                        transition: 'background 0.15s'
                                                    }}
                                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)')}
                                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)')}
                                                >
                                                    <b style={{ color: '#FCD34D' }}>{item.tag}</b>: {item.desc}
                                                </div>
                                            ))}
                                        </div>
                                        <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#94A3B8', fontStyle: 'italic', fontSize: '0.72rem' }}>
                                            Tip: Separa múltiples criterios con comas (,). Ej: <code>acelga, @bajo</code>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* DERECHA: Grupos de Acciones Operativas y Excel */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                        {/* Grupo 1: Registro de Novedades (Segmented Pill Group) */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#F1F5F9',
                            borderRadius: '8px',
                            padding: '2px',
                            border: '1px solid #CBD5E1',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            height: '32px',
                            boxSizing: 'border-box'
                        }}>
                            <button
                                type="button"
                                onClick={() => setIsWasteModalOpen(true)}
                                style={{
                                    padding: '0 0.65rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#0D7A57',
                                    color: '#FFFFFF',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: '0 1px 3px rgba(13, 122, 87, 0.3)'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#0A5F43')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#0D7A57')}
                                title="Registrar Merma / Novedad"
                            >
                                <Plus size={13} strokeWidth={2.5} />
                                <span>+ Merma</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsPayrollModalOpen(true)}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    color: '#334155',
                                    fontSize: '0.74rem',
                                    fontWeight: '700',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
                                title="Descuento de Nómina a Empleados (Columna N)"
                            >
                                <User size={13} color="#2563EB" strokeWidth={2} />
                                <span>Nómina</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsAdditionalSalesModalOpen(true)}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    color: '#334155',
                                    fontSize: '0.74rem',
                                    fontWeight: '700',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
                                title="Venta Extra / Mostrador (Columna M)"
                            >
                                <ShoppingCart size={13} color="#7E22CE" strokeWidth={2} />
                                <span>Extra</span>
                            </button>
                        </div>

                        {/* Grupo 0: Cierre Diario Oficial & Congelación Contable (SPEC.md v1.5.0) */}
                        {closingRecord?.is_locked ? (
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                backgroundColor: '#DCFCE7',
                                border: '1px solid #16A34A',
                                color: '#15803D',
                                padding: '0 0.6rem',
                                height: '32px',
                                borderRadius: '8px',
                                fontSize: '0.74rem',
                                fontWeight: '800'
                            }} title={`Cerrado oficialmente el ${new Date(closingRecord.closed_at).toLocaleString()} por ${closingRecord.closed_by_name || 'Supervisor'}`}>
                                <Lock size={13} strokeWidth={2.5} />
                                <span>Cerrado</span>
                                <button
                                    type="button"
                                    onClick={handleReopenClosing}
                                    style={{
                                        marginLeft: '3px',
                                        background: 'none',
                                        border: 'none',
                                        color: '#15803D',
                                        cursor: 'pointer',
                                        fontSize: '0.68rem',
                                        textDecoration: 'underline',
                                        fontWeight: 'bold',
                                        padding: '0'
                                    }}
                                    title="Reabrir jornada contable para permitir ajustes"
                                >
                                    (Reabrir)
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsClosingModalOpen(true)}
                                style={{
                                    padding: '0 0.65rem',
                                    height: '32px',
                                    borderRadius: '8px',
                                    border: '1px solid #15803D',
                                    backgroundColor: '#16A34A',
                                    color: '#FFFFFF',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#15803D'}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#16A34A'}
                                title="Realizar Cierre Diario Oficial y congelar balance contable"
                            >
                                <Lock size={13} strokeWidth={2.5} />
                                <span>Cierre Diario</span>
                            </button>
                        )}

                        {/* Grupo 2: Excel y Refrescar */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            backgroundColor: '#FFFFFF',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            padding: '2px',
                            gap: '2px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                            height: '32px',
                            boxSizing: 'border-box'
                        }}>
                            <button
                                type="button"
                                onClick={handleExportOfficialExcel}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#ECFDF5',
                                    color: '#0D7A57',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#D1FAE5')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ECFDF5')}
                                title="Descargar Balance Oficial en Excel (24 Columnas)"
                            >
                                <FileSpreadsheet size={13} color="#0D7A57" strokeWidth={2} />
                                <span>Excel</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setIsExcelImportModalOpen(true)}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: '#EFF6FF',
                                    color: '#1D4ED8',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#DBEAFE')}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                                title="Cargar / Simular Operación Diaria desde Excel (.xlsx)"
                            >
                                <Upload size={13} color="#1D4ED8" strokeWidth={2} />
                                <span>Cargar Excel</span>
                            </button>

                            <div style={{ width: '1px', height: '16px', backgroundColor: '#E2E8F0', margin: '0 1px' }} />

                            <button
                                type="button"
                                onClick={() => loadDailyData(true)}
                                title="Refrescar balance diario"
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: 'transparent',
                                    color: '#64748B',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
                            >
                                <RefreshCw size={13} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* BARRA DE FILTRO RÁPIDO POR CÉLULA DE TRABAJO (RESOLUCIÓN GRILL-ME / ACUERDO 1) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    overflowX: 'auto',
                    padding: '6px 0 3px 0',
                    scrollbarWidth: 'none',
                    borderTop: '1px solid #F1F5F9',
                    borderBottom: '1px solid #F1F5F9'
                }}>
                    {cellOptions.map(opt => {
                        const isSelected = selectedCell === opt.value;
                        const count = opt.value === 'ALL'
                            ? dailyFamilies.length
                            : dailyFamilies.filter(f => (f.consolidated.colC_inventoryGroup || '').toUpperCase().includes(opt.value.toUpperCase())).length;

                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setSelectedCell(opt.value)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 9px',
                                    borderRadius: '20px',
                                    border: isSelected ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                    backgroundColor: isSelected ? '#0D7A57' : '#FFFFFF',
                                    color: isSelected ? '#FFFFFF' : '#334155',
                                    fontSize: '0.73rem',
                                    fontWeight: isSelected ? '800' : '600',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    boxShadow: isSelected ? '0 2px 4px rgba(13, 122, 87, 0.2)' : '0 1px 2px rgba(0,0,0,0.02)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {opt.icon}
                                <span>{opt.label.replace(/\(\d+\)/, '')}</span>
                                <span style={{
                                    padding: '1px 5px',
                                    borderRadius: '10px',
                                    fontSize: '0.62rem',
                                    backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : '#F1F5F9',
                                    color: isSelected ? '#FFFFFF' : '#64748B',
                                    fontWeight: '800'
                                }}>
                                    {count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* FILA 2: CONTROLES DE VISTA Y NAVEGADOR DE 24 COLUMNAS (SALTAR A BLOQUE) */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.55rem',
                    flexWrap: 'nowrap'
                }}>
                    {/* IZQUIERDA: Herramientas de Árbol y Densidad */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                        {/* Toggle expandir / colapsar familias */}
                        <button
                            type="button"
                            onClick={toggleAllFamilies}
                            style={{
                                padding: '0 0.6rem',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#334155',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                flexShrink: 0,
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                            title={allCollapsed ? "Expandir todas las presentaciones hijas" : "Colapsar todas las familias a vista compacta"}
                        >
                            {allCollapsed ? <FolderPlus size={12} color="#0D7A57" strokeWidth={2.2} /> : <FolderMinus size={12} color="#D97706" strokeWidth={2.2} />}
                            <span>{allCollapsed ? "Expandir Todo" : "Colapsar Todo"}</span>
                        </button>

                        {/* Toggle Columnas A-D Compacto */}
                        <button
                            type="button"
                            onClick={() => setIsCompactIdentification(!isCompactIdentification)}
                            title={isCompactIdentification ? "Cambiar a vista de 4 columnas separadas (A: Fecha, B: ID, C: Célula, D: Producto)" : "Modo Compacto: Fusiona A-D en una sola columna de 220px (Ahorra hasta 170px para ver más datos)"}
                            style={{
                                padding: '0 0.55rem',
                                height: '28px',
                                borderRadius: '6px',
                                border: isCompactIdentification ? '1px solid #A7F3D0' : '1px solid #CBD5E1',
                                backgroundColor: isCompactIdentification ? '#ECFDF5' : '#FFFFFF',
                                color: isCompactIdentification ? '#0D7A57' : '#64748B',
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                flexShrink: 0
                            }}
                            onMouseEnter={e => { if (!isCompactIdentification) e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                            onMouseLeave={e => { if (!isCompactIdentification) e.currentTarget.style.backgroundColor = isCompactIdentification ? '#ECFDF5' : '#FFFFFF'; }}
                        >
                            <Columns size={12} color={isCompactIdentification ? '#0D7A57' : '#64748B'} strokeWidth={2.2} />
                            <span>{isCompactIdentification ? 'A-D Compacto' : 'Cols A-D'}</span>
                            {isCompactIdentification && (
                                <span style={{ fontSize: '0.58rem', backgroundColor: '#D1FAE5', color: '#065F46', padding: '1px 4px', borderRadius: '3px', fontWeight: '800' }}>
                                    -170px
                                </span>
                            )}
                        </button>

                        {!isCompactIdentification && (
                            <button
                                type="button"
                                onClick={() => setCellColumnMode(prev => (isCellCollapsed ? 'expanded' : 'collapsed'))}
                                title={isCellCollapsed ? "Célula colapsada a icono + inicial (ahorra 86px). Clic para expandir." : "Colapsar Célula a Icono + Inicial (ahorra 86px)"}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '28px',
                                    borderRadius: '6px',
                                    border: isCellCollapsed ? '1px solid #FDE68A' : '1px solid #CBD5E1',
                                    backgroundColor: isCellCollapsed ? '#FEF3C7' : '#FFFFFF',
                                    color: isCellCollapsed ? '#92400E' : '#64748B',
                                    fontSize: '0.72rem',
                                    fontWeight: '700',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    flexShrink: 0
                                }}
                                onMouseEnter={e => { if (!isCellCollapsed) e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                                onMouseLeave={e => { if (!isCellCollapsed) e.currentTarget.style.backgroundColor = isCellCollapsed ? '#FEF3C7' : '#FFFFFF'; }}
                            >
                                <Sprout size={12} color={isCellCollapsed ? '#92400E' : '#64748B'} strokeWidth={2} />
                                <span>{isCellCollapsed ? 'Célula: Inicial' : 'Célula: Completa'}</span>
                            </button>
                        )}
                    </div>

                    {/* DERECHA: NAVEGADOR DE BLOQUES DE COLUMNAS (SALTAR A BLOQUE) */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        padding: '2px 4px',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        height: '30px',
                        boxSizing: 'border-box',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap'
                    }}>
                        <span style={{ color: '#64748B', fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Layers size={12} color="#0D7A57" />
                            <span>Saltar a Bloque:</span>
                        </span>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('identificacion')}
                            title="Ir a columnas de Identificación (Cols A - D)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'identificacion' ? '1.5px solid #64748B' : '1px solid #CBD5E1',
                                backgroundColor: activeBlock === 'identificacion' ? '#F1F5F9' : '#FFFFFF',
                                color: '#334155',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'identificacion' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <FileText size={11} color="#475569" />
                            <span>Identificación (A-D)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('entradas')}
                            title="Centrar en pantalla columnas de Entradas y Compras (Cols E - G)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'entradas' ? '1.5px solid #16A34A' : '1px solid #86EFAC',
                                backgroundColor: activeBlock === 'entradas' ? '#DCFCE7' : '#F0FDF4',
                                color: '#15803D',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'entradas' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <ArrowDownToLine size={11} color="#15803D" />
                            <span>Entradas (E-G)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('ventas')}
                            title="Centrar en pantalla columnas de Ventas y Pedidos (Cols H - J)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'ventas' ? '1.5px solid #2563EB' : '1px solid #93C5FD',
                                backgroundColor: activeBlock === 'ventas' ? '#DBEAFE' : '#EFF6FF',
                                color: '#1D4ED8',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'ventas' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <ShoppingCart size={11} color="#1D4ED8" />
                            <span>Ventas (H-J)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('excepciones')}
                            title="Centrar en pantalla columnas de Excepciones y Ventas Extras (Cols K - N)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'excepciones' ? '1.5px solid #9333EA' : '1px solid #D8B4FE',
                                backgroundColor: activeBlock === 'excepciones' ? '#F3E8FF' : '#FAF5FF',
                                color: '#7E22CE',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'excepciones' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <AlertTriangle size={11} color="#7E22CE" />
                            <span>Excepciones (K-N)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('mermas')}
                            title="Centrar en pantalla columnas de Devoluciones y Mermas (Cols O - R)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'mermas' ? '1.5px solid #D97706' : '1px solid #FCD34D',
                                backgroundColor: activeBlock === 'mermas' ? '#FEF3C7' : '#FFFBEB',
                                color: '#B45309',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'mermas' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Trash2 size={11} color="#B45309" />
                            <span>Mermas (O-R)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('cierre')}
                            title="Centrar en pantalla columnas de Cierre y Bodega Post-10 (Cols S - U)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'cierre' ? '1.5px solid #0D9488' : '1px solid #5EEAD4',
                                backgroundColor: activeBlock === 'cierre' ? '#CCFBF1' : '#F0FDFA',
                                color: '#0F766E',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'cierre' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Package size={11} color="#0F766E" />
                            <span>Cierre & Bodega (S-U)</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => scrollToColumnGroup('conciliacion')}
                            title="Centrar en pantalla columnas de Conciliación y Diferencias (Cols V - X)"
                            style={{
                                padding: '2px 7px',
                                borderRadius: '5px',
                                border: activeBlock === 'conciliacion' ? '1.5px solid #059669' : '1px solid #6EE7B7',
                                backgroundColor: activeBlock === 'conciliacion' ? '#D1FAE5' : '#ECFDF5',
                                color: '#065F46',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                fontWeight: activeBlock === 'conciliacion' ? '800' : '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Scale size={11} color="#065F46" />
                            <span>Conciliación (V-X)</span>
                        </button>

                        {/* Flechas de desplazamiento lateral paso a paso */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginLeft: '2px' }}>
                            <button
                                type="button"
                                onClick={() => scrollStepHorizontal('left')}
                                title="Desplazar columnas a la izquierda"
                                style={{
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center'
                                }}
                            >
                                <ChevronLeft size={11} />
                            </button>
                            <button
                                type="button"
                                onClick={() => scrollStepHorizontal('right')}
                                title="Desplazar columnas a la derecha"
                                style={{
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center'
                                }}
                            >
                                <ChevronRight size={11} />
                            </button>
                        </div>
                    </div>
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
                    onScroll={handleTableScroll}
                    style={{ 
                        overflowX: 'auto', 
                        overflowY: 'visible',
                        position: 'relative',
                        WebkitOverflowScrolling: 'touch'
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
                                    data-block-id="identificacion"
                                    colSpan={isCompactIdentification ? 1 : 4} 
                                    onClick={() => scrollToColumnGroup('identificacion')}
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
                                        width: isCompactIdentification ? '240px' : (isCellCollapsed ? '389px' : '475px'),
                                        minWidth: isCompactIdentification ? '240px' : (isCellCollapsed ? '389px' : '475px'),
                                        maxWidth: isCompactIdentification ? '240px' : (isCellCollapsed ? '389px' : '475px'),
                                        boxShadow: '4px 0 10px -2px rgba(0,0,0,0.3)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease'
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
                                    data-block-id="entradas"
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup('entradas')}
                                    title="Clic para centrar Entradas (+)"
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
                                    data-block-id="ventas"
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup('ventas')}
                                    title="Clic para centrar Ventas & Pedidos (-)"
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
                                    data-block-id="excepciones"
                                    colSpan={4} 
                                    onClick={() => scrollToColumnGroup('excepciones')}
                                    title="Clic para centrar Excepciones"
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
                                    data-block-id="mermas"
                                    colSpan={4} 
                                    onClick={() => scrollToColumnGroup('mermas')}
                                    title="Clic para centrar Devoluciones & Mermas"
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
                                    data-block-id="cierre"
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup('cierre')}
                                    title="Clic para centrar Cierre & Bodega"
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
                                    data-block-id="conciliacion"
                                    colSpan={3} 
                                    onClick={() => scrollToColumnGroup('conciliacion')}
                                    title="Clic para centrar Conciliación"
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
                                    <th 
                                        data-sticky-last="true"
                                        style={{
                                            padding: '6px 8px',
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
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span>A-D: PRODUCTO & SKU</span>
                                            <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: '500', textTransform: 'none' }}>Célula / Fecha</span>
                                        </div>
                                    </th>
                                ) : (
                                    <>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '85px', minWidth: '85px', maxWidth: '85px', position: 'sticky', left: 0, zIndex: 45, backgroundColor: '#0F172A' }}>A: Fecha</th>
                                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '70px', minWidth: '70px', maxWidth: '70px', position: 'sticky', left: '85px', zIndex: 45, backgroundColor: '#0F172A' }}>B: ID Prod</th>
                                        <th 
                                            onClick={() => setCellColumnMode(prev => prev === 'collapsed' ? 'expanded' : 'collapsed')}
                                            title={isCellCollapsed ? "C: Célula colapsada (Clic para expandir nombre completo)" : "C: Célula (Clic para colapsar y maximizar espacio de datos)"}
                                            style={{ 
                                                padding: isCellCollapsed ? '6px 4px' : '6px 8px', 
                                                textAlign: isCellCollapsed ? 'center' : 'left', 
                                                width: isCellCollapsed ? '44px' : '130px', 
                                                minWidth: isCellCollapsed ? '44px' : '130px', 
                                                maxWidth: isCellCollapsed ? '44px' : '130px', 
                                                position: 'sticky', 
                                                left: '155px', 
                                                zIndex: 45, 
                                                backgroundColor: '#0F172A', 
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {isCellCollapsed ? (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#94A3B8' }}>C</span>
                                                    <span style={{ fontSize: '0.55rem', color: '#64748B' }}>▶</span>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                                    <span>C: Célula</span>
                                                    <span style={{ fontSize: '0.58rem', color: '#64748B' }} title="Colapsar célula">◀</span>
                                                </div>
                                            )}
                                        </th>
                                        <th 
                                            data-sticky-last="true"
                                            style={{ 
                                                padding: '6px 10px', 
                                                textAlign: 'left', 
                                                width: '190px', 
                                                minWidth: '190px', 
                                                maxWidth: '190px', 
                                                borderRight: '2px solid #334155', 
                                                position: 'sticky', 
                                                left: isCellCollapsed ? '199px' : '285px', 
                                                zIndex: 45, 
                                                backgroundColor: '#0F172A', 
                                                boxShadow: '4px 0 10px -2px rgba(0,0,0,0.3)',
                                                transition: 'left 0.2s ease, width 0.2s ease'
                                            }}
                                        >
                                            D: Producto
                                        </th>
                                    </>
                                )}

                                {/* Columnas E - G */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px' }}>E: Inicial (+)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px' }}>F: Correc. (±)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', borderRight: '2px solid #334155', width: '95px', minWidth: '95px', maxWidth: '95px' }}>G: Compra (+)</th>

                                {/* Columnas H - J */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#60A5FA', width: '95px', minWidth: '95px', maxWidth: '95px' }}>H: Venta KG (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#94A3B8', width: '95px', minWidth: '95px', maxWidth: '95px' }}>I: Venta UN (Info)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#60A5FA', borderRight: '2px solid #334155', width: '95px', minWidth: '95px', maxWidth: '95px' }}>J: Peso UN (-)</th>

                                {/* Columnas K - N */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F87171', width: '95px', minWidth: '95px', maxWidth: '95px' }}>K: Escaso (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px' }}>L: Sin Enviar (+)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#C084FC', width: '95px', minWidth: '95px', maxWidth: '95px' }}>M: Vta Extra (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#60A5FA', borderRight: '2px solid #334155', width: '95px', minWidth: '95px', maxWidth: '95px' }}>N: Vta Nómina (-)</th>

                                {/* Columnas O - R */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#FBBF24', width: '95px', minWidth: '95px', maxWidth: '95px' }}>O: Devol. (+)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#FBBF24', width: '95px', minWidth: '95px', maxWidth: '95px' }}>P: Pesada (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F87171', width: '95px', minWidth: '95px', maxWidth: '95px' }}>Q: Desperd. (-)</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#FBBF24', borderRight: '2px solid #334155', width: '95px', minWidth: '95px', maxWidth: '95px' }}>R: Basura (-)</th>

                                {/* Columnas S - U */}
                                <th style={{ 
                                    padding: '6px 8px', 
                                    textAlign: 'right', 
                                    color: '#5EEAD4', 
                                    backgroundColor: '#042F2E', 
                                    borderLeft: '2px solid #0D9488', 
                                    borderRight: '2px solid #0D9488',
                                    width: '95px',
                                    minWidth: '95px',
                                    maxWidth: '95px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                        <span style={{ fontSize: '0.52rem', fontWeight: '900', backgroundColor: '#0D9488', color: '#FFFFFF', padding: '1px 4px', borderRadius: '3px', letterSpacing: '0.04em' }}>
                                            RESULTADO
                                        </span>
                                        <span>S: Calc. Final</span>
                                    </div>
                                </th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', backgroundColor: '#1E293B', width: '95px', minWidth: '95px', maxWidth: '95px' }}>T: Conteo Real</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F8FAFC', backgroundColor: '#1E293B', borderRight: '2px solid #334155', width: '95px', minWidth: '95px', maxWidth: '95px' }}>U: Bodega Post-10</th>

                                {/* Columnas V - X */}
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F87171', width: '95px', minWidth: '95px', maxWidth: '95px' }}>V: Faltantes</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px' }}>W: Sobrantes</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right', color: '#F472B6', width: '95px', minWidth: '95px', maxWidth: '95px' }}>X: Donación</th>
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
                            ) : displayedFamilies.length === 0 ? (
                                <tr>
                                    <td colSpan={isCompactIdentification ? 21 : 24} style={{ textAlign: 'center', padding: '3.5rem', color: '#94A3B8' }}>
                                        <Package size={32} strokeWidth={1.5} style={{ margin: '0 auto 0.5rem', opacity: 0.6 }} />
                                        <div style={{ fontWeight: '700', color: '#475569', fontSize: '0.9rem' }}>No se encontraron productos activos con los filtros seleccionados</div>
                                        <p style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>Verifica el término de búsqueda o selecciona otra célula de trabajo.</p>
                                    </td>
                                </tr>
                            ) : (
                                displayedFamilies.map((family, idx) => {
                                    const isAlternate = idx % 2 === 1;
                                    const isCollapsed = collapsedFamilies[family.id] !== false; // default true

                                    if (family.isParent) {
                                        return (
                                            <React.Fragment key={`family-${family.id}`}>
                                                {/* Fila Padre Resaltada (Consolidado Maestro de Familia) */}
                                                {renderRow(family.consolidated, `parent-${family.id}`, {
                                                    isParent: true,
                                                    isCollapsed,
                                                    onToggle: () => toggleFamily(family.id),
                                                    childCount: family.children.length + 1,
                                                    isAlternate
                                                })}

                                                {/* Filas Hijas (si está expandido) */}
                                                {!isCollapsed && (
                                                    <>
                                                        {/* Desglose de presentación base fija (siempre visible y editable como en fila 106 de Excel) */}
                                                        {renderRow({
                                                            ...family.parent,
                                                            colD_productName: `${family.parent.colD_productName} (Base / Estándar)`
                                                        }, `child-base-${family.parent.productId}`, {
                                                            isChild: true,
                                                            isBaseChild: true,
                                                            isAlternate: false
                                                        })}
                                                        {family.children.map((child, chIdx) => 
                                                            renderRow(child, `child-${child.productId}`, {
                                                                isChild: true,
                                                                isBaseChild: false,
                                                                isAlternate: chIdx % 2 === 1
                                                            })
                                                        )}
                                                    </>
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

                        {/* Fila Fija de Totales Consolidada (∑ 24 Columnas Lean) */}
                        <tfoot style={{
                            position: 'sticky',
                            bottom: 0,
                            zIndex: 30,
                            backgroundColor: '#0F172A',
                            color: '#F8FAFC',
                            boxShadow: '0 -4px 10px -2px rgba(0, 0, 0, 0.25)'
                        }}>
                            <tr style={{ fontWeight: '900', fontSize: '0.78rem' }}>
                                {/* Sticky Cols A-D */}
                                <td
                                    colSpan={isCompactIdentification ? 1 : 4}
                                    style={{
                                        padding: '7px 10px',
                                        textAlign: 'left',
                                        backgroundColor: '#0F172A',
                                        color: '#F8FAFC',
                                        borderRight: '2px solid #334155',
                                        borderTop: '2px solid #334155',
                                        position: 'sticky',
                                        left: 0,
                                        bottom: 0,
                                        zIndex: 35,
                                        boxShadow: '4px 0 10px -2px rgba(0,0,0,0.3)',
                                        width: isCompactIdentification ? '240px' : (isCellCollapsed ? '389px' : '475px'),
                                        minWidth: isCompactIdentification ? '240px' : (isCellCollapsed ? '389px' : '475px'),
                                        maxWidth: isCompactIdentification ? '240px' : (isCellCollapsed ? '389px' : '475px'),
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ letterSpacing: '0.04em', textTransform: 'uppercase', fontSize: '0.72rem', color: '#E2E8F0' }}>
                                            TOTAL ({filteredFamilies.length} FAMILIAS)
                                        </span>
                                        <span style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: '700' }}>
                                            {totalActiveSkusCount} SKUs
                                        </span>
                                    </div>
                                </td>

                                {/* E: Inicial */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalE)}
                                </td>
                                {/* F: Corrección */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalF)}
                                </td>
                                {/* G: Compra */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px', borderRight: '2px solid #334155', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalG)}
                                </td>

                                {/* H: Venta KG */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#60A5FA', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalH)}
                                </td>
                                {/* I: Venta UN */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#94A3B8', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalI, 0)}
                                </td>
                                {/* J: Peso UN */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#60A5FA', width: '95px', minWidth: '95px', maxWidth: '95px', borderRight: '2px solid #334155', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalJ)}
                                </td>

                                {/* K: Escaso */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#F87171', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalK)}
                                </td>
                                {/* L: Sin Enviar */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalL)}
                                </td>
                                {/* M: Vta Extra */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#C084FC', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalM)}
                                </td>
                                {/* N: Vta Nómina */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#60A5FA', width: '95px', minWidth: '95px', maxWidth: '95px', borderRight: '2px solid #334155', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalN)}
                                </td>

                                {/* O: Devoluciones */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#FBBF24', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalO)}
                                </td>
                                {/* P: Pesada */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#FBBF24', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalP)}
                                </td>
                                {/* Q: Desperdicio */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#F87171', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalQ)}
                                </td>
                                {/* R: Basura */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#FBBF24', width: '95px', minWidth: '95px', maxWidth: '95px', borderRight: '2px solid #334155', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalR)}
                                </td>

                                {/* S: Inventario Calculado (RESALTADO GLASSMORPHISM RESULTADO) */}
                                <td style={{
                                    position: 'sticky',
                                    bottom: 0,
                                    zIndex: 31,
                                    padding: '6px 8px',
                                    textAlign: 'right',
                                    color: '#5EEAD4',
                                    backgroundColor: '#042F2E',
                                    borderLeft: '2px solid #0D9488',
                                    borderRight: '2px solid #0D9488',
                                    borderTop: '2px solid #0D9488',
                                    width: '95px',
                                    minWidth: '95px',
                                    maxWidth: '95px',
                                    fontWeight: '900',
                                    fontSize: '0.84rem',
                                    boxShadow: '0 0 10px rgba(13, 148, 136, 0.4)'
                                }}>
                                    {renderNumericCell(columnTotals.totalS)}
                                </td>

                                {/* T: Conteo Real */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, padding: '6px 8px', textAlign: 'right', color: '#34D399', backgroundColor: '#1E293B', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalT)}
                                </td>
                                {/* U: Bodega Post-10 */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, padding: '6px 8px', textAlign: 'right', color: '#F8FAFC', backgroundColor: '#1E293B', width: '95px', minWidth: '95px', maxWidth: '95px', borderRight: '2px solid #334155', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalU)}
                                </td>

                                {/* V: Faltantes */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#F87171', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalV)}
                                </td>
                                {/* W: Sobrantes */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#34D399', width: '95px', minWidth: '95px', maxWidth: '95px', borderRight: '2px solid #334155', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalW)}
                                </td>
                                {/* X: Donación */}
                                <td style={{ position: 'sticky', bottom: 0, zIndex: 30, backgroundColor: '#0F172A', padding: '6px 8px', textAlign: 'right', color: '#F472B6', width: '95px', minWidth: '95px', maxWidth: '95px', borderTop: '2px solid #334155' }}>
                                    {renderNumericCell(columnTotals.totalX)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {/* BARRA DE ESTADO INFORMATIVA CONTINUA */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.6rem 1rem',
                backgroundColor: '#FFFFFF',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                flexWrap: 'wrap',
                gap: '0.75rem',
                fontSize: '0.78rem',
                color: '#64748B'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }} />
                        <span>Modo: <strong style={{ color: '#0F172A' }}>Vista Continua (100% en Pantalla)</strong></span>
                    </span>
                    <div style={{ height: '14px', width: '1px', backgroundColor: '#CBD5E1' }} />
                    <span>
                        Mostrando <strong style={{ color: '#0F172A' }}>{displayedFamilies.length}</strong> familias ({totalActiveSkusCount} SKUs activos) {onlyWithMovement ? 'con movimiento hoy' : 'del catálogo activo'}
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.74rem', color: '#94A3B8' }}>
                    <span>Tip: Usa <strong style={{ color: '#64748B' }}>Ctrl + F</strong> para búsqueda rápida en toda la sábana</span>
                </div>
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

            <DailyBalanceExcelImportModal
                isOpen={isExcelImportModalOpen}
                onClose={() => setIsExcelImportModalOpen(false)}
                onSuccess={() => loadDailyData(true)}
                currentDate={balanceDate}
                products={products}
            />

            {/* MODAL DE CIERRE DIARIO OFICIAL & CONGELACIÓN (SPEC.md v1.5.0 / ACUERDO 2 GRILL-ME) */}
            {isClosingModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 99999,
                    padding: '1rem',
                    backdropFilter: 'blur(3px)'
                }}>
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '1.75rem',
                        width: '100%',
                        maxWidth: '520px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #CBD5E1'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.2rem' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                backgroundColor: '#DCFCE7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#16A34A'
                            }}>
                                <Lock size={22} strokeWidth={2.5} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: '#0F172A' }}>
                                    Cierre Diario Oficial de Inventario
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>
                                    Jornada: <strong>{balanceDate}</strong> • Bodega Central FruFresco
                                </p>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.84rem', color: '#475569', lineHeight: '1.45', marginBottom: '1.2rem' }}>
                            Al ejecutar el cierre oficial, el balance de masa de esta fecha quedará <strong>congelado e inmutable</strong> para efectos contables y fiscales. El Saldo Físico Final (Col T) se trasladará automáticamente como <strong>Saldo Inicial (Col E)</strong> de la jornada siguiente.
                        </p>

                        {/* Grid de Resumen de Balance de Masa */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '0.75rem',
                            marginBottom: '1.2rem',
                            backgroundColor: '#F8FAFC',
                            padding: '1rem',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold' }}>INVENTARIO CALCULADO (S)</span>
                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#0F172A' }}>
                                    {formatNumber(columnTotals.totalS)} <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Kg</span>
                                </div>
                            </div>

                            <div>
                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold' }}>CONTEO FÍSICO BODEGA (T)</span>
                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#16A34A' }}>
                                    {formatNumber(columnTotals.totalT)} <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Kg</span>
                                </div>
                            </div>

                            <div>
                                <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 'bold' }}>FALTANTES (COL V)</span>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#EF4444' }}>
                                    {formatNumber(columnTotals.totalV)} <span style={{ fontSize: '0.75rem' }}>Kg</span>
                                </div>
                            </div>

                            <div>
                                <span style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 'bold' }}>SOBRANTES (COL W)</span>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#2563EB' }}>
                                    {formatNumber(columnTotals.totalW)} <span style={{ fontSize: '0.75rem' }}>Kg</span>
                                </div>
                            </div>
                        </div>

                        {/* Campo de Observaciones */}
                        <div style={{ marginBottom: '1.5rem' }}>
                            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '0.35rem' }}>
                                OBSERVACIONES O NOVEDADES DEL CIERRE
                            </label>
                            <textarea
                                value={closingNotes}
                                onChange={e => setClosingNotes(e.target.value)}
                                placeholder="Ej: Conteo ciego verificado al 100%, novedades de ruta cuadradas..."
                                rows={3}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.82rem',
                                    color: '#0F172A',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>

                        {/* Botones de Acción */}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setIsClosingModalOpen(false)}
                                disabled={isSubmittingClosing}
                                style={{
                                    padding: '0.7rem 1.1rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    color: '#475569',
                                    fontSize: '0.82rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={handleOfficialClosing}
                                disabled={isSubmittingClosing}
                                style={{
                                    padding: '0.7rem 1.4rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: '#16A34A',
                                    color: '#FFFFFF',
                                    fontSize: '0.82rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 6px -1px rgba(22, 163, 74, 0.3)',
                                    opacity: isSubmittingClosing ? 0.7 : 1
                                }}
                            >
                                <Lock size={15} strokeWidth={2.5} />
                                <span>{isSubmittingClosing ? 'Congelando...' : 'Confirmar y Congelar Jornada'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
