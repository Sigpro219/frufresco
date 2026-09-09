'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { Package, Search, Filter, Plus, ArrowUpRight, ArrowDownLeft, ArrowDownRight, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, TrendingUp, History, Download, ChevronRight, ChevronLeft, ChevronDown, Scale, Tag, Calendar, Database, Sparkles, Building2, Truck, MoreVertical, Edit2, Trash2, RefreshCw, ClipboardList, Kanban, BookOpen, X, Layers, FileSpreadsheet, Clock, BarChart3, Users, User, CheckCircle2, Check, UserPlus, ArrowRight, Sprout, Carrot, Apple, Boxes, Wheat, Milk, Beef } from 'lucide-react';
import * as XLSX from 'xlsx';
import { CATEGORY_MAP } from '@/lib/constants';
import InventoryUnifiedDashboard from '@/components/InventoryUnifiedDashboard';
import InventoryDailyBalanceTab from '@/components/InventoryDailyBalanceTab';
import { WorkCell, CellResponsible } from '@/types/workCells';

interface InventoryItem {
    id: string;
    product_id: string;
    warehouse_id: string;
    status: 'available' | 'returned' | 'in_process';
    quantity: number;
    min_stock_level: number;
    updated_at: string;
    products: {
        name: string;
        sku: string;
        category: string;
        inventory_group?: string | null;
        buying_team?: string | null;
        unit_of_measure: string;
        image_url: string;
        base_price: number;
        is_active: boolean;
        min_inventory_level: number;
        accounting_id?: number | null;
        parent_id?: string | null;
    };
    warehouses: {
        name: string;
    };
}

interface Movement {
    id: string;
    product_id: string;
    warehouse_id?: string;
    quantity: number;
    type: 'entry' | 'exit' | 'adjustment' | 'transfer';
    reference_type?: string | null;
    reference_id?: string | null;
    status_from?: string | null;
    status_to?: string | null;
    notes?: string | null;
    evidence_url?: string | null;
    admin_decision?: string | null;
    created_at: string;
    created_by?: string | null;
    products?: {
        id?: string;
        name: string;
        sku?: string;
        accounting_id?: number | null;
        parent_id?: string | null;
        category?: string;
        inventory_group?: string | null;
        buying_team?: string | null;
        unit_of_measure?: string;
        image_url?: string | null;
    };
}

interface RandomTask {
    id: string;
    scheduled_date: string;
    status: string;
    items: {
        id: string;
        product_id: string;
        expected_qty: number;
        actual_qty: number;
        difference_percent: number;
        products: { name: string };
    }[];
}

// --- NUMBER FORMATTING HELPERS ---
function formatNumber(num: number | string | null | undefined, maxDecimals = 2): string {
    if (num === null || num === undefined || isNaN(Number(num))) return '0';
    const parsed = Number(num);
    
    // Check if it's an integer
    if (parsed % 1 === 0) {
        return parsed.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    
    // Format to maxDecimals
    const formatted = parsed.toFixed(maxDecimals);
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    // Remove trailing zeros in the decimal part
    let decimalPart = parts[1] || '';
    while (decimalPart.endsWith('0')) {
        decimalPart = decimalPart.slice(0, -1);
    }
    
    if (decimalPart.length > 0) {
        return `${parts[0]},${decimalPart}`;
    }
    return parts[0];
}

function formatMoney(num: number | string | null | undefined): string {
    if (num === null || num === undefined || isNaN(Number(num))) return '$0';
    const parsed = Number(num);
    const rounded = Math.round(parsed);
    const formatted = rounded.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `$${formatted}`;
}

// --- UI THEME & STYLES ---
const THEME = {
    colors: {
        bg: '#F4F7F6', // Refined slate/sage organic bg
        surface: '#FFFFFF',
        border: '#E2E7E4', // Fine border color matching the organic theme
        textMain: '#1A231E', // Deep charcoal/green text
        textSecondary: '#62726B', // Elegant slate/sage secondary text
        primary: '#0D7A57', // Forest/albahaca green
        primaryHover: '#0A5E43',
        primaryLight: '#EDF5F1',
        accent: '#111C17', // Deep slate green/dark accent
        success: '#10B981',
        successBg: '#E8FDF5',
        successText: '#047857',
        error: '#B91C1C',
        errorBg: '#FEE2E2',
        errorText: '#991B1B',
        warning: '#F59E0B',
        warningBg: '#FEF3C7',
        warningText: '#B45309',
        blueBg: '#EFF6FF',
        blueText: '#1D4ED8',
        purpleBg: '#F3E8FF',
        purpleText: '#6D28D9'
    },
    radius: {
        sm: '8px',
        md: '10px',
        lg: '12px',
        xl: '16px'
    },
    shadow: {
        sm: '0 1px 3px rgba(0, 0, 0, 0.02), 0 1px 2px rgba(0, 0, 0, 0.04)',
        md: '0 4px 12px -2px rgba(11, 28, 23, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)',
        lg: '0 12px 24px -4px rgba(13, 122, 87, 0.08), 0 4px 12px -2px rgba(0, 0, 0, 0.03)',
        xl: '0 20px 32px -6px rgba(11, 28, 23, 0.15)'
    }
};

const styles = {
    main: { minHeight: '100vh', backgroundColor: THEME.colors.bg, color: THEME.colors.textMain, fontFamily: 'var(--font-outfit), sans-serif' },
    container: { maxWidth: '1440px', margin: '0 auto', padding: '0.85rem 1.25rem' },
    header: { display: 'flex' as const, justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' },
    titleArea: { flex: 1 },
    title: { fontSize: '1.45rem', fontWeight: '800', letterSpacing: '-0.03em', margin: 0, color: THEME.colors.textMain },
    subtitle: { color: THEME.colors.textSecondary, fontSize: '0.8rem', marginTop: '0.15rem', fontWeight: '400' },
    actions: { display: 'flex' as const, gap: '0.5rem' },
    kpiGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' },
    controlBar: { 
        display: 'flex' as const, 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1.5rem', 
        backgroundColor: THEME.colors.surface, 
        padding: '0.65rem 1.25rem', 
        borderRadius: THEME.radius.lg, 
        border: `1px solid ${THEME.colors.border}`,
        boxShadow: THEME.shadow.sm
    },
    tableContainer: { 
        backgroundColor: THEME.colors.surface, 
        borderRadius: THEME.radius.lg, 
        border: `1px solid ${THEME.colors.border}`, 
        boxShadow: THEME.shadow.md, 
        overflow: 'visible' as const,
        position: 'relative' as const
    },
    table: { width: '100%', borderCollapse: 'collapse' as const },
    stickyHeader: { 
        position: 'sticky' as const, 
        top: '143px', 
        backgroundColor: '#F8FAFC', 
        zIndex: 40,
        borderBottom: `1.5px solid #CBD5E1`
    },
    th: { 
        padding: '0.65rem 1.25rem', 
        textAlign: 'left' as const, 
        fontSize: '0.65rem', 
        color: THEME.colors.textSecondary, 
        fontWeight: '700', 
        textTransform: 'uppercase' as const, 
        letterSpacing: '0.05em' 
    },
    td: { 
        padding: '0.65rem 1.25rem', 
        fontSize: '0.85rem', 
        borderBottom: `1px solid #E2E7E4`,
        verticalAlign: 'middle' as const,
        color: THEME.colors.textMain
    },
    input: { 
        width: '100%', 
        padding: '0.6rem 0.85rem', 
        borderRadius: THEME.radius.sm, 
        border: `1px solid ${THEME.colors.border}`, 
        fontSize: '0.85rem', 
        fontWeight: '500', 
        boxSizing: 'border-box' as const,
        outline: 'none',
        transition: 'all 0.2s',
        color: '#1A231E'
    },
    label: { 
        display: 'block', 
        fontSize: '0.65rem', 
        fontWeight: '700', 
        color: THEME.colors.textSecondary, 
        textTransform: 'uppercase' as const, 
        marginBottom: '0.35rem',
        letterSpacing: '0.05em'
    },
    badge: (bg: string, color: string) => ({ 
        backgroundColor: bg, 
        color, 
        padding: '0.25rem 0.65rem', 
        borderRadius: '6px', 
        fontSize: '0.7rem', 
        fontWeight: '700' as const,
        letterSpacing: '0.03em',
        display: 'inline-flex' as const,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
        width: 'fit-content' as const
    })
};

type StockSortField = 'product' | 'id_contable' | 'min_stock' | 'cost' | 'total_value' | 'uom' | 'quantity' | 'default';
type SortDirection = 'asc' | 'desc';

export default function InventoryAdminPage() {
    const [stocks, setStocks] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'stock' | 'movements' | 'random_tasks' | 'settings' | 'daily_balance'>('dashboard');
    const [movements, setMovements] = useState<Movement[]>([]);
    const [randomTasks, setRandomTasks] = useState<RandomTask[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<{ id: string, name: string } | null>(null);
    const [stockStatusFilter, setStockStatusFilter] = useState<'available' | 'returned' | 'in_process' | 'all'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [avgCosts, setAvgCosts] = useState<Record<string, number>>({});
    const [collapsedParents, setCollapsedParents] = useState<Record<string, boolean>>({});
    const [workCells, setWorkCells] = useState<WorkCell[]>([]);

    // --- SORTING DE TABLA CONSOLIDADO ---
    const [sortField, setSortField] = useState<StockSortField>('default');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const handleSort = (field: StockSortField) => {
        if (sortField === field) {
            if (sortDirection === 'asc') {
                setSortDirection('desc');
            } else {
                // Ciclo: asc -> desc -> default
                setSortField('default');
                setSortDirection('asc');
            }
        } else {
            setSortField(field);
            // Para valores numéricos o monetarios, iniciar en descendente (mayor a menor) es lo natural
            if (['total_value', 'quantity', 'cost', 'min_stock'].includes(field)) {
                setSortDirection('desc');
            } else {
                setSortDirection('asc');
            }
        }
        setCurrentPage(1);
    };

    const handleResetSort = () => {
        setSortField('default');
        setSortDirection('asc');
        setCurrentPage(1);
    };

    const getSortLabel = (field: StockSortField) => {
        switch (field) {
            case 'product': return 'Producto';
            case 'id_contable': return 'ID Contable';
            case 'min_stock': return 'Stock Mín.';
            case 'cost': return 'Costo Matriz';
            case 'total_value': return 'Valor Inv.';
            case 'uom': return 'Unidad';
            case 'quantity': return 'Cantidad';
            default: return 'Predeterminado';
        }
    };

    const cellByGroup = useMemo(() => {
        const map = new Map<string, WorkCell>();
        (workCells || []).forEach(c => {
            if (c.inventory_group) {
                map.set(c.inventory_group.trim().toUpperCase(), c);
            }
        });
        return map;
    }, [workCells]);

    const renderCellLucideIcon = (iconKey?: string, size = 15, strokeWidth = 2) => {
        const key = (iconKey || '').toLowerCase().trim();
        if (key === '🥬' || key === 'sprout' || key.includes('hortaliza')) {
            return <Sprout size={size} strokeWidth={strokeWidth} />;
        }
        if (key === '🥦' || key === 'carrot' || key.includes('verdura')) {
            return <Carrot size={size} strokeWidth={strokeWidth} />;
        }
        if (key === '🍎' || key === 'apple' || key.includes('fruta')) {
            return <Apple size={size} strokeWidth={strokeWidth} />;
        }
        if (key === '🧀' || key === 'boxes' || key.includes('abarrote')) {
            return <Boxes size={size} strokeWidth={strokeWidth} />;
        }
        if (key === '🥔' || key === 'layers' || key.includes('papa') || key.includes('tubérculo') || key.includes('tomate') || key.includes('aguacate')) {
            return <Layers size={size} strokeWidth={strokeWidth} />;
        }
        if (key === 'wheat' || key === '🌾' || key.includes('grano')) {
            return <Wheat size={size} strokeWidth={strokeWidth} />;
        }
        if (key === 'milk' || key === '🥛' || key.includes('lácteo')) {
            return <Milk size={size} strokeWidth={strokeWidth} />;
        }
        if (key === 'beef' || key === '🥩' || key.includes('carne')) {
            return <Beef size={size} strokeWidth={strokeWidth} />;
        }
        return <Package size={size} strokeWidth={strokeWidth} />;
    };

    const renderCellBadge = (inventoryGroup?: string | null) => {
        if (!inventoryGroup) return null;
        const cell = cellByGroup.get(inventoryGroup.trim().toUpperCase());
        if (!cell) return null;
        return (
            <span 
                title={`Célula: ${cell.name} | Líder: ${cell.leader_name || 'Sin asignar'}`}
                style={{
                    fontSize: '0.62rem',
                    fontWeight: '700',
                    padding: '2px 7px',
                    borderRadius: '6px',
                    backgroundColor: cell.badge_bg || '#F1F5F9',
                    color: cell.badge_text || '#334155',
                    border: `1px solid ${cell.color}35`,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {renderCellLucideIcon(cell.icon, 12)}
                </span>
                <span>{cell.short_name || cell.name}</span>
                {cell.leader_name && (
                    <span style={{ opacity: 0.85, fontWeight: '500' }}>
                        · {cell.leader_name.split(' ')[0]}
                    </span>
                )}
            </span>
        );
    };

    const toggleParentCollapse = (parentId: string) => {
        setCollapsedParents(prev => ({
            ...prev,
            [parentId]: !prev[parentId]
        }));
    };

    // --- KARDEX STATES & TOGGLES ---
    const [movementsDateRange, setMovementsDateRange] = useState<'8days' | 'today' | 'custom'>('8days');
    const [customStartDate, setCustomStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [customEndDate, setCustomEndDate] = useState<string>(() => {
        return new Date().toISOString().split('T')[0];
    });
    const [movementsFilterActiveOnly, setMovementsFilterActiveOnly] = useState(true);
    const [movementsViewMode, setMovementsViewMode] = useState<'all' | 'returns'>('all');
    const [expandedKardexItems, setExpandedKardexItems] = useState<Record<string, boolean>>({});
    const [collapsedKardexParents, setCollapsedKardexParents] = useState<Record<string, boolean>>({});
    const [exportingExcel, setExportingExcel] = useState(false);

    const toggleKardexParentCollapse = (parentId: string) => {
        setCollapsedKardexParents(prev => ({
            ...prev,
            [parentId]: !prev[parentId]
        }));
    };

    const toggleKardexItemExpanded = (productId: string) => {
        setExpandedKardexItems(prev => ({
            ...prev,
            [productId]: !prev[productId]
        }));
    };

    // Sticky Control Dock & Table Headers synchronization
    const dockRef = useRef<HTMLDivElement>(null);
    const [dockHeight, setDockHeight] = useState(58);

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
    }, [activeTab]);

    const dynamicHeaderStyle = useMemo(() => ({
        position: 'sticky' as const,
        top: `${85 + dockHeight - 1}px`,
        backgroundColor: '#F8FAFC',
        zIndex: 40,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.04)'
    }), [dockHeight]);

    const dynamicThStyle = useMemo(() => ({
        ...styles.th,
        position: 'sticky' as const,
        top: `${85 + dockHeight - 1}px`,
        backgroundColor: '#F8FAFC',
        zIndex: 40,
        borderBottom: '1.5px solid #CBD5E1'
    }), [dockHeight]);

    interface ScoredItem {
        item: any;
        score: number;
    }
    const [auditPolicy, setAuditPolicy] = useState({
        coveragePercent: 100, // Now 100% by default
        alertThreshold: 3, // Stricter threshold (3%)
        prioritizeHighValue: true,
        prioritizeHighRotation: true,
        prioritizePerishables: true,
        prioritizeCriticalStock: true,
        excludeAuditedRecently: true,
        autoEnabled: false,
        generationTime: '09:30' // Cut-off at 09:30 AM (manual)
    });
    const [generatingAudit, setGeneratingAudit] = useState(false);
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const ITEMS_PER_PAGE = 50;
    const isMounted = useRef(true);

    // --- GOBERNANZA DE CÉLULAS & POLÍTICAS DE SKUS STATES ---
    const [policySubTab, setPolicySubTab] = useState<'cells' | 'skus'>('cells');
    const [staffUsers, setStaffUsers] = useState<CellResponsible[]>([]);
    const [skuPolicySearch, setSkuPolicySearch] = useState('');
    const [skuPolicyCellFilter, setSkuPolicyCellFilter] = useState('ALL');
    const [skuPolicyPage, setSkuPolicyPage] = useState(1);
    const [savingSkuId, setSavingSkuId] = useState<string | null>(null);
    const [saveSkuSuccessId, setSaveSkuSuccessId] = useState<string | null>(null);
    const [assigningCellId, setAssigningCellId] = useState<string | null>(null);
    const [selectedStaffForAssign, setSelectedStaffForAssign] = useState<string>('');
    const [isNewCellModalOpen, setIsNewCellModalOpen] = useState(false);
    const [newCellForm, setNewCellForm] = useState({
        name: '',
        short_name: '',
        inventory_group: '',
        color: '#0D7A57',
        icon: 'package',
        description: '',
        initial_responsible_id: ''
    });
    const [isSavingCell, setIsSavingCell] = useState(false);

    const fetchData = useCallback(async (signal?: AbortSignal, silent = false) => {
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        try {
            // Células de Trabajo Governance (Alistamiento e Inventarios)
            const { data: cellsData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'work_cells_governance')
                .maybeSingle();

            let loadedCells: WorkCell[] = [];
            if (cellsData?.value) {
                try {
                    const parsedCells: WorkCell[] = typeof cellsData.value === 'string' ? JSON.parse(cellsData.value) : cellsData.value;
                    loadedCells = parsedCells.map(c => {
                        let resps = c.responsibles || [];
                        if (resps.length === 0) {
                            if (c.leader_name) {
                                resps.push({
                                    id: c.leader_id || `leader-${c.id}`,
                                    name: c.leader_name,
                                    role: c.leader_role || 'Líder de Célula'
                                });
                            }
                            if (c.backup_name && c.backup_name !== c.leader_name) {
                                resps.push({
                                    id: c.backup_id || `backup-${c.id}`,
                                    name: c.backup_name,
                                    role: 'Apoyo / Backup'
                                });
                            }
                        }
                        return { ...c, responsibles: resps };
                    });
                    setWorkCells(loadedCells);
                } catch (e) {
                    console.error('Error parsing work cells governance in page:', e);
                }
            }

            // Cargar únicamente colaboradores activos de la planilla oficial de Talento Humano (/admin/hr)
            try {
                const [{ data: colData }, { data: profData }] = await Promise.all([
                    supabase.from('collaborators').select('id, contact_name, role, email, is_active').order('contact_name', { ascending: true }),
                    supabase.from('profiles').select('id, contact_name, company_name, role, email, is_active')
                ]);

                const staffMap = new Map<string, CellResponsible>();

                // 1. Colaboradores oficiales de la planilla de Talento Humano
                (colData || []).forEach((c: any) => {
                    if (c.is_active === false) return; // Excluir inactivos o archivados
                    const name = c.contact_name || c.email;
                    if (name && !staffMap.has(c.id)) {
                        staffMap.set(c.id, {
                            id: c.id,
                            name: name.trim(),
                            role: c.role || 'Colaborador',
                            email: c.email
                        });
                    }
                });

                // 2. Personal interno registrado en profiles (excluyendo clientes)
                (profData || []).forEach((p: any) => {
                    if (p.is_active === false) return;
                    if (p.role && p.role !== 'b2b_client' && p.role !== 'b2c_client' && p.role !== 'client') {
                        const name = p.contact_name || p.company_name || p.email;
                        const existingValues = Array.from(staffMap.values());
                        const alreadyExists = existingValues.some(s => 
                            (s.email && p.email && s.email.toLowerCase() === p.email.toLowerCase()) ||
                            s.name.toLowerCase() === (name || '').trim().toLowerCase()
                        );
                        if (name && !staffMap.has(p.id) && !alreadyExists) {
                            staffMap.set(p.id, {
                                id: p.id,
                                name: name.trim(),
                                role: p.role || 'Staff Operativo',
                                email: p.email
                            });
                        }
                    }
                });

                setStaffUsers(Array.from(staffMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
            } catch (err) {
                console.error('Error fetching official HR staff users:', err);
            }

            // Cargar catálogo y existencias si estamos en stock, en políticas o si no se han cargado aún para movimientos
            if (activeTab === 'stock' || activeTab === 'settings' || (activeTab === 'movements' && stocks.length === 0)) {
                // Fetch from products to ensure ALL master items are visible
                let allProducts: any[] = [];
                let from = 0;
                const limit = 1000;
                let hasMore = true;

                while (hasMore) {
                    let query = supabase
                        .from('products')
                        .select(`
                            id, name, sku, category, inventory_group, buying_team, unit_of_measure, image_url, base_price, is_active, min_inventory_level, accounting_id, parent_id,
                            inventory_stocks!product_id (
                                *,
                                warehouses (name)
                            )
                        `)
                        .eq('is_active', true)
                        .order('accounting_id', { ascending: true })
                        .range(from, from + limit - 1);
                    
                    if (signal) query = query.abortSignal(signal);

                    const { data: batch, error } = await query;
                    if (!isMounted.current) return;
                    if (error) throw error;

                    if (batch && batch.length > 0) {
                        allProducts = [...allProducts, ...batch];
                        from += limit;
                        if (batch.length < limit) hasMore = false;
                    } else {
                        hasMore = false;
                    }
                }

                // Flatten the products and their stocks into InventoryItem structure
                const flattenedStocks: any[] = allProducts.flatMap(p => {
                    const statusStocks = p.inventory_stocks || [];
                    
                    if (statusStocks.length > 0) {
                        return statusStocks.map((s: any) => ({
                            ...s,
                            product_id: p.id,
                            products: p
                        }));
                    }

                    // Virtual stock if none exists
                    return [{
                        id: `virtual-${p.id}`,
                        product_id: p.id,
                        warehouse_id: 'default',
                        status: 'available',
                        quantity: 0,
                        updated_at: new Date().toISOString(),
                        products: p,
                        warehouses: { name: 'Bodega Principal' }
                    }];
                });

                // --- Costos Oficiales desde la Matriz de Costos (commercial_cost_matrix) ---
                const { data: matrixData } = await supabase
                    .from('commercial_cost_matrix')
                    .select('product_id, manual_cost')
                    .eq('is_active', true);

                const rawMatrixMap: Record<string, number> = {};
                (matrixData || []).forEach(m => {
                    if (m.product_id && m.manual_cost !== null && Number(m.manual_cost) > 0) {
                        rawMatrixMap[m.product_id] = Number(m.manual_cost);
                    }
                });

                // Asignar costos respetando herencia de variantes (hijo hereda de padre si no tiene costo propio)
                const costsMap: Record<string, number> = {};
                allProducts.forEach(p => {
                    if (rawMatrixMap[p.id]) {
                        costsMap[p.id] = rawMatrixMap[p.id];
                    } else if (p.parent_id && rawMatrixMap[p.parent_id]) {
                        costsMap[p.id] = rawMatrixMap[p.parent_id];
                    }
                });
                setAvgCosts(costsMap);
                setStocks(flattenedStocks);
            }

            if (activeTab === 'movements') {
                let startDateIso = '';
                let endDateIso = '';
                const now = new Date();

                if (movementsDateRange === 'today') {
                    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    startDateIso = start.toISOString();
                    endDateIso = end.toISOString();
                } else if (movementsDateRange === '8days') {
                    // Ventana móvil de 8 días (7 días atrás + hoy)
                    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 0, 0, 0, 0);
                    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
                    startDateIso = start.toISOString();
                    endDateIso = end.toISOString();
                } else {
                    const [sY, sM, sD] = (customStartDate || '').split('-').map(Number);
                    const [eY, eM, eD] = (customEndDate || '').split('-').map(Number);
                    const start = new Date(sY || now.getFullYear(), (sM || 1) - 1, sD || 1, 0, 0, 0, 0);
                    const end = new Date(eY || now.getFullYear(), (eM || 1) - 1, eD || now.getDate(), 23, 59, 59, 999);
                    startDateIso = start.toISOString();
                    endDateIso = end.toISOString();
                }

                let movQuery = supabase
                    .from('inventory_movements')
                    .select(`
                        id, product_id, warehouse_id, quantity, type, reference_type, reference_id,
                        notes, created_at, status_from, status_to, created_by, evidence_url, admin_decision,
                        products (id, name, sku, accounting_id, parent_id, category, inventory_group, buying_team, unit_of_measure, image_url)
                    `)
                    .gte('created_at', startDateIso)
                    .lte('created_at', endDateIso)
                    .order('created_at', { ascending: false });

                if (signal) movQuery = movQuery.abortSignal(signal);
                const { data, error } = await movQuery;

                if (!isMounted.current) return;
                if (error) throw error;
                setMovements(data || []);
            } else if (activeTab === 'random_tasks') {
                const { data, error } = await supabase
                    .from('inventory_random_tasks')
                    .select(`
                        *,
                        items:inventory_task_items (
                            id, product_id, expected_qty, actual_qty, difference_percent,
                            products (name)
                        )
                    `)
                    .order('scheduled_date', { ascending: false })
                    .abortSignal(signal as any);
                
                if (!isMounted.current) return;
                if (error) throw error;
                setRandomTasks(data || []);
            }
        } catch (err: unknown) {
            if (!isMounted.current) return;
            
            const pgError = err as { message?: string; code?: string; details?: string; hint?: string; name?: string };

            // Precise diagnostic for table missing
            if (pgError.code === 'PGRST205') {
                console.error('ERROR: La tabla de inventario "inventory_stocks" no existe.');
                console.error('Sugerencia: Ejecuta el script REPAIR_INVENTORY_SYSTEM.sql en el dashboard de Supabase.');
            }

            // Silenciosamente ignorar abortos
            if (isAbortError(err)) return;

            console.error('Error fetching inventory details:', pgError.message || err);
        } finally {
            if (isMounted.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [activeTab, movementsDateRange, customStartDate, customEndDate, stocks.length]);

    const handleGenerateAudit = useCallback(async (isAuto: boolean = false) => {
        try {
            if (!isAuto) setGeneratingAudit(true);
            
            const today = new Date().toISOString().split('T')[0];
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // 0. Check for today's snapshot
            const { data: existing } = await supabase
                .from('inventory_random_tasks')
                .select('id')
                .eq('scheduled_date', today);
            
            if (existing && existing.length > 0) {
                if (!isAuto) alert('El corte de inventario (09:30 AM) ya fue procesado para hoy.');
                return;
            }

            // 1. Identify Active SKUs (Movement in last 30 days)
            const { data: recentMvt } = await supabase
                .from('inventory_movements')
                .select('product_id')
                .gte('created_at', thirtyDaysAgo.toISOString());
            
            const activeIds = [...new Set((recentMvt || []).map(m => m.product_id))];

            // 2. Fetch current stock for these active products
            const { data: stockData, error: stockError } = await supabase
                .from('inventory_stocks')
                .select('*, products(*)')
                .in('product_id', activeIds);
            
            if (stockError) throw stockError;
            if (!stockData || stockData.length === 0) {
                if (!isAuto) alert('No se detectaron SKUs con movimiento en los últimos 30 días para auditar.');
                return;
            }

            // 3. Score and Filter according to Cell Policies
            const scoredItems: ScoredItem[] = stockData.map((item: any) => {
                let score = Math.random() * 10;
                
                // Exclude if category is not selected in policy
                const cat = item.products?.category;
                const isPerishable = ['FR', 'VE', 'HO'].includes(cat);
                if (auditPolicy.prioritizePerishables && !isPerishable && !auditPolicy.prioritizeHighValue) score -= 5;
                
                if (auditPolicy.prioritizeHighValue && item.products?.base_price > 10000) score += 15;
                if (auditPolicy.prioritizeCriticalStock && item.quantity <= (item.products?.min_inventory_level || 0)) score += 20;

                return { item, score };
            });

            // 4. Coverage Percentage Calculation
            const itemsToAuditCount = Math.ceil((stockData.length * auditPolicy.coveragePercent) / 100);
            scoredItems.sort((a, b) => b.score - a.score);
            const selected = scoredItems.slice(0, itemsToAuditCount);

            // 5. Create Master Task (The 09:30 AM Snapshot)
            const { data: task, error: taskError } = await supabase
                .from('inventory_random_tasks')
                .insert([{
                    status: 'pending',
                    scheduled_date: today,
                    notes: `Snapshot Automático 09:30 AM - Cobertura ${formatNumber(auditPolicy.coveragePercent, 0)}%`
                }])
                .select()
                .single();

            if (taskError) throw taskError;

            // 6. Bulk Insert Snapshot Items
            const taskItems = selected.map(s => ({
                task_id: task.id,
                product_id: s.item.product_id,
                warehouse_id: s.item.warehouse_id,
                expected_qty: s.item.quantity // This is the core snapshot value
            }));

            const { error: itemsError } = await supabase
                .from('inventory_task_items')
                .insert(taskItems);

            if (itemsError) throw itemsError;

            fetchData();
            if (!isAuto) alert('¡Corte de inventario a las 09:30 AM generado con éxito para ' + selected.length + ' productos!');
        } catch (err: any) {
            console.error('Error generating audit snapshot:', err);
            if (!isAuto) alert('Error en el corte: ' + (err.message || 'Error de conexión'));
        } finally {
            if (!isAuto && isMounted.current) setGeneratingAudit(false);
        }
    }, [auditPolicy, fetchData]);

    // --- GOBERNANZA DE CÉLULAS & ASIGNACIÓN DE SKUS LOGIC ---
    const activeProductsCatalog = useMemo(() => {
        const map = new Map<string, any>();
        stocks.forEach(s => {
            if (s.products && s.product_id && !map.has(s.product_id)) {
                map.set(s.product_id, {
                    id: s.product_id,
                    name: s.products.name,
                    sku: s.products.sku,
                    category: s.products.category,
                    inventory_group: s.products.inventory_group,
                    unit_of_measure: s.products.unit_of_measure,
                    image_url: s.products.image_url,
                    base_price: s.products.base_price,
                    is_active: s.products.is_active,
                    min_inventory_level: s.products.min_inventory_level,
                    accounting_id: s.products.accounting_id
                });
            }
        });
        return Array.from(map.values()).sort((a, b) => (Number(a.accounting_id) || 999999) - (Number(b.accounting_id) || 999999));
    }, [stocks]);

    const filteredPolicySkus = useMemo(() => {
        const rawQuery = skuPolicySearch.trim();

        // Normalización insensible a mayúsculas, diacríticos/tildes y espacios
        const normalizeText = (str: string | number | null | undefined): string => {
            if (str === null || str === undefined) return '';
            return String(str)
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .trim();
        };

        const matchesToken = (blob: string, token: string) => {
            if (blob.includes(token)) return true;
            // Coincidencia flexible de plurales y singulares en español (ej. "frutas" -> "fruta", "lacteos" -> "lacteo")
            if (token.endsWith('s') && token.length > 3 && blob.includes(token.slice(0, -1))) return true;
            if (token.endsWith('es') && token.length > 4 && blob.includes(token.slice(0, -2))) return true;
            return false;
        };

        const queryTokens = rawQuery ? normalizeText(rawQuery).split(/\s+/).filter(Boolean) : [];

        // Indexar células por inventory_group para resolución O(1)
        const cellMap = new Map<string, WorkCell>();
        workCells.forEach(c => {
            if (c.inventory_group) {
                cellMap.set(c.inventory_group.trim().toUpperCase(), c);
            }
        });

        return activeProductsCatalog.filter(p => {
            // Filtro estructural de Célula (dropdown)
            const cellGroup = p.inventory_group ? p.inventory_group.trim().toUpperCase() : 'SIN_ASIGNAR';
            const matchesCellDropdown = skuPolicyCellFilter === 'ALL' ||
                (skuPolicyCellFilter === 'SIN_ASIGNAR' && (!p.inventory_group || p.inventory_group.trim() === '')) ||
                (p.inventory_group && cellGroup === skuPolicyCellFilter.trim().toUpperCase());

            if (!matchesCellDropdown) return false;
            if (queryTokens.length === 0) return true;

            // Enriquecer datos para búsqueda inteligente omnicanal
            const cell = p.inventory_group ? cellMap.get(cellGroup) : null;
            const categoryLabel = (p.category && CATEGORY_MAP[p.category]) ? CATEGORY_MAP[p.category] : (p.category || '');
            const accountingIdStr = p.accounting_id !== null && p.accounting_id !== undefined ? String(p.accounting_id) : '';
            const accountingIdHash = accountingIdStr ? `#${accountingIdStr}` : '';

            // Blob unificado con todos los atributos relevantes del producto
            const productSearchBlob = normalizeText([
                accountingIdStr,
                accountingIdHash,
                p.name,
                p.sku,
                p.category,
                categoryLabel,
                p.inventory_group,
                cell?.name,
                cell?.short_name,
                cell?.description,
                cell?.leader_name,
                p.unit_of_measure,
                !p.inventory_group ? 'sin celula sin asignar huerfano' : ''
            ].filter(Boolean).join(' '));

            // AND lógico: cada palabra introducida debe coincidir en algún atributo
            return queryTokens.every(tok => matchesToken(productSearchBlob, tok));
        });
    }, [activeProductsCatalog, skuPolicySearch, skuPolicyCellFilter, workCells]);

    const SKU_PAGE_SIZE = 25;
    const totalSkuPages = Math.ceil(filteredPolicySkus.length / SKU_PAGE_SIZE) || 1;
    const paginatedPolicySkus = useMemo(() => {
        const start = (skuPolicyPage - 1) * SKU_PAGE_SIZE;
        return filteredPolicySkus.slice(start, start + SKU_PAGE_SIZE);
    }, [filteredPolicySkus, skuPolicyPage]);

    const skuCountsByCell = useMemo(() => {
        const counts: Record<string, number> = { SIN_ASIGNAR: 0 };
        workCells.forEach(c => {
            if (c.inventory_group) {
                counts[c.inventory_group.trim().toUpperCase()] = 0;
            }
        });
        activeProductsCatalog.forEach(p => {
            if (!p.inventory_group || !p.inventory_group.trim()) {
                counts.SIN_ASIGNAR = (counts.SIN_ASIGNAR || 0) + 1;
            } else {
                const grp = p.inventory_group.trim().toUpperCase();
                counts[grp] = (counts[grp] || 0) + 1;
            }
        });
        return counts;
    }, [workCells, activeProductsCatalog]);

    const handleReassignSkuCell = async (productId: string, newInventoryGroup: string) => {
        setSavingSkuId(productId);
        try {
            const cleanGroup = newInventoryGroup === 'SIN_ASIGNAR' ? null : newInventoryGroup.trim();
            const { error } = await supabase
                .from('products')
                .update({ 
                    inventory_group: cleanGroup
                })
                .eq('id', productId);

            if (error) throw error;

            // Actualizar reactivamente en stocks
            setStocks(prev => prev.map(item => {
                if (item.product_id === productId) {
                    return {
                        ...item,
                        products: {
                            ...item.products,
                            inventory_group: cleanGroup
                        }
                    };
                }
                return item;
            }));

            setSaveSkuSuccessId(productId);
            setTimeout(() => {
                if (isMounted.current) setSaveSkuSuccessId(null);
            }, 2500);
        } catch (err: any) {
            console.error('Error reasignando célula a producto:', err);
            alert('Error al reasignar célula: ' + (err.message || 'Error de conexión'));
        } finally {
            if (isMounted.current) setSavingSkuId(null);
        }
    };

    const handleAddCellResponsible = async (cellId: string) => {
        if (!selectedStaffForAssign) {
            alert('Por favor seleccione un colaborador de la planilla oficial de Talento Humano.');
            return;
        }

        const found = staffUsers.find(u => u.id === selectedStaffForAssign);
        if (!found) {
            alert('El colaborador seleccionado no pertenece a la planilla activa de Talento Humano.');
            return;
        }

        const targetCell = workCells.find(c => c.id === cellId);
        if (!targetCell) return;

        const currentResps = targetCell.responsibles || [];
        if (currentResps.some(r => r.id === found.id || r.name.trim().toLowerCase() === found.name.trim().toLowerCase())) {
            alert(`El colaborador "${found.name}" ya se encuentra asignado a esta célula.`);
            return;
        }

        const nextResps = [...currentResps, found];
        const updatedCells = workCells.map(c => {
            if (c.id === cellId) {
                return {
                    ...c,
                    responsibles: nextResps,
                    leader_name: c.leader_name || found.name,
                    leader_id: c.leader_id || found.id,
                    leader_role: c.leader_role || found.role || null,
                    updated_at: new Date().toISOString()
                };
            }
            return c;
        });

        setIsSavingCell(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'work_cells_governance',
                    value: JSON.stringify(updatedCells),
                    description: 'Configuración oficial de Células de Alistamiento e Inventario con sus Responsables asignados',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) throw error;
            setWorkCells(updatedCells);
            setAssigningCellId(null);
            setSelectedStaffForAssign('');
        } catch (err: any) {
            console.error('Error al agregar responsable a la célula:', err);
            alert('Error al guardar responsable: ' + (err.message || 'Error de conexión'));
        } finally {
            setIsSavingCell(false);
        }
    };

    const handleRemoveCellResponsible = async (cellId: string, responsibleId: string) => {
        const targetCell = workCells.find(c => c.id === cellId);
        if (!targetCell) return;

        const nextResps = (targetCell.responsibles || []).filter(r => r.id !== responsibleId);
        const newLeader = nextResps[0];

        const updatedCells = workCells.map(c => {
            if (c.id === cellId) {
                return {
                    ...c,
                    responsibles: nextResps,
                    leader_name: newLeader ? newLeader.name : null,
                    leader_id: newLeader ? newLeader.id : null,
                    leader_role: newLeader ? newLeader.role || null : null,
                    updated_at: new Date().toISOString()
                };
            }
            return c;
        });

        setIsSavingCell(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'work_cells_governance',
                    value: JSON.stringify(updatedCells),
                    description: 'Configuración oficial de Células de Alistamiento e Inventario con sus Responsables asignados',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) throw error;
            setWorkCells(updatedCells);
        } catch (err: any) {
            console.error('Error al remover responsable de la célula:', err);
            alert('Error al remover responsable: ' + (err.message || 'Error de conexión'));
        } finally {
            setIsSavingCell(false);
        }
    };

    const handleCreateNewCell = async () => {
        if (!newCellForm.name.trim()) {
            alert('Por favor ingrese el nombre de la nueva célula.');
            return;
        }
        if (!newCellForm.inventory_group.trim()) {
            alert('Por favor ingrese el nombre del Grupo Contable / Inventario.');
            return;
        }

        const normalizedGroup = newCellForm.inventory_group.trim().toUpperCase();
        if (workCells.some(c => c.inventory_group && c.inventory_group.trim().toUpperCase() === normalizedGroup)) {
            alert(`Ya existe una célula configurada con el grupo "${normalizedGroup}".`);
            return;
        }

        const slug = newCellForm.short_name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') || `cell_${Date.now()}`;
        const initialResps: CellResponsible[] = [];
        let leaderName: string | null = null;
        let leaderId: string | null = null;
        let leaderRole: string | null = null;

        if (newCellForm.initial_responsible_id) {
            const foundStaff = staffUsers.find(u => u.id === newCellForm.initial_responsible_id);
            if (foundStaff) {
                initialResps.push(foundStaff);
                leaderName = foundStaff.name;
                leaderId = foundStaff.id;
                leaderRole = foundStaff.role || 'Líder Operativo';
            }
        }

        const newCell: WorkCell = {
            id: slug,
            name: newCellForm.name.trim(),
            short_name: newCellForm.short_name.trim() || newCellForm.name.trim(),
            icon: newCellForm.icon.trim() || 'package',
            inventory_group: normalizedGroup,
            categories: [],
            buying_teams: [],
            leader_id: leaderId,
            leader_name: leaderName,
            leader_role: leaderRole,
            backup_id: null,
            backup_name: null,
            responsibles: initialResps,
            color: newCellForm.color || '#0D7A57',
            badge_bg: `${newCellForm.color || '#0D7A57'}18`,
            badge_text: newCellForm.color || '#0D7A57',
            description: newCellForm.description.trim() || `Célula de gestión para ${newCellForm.name}`,
            updated_at: new Date().toISOString()
        };

        const updatedCells = [...workCells, newCell];
        setIsSavingCell(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert({
                    key: 'work_cells_governance',
                    value: JSON.stringify(updatedCells),
                    description: 'Configuración oficial de Células de Alistamiento e Inventario con sus Responsables asignados',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'key' });

            if (error) throw error;
            setWorkCells(updatedCells);
            setIsNewCellModalOpen(false);
            setNewCellForm({
                name: '',
                short_name: '',
                inventory_group: '',
                color: '#0D7A57',
                icon: 'package',
                description: '',
                initial_responsible_id: ''
            });
        } catch (err: any) {
            console.error('Error al crear nueva célula:', err);
            alert('Error al crear la célula: ' + (err.message || 'Error de conexión'));
        } finally {
            setIsSavingCell(false);
        }
    };



    useEffect(() => {
        isMounted.current = true;
        const controller = new AbortController();
        fetchData(controller.signal);
        return () => { 
            isMounted.current = false;
            controller.abort();
        };
    }, [fetchData]);

    // Background polling: silently update stock details every 10 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            const controller = new AbortController();
            fetchData(controller.signal, true);
        }, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const handleApplyMovement = useCallback(async (productId: string, qty: number, type: 'entry' | 'exit' | 'adjustment', status: string, notes: string) => {
        try {
            const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
            if (!warehouseData) throw new Error('No hay bodegas configuradas');

            const delta = type === 'exit' ? -Math.abs(qty) : qty;

            const { error } = await supabase
                .from('inventory_movements')
                .insert([{
                    product_id: productId,
                    warehouse_id: warehouseData.id,
                    quantity: delta,
                    type,
                    status_to: status,
                    notes,
                    reference_type: 'manual'
                }]);

            if (error) throw error;

            // Sincronización síncrona en inventory_stocks como salvaguarda inmediata
            const { data: currentStock } = await supabase
                .from('inventory_stocks')
                .select('id, quantity')
                .eq('product_id', productId)
                .eq('warehouse_id', warehouseData.id)
                .maybeSingle();

            if (currentStock) {
                const newQty = Math.max(0, Number(currentStock.quantity || 0) + delta);
                await supabase
                    .from('inventory_stocks')
                    .update({ quantity: newQty, updated_at: new Date().toISOString() })
                    .eq('id', currentStock.id);
            } else {
                await supabase
                    .from('inventory_stocks')
                    .insert([{
                        product_id: productId,
                        warehouse_id: warehouseData.id,
                        quantity: Math.max(0, delta),
                        min_stock_level: 0,
                        status: 'available'
                    }]);
            }

            (window as any).showToast?.('Movimiento registrado y existencias actualizadas con éxito', 'success');
            setIsMovementModalOpen(false);
            fetchData();
        } catch (error: any) {
            console.error('Error applying inventory movement:', error);
            const message = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            alert('Error al aplicar ajuste: ' + message);
        }
    }, [fetchData]);

    const generateRandomTask = async () => {
        // ... previous implementation ...
    };

    interface StockFamily {
        id: string;
        parent: InventoryItem;
        isParent: boolean;
        children: InventoryItem[];
        totalQuantity: number;
        totalValue: number;
    }

    const matchSearchSegment = (item: InventoryItem, segment: string): boolean => {
        const p = item.products;
        if (!p) return false;

        const parts = segment.split(/\s+/);
        const tags = parts.filter(pt => pt.startsWith('@')).map(t => t.slice(1));
        const searchTerms = parts.filter(pt => !pt.startsWith('@'));

        const matchesText = searchTerms.every(term => 
            p.name?.toLowerCase().includes(term) ||
            p.accounting_id?.toString()?.includes(term)
        );

        if (!matchesText && searchTerms.length > 0) return false;

        const matchesTags = tags.every(tag => {
            if (tag === 'alerta' || tag === 'bajo' || tag === 'critico') {
                return item.quantity <= (p.min_inventory_level || 0);
            }
            if (tag === 'disponible' || tag === 'ok') return item.status === 'available';
            if (tag === 'regreso') return item.status === 'returned';
            if (tag === 'reproceso') return item.status === 'in_process';

            const categoryEntry = Object.entries(CATEGORY_MAP).find(([, label]) => 
                String(label).toLowerCase().startsWith(tag)
            );
            if (categoryEntry && p.category === categoryEntry[0]) return true;

            return false;
        });

        return matchesTags;
    };

    const filteredFamilies = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const segments = query ? query.split(',').map(s => s.trim()).filter(Boolean) : [];

        // 1. First apply Status Filter (Tab buttons)
        const currentStocks = stockStatusFilter === 'all' 
            ? stocks 
            : stocks.filter(s => s.status === stockStatusFilter);

        // 2. Identify children and group by parent_id
        const childrenByParent = new Map<string, InventoryItem[]>();
        const childProductIds = new Set<string>();

        currentStocks.forEach(item => {
            const p = item.products;
            if (p?.parent_id && p.parent_id !== item.product_id) {
                childProductIds.add(item.product_id);
                const list = childrenByParent.get(p.parent_id) || [];
                list.push(item);
                childrenByParent.set(p.parent_id, list);
            }
        });

        // 3. Build base families from non-child items (parents and standalones)
        const baseFamilies: StockFamily[] = [];
        const processedProductIds = new Set<string>();

        currentStocks.forEach(item => {
            if (childProductIds.has(item.product_id)) {
                // If the parent exists in currentStocks, child will be nested under it
                const parentExists = currentStocks.some(s => s.product_id === item.products?.parent_id);
                if (parentExists) return;
            }

            if (processedProductIds.has(item.product_id)) return;
            processedProductIds.add(item.product_id);

            const hasChildren = childrenByParent.has(item.product_id);
            const children = (childrenByParent.get(item.product_id) || []).sort(
                (a, b) => (a.products?.accounting_id || 0) - (b.products?.accounting_id || 0)
            );

            baseFamilies.push({
                id: item.product_id,
                parent: item,
                isParent: hasChildren,
                children,
                totalQuantity: 0,
                totalValue: 0
            });
        });

        // 4. Apply search query & compute consolidated totals
        const result: StockFamily[] = [];

        baseFamilies.forEach(family => {
            if (segments.length === 0) {
                const childrenQty = family.children.reduce((sum, ch) => sum + (ch.quantity || 0), 0);
                const ownQty = family.parent.quantity || 0;
                const totalQuantity = family.isParent ? childrenQty : ownQty;

                const childrenVal = family.children.reduce((sum, ch) => sum + ((avgCosts[ch.product_id] || 0) * (ch.quantity || 0)), 0);
                const ownVal = (avgCosts[family.parent.product_id] || 0) * ownQty;
                const totalValue = family.isParent ? childrenVal : ownVal;

                result.push({
                    ...family,
                    totalQuantity,
                    totalValue
                });
                return;
            }

            const parentMatches = segments.some(seg => matchSearchSegment(family.parent, seg));
            const matchingChildren = family.children.filter(ch => 
                segments.some(seg => matchSearchSegment(ch, seg))
            );

            if (parentMatches || matchingChildren.length > 0) {
                const activeChildren = parentMatches ? family.children : matchingChildren;

                const childrenQty = activeChildren.reduce((sum, ch) => sum + (ch.quantity || 0), 0);
                const ownQty = family.parent.quantity || 0;
                const totalQuantity = family.isParent ? childrenQty : ownQty;

                const childrenVal = activeChildren.reduce((sum, ch) => sum + ((avgCosts[ch.product_id] || 0) * (ch.quantity || 0)), 0);
                const ownVal = (avgCosts[family.parent.product_id] || 0) * ownQty;
                const totalValue = family.isParent ? childrenVal : ownVal;

                result.push({
                    ...family,
                    children: activeChildren,
                    totalQuantity,
                    totalValue
                });
            }
        });

        return result;
    }, [stocks, searchQuery, stockStatusFilter, avgCosts]);

    const sortedFamilies = useMemo(() => {
        const list = [...filteredFamilies];

        if (sortField === 'default') {
            const today = new Date().toISOString().split('T')[0];
            const currentTask = randomTasks.find(t => t.scheduled_date === today);
            
            return list.sort((a, b) => {
                if (currentTask) {
                    const itemA = currentTask.items.find(i => i.product_id === a.parent.product_id);
                    const itemB = currentTask.items.find(i => i.product_id === b.parent.product_id);
                    
                    const diffA = itemA?.actual_qty !== null ? Math.abs(itemA?.difference_percent || 0) : 0;
                    const diffB = itemB?.actual_qty !== null ? Math.abs(itemB?.difference_percent || 0) : 0;
                    
                    if (diffA !== diffB) return diffB - diffA;
                }
                
                return (a.parent.products?.accounting_id || 0) - (b.parent.products?.accounting_id || 0);
            });
        }

        return list.sort((a, b) => {
            let comp = 0;

            switch (sortField) {
                case 'product': {
                    const nameA = a.parent.products?.name || '';
                    const nameB = b.parent.products?.name || '';
                    comp = nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
                    break;
                }
                case 'id_contable': {
                    const idA = a.parent.products?.accounting_id || 0;
                    const idB = b.parent.products?.accounting_id || 0;
                    comp = idA - idB;
                    break;
                }
                case 'min_stock': {
                    const minA = a.parent.products?.min_inventory_level || 0;
                    const minB = b.parent.products?.min_inventory_level || 0;
                    comp = minA - minB;
                    break;
                }
                case 'cost': {
                    const costA = avgCosts[a.parent.product_id] || a.parent.products?.base_price || 0;
                    const costB = avgCosts[b.parent.product_id] || b.parent.products?.base_price || 0;
                    comp = costA - costB;
                    break;
                }
                case 'total_value': {
                    comp = a.totalValue - b.totalValue;
                    break;
                }
                case 'uom': {
                    const uomA = a.parent.products?.unit_of_measure || '';
                    const uomB = b.parent.products?.unit_of_measure || '';
                    comp = uomA.localeCompare(uomB, 'es', { sensitivity: 'base' });
                    break;
                }
                case 'quantity': {
                    comp = a.totalQuantity - b.totalQuantity;
                    break;
                }
                default:
                    comp = 0;
            }

            return sortDirection === 'asc' ? comp : -comp;
        });
    }, [filteredFamilies, sortField, sortDirection, avgCosts, randomTasks]);

    const paginatedFamilies = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedFamilies.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [sortedFamilies, currentPage]);

    const getSortedChildren = useCallback((children: InventoryItem[]) => {
        if (!children || children.length === 0) return [];
        if (sortField === 'default') return children;

        return [...children].sort((a, b) => {
            let comp = 0;
            switch (sortField) {
                case 'product':
                    comp = (a.products?.name || '').localeCompare(b.products?.name || '', 'es', { sensitivity: 'base' });
                    break;
                case 'id_contable':
                    comp = (a.products?.accounting_id || 0) - (b.products?.accounting_id || 0);
                    break;
                case 'min_stock':
                    comp = (a.products?.min_inventory_level || 0) - (b.products?.min_inventory_level || 0);
                    break;
                case 'cost': {
                    const costA = avgCosts[a.product_id] || a.products?.base_price || 0;
                    const costB = avgCosts[b.product_id] || b.products?.base_price || 0;
                    comp = costA - costB;
                    break;
                }
                case 'total_value': {
                    const valA = (avgCosts[a.product_id] || a.products?.base_price || 0) * (a.quantity || 0);
                    const valB = (avgCosts[b.product_id] || b.products?.base_price || 0) * (b.quantity || 0);
                    comp = valA - valB;
                    break;
                }
                case 'uom':
                    comp = (a.products?.unit_of_measure || '').localeCompare(b.products?.unit_of_measure || '', 'es', { sensitivity: 'base' });
                    break;
                case 'quantity':
                    comp = (a.quantity || 0) - (b.quantity || 0);
                    break;
                default:
                    comp = (a.products?.accounting_id || 0) - (b.products?.accounting_id || 0);
            }
            return sortDirection === 'asc' ? comp : -comp;
        });
    }, [sortField, sortDirection, avgCosts]);

    const totalPages = Math.ceil(filteredFamilies.length / ITEMS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, stockStatusFilter]);

    const hierarchyStats = useMemo(() => {
        const parentIdsWithChildren = new Set<string>();
        stocks.forEach(item => {
            const p = item.products;
            if (p?.parent_id && p.parent_id !== item.product_id) {
                parentIdsWithChildren.add(p.parent_id);
            }
        });

        let parentsCount = 0;
        let childrenCount = 0;
        let standaloneCount = 0;

        const uniqueProductIds = new Set<string>();
        stocks.forEach(item => {
            if (uniqueProductIds.has(item.product_id)) return;
            uniqueProductIds.add(item.product_id);

            const p = item.products;
            const isChild = p?.parent_id && p.parent_id !== item.product_id;
            const isParent = parentIdsWithChildren.has(item.product_id);

            if (isParent) {
                parentsCount++;
            } else if (isChild) {
                childrenCount++;
            } else {
                standaloneCount++;
            }
        });

        return {
            parentsCount,
            childrenCount,
            standaloneCount,
            totalProducts: uniqueProductIds.size || stocks.length
        };
    }, [stocks]);

    const stats = {
        totalItems: stocks.length, // total monitored
        lowStock: stocks.filter(s => (s.products?.min_inventory_level || 0) > 0 && s.quantity < (s.products?.min_inventory_level || 0)).length,
        totalValue: stocks.reduce((acc, s) => acc + (s.quantity * (avgCosts[s.product_id] || 0)), 0),
        pendingTasks: randomTasks.filter(t => t.status !== 'completed').length
    };

    // --- KARDEX MULTI-DÍA Y JERARQUÍA PADRE - HIJO ---
    const movementsByProduct = useMemo(() => {
        const map: Record<string, Movement[]> = {};
        movements.forEach(m => {
            if (!m.product_id) return;
            if (!map[m.product_id]) map[m.product_id] = [];
            map[m.product_id].push(m);
        });
        return map;
    }, [movements]);

    const computeKardexSummary = useCallback((productId: string, currentStock: number) => {
        const list = movementsByProduct[productId] || [];
        let entries = 0;
        let exits = 0;
        let adjustments = 0;

        list.forEach(m => {
            const qty = Number(m.quantity) || 0;
            if (m.type === 'entry') {
                entries += Math.abs(qty);
            } else if (m.type === 'exit') {
                exits += Math.abs(qty);
            } else if (m.type === 'adjustment') {
                adjustments += qty;
            } else if (qty > 0) {
                entries += qty;
            } else if (qty < 0) {
                exits += Math.abs(qty);
            }
        });

        const netFlow = entries - exits + adjustments;
        return {
            entries,
            exits,
            adjustments,
            netFlow,
            currentStock,
            movementsCount: list.length,
            transactions: list
        };
    }, [movementsByProduct]);

    const kardexKpis = useMemo(() => {
        let totalEntries = 0;
        let totalExits = 0;
        let totalAdjustments = 0;
        const activeProductsSet = new Set<string>();

        movements.forEach(m => {
            const qty = Number(m.quantity) || 0;
            if (m.product_id) activeProductsSet.add(m.product_id);

            if (m.type === 'entry') {
                totalEntries += Math.abs(qty);
            } else if (m.type === 'exit') {
                totalExits += Math.abs(qty);
            } else if (m.type === 'adjustment') {
                totalAdjustments += qty;
            } else if (qty > 0) {
                totalEntries += qty;
            } else if (qty < 0) {
                totalExits += Math.abs(qty);
            }
        });

        return {
            totalEntries,
            totalExits,
            netBalance: totalEntries - totalExits + totalAdjustments,
            activeSkusCount: activeProductsSet.size,
            totalMovements: movements.length
        };
    }, [movements]);

    const kardexFamilies = useMemo(() => {
        // Aggregate stocks by product_id to ensure exact 1-to-1 representation per product
        const uniqueStockMap = new Map<string, InventoryItem>();
        stocks.forEach(item => {
            const existing = uniqueStockMap.get(item.product_id);
            if (!existing) {
                uniqueStockMap.set(item.product_id, { ...item });
            } else {
                existing.quantity = (existing.quantity || 0) + (item.quantity || 0);
            }
        });
        const deduplicatedStocks = Array.from(uniqueStockMap.values());

        const parentIdsWithChildren = new Set<string>();
        deduplicatedStocks.forEach(item => {
            const p = item.products;
            if (p?.parent_id && p.parent_id !== item.product_id) {
                parentIdsWithChildren.add(p.parent_id);
            }
        });

        const childrenMap: Record<string, InventoryItem[]> = {};
        const parentsAndStandalone: InventoryItem[] = [];
        const processedProductIds = new Set<string>();

        deduplicatedStocks.forEach(item => {
            const p = item.products;
            const isChild = p?.parent_id && p.parent_id !== item.product_id;
            if (isChild && p?.parent_id) {
                if (!childrenMap[p.parent_id]) childrenMap[p.parent_id] = [];
                childrenMap[p.parent_id].push(item);
            } else {
                if (!processedProductIds.has(item.product_id)) {
                    processedProductIds.add(item.product_id);
                    parentsAndStandalone.push(item);
                }
            }
        });

        const segments = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);

        const list: {
            parent: InventoryItem;
            isParent: boolean;
            childrenWithSummary: { child: InventoryItem; summary: ReturnType<typeof computeKardexSummary> }[];
            summary: {
                entries: number;
                exits: number;
                adjustments: number;
                netFlow: number;
                currentStock: number;
                movementsCount: number;
                transactions: Movement[];
            };
        }[] = [];

        parentsAndStandalone.forEach(parentItem => {
            const pid = parentItem.product_id;
            const isParent = parentIdsWithChildren.has(pid);
            const children = childrenMap[pid] || [];

            const childrenWithSummary = children.map(ch => ({
                child: ch,
                summary: computeKardexSummary(ch.product_id, ch.quantity || 0)
            }));

            const ownSummary = computeKardexSummary(pid, parentItem.quantity || 0);

            const entries = isParent ? childrenWithSummary.reduce((acc, c) => acc + c.summary.entries, 0) + ownSummary.entries : ownSummary.entries;
            const exits = isParent ? childrenWithSummary.reduce((acc, c) => acc + c.summary.exits, 0) + ownSummary.exits : ownSummary.exits;
            const adjustments = isParent ? childrenWithSummary.reduce((acc, c) => acc + c.summary.adjustments, 0) + ownSummary.adjustments : ownSummary.adjustments;
            const netFlow = entries - exits + adjustments;
            const currentStock = isParent ? childrenWithSummary.reduce((acc, c) => acc + c.summary.currentStock, 0) : ownSummary.currentStock;
            const movementsCount = isParent ? childrenWithSummary.reduce((acc, c) => acc + c.summary.movementsCount, 0) + ownSummary.movementsCount : ownSummary.movementsCount;

            const transactions = isParent 
                ? [
                    ...ownSummary.transactions,
                    ...childrenWithSummary.flatMap(c => c.summary.transactions)
                ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                : ownSummary.transactions;

            const familySummary = {
                entries,
                exits,
                adjustments,
                netFlow,
                currentStock,
                movementsCount,
                transactions
            };

            const hasActivity = familySummary.movementsCount > 0 || familySummary.entries > 0 || familySummary.exits > 0;
            if (movementsFilterActiveOnly && !hasActivity) {
                return;
            }

            if (segments.length > 0) {
                const parentName = (parentItem.products?.name || '').toLowerCase();
                const parentIdContable = String(parentItem.products?.accounting_id || '');
                const parentMatches = segments.some(seg => parentName.includes(seg) || parentIdContable.includes(seg));

                const matchingChildren = childrenWithSummary.filter(c => {
                    const cName = (c.child.products?.name || '').toLowerCase();
                    const cId = String(c.child.products?.accounting_id || '');
                    return segments.some(seg => cName.includes(seg) || cId.includes(seg));
                });

                if (!parentMatches && matchingChildren.length === 0) {
                    return;
                }
            }

            list.push({
                parent: parentItem,
                isParent,
                childrenWithSummary,
                summary: familySummary
            });
        });

        return list.sort((a, b) => {
            if (b.summary.movementsCount !== a.summary.movementsCount) {
                return b.summary.movementsCount - a.summary.movementsCount;
            }
            return (a.parent.products?.accounting_id || 0) - (b.parent.products?.accounting_id || 0);
        });
    }, [stocks, movements, movementsByProduct, computeKardexSummary, movementsFilterActiveOnly, searchQuery]);

    const returnMovements = useMemo(() => {
        return movements.filter(m => m.status_to === 'returned' || m.admin_decision || m.evidence_url || m.reference_type === 'return');
    }, [movements]);

    const filteredReturnMovements = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return returnMovements;
        return returnMovements.filter(m => 
            (m.products?.name || '').toLowerCase().includes(q) ||
            (m.products?.sku || '').toLowerCase().includes(q) ||
            String(m.products?.accounting_id || '').includes(q) ||
            (m.notes || '').toLowerCase().includes(q)
        );
    }, [returnMovements, searchQuery]);

    const handleExportKardexExcel = useCallback(() => {
        try {
            setExportingExcel(true);
            
            const summaryRows: any[] = [];
            kardexFamilies.forEach(kf => {
                const cell = kf.parent.products?.inventory_group ? cellByGroup.get(kf.parent.products.inventory_group.trim().toUpperCase()) : null;
                summaryRows.push({
                    ID_CONTABLE: kf.parent.products?.accounting_id ?? '—',
                    JERARQUIA: kf.isParent ? 'PADRE' : 'STANDALONE',
                    CELULA: cell?.short_name || kf.parent.products?.inventory_group || '—',
                    RESPONSABLE_CELULA: cell?.leader_name || '—',
                    PRODUCTO: kf.parent.products?.name || 'Desconocido',
                    CATEGORIA: CATEGORY_MAP[kf.parent.products?.category || ''] || kf.parent.products?.category || '',
                    UNIDAD: kf.parent.products?.unit_of_measure || '',
                    ENTRADAS_PERIODO: kf.summary.entries,
                    SALIDAS_PERIODO: kf.summary.exits,
                    AJUSTES_PERIODO: kf.summary.adjustments,
                    FLUJO_NETO: kf.summary.netFlow,
                    STOCK_ACTUAL: kf.summary.currentStock,
                    CANT_TRANSACCIONES: kf.summary.movementsCount
                });

                if (kf.isParent) {
                    kf.childrenWithSummary.forEach(cws => {
                        const childCell = (cws.child.products?.inventory_group ? cellByGroup.get(cws.child.products.inventory_group.trim().toUpperCase()) : null) || cell;
                        summaryRows.push({
                            ID_CONTABLE: cws.child.products?.accounting_id ?? '—',
                            JERARQUIA: '  ↳ HIJO',
                            CELULA: childCell?.short_name || cws.child.products?.inventory_group || '—',
                            RESPONSABLE_CELULA: childCell?.leader_name || '—',
                            PRODUCTO: `   ↳ ${cws.child.products?.name || 'Variante'}`,
                            CATEGORIA: CATEGORY_MAP[cws.child.products?.category || ''] || cws.child.products?.category || '',
                            UNIDAD: cws.child.products?.unit_of_measure || '',
                            ENTRADAS_PERIODO: cws.summary.entries,
                            SALIDAS_PERIODO: cws.summary.exits,
                            AJUSTES_PERIODO: cws.summary.adjustments,
                            FLUJO_NETO: cws.summary.netFlow,
                            STOCK_ACTUAL: cws.summary.currentStock,
                            CANT_TRANSACCIONES: cws.summary.movementsCount
                        });
                    });
                }
            });

            const transactionRows = movements.map(m => {
                const p = m.products;
                const parentId = p?.parent_id;
                const isChild = parentId && parentId !== m.product_id;
                const mCell = p?.inventory_group ? cellByGroup.get(p.inventory_group.trim().toUpperCase()) : null;

                let tipoTexto = 'AJUSTE';
                if (m.type === 'entry') tipoTexto = 'ENTRADA';
                else if (m.type === 'exit') tipoTexto = 'SALIDA';
                else if (m.type === 'transfer') tipoTexto = 'TRASLADO';

                return {
                    FECHA_HORA: new Date(m.created_at).toLocaleString('es-CO'),
                    ID_CONTABLE: p?.accounting_id ?? '—',
                    CELULA: mCell?.short_name || p?.inventory_group || '—',
                    RESPONSABLE_CELULA: mCell?.leader_name || '—',
                    PRODUCTO: p?.name || 'Desconocido',
                    JERARQUIA: isChild ? 'HIJO' : 'PADRE/STANDALONE',
                    TIPO_MOVIMIENTO: tipoTexto,
                    CANTIDAD: m.quantity,
                    UNIDAD: p?.unit_of_measure || '',
                    ORIGEN_REF: m.reference_type || 'Manual',
                    DOCUMENTO_REF: m.reference_id || '—',
                    ESTADO_DESTINO: m.status_to || 'disponible',
                    NOTAS: m.notes || '—'
                };
            });

            const wb = XLSX.utils.book_new();
            const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
            const wsTrans = XLSX.utils.json_to_sheet(transactionRows);

            wsSummary['!cols'] = [
                { wch: 14 },
                { wch: 16 },
                { wch: 38 },
                { wch: 18 },
                { wch: 10 },
                { wch: 18 },
                { wch: 18 },
                { wch: 16 },
                { wch: 16 },
                { wch: 16 },
                { wch: 20 }
            ];

            wsTrans['!cols'] = [
                { wch: 20 },
                { wch: 14 },
                { wch: 35 },
                { wch: 16 },
                { wch: 16 },
                { wch: 14 },
                { wch: 10 },
                { wch: 20 },
                { wch: 30 },
                { wch: 16 },
                { wch: 35 }
            ];

            XLSX.utils.book_append_sheet(wb, wsSummary, "Kardex_Consolidado");
            XLSX.utils.book_append_sheet(wb, wsTrans, "Detalle_Transacciones");

            let rangeLabel = 'Ultimos_8_Dias';
            if (movementsDateRange === 'today') rangeLabel = 'Hoy';
            else if (movementsDateRange === 'custom') rangeLabel = `${customStartDate}_al_${customEndDate}`;

            const todayStr = new Date().toISOString().split('T')[0];
            const fileName = `Kardex_FruFresco_${rangeLabel}_${todayStr}.xlsx`;

            XLSX.writeFile(wb, fileName);
        } catch (err: any) {
            console.error('Error al exportar Excel:', err);
            alert('Error exportando Excel: ' + (err.message || 'Error desconocido'));
        } finally {
            setExportingExcel(false);
        }
    }, [kardexFamilies, movements, movementsDateRange, customStartDate, customEndDate]);

    const renderSortableTh = (
        field: StockSortField, 
        label: string, 
        align: 'left' | 'center' | 'right' = 'left',
        extraStyle: React.CSSProperties = {}
    ) => {
        const isCurrent = sortField === field;
        return (
            <th 
                key={field}
                onClick={() => handleSort(field)}
                style={{ 
                    ...dynamicThStyle, 
                    textAlign: align,
                    cursor: 'pointer',
                    userSelect: 'none',
                    transition: 'all 0.15s ease',
                    backgroundColor: isCurrent ? '#F1F5F9' : dynamicThStyle.backgroundColor,
                    ...extraStyle
                }}
                title={`Ordenar por ${label} (${isCurrent ? (sortDirection === 'asc' ? 'cambiar a descendente' : 'restablecer orden predeterminado') : 'clic para ordenar'})`}
            >
                <div style={{ 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '6px',
                    justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
                    width: '100%',
                    color: isCurrent ? THEME.colors.primary : 'inherit'
                }}>
                    <span style={{ fontWeight: isCurrent ? '800' : '700' }}>{label}</span>
                    <span style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2px',
                        borderRadius: '4px',
                        backgroundColor: isCurrent ? 'rgba(13, 122, 87, 0.12)' : 'transparent',
                        color: isCurrent ? THEME.colors.primary : '#94A3B8',
                        transition: 'all 0.15s ease'
                    }}>
                        {isCurrent ? (
                            sortDirection === 'asc' ? (
                                <ArrowUp size={13} strokeWidth={2.6} />
                            ) : (
                                <ArrowDown size={13} strokeWidth={2.6} />
                            )
                        ) : (
                            <ArrowUpDown size={12} strokeWidth={1.8} style={{ opacity: 0.45 }} />
                        )}
                    </span>
                </div>
            </th>
        );
    };

    return (
        <main style={styles.main}>
            <Toast />

            <div style={{
                ...styles.container,
                maxWidth: '100%',
                padding: '0.85rem 1.75rem'
            }}>
                <div style={styles.header}>
                    <div style={styles.titleArea}>
                        <h1 style={styles.title}>Control de Inventarios</h1>
                        <p style={styles.subtitle}>Consolidación multi-estado, trazabilidad total y auditoría inteligente.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Link href="/admin/commercial/inventory/tasks" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    padding: '0.55rem 1.1rem', 
                                    borderRadius: '10px', 
                                    border: '1px solid #E2E8F0', 
                                    background: '#FFFFFF', 
                                    color: '#334155', 
                                    fontWeight: '700', 
                                    fontSize: '0.82rem', 
                                    cursor: 'pointer', 
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    transition: 'all 0.15s ease-in-out'
                                }}
                                onMouseEnter={(e) => { 
                                    e.currentTarget.style.backgroundColor = '#F8FAFC'; 
                                    e.currentTarget.style.borderColor = '#CBD5E1';
                                }}
                                onMouseLeave={(e) => { 
                                    e.currentTarget.style.backgroundColor = '#FFFFFF'; 
                                    e.currentTarget.style.borderColor = '#E2E8F0'; 
                                }}
                            >
                                <ClipboardList size={14} strokeWidth={2} style={{ color: '#64748B' }} />
                                Tareas Administrativas
                            </button>
                        </Link>
                        {activeTab === 'random_tasks' && (
                            <button 
                                onClick={generateRandomTask}
                                style={{ 
                                    padding: '0.55rem 1.25rem', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: THEME.colors.accent, 
                                    color: 'white', 
                                    fontWeight: '700', 
                                    fontSize: '0.8rem', 
                                    cursor: 'pointer', 
                                    boxShadow: THEME.shadow.sm,
                                    transition: 'all 0.2s ease-in-out'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.md;
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                }}
                            >
                                Generar Tarea
                            </button>
                        )}
                    </div>
                </div>

                {/* ========================================================
                    NIVEL 1: NAVEGACIÓN PRINCIPAL DE VISTAS (MASTER TABS)
                    Ubicación 100% Constante y Fija (Eje X y Eje Y Estables)
                ======================================================== */}
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '0.85rem',
                    gap: '1rem',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ 
                        display: 'flex', 
                        gap: '0.35rem', 
                        backgroundColor: '#F1F5F9', 
                        padding: '4px', 
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0'
                    }}>
                        <TabButton 
                            active={activeTab === 'dashboard'} 
                            onClick={() => setActiveTab('dashboard')} 
                            label="Dashboard Directivo" 
                            icon={<BarChart3 size={15} strokeWidth={2} />} 
                        />
                        <TabButton 
                            active={activeTab === 'stock'} 
                            onClick={() => setActiveTab('stock')} 
                            label="Consolidado" 
                            icon={<Layers size={15} strokeWidth={2} />} 
                        />
                        <TabButton 
                            active={activeTab === 'daily_balance'} 
                            onClick={() => setActiveTab('daily_balance')} 
                            label="Balance Diario (24 Col)" 
                            icon={<FileSpreadsheet size={15} strokeWidth={2} />} 
                        />
                        <TabButton 
                            active={activeTab === 'movements'} 
                            onClick={() => setActiveTab('movements')} 
                            label="Movimientos / Kardex" 
                            icon={<History size={15} strokeWidth={2} />} 
                        />
                        <TabButton 
                            active={activeTab === 'random_tasks'} 
                            onClick={() => setActiveTab('random_tasks')} 
                            label="Auditoría" 
                            icon={<ClipboardList size={15} strokeWidth={2} />} 
                            badge={stats.pendingTasks > 0 ? stats.pendingTasks : undefined}
                        />
                        <TabButton 
                            active={activeTab === 'settings'} 
                            onClick={() => setActiveTab('settings')} 
                            label="Gobernanza" 
                            icon={<Users size={15} strokeWidth={2} />} 
                        />
                    </div>

                    {/* Badge contextual de la vista activa */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        {activeTab === 'dashboard' && (
                            <div style={{ 
                                fontSize: '0.78rem', 
                                color: '#0D7A57', 
                                fontWeight: '700',
                                backgroundColor: '#ECFDF5',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #A7F3D0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <BarChart3 size={13} />
                                <span>Control Financiero & Células Lean</span>
                            </div>
                        )}
                        {activeTab === 'stock' && (
                            <div style={{ 
                                fontSize: '0.78rem', 
                                color: '#475569', 
                                fontWeight: '600',
                                backgroundColor: '#F8FAF9',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                                <span><strong>{formatNumber(filteredFamilies.length, 0)}</strong> familias en catálogo</span>
                            </div>
                        )}
                        {activeTab === 'movements' && (
                            <div style={{ 
                                fontSize: '0.78rem', 
                                color: '#4338CA', 
                                fontWeight: '700',
                                backgroundColor: '#EEF2FF',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #C7D2FE',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Clock size={13} />
                                <span>Kardex Operativo Multi-Día</span>
                            </div>
                        )}
                        {activeTab === 'settings' && (
                            <div style={{ 
                                fontSize: '0.78rem', 
                                color: '#0D7A57', 
                                fontWeight: '700',
                                backgroundColor: '#ECFDF5',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '8px',
                                border: '1px solid #A7F3D0',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <Users size={13} />
                                <span>Gobernanza de Células & SKUs ({workCells.length} Células)</span>
                            </div>
                        )}
                    </div>
                </div>

                {activeTab === 'dashboard' ? (
                    <div style={{ marginTop: '0.75rem' }}>
                        <InventoryUnifiedDashboard 
                            onSelectProduct={(productId) => {
                                const prod = stocks.find(s => s.product_id === productId)?.products;
                                if (prod?.name) {
                                    setSearchQuery(prod.name);
                                } else if (productId) {
                                    setSearchQuery(productId);
                                }
                                setActiveTab('stock');
                            }} 
                        />
                    </div>
                ) : activeTab === 'daily_balance' ? (
                    <div style={{ marginTop: '0.5rem' }}>
                        <InventoryDailyBalanceTab workCells={workCells} />
                    </div>
                ) : (
                    <>
                        {/* KPIs contextuales dentro del contenido de la pestaña */}
                        {activeTab === 'movements' ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                <KPICard 
                                    title="Total Entradas (+)" 
                                    value={`+${formatNumber(kardexKpis.totalEntries, 1)}`} 
                                    color="#ECFDF5" 
                                    subtitle="Recepciones en período" 
                                />
                                <KPICard 
                                    title="Total Salidas (-)" 
                                    value={`-${formatNumber(kardexKpis.totalExits, 1)}`} 
                                    color="#FEF2F2" 
                                    subtitle="Despachos a clientes" 
                                />
                                <KPICard 
                                    title="Flujo Neto" 
                                    value={`${kardexKpis.netBalance >= 0 ? '+' : ''}${formatNumber(kardexKpis.netBalance, 1)}`} 
                                    color="#EFF6FF" 
                                    subtitle="Balance del período" 
                                />
                                <KPICard 
                                    title="SKUs con Rotación" 
                                    value={`${kardexKpis.activeSkusCount} activos`} 
                                    color="#FEF3C7" 
                                    subtitle={`${kardexKpis.totalMovements} transacciones`} 
                                />
                            </div>
                        ) : (activeTab === 'stock' || activeTab === 'random_tasks') ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
                                <HierarchyKPICard stats={hierarchyStats} />
                                <KPICard title="Alertas de Stock" value={formatNumber(stats.lowStock, 0)} color="#FEE2E2" subtitle="Bajo nivel mínimo" />
                                <KPICard title="Valor en Libros" value={formatMoney(stats.totalValue)} color="#DCFCE7" subtitle="Costo base total" />
                                <KPICard title="Tareas Pendientes" value={formatNumber(stats.pendingTasks, 0)} color="#FEF3C7" subtitle="Auditoría de piso" />
                            </div>
                        ) : null}
                        {/* ========================================================
                            NIVEL 2: BARRA FLOTANTE STICKY DE CONTROLES & ACCIONES
                        ======================================================== */}
                        {(activeTab === 'stock' || activeTab === 'movements') && (
                        <div 
                            ref={dockRef}
                    style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        marginBottom: '0.75rem', 
                        backgroundColor: 'rgba(255, 255, 255, 0.96)', 
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        padding: '0.65rem 1.2rem', 
                        borderRadius: '16px', 
                        border: `1px solid ${THEME.colors.border}`, 
                        gap: '1rem',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.07), 0 1px 3px rgba(0, 0, 0, 0.05)',
                        position: 'sticky',
                        top: '85px',
                        zIndex: 50,
                        transition: 'all 0.2s ease-in-out',
                        flexWrap: 'wrap'
                    }}
                >
                    {/* 1. LADO IZQUIERDO: Buscador Inteligente Amplio */}
                    <div style={{ position: 'relative', flex: 1, minWidth: '260px', maxWidth: activeTab === 'movements' ? '380px' : '480px' }}>
                        <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                            <Search size={16} />
                        </div>
                        <input 
                            type="text" 
                            placeholder={activeTab === 'movements' ? "Buscar por producto, ID o SKU..." : "Buscar por nombre o ID Contable..."} 
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            style={{ 
                                width: '100%', 
                                padding: '0.6rem 2.8rem 0.6rem 2.5rem', 
                                borderRadius: '12px', 
                                border: `1px solid ${THEME.colors.border}`, 
                                fontSize: '0.84rem', 
                                fontWeight: '500',
                                backgroundColor: '#F8FAF9',
                                color: THEME.colors.textMain,
                                outline: 'none',
                                transition: 'all 0.2s ease-in-out'
                            }}
                            onFocus={(e) => {
                                e.currentTarget.style.borderColor = THEME.colors.primary;
                                e.currentTarget.style.backgroundColor = '#FFFFFF';
                                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13, 122, 87, 0.15)';
                            }}
                            onBlur={(e) => {
                                e.currentTarget.style.borderColor = THEME.colors.border;
                                e.currentTarget.style.backgroundColor = '#F8FAF9';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        />
                        
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                style={{ 
                                    position: 'absolute', 
                                    right: '2.6rem', 
                                    top: '50%', 
                                    transform: 'translateY(-50%)', 
                                    background: 'none', 
                                    border: 'none', 
                                    cursor: 'pointer', 
                                    fontSize: '0.85rem', 
                                    color: THEME.colors.textSecondary,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '2px',
                                    borderRadius: '50%',
                                    backgroundColor: '#EAEFEA'
                                }}
                            ><X size={14} /></button>
                        )}
                        
                        <button 
                            onClick={() => setIsInfoGuideOpen(!isInfoGuideOpen)}
                            style={{ 
                                position: 'absolute', 
                                right: '0.8rem', 
                                top: '50%', 
                                transform: 'translateY(-50%)', 
                                background: 'none', 
                                border: 'none', 
                                cursor: 'pointer', 
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: THEME.colors.primary,
                                padding: '4px',
                                borderRadius: '6px',
                                transition: 'background-color 0.2s'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#EAEFEA'}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <Sparkles size={16} />
                        </button>

                        {isInfoGuideOpen && (
                            <div style={{ 
                                position: 'absolute', 
                                top: '100%', 
                                right: 0, 
                                marginTop: '0.8rem', 
                                width: '300px', 
                                backgroundColor: 'white', 
                                padding: '1.25rem', 
                                borderRadius: '12px', 
                                boxShadow: THEME.shadow.lg, 
                                zIndex: 100, 
                                border: `1px solid ${THEME.colors.border}` 
                            }}>
                                <h4 style={{ margin: '0 0 0.75rem 0', fontWeight: '800', fontSize: '0.9rem', color: THEME.colors.textMain }}>Guía de Búsqueda Inteligente</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                    <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}>
                                        <code style={{ color: '#2563EB', fontWeight: '700', backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px' }}>@bajo</code>
                                        <span style={{ marginLeft: '8px', color: THEME.colors.textSecondary }}>Bajo stock mín.</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}>
                                        <code style={{ color: '#059669', fontWeight: '700', backgroundColor: '#ECFDF5', padding: '2px 6px', borderRadius: '4px' }}>@disponible</code>
                                        <span style={{ marginLeft: '8px', color: THEME.colors.textSecondary }}>Solo stock venta</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center' }}>
                                        <code style={{ color: '#D97706', fontWeight: '700', backgroundColor: '#FFFBEB', padding: '2px 6px', borderRadius: '4px' }}>@regreso</code>
                                        <span style={{ marginLeft: '8px', color: THEME.colors.textSecondary }}>Devoluciones</span>
                                    </div>
                                    <div style={{ padding: '0.5rem', backgroundColor: '#F4F7F6', borderRadius: '8px', fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Sparkles size={12} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                        <span>Ej: <strong>Tomate @bajo</strong></span>
                                    </div>
                                    <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '0.55rem', marginTop: '0.25rem' }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '2px' }}>Búsqueda Múltiple:</div>
                                        <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, lineHeight: '1.3' }}>
                                            Separa con comas (<code>,</code>) para buscar varios productos o SKUs simultáneamente.
                                            <br />
                                            <span>Ej: <strong>aji casero, cebollin</strong></span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 2. ZONA DERECHA / CENTRAL: Controles Contextuales según la pestaña activa */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                        {activeTab === 'stock' && (
                            <>
                                {filteredFamilies.some(f => f.isParent) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const parentIds = filteredFamilies.filter(f => f.isParent).map(f => f.parent.product_id);
                                            const anyCollapsed = parentIds.some(id => collapsedParents[id]);
                                            const nextState: Record<string, boolean> = {};
                                            parentIds.forEach(id => {
                                                nextState[id] = !anyCollapsed;
                                            });
                                            setCollapsedParents(nextState);
                                        }}
                                        style={{
                                            fontSize: '0.74rem',
                                            fontWeight: '600',
                                            padding: '0.45rem 0.75rem',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            backgroundColor: '#FFFFFF',
                                            color: '#475569',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                                        title="Contraer o desplegar los productos hijos de todas las familias"
                                    >
                                        {filteredFamilies.filter(f => f.isParent).some(f => collapsedParents[f.parent.product_id]) ? (
                                            <>
                                                <ChevronDown size={13} strokeWidth={2.5} />
                                                <span>Desplegar Hijos</span>
                                            </>
                                        ) : (
                                            <>
                                                <ChevronRight size={13} strokeWidth={2.5} />
                                                <span>Contraer Hijos</span>
                                            </>
                                        )}
                                    </button>
                                )}

                                <select 
                                    value={stockStatusFilter}
                                    onChange={(e) => { setStockStatusFilter(e.target.value as any); setCurrentPage(1); }}
                                    style={{ 
                                        padding: '0.45rem 1rem', 
                                        borderRadius: '8px', 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        backgroundColor: '#FFFFFF',
                                        color: THEME.colors.textMain,
                                        fontWeight: '600',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        outline: 'none',
                                        boxShadow: THEME.shadow.sm,
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.borderColor = THEME.colors.primary}
                                    onMouseLeave={(e) => e.currentTarget.style.borderColor = THEME.colors.border}
                                >
                                    <option value="all">Ver Todos</option>
                                    <option value="available">Disponible</option>
                                    <option value="returned">Devuelto</option>
                                    <option value="in_process">En Proceso</option>
                                </select>

                                {sortField !== 'default' && (
                                    <button
                                        type="button"
                                        onClick={handleResetSort}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            padding: '0.45rem 0.8rem',
                                            borderRadius: '8px',
                                            border: '1px solid #A7F3D0',
                                            backgroundColor: '#ECFDF5',
                                            color: '#065F46',
                                            fontSize: '0.76rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            boxShadow: '0 1px 3px rgba(16, 185, 129, 0.1)'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#D1FAE5'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                                        title="Restablecer orden al predeterminado por ID Contable"
                                    >
                                        <span>Orden: {getSortLabel(sortField)}</span>
                                        {sortDirection === 'asc' ? <ArrowUp size={13} strokeWidth={2.5} /> : <ArrowDown size={13} strokeWidth={2.5} />}
                                        <X size={12} strokeWidth={2.5} style={{ marginLeft: '2px', opacity: 0.7 }} />
                                    </button>
                                )}
                            </>
                        )}

                        {activeTab === 'movements' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                {/* Date Range Pills */}
                                <div style={{ 
                                    display: 'flex', 
                                    backgroundColor: '#F1F5F9', 
                                    padding: '3px', 
                                    borderRadius: '8px', 
                                    gap: '2px',
                                    border: '1px solid #E2E8F0'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => setMovementsDateRange('8days')}
                                        style={{
                                            padding: '0.35rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            fontSize: '0.74rem',
                                            fontWeight: movementsDateRange === '8days' ? '700' : '500',
                                            backgroundColor: movementsDateRange === '8days' ? '#FFFFFF' : 'transparent',
                                            color: movementsDateRange === '8days' ? '#0F172A' : '#64748B',
                                            cursor: 'pointer',
                                            boxShadow: movementsDateRange === '8days' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        Últimos 8 días
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMovementsDateRange('today')}
                                        style={{
                                            padding: '0.35rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            fontSize: '0.74rem',
                                            fontWeight: movementsDateRange === 'today' ? '700' : '500',
                                            backgroundColor: movementsDateRange === 'today' ? '#FFFFFF' : 'transparent',
                                            color: movementsDateRange === 'today' ? '#0F172A' : '#64748B',
                                            cursor: 'pointer',
                                            boxShadow: movementsDateRange === 'today' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        Hoy
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMovementsDateRange('custom')}
                                        style={{
                                            padding: '0.35rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            fontSize: '0.74rem',
                                            fontWeight: movementsDateRange === 'custom' ? '700' : '500',
                                            backgroundColor: movementsDateRange === 'custom' ? '#FFFFFF' : 'transparent',
                                            color: movementsDateRange === 'custom' ? '#0F172A' : '#64748B',
                                            cursor: 'pointer',
                                            boxShadow: movementsDateRange === 'custom' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        Personalizado
                                    </button>
                                </div>

                                {/* Custom Date Range Inputs */}
                                {movementsDateRange === 'custom' && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <input 
                                            type="date" 
                                            value={customStartDate} 
                                            onChange={(e) => setCustomStartDate(e.target.value)} 
                                            style={{
                                                padding: '0.32rem 0.5rem',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.74rem',
                                                color: '#334155',
                                                backgroundColor: '#FFFFFF'
                                            }}
                                        />
                                        <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>a</span>
                                        <input 
                                            type="date" 
                                            value={customEndDate} 
                                            onChange={(e) => setCustomEndDate(e.target.value)} 
                                            style={{
                                                padding: '0.32rem 0.5rem',
                                                borderRadius: '6px',
                                                border: '1px solid #CBD5E1',
                                                fontSize: '0.74rem',
                                                color: '#334155',
                                                backgroundColor: '#FFFFFF'
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Sub-view Switcher: Kardex General vs Novedades / Retornos */}
                                <div style={{ 
                                    display: 'flex', 
                                    backgroundColor: '#F1F5F9', 
                                    padding: '3px', 
                                    borderRadius: '8px', 
                                    gap: '2px',
                                    border: '1px solid #E2E8F0'
                                }}>
                                    <button
                                        type="button"
                                        onClick={() => setMovementsViewMode('all')}
                                        style={{
                                            padding: '0.35rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            fontSize: '0.74rem',
                                            fontWeight: movementsViewMode === 'all' ? '700' : '500',
                                            backgroundColor: movementsViewMode === 'all' ? '#FFFFFF' : 'transparent',
                                            color: movementsViewMode === 'all' ? '#0F172A' : '#64748B',
                                            cursor: 'pointer',
                                            boxShadow: movementsViewMode === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <History size={13} strokeWidth={2} />
                                        <span>Kardex General</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMovementsViewMode('returns')}
                                        style={{
                                            padding: '0.35rem 0.75rem',
                                            borderRadius: '6px',
                                            border: 'none',
                                            fontSize: '0.74rem',
                                            fontWeight: movementsViewMode === 'returns' ? '700' : '500',
                                            backgroundColor: movementsViewMode === 'returns' ? '#FFFFFF' : 'transparent',
                                            color: movementsViewMode === 'returns' ? '#0F172A' : '#64748B',
                                            cursor: 'pointer',
                                            boxShadow: movementsViewMode === 'returns' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <Truck size={13} strokeWidth={2} />
                                        <span>Novedades / Retornos</span>
                                        {returnMovements.length > 0 && (
                                            <span style={{
                                                backgroundColor: movementsViewMode === 'returns' ? '#DC2626' : '#CBD5E1',
                                                color: movementsViewMode === 'returns' ? '#FFFFFF' : '#334155',
                                                fontSize: '0.65rem',
                                                fontWeight: '800',
                                                padding: '1px 6px',
                                                borderRadius: '10px'
                                            }}>
                                                {returnMovements.length}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {movementsViewMode === 'all' && (
                                    <>
                                        {/* Checkbox / Toggle: Solo con rotación */}
                                        <label style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '6px', 
                                            fontSize: '0.74rem', 
                                            fontWeight: '600', 
                                            color: movementsFilterActiveOnly ? '#0D7A57' : '#475569', 
                                            cursor: 'pointer',
                                            userSelect: 'none',
                                            backgroundColor: movementsFilterActiveOnly ? '#ECFDF5' : '#F8FAFC',
                                            padding: '0.35rem 0.7rem',
                                            borderRadius: '8px',
                                            border: `1px solid ${movementsFilterActiveOnly ? '#A7F3D0' : '#E2E8F0'}`,
                                            transition: 'all 0.15s ease'
                                        }}>
                                            <input 
                                                type="checkbox" 
                                                checked={movementsFilterActiveOnly} 
                                                onChange={(e) => setMovementsFilterActiveOnly(e.target.checked)} 
                                                style={{ accentColor: '#0D7A57', cursor: 'pointer' }}
                                            />
                                            <span>Solo con rotación</span>
                                        </label>
                                    </>
                                )}

                                {movementsViewMode === 'returns' && (
                                    <div style={{
                                        fontSize: '0.74rem',
                                        fontWeight: '600',
                                        color: '#64748B',
                                        backgroundColor: '#F8FAFC',
                                        padding: '0.35rem 0.75rem',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0'
                                    }}>
                                        Mostrando <strong>{filteredReturnMovements.length}</strong> {filteredReturnMovements.length === 1 ? 'retorno con evidencia' : 'retornos con evidencia'}
                                    </div>
                                )}

                                {/* Desplegar / Contraer Hijos en Kardex */}
                                {movementsViewMode === 'all' && kardexFamilies.some(f => f.isParent) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const parentIds = kardexFamilies.filter(f => f.isParent).map(f => f.parent.product_id);
                                            const anyCollapsed = parentIds.some(id => collapsedKardexParents[id]);
                                            const nextState: Record<string, boolean> = {};
                                            parentIds.forEach(id => {
                                                nextState[id] = !anyCollapsed;
                                            });
                                            setCollapsedKardexParents(nextState);
                                        }}
                                        style={{
                                            fontSize: '0.74rem',
                                            fontWeight: '600',
                                            padding: '0.45rem 0.75rem',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            backgroundColor: '#FFFFFF',
                                            color: '#475569',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                                        title="Contraer o desplegar hijos de las familias del Kardex"
                                    >
                                        {kardexFamilies.filter(f => f.isParent).some(f => collapsedKardexParents[f.parent.product_id]) ? (
                                            <>
                                                <ChevronDown size={13} strokeWidth={2.5} />
                                                <span>Desplegar Hijos</span>
                                            </>
                                        ) : (
                                            <>
                                                <ChevronRight size={13} strokeWidth={2.5} />
                                                <span>Contraer Hijos</span>
                                            </>
                                        )}
                                    </button>
                                )}

                                {/* Botón Descarga Masiva Excel */}
                                <button
                                    type="button"
                                    onClick={handleExportKardexExcel}
                                    disabled={exportingExcel || kardexFamilies.length === 0}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        padding: '0.45rem 0.95rem',
                                        borderRadius: '8px',
                                        border: 'none',
                                        backgroundColor: '#0D7A57',
                                        color: '#FFFFFF',
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)',
                                        transition: 'all 0.15s ease-in-out',
                                        opacity: exportingExcel ? 0.7 : 1
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!exportingExcel) {
                                            e.currentTarget.style.backgroundColor = '#0A5E43';
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!exportingExcel) {
                                            e.currentTarget.style.backgroundColor = '#0D7A57';
                                            e.currentTarget.style.transform = 'translateY(0)';
                                        }
                                    }}
                                    title="Descargar selección en formato Excel (.xlsx)"
                                >
                                    <FileSpreadsheet size={15} strokeWidth={2} />
                                    <span>{exportingExcel ? 'Generando...' : 'Descargar Kardex Excel'}</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                )}

                <div style={styles.tableContainer}>
                    {loading ? (
                        <div style={{ padding: '10rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ color: THEME.colors.primary, animation: 'spin 2s linear infinite', display: 'flex', justifyContent: 'center' }}>
                                <RefreshCw size={36} strokeWidth={1.5} />
                            </div>
                            <div style={{ fontWeight: '700', color: THEME.colors.textSecondary, fontSize: '1.1rem' }}>Sincronizando inventarios maestros...</div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'stock' && (
                                <div style={{ overflow: 'visible' }}>
                                    <table style={styles.table}>
                                        <thead style={dynamicHeaderStyle}>
                                            <tr>
                                                {renderSortableTh('product', 'Producto', 'left', { borderTopLeftRadius: '12px' })}
                                                {renderSortableTh('min_stock', 'Stock Mín.', 'center')}
                                                {renderSortableTh('cost', 'Costo Matriz', 'center')}
                                                {renderSortableTh('total_value', 'Valor Inv.', 'center')}
                                                {renderSortableTh('uom', 'Unidad', 'left')}
                                                {renderSortableTh('quantity', 'Cantidad', 'left')}
                                                <th style={{ ...dynamicThStyle, textAlign: 'right', borderTopRightRadius: '12px' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedFamilies.map((family, familyIdx) => {
                                                const parent = family.parent;
                                                const isCollapsed = !!collapsedParents[parent.product_id];

                                                if (family.isParent) {
                                                    return (
                                                        <React.Fragment key={`family-${parent.product_id}-${parent.status}-${familyIdx}`}>
                                                            {/* FILA PADRE */}
                                                            <tr 
                                                                style={{ 
                                                                    backgroundColor: '#F8FAFC',
                                                                    borderLeft: '4px solid #4F46E5',
                                                                    transition: 'background-color 0.15s ease'
                                                                }} 
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'} 
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                            >
                                                                <td style={styles.td}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleParentCollapse(parent.product_id)}
                                                                            style={{
                                                                                background: isCollapsed ? '#EEF2FF' : '#E0E7FF',
                                                                                border: '1px solid #C7D2FE',
                                                                                cursor: 'pointer',
                                                                                padding: '4px',
                                                                                borderRadius: '6px',
                                                                                color: '#4F46E5',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                            title={isCollapsed ? `Expandir ${family.children.length} hijos` : "Colapsar hijos"}
                                                                        >
                                                                            {isCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
                                                                        </button>
                                                                        <div style={{ width: '44px', height: '44px', backgroundColor: '#EDF1EE', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}`, flexShrink: 0 }}>
                                                                            {parent.products?.image_url ? (
                                                                                <img 
                                                                                    src={parent.products.image_url} 
                                                                                    alt={parent.products.name} 
                                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                                />
                                                                            ) : (
                                                                                <Package size={20} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                                            )}
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontWeight: '800', fontSize: '0.92rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <span>{parent.products?.name || 'Desconocido'}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                <code style={{ fontSize: '0.75rem', color: '#0A5C36', backgroundColor: '#EDF5F1', padding: '2px 8px', borderRadius: '5px', fontWeight: '800', border: '1px solid #C6E7D9', letterSpacing: '0.02em' }}>
                                                                                    ID: {parent.products?.accounting_id ?? '—'}
                                                                                </code>
                                                                                {renderCellBadge(parent.products?.inventory_group)}
                                                                                {parent.products?.is_active === false && (
                                                                                    <span style={{
                                                                                        fontSize: '0.62rem',
                                                                                        backgroundColor: '#FEF2F2',
                                                                                        color: '#991B1B',
                                                                                        padding: '2px 6px',
                                                                                        borderRadius: '4px',
                                                                                        fontWeight: '800',
                                                                                        border: '1px solid #FECACA',
                                                                                        textAlign: 'center',
                                                                                        letterSpacing: '0.04em'
                                                                                    }}>
                                                                                        MASTER OFF
                                                                                    </span>
                                                                                )}
                                                                                <span style={{
                                                                                    fontSize: '0.62rem',
                                                                                    fontWeight: '800',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '6px',
                                                                                    backgroundColor: '#EEF2FF',
                                                                                    color: '#4F46E5',
                                                                                    border: '1px solid #C7D2FE',
                                                                                    letterSpacing: '0.04em'
                                                                                }}>
                                                                                    PADRE
                                                                                </span>
                                                                                <span style={{
                                                                                    fontSize: '0.62rem',
                                                                                    fontWeight: '700',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '6px',
                                                                                    backgroundColor: '#ECFDF5',
                                                                                    color: '#065F46',
                                                                                    border: '1px solid #A7F3D0'
                                                                                }}>
                                                                                    {family.children.length} {family.children.length === 1 ? 'Hijo' : 'Hijos'}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td style={{ 
                                                                    ...styles.td, 
                                                                    textAlign: 'center' as const,
                                                                    backgroundColor: (parent.products?.min_inventory_level || 0) > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                                }}>
                                                                    {(parent.products?.min_inventory_level || 0) > 0 ? (
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                            <span style={{ fontWeight: '700', color: '#B91C1C', fontSize: '0.9rem' }}>
                                                                                {formatNumber(parent.products?.min_inventory_level, 0)}
                                                                            </span>
                                                                            {family.totalQuantity <= (parent.products?.min_inventory_level || 0) && (
                                                                                <span title="Bajo el mínimo crítico consolidado" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                                    <AlertTriangle size={14} strokeWidth={2} style={{ color: '#B91C1C' }} />
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <span style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>—</span>
                                                                    )}
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                    <div style={{ fontWeight: '600', color: THEME.colors.primary, fontSize: '0.85rem' }}>
                                                                        {avgCosts[parent.product_id] ? formatMoney(avgCosts[parent.product_id]) : '—'}
                                                                    </div>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.85rem' }}>
                                                                        {family.totalValue > 0 ? formatMoney(family.totalValue) : (avgCosts[parent.product_id] ? formatMoney(avgCosts[parent.product_id] * family.totalQuantity) : '—')}
                                                                    </div>
                                                                </td>
                                                                <td style={styles.td}>
                                                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                        {parent.products?.unit_of_measure}
                                                                    </span>
                                                                </td>
                                                                <td style={styles.td}>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                                                        <div style={{ 
                                                                            fontSize: '1rem', 
                                                                            fontWeight: '800', 
                                                                            color: family.totalQuantity <= (parent.products?.min_inventory_level || 0) ? '#B91C1C' : '#0F172A',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            <span style={{ fontSize: '0.85rem', color: '#4F46E5', fontWeight: '800' }} title="Sumatoria de stock físico de sus SKUs hijos">∑</span>
                                                                            <span>{formatNumber(family.totalQuantity)}</span>
                                                                        </div>
                                                                        <span style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: '600' }}>
                                                                            Consolidado
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', alignItems: 'center' }}>
                                                                        <button 
                                                                            title="Ver Kardex del grupo familiar"
                                                                            onClick={() => {
                                                                                setActiveTab('movements');
                                                                                setSearchQuery(parent.products?.name || '');
                                                                            }}
                                                                            style={{
                                                                                backgroundColor: '#EEF2FF',
                                                                                color: '#4338CA',
                                                                                border: '1px solid #C7D2FE',
                                                                                padding: '0.35rem 0.65rem',
                                                                                borderRadius: '6px',
                                                                                fontWeight: '600',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                fontSize: '0.75rem',
                                                                                transition: 'all 0.15s ease-in-out'
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                e.currentTarget.style.backgroundColor = '#E0E7FF';
                                                                                e.currentTarget.style.borderColor = '#A5B4FC';
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                e.currentTarget.style.backgroundColor = '#EEF2FF';
                                                                                e.currentTarget.style.borderColor = '#C7D2FE';
                                                                            }}
                                                                        >
                                                                            <History size={12} />
                                                                            <span>Kardex</span>
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => { setSelectedProduct({id: parent.product_id, name: parent.products?.name || 'Desconocido'}); setIsMovementModalOpen(true); }}
                                                                            style={{ 
                                                                                backgroundColor: '#FFFFFF', 
                                                                                color: '#4B5563',
                                                                                border: '1px solid #D1D5DB', 
                                                                                padding: '0.35rem 0.75rem', 
                                                                                borderRadius: '6px', 
                                                                                fontWeight: '600', 
                                                                                cursor: 'pointer',
                                                                                transition: 'all 0.15s ease-in-out',
                                                                                fontSize: '0.75rem'
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                e.currentTarget.style.backgroundColor = '#F1F5F9';
                                                                                e.currentTarget.style.borderColor = '#94A3B8';
                                                                                e.currentTarget.style.color = '#0F172A';
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                e.currentTarget.style.backgroundColor = '#FFFFFF';
                                                                                e.currentTarget.style.borderColor = '#D1D5DB';
                                                                                e.currentTarget.style.color = '#4B5563';
                                                                            }}
                                                                        >
                                                                            Ajustar
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>

                                                            {/* FILAS HIJOS */}
                                                            {!isCollapsed && getSortedChildren(family.children).map((child, childIdx) => (
                                                                <tr
                                                                    key={`child-${child.product_id}-${child.status}-${childIdx}`}
                                                                    style={{ 
                                                                        backgroundColor: '#FFFFFF',
                                                                        borderLeft: '4px solid #CBD5E1',
                                                                        transition: 'background-color 0.15s ease'
                                                                    }}
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'} 
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                                                                >
                                                                    <td style={styles.td}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', paddingLeft: '2.5rem', position: 'relative' }}>
                                                                            {/* Tree branch connector line */}
                                                                            <div style={{
                                                                                position: 'absolute',
                                                                                left: '1.25rem',
                                                                                top: '-50%',
                                                                                bottom: '50%',
                                                                                width: '14px',
                                                                                borderLeft: '2px solid #CBD5E1',
                                                                                borderBottom: '2px solid #CBD5E1',
                                                                                borderBottomLeftRadius: '6px'
                                                                            }} />
                                                                            <div style={{ width: '38px', height: '38px', backgroundColor: '#F8FAFC', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0', flexShrink: 0 }}>
                                                                                {child.products?.image_url ? (
                                                                                    <img 
                                                                                        src={child.products.image_url} 
                                                                                        alt={child.products.name} 
                                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                                    />
                                                                                ) : (
                                                                                    <Package size={18} strokeWidth={1.5} style={{ color: '#94A3B8' }} />
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#334155' }}>
                                                                                    {child.products?.name || 'Desconocido'}
                                                                                </div>
                                                                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                                                                                    <code style={{ fontSize: '0.72rem', color: '#334155', backgroundColor: '#F1F5F9', padding: '2px 7px', borderRadius: '5px', fontWeight: '800', border: '1px solid #E2E8F0' }}>
                                                                                        ID: {child.products?.accounting_id ?? '—'}
                                                                                    </code>
                                                                                    {renderCellBadge(child.products?.inventory_group || parent.products?.inventory_group)}
                                                                                    {child.products?.is_active === false && (
                                                                                        <span style={{ fontSize: '0.6rem', backgroundColor: '#FEF2F2', color: '#991B1B', padding: '1px 5px', borderRadius: '4px', fontWeight: '700', border: '1px solid #FECACA' }}>
                                                                                            MASTER OFF
                                                                                        </span>
                                                                                    )}
                                                                                    <span style={{
                                                                                        fontSize: '0.62rem',
                                                                                        fontWeight: '700',
                                                                                        padding: '1px 6px',
                                                                                        borderRadius: '4px',
                                                                                        backgroundColor: '#F0F9FF',
                                                                                        color: '#0284C7',
                                                                                        border: '1px solid #BAE6FD',
                                                                                        letterSpacing: '0.02em'
                                                                                    }}>
                                                                                        HIJO
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ 
                                                                        ...styles.td, 
                                                                        textAlign: 'center' as const,
                                                                        backgroundColor: (child.products?.min_inventory_level || 0) > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                                    }}>
                                                                        {(child.products?.min_inventory_level || 0) > 0 ? (
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                                <span style={{ fontWeight: '700', color: '#B91C1C', fontSize: '0.85rem' }}>
                                                                                    {formatNumber(child.products?.min_inventory_level, 0)}
                                                                                </span>
                                                                                {child.quantity <= (child.products?.min_inventory_level || 0) && (
                                                                                    <span title="Bajo el mínimo crítico" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                                        <AlertTriangle size={13} strokeWidth={2} style={{ color: '#B91C1C' }} />
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>—</span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                        <div style={{ fontWeight: '600', color: THEME.colors.primary, fontSize: '0.82rem' }}>
                                                                            {avgCosts[child.product_id] ? formatMoney(avgCosts[child.product_id]) : '—'}
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                        <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.82rem' }}>
                                                                            {avgCosts[child.product_id] ? formatMoney(avgCosts[child.product_id] * child.quantity) : '—'}
                                                                        </div>
                                                                    </td>
                                                                    <td style={styles.td}>
                                                                        <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                            {child.products?.unit_of_measure}
                                                                        </span>
                                                                    </td>
                                                                    <td style={styles.td}>
                                                                        <div style={{ 
                                                                            fontSize: '0.9rem', 
                                                                            fontWeight: '700', 
                                                                            color: child.quantity <= (child.products?.min_inventory_level || 0) ? '#B91C1C' : '#334155' 
                                                                        }}>
                                                                            {formatNumber(child.quantity)}
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', alignItems: 'center' }}>
                                                                            <button 
                                                                                title="Ver Kardex de esta variante"
                                                                                onClick={() => {
                                                                                    setActiveTab('movements');
                                                                                    setSearchQuery(child.products?.name || '');
                                                                                }}
                                                                                style={{
                                                                                    backgroundColor: '#F8FAFC',
                                                                                    color: '#475569',
                                                                                    border: '1px solid #E2E8F0',
                                                                                    padding: '0.35rem 0.55rem',
                                                                                    borderRadius: '6px',
                                                                                    fontWeight: '600',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    fontSize: '0.72rem',
                                                                                    transition: 'all 0.15s ease-in-out'
                                                                                }}
                                                                                onMouseEnter={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#EEF2FF';
                                                                                    e.currentTarget.style.borderColor = '#C7D2FE';
                                                                                    e.currentTarget.style.color = '#4338CA';
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                                                                                    e.currentTarget.style.borderColor = '#E2E8F0';
                                                                                    e.currentTarget.style.color = '#475569';
                                                                                }}
                                                                            >
                                                                                <History size={11} />
                                                                                <span>Kardex</span>
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => { setSelectedProduct({id: child.product_id, name: child.products?.name || 'Desconocido'}); setIsMovementModalOpen(true); }}
                                                                                style={{ 
                                                                                    backgroundColor: 'transparent', 
                                                                                    color: '#4B5563',
                                                                                    border: '1px solid #D1D5DB', 
                                                                                    padding: '0.35rem 0.75rem', 
                                                                                    borderRadius: '6px', 
                                                                                    fontWeight: '500', 
                                                                                    cursor: 'pointer',
                                                                                    transition: 'all 0.15s ease-in-out',
                                                                                    fontSize: '0.75rem'
                                                                                }}
                                                                                onMouseEnter={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = '#F9FAFB';
                                                                                    e.currentTarget.style.borderColor = '#94A3AF';
                                                                                    e.currentTarget.style.color = '#111827';
                                                                                }}
                                                                                onMouseLeave={(e) => {
                                                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                                                    e.currentTarget.style.borderColor = '#D1D5DB';
                                                                                    e.currentTarget.style.color = '#4B5563';
                                                                                }}
                                                                            >
                                                                                Ajustar
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </React.Fragment>
                                                    );
                                                }

                                                // FILA STANDALONE (producto independiente)
                                                return (
                                                    <tr 
                                                        key={parent.id ? `${parent.id}-${familyIdx}` : `stock-${parent.product_id}-${parent.status}-${familyIdx}`} 
                                                        style={{ transition: 'background-color 0.2s' }} 
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} 
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                    >
                                                        <td style={styles.td}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                <div style={{ width: '44px', height: '44px', backgroundColor: '#EDF1EE', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}` }}>
                                                                    {parent.products?.image_url ? (
                                                                        <img 
                                                                            src={parent.products.image_url} 
                                                                            alt={parent.products.name} 
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                        />
                                                                    ) : (
                                                                        <Package size={20} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: '700', fontSize: '0.9rem', color: THEME.colors.textMain }}>{parent.products?.name || 'Desconocido'}</div>
                                                                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                        <code style={{ fontSize: '0.75rem', color: '#0A5C36', backgroundColor: '#EDF5F1', padding: '2px 8px', borderRadius: '5px', fontWeight: '800', border: '1px solid #C6E7D9', letterSpacing: '0.02em' }}>
                                                                            ID: {parent.products?.accounting_id ?? '—'}
                                                                        </code>
                                                                        {renderCellBadge(parent.products?.inventory_group)}
                                                                        {parent.products?.is_active === false && (
                                                                            <span style={{
                                                                                fontSize: '0.62rem',
                                                                                backgroundColor: '#FEF2F2',
                                                                                color: '#991B1B',
                                                                                padding: '2px 6px',
                                                                                borderRadius: '4px',
                                                                                fontWeight: '800',
                                                                                border: '1px solid #FECACA',
                                                                                textAlign: 'center',
                                                                                letterSpacing: '0.04em'
                                                                            }}>
                                                                                MASTER OFF
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ 
                                                            ...styles.td, 
                                                            textAlign: 'center' as const,
                                                            backgroundColor: (parent.products?.min_inventory_level || 0) > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                        }}>
                                                            {(parent.products?.min_inventory_level || 0) > 0 ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                    <span style={{ fontWeight: '700', color: '#B91C1C', fontSize: '0.9rem' }}>
                                                                        {formatNumber(parent.products?.min_inventory_level, 0)}
                                                                    </span>
                                                                    {parent.quantity <= (parent.products?.min_inventory_level || 0) && (
                                                                        <span title="Bajo el mínimo crítico" style={{ display: 'inline-flex', alignItems: 'center' }}>
                                                                            <AlertTriangle size={14} strokeWidth={2} style={{ color: '#B91C1C' }} />
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>—</span>
                                                            )}
                                                        </td>
                                                        <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                            <div style={{ fontWeight: '600', color: THEME.colors.primary, fontSize: '0.85rem' }}>
                                                                {avgCosts[parent.product_id] ? formatMoney(avgCosts[parent.product_id]) : '—'}
                                                            </div>
                                                        </td>
                                                        <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                            <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem' }}>
                                                                {avgCosts[parent.product_id] ? formatMoney(avgCosts[parent.product_id] * parent.quantity) : '—'}
                                                            </div>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                {parent.products?.unit_of_measure}
                                                            </span>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <div style={{ 
                                                                fontSize: '0.95rem', 
                                                                fontWeight: '700', 
                                                                color: parent.quantity <= (parent.products?.min_inventory_level || 0) ? '#B91C1C' : THEME.colors.textMain 
                                                            }}>
                                                                {formatNumber(parent.quantity)}
                                                            </div>
                                                        </td>
                                                        <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', alignItems: 'center' }}>
                                                                <button 
                                                                    title="Ver Kardex de este producto"
                                                                    onClick={() => {
                                                                        setActiveTab('movements');
                                                                        setSearchQuery(parent.products?.name || '');
                                                                    }}
                                                                    style={{
                                                                        backgroundColor: '#EEF2FF',
                                                                        color: '#4338CA',
                                                                        border: '1px solid #C7D2FE',
                                                                        padding: '0.35rem 0.65rem',
                                                                        borderRadius: '6px',
                                                                        fontWeight: '600',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        fontSize: '0.75rem',
                                                                        transition: 'all 0.15s ease-in-out'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.backgroundColor = '#E0E7FF';
                                                                        e.currentTarget.style.borderColor = '#A5B4FC';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.backgroundColor = '#EEF2FF';
                                                                        e.currentTarget.style.borderColor = '#C7D2FE';
                                                                    }}
                                                                >
                                                                    <History size={12} />
                                                                    <span>Kardex</span>
                                                                </button>
                                                                <button 
                                                                    onClick={() => { setSelectedProduct({id: parent.product_id, name: parent.products?.name || 'Desconocido'}); setIsMovementModalOpen(true); }}
                                                                    style={{ 
                                                                        backgroundColor: 'transparent', 
                                                                        color: '#4B5563',
                                                                        border: '1px solid #D1D5DB', 
                                                                        padding: '0.35rem 0.75rem', 
                                                                        borderRadius: '6px', 
                                                                        fontWeight: '500', 
                                                                        cursor: 'pointer',
                                                                        transition: 'all 0.2s ease-in-out',
                                                                        fontSize: '0.75rem'
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        e.currentTarget.style.backgroundColor = '#F9FAFB';
                                                                        e.currentTarget.style.borderColor = '#9CA3AF';
                                                                        e.currentTarget.style.color = '#111827';
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        e.currentTarget.style.backgroundColor = 'transparent';
                                                                        e.currentTarget.style.borderColor = '#D1D5DB';
                                                                        e.currentTarget.style.color = '#4B5563';
                                                                    }}
                                                                >
                                                                    Ajustar
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'movements' && (
                                movementsViewMode === 'returns' ? (
                                    <div style={{ overflow: 'visible' }}>
                                        <table style={styles.table}>
                                            <thead style={dynamicHeaderStyle}>
                                                <tr>
                                                    <th style={{ ...dynamicThStyle, borderTopLeftRadius: '12px' }}>Fecha / Hora</th>
                                                    <th style={dynamicThStyle}>Producto / SKU</th>
                                                    <th style={dynamicThStyle}>Evidencia (Ruta)</th>
                                                    <th style={dynamicThStyle}>Decisión Bodega</th>
                                                    <th style={{ ...dynamicThStyle, textAlign: 'center' }}>Cant. Retornada</th>
                                                    <th style={{ ...dynamicThStyle, borderTopRightRadius: '12px' }}>Observaciones / Motivo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredReturnMovements.map((m) => (
                                                    <tr key={m.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <td style={styles.td}>
                                                            <div style={{ fontWeight: '700', color: '#1E293B', fontSize: '0.82rem' }}>
                                                                {new Date(m.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                                                {new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        </td>
                                                        <td style={styles.td}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <div style={{ width: '36px', height: '36px', backgroundColor: '#F8FAFC', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0', flexShrink: 0 }}>
                                                                    {m.products?.image_url ? (
                                                                        <img 
                                                                            src={m.products.image_url} 
                                                                            alt={m.products.name} 
                                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                        />
                                                                    ) : (
                                                                        <Package size={16} strokeWidth={1.5} style={{ color: '#94A3B8' }} />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.86rem' }}>{m.products?.name}</div>
                                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                                                                        {m.products?.accounting_id && (
                                                                            <code style={{ fontSize: '0.7rem', color: '#334155', backgroundColor: '#F1F5F9', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>
                                                                                ID: {m.products.accounting_id}
                                                                            </code>
                                                                        )}
                                                                        {m.products?.sku && (
                                                                            <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary }}>
                                                                                SKU: {m.products.sku}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={styles.td}>
                                                            {m.evidence_url ? (
                                                                <div 
                                                                    style={{ 
                                                                        position: 'relative', 
                                                                        width: '80px', 
                                                                        height: '55px', 
                                                                        borderRadius: '8px', 
                                                                        overflow: 'hidden', 
                                                                        border: `1px solid ${THEME.colors.border}`, 
                                                                        cursor: 'zoom-in',
                                                                        boxShadow: THEME.shadow.sm 
                                                                    }} 
                                                                    onClick={() => window.open(m.evidence_url!, '_blank')}
                                                                    title="Click para ampliar evidencia fotográfica"
                                                                >
                                                                    <img src={m.evidence_url} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    <div style={{ position: 'absolute', bottom: 0, right: 0, padding: '2px 4px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.6rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                                        <Search size={10} strokeWidth={2} /> VER
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', fontStyle: 'italic' }}>Sin foto</span>
                                                            )}
                                                        </td>
                                                        <td style={styles.td}>
                                                            {m.admin_decision ? (
                                                                <span style={styles.badge(
                                                                    m.admin_decision === 'inventory' ? THEME.colors.successBg : m.admin_decision === 'waste' ? '#FEE2E2' : THEME.colors.blueBg,
                                                                    m.admin_decision === 'inventory' ? THEME.colors.successText : m.admin_decision === 'waste' ? '#991B1B' : m.admin_decision === 'reprocess' ? THEME.colors.blueText : THEME.colors.textSecondary
                                                                )}>
                                                                    {m.admin_decision.toUpperCase()}
                                                                </span>
                                                            ) : (
                                                                <span style={{ ...styles.badge('#FEF3C7', '#B45309'), animation: 'pulse 2s infinite' }}>PENDIENTE</span>
                                                            )}
                                                        </td>
                                                        <td style={{ ...styles.td, textAlign: 'center' as const, fontWeight: '800', color: '#DC2626', fontSize: '0.88rem' }}>
                                                            -{formatNumber(Math.abs(m.quantity))} <span style={{ fontSize: '0.72rem', fontWeight: '500', color: '#64748B' }}>{m.products?.unit_of_measure || 'unid'}</span>
                                                        </td>
                                                        <td style={{ ...styles.td, fontSize: '0.8rem', color: THEME.colors.textSecondary, maxWidth: '280px' }} title={m.notes || ''}>
                                                            {m.notes || '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {filteredReturnMovements.length === 0 && (
                                            <div style={{ textAlign: 'center', padding: '4.5rem 2rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', marginTop: '1rem' }}>
                                                <div style={{ color: '#94A3B8', marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                                                    <Truck size={44} strokeWidth={1.5} />
                                                </div>
                                                <h3 style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.05rem' }}>Sin novedades ni retornos en este período</h3>
                                                <p style={{ color: THEME.colors.textSecondary, fontSize: '0.84rem', marginTop: '0.25rem' }}>
                                                    {searchQuery ? `No hay retornos que coincidan con "${searchQuery}".` : 'Los retornos y rechazos marcados por los conductores aparecerán aquí con su respectiva foto.'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ overflow: 'visible' }}>
                                        <table style={styles.table}>
                                            <thead style={dynamicHeaderStyle}>
                                                <tr>
                                                    <th style={{ ...dynamicThStyle, borderTopLeftRadius: '12px' }}>Producto</th>
                                                <th style={dynamicThStyle}>Unidad</th>
                                                <th style={{ ...dynamicThStyle, textAlign: 'center' }}>Entradas (+)</th>
                                                <th style={{ ...dynamicThStyle, textAlign: 'center' }}>Salidas (-)</th>
                                                <th style={{ ...dynamicThStyle, textAlign: 'center' }}>Neto Período</th>
                                                <th style={{ ...dynamicThStyle, textAlign: 'center' }}>Stock en Bodega</th>
                                                <th style={{ ...dynamicThStyle, textAlign: 'right', borderTopRightRadius: '12px' }}>Trazabilidad</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {kardexFamilies.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '4rem', textAlign: 'center', backgroundColor: '#F8FAF9' }}>
                                                        <div style={{ color: '#94A3B8', marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                                                            <History size={40} strokeWidth={1.5} />
                                                        </div>
                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#334155' }}>
                                                            No se registraron movimientos en este período
                                                        </div>
                                                        <p style={{ fontSize: '0.82rem', color: '#64748B', maxWidth: '400px', margin: '0.35rem auto 1rem' }}>
                                                            {movementsFilterActiveOnly 
                                                                ? 'Actualmente tienes activo el filtro "Solo con rotación". Desmárcalo para ver todo el catálogo o amplía el rango de fechas.' 
                                                                : 'No hay entradas ni salidas en la ventana seleccionada.'}
                                                        </p>
                                                        {movementsFilterActiveOnly && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setMovementsFilterActiveOnly(false)}
                                                                style={{
                                                                    padding: '0.45rem 0.9rem',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #CBD5E1',
                                                                    backgroundColor: '#FFFFFF',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '700',
                                                                    color: '#334155',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                Ver Catálogo Completo
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ) : (
                                                kardexFamilies.map((kf, kfIdx) => {
                                                    const parent = kf.parent;
                                                    const isParentCollapsed = !!collapsedKardexParents[parent.product_id];
                                                    const isParentExpandedDrilldown = !!expandedKardexItems[parent.product_id];

                                                    if (kf.isParent) {
                                                        return (
                                                            <React.Fragment key={`kardex-family-${parent.product_id}-${kfIdx}`}>
                                                                {/* FILA PADRE KARDEX */}
                                                                <tr 
                                                                    style={{ 
                                                                        backgroundColor: '#F8FAFC',
                                                                        borderLeft: '4px solid #4F46E5',
                                                                        transition: 'background-color 0.15s ease'
                                                                    }} 
                                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'} 
                                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                                >
                                                                    <td style={styles.td}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleKardexParentCollapse(parent.product_id)}
                                                                                style={{
                                                                                    background: isParentCollapsed ? '#EEF2FF' : '#E0E7FF',
                                                                                    border: '1px solid #C7D2FE',
                                                                                    cursor: 'pointer',
                                                                                    padding: '4px',
                                                                                    borderRadius: '6px',
                                                                                    color: '#4F46E5',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                                title={isParentCollapsed ? `Expandir ${kf.childrenWithSummary.length} variantes` : "Colapsar variantes"}
                                                                            >
                                                                                {isParentCollapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronDown size={14} strokeWidth={2.5} />}
                                                                            </button>
                                                                            <div style={{ width: '40px', height: '40px', backgroundColor: '#EDF1EE', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}`, flexShrink: 0 }}>
                                                                                {parent.products?.image_url ? (
                                                                                    <img 
                                                                                        src={parent.products.image_url} 
                                                                                        alt={parent.products.name} 
                                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                                    />
                                                                                ) : (
                                                                                    <Package size={18} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <span>{parent.products?.name || 'Desconocido'}</span>
                                                                                </div>
                                                                                <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                    <code style={{ fontSize: '0.72rem', color: '#0A5C36', backgroundColor: '#EDF5F1', padding: '2px 7px', borderRadius: '5px', fontWeight: '800', border: '1px solid #C6E7D9' }}>
                                                                                        ID: {parent.products?.accounting_id ?? '—'}
                                                                                    </code>
                                                                                    {renderCellBadge(parent.products?.inventory_group)}
                                                                                    <span style={{ fontSize: '0.62rem', fontWeight: '800', padding: '2px 6px', borderRadius: '5px', backgroundColor: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE' }}>
                                                                                        PADRE
                                                                                    </span>
                                                                                    <span style={{ fontSize: '0.62rem', fontWeight: '700', padding: '2px 6px', borderRadius: '5px', backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0' }}>
                                                                                        {kf.childrenWithSummary.length} Variantes
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td style={styles.td}>
                                                                        <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                            {parent.products?.unit_of_measure}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                        <span style={{ fontWeight: '700', color: kf.summary.entries > 0 ? '#059669' : '#94A3B8', fontSize: '0.88rem' }}>
                                                                            {kf.summary.entries > 0 ? `+${formatNumber(kf.summary.entries)}` : '0'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                        <span style={{ fontWeight: '700', color: kf.summary.exits > 0 ? '#DC2626' : '#94A3B8', fontSize: '0.88rem' }}>
                                                                            {kf.summary.exits > 0 ? `-${formatNumber(kf.summary.exits)}` : '0'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                        <span style={{ 
                                                                            fontWeight: '800', 
                                                                            fontSize: '0.88rem',
                                                                            color: kf.summary.netFlow > 0 ? '#059669' : kf.summary.netFlow < 0 ? '#DC2626' : '#64748B' 
                                                                        }}>
                                                                            {kf.summary.netFlow > 0 ? `+${formatNumber(kf.summary.netFlow)}` : formatNumber(kf.summary.netFlow)}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                        <span style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.92rem' }}>
                                                                            {formatNumber(kf.summary.currentStock)}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleKardexItemExpanded(parent.product_id)}
                                                                            style={{
                                                                                backgroundColor: isParentExpandedDrilldown ? '#4F46E5' : '#F1F5F9',
                                                                                color: isParentExpandedDrilldown ? '#FFFFFF' : '#475569',
                                                                                border: `1px solid ${isParentExpandedDrilldown ? '#4F46E5' : '#CBD5E1'}`,
                                                                                padding: '0.35rem 0.75rem',
                                                                                borderRadius: '6px',
                                                                                fontWeight: '600',
                                                                                fontSize: '0.75rem',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '5px',
                                                                                transition: 'all 0.15s ease'
                                                                            }}
                                                                        >
                                                                            <History size={13} strokeWidth={2} />
                                                                            <span>{kf.summary.movementsCount} transacciones</span>
                                                                            {isParentExpandedDrilldown ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                                        </button>
                                                                    </td>
                                                                </tr>

                                                                {/* DRILLDOWN PADRE */}
                                                                {isParentExpandedDrilldown && (
                                                                    <tr>
                                                                        <td colSpan={7} style={{ padding: '0.6rem 1.5rem 1rem 3.5rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                                            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                                                                                <div style={{ padding: '0.55rem 0.9rem', backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>
                                                                                        Historial Agregado de la Familia ({kf.summary.transactions.length} registros)
                                                                                    </span>
                                                                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Orden cronológico</span>
                                                                                </div>
                                                                                {kf.summary.transactions.length === 0 ? (
                                                                                    <div style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.75rem' }}>
                                                                                        Sin transacciones en este período
                                                                                    </div>
                                                                                ) : (
                                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                                                                        <thead>
                                                                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                                                                <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Fecha/Hora</th>
                                                                                                <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Producto</th>
                                                                                                <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Tipo</th>
                                                                                                <th style={{ padding: '0.4rem 0.65rem', textAlign: 'center', color: '#64748B' }}>Cantidad</th>
                                                                                                <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Referencia</th>
                                                                                                <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Notas</th>
                                                                                            </tr>
                                                                                        </thead>
                                                                                        <tbody>
                                                                                            {kf.summary.transactions.map(tx => (
                                                                                                <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                                                    <td style={{ padding: '0.4rem 0.65rem', color: '#334155' }}>{new Date(tx.created_at).toLocaleString('es-CO')}</td>
                                                                                                    <td style={{ padding: '0.4rem 0.65rem', fontWeight: '600', color: '#1E293B' }}>{tx.products?.name || parent.products?.name}</td>
                                                                                                    <td style={{ padding: '0.4rem 0.65rem' }}>
                                                                                                        <span style={{
                                                                                                            padding: '2px 6px',
                                                                                                            borderRadius: '4px',
                                                                                                            fontWeight: '700',
                                                                                                            fontSize: '0.65rem',
                                                                                                            backgroundColor: tx.type === 'entry' ? '#ECFDF5' : tx.type === 'exit' ? '#FEF2F2' : '#EFF6FF',
                                                                                                            color: tx.type === 'entry' ? '#065F46' : tx.type === 'exit' ? '#991B1B' : '#1E40AF',
                                                                                                            border: `1px solid ${tx.type === 'entry' ? '#A7F3D0' : tx.type === 'exit' ? '#FECACA' : '#BFDBFE'}`
                                                                                                        }}>
                                                                                                            {tx.type === 'entry' ? 'ENTRADA' : tx.type === 'exit' ? 'SALIDA' : tx.type?.toUpperCase() || 'AJUSTE'}
                                                                                                        </span>
                                                                                                    </td>
                                                                                                    <td style={{ padding: '0.4rem 0.65rem', textAlign: 'center', fontWeight: '700', color: tx.type === 'entry' || tx.quantity > 0 ? '#059669' : '#DC2626' }}>
                                                                                                        {tx.quantity > 0 ? `+${formatNumber(tx.quantity)}` : formatNumber(tx.quantity)}
                                                                                                    </td>
                                                                                                    <td style={{ padding: '0.4rem 0.65rem', color: '#475569' }}>
                                                                                                        <span style={{ fontWeight: '600' }}>{tx.reference_type || 'Manual'}</span>
                                                                                                    </td>
                                                                                                    <td style={{ padding: '0.4rem 0.65rem', color: '#64748B' }}>{tx.notes || '—'}</td>
                                                                                                </tr>
                                                                                            ))}
                                                                                        </tbody>
                                                                                    </table>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                )}

                                                                {/* FILAS HIJOS KARDEX */}
                                                                {!isParentCollapsed && kf.childrenWithSummary.map((cws, cIdx) => {
                                                                    const child = cws.child;
                                                                    const cSummary = cws.summary;
                                                                    const isChildDrilldown = !!expandedKardexItems[child.product_id];

                                                                    return (
                                                                        <React.Fragment key={`kardex-child-${parent.product_id}-${child.product_id}-${cIdx}`}>
                                                                            <tr 
                                                                                style={{ 
                                                                                    backgroundColor: '#FFFFFF',
                                                                                    borderLeft: '4px solid #CBD5E1',
                                                                                    transition: 'background-color 0.15s ease'
                                                                                }} 
                                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'} 
                                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#FFFFFF'}
                                                                            >
                                                                                <td style={styles.td}>
                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', paddingLeft: '2.5rem', position: 'relative' }}>
                                                                                        <div style={{
                                                                                            position: 'absolute',
                                                                                            left: '1.25rem',
                                                                                            top: '-50%',
                                                                                            bottom: '50%',
                                                                                            width: '14px',
                                                                                            borderLeft: '2px solid #CBD5E1',
                                                                                            borderBottom: '2px solid #CBD5E1',
                                                                                            borderBottomLeftRadius: '6px'
                                                                                        }} />
                                                                                        <div style={{ width: '36px', height: '36px', backgroundColor: '#F8FAFC', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E2E8F0', flexShrink: 0 }}>
                                                                                            {child.products?.image_url ? (
                                                                                                <img 
                                                                                                    src={child.products.image_url} 
                                                                                                    alt={child.products.name} 
                                                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                                                />
                                                                                            ) : (
                                                                                                <Package size={16} strokeWidth={1.5} style={{ color: '#94A3B8' }} />
                                                                                            )}
                                                                                        </div>
                                                                                        <div>
                                                                                            <div style={{ fontWeight: '600', fontSize: '0.85rem', color: '#334155' }}>
                                                                                                {child.products?.name || 'Desconocido'}
                                                                                            </div>
                                                                                            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginTop: '0.15rem' }}>
                                                                                                <code style={{ fontSize: '0.7rem', color: '#334155', backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: '4px', fontWeight: '800', border: '1px solid #E2E8F0' }}>
                                                                                                    ID: {child.products?.accounting_id ?? '—'}
                                                                                                </code>
                                                                                                <span style={{ fontSize: '0.6rem', fontWeight: '700', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#F0F9FF', color: '#0284C7', border: '1px solid #BAE6FD' }}>
                                                                                                    HIJO
                                                                                                </span>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td style={styles.td}>
                                                                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                                        {child.products?.unit_of_measure}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                                    <span style={{ fontWeight: '700', color: cSummary.entries > 0 ? '#059669' : '#94A3B8', fontSize: '0.85rem' }}>
                                                                                        {cSummary.entries > 0 ? `+${formatNumber(cSummary.entries)}` : '0'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                                    <span style={{ fontWeight: '700', color: cSummary.exits > 0 ? '#DC2626' : '#94A3B8', fontSize: '0.85rem' }}>
                                                                                        {cSummary.exits > 0 ? `-${formatNumber(cSummary.exits)}` : '0'}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                                    <span style={{ 
                                                                                        fontWeight: '800', 
                                                                                        fontSize: '0.85rem',
                                                                                        color: cSummary.netFlow > 0 ? '#059669' : cSummary.netFlow < 0 ? '#DC2626' : '#64748B' 
                                                                                    }}>
                                                                                        {cSummary.netFlow > 0 ? `+${formatNumber(cSummary.netFlow)}` : formatNumber(cSummary.netFlow)}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                                    <span style={{ fontWeight: '700', color: '#1E293B', fontSize: '0.88rem' }}>
                                                                                        {formatNumber(cSummary.currentStock)}
                                                                                    </span>
                                                                                </td>
                                                                                <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => toggleKardexItemExpanded(child.product_id)}
                                                                                        style={{
                                                                                            backgroundColor: isChildDrilldown ? '#4F46E5' : 'transparent',
                                                                                            color: isChildDrilldown ? '#FFFFFF' : '#64748B',
                                                                                            border: `1px solid ${isChildDrilldown ? '#4F46E5' : '#E2E8F0'}`,
                                                                                            padding: '0.3rem 0.65rem',
                                                                                            borderRadius: '6px',
                                                                                            fontWeight: '500',
                                                                                            fontSize: '0.72rem',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '4px',
                                                                                            transition: 'all 0.15s ease'
                                                                                        }}
                                                                                    >
                                                                                        <span>{cSummary.movementsCount} movs</span>
                                                                                        {isChildDrilldown ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                                                    </button>
                                                                                </td>
                                                                            </tr>

                                                                            {/* DRILLDOWN HIJO */}
                                                                            {isChildDrilldown && (
                                                                                <tr>
                                                                                    <td colSpan={7} style={{ padding: '0.5rem 1.5rem 0.8rem 5rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                                                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                                                                                            <div style={{ padding: '0.45rem 0.75rem', backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0', fontSize: '0.72rem', fontWeight: '700', color: '#475569' }}>
                                                                                                Movimientos de {child.products?.name} ({cSummary.transactions.length})
                                                                                            </div>
                                                                                            {cSummary.transactions.length === 0 ? (
                                                                                                <div style={{ padding: '0.75rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.72rem' }}>
                                                                                                    Sin transacciones en este período
                                                                                                </div>
                                                                                            ) : (
                                                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                                                                                    <tbody>
                                                                                                        {cSummary.transactions.map(tx => (
                                                                                                            <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                                                                <td style={{ padding: '0.35rem 0.6rem', color: '#475569' }}>{new Date(tx.created_at).toLocaleString('es-CO')}</td>
                                                                                                                <td style={{ padding: '0.35rem 0.6rem' }}>
                                                                                                                    <span style={{
                                                                                                                        padding: '1px 5px',
                                                                                                                        borderRadius: '4px',
                                                                                                                        fontWeight: '700',
                                                                                                                        fontSize: '0.62rem',
                                                                                                                        backgroundColor: tx.type === 'entry' ? '#ECFDF5' : tx.type === 'exit' ? '#FEF2F2' : '#EFF6FF',
                                                                                                                        color: tx.type === 'entry' ? '#065F46' : tx.type === 'exit' ? '#991B1B' : '#1E40AF'
                                                                                                                    }}>
                                                                                                                        {tx.type === 'entry' ? 'ENTRADA' : tx.type === 'exit' ? 'SALIDA' : tx.type?.toUpperCase() || 'AJUSTE'}
                                                                                                                    </span>
                                                                                                                </td>
                                                                                                                <td style={{ padding: '0.35rem 0.6rem', textAlign: 'center', fontWeight: '700', color: tx.type === 'entry' || tx.quantity > 0 ? '#059669' : '#DC2626' }}>
                                                                                                                    {tx.quantity > 0 ? `+${formatNumber(tx.quantity)}` : formatNumber(tx.quantity)}
                                                                                                                </td>
                                                                                                                <td style={{ padding: '0.35rem 0.6rem', color: '#475569' }}>{tx.reference_type || 'Manual'}</td>
                                                                                                                <td style={{ padding: '0.35rem 0.6rem', color: '#64748B' }}>{tx.notes || '—'}</td>
                                                                                                            </tr>
                                                                                                        ))}
                                                                                                    </tbody>
                                                                                                </table>
                                                                                            )}
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            )}
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    }

                                                    // FILA STANDALONE KARDEX (sin variantes)
                                                    return (
                                                        <React.Fragment key={`kardex-standalone-${parent.product_id}-${kfIdx}`}>
                                                            <tr 
                                                                style={{ transition: 'background-color 0.2s' }} 
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} 
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                <td style={styles.td}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                                        <div style={{ width: '40px', height: '40px', backgroundColor: '#EDF1EE', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}` }}>
                                                                            {parent.products?.image_url ? (
                                                                                <img 
                                                                                    src={parent.products.image_url} 
                                                                                    alt={parent.products.name} 
                                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                                />
                                                                            ) : (
                                                                                <Package size={18} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                                            )}
                                                                        </div>
                                                                        <div>
                                                                            <div style={{ fontWeight: '700', fontSize: '0.9rem', color: THEME.colors.textMain }}>
                                                                                {parent.products?.name || 'Desconocido'}
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                                <code style={{ fontSize: '0.72rem', color: '#0A5C36', backgroundColor: '#EDF5F1', padding: '2px 7px', borderRadius: '5px', fontWeight: '800', border: '1px solid #C6E7D9' }}>
                                                                                    ID: {parent.products?.accounting_id ?? '—'}
                                                                                </code>
                                                                                {renderCellBadge(parent.products?.inventory_group)}
                                                                                {CATEGORY_MAP[parent.products?.category || ''] && (
                                                                                    <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary }}>
                                                                                        {CATEGORY_MAP[parent.products?.category || '']}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td style={styles.td}>
                                                                    <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                                        {parent.products?.unit_of_measure}
                                                                    </span>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                    <span style={{ fontWeight: '700', color: kf.summary.entries > 0 ? '#059669' : '#94A3B8', fontSize: '0.88rem' }}>
                                                                        {kf.summary.entries > 0 ? `+${formatNumber(kf.summary.entries)}` : '0'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                    <span style={{ fontWeight: '700', color: kf.summary.exits > 0 ? '#DC2626' : '#94A3B8', fontSize: '0.88rem' }}>
                                                                        {kf.summary.exits > 0 ? `-${formatNumber(kf.summary.exits)}` : '0'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                    <span style={{ 
                                                                        fontWeight: '800', 
                                                                        fontSize: '0.88rem',
                                                                        color: kf.summary.netFlow > 0 ? '#059669' : kf.summary.netFlow < 0 ? '#DC2626' : '#64748B' 
                                                                    }}>
                                                                        {kf.summary.netFlow > 0 ? `+${formatNumber(kf.summary.netFlow)}` : formatNumber(kf.summary.netFlow)}
                                                                    </span>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                                    <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.92rem' }}>
                                                                        {formatNumber(kf.summary.currentStock)}
                                                                    </span>
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleKardexItemExpanded(parent.product_id)}
                                                                        style={{
                                                                            backgroundColor: isParentExpandedDrilldown ? '#4F46E5' : 'transparent',
                                                                            color: isParentExpandedDrilldown ? '#FFFFFF' : '#4B5563',
                                                                            border: `1px solid ${isParentExpandedDrilldown ? '#4F46E5' : '#D1D5DB'}`,
                                                                            padding: '0.35rem 0.75rem',
                                                                            borderRadius: '6px',
                                                                            fontWeight: '500',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s ease-in-out',
                                                                            fontSize: '0.75rem',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}
                                                                    >
                                                                        <History size={13} strokeWidth={2} />
                                                                        <span>{kf.summary.movementsCount} transacciones</span>
                                                                        {isParentExpandedDrilldown ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                                                                    </button>
                                                                </td>
                                                            </tr>

                                                            {/* DRILLDOWN STANDALONE */}
                                                            {isParentExpandedDrilldown && (
                                                                <tr>
                                                                    <td colSpan={7} style={{ padding: '0.6rem 1.5rem 1rem 3.5rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                                                                            <div style={{ padding: '0.55rem 0.9rem', backgroundColor: '#F1F5F9', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#334155' }}>
                                                                                    Historial de Transacciones ({kf.summary.transactions.length})
                                                                                </span>
                                                                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Orden cronológico</span>
                                                                            </div>
                                                                            {kf.summary.transactions.length === 0 ? (
                                                                                <div style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.75rem' }}>
                                                                                    Sin transacciones en este período
                                                                                </div>
                                                                            ) : (
                                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                                                                    <thead>
                                                                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                                                            <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Fecha/Hora</th>
                                                                                            <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Tipo</th>
                                                                                            <th style={{ padding: '0.4rem 0.65rem', textAlign: 'center', color: '#64748B' }}>Cantidad</th>
                                                                                            <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Referencia</th>
                                                                                            <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Destino</th>
                                                                                            <th style={{ padding: '0.4rem 0.65rem', textAlign: 'left', color: '#64748B' }}>Notas</th>
                                                                                        </tr>
                                                                                    </thead>
                                                                                    <tbody>
                                                                                        {kf.summary.transactions.map(tx => (
                                                                                            <tr key={tx.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                                                <td style={{ padding: '0.4rem 0.65rem', color: '#334155' }}>{new Date(tx.created_at).toLocaleString('es-CO')}</td>
                                                                                                <td style={{ padding: '0.4rem 0.65rem' }}>
                                                                                                    <span style={{
                                                                                                        padding: '2px 6px',
                                                                                                        borderRadius: '4px',
                                                                                                        fontWeight: '700',
                                                                                                        fontSize: '0.65rem',
                                                                                                        backgroundColor: tx.type === 'entry' ? '#ECFDF5' : tx.type === 'exit' ? '#FEF2F2' : '#EFF6FF',
                                                                                                        color: tx.type === 'entry' ? '#065F46' : tx.type === 'exit' ? '#991B1B' : '#1E40AF',
                                                                                                        border: `1px solid ${tx.type === 'entry' ? '#A7F3D0' : tx.type === 'exit' ? '#FECACA' : '#BFDBFE'}`
                                                                                                    }}>
                                                                                                        {tx.type === 'entry' ? 'ENTRADA' : tx.type === 'exit' ? 'SALIDA' : tx.type?.toUpperCase() || 'AJUSTE'}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td style={{ padding: '0.4rem 0.65rem', textAlign: 'center', fontWeight: '700', color: tx.type === 'entry' || tx.quantity > 0 ? '#059669' : '#DC2626' }}>
                                                                                                    {tx.quantity > 0 ? `+${formatNumber(tx.quantity)}` : formatNumber(tx.quantity)}
                                                                                                </td>
                                                                                                <td style={{ padding: '0.4rem 0.65rem', color: '#475569' }}>
                                                                                                    <span style={{ fontWeight: '600' }}>{tx.reference_type || 'Manual'}</span>
                                                                                                </td>
                                                                                                <td style={{ padding: '0.4rem 0.65rem', color: '#64748B' }}>{tx.status_to || 'disponible'}</td>
                                                                                                <td style={{ padding: '0.4rem 0.65rem', color: '#64748B' }}>{tx.notes || '—'}</td>
                                                                                            </tr>
                                                                                        ))}
                                                                                    </tbody>
                                                                                </table>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )
                        )}

                            {activeTab === 'random_tasks' && (
                                <div style={{ padding: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                         <div>
                                             <h2 style={{ margin: 0, fontWeight: '800', fontSize: '1.25rem', color: THEME.colors.textMain }}>Auditorías Recientes</h2>
                                             <p style={{ color: THEME.colors.textSecondary, margin: '0.25rem 0 0 0', fontSize: '0.85rem' }}>Gestione los conteos ciegos aleatorios del día.</p>
                                         </div>
                                         <button 
                                             onClick={() => handleGenerateAudit()}
                                             disabled={generatingAudit}
                                             style={{ 
                                                 backgroundColor: THEME.colors.primary, 
                                                 color: 'white', 
                                                 padding: '0.55rem 1.15rem', 
                                                 borderRadius: '8px', 
                                                 border: 'none', 
                                                 fontWeight: '600', 
                                                 cursor: 'pointer',
                                                 opacity: generatingAudit ? 0.7 : 1, 
                                                 display: 'flex', 
                                                 alignItems: 'center', 
                                                 gap: '0.5rem',
                                                 fontSize: '0.8rem',
                                                 boxShadow: '0 4px 12px rgba(13, 122, 87, 0.15)',
                                                 transition: 'all 0.2s'
                                             }}
                                             onMouseEnter={(e) => {
                                                 if (!generatingAudit) {
                                                     e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                                     e.currentTarget.style.transform = 'translateY(-1px)';
                                                 }
                                             }}
                                             onMouseLeave={(e) => {
                                                 if (!generatingAudit) {
                                                     e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                                     e.currentTarget.style.transform = 'translateY(0)';
                                                 }
                                             }}
                                         >
                                             {generatingAudit ? (
                                                 <>
                                                     <RefreshCw size={14} className="animate-spin" strokeWidth={2} style={{ animation: 'spin 2s linear infinite' }} />
                                                     <span>Generando...</span>
                                                 </>
                                             ) : (
                                                 <>
                                                     <Plus size={14} strokeWidth={2} />
                                                     <span>Generar Auditoría de Hoy</span>
                                                 </>
                                             )}
                                         </button>
                                     </div>

                                    {randomTasks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#F4F7F6', borderRadius: '12px', border: `2px dashed ${THEME.colors.border}` }}>
                                            <div style={{ color: THEME.colors.textSecondary, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                                                <ClipboardList size={48} strokeWidth={1.5} />
                                            </div>
                                            <h3 style={{ fontWeight: '800', color: THEME.colors.textMain }}>Sin auditorías generadas</h3>
                                            <p style={{ color: THEME.colors.textSecondary, maxWidth: '300px', margin: '0.5rem auto 1.5rem', fontSize: '0.85rem' }}>
                                                Haga clic en el botón superior para generar una lista aleatoria de productos para auditar hoy.
                                            </p>
                                        </div>
                                    ) : (
                                        randomTasks.map(task => (
                                            <div key={task.id} style={{ 
                                                 marginBottom: '2rem', 
                                                 border: `1px solid ${THEME.colors.border}`, 
                                                 borderRadius: '12px', 
                                                 overflow: 'hidden', 
                                                 boxShadow: THEME.shadow.md,
                                                 backgroundColor: THEME.colors.surface 
                                             }}>
                                                 <div style={{ 
                                                     backgroundColor: '#F4F7F6', 
                                                     padding: '1rem 1.5rem', 
                                                     display: 'flex', 
                                                     justifyContent: 'space-between', 
                                                     alignItems: 'center', 
                                                     borderBottom: `1px solid ${THEME.colors.border}` 
                                                 }}>
                                                     <div>
                                                         <span style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, letterSpacing: '0.04em' }}>FECHA PLANIFICADA: {task.scheduled_date}</span>
                                                         <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.05rem', marginTop: '0.15rem' }}>Auditoría Aleatoria #{task.id.split('-')[0]}</div>
                                                     </div>
                                                     <span style={styles.badge(
                                                         task.status === 'completed' ? THEME.colors.successBg : THEME.colors.warningBg, 
                                                         task.status === 'completed' ? THEME.colors.successText : THEME.colors.warningText
                                                     )}>
                                                         {task.status.toUpperCase()}
                                                     </span>
                                                 </div>
                                                 <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                     <thead>
                                                         <tr style={{ borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: '#F9FAFB' }}>
                                                             <th style={{ ...styles.th, fontSize: '0.65rem' }}>Producto</th>
                                                             <th style={{ ...styles.th, fontSize: '0.65rem', textAlign: 'center' }}>Stock Sistema</th>
                                                             <th style={{ ...styles.th, fontSize: '0.65rem', textAlign: 'center' }}>Físico (Conteo Ciego)</th>
                                                             <th style={{ ...styles.th, fontSize: '0.65rem', textAlign: 'center' }}>Diferencia %</th>
                                                             <th style={{ ...styles.th, fontSize: '0.65rem', textAlign: 'right' }}>Estado</th>
                                                         </tr>
                                                     </thead>
                                                     <tbody>
                                                         {task.items.map(item => (
                                                             <tr key={item.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                                 <td style={styles.td}><strong>{item.products?.name || 'Producto Desconocido'}</strong></td>
                                                                 <td style={{ ...styles.td, textAlign: 'center' }}>{formatNumber(item.expected_qty)}</td>
                                                                 <td style={{ ...styles.td, textAlign: 'center' }}>
                                                                     {item.actual_qty !== null ? (
                                                                         <span style={{ fontWeight: '700', color: THEME.colors.textMain }}>{formatNumber(item.actual_qty)}</span>
                                                                     ) : (
                                                                         <button style={{ 
                                                                             padding: '0.35rem 0.75rem', 
                                                                             borderRadius: '6px', 
                                                                             border: '1px solid #D1D5DB', 
                                                                             background: 'transparent', 
                                                                             fontSize: '0.75rem', 
                                                                             fontWeight: '500', 
                                                                             color: '#4B5563',
                                                                             cursor: 'pointer',
                                                                             transition: 'all 0.2s'
                                                                         }}
                                                                         onMouseEnter={(e) => {
                                                                             e.currentTarget.style.backgroundColor = '#F9FAFB';
                                                                             e.currentTarget.style.borderColor = '#9CA3AF';
                                                                             e.currentTarget.style.color = '#111827';
                                                                         }}
                                                                         onMouseLeave={(e) => {
                                                                             e.currentTarget.style.backgroundColor = 'transparent';
                                                                             e.currentTarget.style.borderColor = '#D1D5DB';
                                                                             e.currentTarget.style.color = '#4B5563';
                                                                         }}>
                                                                             Ingresar Conteo
                                                                         </button>
                                                                     )}
                                                                 </td>
                                                                 <td style={{ 
                                                                     ...styles.td, 
                                                                     textAlign: 'center',
                                                                     color: item.difference_percent > auditPolicy.alertThreshold ? '#B91C1C' : '#059669', 
                                                                     fontWeight: '700' 
                                                                 }}>
                                                                     {item.actual_qty !== null ? `${formatNumber(item.difference_percent, 1)}%` : '-'}
                                                                 </td>
                                                                 <td style={{ ...styles.td, textAlign: 'right' }}>
                                                                     <span style={{ 
                                                                         display: 'inline-flex', 
                                                                         alignItems: 'center', 
                                                                         gap: '0.4rem', 
                                                                         padding: '0.25rem 0.6rem', 
                                                                         borderRadius: '6px', 
                                                                         fontSize: '0.7rem', 
                                                                         fontWeight: '700',
                                                                         backgroundColor: item.difference_percent > auditPolicy.alertThreshold ? '#FEE2E2' : item.actual_qty !== null ? THEME.colors.successBg : '#EDF1EE',
                                                                         color: item.difference_percent > auditPolicy.alertThreshold ? '#991B1B' : item.actual_qty !== null ? THEME.colors.successText : THEME.colors.textSecondary
                                                                     }}>
                                                                         {item.difference_percent > auditPolicy.alertThreshold ? 'DESCUADRE' : item.actual_qty !== null ? 'OK' : 'PENDIENTE'}
                                                                     </span>
                                                                 </td>
                                                             </tr>
                                                         ))}
                                                     </tbody>
                                                 </table>
                                             </div>
                                        ))
                                    )}
                                </div>
                            )}

                            {activeTab === 'settings' && (
                                <div style={{ padding: '1.5rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
                                    {/* Header & Title */}
                                    <div style={{ 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'flex-start', 
                                        marginBottom: '1.5rem',
                                        gap: '1rem',
                                        flexWrap: 'wrap'
                                    }}>
                                        <div>
                                            <h2 style={{ 
                                                fontWeight: '800', 
                                                fontSize: '1.35rem', 
                                                color: THEME.colors.textMain, 
                                                marginBottom: '0.25rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '8px'
                                            }}>
                                                <Users size={22} style={{ color: THEME.colors.primary }} />
                                                Gobernanza de Células & Reasignación de SKUs
                                            </h2>
                                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', margin: 0 }}>
                                                Supervisión de células de trabajo, asignación de equipos responsables y reasignación permanente de productos en el catálogo maestro de la base de datos.
                                            </p>
                                        </div>

                                        <button
                                            onClick={() => setIsNewCellModalOpen(true)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                backgroundColor: THEME.colors.primary,
                                                color: '#FFFFFF',
                                                padding: '0.6rem 1.15rem',
                                                borderRadius: '8px',
                                                border: 'none',
                                                fontSize: '0.82rem',
                                                fontWeight: '700',
                                                cursor: 'pointer',
                                                boxShadow: '0 2px 8px rgba(13, 122, 87, 0.2)',
                                                transition: 'all 0.15s ease-in-out'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                        >
                                            <Plus size={16} strokeWidth={2.5} />
                                            <span>Nueva Célula de Trabajo</span>
                                        </button>
                                    </div>

                                    {/* Subtab Navigation Pills */}
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '0.5rem',
                                        marginBottom: '1.5rem',
                                        borderBottom: '1.5px solid #E2E8F0',
                                        paddingBottom: '0.75rem'
                                    }}>
                                        <button
                                            onClick={() => setPolicySubTab('cells')}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '7px',
                                                padding: '0.55rem 1.1rem',
                                                borderRadius: '8px',
                                                border: 'none',
                                                backgroundColor: policySubTab === 'cells' ? '#0D7A57' : '#F1F5F9',
                                                color: policySubTab === 'cells' ? '#FFFFFF' : '#475569',
                                                fontWeight: '700',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <Users size={15} />
                                            <span>Células & Responsables</span>
                                            <span style={{
                                                backgroundColor: policySubTab === 'cells' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                                                color: policySubTab === 'cells' ? '#FFFFFF' : '#334155',
                                                padding: '1px 6px',
                                                borderRadius: '10px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800'
                                            }}>
                                                {workCells.length}
                                            </span>
                                        </button>

                                        <button
                                            onClick={() => setPolicySubTab('skus')}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '7px',
                                                padding: '0.55rem 1.1rem',
                                                borderRadius: '8px',
                                                border: 'none',
                                                backgroundColor: policySubTab === 'skus' ? '#0D7A57' : '#F1F5F9',
                                                color: policySubTab === 'skus' ? '#FFFFFF' : '#475569',
                                                fontWeight: '700',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            <Package size={15} />
                                            <span>Reasignación de SKUs Activos</span>
                                            <span style={{
                                                backgroundColor: policySubTab === 'skus' ? 'rgba(255,255,255,0.25)' : '#E2E8F0',
                                                color: policySubTab === 'skus' ? '#FFFFFF' : '#334155',
                                                padding: '1px 6px',
                                                borderRadius: '10px',
                                                fontSize: '0.72rem',
                                                fontWeight: '800'
                                            }}>
                                                {activeProductsCatalog.length}
                                            </span>
                                        </button>
                                    </div>

                                    {/* SUBTAB 1: CÉLULAS Y RESPONSABLES */}
                                    {policySubTab === 'cells' && (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))',
                                            gap: '1.25rem'
                                        }}>
                                            {workCells.map(cell => {
                                                const activeSkusCount = skuCountsByCell[cell.inventory_group?.trim().toUpperCase()] || 0;
                                                const responsiblesList = cell.responsibles || [];
                                                const isAssigning = assigningCellId === cell.id;

                                                return (
                                                    <div 
                                                        key={cell.id}
                                                        style={{
                                                            backgroundColor: '#FFFFFF',
                                                            borderRadius: '12px',
                                                            border: `1px solid ${cell.color || '#CBD5E1'}40`,
                                                            borderTop: `4px solid ${cell.color || '#0D7A57'}`,
                                                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                                                            padding: '1.25rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'space-between',
                                                            gap: '1rem'
                                                        }}
                                                    >
                                                        <div>
                                                            {/* Cell Header */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <div style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        width: '38px',
                                                                        height: '38px',
                                                                        borderRadius: '8px',
                                                                        backgroundColor: `${cell.color || '#0D7A57'}15`,
                                                                        color: cell.color || '#0D7A57',
                                                                        flexShrink: 0
                                                                    }}>
                                                                        {renderCellLucideIcon(cell.icon, 20)}
                                                                    </div>
                                                                    <div>
                                                                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                                                            {cell.name}
                                                                        </h3>
                                                                        <span style={{ 
                                                                            fontSize: '0.68rem', 
                                                                            fontWeight: '700', 
                                                                            color: cell.color || '#0D7A57',
                                                                            backgroundColor: `${cell.color || '#0D7A57'}15`,
                                                                            padding: '2px 6px',
                                                                            borderRadius: '4px'
                                                                        }}>
                                                                            {cell.short_name}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* SKU Badge */}
                                                                <span style={{
                                                                    backgroundColor: activeSkusCount > 0 ? '#DCFCE7' : '#FEF3C7',
                                                                    color: activeSkusCount > 0 ? '#15803D' : '#92400E',
                                                                    fontWeight: '800',
                                                                    fontSize: '0.72rem',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '8px',
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    {activeSkusCount} SKUs activos
                                                                </span>
                                                            </div>

                                                            {/* Description */}
                                                            <p style={{ margin: '0.4rem 0 0.65rem 0', fontSize: '0.78rem', color: THEME.colors.textSecondary, lineHeight: 1.4 }}>
                                                                {cell.description || 'Sin descripción configurada.'}
                                                            </p>

                                                            {/* Inventory Group in BD */}
                                                            <div style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                backgroundColor: '#F8FAFC',
                                                                border: '1px solid #E2E8F0',
                                                                borderRadius: '6px',
                                                                padding: '3px 8px',
                                                                fontSize: '0.68rem',
                                                                color: '#475569',
                                                                fontWeight: '600',
                                                                marginBottom: '0.85rem'
                                                            }}>
                                                                <span>Grupo de Inventario:</span>
                                                                <code style={{ fontWeight: '700', color: '#1E293B' }}>{cell.inventory_group}</code>
                                                            </div>

                                                            {/* Divider */}
                                                            <div style={{ borderTop: '1px solid #F1F5F9', margin: '0.5rem 0 0.85rem 0' }} />

                                                            {/* Responsibles Header */}
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                                    Personal Asignado ({responsiblesList.length})
                                                                </span>
                                                                
                                                                {!isAssigning && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setAssigningCellId(cell.id);
                                                                            setSelectedStaffForAssign('');
                                                                        }}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            backgroundColor: '#F0FDF4',
                                                                            color: '#0D7A57',
                                                                            border: '1px solid #BBF7D0',
                                                                            padding: '3px 8px',
                                                                            borderRadius: '6px',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: '700',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s'
                                                                        }}
                                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#DCFCE7'}
                                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F0FDF4'}
                                                                    >
                                                                        <UserPlus size={12} />
                                                                        <span>Asignar Funcionario</span>
                                                                    </button>
                                                                )}
                                                            </div>

                                                            {/* Responsibles List Chips */}
                                                            {responsiblesList.length === 0 ? (
                                                                <div style={{
                                                                    padding: '0.6rem',
                                                                    backgroundColor: '#F8FAFC',
                                                                    borderRadius: '8px',
                                                                    border: '1px dashed #CBD5E1',
                                                                    fontSize: '0.74rem',
                                                                    color: '#64748B',
                                                                    textAlign: 'center'
                                                                }}>
                                                                    Sin funcionarios asignados a esta célula
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.5rem' }}>
                                                                    {responsiblesList.map((resp, idx) => (
                                                                        <div 
                                                                            key={resp.id || idx}
                                                                            style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '6px',
                                                                                backgroundColor: idx === 0 ? '#ECFDF5' : '#F8FAFC',
                                                                                border: `1px solid ${idx === 0 ? '#A7F3D0' : '#E2E8F0'}`,
                                                                                borderRadius: '6px',
                                                                                padding: '3px 8px',
                                                                                fontSize: '0.74rem',
                                                                                color: idx === 0 ? '#0D7A57' : '#334155'
                                                                            }}
                                                                        >
                                                                            <User size={12} style={{ color: idx === 0 ? '#0D7A57' : '#64748B' }} />
                                                                            <span style={{ fontWeight: '700' }}>{resp.name}</span>
                                                                            {resp.role && (
                                                                                <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: '500' }}>
                                                                                    ({resp.role})
                                                                                </span>
                                                                            )}
                                                                            <button
                                                                                onClick={() => {
                                                                                    if (confirm(`¿Desvincular a ${resp.name} de ${cell.name}?`)) {
                                                                                        handleRemoveCellResponsible(cell.id, resp.id);
                                                                                    }
                                                                                }}
                                                                                title="Desvincular de la célula"
                                                                                style={{
                                                                                    border: 'none',
                                                                                    background: 'none',
                                                                                    cursor: 'pointer',
                                                                                    padding: '1px',
                                                                                    color: '#94A3B8',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center'
                                                                                }}
                                                                                onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                                                                                onMouseLeave={(e) => (e.currentTarget.style.color = '#94A3B8')}
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {/* Inline Assigning Box */}
                                                            {isAssigning && (
                                                                <div style={{
                                                                    marginTop: '0.75rem',
                                                                    padding: '0.85rem',
                                                                    backgroundColor: '#F0FDF4',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid #86EFAC',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '0.5rem'
                                                                }}>
                                                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#166534' }}>
                                                                        Asignar funcionario a {cell.short_name}:
                                                                    </div>
                                                                    <select
                                                                        value={selectedStaffForAssign}
                                                                        onChange={(e) => setSelectedStaffForAssign(e.target.value)}
                                                                        style={{
                                                                            ...styles.input,
                                                                            padding: '0.45rem 0.65rem',
                                                                            fontSize: '0.78rem',
                                                                            backgroundColor: '#FFFFFF'
                                                                        }}
                                                                    >
                                                                        <option value="">-- Seleccionar de la Planilla Oficial (RRHH) --</option>
                                                                        {staffUsers.map(u => (
                                                                            <option key={u.id} value={u.id}>
                                                                                {u.name} · [{u.role || 'Colaborador'}]
                                                                            </option>
                                                                        ))}
                                                                    </select>

                                                                    <div style={{ display: 'flex', gap: '0.45rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
                                                                        <button
                                                                            onClick={() => {
                                                                                setAssigningCellId(null);
                                                                                setSelectedStaffForAssign('');
                                                                            }}
                                                                            style={{
                                                                                padding: '0.35rem 0.75rem',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid #CBD5E1',
                                                                                backgroundColor: '#FFFFFF',
                                                                                color: '#475569',
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '600',
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            Cancelar
                                                                        </button>
                                                                        <button
                                                                            onClick={() => handleAddCellResponsible(cell.id)}
                                                                            disabled={isSavingCell || !selectedStaffForAssign}
                                                                            style={{
                                                                                padding: '0.35rem 0.85rem',
                                                                                borderRadius: '6px',
                                                                                border: 'none',
                                                                                backgroundColor: '#0D7A57',
                                                                                color: '#FFFFFF',
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '700',
                                                                                cursor: 'pointer',
                                                                                opacity: !selectedStaffForAssign ? 0.6 : 1
                                                                            }}
                                                                        >
                                                                            {isSavingCell ? 'Guardando...' : 'Confirmar Asignación'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Card Footer: Quick Link to SKUs */}
                                                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                            <button
                                                                onClick={() => {
                                                                    setSkuPolicyCellFilter(cell.inventory_group.trim().toUpperCase());
                                                                    setPolicySubTab('skus');
                                                                }}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px',
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: cell.color || '#0D7A57',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '700',
                                                                    cursor: 'pointer',
                                                                    padding: 0
                                                                }}
                                                            >
                                                                <span>Ver {activeSkusCount} SKUs asignados</span>
                                                                <ArrowRight size={13} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* SUBTAB 2: REASIGNACIÓN DE SKUS ACTIVOS */}
                                    {policySubTab === 'skus' && (
                                        <div>
                                            {/* Filters & Search Toolbar */}
                                            <div style={{
                                                backgroundColor: '#FFFFFF',
                                                padding: '1rem 1.25rem',
                                                borderRadius: '10px',
                                                border: '1px solid #E2E8F0',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                                                marginBottom: '1rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: '1rem',
                                                flexWrap: 'wrap'
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '320px' }}>
                                                    {/* Search Input */}
                                                    <div style={{ position: 'relative', flex: 1 }}>
                                                        <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                                        <input 
                                                            type="text"
                                                            placeholder="Buscar por ID Contable (#), Grupo de Inventario, Categoría o Producto..."
                                                            value={skuPolicySearch}
                                                            onChange={(e) => {
                                                                setSkuPolicySearch(e.target.value);
                                                                setSkuPolicyPage(1);
                                                            }}
                                                            style={{
                                                                ...styles.input,
                                                                paddingLeft: '32px',
                                                                paddingRight: skuPolicySearch ? '145px' : '12px',
                                                                fontSize: '0.8rem',
                                                                backgroundColor: '#F8FAFC'
                                                            }}
                                                        />
                                                        {skuPolicySearch && (
                                                            <div style={{
                                                                position: 'absolute',
                                                                right: '8px',
                                                                top: '50%',
                                                                transform: 'translateY(-50%)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '6px'
                                                            }}>
                                                                <span style={{
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: '700',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '12px',
                                                                    backgroundColor: filteredPolicySkus.length > 0 ? '#E2E8F0' : '#FEE2E2',
                                                                    color: filteredPolicySkus.length > 0 ? '#334155' : '#DC2626',
                                                                    letterSpacing: '0.01em',
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    {filteredPolicySkus.length} {filteredPolicySkus.length === 1 ? 'resultado' : 'resultados'}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSkuPolicySearch('');
                                                                        setSkuPolicyPage(1);
                                                                    }}
                                                                    title="Limpiar búsqueda"
                                                                    style={{
                                                                        border: 'none',
                                                                        background: '#E2E8F0',
                                                                        borderRadius: '50%',
                                                                        width: '20px',
                                                                        height: '20px',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        cursor: 'pointer',
                                                                        color: '#64748B',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    <X size={12} />
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Cell Filter Dropdown */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Filter size={15} style={{ color: '#64748B' }} />
                                                        <select
                                                            value={skuPolicyCellFilter}
                                                            onChange={(e) => {
                                                                setSkuPolicyCellFilter(e.target.value);
                                                                setSkuPolicyPage(1);
                                                            }}
                                                            style={{
                                                                ...styles.input,
                                                                width: 'auto',
                                                                minWidth: '220px',
                                                                fontSize: '0.8rem',
                                                                fontWeight: '600',
                                                                backgroundColor: '#F8FAFC'
                                                            }}
                                                        >
                                                            <option value="ALL">Todos los Grupos ({activeProductsCatalog.length})</option>
                                                            {workCells.map(c => (
                                                                <option key={c.id} value={c.inventory_group.trim().toUpperCase()}>
                                                                    {c.short_name || c.name} ({skuCountsByCell[c.inventory_group.trim().toUpperCase()] || 0})
                                                                </option>
                                                            ))}
                                                            <option value="SIN_ASIGNAR">Sin Grupo Asignado ({skuCountsByCell['SIN_ASIGNAR'] || 0})</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Summary Counter */}
                                                <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: '600' }}>
                                                    Mostrando <strong>{filteredPolicySkus.length}</strong> de <strong>{activeProductsCatalog.length}</strong> SKUs activos
                                                </div>
                                            </div>

                                            {/* SKUs Reassignment Table */}
                                            <div style={{
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '10px',
                                                border: '1px solid #E2E8F0',
                                                overflow: 'hidden',
                                                boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                                            }}>
                                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                    <thead>
                                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1.5px solid #E2E8F0' }}>
                                                            <th style={{ ...styles.th, width: '110px', fontSize: '0.72rem', fontWeight: '800', color: '#1E293B' }}>ID Contable</th>
                                                            <th style={{ ...styles.th, fontSize: '0.72rem' }}>Producto</th>
                                                            <th style={{ ...styles.th, fontSize: '0.72rem', width: '130px' }}>Categoría / UOM</th>
                                                            <th style={{ ...styles.th, fontSize: '0.72rem', width: '220px' }}>Grupo de Inventario Actual</th>
                                                            <th style={{ ...styles.th, fontSize: '0.72rem', width: '380px' }}>Reasignar Grupo de Inventario (BD)</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {paginatedPolicySkus.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                                                                    <Package size={32} style={{ margin: '0 auto 0.5rem auto', opacity: 0.4 }} />
                                                                    <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>No se encontraron productos activos con estos filtros.</div>
                                                                    <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Intente ajustar el término de búsqueda o el filtro de célula.</div>
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            paginatedPolicySkus.map(p => {
                                                                const isSaving = savingSkuId === p.id;
                                                                const isSuccess = saveSkuSuccessId === p.id;
                                                                const currentGroupVal = p.inventory_group ? p.inventory_group.trim().toUpperCase() : 'SIN_ASIGNAR';

                                                                return (
                                                                    <tr 
                                                                        key={p.id}
                                                                        style={{ 
                                                                            borderBottom: '1px solid #F1F5F9',
                                                                            backgroundColor: isSuccess ? '#F0FDF4' : '#FFFFFF',
                                                                            transition: 'background-color 0.15s'
                                                                        }}
                                                                        onMouseEnter={(e) => {
                                                                            if (!isSuccess) e.currentTarget.style.backgroundColor = '#F8FAF9';
                                                                        }}
                                                                        onMouseLeave={(e) => {
                                                                            if (!isSuccess) e.currentTarget.style.backgroundColor = '#FFFFFF';
                                                                        }}
                                                                    >
                                                                        {/* Column 1: Accounting ID (Protagonista / Alta Jerarquía) */}
                                                                        <td style={{ ...styles.td, width: '110px' }}>
                                                                            <span style={{ 
                                                                                display: 'inline-flex', 
                                                                                alignItems: 'center', 
                                                                                justifyContent: 'center',
                                                                                padding: '4px 10px', 
                                                                                borderRadius: '7px', 
                                                                                backgroundColor: p.accounting_id ? '#F1F5F9' : '#F8FAFC',
                                                                                border: p.accounting_id ? '1px solid #CBD5E1' : '1px dashed #E2E8F0',
                                                                                color: p.accounting_id ? '#0F172A' : '#94A3B8',
                                                                                fontWeight: '800', 
                                                                                fontSize: '0.86rem',
                                                                                fontFamily: 'monospace',
                                                                                letterSpacing: '0.02em',
                                                                                minWidth: '50px',
                                                                                textAlign: 'center'
                                                                            }}>
                                                                                {p.accounting_id ? `#${p.accounting_id}` : '-'}
                                                                            </span>
                                                                        </td>

                                                                        {/* Column 2: Product Name (Limpio, Sin SKU) */}
                                                                        <td style={styles.td}>
                                                                            <div style={{ fontWeight: '700', color: '#0F172A', fontSize: '0.88rem', lineHeight: 1.35 }}>
                                                                                {p.name}
                                                                            </div>
                                                                        </td>

                                                                        {/* Column 3: Category & UOM */}
                                                                        <td style={{ ...styles.td, fontSize: '0.75rem', color: '#475569' }}>
                                                                            <div>
                                                                                <span style={{ fontWeight: '600' }}>
                                                                                    {CATEGORY_MAP[p.category] || p.category || '-'}
                                                                                </span>
                                                                                <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>
                                                                                    {p.unit_of_measure}
                                                                                </div>
                                                                            </div>
                                                                        </td>

                                                                        {/* Column 4: Current Cell Badge */}
                                                                        <td style={styles.td}>
                                                                            {p.inventory_group ? (
                                                                                renderCellBadge(p.inventory_group) || (
                                                                                    <span style={{ fontSize: '0.72rem', color: '#475569', fontWeight: '600' }}>
                                                                                        {p.inventory_group}
                                                                                    </span>
                                                                                )
                                                                            ) : (
                                                                                <span style={{
                                                                                    fontSize: '0.68rem',
                                                                                    fontWeight: '700',
                                                                                    color: '#DC2626',
                                                                                    backgroundColor: '#FEF2F2',
                                                                                    border: '1px solid #FECACA',
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '6px',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px'
                                                                                }}>
                                                                                    <AlertTriangle size={11} /> Sin Grupo
                                                                                </span>
                                                                            )}
                                                                        </td>

                                                                        {/* Column 5: Interactive Reassign Dropdown */}
                                                                        <td style={styles.td}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                <select
                                                                                    value={currentGroupVal}
                                                                                    onChange={(e) => handleReassignSkuCell(p.id, e.target.value)}
                                                                                    disabled={isSaving}
                                                                                    style={{
                                                                                        padding: '0.45rem 0.75rem',
                                                                                        borderRadius: '8px',
                                                                                        border: isSuccess ? '1.5px solid #16A34A' : isSaving ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                                                                        fontSize: '0.78rem',
                                                                                        fontWeight: '600',
                                                                                        backgroundColor: '#FFFFFF',
                                                                                        color: '#1E293B',
                                                                                        cursor: isSaving ? 'wait' : 'pointer',
                                                                                        outline: 'none',
                                                                                        minWidth: '270px',
                                                                                        boxShadow: isSuccess ? '0 0 0 3px rgba(22, 163, 74, 0.1)' : 'none'
                                                                                    }}
                                                                                >
                                                                                    <option value="SIN_ASIGNAR">Sin Grupo de Inventario Asignado</option>
                                                                                    {workCells.map(c => (
                                                                                        <option key={c.id} value={c.inventory_group.trim().toUpperCase()}>
                                                                                            {c.short_name || c.name}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>

                                                                                {isSaving && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: THEME.colors.primary, fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                                                        <RefreshCw size={13} className="animate-spin" /> Guardando...
                                                                                    </span>
                                                                                )}

                                                                                {isSuccess && (
                                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#16A34A', fontWeight: '800', whiteSpace: 'nowrap' }}>
                                                                                        <CheckCircle2 size={14} /> ¡BD Actualizada!
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>

                                            {/* Pagination Bar */}
                                            {totalSkuPages > 1 && (
                                                <div style={{
                                                    marginTop: '1rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    backgroundColor: '#FFFFFF',
                                                    padding: '0.75rem 1.25rem',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E2E8F0'
                                                }}>
                                                    <button
                                                        onClick={() => setSkuPolicyPage(prev => Math.max(prev - 1, 1))}
                                                        disabled={skuPolicyPage === 1}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '0.4rem 0.85rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid #CBD5E1',
                                                            backgroundColor: skuPolicyPage === 1 ? '#F8FAFC' : '#FFFFFF',
                                                            color: skuPolicyPage === 1 ? '#94A3B8' : '#334155',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '600',
                                                            cursor: skuPolicyPage === 1 ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        <ChevronLeft size={14} />
                                                        <span>Anterior</span>
                                                    </button>

                                                    <div style={{ fontSize: '0.78rem', color: '#475569', fontWeight: '600' }}>
                                                        Página <strong>{skuPolicyPage}</strong> de <strong>{totalSkuPages}</strong>
                                                    </div>

                                                    <button
                                                        onClick={() => setSkuPolicyPage(prev => Math.min(prev + 1, totalSkuPages))}
                                                        disabled={skuPolicyPage >= totalSkuPages}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '0.4rem 0.85rem',
                                                            borderRadius: '6px',
                                                            border: '1px solid #CBD5E1',
                                                            backgroundColor: skuPolicyPage >= totalSkuPages ? '#F8FAFC' : '#FFFFFF',
                                                            color: skuPolicyPage >= totalSkuPages ? '#94A3B8' : '#334155',
                                                            fontSize: '0.78rem',
                                                            fontWeight: '600',
                                                            cursor: skuPolicyPage >= totalSkuPages ? 'not-allowed' : 'pointer'
                                                        }}
                                                    >
                                                        <span>Siguiente</span>
                                                        <ChevronRight size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* MODAL: NUEVA CÉLULA DE TRABAJO */}
                                    {isNewCellModalOpen && (
                                        <div style={{
                                            position: 'fixed',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            backgroundColor: 'rgba(15, 23, 42, 0.6)',
                                            backdropFilter: 'blur(3px)',
                                            zIndex: 9999,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: '1.5rem'
                                        }}>
                                            <div style={{
                                                backgroundColor: '#FFFFFF',
                                                borderRadius: '14px',
                                                width: '100%',
                                                maxWidth: '560px',
                                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                                                border: '1px solid #E2E8F0',
                                                overflow: 'hidden'
                                            }}>
                                                {/* Modal Header */}
                                                <div style={{
                                                    backgroundColor: '#0D7A57',
                                                    color: '#FFFFFF',
                                                    padding: '1.15rem 1.5rem',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <Users size={20} />
                                                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800' }}>
                                                            Nueva Célula de Trabajo & Inventario
                                                        </h3>
                                                    </div>
                                                    <button
                                                        onClick={() => setIsNewCellModalOpen(false)}
                                                        style={{ border: 'none', background: 'none', color: '#FFFFFF', cursor: 'pointer', padding: '2px' }}
                                                    >
                                                        <X size={18} />
                                                    </button>
                                                </div>

                                                {/* Modal Body Form */}
                                                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                    <div>
                                                        <label style={styles.label}>Nombre Completo de la Célula *</label>
                                                        <input 
                                                            type="text"
                                                            placeholder="ej: Célula de Lácteos, Carnes Frías & Embutidos"
                                                            value={newCellForm.name}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setNewCellForm(prev => ({
                                                                    ...prev,
                                                                    name: val,
                                                                    short_name: prev.short_name || val.split(' ')[0] || '',
                                                                    inventory_group: prev.inventory_group || `INVENTARIO DE ${val.toUpperCase()}`
                                                                }));
                                                            }}
                                                            style={styles.input}
                                                        />
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                                                        <div>
                                                            <label style={styles.label}>Nombre Corto (Badge) *</label>
                                                            <input 
                                                                type="text"
                                                                placeholder="ej: Lácteos"
                                                                value={newCellForm.short_name}
                                                                onChange={(e) => setNewCellForm({...newCellForm, short_name: e.target.value})}
                                                                style={styles.input}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label style={styles.label}>Color de Célula</label>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}>
                                                                <input 
                                                                    type="color"
                                                                    value={newCellForm.color}
                                                                    onChange={(e) => setNewCellForm({...newCellForm, color: e.target.value})}
                                                                    style={{ width: '38px', height: '34px', border: 'none', cursor: 'pointer', borderRadius: '4px' }}
                                                                />
                                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                                    {['#0D7A57', '#15803D', '#B45309', '#C2410C', '#475569', '#2563EB', '#7C3AED', '#DC2626'].map(col => (
                                                                        <div 
                                                                            key={col}
                                                                            onClick={() => setNewCellForm({...newCellForm, color: col})}
                                                                            style={{
                                                                                width: '18px',
                                                                                height: '18px',
                                                                                borderRadius: '50%',
                                                                                backgroundColor: col,
                                                                                cursor: 'pointer',
                                                                                border: newCellForm.color === col ? '2px solid #0F172A' : '1px solid #CBD5E1'
                                                                            }}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label style={styles.label}>Icono Vectorial Lucide *</label>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                            {[
                                                                { key: 'package', label: 'General / Paquete', Icon: Package },
                                                                { key: 'sprout', label: 'Hortalizas / Brotes', Icon: Sprout },
                                                                { key: 'carrot', label: 'Verduras / Raíces', Icon: Carrot },
                                                                { key: 'apple', label: 'Frutas Frescas', Icon: Apple },
                                                                { key: 'boxes', label: 'Abarrotes / Empaques', Icon: Boxes },
                                                                { key: 'layers', label: 'Tubérculos / Pesados', Icon: Layers },
                                                                { key: 'wheat', label: 'Granos / Harinas', Icon: Wheat },
                                                                { key: 'milk', label: 'Lácteos / Fríos', Icon: Milk },
                                                                { key: 'beef', label: 'Cárnicos / Proteínas', Icon: Beef }
                                                            ].map(item => {
                                                                const IconComp = item.Icon;
                                                                const isSelected = (newCellForm.icon || 'package').toLowerCase() === item.key;
                                                                return (
                                                                    <button
                                                                        key={item.key}
                                                                        type="button"
                                                                        title={item.label}
                                                                        onClick={() => setNewCellForm({ ...newCellForm, icon: item.key })}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '6px',
                                                                            padding: '6px 10px',
                                                                            borderRadius: '7px',
                                                                            border: isSelected ? `2px solid ${newCellForm.color || '#0D7A57'}` : '1px solid #E2E8F0',
                                                                            backgroundColor: isSelected ? `${newCellForm.color || '#0D7A57'}15` : '#FFFFFF',
                                                                            color: isSelected ? (newCellForm.color || '#0D7A57') : '#64748B',
                                                                            fontSize: '0.72rem',
                                                                            fontWeight: isSelected ? '700' : '500',
                                                                            cursor: 'pointer',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    >
                                                                        <IconComp size={15} strokeWidth={isSelected ? 2.4 : 1.8} />
                                                                        <span>{item.label.split(' / ')[0]}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label style={styles.label}>Grupo Contable / Inventario en BD *</label>
                                                        <input 
                                                            type="text"
                                                            placeholder="ej: INVENTARIO DE LACTEOS Y EMBUTIDOS"
                                                            value={newCellForm.inventory_group}
                                                            onChange={(e) => setNewCellForm({...newCellForm, inventory_group: e.target.value.toUpperCase()})}
                                                            style={{ ...styles.input, fontFamily: 'monospace', fontWeight: '700' }}
                                                        />
                                                        <span style={{ fontSize: '0.66rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                                                            Este campo se vinculará directamente a <code>products.inventory_group</code> en PostgreSQL.
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <label style={styles.label}>Responsable Inicial (Planilla RRHH - Opcional)</label>
                                                        <select
                                                            value={newCellForm.initial_responsible_id}
                                                            onChange={(e) => setNewCellForm({...newCellForm, initial_responsible_id: e.target.value})}
                                                            style={{ ...styles.input, backgroundColor: '#FFFFFF', fontSize: '0.8rem' }}
                                                        >
                                                            <option value="">-- Sin responsable inicial asignado --</option>
                                                            {staffUsers.map(u => (
                                                                <option key={u.id} value={u.id}>
                                                                    {u.name} · [{u.role || 'Colaborador'}]
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <span style={{ fontSize: '0.66rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                                                            Solo se pueden asignar colaboradores registrados en la planilla oficial de Talento Humano (/admin/hr).
                                                        </span>
                                                    </div>

                                                    <div>
                                                        <label style={styles.label}>Descripción Operativa</label>
                                                        <textarea 
                                                            placeholder="Indique las responsabilidades de alistamiento e inventario para esta célula..."
                                                            value={newCellForm.description}
                                                            onChange={(e) => setNewCellForm({...newCellForm, description: e.target.value})}
                                                            rows={2}
                                                            style={{
                                                                ...styles.input,
                                                                resize: 'vertical',
                                                                fontFamily: 'inherit'
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Modal Footer */}
                                                <div style={{
                                                    padding: '1rem 1.5rem',
                                                    backgroundColor: '#F8FAFC',
                                                    borderTop: '1px solid #E2E8F0',
                                                    display: 'flex',
                                                    justifyContent: 'flex-end',
                                                    gap: '0.75rem'
                                                }}>
                                                    <button
                                                        onClick={() => setIsNewCellModalOpen(false)}
                                                        disabled={isSavingCell}
                                                        style={{
                                                            padding: '0.6rem 1.15rem',
                                                            borderRadius: '8px',
                                                            border: '1px solid #CBD5E1',
                                                            backgroundColor: '#FFFFFF',
                                                            color: '#475569',
                                                            fontWeight: '700',
                                                            fontSize: '0.82rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        onClick={handleCreateNewCell}
                                                        disabled={isSavingCell || !newCellForm.name.trim() || !newCellForm.inventory_group.trim()}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            padding: '0.6rem 1.25rem',
                                                            borderRadius: '8px',
                                                            border: 'none',
                                                            backgroundColor: '#0D7A57',
                                                            color: '#FFFFFF',
                                                            fontWeight: '700',
                                                            fontSize: '0.82rem',
                                                            cursor: isSavingCell ? 'wait' : 'pointer',
                                                            opacity: (!newCellForm.name.trim() || !newCellForm.inventory_group.trim()) ? 0.6 : 1,
                                                            boxShadow: '0 2px 8px rgba(13, 122, 87, 0.25)'
                                                        }}
                                                    >
                                                        {isSavingCell ? (
                                                            <>
                                                                <RefreshCw size={14} className="animate-spin" />
                                                                <span>Creando en BD...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Check size={15} strokeWidth={2.5} />
                                                                <span>Crear y Guardar Célula</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
                {activeTab === 'stock' && (
                    <div style={{ 
                        padding: '1.5rem 2.5rem', 
                        borderTop: `1px solid ${THEME.colors.border}`, 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        backgroundColor: '#F4F7F6' 
                    }}>
                        <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                            Página <span style={{ color: THEME.colors.textMain, fontWeight: '700' }}>{formatNumber(currentPage, 0)}</span> de <span style={{ color: THEME.colors.textMain, fontWeight: '700' }}>{formatNumber(totalPages || 1, 0)}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <button 
                                disabled={currentPage === 1} 
                                onClick={() => setCurrentPage(p => p - 1)} 
                                style={{ 
                                    padding: '0.5rem 1.1rem', 
                                    borderRadius: '8px', 
                                    border: `1px solid ${currentPage === 1 ? '#E2E8F0' : THEME.colors.border}`, 
                                    backgroundColor: currentPage === 1 ? 'transparent' : '#FFFFFF', 
                                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer', 
                                    fontWeight: '600', 
                                    fontSize: '0.8rem',
                                    color: currentPage === 1 ? '#A0AEC0' : THEME.colors.textMain, 
                                    transition: 'all 0.2s',
                                    boxShadow: currentPage === 1 ? 'none' : THEME.shadow.sm
                                }}
                                onMouseEnter={(e) => {
                                    if (currentPage !== 1) e.currentTarget.style.borderColor = THEME.colors.primary;
                                }}
                                onMouseLeave={(e) => {
                                    if (currentPage !== 1) e.currentTarget.style.borderColor = THEME.colors.border;
                                }}
                            >
                                Anterior
                            </button>
                            <button 
                                disabled={currentPage === totalPages || totalPages === 0} 
                                onClick={() => setCurrentPage(p => p + 1)} 
                                style={{ 
                                    padding: '0.5rem 1.1rem', 
                                    borderRadius: '8px', 
                                    border: `1px solid ${(currentPage === totalPages || totalPages === 0) ? '#E2E8F0' : THEME.colors.border}`, 
                                    backgroundColor: (currentPage === totalPages || totalPages === 0) ? 'transparent' : '#FFFFFF', 
                                    cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer', 
                                    fontWeight: '600', 
                                    fontSize: '0.8rem',
                                    color: (currentPage === totalPages || totalPages === 0) ? '#A0AEC0' : THEME.colors.textMain, 
                                    transition: 'all 0.2s',
                                    boxShadow: (currentPage === totalPages || totalPages === 0) ? 'none' : THEME.shadow.sm
                                }}
                                onMouseEnter={(e) => {
                                    if (currentPage !== totalPages && totalPages !== 0) e.currentTarget.style.borderColor = THEME.colors.primary;
                                }}
                                onMouseLeave={(e) => {
                                    if (currentPage !== totalPages && totalPages !== 0) e.currentTarget.style.borderColor = THEME.colors.border;
                                }}
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
                    </>
                )}
            </div>

            {/* Adjustment Modal */}
            {isMovementModalOpen && selectedProduct && (
                <div style={{ 
                    position: 'fixed', 
                    inset: 0, 
                    backgroundColor: 'rgba(11, 15, 25, 0.4)', 
                    backdropFilter: 'blur(8px)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    zIndex: 1000, 
                    padding: '1rem' 
                }}>
                    <div style={{ 
                        backgroundColor: THEME.colors.surface, 
                        borderRadius: '16px', 
                        width: '100%', 
                        maxWidth: '460px', 
                        padding: '2rem', 
                        boxShadow: THEME.shadow.xl,
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        <h2 style={{ margin: 0, fontWeight: '800', fontSize: '1.4rem', color: THEME.colors.textMain, letterSpacing: '-0.02em' }}>Ajuste de Inventario</h2>
                        <p style={{ color: THEME.colors.textSecondary, marginBottom: '1.5rem', fontSize: '0.85rem', fontWeight: '500', marginTop: '0.25rem' }}>{selectedProduct.name}</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                            <div>
                                <label style={styles.label}>TIPO DE MOVIMIENTO</label>
                                <select id="adj_type" style={{ ...styles.input, fontWeight: '500', fontSize: '0.85rem', padding: '0.55rem' }}>
                                    <option value="adjustment">Ajuste Manual (Inventario físico)</option>
                                    <option value="entry">Entrada por Devolución/Compra</option>
                                    <option value="exit">Salida por Merma/Daño</option>
                                </select>
                            </div>
 
                            <div>
                                <label style={styles.label}>ESTADO DESTINO</label>
                                <select id="adj_status" style={{ ...styles.input, fontWeight: '500', fontSize: '0.85rem', padding: '0.55rem' }}>
                                    <option value="available">Disponible para venta</option>
                                    <option value="returned">En camión (Devuelto)</option>
                                    <option value="in_process">En Reproceso</option>
                                </select>
                            </div>
 
                            <div>
                                <label style={styles.label}>CANTIDAD</label>
                                <input id="adj_qty" type="number" placeholder="0,00" style={{ ...styles.input, fontWeight: '600', fontSize: '0.85rem', padding: '0.55rem' }} />
                            </div>
 
                            <div>
                                <label style={styles.label}>MOTIVO / OBSERVACIONES</label>
                                <textarea id="adj_notes" placeholder="Describa el motivo del ajuste..." style={{ ...styles.input, fontWeight: '500', fontSize: '0.85rem', padding: '0.55rem', minHeight: '80px', resize: 'none' }} />
                            </div>
                        </div>
 
                        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '2rem' }}>
                            <button 
                                onClick={() => setIsMovementModalOpen(false)} 
                                style={{ 
                                    flex: 1, 
                                    padding: '0.65rem', 
                                    borderRadius: '8px', 
                                    border: `1.5px solid ${THEME.colors.border}`, 
                                    background: 'white', 
                                    fontWeight: '700', 
                                    fontSize: '0.85rem',
                                    color: THEME.colors.textSecondary,
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#F4F7F6';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'white';
                                }}
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={() => {
                                    const qtyInput = document.getElementById('adj_qty') as HTMLInputElement;
                                    const typeSelect = document.getElementById('adj_type') as HTMLSelectElement;
                                    const statusSelect = document.getElementById('adj_status') as HTMLSelectElement;
                                    const notesText = document.getElementById('adj_notes') as HTMLTextAreaElement;
                                    
                                    const qty = parseFloat(qtyInput.value);
                                    const type = typeSelect.value as 'entry' | 'exit' | 'adjustment';
                                    const status = statusSelect.value;
                                    const notes = notesText.value;
                                    
                                    if(qty) handleApplyMovement(selectedProduct.id, qty, type, status, notes);
                                    else alert('Por favor ingrese una cantidad válida');
                                }}
                                style={{ 
                                    flex: 1.5, 
                                    padding: '0.65rem', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: THEME.colors.primary, 
                                    color: 'white', 
                                    fontWeight: '700', 
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                Guardar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </main>
    );
}

function HierarchyKPICard({ stats }: { stats: { parentsCount: number; childrenCount: number; standaloneCount: number; totalProducts: number } }) {
    const total = stats.totalProducts || 1;
    const parentsPct = ((stats.parentsCount / total) * 100);
    const childrenPct = ((stats.childrenCount / total) * 100);
    const standalonePct = Math.max(0, 100 - parentsPct - childrenPct);

    return (
        <div style={{ 
            backgroundColor: THEME.colors.surface, 
            padding: '0.75rem 1rem', 
            borderRadius: '12px', 
            border: `1px solid #E5E7EB`,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.25rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden'
        }} onMouseEnter={(e) => { 
            e.currentTarget.style.transform = 'translateY(-1px)'; 
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)';
        }} onMouseLeave={(e) => { 
            e.currentTarget.style.transform = 'translateY(0)'; 
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ 
                    color: THEME.colors.textSecondary, 
                    fontSize: '0.65rem', 
                    fontWeight: '700', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em' 
                }}>Distribución Padre - Hijo</span>
                <span style={{ 
                    padding: '0.25rem', 
                    borderRadius: '50%', 
                    backgroundColor: '#EEF2FF',
                    color: '#4F46E5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px'
                }}>
                    <Layers size={18} strokeWidth={1.5} />
                </span>
            </div>

            <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.55rem', marginTop: '0.1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.02em' }}>
                            {stats.parentsCount}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#4F46E5' }}>
                            Padres
                        </span>
                    </div>

                    <span style={{ color: '#CBD5E1', fontWeight: '300', fontSize: '1rem', lineHeight: 1 }}>/</span>

                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.25rem' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.02em' }}>
                            {stats.childrenCount}
                        </span>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>
                            Hijos
                        </span>
                    </div>
                </div>

                {/* Micro barra proporcional jerárquica */}
                <div 
                    title={`Padres: ${stats.parentsCount} (${parentsPct.toFixed(1)}%) | Hijos: ${stats.childrenCount} (${childrenPct.toFixed(1)}%) | Standalone: ${stats.standaloneCount} (${standalonePct.toFixed(1)}%)`}
                    style={{ 
                        display: 'flex', 
                        height: '4px', 
                        width: '100%', 
                        borderRadius: '999px', 
                        overflow: 'hidden', 
                        marginTop: '0.35rem', 
                        marginBottom: '0.15rem',
                        backgroundColor: '#F1F5F9',
                        gap: '1px'
                    }}
                >
                    <div style={{ width: `${parentsPct}%`, backgroundColor: '#4F46E5' }} />
                    <div style={{ width: `${childrenPct}%`, backgroundColor: '#10B981' }} />
                    <div style={{ width: `${standalonePct}%`, backgroundColor: '#94A3B8' }} />
                </div>
            </div>

            <div style={{ 
                fontSize: '0.7rem', 
                color: THEME.colors.textSecondary, 
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
            }}>
                <span style={{ color: '#4F46E5', fontWeight: '700' }}>•</span> 
                <span><strong>{stats.standaloneCount}</strong> únicos</span>
                <span style={{ color: '#CBD5E1' }}>•</span>
                <span>{stats.totalProducts} catálogo</span>
            </div>
        </div>
    );
}

function KPICard({ title, value, color, subtitle }: { title: string, value: string | number, color: string, subtitle: string }) {
    let badgeColor = THEME.colors.primary;
    let badgeBg = THEME.colors.primaryLight;
    let IconComponent = Package;

    if (title.toLowerCase().includes("alerta")) {
        badgeColor = "#DC2626";
        badgeBg = "#FEE2E2";
        IconComponent = AlertTriangle;
    } else if (title.toLowerCase().includes("valor")) {
        badgeColor = "#059669";
        badgeBg = "#ECFDF5";
        IconComponent = Scale;
    } else if (title.toLowerCase().includes("tarea")) {
        badgeColor = "#D97706";
        badgeBg = "#FEF3C7";
        IconComponent = History;
    } else {
        badgeColor = "#2563EB";
        badgeBg = "#EFF6FF";
        IconComponent = Package;
    }

    return (
        <div style={{ 
            backgroundColor: THEME.colors.surface, 
            padding: '0.75rem 1rem', 
            borderRadius: '12px', 
            border: `1px solid #E5E7EB`,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden'
        }} onMouseEnter={(e) => { 
            e.currentTarget.style.transform = 'translateY(-1px)'; 
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.06)';
        }} onMouseLeave={(e) => { 
            e.currentTarget.style.transform = 'translateY(0)'; 
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04)';
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ 
                    color: THEME.colors.textSecondary, 
                    fontSize: '0.65rem', 
                    fontWeight: '700', 
                    textTransform: 'uppercase', 
                    letterSpacing: '0.05em' 
                }}>{title}</span>
                <span style={{ 
                    padding: '0.25rem', 
                    borderRadius: '50%', 
                    backgroundColor: badgeBg,
                    color: badgeColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px'
                }}>
                    <IconComponent size={18} strokeWidth={1.5} />
                </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.15rem' }}>
                <span style={{ 
                    fontSize: '1.3rem', 
                    fontWeight: '700', 
                    color: THEME.colors.textMain,
                    letterSpacing: '-0.02em'
                }}>{value}</span>
            </div>
            <div style={{ 
                fontSize: '0.7rem', 
                color: THEME.colors.textSecondary, 
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
            }}>
                <span style={{ color: badgeColor, fontWeight: '700' }}>•</span> {subtitle}
            </div>
        </div>
    );
}

function TabButton({ 
    active, 
    onClick, 
    label, 
    icon,
    badge
}: { 
    active: boolean; 
    onClick: () => void; 
    label: string; 
    icon?: React.ReactNode;
    badge?: string | number;
}) {
    return (
        <button 
            type="button"
            onClick={onClick}
            style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '0.45rem',
                padding: '0.55rem 1.05rem', 
                borderRadius: '9px', 
                border: 'none', 
                backgroundColor: active ? '#0D7A57' : 'transparent', 
                color: active ? '#FFFFFF' : '#475569', 
                fontWeight: active ? '700' : '600', 
                cursor: 'pointer', 
                transition: 'all 0.15s ease-in-out',
                fontSize: '0.82rem',
                whiteSpace: 'nowrap',
                boxShadow: active ? '0 3px 8px rgba(13, 122, 87, 0.25)' : 'none'
            }}
            onMouseEnter={(e) => { 
                if(!active) {
                    e.currentTarget.style.backgroundColor = '#E2E8F0'; 
                    e.currentTarget.style.color = '#0F172A';
                }
            }}
            onMouseLeave={(e) => { 
                if(!active) {
                    e.currentTarget.style.backgroundColor = 'transparent'; 
                    e.currentTarget.style.color = '#475569';
                }
            }}
        >
            {icon && <span style={{ display: 'flex', alignItems: 'center', opacity: active ? 1 : 0.75 }}>{icon}</span>}
            <span>{label}</span>
            {badge !== undefined && badge !== null && badge !== 0 && (
                <span style={{
                    fontSize: '0.68rem',
                    padding: '1px 6px',
                    borderRadius: '10px',
                    fontWeight: '800',
                    backgroundColor: active ? 'rgba(255, 255, 255, 0.25)' : '#E2E8F0',
                    color: active ? '#FFFFFF' : '#334155'
                }}>
                    {badge}
                </span>
            )}
        </button>
    );
}
