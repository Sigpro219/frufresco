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
    EyeOff,
    PenTool,
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
    Unlock,
    ShieldCheck,
    Pin,
    PinOff,
    Maximize2,
    Minimize2,
    RotateCcw,
    GripVertical
} from 'lucide-react';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { WorkCell } from '@/types/workCells';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { compareChildProducts } from '@/lib/productHierarchyUtils';

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
import FastPlazaPurchasesModal from '@/components/FastPlazaPurchasesModal';

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
    // U: Inventario en bodega (devoluciones) (U = T + O)
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
    externalDate?: string;
    onDateChange?: (date: string) => void;
    onExitFullscreen?: () => void;
    initialFullscreen?: boolean;
}

export const DEFAULT_COLUMN_ORDER = [
    'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X'
];

export const COLUMN_METADATA: Record<string, {
    letter: string;
    title: string;
    shortName: string;
    sign: string;
    block: string;
    formula?: string;
    effect: string;
    color: string;
    bgColor?: string;
    borderLeft?: string;
    borderRight?: string;
}> = {
    E: { letter: 'E', title: 'Inicial', shortName: 'Inicial', sign: '(+)', block: 'ENTRADAS (+)', effect: 'Heredado del Conteo Físico Real (Col T) de la jornada anterior. Solo Lectura (+)', color: '#34D399' },
    F: { letter: 'F', title: 'Corrección', shortName: 'Correc.', sign: '(±)', block: 'ENTRADAS (±)', effect: 'Ajuste manual operativo de descuadre o ingreso extemporáneo (±)', color: '#34D399' },
    G: { letter: 'G', title: 'Compra', shortName: 'Compra', sign: '(+)', block: 'ENTRADAS (+)', effect: 'Compras plaza Corabastos o recepción de proveedores (+)', color: '#34D399', borderRight: '2px solid #334155' },
    H: { letter: 'H', title: 'Venta KG', shortName: 'Venta KG', sign: '(-)', block: 'VENTAS & PEDIDOS (-)', effect: 'Salidas facturadas a clientes en kilogramos (-)', color: '#60A5FA' },
    I: { letter: 'I', title: 'Venta UN', shortName: 'Venta UN', sign: '(Info)', block: 'VENTAS & PEDIDOS (Info)', effect: 'Salidas facturadas a clientes en unidades (Informativo)', color: '#94A3B8' },
    J: { letter: 'J', title: 'Peso UN', shortName: 'Peso UN', sign: '(-)', block: 'VENTAS & PEDIDOS (-)', effect: 'Kilogramos equivalentes de productos vendidos por unidad (-)', color: '#60A5FA', borderRight: '2px solid #334155' },
    K: { letter: 'K', title: 'Escaso', shortName: 'Escaso', sign: '(-)', block: 'EXCEPCIONES (-)', effect: 'Faltante de despacho en alistamiento (-)', color: '#F87171' },
    L: { letter: 'L', title: 'Sin Enviar', shortName: 'Sin Enviar', sign: '(+)', block: 'EXCEPCIONES (+)', effect: 'Producto alistado que no salió en ruta (+)', color: '#34D399' },
    M: { letter: 'M', title: 'Vta Extra', shortName: 'Vta Extra', sign: '(-)', block: 'EXCEPCIONES (-)', effect: 'Venta adicional en mostrador de bodega (-)', color: '#C084FC' },
    N: { letter: 'N', title: 'Vta Nómina', shortName: 'Vta Nómina', sign: '(-)', block: 'EXCEPCIONES (-)', effect: 'Venta autorizada descontada a colaboradores (-)', color: '#60A5FA', borderRight: '2px solid #334155' },
    O: { letter: 'O', title: 'Devoluciones', shortName: 'Devol.', sign: '(+)', block: 'DEVOLUCIONES & MERMAS (+)', effect: 'Producto retornado por clientes al almacén (+)', color: '#FBBF24' },
    P: { letter: 'P', title: 'Pesada', shortName: 'Pesada', sign: '(-)', block: 'DEVOLUCIONES & MERMAS (-)', effect: 'Merma por merma de peso, calibración o humedad (-)', color: '#FBBF24' },
    Q: { letter: 'Q', title: 'Desperdicio', shortName: 'Desperd.', sign: '(-)', block: 'DEVOLUCIONES & MERMAS (-)', effect: 'Daño, maduración o pérdida en selección (-)', color: '#F87171' },
    R: { letter: 'R', title: 'Basura', shortName: 'Basura', sign: '(-)', block: 'DEVOLUCIONES & MERMAS (-)', effect: 'Descarte total no aprovechable (-)', color: '#FBBF24', borderRight: '2px solid #334155' },
    S: { letter: 'S', title: 'Calculado', shortName: 'Calc. Final', sign: '(=)', block: 'CIERRE & BODEGA', formula: 'S = E + F + G - H - J - K + L - M - N + O - P - Q - R', effect: 'Balance teórico calculado de masa al cierre de turno', color: '#5EEAD4', bgColor: '#042F2E', borderLeft: '2px solid #0D9488', borderRight: '2px solid #0D9488' },
    T: { letter: 'T', title: 'Conteo Real', shortName: 'Conteo Real', sign: '(Físico)', block: 'CIERRE & BODEGA', effect: 'Inventario físico real contado en bodega al cierre de jornada', color: '#34D399', bgColor: '#1E293B' },
    U: { letter: 'U', title: 'Bodega (Dev)', shortName: 'Inv. Bodega', sign: '(T + O)', block: 'CIERRE & BODEGA', formula: 'U = T + O', effect: 'Stock físico total en bodega incluyendo devoluciones (T + O)', color: '#F8FAFC', bgColor: '#1E293B', borderRight: '2px solid #334155' },
    V: { letter: 'V', title: 'Faltantes', shortName: 'Faltantes', sign: '(-)', block: 'CONCILIACIÓN (-)', formula: 'V = Max(0, S - T)', effect: 'Descuadre en contra: Falta producto físico respecto al calculado (-)', color: '#F87171' },
    W: { letter: 'W', title: 'Sobrantes', shortName: 'Sobrantes', sign: '(+)', block: 'CONCILIACIÓN (+)', formula: 'W = Max(0, T - S)', effect: 'Descuadre a favor: Sobra producto físico respecto al calculado (+)', color: '#34D399' },
    X: { letter: 'X', title: 'Donación', shortName: 'Donación', sign: '(-)', block: 'CONCILIACIÓN', effect: 'Baja autorizada para donación o Banco de Alimentos', color: '#F472B6' }
};

export const matchNumericFilter = (val: number, filterStr: string): boolean => {
    if (!filterStr || !filterStr.trim()) return true;
    const raw = filterStr.trim();
    if (raw.startsWith('!=')) {
        const target = parseFloat(raw.substring(2).trim());
        return !isNaN(target) ? Math.abs(val - target) > 0.001 : true;
    }
    if (raw.startsWith('>=')) {
        const target = parseFloat(raw.substring(2).trim());
        return !isNaN(target) ? val >= target : true;
    }
    if (raw.startsWith('<=')) {
        const target = parseFloat(raw.substring(2).trim());
        return !isNaN(target) ? val <= target : true;
    }
    if (raw.startsWith('>')) {
        const target = parseFloat(raw.substring(1).trim());
        return !isNaN(target) ? val > target : true;
    }
    if (raw.startsWith('<')) {
        const target = parseFloat(raw.substring(1).trim());
        return !isNaN(target) ? val < target : true;
    }
    if (raw.startsWith('=')) {
        const target = parseFloat(raw.substring(1).trim());
        return !isNaN(target) ? Math.abs(val - target) <= 0.001 : true;
    }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
        return Math.abs(val - parsed) <= 0.001;
    }
    return true;
};

const getCompactCellLabel = (name: string, shortName?: string | null): string => {
    if (shortName && shortName.trim().length > 0 && shortName.trim().length <= 12) {
        return shortName.trim();
    }
    const lower = (name || '').toLowerCase();
    if (lower.includes('abarrote')) return 'Abarrotes';
    if (lower.includes('hortaliza')) return 'Hortalizas';
    if (lower.includes('verdura')) return 'Verduras';
    if (lower.includes('papa')) return 'Papas';
    if (lower.includes('fresa') || lower.includes('mora')) return 'Fresas';
    if (lower.includes('fruta')) return 'Frutas';
    return name.split(/[,&/]/)[0].trim();
};

export default function InventoryDailyBalanceTab({ 
    workCells, 
    externalDate, 
    onDateChange,
    onExitFullscreen,
    initialFullscreen = true
}: InventoryDailyBalanceTabProps) {
    const { user, profile } = useAuth();

    // Modo Consola Focus Fullscreen (SPEC.md §8.8.7)
    const [isFullscreen, setIsFullscreen] = useState<boolean>(initialFullscreen);

    // Escucha de tecla Escape para desmaximizar
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
                if (onExitFullscreen) onExitFullscreen();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isFullscreen, onExitFullscreen]);

    const handleExitFullscreen = useCallback(() => {
        setIsFullscreen(false);
        if (onExitFullscreen) onExitFullscreen();
    }, [onExitFullscreen]);

    // Arrastre y Reorganización de Columnas (SPEC.md §8.8.10)
    const [columnOrder, setColumnOrder] = useState<string[]>(DEFAULT_COLUMN_ORDER);
    const [draggedCol, setDraggedCol] = useState<string | null>(null);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);

    const handleDragStart = (e: React.DragEvent, colKey: string) => {
        e.dataTransfer.setData('text/plain', colKey);
        setDraggedCol(colKey);
    };

    const handleDragOver = (e: React.DragEvent, colKey: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragOverCol !== colKey) {
            setDragOverCol(colKey);
        }
    };

    const handleDrop = (e: React.DragEvent, targetColKey: string) => {
        e.preventDefault();
        const sourceColKey = e.dataTransfer.getData('text/plain') || draggedCol;
        setDraggedCol(null);
        setDragOverCol(null);
        if (!sourceColKey || sourceColKey === targetColKey) return;

        setColumnOrder(prevOrder => {
            const newOrder = [...prevOrder];
            const sourceIdx = newOrder.indexOf(sourceColKey);
            const targetIdx = newOrder.indexOf(targetColKey);
            if (sourceIdx === -1 || targetIdx === -1) return prevOrder;
            newOrder.splice(sourceIdx, 1);
            newOrder.splice(targetIdx, 0, sourceColKey);
            return newOrder;
        });
    };

    const handleDragEnd = () => {
        setDraggedCol(null);
        setDragOverCol(null);
    };

    const resetColumnOrder = () => {
        setColumnOrder(DEFAULT_COLUMN_ORDER);
    };

    const isColumnOrderCustom = useMemo(() => {
        return columnOrder.some((col, idx) => col !== DEFAULT_COLUMN_ORDER[idx]);
    }, [columnOrder]);

    // Fila de Filtros Conmutables por Columna (SPEC.md §8.8.9)
    const [isColumnFilterOpen, setIsColumnFilterOpen] = useState<boolean>(false);
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

    // Atajo de teclado estándar Excel Ctrl+Shift+L para alternar filtros
    useEffect(() => {
        const handleFilterShortcut = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
                e.preventDefault();
                setIsColumnFilterOpen(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleFilterShortcut);
        return () => window.removeEventListener('keydown', handleFilterShortcut);
    }, []);

    const activeFilterCount = useMemo(() => {
        return Object.values(columnFilters).filter(v => v && v.trim().length > 0).length;
    }, [columnFilters]);

    // Gobernanza SoD: Solo Yina Cortés (Jefatura de Inventario) o Superadmins tienen permiso de edición
    const canEditSheet = useMemo(() => {
        if (!profile) return false;
        if (profile.role === 'admin' || profile.role === 'sys_admin') return true;
        if (profile.role === 'inventory_manager' || profile.role === 'inventario') return true;

        const email = (user?.email || '').toLowerCase();
        const contactName = (profile.contact_name || '').toLowerCase();
        const companyName = (profile.company_name || '').toLowerCase();
        if (email.includes('yina') || contactName.includes('yina') || companyName.includes('yina')) {
            return true;
        }

        return (
            checkUserPermission(profile, 'commercial.inventory.edit') ||
            checkUserPermission(profile, 'admin.inventory.edit') ||
            checkUserPermission(profile, 'admin.commercial.inventory')
        );
    }, [profile, user]);

    const todayStr = new Date().toISOString().split('T')[0];
    const balanceDateDefault = externalDate || todayStr;
    const [balanceDate, setBalanceDate] = useState<string>(balanceDateDefault);

    useEffect(() => {
        if (externalDate && externalDate !== balanceDate) {
            setBalanceDate(externalDate);
        }
    }, [externalDate]);

    const handleDateChange = (newDate: string) => {
        setBalanceDate(newDate);
        setColumnOrder(DEFAULT_COLUMN_ORDER);
        setColumnFilters({});
        if (onDateChange) {
            onDateChange(newDate);
        }
    };

    const [sheetMode, setSheetMode] = useState<'view' | 'manual_edit'>('view');
    // Estado persistido de visibilidad de indicadores (Por defecto colapsado para maximizar área de tabla)
    const [showKpis, setShowKpis] = useState<boolean>(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('frufresco_daily_balance_show_kpis');
            if (saved !== null) {
                setShowKpis(saved === 'true');
            }
        }
    }, []);

    const handleToggleKpis = useCallback(() => {
        setShowKpis(prev => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('frufresco_daily_balance_show_kpis', String(next));
            }
            return next;
        });
    }, []);

    const [selectedCell, setSelectedCell] = useState<string>('ALL');

    const cellOptions = useMemo(() => [
        { 
            value: 'ALL', 
            label: 'Todas', 
            fullLabel: `Todas las Células (${workCells.length})`
        },
        ...workCells.map(c => ({
            value: c.inventory_group || c.name,
            label: getCompactCellLabel(c.name, c.short_name),
            fullLabel: c.name
        }))
    ], [workCells]);

    const selectedCellOption = useMemo(() => {
        return cellOptions.find(opt => opt.value === selectedCell) || cellOptions[0];
    }, [cellOptions, selectedCell]);

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [showHelpTooltip, setShowHelpTooltip] = useState<boolean>(false);
    const [loading, setLoading] = useState<boolean>(true);
    const [refreshing, setRefreshing] = useState<boolean>(false);

    const [products, setProducts] = useState<ProductItem[]>([]);
    const [movements, setMovements] = useState<RawMovement[]>([]);
    const [costMatrixMap, setCostMatrixMap] = useState<Map<string, number>>(new Map());

    // Modales de apoyo
    const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
    const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
    const [isAdditionalSalesModalOpen, setIsAdditionalSalesModalOpen] = useState(false);
    const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);
    const [isFastPlazaModalOpen, setIsFastPlazaModalOpen] = useState(false);
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
        rowKey: string;
        productId: string;
        colKey: string;
        initialValue: number;
        currentValue: string;
    } | null>(null);
    const [isSavingCell, setIsSavingCell] = useState(false);
    const isNavigatingRef = useRef(false);

    // Estado persistido de Inmovilizar / Movilizar Paneles (Filas y Columnas tipo Excel)
    const [isPanesFrozen, setIsPanesFrozen] = useState<boolean>(true);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('frufresco_daily_balance_panes_frozen');
            if (saved !== null) {
                setIsPanesFrozen(saved === 'true');
            }
        }
    }, []);

    const togglePanesFrozen = useCallback(() => {
        setIsPanesFrozen(prev => {
            const next = !prev;
            if (typeof window !== 'undefined') {
                localStorage.setItem('frufresco_daily_balance_panes_frozen', String(next));
            }
            return next;
        });
    }, []);

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

    const handleSwitchMode = useCallback((newMode: 'view' | 'manual_edit') => {
        if (newMode === 'manual_edit' && !canEditSheet) {
            notify('Acceso restringido: El Modo Edición está reservado exclusivamente para la jefatura de inventarios o administradores.', 'warning');
            return;
        }
        setSheetMode(newMode);
    }, [canEditSheet, notify]);

    // Menú desplegable para registrar novedades (Mermas, Nómina, Extra) en Modo Edición
    const [isNoveltyMenuOpen, setIsNoveltyMenuOpen] = useState(false);
    const noveltyMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (noveltyMenuRef.current && !noveltyMenuRef.current.contains(e.target as Node)) {
                setIsNoveltyMenuOpen(false);
            }
        };
        if (isNoveltyMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isNoveltyMenuOpen]);

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
                        const finalStock = item.bodegaPost10am !== null && item.bodegaPost10am !== undefined
                            ? Number(item.bodegaPost10am)
                            : (item.physicalCount !== null && item.physicalCount !== undefined
                                ? Number(item.physicalCount)
                                : Number(item.calculatedStock || 0));
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
                        id, name, sku, accounting_id, unit_of_measure, category, inventory_group, parent_id, is_active,
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

            // Cargar matriz de costos para valuación real de inventario (erradicando base_price)
            try {
                const { data: costMatrixData } = await supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost')
                    .eq('is_active', true);
                const costMap = new Map<string, number>();
                (costMatrixData || []).forEach(cm => {
                    if (cm.manual_cost && Number(cm.manual_cost) > 0) {
                        costMap.set(cm.product_id, Number(cm.manual_cost));
                    }
                });
                setCostMatrixMap(costMap);
            } catch (cmErr) {
                console.warn('Error cargando commercial_cost_matrix en balance diario:', cmErr);
            }

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
            // 1. Si existe Cierre Oficial previo (D-1), se hereda su saldo de Columna U (Inventario en bodega [devoluciones]) de forma inmutable
            // 2. Si es una fecha futura (balanceDate > todayStr) sin cierre, el saldo inicial es 0 (no proyectar stock vivo al futuro)
            // 3. Si es la jornada actual en curso (balanceDate === todayStr), se calcula: Stock Actual - movimientos de hoy
            // 4. Si es una fecha pasada sin cierre formal previo, solo si hubo movimientos registrados en ese día o posteriores se computa el delta, de lo contrario 0
            const sumDeltasSinceStart = dayMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0) +
                                       laterMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
            
            let initialStock = 0;
            if (previousClosingMap[p.id] !== undefined) {
                initialStock = previousClosingMap[p.id];
            } else if (balanceDate > todayStr) {
                initialStock = 0;
            } else if (balanceDate === todayStr) {
                const todayDeltas = dayMovs.reduce((acc, m) => acc + (Number(m.quantity) || 0), 0);
                initialStock = Math.max(0, currentStock - todayDeltas);
            } else {
                const hasAnyMovements = dayMovs.length > 0 || laterMovs.length > 0;
                initialStock = hasAnyMovements ? Math.max(0, currentStock - sumDeltasSinceStart) : 0;
            }

            // S: Inventario Calculado
            // S = E + F + G - H - J - K + L - M - N + O - P - Q - R
            const calculatedStock = initialStock + f_corrections + g_purchases - h_salesKg - j_weightSalesUnits - k_shortage + l_unshipped - m_additionalSales - n_employeeSales + o_returns - p_weighingWaste - q_damageWaste - r_cleaningWaste;

            // U: Inventario en bodega (devoluciones) = T + O
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
                base_price: costMatrixMap.get(p.id) || 0,
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
    }, [balanceDate, products, movements, previousClosingMap, costMatrixMap]);

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
            const children = (childrenByParent.get(row.productId) || []).sort(compareChildProducts);

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

    const currentPurchasesMap = useMemo(() => {
        const map: Record<string, number> = {};
        dailyRows.forEach(r => {
            if (r.colG_purchases > 0) {
                map[r.productId] = r.colG_purchases;
            }
        });
        return map;
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

    // Modo Lista Continua con Soporte de Filtros Conmutables en Cabecera (SPEC.md §8.8.9)
    const displayedFamilies = useMemo(() => {
        const activeFilters = Object.entries(columnFilters).filter(([_, v]) => v && v.trim().length > 0);
        if (activeFilters.length === 0) return filteredFamilies;

        return filteredFamilies.filter(family => {
            const testRow = (row: InventoryDailyRow): boolean => {
                return activeFilters.every(([colKey, filterStr]) => {
                    switch (colKey) {
                        case 'A':
                        case 'date': return (row.colA_date || '').toLowerCase().includes(filterStr.toLowerCase());
                        case 'B':
                        case 'id': return String(row.colB_idProducto || '').includes(filterStr);
                        case 'C':
                        case 'cell': return (row.colC_inventoryGroup || '').toLowerCase().includes(filterStr.toLowerCase());
                        case 'D':
                        case 'product': return (row.colD_productName || '').toLowerCase().includes(filterStr.toLowerCase());
                        case 'E': return matchNumericFilter(row.colE_initialStock, filterStr);
                        case 'F': return matchNumericFilter(row.colF_corrections, filterStr);
                        case 'G': return matchNumericFilter(row.colG_purchases, filterStr);
                        case 'H': return matchNumericFilter(row.colH_salesKg, filterStr);
                        case 'I': return matchNumericFilter(row.colI_salesUnits, filterStr);
                        case 'J': return matchNumericFilter(row.colJ_weightSalesUnits, filterStr);
                        case 'K': return matchNumericFilter(row.colK_shortage, filterStr);
                        case 'L': return matchNumericFilter(row.colL_unshipped, filterStr);
                        case 'M': return matchNumericFilter(row.colM_additionalSales, filterStr);
                        case 'N': return matchNumericFilter(row.colN_employeeSales, filterStr);
                        case 'O': return matchNumericFilter(row.colO_returns, filterStr);
                        case 'P': return matchNumericFilter(row.colP_weighingWaste, filterStr);
                        case 'Q': return matchNumericFilter(row.colQ_damageWaste, filterStr);
                        case 'R': return matchNumericFilter(row.colR_cleaningWaste, filterStr);
                        case 'S': return matchNumericFilter(row.colS_calculated, filterStr);
                        case 'T': return matchNumericFilter(row.colT_physicalCount ?? 0, filterStr);
                        case 'U': return matchNumericFilter(row.colU_bodegaPost10am ?? 0, filterStr);
                        case 'V': return matchNumericFilter(row.colV_missing, filterStr);
                        case 'W': return matchNumericFilter(row.colW_surplus, filterStr);
                        case 'X': return matchNumericFilter(row.colX_foodBank, filterStr);
                        default: return true;
                    }
                });
            };

            if (family.isParent) {
                return testRow(family.consolidated) || testRow(family.parent) || family.children.some(testRow);
            }
            return testRow(family.parent);
        });
    }, [filteredFamilies, columnFilters]);

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

    // Columnas editables en orden secuencial para navegación Excel (Enter / Tab)
    const EDITABLE_COLUMNS = ['F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'T', 'X'] as const;

    const getRowColumnValue = (row: InventoryDailyRow, colKey: string): number | null => {
        switch (colKey) {
            case 'F': return row.colF_corrections;
            case 'G': return row.colG_purchases;
            case 'H': return row.colH_salesKg;
            case 'I': return row.colI_salesUnits;
            case 'J': return row.colJ_weightSalesUnits;
            case 'K': return row.colK_shortage;
            case 'L': return row.colL_unshipped;
            case 'M': return row.colM_additionalSales;
            case 'N': return row.colN_employeeSales;
            case 'O': return row.colO_returns;
            case 'P': return row.colP_weighingWaste;
            case 'Q': return row.colQ_damageWaste;
            case 'R': return row.colR_cleaningWaste;
            case 'T': return row.colT_physicalCount;
            case 'X': return row.colX_foodBank;
            default: return 0;
        }
    };

    const getColumnDecimals = (colKey: string): number => {
        return colKey === 'I' ? 0 : 2;
    };

    interface FlatRowItem {
        rowKey: string;
        productId: string;
        row: InventoryDailyRow;
        isParent?: boolean;
        isChild?: boolean;
        isBaseChild?: boolean;
    }

    // Lista aplanada en tiempo real de filas visibles para navegación fluida con teclado
    const flatVisibleRows = useMemo<FlatRowItem[]>(() => {
        const list: FlatRowItem[] = [];
        for (const family of displayedFamilies) {
            const isCollapsed = collapsedFamilies[family.id] !== false; // default true
            if (family.isParent) {
                list.push({
                    rowKey: `parent-${family.id}`,
                    productId: family.consolidated.productId,
                    row: family.consolidated,
                    isParent: true
                });
                if (!isCollapsed) {
                    list.push({
                        rowKey: `child-base-${family.parent.productId}`,
                        productId: family.parent.productId,
                        row: family.parent,
                        isChild: true,
                        isBaseChild: true
                    });
                    for (const child of family.children) {
                        list.push({
                            rowKey: `child-${child.productId}`,
                            productId: child.productId,
                            row: child,
                            isChild: true,
                            isBaseChild: false
                        });
                    }
                }
            } else {
                list.push({
                    rowKey: `standalone-${family.id}`,
                    productId: family.parent.productId,
                    row: family.parent,
                    isParent: false,
                    isChild: false
                });
            }
        }
        return list;
    }, [displayedFamilies, collapsedFamilies]);

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

    // Totales verticales para cada una de las 24 columnas (Consolidado reactivo a filtros de columna)
    const columnTotals = useMemo(() => {
        const list = displayedFamilies.map(f => f.isParent ? f.consolidated : f.parent);
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
    }, [displayedFamilies]);

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
        if (!canEditSheet) {
            notify('Solo la jefatura de inventarios o administradores tienen autorización para reabrir una jornada contable.', 'warning');
            return;
        }

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
                    'Inventario en bodega (devoluciones)': rowObj.colU_bodegaPost10am !== null ? Number(rowObj.colU_bodegaPost10am.toFixed(2)) : '',
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
                            'Inventario en bodega (devoluciones)': ch.colU_bodegaPost10am !== null ? Number(ch.colU_bodegaPost10am.toFixed(2)) : '',
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

                // Col V: Inventario en bodega (devoluciones) (U + P)
                const post10Formula = `IF(OR(ISBLANK(U${rNum}), U${rNum}=""), "", U${rNum}+P${rNum})`;
                ws[`V${rNum}`] = { t: 'n', f: post10Formula, v: rowsForExcel[i]['Inventario en bodega (devoluciones)'] };

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
                { wch: 24 }, // V Inventario en bodega (devoluciones)
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

    // Evaluador seguro de expresiones aritméticas tipo Excel (=10+20, +15-5, etc.)
    const evaluateExcelExpression = (val: string | number | null | undefined): number => {
        if (val === undefined || val === null || val === '') return 0;
        if (typeof val === 'number') return isNaN(val) ? 0 : val;

        let str = String(val).trim();
        if (!str) return 0;

        // Si empieza con '=', quitarlo
        if (str.startsWith('=')) {
            str = str.substring(1).trim();
        }

        // Si no contiene operadores aritméticos (+, -, *, /, x, X), usar el parseo directo colombiano
        const hasOperators = /[+\-*/xX]/.test(str);
        if (!hasOperators) {
            return parseColombianInput(str);
        }

        // Normalizar operadores: 'x' o 'X' a '*'
        let expr = str.replace(/x/gi, '*');

        // Si tiene comas decimales, normalizarlas a puntos (ej: 2,5 + 3,5 -> 2.5 + 3.5)
        expr = expr.replace(/,/g, '.');

        // Validación estricta de seguridad: solo dígitos, espacios, puntos decimales, operadores y paréntesis
        if (!/^[\d\s.+\-*/()]+$/.test(expr)) {
            const fallback = parseColombianInput(str);
            return isNaN(fallback) ? 0 : fallback;
        }

        try {
            const result = new Function(`'use strict'; return (${expr});`)();
            if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                return parseFloat(result.toFixed(4));
            }
        } catch {
            const sanitized = expr.replace(/[+\-*/]+$/, '');
            try {
                const result = new Function(`'use strict'; return (${sanitized});`)();
                if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
                    return parseFloat(result.toFixed(4));
                }
            } catch {
                return parseColombianInput(str);
            }
        }

        return parseColombianInput(str);
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

    // Persistencia asíncrona de cambios en celdas estilo Excel con actualización optimista inmediata
    const persistCellChange = async (
        productId: string,
        colKey: string,
        newVal: number,
        currentValue: string
    ) => {
        try {
            const supervisorSignature = profile?.contact_name || user?.email || 'Jefatura de Inventarios';

            let movType: 'entry' | 'exit' | 'adjustment' = 'adjustment';
            let refType: string = INVENTORY_MOVEMENT_SUBTYPES.CORRECTION;
            let qty = newVal;
            const formulaAudit = (currentValue.trim() !== String(newVal) && /[+\-*/xX=]/.test(currentValue)) ? ` (Fórmula: ${currentValue.trim()})` : '';
            let noteDesc = `[AJUSTE AUTORIZADO - ${supervisorSignature}] Columna ${colKey}: ${formatNumber(newVal, 2)}${formulaAudit}`;

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
                noteDesc = `[AJUSTE AUTORIZADO - ${supervisorSignature}] Venta UN: ${newVal} un`;
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
                const unitPrice = costMatrixMap.get(productId) || 0;
                const totalPayroll = Math.round(newVal * unitPrice);

                // Si ya existía un movimiento con colaborador asignado previamente en esta fecha, preservarlo
                const existingEmpMov = movements.find(m => 
                    m.product_id === productId && 
                    m.reference_type === INVENTORY_MOVEMENT_SUBTYPES.EMPLOYEE_SALE &&
                    (m.created_at || '').startsWith(balanceDate)
                );
                let preservedEmp = '';
                if (existingEmpMov?.notes) {
                    const match = existingEmpMov.notes.match(/Empleado:\s*([^|]+)/i);
                    if (match && match[1].trim() && match[1].trim().toLowerCase() !== 'empleado no especificado') {
                        preservedEmp = match[1].trim();
                    }
                }
                const empPart = preservedEmp ? ` | Empleado: ${preservedEmp}` : ' | Empleado: Empleado no especificado';
                const payrollPart = totalPayroll > 0 ? ` | Valor Nómina: $${formatNumber(totalPayroll)}` : '';
                noteDesc = `[AJUSTE AUTORIZADO - ${supervisorSignature}] Columna N: ${formatNumber(newVal, 2)}${formulaAudit}${empPart}${payrollPart}`;
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
                noteDesc = `[AJUSTE AUTORIZADO - ${supervisorSignature}] Cruce a ciegas fin de turno | Contado: ${formatNumber(newVal, 2)}`;
            }

            // Actualización optimista inmediata en memoria para recálculo instantáneo
            const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            if (Math.abs(newVal) < 0.0001) {
                setMovements(prev => prev.filter(m => {
                    const mDate = (m.created_at || '').split('T')[0];
                    return !(m.product_id === productId && m.reference_type === refType && mDate === balanceDate);
                }));
            } else {
                setMovements(prev => {
                    const existingIdx = prev.findIndex(m => {
                        const mDate = (m.created_at || '').split('T')[0];
                        return m.product_id === productId && m.reference_type === refType && mDate === balanceDate;
                    });
                    if (existingIdx >= 0) {
                        const updated = [...prev];
                        updated[existingIdx] = {
                            ...updated[existingIdx],
                            quantity: qty,
                            type: movType,
                            notes: noteDesc
                        };
                        return updated;
                    } else {
                        const newOptMov: RawMovement = {
                            id: optimisticId,
                            product_id: productId,
                            quantity: qty,
                            type: movType,
                            reference_type: refType,
                            notes: noteDesc,
                            created_at: `${balanceDate}T12:00:00.000Z`
                        };
                        return [newOptMov, ...prev];
                    }
                });
            }

            // Persistencia en Supabase
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
            const warehouseId = whData?.id;
            const timestampIso = `${balanceDate}T12:00:00.000Z`;

            if (Math.abs(newVal) < 0.0001) {
                const { error: delErr } = await supabase
                    .from('inventory_movements')
                    .delete()
                    .eq('product_id', productId)
                    .eq('reference_type', refType)
                    .gte('created_at', `${balanceDate}T00:00:00.000Z`)
                    .lte('created_at', `${balanceDate}T23:59:59.999Z`);

                if (delErr) throw delErr;
                (window as any).showToast?.(`Columna ${colKey} restablecida a 0,00`, 'info');
            } else {
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

                    if (existingMovs.length > 1) {
                        const extraIds = existingMovs.slice(1).map(x => x.id);
                        await supabase.from('inventory_movements').delete().in('id', extraIds);
                    }

                    // Sincronizar estado local reemplazando el optimista con el registro oficial
                    setMovements(prev => {
                        const filtered = prev.filter(m => !existingMovs.slice(1).some(ex => ex.id === m.id) && m.id !== optimisticId);
                        const hasTarget = filtered.some(m => m.id === targetId);
                        if (hasTarget) {
                            return filtered.map(m => m.id === targetId ? (updatedMov as any) : m);
                        } else {
                            return [updatedMov as any, ...filtered];
                        }
                    });
                } else {
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
                        setMovements(prev => {
                            const withoutOpt = prev.filter(m => m.id !== optimisticId);
                            return [insertedMov as any, ...withoutOpt];
                        });
                    }
                }

                (window as any).showToast?.(`Columna ${colKey} actualizada a ${formatNumber(newVal, 2)}`, 'success');
            }
        } catch (err: any) {
            console.error('Error en edición de celda:', err);
            notify('Error al guardar cambio: ' + (err.message || 'Error desconocido'), 'error');
        }
    };

    // Navegación fluida y guardado de edición estilo Excel (Enter: abajo, Shift+Enter: arriba, Tab: columna siguiente)
    const handleCommitCellEditAndNavigate = (direction: 'down' | 'up' | 'next_col' | 'prev_col' | 'none' = 'none') => {
        if (!editingCell) return;
        if (!canEditSheet) {
            notify('Solo la jefatura de inventarios o administradores tienen autorización para modificar directamente los valores de esta sábana.', 'warning');
            setEditingCell(null);
            return;
        }

        const currentCell = { ...editingCell };

        // 1. Calcular de inmediato la celda destino para transición de 0ms
        let nextTarget: { rowKey: string; productId: string; colKey: string } | null = null;
        if (direction !== 'none') {
            const currRowIdx = flatVisibleRows.findIndex(r => r.rowKey === currentCell.rowKey);
            if (currRowIdx !== -1) {
                if (direction === 'down') {
                    if (currRowIdx + 1 < flatVisibleRows.length) {
                        const targetRow = flatVisibleRows[currRowIdx + 1];
                        nextTarget = { rowKey: targetRow.rowKey, productId: targetRow.productId, colKey: currentCell.colKey };
                    }
                } else if (direction === 'up') {
                    if (currRowIdx - 1 >= 0) {
                        const targetRow = flatVisibleRows[currRowIdx - 1];
                        nextTarget = { rowKey: targetRow.rowKey, productId: targetRow.productId, colKey: currentCell.colKey };
                    }
                } else if (direction === 'next_col') {
                    const colIdx = EDITABLE_COLUMNS.indexOf(currentCell.colKey as any);
                    if (colIdx !== -1 && colIdx + 1 < EDITABLE_COLUMNS.length) {
                        const targetRow = flatVisibleRows[currRowIdx];
                        nextTarget = { rowKey: targetRow.rowKey, productId: targetRow.productId, colKey: EDITABLE_COLUMNS[colIdx + 1] };
                    } else if (currRowIdx + 1 < flatVisibleRows.length) {
                        // Envolvente tipo Excel a la siguiente fila, primera columna editable
                        const targetRow = flatVisibleRows[currRowIdx + 1];
                        nextTarget = { rowKey: targetRow.rowKey, productId: targetRow.productId, colKey: EDITABLE_COLUMNS[0] };
                    }
                } else if (direction === 'prev_col') {
                    const colIdx = EDITABLE_COLUMNS.indexOf(currentCell.colKey as any);
                    if (colIdx > 0) {
                        const targetRow = flatVisibleRows[currRowIdx];
                        nextTarget = { rowKey: targetRow.rowKey, productId: targetRow.productId, colKey: EDITABLE_COLUMNS[colIdx - 1] };
                    } else if (currRowIdx - 1 >= 0) {
                        // Envolvente hacia fila anterior, última columna editable
                        const targetRow = flatVisibleRows[currRowIdx - 1];
                        nextTarget = { rowKey: targetRow.rowKey, productId: targetRow.productId, colKey: EDITABLE_COLUMNS[EDITABLE_COLUMNS.length - 1] };
                    }
                }
            }
        }

        // 2. Transición inmediata de celda activa
        if (nextTarget) {
            const nextRowItem = flatVisibleRows.find(r => r.rowKey === nextTarget!.rowKey);
            const nextVal = nextRowItem ? getRowColumnValue(nextRowItem.row, nextTarget.colKey) : 0;
            const decimals = getColumnDecimals(nextTarget.colKey);
            setEditingCell({
                rowKey: nextTarget.rowKey,
                productId: nextTarget.productId,
                colKey: nextTarget.colKey,
                initialValue: nextVal || 0,
                currentValue: (nextVal === null || nextVal === 0) ? '' : formatNumber(nextVal, decimals)
            });
        } else {
            setEditingCell(null);
        }

        // 3. Evaluar si el valor numérico cambió para guardar en base de datos
        const newVal = evaluateExcelExpression(currentCell.currentValue);
        if (isNaN(newVal) || Math.abs(newVal - currentCell.initialValue) < 0.0001) {
            return;
        }

        // 4. Persistir asíncronamente en segundo plano
        persistCellChange(currentCell.productId, currentCell.colKey, newVal, currentCell.currentValue);
    };

    // Renderizado de celda editable estilo Excel con soporte de navegación fluida
    const renderEditableCell = (
        rowKey: string,
        productId: string,
        colKey: string,
        val: number | null,
        style: React.CSSProperties = {},
        decimals: number = 2,
        isReadonly: boolean = false,
        extraChildren?: React.ReactNode
    ) => {
        const isEditing = !isReadonly && canEditSheet && sheetMode === 'manual_edit' && editingCell?.rowKey === rowKey && editingCell?.colKey === colKey;

        if (isEditing) {
            return (
                <td key={`cell-${rowKey}-${colKey}`} style={{ ...style, padding: '2px 4px', textAlign: 'right' }}>
                    <input
                        ref={el => {
                            if (el) {
                                el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
                            }
                        }}
                        type="text"
                        autoFocus
                        value={editingCell.currentValue}
                        title="Navegación tipo Excel: Enter para ir abajo, Shift+Enter para ir arriba, Tab para ir al lado, Esc para cancelar. Soporta fórmulas (ej. =10+20 o +15-5)."
                        onFocus={e => e.target.select()}
                        onChange={e => setEditingCell(prev => prev ? { ...prev, currentValue: e.target.value } : null)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                isNavigatingRef.current = true;
                                handleCommitCellEditAndNavigate(e.shiftKey ? 'up' : 'down');
                            } else if (e.key === 'Tab') {
                                e.preventDefault();
                                isNavigatingRef.current = true;
                                handleCommitCellEditAndNavigate(e.shiftKey ? 'prev_col' : 'next_col');
                            } else if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                isNavigatingRef.current = true;
                                handleCommitCellEditAndNavigate('down');
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                isNavigatingRef.current = true;
                                handleCommitCellEditAndNavigate('up');
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingCell(null);
                            }
                        }}
                        onBlur={() => {
                            if (isNavigatingRef.current) {
                                isNavigatingRef.current = false;
                                return;
                            }
                            handleCommitCellEditAndNavigate('none');
                        }}
                        style={{
                            width: '100%',
                            minWidth: '65px',
                            maxWidth: '110px',
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
                            boxShadow: '0 0 0 2px rgba(13, 122, 87, 0.25)',
                            boxSizing: 'border-box'
                        }}
                    />
                </td>
            );
        }

        const effectiveReadonly = isReadonly || !canEditSheet || sheetMode === 'view';

        return (
            <td
                key={`cell-${rowKey}-${colKey}`}
                onClick={() => {
                    if (closingRecord?.is_locked) {
                        notify(`La jornada del ${balanceDate} está cerrada y congelada oficialmente. Para modificar registros debes reabrir la jornada contable.`, 'warning');
                        return;
                    }
                    if (sheetMode === 'view') {
                        if (canEditSheet) {
                            notify('Estás en la Sábana Oficial (Solo Vista). Para editar celdas o realizar ajustes, activa el "Modo Edición" en la barra superior.', 'info');
                        }
                        return;
                    }
                    if (!canEditSheet) {
                        notify('Acceso restringido: Esta sábana maestra es de solo lectura. Únicamente la jefatura de inventarios o administradores tienen potestad de edición.', 'warning');
                        return;
                    }
                    if (!effectiveReadonly) {
                        setEditingCell({
                            rowKey,
                            productId,
                            colKey,
                            initialValue: val || 0,
                            currentValue: (val === null || val === 0) ? '' : formatNumber(val, decimals)
                        });
                    }
                }}
                style={{
                    ...style,
                    cursor: effectiveReadonly ? 'default' : 'pointer',
                    userSelect: 'none'
                }}
                title={sheetMode === 'view' ? 'Sábana Oficial (Solo Vista) • Conmuta a Modo Edición para editar' : (effectiveReadonly ? 'Celda calculada de solo lectura' : 'Clic para editar este valor')}
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
                    <td 
                        key={`cell-${key}-compact-id`}
                        style={{ 
                        padding: '6px 8px', 
                        width: '240px',
                        minWidth: '240px',
                        maxWidth: '240px',
                        position: isPanesFrozen ? 'sticky' : 'static',
                        left: isPanesFrozen ? 0 : undefined,
                        zIndex: isPanesFrozen ? 10 : undefined,
                        backgroundColor: rowBg,
                        borderRight: '2px solid #CBD5E1',
                        borderBottom: cellBorderBottom,
                        boxShadow: isPanesFrozen ? '4px 0 10px -2px rgba(0,0,0,0.06)' : undefined
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
                    <React.Fragment key={`cell-${key}-traditional-id`}>
                        {/* A: Fecha (Sticky) */}
                        <td 
                            key={`cell-${key}-A`}
                            style={{ 
                            padding: '6px 8px', 
                            color: isParent ? '#854D0E' : (isChild ? '#94A3B8' : '#64748B'), 
                            fontSize: '0.72rem',
                            fontWeight: isParent ? '800' : 'normal',
                            position: isPanesFrozen ? 'sticky' : 'static',
                            left: isPanesFrozen ? 0 : undefined,
                            zIndex: isPanesFrozen ? 10 : undefined,
                            backgroundColor: rowBg,
                            borderBottom: cellBorderBottom
                        }}>
                            {row.colA_date}
                        </td>

                        {/* B: ID Prod (Sticky) */}
                        <td 
                            key={`cell-${key}-B`}
                            style={{ 
                            padding: '6px 8px', 
                            textAlign: 'center', 
                            fontWeight: '800', 
                            color: isParent ? '#854D0E' : '#1E293B',
                            position: isPanesFrozen ? 'sticky' : 'static',
                            left: isPanesFrozen ? '85px' : undefined,
                            zIndex: isPanesFrozen ? 10 : undefined,
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
                            key={`cell-${key}-C`}
                            title={isCellCollapsed ? (cellInfo ? `Célula: ${cellInfo.name || cellInfo.short_name}` : `Célula: ${row.colC_inventoryGroup}`) : undefined}
                            style={{ 
                                padding: isCellCollapsed ? '6px 4px' : '6px 8px', 
                                textAlign: isCellCollapsed ? 'center' : 'left', 
                                position: isPanesFrozen ? 'sticky' : 'static', 
                                left: isPanesFrozen ? '155px' : undefined, 
                                zIndex: isPanesFrozen ? 10 : undefined, 
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
                        <td 
                            key={`cell-${key}-D`}
                            style={{ 
                            padding: '6px 10px', 
                            fontWeight: isParent ? '800' : '700', 
                            color: isParent ? '#854D0E' : '#0F172A', 
                            borderRight: '2px solid #CBD5E1',
                            borderBottom: cellBorderBottom,
                            position: isPanesFrozen ? 'sticky' : 'static', 
                            left: isPanesFrozen ? (isCellCollapsed ? '199px' : '285px') : undefined, 
                            zIndex: isPanesFrozen ? 10 : undefined, 
                            backgroundColor: rowBg, 
                            boxShadow: isPanesFrozen ? '4px 0 10px -2px rgba(0,0,0,0.06)' : undefined, 
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
                    </React.Fragment>
                )}

                {/* Columnas Numéricas Dinámicas según columnOrder (SPEC.md §8.8.10) */}
                {(() => {
                    const numericalCellRenderers: Record<string, () => React.ReactNode> = {
                        E: () => (
                            <td key={`cell-${key}-E`} style={{
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
                        ),
                        F: () => renderEditableCell(key, row.productId, 'F', row.colF_corrections, {
                            width: '95px', minWidth: '95px', maxWidth: '95px',
                            padding: '4px 6px',
                            textAlign: 'right',
                            fontWeight: isParent ? '800' : (row.colF_corrections !== 0 ? '700' : '400'),
                            color: row.colF_corrections > 0 ? '#059669' : row.colF_corrections < 0 ? '#DC2626' : '#94A3B8',
                            borderBottom: cellBorderBottom
                        }, 2),
                        G: () => renderEditableCell(key, row.productId, 'G', row.colG_purchases, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: isParent ? '800' : '700', color: row.colG_purchases > 0 ? '#0F172A' : '#94A3B8', borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2),
                        H: () => renderEditableCell(key, row.productId, 'H', row.colH_salesKg, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colH_salesKg > 0 ? '#1E40AF' : '#94A3B8', fontWeight: isParent ? '800' : '700', borderBottom: cellBorderBottom }, 2),
                        I: () => renderEditableCell(key, row.productId, 'I', row.colI_salesUnits, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: '#64748B', fontWeight: isParent ? '700' : '400', borderBottom: cellBorderBottom }, 0),
                        J: () => renderEditableCell(key, row.productId, 'J', row.colJ_weightSalesUnits, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colJ_weightSalesUnits > 0 ? '#1E40AF' : '#94A3B8', fontWeight: isParent ? '800' : '400', borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2),
                        K: () => renderEditableCell(key, row.productId, 'K', row.colK_shortage, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colK_shortage > 0 ? '#DC2626' : '#94A3B8', fontWeight: isParent ? '800' : (row.colK_shortage > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2),
                        L: () => renderEditableCell(key, row.productId, 'L', row.colL_unshipped, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colL_unshipped > 0 ? '#059669' : '#94A3B8', fontWeight: isParent ? '800' : '400', borderBottom: cellBorderBottom }, 2),
                        M: () => renderEditableCell(key, row.productId, 'M', row.colM_additionalSales, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colM_additionalSales > 0 ? '#7E22CE' : '#94A3B8', fontWeight: isParent ? '800' : (row.colM_additionalSales > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2),
                        N: () => renderEditableCell(key, row.productId, 'N', row.colN_employeeSales, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colN_employeeSales > 0 ? '#2563EB' : '#94A3B8', fontWeight: isParent ? '800' : (row.colN_employeeSales > 0 ? '700' : '400'), borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2),
                        O: () => renderEditableCell(key, row.productId, 'O', row.colO_returns, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colO_returns > 0 ? '#D97706' : '#94A3B8', fontWeight: isParent ? '800' : (row.colO_returns > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2),
                        P: () => renderEditableCell(key, row.productId, 'P', row.colP_weighingWaste, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colP_weighingWaste > 0 ? '#D97706' : '#94A3B8', fontWeight: isParent ? '800' : (row.colP_weighingWaste > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2),
                        Q: () => renderEditableCell(key, row.productId, 'Q', row.colQ_damageWaste, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colQ_damageWaste > 0 ? '#DC2626' : '#94A3B8', fontWeight: isParent ? '800' : (row.colQ_damageWaste > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2, false,
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
                        ),
                        R: () => renderEditableCell(key, row.productId, 'R', row.colR_cleaningWaste, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colR_cleaningWaste > 0 ? '#B45309' : '#94A3B8', fontWeight: isParent ? '800' : (row.colR_cleaningWaste > 0 ? '700' : '400'), borderRight: '2px solid #E2E8F0', borderBottom: cellBorderBottom }, 2, false,
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
                        ),
                        S: () => (
                            <td key={`cell-${key}-S`} style={{ 
                                padding: '6px 8px', 
                                textAlign: 'right', 
                                fontWeight: '900', 
                                width: '95px',
                                minWidth: '95px',
                                maxWidth: '95px',
                                color: isParent ? '#064E3B' : '#0F172A', 
                                backgroundColor: isParent ? '#FEF08A' : (isChild ? 'rgba(13, 148, 136, 0.05)' : 'rgba(13, 148, 136, 0.08)'),
                                borderLeft: '2px solid #0D9488',
                                borderRight: '2px solid #0D9488',
                                borderBottom: cellBorderBottom,
                                boxShadow: isParent ? 'inset 0 0 0 1px rgba(13, 148, 136, 0.3)' : undefined,
                                fontFamily: 'monospace, sans-serif'
                            }}>
                                {renderNumericCell(row.colS_calculated)}
                            </td>
                        ),
                        T: () => renderEditableCell(key, row.productId, 'T', row.colT_physicalCount, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.hasPhysicalCount ? '#0D7A57' : '#94A3B8', backgroundColor: isParent ? rowBg : (isChild ? '#FFFFFF' : '#F8FAFC'), borderBottom: cellBorderBottom }, 2),
                        U: () => (
                            <td key={`cell-${key}-U`} style={{ width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: isParent ? '#1E1B4B' : '#0F172A', backgroundColor: isParent ? rowBg : (isChild ? '#FFFFFF' : '#F8FAFC'), borderRight: '2px solid #CBD5E1', borderBottom: cellBorderBottom }} title="Inventario en bodega (devoluciones) = Conteo Real (T) + Devoluciones (O)">
                                {row.colU_bodegaPost10am !== null ? renderNumericCell(row.colU_bodegaPost10am) : <span style={{ color: '#CBD5E1' }}>-</span>}
                            </td>
                        ),
                        V: () => (
                            <td key={`cell-${key}-V`} style={{ width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.colV_missing > 0 ? '#DC2626' : '#94A3B8', borderBottom: cellBorderBottom }}>
                                {row.colV_missing > 0 ? renderNumericCell(row.colV_missing) : <span style={{ color: '#CBD5E1' }}>-</span>}
                            </td>
                        ),
                        W: () => (
                            <td key={`cell-${key}-W`} style={{ width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', fontWeight: '800', color: row.colW_surplus > 0 ? '#059669' : '#94A3B8', borderRight: '2px solid #CBD5E1', borderBottom: cellBorderBottom }}>
                                {row.colW_surplus > 0 ? renderNumericCell(row.colW_surplus) : <span style={{ color: '#CBD5E1' }}>-</span>}
                            </td>
                        ),
                        X: () => renderEditableCell(key, row.productId, 'X', row.colX_foodBank, { width: '95px', minWidth: '95px', maxWidth: '95px', padding: '6px 8px', textAlign: 'right', color: row.colX_foodBank > 0 ? '#EC4899' : '#94A3B8', fontWeight: isParent ? '800' : (row.colX_foodBank > 0 ? '700' : '400'), borderBottom: cellBorderBottom }, 2, false,
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
                        )
                    };
                    return columnOrder.map(colKey => numericalCellRenderers[colKey]?.() ?? null);
                })()}
            </tr>
        );
    };

    return (
        <div style={isFullscreen ? {
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 9999,
            backgroundColor: '#0F172A',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxSizing: 'border-box',
            padding: '0.5rem 0.75rem',
            gap: '0.4rem',
            fontFamily: 'var(--font-outfit), sans-serif'
        } : {
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            fontFamily: 'var(--font-outfit), sans-serif'
        }}>
            <style>{`
                .daily-balance-table tr:hover td {
                    background-color: #F1F5F9 !important;
                }
                @keyframes subtlePulseAmber {
                    0%, 100% {
                        box-shadow: 0 1px 3px rgba(217, 119, 6, 0.3), 0 0 0 0 rgba(217, 119, 6, 0.45);
                    }
                    50% {
                        box-shadow: 0 2px 8px rgba(217, 119, 6, 0.45), 0 0 0 3px rgba(217, 119, 6, 0.15);
                    }
                }
                .modo-edicion-pulse {
                    animation: subtlePulseAmber 2.2s infinite ease-in-out;
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

            {/* 1. TARJETAS DE KPIS NANO-BENTO (COLAPSABLES BAJO DEMANDA) */}
            {showKpis && (
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
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748B' }}>
                            Faltantes (Col V)
                        </span>
                        <div style={{ width: '22px', height: '22px', borderRadius: '6px', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <TrendingDown size={12} color="#475569" />
                        </div>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0F172A', marginTop: '2px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        -{formatNumber(kpis.totalMissingKg, 1)} <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B' }}>kg</span>
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '1px', fontWeight: '800' }}>
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
            )}

            {/* 2. MASTER COMMAND CONSOLE: TOOLBAR ENTERPRISE UNIFICADA DE 2 NIVELES */}
            <div 
                ref={dockRef}
                style={{
                    position: isFullscreen ? 'relative' : 'sticky',
                    top: isFullscreen ? 0 : '80px',
                    zIndex: 70,
                    backgroundColor: 'rgba(255, 255, 255, 0.98)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    borderRadius: isFullscreen ? '10px' : '14px',
                    border: '1px solid #E2E8F0',
                    padding: '0.50rem 0.85rem',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.45rem',
                    marginBottom: '0.55rem',
                    flexShrink: 0,
                    transition: 'all 0.2s ease-in-out'
                }}
            >
                {/* LÍNEA 1: CONTEXTO TEMPORAL, MODO DE HOJA, BÚSQUEDA, FILTRO Y ACCIONES */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.65rem',
                    flexWrap: 'nowrap'
                }}>
                    {/* IZQUIERDA: Selector Temporal + Segmented Mode Switch (Sábana Oficial vs Hoja Manual) */}
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
                                className="hide-native-date-picker-indicator"
                                value={balanceDate}
                                onChange={e => handleDateChange(e.target.value)}
                                onClick={(e) => {
                                    try {
                                        (e.target as any).showPicker?.();
                                    } catch (_) {}
                                }}
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
                                onClick={() => handleDateChange(todayStr)}
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

                        {/* SWITCH DE MODO: Sábana Oficial (Vista) vs Hoja Manual (Edición / Contingencia) */}
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
                                onClick={() => setSheetMode('view')}
                                style={{
                                    padding: '0 0.65rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: sheetMode === 'view' ? '#0F172A' : 'transparent',
                                    color: sheetMode === 'view' ? '#FFFFFF' : '#64748B',
                                    fontSize: '0.73rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: sheetMode === 'view' ? '0 1px 3px rgba(15, 23, 42, 0.25)' : 'none'
                                }}
                                title="Sábana Oficial: Balance consolidado inmutable para consulta, gerencia y auditoría"
                            >
                                <Eye size={13} strokeWidth={2.2} />
                                <span>Sábana Oficial</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleSwitchMode('manual_edit')}
                                className={sheetMode === 'manual_edit' ? 'modo-edicion-pulse' : ''}
                                style={{
                                    padding: '0 0.65rem',
                                    height: '100%',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: sheetMode === 'manual_edit' ? '#D97706' : 'transparent',
                                    color: sheetMode === 'manual_edit' ? '#FFFFFF' : '#64748B',
                                    fontSize: '0.73rem',
                                    fontWeight: '800',
                                    cursor: canEditSheet ? 'pointer' : 'not-allowed',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: sheetMode === 'manual_edit' ? '0 1px 3px rgba(217, 119, 6, 0.35)' : 'none'
                                }}
                                title={canEditSheet ? "Modo Edición: Ajuste de celdas, contingencias y registros de inventario" : "Acceso restringido a Jefatura de Inventarios"}
                            >
                                <PenTool size={13} strokeWidth={2.4} color={sheetMode === 'manual_edit' ? '#FEF3C7' : 'currentColor'} />
                                <span>Modo Edición</span>
                                {sheetMode === 'manual_edit' && (
                                    <span style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        backgroundColor: '#FEF08A',
                                        display: 'inline-block',
                                        marginLeft: '1px',
                                        boxShadow: '0 0 4px #FDE047'
                                    }} />
                                )}
                            </button>
                        </div>
                    </div>

                    {/* CENTRO: Buscador Omnibox Prominente (Protagonista de Navegación) */}
                    <div style={{
                        position: 'relative',
                        flex: 1,
                        minWidth: '260px',
                        maxWidth: '680px'
                    }}>
                        <div style={{
                            position: 'absolute',
                            left: '0.75rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#0D7A57',
                            display: 'flex',
                            alignItems: 'center',
                            pointerEvents: 'none'
                        }}>
                            <Search size={15} strokeWidth={2.2} />
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar producto por nombre, #código, @categoría o célula..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.35rem 3.8rem 0.35rem 2.25rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.79rem',
                                fontWeight: '500',
                                backgroundColor: '#FFFFFF',
                                color: '#0F172A',
                                outline: 'none',
                                height: '32px',
                                boxSizing: 'border-box',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                transition: 'all 0.2s'
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.borderColor = '#0D7A57';
                                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13, 122, 87, 0.15)';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.borderColor = '#CBD5E1';
                                e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)';
                            }}
                        />
                        {searchQuery ? (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    position: 'absolute',
                                    right: '0.55rem',
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
                                <X size={12} strokeWidth={2.2} />
                            </button>
                        ) : (
                            <span style={{
                                position: 'absolute',
                                right: '0.55rem',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                fontSize: '0.62rem',
                                fontWeight: '700',
                                color: '#94A3B8',
                                backgroundColor: '#F1F5F9',
                                padding: '2px 5px',
                                borderRadius: '4px',
                                pointerEvents: 'none',
                                userSelect: 'none'
                            }}>
                                #ID @tag
                            </span>
                        )}
                    </div>

                    {/* DERECHA: Filtro Con Movimiento + Acciones dependientes del modo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                        {/* Segmented Control Con Movimiento / Todos */}
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
                                    gap: '4px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: onlyWithMovement ? '0 1px 3px rgba(13, 122, 87, 0.3)' : 'none'
                                }}
                                title="Mostrar familias con movimiento hoy"
                            >
                                <Zap size={11} color={onlyWithMovement ? '#FCD34D' : '#0D7A57'} strokeWidth={2.5} />
                                <span>Con Mov.</span>
                                <span style={{
                                    backgroundColor: onlyWithMovement ? 'rgba(255,255,255,0.22)' : '#E2E8F0',
                                    color: onlyWithMovement ? '#FFFFFF' : '#0F172A',
                                    padding: '1px 4px',
                                    borderRadius: '4px',
                                    fontSize: '0.62rem',
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
                                    gap: '3px',
                                    transition: 'all 0.15s ease',
                                    boxShadow: !onlyWithMovement ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                }}
                                title="Mostrar todo el catálogo de familias"
                            >
                                <span>Todos</span>
                                <span style={{
                                    backgroundColor: !onlyWithMovement ? '#F1F5F9' : '#E2E8F0',
                                    color: !onlyWithMovement ? '#0F172A' : '#64748B',
                                    padding: '1px 4px',
                                    borderRadius: '4px',
                                    fontSize: '0.62rem',
                                    fontWeight: '800'
                                }}>
                                    {dailyFamilies.length}
                                </span>
                            </button>
                        </div>

                        {/* Separador vertical sutil */}
                        <div style={{ width: '1px', height: '18px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

                        {/* Botón Conmutador de Filtros por Columna (SPEC.md §8.8.9) */}
                        <button
                            type="button"
                            onClick={() => setIsColumnFilterOpen(prev => !prev)}
                            style={{
                                padding: '0 0.65rem',
                                height: '32px',
                                borderRadius: '8px',
                                border: isColumnFilterOpen ? '1.5px solid #10B981' : '1px solid #CBD5E1',
                                backgroundColor: isColumnFilterOpen ? '#ECFDF5' : '#FFFFFF',
                                color: isColumnFilterOpen ? '#047857' : '#475569',
                                fontSize: '0.73rem',
                                fontWeight: '800',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                transition: 'all 0.15s ease'
                            }}
                            title="Alternar Fila de Filtros en Cabecera (Atajo: Ctrl+Shift+L)"
                        >
                            <Search size={13} strokeWidth={2.2} />
                            <span>Filtros Columna</span>
                            {activeFilterCount > 0 && (
                                <span style={{
                                    backgroundColor: '#10B981',
                                    color: '#FFFFFF',
                                    fontSize: '0.62rem',
                                    fontWeight: '900',
                                    padding: '1px 5px',
                                    borderRadius: '999px',
                                    lineHeight: 1.2
                                }}>
                                    {activeFilterCount}
                                </span>
                            )}
                        </button>

                        {/* Botón Limpiar Filtros de Columna si hay activos */}
                        {activeFilterCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setColumnFilters({})}
                                style={{
                                    padding: '0 0.5rem',
                                    height: '32px',
                                    borderRadius: '8px',
                                    border: '1px solid #FECACA',
                                    backgroundColor: '#FEF2F2',
                                    color: '#DC2626',
                                    fontSize: '0.70rem',
                                    fontWeight: '700',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Limpiar todos los filtros por columna"
                            >
                                <X size={12} strokeWidth={2.5} />
                                <span>Limpiar</span>
                            </button>
                        )}

                        {/* Botón Restablecer Orden de Columnas si fue reorganizado (SPEC.md §8.8.10) */}
                        {isColumnOrderCustom && (
                            <button
                                type="button"
                                onClick={resetColumnOrder}
                                style={{
                                    padding: '0 0.55rem',
                                    height: '32px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #F59E0B',
                                    backgroundColor: '#FFFBEB',
                                    color: '#B45309',
                                    fontSize: '0.70rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(245, 158, 11, 0.15)',
                                    transition: 'all 0.15s ease'
                                }}
                                title="Restablecer columnas al orden canónico E - X"
                            >
                                <RotateCcw size={12} strokeWidth={2.5} />
                                <span>Restablecer Orden</span>
                            </button>
                        )}

                        {/* Separador vertical sutil */}
                        <div style={{ width: '1px', height: '18px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

                        {/* Estado de Cierre y Botón de Cierre */}
                        {closingRecord?.is_locked ? (
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                backgroundColor: '#DCFCE7',
                                border: '1px solid #16A34A',
                                color: '#15803D',
                                padding: '0 0.65rem',
                                height: '32px',
                                borderRadius: '8px',
                                fontSize: '0.73rem',
                                fontWeight: '800',
                                boxShadow: '0 1px 2px rgba(22, 163, 74, 0.15)'
                            }} title={`Cerrado oficialmente el ${new Date(closingRecord.closed_at).toLocaleString()} por ${closingRecord.closed_by_name || 'Supervisor'}`}>
                                <Lock size={12} strokeWidth={2.5} />
                                <span>Cerrado</span>
                                {canEditSheet && sheetMode === 'manual_edit' && (
                                    <button
                                        type="button"
                                        onClick={handleReopenClosing}
                                        style={{
                                            marginLeft: '3px',
                                            background: 'none',
                                            border: 'none',
                                            color: '#15803D',
                                            cursor: 'pointer',
                                            fontSize: '0.66rem',
                                            textDecoration: 'underline',
                                            padding: 0
                                        }}
                                    >
                                        (Reabrir)
                                    </button>
                                )}
                            </div>
                        ) : (
                            canEditSheet && sheetMode === 'manual_edit' && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!canEditSheet) {
                                            notify('Solo la jefatura de inventarios o administradores pueden congelar el cierre oficial del día.', 'warning');
                                            return;
                                        }
                                        setIsClosingModalOpen(true);
                                    }}
                                    style={{
                                        padding: '0 0.65rem',
                                        height: '32px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#16A34A',
                                        color: '#FFFFFF',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        cursor: 'pointer',
                                        boxShadow: '0 1px 3px rgba(22, 163, 74, 0.3)',
                                        transition: 'all 0.15s ease'
                                    }}
                                    title="Cerrar Día: Conciliar saldos, congelar jornada contable y trasladar Conteo Físico a Saldo Inicial siguiente."
                                >
                                    <Lock size={12} strokeWidth={2.2} />
                                    <span>Cerrar Día</span>
                                </button>
                            )
                        )}

                        {/* Botón de actualización */}
                        <button
                            type="button"
                            onClick={() => loadDailyData(true)}
                            title="Actualizar datos oficiales"
                            style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#64748B',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.color = '#0F172A'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#FFFFFF'; e.currentTarget.style.color = '#64748B'; }}
                        >
                            <RefreshCw size={13} strokeWidth={2} className={refreshing ? 'animate-spin' : ''} />
                        </button>

                        {/* Separador vertical sutil */}
                        <div style={{ width: '1px', height: '18px', backgroundColor: '#E2E8F0', margin: '0 2px' }} />

                        {/* Botón Modo Focus / Salir Focus (SPEC.md §8.8.7) */}
                        {isFullscreen ? (
                            <button
                                type="button"
                                onClick={handleExitFullscreen}
                                title="Salir del Modo Focus y volver a la vista ejecutiva normal (Esc)"
                                style={{
                                    padding: '0 0.75rem',
                                    height: '32px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #EF4444',
                                    backgroundColor: '#FEF2F2',
                                    color: '#DC2626',
                                    fontSize: '0.73rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(239, 68, 68, 0.2)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <X size={14} strokeWidth={2.5} />
                                <span>Salir Focus</span>
                                <span style={{ fontSize: '0.60rem', opacity: 0.8, backgroundColor: '#FEE2E2', padding: '1px 5px', borderRadius: '3px' }}>Esc</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsFullscreen(true)}
                                title="Modo Consola Focus: Ocupa toda la pantalla (100vw × 100vh) para operar la matriz completa sin distracciones"
                                style={{
                                    padding: '0 0.65rem',
                                    height: '32px',
                                    borderRadius: '8px',
                                    border: '1.5px solid #0F172A',
                                    backgroundColor: '#0F172A',
                                    color: '#FFFFFF',
                                    fontSize: '0.73rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 4px rgba(15, 23, 42, 0.25)',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <Maximize2 size={13} strokeWidth={2.2} />
                                <span>Modo Focus</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* LÍNEA 2: CÉLULAS DE TRABAJO (ÚNICA FUENTE) + DENSIDAD + SALTO A BLOQUE */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.6rem',
                    paddingTop: '3px',
                    borderTop: '1px solid #F1F5F9'
                }}>
                    {/* IZQUIERDA: Chips de Células de Trabajo (Compactos con 100% visibilidad) */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        overflowX: 'auto',
                        scrollbarWidth: 'none',
                        flex: 1
                    }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.70rem',
                            fontWeight: '700',
                            color: '#64748B',
                            marginRight: '3px',
                            flexShrink: 0
                        }}>
                            <Layers size={12} color="#0D7A57" strokeWidth={2.2} />
                            <span>Categorías:</span>
                        </div>
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
                                    title={opt.fullLabel ? `${opt.fullLabel} (${count} SKUs)` : `${opt.label} (${count} SKUs)`}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '2px 7px',
                                        borderRadius: '16px',
                                        border: isSelected ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                        backgroundColor: isSelected ? '#0D7A57' : '#FFFFFF',
                                        color: isSelected ? '#FFFFFF' : '#334155',
                                        fontSize: '0.71rem',
                                        fontWeight: isSelected ? '800' : '600',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        boxShadow: isSelected ? '0 1px 3px rgba(13, 122, 87, 0.2)' : 'none',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span>{opt.label}</span>
                                    <span style={{
                                        padding: '1px 5px',
                                        borderRadius: '8px',
                                        fontSize: '0.61rem',
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

                    {/* DERECHA: Herramientas de Archivo Excel (Modo Edición), Telemetría & Vista */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
                        {/* Botones de Operación Excel (Solo en Modo Edición) */}
                        {sheetMode === 'manual_edit' && (
                            <>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    backgroundColor: '#FFFFFF',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    padding: '2px',
                                    gap: '2px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                    height: '28px',
                                    boxSizing: 'border-box'
                                }}>
                                    <button
                                        type="button"
                                        onClick={handleExportOfficialExcel}
                                        style={{
                                            padding: '0 0.55rem',
                                            height: '100%',
                                            borderRadius: '4px',
                                            border: 'none',
                                            backgroundColor: '#ECFDF5',
                                            color: '#0D7A57',
                                            fontSize: '0.70rem',
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
                                        <FileSpreadsheet size={12} color="#0D7A57" strokeWidth={2.2} />
                                        <span>Descargar Excel</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsExcelImportModalOpen(true)}
                                        style={{
                                            padding: '0 0.55rem',
                                            height: '100%',
                                            borderRadius: '4px',
                                            border: 'none',
                                            backgroundColor: '#EFF6FF',
                                            color: '#1D4ED8',
                                            fontSize: '0.70rem',
                                            fontWeight: '800',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                        title="Cargar / Simular Operación Diaria desde Excel (.xlsx)"
                                    >
                                        <Upload size={12} color="#1D4ED8" strokeWidth={2.2} />
                                        <span>Cargar Excel</span>
                                    </button>
                                </div>

                                <div style={{ width: '1px', height: '16px', backgroundColor: '#CBD5E1', margin: '0 1px' }} />
                            </>
                        )}

                        {/* Indicador de telemetría de SKUs y Familias */}
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '0 0.55rem',
                            height: '28px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '6px',
                            fontSize: '0.70rem',
                            color: '#64748B',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                        }}>
                            <span>Mostrando:</span>
                            <strong style={{ color: '#0F172A', fontWeight: '800' }}>{filteredFamilies.length}</strong>
                            <span style={{ color: '#94A3B8' }}>familias</span>
                            <span style={{ color: '#CBD5E1' }}>•</span>
                            <strong style={{ color: '#0D7A57', fontWeight: '800' }}>{totalActiveSkusCount}</strong>
                            <span style={{ color: '#94A3B8' }}>SKUs</span>
                        </div>

                        <div style={{ width: '1px', height: '16px', backgroundColor: '#CBD5E1', margin: '0 1px' }} />

                        {/* Toggle expandir / colapsar familias */}
                        <button
                            type="button"
                            onClick={toggleAllFamilies}
                            style={{
                                padding: '0 0.55rem',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                color: '#334155',
                                fontSize: '0.71rem',
                                fontWeight: '700',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                transition: 'all 0.15s ease'
                            }}
                            title={allCollapsed ? "Expandir todas las presentaciones hijas" : "Colapsar todas las familias a vista compacta"}
                        >
                            {allCollapsed ? <FolderPlus size={12} color="#0D7A57" strokeWidth={2.2} /> : <FolderMinus size={12} color="#D97706" strokeWidth={2.2} />}
                            <span>{allCollapsed ? "Expandir" : "Colapsar"}</span>
                        </button>

                        {/* Toggle Columnas A-D Compacto */}
                        <button
                            type="button"
                            onClick={() => setIsCompactIdentification(!isCompactIdentification)}
                            title={isCompactIdentification ? "Cambiar a vista de 4 columnas separadas (A: Fecha, B: ID, C: Célula, D: Producto)" : "Modo Compacto: Fusiona A-D en una sola columna de 220px (Ahorra hasta 170px)"}
                            style={{
                                padding: '0 0.55rem',
                                height: '28px',
                                borderRadius: '6px',
                                border: isCompactIdentification ? '1px solid #A7F3D0' : '1px solid #CBD5E1',
                                backgroundColor: isCompactIdentification ? '#ECFDF5' : '#FFFFFF',
                                color: isCompactIdentification ? '#0D7A57' : '#64748B',
                                fontSize: '0.71rem',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Columns size={12} color={isCompactIdentification ? '#0D7A57' : '#64748B'} strokeWidth={2.2} />
                            <span>{isCompactIdentification ? 'A-D Compacto' : 'Cols A-D'}</span>
                        </button>

                        {/* Toggle Inmovilizar / Movilizar Filas (Estilo Paneles de Excel) */}
                        <button
                            type="button"
                            onClick={togglePanesFrozen}
                            style={{
                                padding: '0 0.55rem',
                                height: '28px',
                                borderRadius: '6px',
                                border: isPanesFrozen ? '1px solid #A7F3D0' : '1px solid #CBD5E1',
                                backgroundColor: isPanesFrozen ? '#ECFDF5' : '#FFFFFF',
                                color: isPanesFrozen ? '#0D7A57' : '#64748B',
                                fontSize: '0.71rem',
                                fontWeight: '700',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                transition: 'all 0.15s ease'
                            }}
                            title={isPanesFrozen ? "Paneles Inmovilizados: Encabezados y columnas fijos al desplazarte. Clic para 'Movilizar Filas' como en Excel." : "Paneles Movilizados: Desplazamiento libre continuo de todas las filas y encabezados. Clic para 'Inmovilizar Filas'."}
                        >
                            {isPanesFrozen ? <Pin size={12} color="#0D7A57" strokeWidth={2.2} /> : <PinOff size={12} color="#64748B" strokeWidth={2.2} />}
                            <span>{isPanesFrozen ? 'Inmovilizado' : 'Movilizar Filas'}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* TABLA DE 24 COLUMNAS LEAN ENTERPRISE */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: isFullscreen ? '10px' : '14px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 4px 20px -4px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.04)',
                overflow: 'hidden',
                position: 'relative',
                flex: isFullscreen ? 1 : undefined,
                display: isFullscreen ? 'flex' : undefined,
                flexDirection: isFullscreen ? 'column' : undefined,
                minHeight: 0
            }}>
                <div 
                    ref={tableScrollRef}
                    onScroll={handleTableScroll}
                    style={{ 
                        maxHeight: isFullscreen ? 'none' : 'calc(100vh - 210px)',
                        flex: isFullscreen ? 1 : undefined,
                        overflowX: 'auto', 
                        overflowY: 'auto',
                        position: 'relative',
                        WebkitOverflowScrolling: 'touch'
                    }}
                >
                    <table className="daily-balance-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {/* Cabecera Aplanada a 1 Solo Nivel (32px) + Fila Conmutable de Filtros (SPEC.md §8.8.8, §8.8.9, §8.8.10) */}
                        <thead style={{ 
                            position: isPanesFrozen ? 'sticky' : 'static', 
                            top: isPanesFrozen ? 0 : undefined, 
                            zIndex: isPanesFrozen ? 40 : undefined, 
                            backgroundColor: '#0F172A', 
                            color: '#F8FAFC',
                            boxShadow: isPanesFrozen ? '0 4px 10px -2px rgba(0, 0, 0, 0.25)' : 'none'
                        }}>
                            {/* Fila Canónica de Nombres de Columnas (32px de altura) con Drag & Drop y Tooltips Informativos */}
                            <tr style={{ height: '32px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.03em', borderBottom: isColumnFilterOpen ? '1px solid #1E293B' : '2px solid #334155' }}>
                                {/* Sticky A, B, C, D (Compacto o Tradicional) */}
                                {isCompactIdentification ? (
                                    <th 
                                        key="header-compact-id"
                                        data-sticky-last="true"
                                        style={{
                                            height: '32px',
                                            boxSizing: 'border-box',
                                            padding: '6px 8px',
                                            textAlign: 'left',
                                            width: '240px',
                                            minWidth: '240px',
                                            maxWidth: '240px',
                                            borderRight: '2px solid #334155',
                                            position: isPanesFrozen ? 'sticky' : 'static',
                                            top: isPanesFrozen ? 0 : undefined,
                                            left: isPanesFrozen ? 0 : undefined,
                                            zIndex: isPanesFrozen ? 55 : undefined,
                                            backgroundColor: '#0F172A',
                                            boxShadow: isPanesFrozen ? '4px 0 10px -2px rgba(0,0,0,0.3)' : undefined,
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
                                    <React.Fragment key="header-traditional-id">
                                        <th key="header-A" style={{ height: '32px', boxSizing: 'border-box', padding: '6px 8px', textAlign: 'center', width: '85px', minWidth: '85px', maxWidth: '85px', position: isPanesFrozen ? 'sticky' : 'static', top: isPanesFrozen ? 0 : undefined, left: isPanesFrozen ? 0 : undefined, zIndex: isPanesFrozen ? 55 : undefined, backgroundColor: '#0F172A' }}>A: Fecha</th>
                                        <th key="header-B" style={{ height: '32px', boxSizing: 'border-box', padding: '6px 8px', textAlign: 'center', width: '70px', minWidth: '70px', maxWidth: '70px', position: isPanesFrozen ? 'sticky' : 'static', top: isPanesFrozen ? 0 : undefined, left: isPanesFrozen ? '85px' : undefined, zIndex: isPanesFrozen ? 55 : undefined, backgroundColor: '#0F172A' }}>B: ID Prod</th>
                                        <th 
                                            key="header-C"
                                            onClick={() => setCellColumnMode(prev => prev === 'collapsed' ? 'expanded' : 'collapsed')}
                                            title={isCellCollapsed ? "C: Célula colapsada (Clic para expandir nombre completo)" : "C: Célula (Clic para colapsar y maximizar espacio de datos)"}
                                            style={{ 
                                                height: '32px',
                                                boxSizing: 'border-box',
                                                padding: isCellCollapsed ? '6px 4px' : '6px 8px', 
                                                textAlign: isCellCollapsed ? 'center' : 'left', 
                                                width: isCellCollapsed ? '44px' : '130px', 
                                                minWidth: isCellCollapsed ? '44px' : '130px', 
                                                maxWidth: isCellCollapsed ? '44px' : '130px', 
                                                position: isPanesFrozen ? 'sticky' : 'static', 
                                                top: isPanesFrozen ? 0 : undefined, 
                                                left: isPanesFrozen ? '155px' : undefined, 
                                                zIndex: isPanesFrozen ? 55 : undefined, 
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
                                            key="header-D"
                                            data-sticky-last="true"
                                            style={{ 
                                                height: '32px',
                                                boxSizing: 'border-box',
                                                padding: '6px 10px', 
                                                textAlign: 'left', 
                                                width: '190px', 
                                                minWidth: '190px', 
                                                maxWidth: '190px', 
                                                borderRight: '2px solid #334155', 
                                                position: isPanesFrozen ? 'sticky' : 'static', 
                                                top: isPanesFrozen ? 0 : undefined, 
                                                left: isPanesFrozen ? (isCellCollapsed ? '199px' : '285px') : undefined, 
                                                zIndex: isPanesFrozen ? 55 : undefined, 
                                                backgroundColor: '#0F172A', 
                                                boxShadow: isPanesFrozen ? '4px 0 10px -2px rgba(0,0,0,0.3)' : undefined,
                                                transition: 'left 0.2s ease, width 0.2s ease'
                                            }}
                                        >
                                            D: Producto
                                        </th>
                                    </React.Fragment>
                                )}

                                {/* Columnas E - X Reordenables por Drag & Drop con Tooltips Enriquecidos */}
                                {columnOrder.map((colKey) => {
                                    const meta = COLUMN_METADATA[colKey];
                                    const isDragging = draggedCol === colKey;
                                    const isDragOver = dragOverCol === colKey;
                                    const isSpecialColS = colKey === 'S';
                                    const isSpecialColTU = colKey === 'T' || colKey === 'U';
                                    const hasRightBorder = colKey === 'G' || colKey === 'J' || colKey === 'N' || colKey === 'R' || colKey === 'U' || colKey === 'W';

                                    // Tooltip con Bloque, Fórmula y Signo Contable (SPEC.md §8.8.8)
                                    const tooltipText = meta 
                                        ? `[${meta.block}] Columna ${colKey}: ${meta.title} ${meta.sign}\n• Efecto: ${meta.effect}${meta.formula ? `\n• Lógica / Fórmula: ${meta.formula}` : ''}\n\n(Arrastra para comparar y colocar columnas juntas)`
                                        : `${colKey}: Columna Kardex`;

                                    return (
                                        <th
                                            key={`header-${colKey}`}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, colKey)}
                                            onDragOver={(e) => handleDragOver(e, colKey)}
                                            onDrop={(e) => handleDrop(e, colKey)}
                                            onDragEnd={handleDragEnd}
                                            title={tooltipText}
                                            style={{
                                                height: '32px',
                                                boxSizing: 'border-box',
                                                position: isPanesFrozen ? 'sticky' : 'static',
                                                top: isPanesFrozen ? 0 : undefined,
                                                zIndex: isPanesFrozen ? 40 : undefined,
                                                backgroundColor: isSpecialColS ? '#042F2E' : (isSpecialColTU ? '#1E293B' : '#0F172A'),
                                                padding: colKey === 'U' ? '4px 4px' : '4px 8px',
                                                textAlign: 'right',
                                                color: isSpecialColS ? '#5EEAD4' : (meta?.color || '#F8FAFC'),
                                                width: '95px',
                                                minWidth: '95px',
                                                maxWidth: '95px',
                                                cursor: 'grab',
                                                userSelect: 'none',
                                                borderRight: isSpecialColS ? '2px solid #0D9488' : (hasRightBorder ? '2px solid #334155' : '1px solid #1E293B'),
                                                borderLeft: isSpecialColS ? '2px solid #0D9488' : undefined,
                                                outline: isDragOver ? '2px dashed #10B981' : undefined,
                                                opacity: isDragging ? 0.35 : 1,
                                                transition: 'background-color 0.15s ease, outline 0.15s ease, opacity 0.15s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                                <GripVertical size={10} color="#64748B" style={{ opacity: 0.6, flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.69rem', fontWeight: '800', letterSpacing: '0.02em' }}>
                                                    {colKey}: {meta?.shortName || colKey}
                                                </span>
                                            </div>
                                        </th>
                                    );
                                })}
                            </tr>

                            {/* FILA DE FILTROS EN CABECERA (IN-HEADER FILTERS - 28px de altura) (SPEC.md §8.8.9) */}
                            {isColumnFilterOpen && (
                                <tr style={{ height: '28px', backgroundColor: '#0B132B', borderBottom: '2px solid #334155' }}>
                                    {/* Identificación A-D Filtros */}
                                    {isCompactIdentification ? (
                                        <th
                                            key="filter-compact-id"
                                            style={{
                                                height: '28px',
                                                padding: '2px 6px',
                                                position: isPanesFrozen ? 'sticky' : 'static',
                                                top: isPanesFrozen ? '32px' : undefined,
                                                left: isPanesFrozen ? 0 : undefined,
                                                zIndex: isPanesFrozen ? 55 : undefined,
                                                backgroundColor: '#0B132B',
                                                borderRight: '2px solid #334155'
                                            }}
                                        >
                                            <input
                                                type="text"
                                                placeholder="Filtrar prod / SKU..."
                                                value={columnFilters['product'] || ''}
                                                onChange={e => setColumnFilters(prev => ({ ...prev, product: e.target.value }))}
                                                style={{
                                                    width: '100%',
                                                    height: '22px',
                                                    backgroundColor: '#1E293B',
                                                    border: columnFilters['product'] ? '1px solid #10B981' : '1px solid #334155',
                                                    borderRadius: '4px',
                                                    padding: '1px 6px',
                                                    fontSize: '0.67rem',
                                                    color: '#F8FAFC',
                                                    outline: 'none',
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                        </th>
                                    ) : (
                                        <React.Fragment key="filter-traditional-id">
                                            <th key="filter-A" style={{ height: '28px', padding: '2px 4px', position: isPanesFrozen ? 'sticky' : 'static', top: isPanesFrozen ? '32px' : undefined, left: isPanesFrozen ? 0 : undefined, zIndex: isPanesFrozen ? 55 : undefined, backgroundColor: '#0B132B' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Fecha..."
                                                    value={columnFilters['date'] || ''}
                                                    onChange={e => setColumnFilters(prev => ({ ...prev, date: e.target.value }))}
                                                    style={{ width: '100%', height: '22px', backgroundColor: '#1E293B', border: columnFilters['date'] ? '1px solid #10B981' : '1px solid #334155', borderRadius: '4px', padding: '1px 4px', fontSize: '0.65rem', color: '#F8FAFC', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                                                />
                                            </th>
                                            <th key="filter-B" style={{ height: '28px', padding: '2px 4px', position: isPanesFrozen ? 'sticky' : 'static', top: isPanesFrozen ? '32px' : undefined, left: isPanesFrozen ? '85px' : undefined, zIndex: isPanesFrozen ? 55 : undefined, backgroundColor: '#0B132B' }}>
                                                <input
                                                    type="text"
                                                    placeholder="ID..."
                                                    value={columnFilters['id'] || ''}
                                                    onChange={e => setColumnFilters(prev => ({ ...prev, id: e.target.value }))}
                                                    style={{ width: '100%', height: '22px', backgroundColor: '#1E293B', border: columnFilters['id'] ? '1px solid #10B981' : '1px solid #334155', borderRadius: '4px', padding: '1px 4px', fontSize: '0.65rem', color: '#F8FAFC', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                                                />
                                            </th>
                                            <th key="filter-C" style={{ height: '28px', padding: '2px 4px', position: isPanesFrozen ? 'sticky' : 'static', top: isPanesFrozen ? '32px' : undefined, left: isPanesFrozen ? '155px' : undefined, zIndex: isPanesFrozen ? 55 : undefined, backgroundColor: '#0B132B' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Cél..."
                                                    value={columnFilters['cell'] || ''}
                                                    onChange={e => setColumnFilters(prev => ({ ...prev, cell: e.target.value }))}
                                                    style={{ width: '100%', height: '22px', backgroundColor: '#1E293B', border: columnFilters['cell'] ? '1px solid #10B981' : '1px solid #334155', borderRadius: '4px', padding: '1px 4px', fontSize: '0.65rem', color: '#F8FAFC', outline: 'none', textAlign: 'center', boxSizing: 'border-box' }}
                                                />
                                            </th>
                                            <th key="filter-D" style={{ height: '28px', padding: '2px 6px', position: isPanesFrozen ? 'sticky' : 'static', top: isPanesFrozen ? '32px' : undefined, left: isPanesFrozen ? (isCellCollapsed ? '199px' : '285px') : undefined, zIndex: isPanesFrozen ? 55 : undefined, backgroundColor: '#0B132B', borderRight: '2px solid #334155' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Filtrar producto..."
                                                    value={columnFilters['product'] || ''}
                                                    onChange={e => setColumnFilters(prev => ({ ...prev, product: e.target.value }))}
                                                    style={{ width: '100%', height: '22px', backgroundColor: '#1E293B', border: columnFilters['product'] ? '1px solid #10B981' : '1px solid #334155', borderRadius: '4px', padding: '1px 6px', fontSize: '0.67rem', color: '#F8FAFC', outline: 'none', boxSizing: 'border-box' }}
                                                />
                                            </th>
                                        </React.Fragment>
                                    )}

                                    {/* Filtros numéricos con operadores (>0, <0, =0, !=0) para columnas E - X */}
                                    {columnOrder.map((colKey) => {
                                        const filterVal = columnFilters[colKey] || '';
                                        const isActive = filterVal.trim().length > 0;
                                        const hasRightBorder = colKey === 'G' || colKey === 'J' || colKey === 'N' || colKey === 'R' || colKey === 'U' || colKey === 'W';
                                        const isColS = colKey === 'S';

                                        return (
                                            <th
                                                key={`filter-${colKey}`}
                                                style={{
                                                    height: '28px',
                                                    padding: '2px 4px',
                                                    position: isPanesFrozen ? 'sticky' : 'static',
                                                    top: isPanesFrozen ? '32px' : undefined,
                                                    zIndex: isPanesFrozen ? 40 : undefined,
                                                    backgroundColor: '#0B132B',
                                                    borderRight: isColS ? '2px solid #0D9488' : (hasRightBorder ? '2px solid #334155' : '1px solid #1E293B'),
                                                    borderLeft: isColS ? '2px solid #0D9488' : undefined
                                                }}
                                            >
                                                <input
                                                    type="text"
                                                    placeholder=">0, =0..."
                                                    value={filterVal}
                                                    onChange={e => setColumnFilters(prev => ({ ...prev, [colKey]: e.target.value }))}
                                                    title={`Filtro ${colKey}: Escribe un número o expresión como '>0', '<0', '=0', '!=0'`}
                                                    style={{
                                                        width: '100%',
                                                        height: '22px',
                                                        backgroundColor: isActive ? 'rgba(16, 185, 129, 0.15)' : '#1E293B',
                                                        border: isActive ? '1px solid #10B981' : '1px solid #334155',
                                                        borderRadius: '4px',
                                                        padding: '1px 4px',
                                                        fontSize: '0.65rem',
                                                        color: isActive ? '#34D399' : '#CBD5E1',
                                                        outline: 'none',
                                                        textAlign: 'right',
                                                        fontVariantNumeric: 'tabular-nums',
                                                        boxSizing: 'border-box'
                                                    }}
                                                />
                                            </th>
                                        );
                                    })}
                                </tr>
                            )}
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
                            position: isPanesFrozen ? 'sticky' : 'static',
                            bottom: isPanesFrozen ? 0 : undefined,
                            zIndex: isPanesFrozen ? 30 : undefined,
                            backgroundColor: '#0F172A',
                            color: '#F8FAFC',
                            boxShadow: isPanesFrozen ? '0 -4px 10px -2px rgba(0, 0, 0, 0.25)' : undefined
                        }}>
                            <tr style={{ fontWeight: '900', fontSize: '0.78rem' }}>
                                {/* Sticky Cols A-D */}
                                <td
                                    key="total-id"
                                    colSpan={isCompactIdentification ? 1 : 4}
                                    style={{
                                        padding: '7px 10px',
                                        textAlign: 'left',
                                        backgroundColor: '#0F172A',
                                        color: '#F8FAFC',
                                        borderRight: '2px solid #334155',
                                        borderTop: '2px solid #334155',
                                        position: isPanesFrozen ? 'sticky' : 'static',
                                        left: isPanesFrozen ? 0 : undefined,
                                        bottom: isPanesFrozen ? 0 : undefined,
                                        zIndex: isPanesFrozen ? 35 : undefined,
                                        boxShadow: isPanesFrozen ? '4px 0 10px -2px rgba(0,0,0,0.3)' : undefined,
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

                                {/* Totales Numéricos Dinámicos Mapeados según columnOrder (SPEC.md §8.8.10) */}
                                {columnOrder.map((colKey) => {
                                    const meta = COLUMN_METADATA[colKey];
                                    const isColS = colKey === 'S';
                                    const isSpecialBg = colKey === 'T' || colKey === 'U';
                                    const hasRightBorder = colKey === 'G' || colKey === 'J' || colKey === 'N' || colKey === 'R' || colKey === 'U' || colKey === 'W';
                                    const decimals = colKey === 'I' ? 0 : 2;

                                    if (isColS) {
                                        return (
                                            <td
                                                key={`total-${colKey}`}
                                                style={{
                                                    position: isPanesFrozen ? 'sticky' : 'static',
                                                    bottom: isPanesFrozen ? 0 : undefined,
                                                    zIndex: isPanesFrozen ? 31 : undefined,
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
                                                    boxShadow: isPanesFrozen ? '0 0 10px rgba(13, 148, 136, 0.4)' : undefined
                                                }}
                                            >
                                                {renderNumericCell(columnTotals.totalS)}
                                            </td>
                                        );
                                    }

                                    const totalVal = (columnTotals as any)[`total${colKey}`] ?? 0;

                                    return (
                                        <td
                                            key={`total-${colKey}`}
                                            style={{
                                                position: isPanesFrozen ? 'sticky' : 'static',
                                                bottom: isPanesFrozen ? 0 : undefined,
                                                zIndex: isPanesFrozen ? 30 : undefined,
                                                backgroundColor: isSpecialBg ? '#1E293B' : '#0F172A',
                                                padding: colKey === 'U' ? '6px 4px' : '6px 8px',
                                                textAlign: 'right',
                                                color: meta?.color || '#F8FAFC',
                                                width: '95px',
                                                minWidth: '95px',
                                                maxWidth: '95px',
                                                borderTop: '2px solid #334155',
                                                borderRight: hasRightBorder ? '2px solid #334155' : undefined
                                            }}
                                        >
                                            {renderNumericCell(totalVal, decimals)}
                                        </td>
                                    );
                                })}
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

            <FastPlazaPurchasesModal
                isOpen={isFastPlazaModalOpen}
                onClose={() => setIsFastPlazaModalOpen(false)}
                onSuccess={() => loadDailyData(true)}
                currentDate={balanceDate}
                products={products}
                currentPurchasesMap={currentPurchasesMap}
                workCells={workCells}
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
