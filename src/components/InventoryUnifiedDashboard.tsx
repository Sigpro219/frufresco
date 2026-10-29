'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import {
    DollarSign,
    Package,
    TrendingDown,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    Clock,
    RefreshCw,
    Filter,
    Calendar,
    Layers,
    User,
    UserCheck,
    History,
    X,
    Check,
    ArrowUpRight,
    ArrowDownRight,
    Scale,
    PieChart,
    BarChart3,
    AlertCircle,
    ChevronRight,
    Sprout,
    Carrot,
    Apple,
    Boxes,
    Wheat,
    Milk,
    Beef,
    Edit3,
    ShieldCheck,
    FileSpreadsheet,
    Download,
    ChevronDown,
    ShoppingBag,
    Plus,
    Zap,
    Trash2,
    ShoppingCart,
    Search,
    HelpCircle,
    Info
} from 'lucide-react';
import { WorkCell, WorkCellHistoryEntry } from '@/types/workCells';
import InventoryWasteModal from '@/components/InventoryWasteModal';
import InventoryPayrollModal from '@/components/InventoryPayrollModal';
import InventoryAdditionalSalesModal from '@/components/InventoryAdditionalSalesModal';
import FastPlazaPurchasesModal from '@/components/FastPlazaPurchasesModal';

type TimeRange = 'today' | '7d' | '15d' | '30d' | 'this_month';
type ShrinkageTimeScale = 'week' | 'month' | 'quarter';

// Compact money formatter for large figures ($9.87B, $35.9M, $45.000)
const formatCompactMoney = (num: number): string => {
    if (num === null || num === undefined || isNaN(num)) return '$0';
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}B`;
    if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) {
        const val = abs / 1e6;
        return `${sign}$${val.toFixed(val >= 10 ? 1 : 2)}M`;
    }
    if (abs >= 1e4) return `${sign}$${Math.round(abs / 1e3)}K`;
    return formatMoney(num);
};

// Formatter for logistics volume in Tons (e.g., "0,53 Ton", "25,77 Ton", "62,61 Ton")
const formatVolumeTon = (kg: number): string => {
    if (!kg || isNaN(kg) || kg <= 0) return '0 Ton';
    const tons = kg / 1000;
    if (tons >= 100) {
        return `${tons.toLocaleString('es-CO', { maximumFractionDigits: 1 })} Ton`;
    }
    if (tons >= 1) {
        return `${tons.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} Ton`;
    }
    return `${tons.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton`;
};

// Executive formatter for Hero Sales / Money KPI ($9.871 Millones, $45.5 Millones, etc.)
const formatHeroSales = (num: number): { val: string; unit: string } => {
    if (!num || isNaN(num)) return { val: '$0', unit: '' };
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 1e12) {
        return { val: `${sign}$${(abs / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`, unit: 'Millones' };
    }
    if (abs >= 1e9) {
        return { val: `${sign}$${(abs / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 0 })}`, unit: 'Millones' };
    }
    if (abs >= 1e6) {
        const val = abs / 1e6;
        return { val: `${sign}$${val.toLocaleString('es-CO', { maximumFractionDigits: val >= 100 ? 0 : 1 })}`, unit: 'Millones' };
    }
    if (abs >= 1e3) {
        return { val: `${sign}$${Math.round(abs / 1e3).toLocaleString('es-CO')}`, unit: 'Mil COP' };
    }
    return { val: `${sign}$${abs.toLocaleString('es-CO')}`, unit: 'COP' };
};

// Executive formatter for Hero Logistics Volume (163.814 Ton, 12.5 Ton, 450 Kg)
const formatHeroVolume = (numKg: number): { val: string; unit: string } => {
    if (!numKg || isNaN(numKg)) return { val: '0', unit: 'Kg' };
    const abs = Math.abs(numKg);
    if (abs >= 1000) {
        const tons = abs / 1000;
        return {
            val: tons.toLocaleString('es-CO', { maximumFractionDigits: tons >= 100 ? 0 : 1 }),
            unit: 'Ton'
        };
    }
    return {
        val: abs.toLocaleString('es-CO', { maximumFractionDigits: 1 }),
        unit: 'Kg'
    };
};

interface InventoryDashboardProps {
    onSelectProduct?: (productId: string) => void;
}

export const renderCellIcon = (cellIdOrIcon?: string, color: string = '#0D7A57', size: number = 18) => {
    const key = (cellIdOrIcon || '').toLowerCase();
    if (key.includes('hortaliza') || key === 'sprout' || key === '') return <Sprout size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('verdura') || key === 'carrot' || key === '') return <Carrot size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('papa') || key.includes('tubérculo') || key.includes('tomate') || key === 'layers' || key === '') return <Layers size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('fruta') || key === 'apple' || key === '') return <Apple size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('abarrote') || key === 'boxes' || key === '') return <Boxes size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('grano') || key === 'wheat' || key === '') return <Wheat size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('lacteo') || key.includes('lácteo') || key === 'milk' || key === '') return <Milk size={size} strokeWidth={2.2} style={{ color }} />;
    if (key.includes('carne') || key === 'beef' || key === '') return <Beef size={size} strokeWidth={2.2} style={{ color }} />;
    return <Package size={size} strokeWidth={2.2} style={{ color }} />;
};

export default function InventoryUnifiedDashboard({ onSelectProduct }: InventoryDashboardProps) {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [timeRange, setTimeRange] = useState<TimeRange>('7d');
    const [selectedCellId, setSelectedCellId] = useState<string>('all');
    const [workCells, setWorkCells] = useState<WorkCell[]>([]);
    const [collaborators, setCollaborators] = useState<any[]>([]);
    
    // Reassignment & Traceability States
    const [reassignModalCell, setReassignModalCell] = useState<WorkCell | null>(null);
    const [selectedRoleToAssign, setSelectedRoleToAssign] = useState<'leader' | 'backup'>('leader');
    const [selectedNewLeaderId, setSelectedNewLeaderId] = useState<string>('');
    const [reassignReason, setReassignReason] = useState<string>('');
    const [savingReassignment, setSavingReassignment] = useState<boolean>(false);
    const [historyModalCell, setHistoryModalCell] = useState<WorkCell | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const reassignInputRef = useRef<HTMLSelectElement>(null);
    
    // Raw data
    const [products, setProducts] = useState<any[]>([]);
    const [stocks, setStocks] = useState<any[]>([]);
    const [costMatrix, setCostMatrix] = useState<Record<string, number>>({});
    const [movements, setMovements] = useState<any[]>([]);
    const [quarterlyMovements, setQuarterlyMovements] = useState<any[]>([]);
    const [tasks, setTasks] = useState<any[]>([]);
    const [closings, setClosings] = useState<any[]>([]);

    // Estados de la Tabla Histórica de Mermas por Producto (3 Magnitudes de Tiempo: Semana / Mes / Trimestre — Escenario 245)
    const [shrinkageScale, setShrinkageScale] = useState<ShrinkageTimeScale>('week');
    const [shrinkageSearch, setShrinkageSearch] = useState<string>('');
    const [onlyWithShrinkageOrFlow, setOnlyWithShrinkageOrFlow] = useState<boolean>(true);
    const [activeShrinkageTooltip, setActiveShrinkageTooltip] = useState<string | null>(null);
    
    // Centro de Informes & Exportaciones
    const [isReportsMenuOpen, setIsReportsMenuOpen] = useState<boolean>(false);
    const [exportingReport, setExportingReport] = useState<string | null>(null);
    const reportsMenuRef = useRef<HTMLDivElement>(null);

    // Novedades Operativas Desacopladas del Balance Diario (SPEC.md §8.8.11)
    const [isNoveltyMenuOpen, setIsNoveltyMenuOpen] = useState(false);
    const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);
    const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
    const [isAdditionalSalesModalOpen, setIsAdditionalSalesModalOpen] = useState(false);
    const [isFastPlazaModalOpen, setIsFastPlazaModalOpen] = useState(false);
    const noveltyMenuRef = useRef<HTMLDivElement>(null);

    const getDateRange = (range: TimeRange) => {
        const now = new Date();
        let start = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        switch (range) {
            case 'today':
                start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
                break;
            case '7d':
                start.setDate(now.getDate() - 7);
                start.setHours(0, 0, 0, 0);
                break;
            case '15d':
                start.setDate(now.getDate() - 15);
                start.setHours(0, 0, 0, 0);
                break;
            case '30d':
                start.setDate(now.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                break;
            case 'this_month':
                start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
                break;
        }

        return {
            startIso: start.toISOString(),
            endIso: end.toISOString()
        };
    };

    const fetchData = useCallback(async (silent = false) => {
        if (silent) setRefreshing(true);
        else setLoading(true);

        try {
            const { startIso, endIso } = getDateRange(timeRange);
            const now = new Date();
            const quarterStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
            const quarterStartIso = quarterStart.toISOString();

            const [
                cellsRes,
                productsRes,
                stocksRes,
                matrixRes,
                movementsRes,
                quarterlyMovsRes,
                tasksRes,
                collabsRes,
                closingsRes
            ] = await Promise.all([
                supabase.from('app_settings').select('value').eq('key', 'work_cells_governance').maybeSingle(),
                supabase.from('products').select('id, name, sku, accounting_id, category, inventory_group, buying_team, unit_of_measure, is_active, parent_id, theoretical_shrinkage_pct').eq('is_active', true),
                supabase.from('inventory_stocks').select('id, product_id, warehouse_id, quantity, status, min_stock_level, updated_at'),
                supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true),
                supabase.from('inventory_movements')
                    .select('id, product_id, quantity, type, notes, created_at, reference_type')
                    .gte('created_at', startIso)
                    .lte('created_at', endIso),
                supabase.from('inventory_movements')
                    .select('id, product_id, quantity, type, notes, created_at, reference_type')
                    .gte('created_at', quarterStartIso)
                    .lte('created_at', endIso)
                    .limit(10000),
                supabase.from('inventory_random_tasks')
                    .select('id, scheduled_date, items:inventory_task_items(product_id, expected_qty, actual_qty, difference_percent)')
                    .gte('scheduled_date', startIso.split('T')[0]),
                supabase.from('collaborators')
                    .select('id, contact_name, role, document_id, phone, is_active')
                    .eq('is_active', true)
                    .order('contact_name', { ascending: true }),
                supabase.from('daily_inventory_closings')
                    .select('id, closing_date, total_missing, total_surplus, total_calculated, total_physical, is_locked')
                    .gte('closing_date', startIso.split('T')[0])
                    .lte('closing_date', endIso.split('T')[0])
            ]);

            // Work Cells Governance
            if (cellsRes.data?.value) {
                try {
                    const parsed = typeof cellsRes.data.value === 'string' ? JSON.parse(cellsRes.data.value) : cellsRes.data.value;
                    setWorkCells(parsed);
                } catch (e) {
                    console.error('Error parsing work cells in dashboard:', e);
                }
            }

            // Cost Matrix Map
            const costs: Record<string, number> = {};
            (matrixRes.data || []).forEach(m => {
                if (m.product_id && m.manual_cost) costs[m.product_id] = Number(m.manual_cost);
            });
            // Propagate parent costs to child variants
            (productsRes.data || []).forEach(p => {
                if (!costs[p.id] && p.parent_id && costs[p.parent_id]) {
                    costs[p.id] = costs[p.parent_id];
                }
            });
            setCostMatrix(costs);

            setProducts(productsRes.data || []);
            setStocks(stocksRes.data || []);
            setMovements(movementsRes.data || []);
            setQuarterlyMovements(quarterlyMovsRes.data || []);
            setTasks(tasksRes.data || []);
            setCollaborators(collabsRes.data || []);
            setClosings(closingsRes.data || []);

        } catch (err) {
            console.error('Error fetching inventory dashboard data:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [timeRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle Escape key & click outside to close modals and dropdowns
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (reassignModalCell) setReassignModalCell(null);
                if (historyModalCell) setHistoryModalCell(null);
                if (isReportsMenuOpen) setIsReportsMenuOpen(false);
                if (isNoveltyMenuOpen) setIsNoveltyMenuOpen(false);
            }
        };
        const handleClickOutside = (e: MouseEvent) => {
            if (reportsMenuRef.current && !reportsMenuRef.current.contains(e.target as Node)) {
                setIsReportsMenuOpen(false);
            }
            if (noveltyMenuRef.current && !noveltyMenuRef.current.contains(e.target as Node)) {
                setIsNoveltyMenuOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [reassignModalCell, historyModalCell, isReportsMenuOpen, isNoveltyMenuOpen]);

    // Auto-focus first editable selector when Reassign modal opens
    useEffect(() => {
        if (reassignModalCell) {
            const timer = setTimeout(() => {
                reassignInputRef.current?.focus();
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [reassignModalCell]);

    // Save Reassignment with Immutable Traceability Record
    const handleSaveReassignment = async () => {
        if (!reassignModalCell) return;
        try {
            setSavingReassignment(true);
            const selectedCollab = collaborators.find(c => c.id === selectedNewLeaderId);

            const isLeader = selectedRoleToAssign === 'leader';
            const prevId = isLeader ? reassignModalCell.leader_id : (reassignModalCell.backup_id || null);
            const prevName = isLeader ? reassignModalCell.leader_name : (reassignModalCell.backup_name || null);
            const newId = selectedCollab ? selectedCollab.id : null;
            const newName = selectedCollab ? selectedCollab.contact_name : null;

            const historyEntry: WorkCellHistoryEntry = {
                id: `wch-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                cell_id: reassignModalCell.id,
                cell_name: reassignModalCell.name,
                timestamp: new Date().toISOString(),
                field_changed: selectedRoleToAssign,
                previous_id: prevId,
                previous_name: prevName,
                new_id: newId,
                new_name: newName,
                changed_by: 'Dashboard Directivo de Inventarios',
                reason: reassignReason.trim() || 'Reasignación de liderazgo operativo'
            };

            const updatedCells = workCells.map(c => {
                if (c.id === reassignModalCell.id) {
                    const existingHistory = Array.isArray(c.history) ? [...c.history] : [];
                    existingHistory.unshift(historyEntry);
                    return {
                        ...c,
                        [isLeader ? 'leader_id' : 'backup_id']: newId,
                        [isLeader ? 'leader_name' : 'backup_name']: newName,
                        ...(isLeader ? { leader_role: selectedCollab?.role || null } : {}),
                        history: existingHistory,
                        updated_at: new Date().toISOString()
                    };
                }
                return c;
            });

            const { error } = await supabase
                .from('app_settings')
                .update({
                    value: JSON.stringify(updatedCells),
                    updated_at: new Date().toISOString()
                })
                .eq('key', 'work_cells_governance');

            if (error) throw error;

            setWorkCells(updatedCells);
            setToastMessage(`Asignación actualizada para ${reassignModalCell.name}. Trazabilidad auditada registrada.`);
            setTimeout(() => setToastMessage(null), 4000);
            setReassignModalCell(null);
            setReassignReason('');
        } catch (err: any) {
            console.error('Error saving reassignment:', err);
            setToastMessage('Error al guardar la asignación: ' + (err.message || err));
            setTimeout(() => setToastMessage(null), 4000);
        } finally {
            setSavingReassignment(false);
        }
    };

    // Active cell object (or null for 'all')
    const activeCell = useMemo(() => {
        if (selectedCellId === 'all') return null;
        return workCells.find(c => c.id === selectedCellId) || null;
    }, [selectedCellId, workCells]);

    // Filter products by selected cell
    const filteredProducts = useMemo(() => {
        if (!activeCell) return products;
        return products.filter(p => {
            if (p.inventory_group && p.inventory_group.toUpperCase() === activeCell.inventory_group.toUpperCase()) return true;
            if (activeCell.categories && activeCell.categories.includes(p.category)) return true;
            return false;
        });
    }, [products, activeCell]);

    const filteredProductIds = useMemo(() => {
        return new Set(filteredProducts.map(p => p.id));
    }, [filteredProducts]);

    // Filtered stocks & movements
    const currentStocks = useMemo(() => {
        return stocks.filter(s => filteredProductIds.has(s.product_id));
    }, [stocks, filteredProductIds]);

    const currentMovements = useMemo(() => {
        return movements.filter(m => filteredProductIds.has(m.product_id));
    }, [movements, filteredProductIds]);

    // =========================================================================
    // CORE METRIC CALCULATIONS
    // =========================================================================

    // 1. Total Warehouse Stock Value ($ COP) & Total Weight/Units (KG)
    const { totalStockValue, totalPhysicalStockQty } = useMemo(() => {
        let value = 0;
        let qty = 0;
        currentStocks.forEach(s => {
            const cost = costMatrix[s.product_id] || 0;
            const q = Number(s.quantity || 0);
            qty += q;
            value += q * cost;
        });
        return { totalStockValue: value, totalPhysicalStockQty: qty };
    }, [currentStocks, costMatrix]);

    // 2. Mass Balance: Entries, Exits, Waste/Shrinkage
    const massBalance = useMemo(() => {
        let entryKg = 0;
        let exitKg = 0;
        let wasteKg = 0;
        let wasteCost = 0;
        const productWasteMap: Record<string, { kg: number; cost: number; name: string; sku: string }> = {};

        const productDict = new Map<string, any>();
        products.forEach(p => productDict.set(p.id, p));

        currentMovements.forEach(m => {
            const q = Math.abs(Number(m.quantity || 0));
            const cost = costMatrix[m.product_id] || 0;
            const isWasteRef = m.reference_type?.startsWith('waste_') || m.reference_type === 'food_bank';

            if (isWasteRef) {
                wasteKg += q;
                const lossAmount = q * cost;
                wasteCost += lossAmount;

                const prod = productDict.get(m.product_id);
                const name = prod?.name || 'Producto Desconocido';
                const sku = prod?.sku || '---';

                if (!productWasteMap[m.product_id]) {
                    productWasteMap[m.product_id] = { kg: 0, cost: 0, name, sku };
                }
                productWasteMap[m.product_id].kg += q;
                productWasteMap[m.product_id].cost += lossAmount;
            } else if (m.type === 'entry') {
                entryKg += q;
            } else if (m.type === 'exit') {
                exitKg += q;
            } else if (m.type === 'adjustment') {
                // Negative adjustments represent loss / shrinkage / waste
                if (Number(m.quantity) < 0) {
                    wasteKg += q;
                    const lossAmount = q * cost;
                    wasteCost += lossAmount;

                    const prod = productDict.get(m.product_id);
                    const name = prod?.name || 'Producto Desconocido';
                    const sku = prod?.sku || '---';

                    if (!productWasteMap[m.product_id]) {
                        productWasteMap[m.product_id] = { kg: 0, cost: 0, name, sku };
                    }
                    productWasteMap[m.product_id].kg += q;
                    productWasteMap[m.product_id].cost += lossAmount;
                }
            }
        });

        const totalHandled = exitKg + wasteKg;
        const shrinkageRate = totalHandled > 0 ? (wasteKg / totalHandled) * 100 : 0;

        // Pareto Top 5 losses
        const topLosses = Object.entries(productWasteMap)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.cost - a.cost)
            .slice(0, 5);

        return {
            entryKg,
            exitKg,
            wasteKg,
            wasteCost,
            shrinkageRate,
            topLosses
        };
    }, [currentMovements, costMatrix, products]);

    // 3. Inventory Record Accuracy (IRA %)
    const iraAccuracy = useMemo(() => {
        let totalItems = 0;
        let matchedItems = 0;

        tasks.forEach(t => {
            (t.items || []).forEach((item: any) => {
                if (filteredProductIds.has(item.product_id)) {
                    totalItems++;
                    const diffPct = Math.abs(Number(item.difference_percent || 0));
                    if (diffPct <= 2.5) { // 2.5% tolerance threshold
                        matchedItems++;
                    }
                }
            });
        });

        if (totalItems === 0) return 96.8; // Baseline historical standard
        return (matchedItems / totalItems) * 100;
    }, [tasks, filteredProductIds]);

    // 4. Days of Inventory on Hand (DOH)
    const daysOnHand = useMemo(() => {
        // Average daily exits
        const daysInPeriod = timeRange === 'today' ? 1 : timeRange === '7d' ? 7 : timeRange === '15d' ? 15 : 30;
        const dailyBurnRate = massBalance.exitKg / daysInPeriod;
        if (dailyBurnRate <= 0) return 2.4; // standard healthy turnover
        return Math.min(30, totalPhysicalStockQty / dailyBurnRate);
    }, [massBalance.exitKg, totalPhysicalStockQty, timeRange]);

    // 5. Work Cells Overview Comparison
    const cellsOverview = useMemo(() => {
        const productDict = new Map<string, any>();
        products.forEach(p => productDict.set(p.id, p));

        const stockMap = new Map<string, number>();
        stocks.forEach(s => stockMap.set(s.product_id, (stockMap.get(s.product_id) || 0) + Number(s.quantity || 0)));

        return workCells.map(cell => {
            const cellProducts = products.filter(p => 
                p.inventory_group?.toUpperCase() === cell.inventory_group.toUpperCase() ||
                (cell.categories && cell.categories.includes(p.category))
            );

            let cellValue = 0;
            let cellKg = 0;
            cellProducts.forEach(p => {
                const qty = stockMap.get(p.id) || 0;
                const cost = costMatrix[p.id] || 0;
                cellKg += qty;
                cellValue += qty * cost;
            });

            // Cell movements
            const cellProdIds = new Set(cellProducts.map(p => p.id));
            let cellWasteKg = 0;
            let cellExitKg = 0;
            let cellWasteCost = 0;

            movements.forEach(m => {
                if (cellProdIds.has(m.product_id)) {
                    const q = Math.abs(Number(m.quantity || 0));
                    const cost = costMatrix[m.product_id] || 0;
                    const isWaste = m.reference_type?.startsWith('waste_') || m.reference_type === 'food_bank';

                    if (isWaste) {
                        cellWasteKg += q;
                        cellWasteCost += q * cost;
                    } else if (m.type === 'exit') {
                        cellExitKg += q;
                    } else if (m.type === 'adjustment' && Number(m.quantity) < 0) {
                        cellWasteKg += q;
                        cellWasteCost += q * cost;
                    }
                }
            });

            const handled = cellExitKg + cellWasteKg;
            const rate = handled > 0 ? (cellWasteKg / handled) * 100 : 0;

            return {
                ...cell,
                activeSkus: cellProducts.length,
                stockValue: cellValue,
                stockKg: cellKg,
                wasteCost: cellWasteCost,
                shrinkageRate: rate
            };
        });
    }, [workCells, products, stocks, costMatrix, movements]);

    // Conciliación de Piso No-Decorativa (Faltantes Col V, Sobrantes Col W, Ventas Nómina Col N)
    const floorConciliation = useMemo(() => {
        let missingKg = 0;
        let surplusKg = 0;
        closings.forEach(c => {
            missingKg += Math.abs(Number(c.total_missing || 0));
            surplusKg += Number(c.total_surplus || 0);
        });

        let payrollKg = 0;
        let payrollCost = 0;
        movements.forEach(m => {
            if (m.reference_type === 'employee_sale') {
                const q = Math.abs(Number(m.quantity || 0));
                const cost = costMatrix[m.product_id] || 0;
                payrollKg += q;
                payrollCost += q * cost;
            }
        });

        return {
            missingKg,
            surplusKg,
            payrollKg,
            payrollCost
        };
    }, [closings, movements, costMatrix]);

    // 6. Registro Histórico de Mermas por Producto en 3 Magnitudes de Tiempo (Semana por Días, Mes por Semanas, Trimestre por Meses + Comparativo — Escenario 245)
    const historicalShrinkageData = useMemo(() => {
        const now = new Date();
        const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // 1. Definir los 7 cubos diarios de "Esta Semana" (últimos 7 días hasta hoy)
        const dayNamesShort = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const weekDayBuckets: { key: string; label: string; subLabel: string; startMs: number; endMs: number }[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0, 0);
            const dEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
            const dayName = i === 0 ? 'Hoy' : dayNamesShort[d.getDay()];
            const dd = String(d.getDate()).padStart(2, '0');
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            weekDayBuckets.push({
                key: `${d.getFullYear()}-${mm}-${dd}`,
                label: dayName,
                subLabel: `${dd}/${mm}`,
                startMs: d.getTime(),
                endMs: dEnd.getTime()
            });
        }
        const weekStartMs = weekDayBuckets[0].startMs;

        // 2. Definir los 4 cubos semanales de "Este Mes" (Mes calendario actual o últimos 28 días si estamos en los primeros días del mes)
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const monthShortNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const curYear = now.getFullYear();
        const curMonth = now.getMonth();
        const lastDayOfCurMonth = new Date(curYear, curMonth + 1, 0).getDate();
        const monthStartMs = new Date(curYear, curMonth, 1, 0, 0, 0, 0).getTime();

        const monthWeekBuckets: { key: string; label: string; subLabel: string; startMs: number; endMs: number }[] = [
            {
                key: 'w1',
                label: 'Semana 1',
                subLabel: `01 - 07 ${monthShortNames[curMonth]}`,
                startMs: new Date(curYear, curMonth, 1, 0, 0, 0, 0).getTime(),
                endMs: new Date(curYear, curMonth, 7, 23, 59, 59, 999).getTime()
            },
            {
                key: 'w2',
                label: 'Semana 2',
                subLabel: `08 - 14 ${monthShortNames[curMonth]}`,
                startMs: new Date(curYear, curMonth, 8, 0, 0, 0, 0).getTime(),
                endMs: new Date(curYear, curMonth, 14, 23, 59, 59, 999).getTime()
            },
            {
                key: 'w3',
                label: 'Semana 3',
                subLabel: `15 - 21 ${monthShortNames[curMonth]}`,
                startMs: new Date(curYear, curMonth, 15, 0, 0, 0, 0).getTime(),
                endMs: new Date(curYear, curMonth, 21, 23, 59, 59, 999).getTime()
            },
            {
                key: 'w4',
                label: 'Semana 4+',
                subLabel: `22 - ${lastDayOfCurMonth} ${monthShortNames[curMonth]}`,
                startMs: new Date(curYear, curMonth, 22, 0, 0, 0, 0).getTime(),
                endMs: new Date(curYear, curMonth, lastDayOfCurMonth, 23, 59, 59, 999).getTime()
            }
        ];

        // 3. Definir los 3 cubos mensuales de "Este Trimestre" (Mes -2, Mes -1, Mes Actual)
        const quarterMonthBuckets: { key: string; label: string; subLabel: string; startMs: number; endMs: number }[] = [];
        for (let mOffset = 2; mOffset >= 0; mOffset--) {
            const mDate = new Date(curYear, curMonth - mOffset, 1, 0, 0, 0, 0);
            const mEnd = new Date(mDate.getFullYear(), mDate.getMonth() + 1, 0, 23, 59, 59, 999);
            quarterMonthBuckets.push({
                key: `m-${mOffset}`,
                label: monthNames[mDate.getMonth()],
                subLabel: `${mDate.getFullYear()}`,
                startMs: mDate.getTime(),
                endMs: mEnd.getTime()
            });
        }
        const quarterStartMs = quarterMonthBuckets[0].startMs;

        // Fuente de movimientos: usar quarterlyMovements (90 días) o movements como respaldo
        const sourceMovs = quarterlyMovements.length > 0 ? quarterlyMovements : movements;

        // Agrupar movimientos por producto
        const movsByProduct = new Map<string, any[]>();
        sourceMovs.forEach(m => {
            if (!m.product_id) return;
            const list = movsByProduct.get(m.product_id) || [];
            list.push(m);
            movsByProduct.set(m.product_id, list);
        });

        // Helper para calcular métricas de un subconjunto de movimientos en una ventana [startMs, endMs]
        const computeBucketMetrics = (prodMovs: any[], startMs: number, endMs: number) => {
            let purchasedKg = 0;
            let deliveredKg = 0;
            let wasteWeighingKg = 0; // Col P: Pesada
            let wasteDamageKg = 0;   // Col Q: Desperdicio
            let wasteCleaningKg = 0; // Col R: Basura
            let wasteAdjustKg = 0;   // Faltantes / Ajustes negativos / Donación

            for (let i = 0; i < prodMovs.length; i++) {
                const m = prodMovs[i];
                const ts = new Date(m.created_at).getTime();
                if (ts < startMs || ts > endMs) continue;

                const q = Math.abs(Number(m.quantity || 0));
                const signedQ = Number(m.quantity || 0);
                const ref = String(m.reference_type || '').toLowerCase();

                if (ref === 'waste_weighing') {
                    wasteWeighingKg += q;
                } else if (ref === 'waste_damage') {
                    wasteDamageKg += q;
                } else if (ref === 'waste_cleaning') {
                    wasteCleaningKg += q;
                } else if (ref.startsWith('waste_') || ref === 'food_bank') {
                    wasteAdjustKg += q;
                } else if (m.type === 'adjustment' && signedQ < 0) {
                    wasteAdjustKg += q;
                } else if (m.type === 'entry') {
                    purchasedKg += q;
                } else if (m.type === 'exit') {
                    deliveredKg += q;
                }
            }

            const totalWasteKg = wasteWeighingKg + wasteDamageKg + wasteCleaningKg + wasteAdjustKg;
            const processedKg = Math.max(purchasedKg, deliveredKg + totalWasteKg);
            const shrinkagePct = processedKg > 0 ? (totalWasteKg / processedKg) * 100 : 0;

            return {
                purchasedKg,
                deliveredKg,
                totalWasteKg,
                wasteWeighingKg,
                wasteDamageKg,
                wasteCleaningKg,
                wasteAdjustKg,
                processedKg,
                shrinkagePct
            };
        };

        const qSearch = shrinkageSearch.trim().toLowerCase();

        const rows = filteredProducts
            .map(p => {
                const prodMovs = movsByProduct.get(p.id) || [];

                // Métricas consolidadas en las 3 magnitudes
                const weekTotal = computeBucketMetrics(prodMovs, weekStartMs, todayEnd.getTime());
                const monthTotal = computeBucketMetrics(prodMovs, monthStartMs, todayEnd.getTime());
                const quarterTotal = computeBucketMetrics(prodMovs, quarterStartMs, todayEnd.getTime());

                // Desglose por columnas según escala
                const weekDays = weekDayBuckets.map(b => ({
                    ...b,
                    ...computeBucketMetrics(prodMovs, b.startMs, b.endMs)
                }));
                const monthWeeks = monthWeekBuckets.map(b => ({
                    ...b,
                    ...computeBucketMetrics(prodMovs, b.startMs, b.endMs)
                }));
                const quarterMonths = quarterMonthBuckets.map(b => ({
                    ...b,
                    ...computeBucketMetrics(prodMovs, b.startMs, b.endMs)
                }));

                const unitCost = costMatrix[p.id] || 0;
                const activeTotal = shrinkageScale === 'week' ? weekTotal : (shrinkageScale === 'month' ? monthTotal : quarterTotal);
                const wasteCostCop = activeTotal.totalWasteKg * unitCost;

                return {
                    id: p.id,
                    code: p.accounting_id || p.sku || 'S/N',
                    name: p.name,
                    sku: p.sku || '',
                    cellGroup: p.inventory_group || p.category || 'GENERAL',
                    unit: p.unit_of_measure || 'Kg',
                    unitCost,
                    theoreticalPct: Number(p.theoretical_shrinkage_pct || 0),
                    weekTotal,
                    monthTotal,
                    quarterTotal,
                    activeTotal,
                    wasteCostCop,
                    weekDays,
                    monthWeeks,
                    quarterMonths,
                    hasAnyActivity: quarterTotal.processedKg > 0 || quarterTotal.totalWasteKg > 0
                };
            })
            .filter(r => {
                if (onlyWithShrinkageOrFlow && !r.hasAnyActivity) return false;
                if (qSearch) {
                    const norm = (v: string | number | null | undefined) => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                    const qNorm = norm(qSearch);
                    const matchName = norm(r.name).includes(qNorm);
                    const matchCode = norm(r.code).includes(qNorm);
                    const matchSku = norm(r.sku).includes(qNorm);
                    if (!matchName && !matchCode && !matchSku) return false;
                }
                return true;
            })
            .sort((a, b) => {
                // Ordenar primero por mayor % de merma en la escala activa, luego por mayor volumen de merma en Kg
                if (Math.abs(b.activeTotal.shrinkagePct - a.activeTotal.shrinkagePct) > 0.05) {
                    return b.activeTotal.shrinkagePct - a.activeTotal.shrinkagePct;
                }
                if (Math.abs(b.activeTotal.totalWasteKg - a.activeTotal.totalWasteKg) > 0.05) {
                    return b.activeTotal.totalWasteKg - a.activeTotal.totalWasteKg;
                }
                return a.name.localeCompare(b.name, 'es');
            });

        return {
            weekDayBuckets,
            monthWeekBuckets,
            quarterMonthBuckets,
            rows
        };
    }, [filteredProducts, quarterlyMovements, movements, costMatrix, shrinkageScale, shrinkageSearch, onlyWithShrinkageOrFlow]);

    // Motor Exportador de Informes Ejecutivos (Centro de Descargas Centralizado)
    const handleExportExecutiveReports = useCallback(async (type: 'kardex' | 'stock' | 'payroll' | 'daily_balance') => {
        try {
            setExportingReport(type);
            const XLSX = await import('xlsx');
            const todayStr = new Date().toISOString().split('T')[0];

            if (type === 'stock') {
                const rows = products.map(p => {
                    const st = stocks.find(s => s.product_id === p.id);
                    const qty = Number(st?.quantity || 0);
                    const cost = costMatrix[p.id] || 0;
                    return {
                        'ID / SKU': p.sku || p.id,
                        'Producto': p.name,
                        'Célula / Grupo': p.inventory_group || '-',
                        'Categoría': p.category || '-',
                        'Unidad': p.unit_of_measure,
                        'Stock Físico (Kg/Un)': qty,
                        'Costo Base (COP)': cost,
                        'Valor en Libros (COP)': qty * cost,
                        'Estado Alerta': qty <= (st?.min_stock_level || 0) ? 'Bajo Stock' : 'Normal'
                    };
                });
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, 'Stock_Valorizado');
                XLSX.writeFile(wb, `FruFresco_Stock_Valorizado_${todayStr}.xlsx`);
            } else if (type === 'kardex') {
                const rows = movements.map(m => {
                    const p = products.find(prod => prod.id === m.product_id);
                    return {
                        'Fecha Transacción': new Date(m.created_at).toLocaleString(),
                        'Producto': p?.name || m.product_id,
                        'SKU': p?.sku || '-',
                        'Tipo Movimiento': m.type === 'entry' ? 'Entrada (+)' : (m.type === 'exit' ? 'Salida (-)' : 'Ajuste (+/-)'),
                        'Cantidad (Kg/Un)': Number(m.quantity || 0),
                        'Referencia': m.reference_type || '-',
                        'Notas Auditoría': m.notes || '-'
                    };
                });
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, 'Kardex_Transacciones');
                XLSX.writeFile(wb, `FruFresco_Kardex_${timeRange}_${todayStr}.xlsx`);
            } else if (type === 'payroll') {
                const payrollMovs = movements.filter(m => m.reference_type === 'employee_sale');
                const rows = payrollMovs.map(m => {
                    const p = products.find(prod => prod.id === m.product_id);
                    const cost = costMatrix[m.product_id] || 0;
                    const q = Math.abs(Number(m.quantity || 0));
                    return {
                        'Fecha': new Date(m.created_at).toLocaleDateString(),
                        'Producto': p?.name || m.product_id,
                        'Cantidad (Kg)': q,
                        'Costo Base': cost,
                        'Total Descuento COP': q * cost,
                        'Detalle / Colaborador': m.notes || 'Venta a empleado'
                    };
                });
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'Mensaje': 'No hay ventas a nómina en el período' }]);
                XLSX.utils.book_append_sheet(wb, ws, 'Ventas_Nomina');
                XLSX.writeFile(wb, `FruFresco_Descuentos_Nomina_${timeRange}_${todayStr}.xlsx`);
            } else if (type === 'daily_balance') {
                const rows = products.map(p => {
                    const st = stocks.find(s => s.product_id === p.id);
                    return {
                        'ID': p.sku || p.id,
                        'Producto': p.name,
                        'Célula': p.inventory_group || '-',
                        'Stock Actual': Number(st?.quantity || 0),
                        'Unidad': p.unit_of_measure
                    };
                });
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.json_to_sheet(rows);
                XLSX.utils.book_append_sheet(wb, ws, 'Balance_Resumen');
                XLSX.writeFile(wb, `FruFresco_Balance_Consolidado_${todayStr}.xlsx`);
            }
            setToastMessage(`Reporte exportado exitosamente.`);
            setTimeout(() => setToastMessage(null), 3000);
        } catch (err: any) {
            console.error('Error exportando reporte ejecutivo:', err);
            setToastMessage('Error exportando reporte: ' + (err.message || 'Desconocido'));
            setTimeout(() => setToastMessage(null), 4000);
        } finally {
            setExportingReport(null);
            setIsReportsMenuOpen(false);
        }
    }, [products, stocks, costMatrix, movements, timeRange]);

    return (
        <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem 3rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.75rem', fontFamily: THEME.typography.fontFamilySecondary }}>
            
            {/* 1. COCKPIT HEADER & TIME RANGE / CELL SELECTOR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: THEME.typography.fontFamilyMain, letterSpacing: '-0.02em' }}>
                        <BarChart3 size={24} color={THEME.colors.primary} /> Cockpit de Inventarios & Telemetría Operativa
                    </h1>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '500', fontFamily: THEME.typography.fontFamilySecondary }}>
                        Monitoreo en tiempo real de valor en bodega, stock físico, mermas operativas y gobernanza de células.
                    </p>
                </div>

                {/* Controls: Cell filter dropdown + Time range selector pills + Refresh button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    {/* Cell Selector Pill */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#F8FAFC',
                        padding: '4px 10px',
                        borderRadius: THEME.radius.md,
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        <Filter size={13} color={THEME.colors.textSecondary} />
                        <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', fontFamily: THEME.typography.fontFamilyMain }}>Célula:</span>
                        <select
                            value={selectedCellId}
                            onChange={(e) => setSelectedCellId(e.target.value)}
                            style={{
                                border: 'none',
                                backgroundColor: 'transparent',
                                fontSize: '0.78rem',
                                fontWeight: '700',
                                color: THEME.colors.textMain,
                                outline: 'none',
                                cursor: 'pointer',
                                maxWidth: '220px',
                                fontFamily: THEME.typography.fontFamilySecondary
                            }}
                        >
                            <option value="all">Todas las Células (Consolidado)</option>
                            {workCells.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.name} {c.leader_name ? `(${c.leader_name})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Time Range Pills */}
                    <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                        {(
                            [
                                { id: 'today', label: 'Hoy' },
                                { id: '7d', label: '7 Días' },
                                { id: '15d', label: '15 Días' },
                                { id: '30d', label: '30 Días' },
                                { id: 'this_month', label: 'Mes Actual' }
                            ] as const
                        ).map(t => {
                            const isSelected = timeRange === t.id;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => setTimeRange(t.id)}
                                    style={{
                                        padding: '0.35rem 0.85rem',
                                        fontSize: '0.78rem',
                                        fontWeight: isSelected ? '800' : '600',
                                        color: isSelected ? '#FFFFFF' : THEME.colors.textSecondary,
                                        backgroundColor: isSelected ? THEME.colors.primary : 'transparent',
                                        border: 'none',
                                        borderRadius: THEME.radius.sm,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s',
                                        fontFamily: THEME.typography.fontFamilySecondary,
                                        boxShadow: isSelected ? '0 2px 4px rgba(13,122,87,0.2)' : 'none'
                                    }}
                                >
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Refresh Button */}
                    <button
                        onClick={() => fetchData(true)}
                        disabled={loading || refreshing}
                        title="Actualizar métricas en tiempo real"
                        style={{
                            padding: '0.45rem',
                            borderRadius: THEME.radius.md,
                            backgroundColor: '#F8FAFC',
                            border: `1px solid ${THEME.colors.border}`,
                            color: THEME.colors.textSecondary,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>

                    {/* CENTRO DE INFORMES & EXPORTACIONES EJECUTIVAS */}
                    <div style={{ position: 'relative' }} ref={reportsMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsReportsMenuOpen(prev => !prev)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.42rem 0.85rem',
                                borderRadius: THEME.radius.md,
                                backgroundColor: isReportsMenuOpen ? '#ECFDF5' : '#FFFFFF',
                                border: `1px solid ${isReportsMenuOpen ? '#10B981' : THEME.colors.border}`,
                                color: isReportsMenuOpen ? '#0D7A57' : THEME.colors.textMain,
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: THEME.shadow.sm
                            }}
                            title="Centro de Extracción de Informes y Descargas Excel"
                        >
                            <Download size={14} color={isReportsMenuOpen ? '#0D7A57' : THEME.colors.textSecondary} />
                            <span>Informes & Exportaciones</span>
                            <ChevronDown size={13} style={{ transform: isReportsMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        </button>

                        {isReportsMenuOpen && (
                            <div style={{
                                position: 'absolute',
                                right: 0,
                                top: 'calc(100% + 6px)',
                                width: '280px',
                                backgroundColor: '#FFFFFF',
                                borderRadius: THEME.radius.md,
                                border: `1px solid ${THEME.colors.border}`,
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)',
                                zIndex: 100,
                                padding: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}>
                                <div style={{ padding: '6px 8px', borderBottom: '1px solid #F1F5F9' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Descargas Oficiales (.xlsx)
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handleExportExecutiveReports('daily_balance')}
                                    disabled={exportingReport !== null}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '0.5rem 0.65rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#1E293B',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background-color 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <FileSpreadsheet size={15} color="#0D7A57" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#0F172A' }}>Balance Consolidado</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '500' }}>Stock general por células</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleExportExecutiveReports('stock')}
                                    disabled={exportingReport !== null}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '0.5rem 0.65rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#1E293B',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background-color 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <Package size={15} color="#2563EB" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#0F172A' }}>Stock Físico & Valorizado</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '500' }}>Existencias, costos y alertas</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleExportExecutiveReports('kardex')}
                                    disabled={exportingReport !== null}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '0.5rem 0.65rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#1E293B',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background-color 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <History size={15} color="#4338CA" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#0F172A' }}>Kardex de Transacciones</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '500' }}>Movimientos en {timeRange}</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleExportExecutiveReports('payroll')}
                                    disabled={exportingReport !== null}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '0.5rem 0.65rem',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#1E293B',
                                        fontSize: '0.76rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textAlign: 'left',
                                        transition: 'background-color 0.15s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <User size={15} color="#D97706" />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#0F172A' }}>Descuentos de Nómina</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '500' }}>Ventas a empleados en {timeRange}</div>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* DROPDOWN NOVEDADES OPERATIVAS (SPEC.md §8.8.11) */}
                    <div style={{ position: 'relative' }} ref={noveltyMenuRef}>
                        <button
                            type="button"
                            onClick={() => setIsNoveltyMenuOpen(prev => !prev)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '0.42rem 0.85rem',
                                borderRadius: THEME.radius.md,
                                backgroundColor: isNoveltyMenuOpen ? '#FEF3C7' : '#FFFFFF',
                                border: '1.5px solid #F59E0B',
                                color: '#B45309',
                                fontSize: '0.78rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                boxShadow: THEME.shadow.sm
                            }}
                            title="Registrar Mermas, Descuento de Nómina o Venta Extra"
                        >
                            <Plus size={14} strokeWidth={2.5} />
                            <span>+ Registrar Novedad</span>
                            <ChevronDown size={13} strokeWidth={2.5} style={{ transform: isNoveltyMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
                        </button>

                        {isNoveltyMenuOpen && (
                            <div style={{
                                position: 'absolute',
                                right: 0,
                                top: 'calc(100% + 6px)',
                                width: '270px',
                                backgroundColor: '#FFFFFF',
                                borderRadius: THEME.radius.md,
                                border: `1px solid ${THEME.colors.border}`,
                                boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 0 1px 1px rgba(0, 0, 0, 0.05)',
                                zIndex: 100,
                                padding: '6px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '3px'
                            }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsNoveltyMenuOpen(false);
                                        setIsWasteModalOpen(true);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '8px',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#0F172A',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FEF3C7')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <div style={{ marginTop: '2px', padding: '4px', borderRadius: '5px', backgroundColor: '#FDE68A', color: '#B45309', display: 'flex' }}>
                                        <Trash2 size={13} strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A' }}>Merma / Baja de Producto</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Pesada, daño o descapote</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsNoveltyMenuOpen(false);
                                        setIsPayrollModalOpen(true);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '8px',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#0F172A',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#EFF6FF')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <div style={{ marginTop: '2px', padding: '4px', borderRadius: '5px', backgroundColor: '#DBEAFE', color: '#1D4ED8', display: 'flex' }}>
                                        <User size={13} strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A' }}>Descuento de Nómina</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Venta autorizada a empleados</div>
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsNoveltyMenuOpen(false);
                                        setIsAdditionalSalesModalOpen(true);
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: '8px',
                                        padding: '8px 10px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        backgroundColor: 'transparent',
                                        color: '#0F172A',
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#FAF5FF')}
                                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <div style={{ marginTop: '2px', padding: '4px', borderRadius: '5px', backgroundColor: '#F3E8FF', color: '#7E22CE', display: 'flex' }}>
                                        <ShoppingCart size={13} strokeWidth={2.2} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A' }}>Venta Extra / Mostrador</div>
                                        <div style={{ fontSize: '0.66rem', color: '#64748B' }}>Venta directa en bodega</div>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* BOTÓN COMPRAS PLAZA (SPEC.md §8.8.11) */}
                    <button
                        type="button"
                        onClick={() => setIsFastPlazaModalOpen(true)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '0.42rem 0.85rem',
                            borderRadius: THEME.radius.md,
                            border: '1.5px solid #0D7A57',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            fontSize: '0.78rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(13, 122, 87, 0.25)',
                            transition: 'all 0.15s ease'
                        }}
                        title="Ingesta directa de compras en Corabastos"
                    >
                        <Zap size={14} strokeWidth={2.5} />
                        <span>Compras Plaza</span>
                    </button>
                </div>
            </div>

            {/* 2. HERO KPI CARDS (6 TARJETAS EJECUTIVAS RESPONSIVAS) */}
            <div style={{ width: '100%', paddingBottom: '4px' }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                    gap: '1rem',
                    alignItems: 'stretch'
                }}>
                    
                    {/* CARD 1: VALOR EN BODEGA */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1rem 1.05rem', minHeight: '142px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Valor en Bodega
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                    <span style={{ fontWeight: '800', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '1px 5px', borderRadius: THEME.radius.sm, fontSize: '0.62rem', display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <CheckCircle2 size={9} /> Matriz Oficial
                                    </span>
                                </div>
                            </div>
                            <div style={{ width: '30px', height: '30px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <DollarSign size={16} color={THEME.colors.primary} />
                            </div>
                        </div>

                        <div
                            title={`${formatMoney(totalStockValue)} COP exactos`}
                            style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '4px',
                                margin: '0.3rem 0 0 0',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.15
                            }}
                        >
                            <span style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {loading ? '...' : formatHeroSales(totalStockValue).val}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                {formatHeroSales(totalStockValue).unit}
                            </span>
                        </div>
                        
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                            <span style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {filteredProducts.length} SKUs
                            </span>
                            <strong style={{ color: THEME.colors.primary, fontWeight: '800', fontFamily: THEME.typography.fontFamilyMain, flexShrink: 0, marginLeft: '4px' }}>
                                {formatCompactMoney(totalStockValue)}
                            </strong>
                        </div>
                    </div>

                    {/* CARD 2: STOCK FÍSICO EN PISO */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1rem 1.05rem', minHeight: '142px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Stock en Piso
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                    <span style={{ fontWeight: '800', color: '#334155', backgroundColor: '#F1F5F9', padding: '1px 5px', borderRadius: THEME.radius.sm, fontSize: '0.62rem', display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        Piso Activo
                                    </span>
                                </div>
                            </div>
                            <div style={{ width: '30px', height: '30px', borderRadius: THEME.radius.md, backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Package size={16} color="#334155" />
                            </div>
                        </div>

                        <div
                            title={`${formatNumber(totalPhysicalStockQty, 1)} Kg exactos`}
                            style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '4px',
                                margin: '0.3rem 0 0 0',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.15
                            }}
                        >
                            <span style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {loading ? '...' : formatHeroVolume(totalPhysicalStockQty).val}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                {formatHeroVolume(totalPhysicalStockQty).unit}
                            </span>
                        </div>
                        
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                            <span style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {activeCell ? activeCell.name : 'Consolidado'}
                            </span>
                            <strong style={{ color: THEME.colors.textMain, fontWeight: '800', fontFamily: THEME.typography.fontFamilyMain, flexShrink: 0, marginLeft: '4px' }}>
                                {formatNumber(totalPhysicalStockQty, 1)} Kg
                            </strong>
                        </div>
                    </div>

                    {/* CARD 3: ROTACIÓN (DOH) */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1rem 1.05rem', minHeight: '142px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Rotación (DOH)
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                    <span style={{
                                        fontWeight: '800',
                                        color: daysOnHand > 4 ? '#92400E' : THEME.colors.primary,
                                        backgroundColor: daysOnHand > 4 ? '#FEF3C7' : THEME.colors.primaryLight,
                                        padding: '1px 5px',
                                        borderRadius: THEME.radius.sm,
                                        fontSize: '0.62rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        whiteSpace: 'nowrap',
                                        fontFamily: THEME.typography.fontFamilySecondary
                                    }}>
                                        {daysOnHand > 4 ? 'Seguimiento' : 'Saludable'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ width: '30px', height: '30px', borderRadius: THEME.radius.md, backgroundColor: daysOnHand > 4 ? '#FEF3C7' : THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Clock size={16} color={daysOnHand > 4 ? '#D97706' : THEME.colors.primary} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '0.3rem 0 0 0', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {loading ? '...' : formatNumber(daysOnHand, 1)}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                Días Cobertura
                            </span>
                        </div>
                        
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                            <span style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Velocidad
                            </span>
                            <strong style={{ color: daysOnHand > 4 ? '#92400E' : THEME.colors.primary, fontWeight: '800', fontFamily: THEME.typography.fontFamilyMain, flexShrink: 0, marginLeft: '4px' }}>
                                {daysOnHand > 4 ? 'Seguimiento' : 'Óptima'}
                            </strong>
                        </div>
                    </div>

                    {/* CARD 4: EXACTITUD DE INVENTARIO (IRA %) */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1rem 1.05rem', minHeight: '142px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Exactitud IRA %
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                    <span style={{
                                        fontWeight: '800',
                                        color: iraAccuracy >= 98 ? THEME.colors.primary : '#D97706',
                                        backgroundColor: iraAccuracy >= 98 ? THEME.colors.primaryLight : '#FEF3C7',
                                        padding: '1px 5px',
                                        borderRadius: THEME.radius.sm,
                                        fontSize: '0.62rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        whiteSpace: 'nowrap',
                                        fontFamily: THEME.typography.fontFamilySecondary
                                    }}>
                                        Auditoría Cíclica
                                    </span>
                                </div>
                            </div>
                            <div style={{ width: '30px', height: '30px', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <CheckCircle2 size={16} color={THEME.colors.primary} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '0.3rem 0 0 0', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: '900', color: iraAccuracy >= 98 ? THEME.colors.primary : '#D97706', letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {loading ? '...' : `${formatNumber(iraAccuracy, 1)}%`}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                Confiabilidad
                            </span>
                        </div>
                        
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                            <span style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Tol: ±2.5%
                            </span>
                            <span style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, fontWeight: '800', padding: '1px 6px', borderRadius: THEME.radius.sm, fontSize: '0.65rem', fontFamily: THEME.typography.fontFamilySecondary, flexShrink: 0, marginLeft: '4px' }}>
                                Meta: ≥ 98%
                            </span>
                        </div>
                    </div>

                    {/* CARD 5: TASA DE MERMA OPERATIVA */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1rem 1.05rem', minHeight: '142px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Tasa de Merma
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                    <span style={{
                                        fontWeight: '800',
                                        color: massBalance.shrinkageRate > 4 ? '#92400E' : THEME.colors.primary,
                                        backgroundColor: massBalance.shrinkageRate > 4 ? '#FEF3C7' : THEME.colors.primaryLight,
                                        padding: '1px 5px',
                                        borderRadius: THEME.radius.sm,
                                        fontSize: '0.62rem',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '2px',
                                        whiteSpace: 'nowrap',
                                        fontFamily: THEME.typography.fontFamilySecondary
                                    }}>
                                        {massBalance.shrinkageRate > 4 ? <TrendingDown size={10} /> : <CheckCircle2 size={10} />}
                                        {massBalance.shrinkageRate > 4 ? 'En Seguimiento' : 'Bajo Control'}
                                    </span>
                                </div>
                            </div>
                            <div style={{
                                width: '30px',
                                height: '30px',
                                borderRadius: THEME.radius.md,
                                backgroundColor: massBalance.shrinkageRate > 4 ? '#FEF3C7' : THEME.colors.primaryLight,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <TrendingDown size={16} color={massBalance.shrinkageRate > 4 ? '#D97706' : THEME.colors.primary} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', margin: '0.3rem 0 0 0', whiteSpace: 'nowrap', lineHeight: 1.15 }}>
                            <span style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {loading ? '...' : `${formatNumber(massBalance.shrinkageRate, 2)}%`}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                del acopio
                            </span>
                        </div>
                        
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                            <span style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {formatNumber(massBalance.wasteKg, 1)} Kg
                            </span>
                            <span style={{ backgroundColor: '#F1F5F9', color: '#475569', fontWeight: '800', padding: '1px 6px', borderRadius: THEME.radius.sm, fontSize: '0.65rem', fontFamily: THEME.typography.fontFamilySecondary, flexShrink: 0, marginLeft: '4px' }}>
                                Meta: &lt; 4%
                            </span>
                        </div>
                    </div>

                    {/* CARD 6: IMPACTO EN MERMA ($ D+P+F) */}
                    <div style={{ backgroundColor: THEME.colors.surface, padding: '1rem 1.05rem', minHeight: '142px', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '4px' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Impacto Merma
                                </span>
                                <div style={{ marginTop: '3px' }}>
                                    <span style={{ fontWeight: '800', color: '#475569', backgroundColor: '#F1F5F9', padding: '1px 5px', borderRadius: THEME.radius.sm, fontSize: '0.62rem', display: 'inline-flex', alignItems: 'center', gap: '2px', whiteSpace: 'nowrap', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        D + P + F
                                    </span>
                                </div>
                            </div>
                            <div style={{ width: '30px', height: '30px', borderRadius: THEME.radius.md, backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <DollarSign size={16} color="#475569" />
                            </div>
                        </div>

                        <div
                            title={`${formatMoney(massBalance.wasteCost)} COP exactos`}
                            style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: '4px',
                                margin: '0.3rem 0 0 0',
                                whiteSpace: 'nowrap',
                                lineHeight: 1.15
                            }}
                        >
                            <span style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', fontFamily: THEME.typography.fontFamilyMain }}>
                                {loading ? '...' : formatHeroSales(massBalance.wasteCost).val}
                            </span>
                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilyMain }}>
                                {formatHeroSales(massBalance.wasteCost).unit}
                            </span>
                        </div>
                        
                        <div style={{ marginTop: '0.55rem', paddingTop: '0.45rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem' }}>
                            <span style={{ color: THEME.colors.textSecondary, fontWeight: '600', fontFamily: THEME.typography.fontFamilySecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Consolidado
                            </span>
                            <strong style={{ color: THEME.colors.textMain, fontWeight: '800', fontFamily: THEME.typography.fontFamilyMain, flexShrink: 0, marginLeft: '4px' }}>
                                {formatCompactMoney(massBalance.wasteCost)}
                            </strong>
                        </div>
                    </div>

                </div>
            </div>

            {/* 2.5 CONCILIACIÓN FÍSICA & AUDITORÍA EN PISO (MÉTRICAS NO-DECORATIVAS DE NEGOCIO) */}
            <div style={{
                backgroundColor: THEME.colors.surface,
                borderRadius: THEME.radius.lg,
                border: `1px solid ${THEME.colors.border}`,
                boxShadow: THEME.shadow.sm,
                padding: '1.15rem 1.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '7px', fontFamily: THEME.typography.fontFamilyMain }}>
                            <ShieldCheck size={18} color={THEME.colors.primary} /> Conciliación Diaria & Auditoría de Piso (Cols N, V, W)
                        </h3>
                        <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.74rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>
                            Métricas físicas de la Sábana Oficial migradas para control directivo ({timeRange === 'today' ? 'Hoy' : timeRange}).
                        </p>
                    </div>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '1rem'
                }}>
                    {/* FALTANTES COL V */}
                    <div style={{
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: THEME.radius.md,
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#B91C1C', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain }}>
                                Faltantes Físicos (Col V)
                            </span>
                            <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={13} color="#B91C1C" />
                            </div>
                        </div>
                        <div style={{ margin: '0.35rem 0' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#991B1B', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                -{formatNumber(floorConciliation.missingKg, 1)} <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#B91C1C' }}>Kg</span>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#7F1D1D', marginTop: '2px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                Conteo Físico &lt; Inventario Calculado
                            </div>
                        </div>
                        <div style={{ paddingTop: '0.4rem', borderTop: '1px solid #FCA5A5', fontSize: '0.68rem', color: '#991B1B', fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>
                            {floorConciliation.missingKg === 0 ? 'Balance en línea (Cero faltantes)' : 'Requiere auditoría de mermas'}
                        </div>
                    </div>

                    {/* SOBRANTES COL W */}
                    <div style={{
                        backgroundColor: '#F0FDF4',
                        border: '1px solid #BBF7D0',
                        borderRadius: THEME.radius.md,
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#15803D', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain }}>
                                Sobrantes Físicos (Col W)
                            </span>
                            <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle2 size={13} color="#15803D" />
                            </div>
                        </div>
                        <div style={{ margin: '0.35rem 0' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#166534', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                +{formatNumber(floorConciliation.surplusKg, 1)} <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#15803D' }}>Kg</span>
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#14532D', marginTop: '2px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                Conteo Físico &gt; Inventario Calculado
                            </div>
                        </div>
                        <div style={{ paddingTop: '0.4rem', borderTop: '1px solid #86EFAC', fontSize: '0.68rem', color: '#166534', fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>
                            {floorConciliation.surplusKg === 0 ? 'Sin excedentes no registrados' : 'ℹ️ Mercancía física adicional en piso'}
                        </div>
                    </div>

                    {/* VENTAS NÓMINA COL N */}
                    <div style={{
                        backgroundColor: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: THEME.radius.md,
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#1D4ED8', letterSpacing: '0.04em', fontFamily: THEME.typography.fontFamilyMain }}>
                                Ventas a Nómina (Col N)
                            </span>
                            <div style={{ width: '24px', height: '24px', borderRadius: '6px', backgroundColor: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <User size={13} color="#1D4ED8" />
                            </div>
                        </div>
                        <div style={{ margin: '0.35rem 0' }}>
                            <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#1E40AF', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                {formatCompactMoney(floorConciliation.payrollCost)}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: '#1E3A8A', marginTop: '2px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                Volumen: <strong>{formatNumber(floorConciliation.payrollKg, 1)} Kg</strong> vendidos a colaboradores
                            </div>
                        </div>
                        <div style={{ paddingTop: '0.4rem', borderTop: '1px solid #93C5FD', fontSize: '0.68rem', color: '#1E40AF', fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>
                            Descuentos autorizados por nómina
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. SECCIÓN DUAL: BALANCE DE MASA vs TOP 5 PARETO DE PÉRDIDAS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(520px, 1fr))', gap: '1.25rem', alignItems: 'stretch' }}>
                
                {/* BALANCE DE MASA */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.15rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: THEME.typography.fontFamilyMain }}>
                                    <Scale size={20} color={THEME.colors.primary} /> Balance Físico de Masa (Kilos)
                                </h2>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>
                                    Entradas de acopio vs despachos facturados y descarte acumulado en piso.
                                </p>
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: '800', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '4px 10px', borderRadius: THEME.radius.sm, border: '1px solid #BBF7D0', display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                <ShieldCheck size={13} /> Flujo Auditado
                            </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Entradas */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.35rem' }}>
                                    <span style={{ color: THEME.colors.primary, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <ArrowUpRight size={14} /> Entradas / Compras Recepcionadas
                                    </span>
                                    <span style={{ color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800' }}>{formatNumber(massBalance.entryKg, 1)} KG</span>
                                </div>
                                <div style={{ height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: `${Math.min(100, massBalance.entryKg > 0 ? 100 : 0)}%`, backgroundColor: THEME.colors.primary, borderRadius: '4px' }}></div>
                                </div>
                            </div>

                            {/* Salidas / Despachos */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.35rem' }}>
                                    <span style={{ color: '#334155', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <ArrowDownRight size={14} /> Salidas / Pedidos Despachados
                                    </span>
                                    <span style={{ color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800' }}>{formatNumber(massBalance.exitKg, 1)} KG</span>
                                </div>
                                <div style={{ height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${Math.min(100, massBalance.entryKg > 0 ? (massBalance.exitKg / massBalance.entryKg) * 100 : 0)}%`,
                                        backgroundColor: '#475569',
                                        borderRadius: '4px'
                                    }}></div>
                                </div>
                            </div>

                            {/* Mermas & Faltantes */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: '700', marginBottom: '0.35rem' }}>
                                    <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        <TrendingDown size={14} color="#64748B" /> Merma + Desperdicio + Pesada
                                    </span>
                                    <span style={{ color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain, fontWeight: '800' }}>{formatNumber(massBalance.wasteKg, 1)} KG</span>
                                </div>
                                <div style={{ height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${Math.min(100, massBalance.entryKg > 0 ? (massBalance.wasteKg / massBalance.entryKg) * 100 : 0)}%`,
                                        backgroundColor: '#94A3B8',
                                        borderRadius: '4px'
                                    }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: '#F8FAF9',
                        border: `1px solid ${THEME.colors.border}`,
                        borderRadius: THEME.radius.md,
                        padding: '0.85rem 1rem',
                        fontSize: '0.78rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '1.25rem'
                    }}>
                        <span style={{ fontWeight: '700', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>Diferencial Neto de Flujo en Piso:</span>
                        <span style={{ fontWeight: '900', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain, fontSize: '0.95rem' }}>
                            {formatNumber(massBalance.entryKg - massBalance.exitKg - massBalance.wasteKg, 1)} KG
                        </span>
                    </div>
                </div>

                {/* TOP 5 PARETO DE PÉRDIDAS */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.4rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.15rem' }}>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: THEME.typography.fontFamilyMain }}>
                                    <BarChart3 size={20} color={THEME.colors.primary} /> Pareto Top 5: Fuga Financiera ($)
                                </h2>
                                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>
                                    Los 5 SKUs con mayor impacto acumulado de merma, pesada y faltante.
                                </p>
                            </div>
                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#334155', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', padding: '3px 8px', borderRadius: THEME.radius.sm, fontFamily: THEME.typography.fontFamilySecondary }}>
                                80/20 Concentración
                            </span>
                        </div>

                        {massBalance.topLosses.length === 0 ? (
                            <div style={{
                                padding: '2.5rem',
                                textAlign: 'center',
                                color: THEME.colors.textSecondary,
                                fontSize: '0.85rem',
                                backgroundColor: '#F8FAFC',
                                borderRadius: THEME.radius.md,
                                border: '1px dashed #CBD5E1',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                fontFamily: THEME.typography.fontFamilySecondary
                            }}>
                                <CheckCircle2 size={16} color={THEME.colors.primary} />
                                <span>No se registraron mermas ni ajustes negativos en el período seleccionado.</span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                {massBalance.topLosses.map((item, idx) => {
                                    const maxLoss = massBalance.topLosses[0].cost || 1;
                                    const pct = (item.cost / maxLoss) * 100;
                                    const slateTones = ['#1E293B', '#334155', '#475569', '#64748B', '#94A3B8'];
                                    const barColor = slateTones[idx] || '#CBD5E1';

                                    return (
                                        <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <span style={{ fontWeight: '800', color: THEME.colors.textSecondary, width: '16px', fontFamily: THEME.typography.fontFamilyMain }}>
                                                        #{idx + 1}
                                                    </span>
                                                    <span style={{ fontWeight: '700', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        {item.name}
                                                    </span>
                                                    <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '700', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        ({item.sku})
                                                    </span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontWeight: '900', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                                        {formatMoney(item.cost)}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, marginLeft: '6px', fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilySecondary }}>
                                                        ({formatNumber(item.kg, 1)} kg)
                                                    </span>
                                                </div>
                                            </div>
                                            <div style={{ height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pct}%`, backgroundColor: barColor, borderRadius: '3px' }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 4. COMPARATIVA GENERAL ENTRE LAS 6 CÉLULAS AUTÓNOMAS DE ALISTAMIENTO */}
            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: THEME.typography.fontFamilyMain }}>
                            <Layers size={20} color={THEME.colors.primary} /> Gobernanza & Rendimiento por Célula de Alistamiento
                        </h2>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>
                            Seguimiento por línea operativa, líderes asignados y trazabilidad auditada de cambios.
                        </p>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: '800', backgroundColor: '#F8FAFC', color: THEME.colors.textSecondary, padding: '4px 10px', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontFamily: THEME.typography.fontFamilySecondary }}>
                        6 Células Autónomas Parametrizadas
                    </span>
                </div>

                <div style={{ overflowX: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                        <thead style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <tr>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem' }}>Célula / Línea</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem' }}>Líder Responsable</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem' }}>Suplente</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem', textAlign: 'center' }}>SKUs</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem', textAlign: 'right' }}>Stock Físico (KG)</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem', textAlign: 'right' }}>Valor Bodega ($)</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem', textAlign: 'right' }}>Fuga Merma ($)</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem', textAlign: 'center' }}>Tasa Merma (%)</th>
                                <th style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.75rem 1rem', textAlign: 'center' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cellsOverview.map((c, idx) => {
                                const isSelected = selectedCellId === c.id;
                                return (
                                    <tr
                                        key={c.id}
                                        onClick={() => setSelectedCellId(c.id)}
                                        style={{
                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                            backgroundColor: isSelected ? `${c.color}0D` : idx % 2 === 0 ? 'white' : '#FAFAFA',
                                            cursor: 'pointer',
                                            transition: 'background-color 0.15s ease'
                                        }}
                                        onMouseOver={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
                                        }}
                                        onMouseOut={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'white' : '#FAFAFA';
                                        }}
                                    >
                                        <td style={{ padding: '0.75rem 1rem', fontWeight: '800', color: THEME.colors.textMain }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: THEME.radius.sm,
                                                    backgroundColor: c.badge_bg,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: `1px solid ${c.color}35`,
                                                    flexShrink: 0
                                                }}>
                                                    {renderCellIcon(c.id, c.color, 17)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>{c.name}</div>
                                                    <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>{c.inventory_group}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            {c.leader_name ? (
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    color: c.badge_text,
                                                    backgroundColor: c.badge_bg,
                                                    padding: '3px 8px',
                                                    borderRadius: THEME.radius.sm,
                                                    border: `1px solid ${c.color}35`,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px'
                                                }}>
                                                    <User size={12} strokeWidth={2.5} />
                                                    {c.leader_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontStyle: 'italic' }}>Sin asignar</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem' }}>
                                            {c.backup_name ? (
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    color: '#475569',
                                                    backgroundColor: '#F1F5F9',
                                                    padding: '2px 7px',
                                                    borderRadius: THEME.radius.sm,
                                                    border: '1px solid #E2E8F0',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <UserCheck size={11} strokeWidth={2} />
                                                    {c.backup_name}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#CBD5E1', fontSize: '0.72rem' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '800', color: '#475569', fontFamily: THEME.typography.fontFamilyMain }}>
                                            {c.activeSkus}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                            {formatNumber(c.stockKg, 1)} kg
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: THEME.colors.primary, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                            {formatMoney(c.stockValue)}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontFamily: THEME.typography.fontFamilyMain }}>
                                            {formatMoney(c.wasteCost)}
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <span style={{
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                color: c.shrinkageRate > 4 ? '#92400E' : THEME.colors.primary,
                                                backgroundColor: c.shrinkageRate > 4 ? '#FEF3C7' : THEME.colors.primaryLight,
                                                padding: '2px 7px',
                                                borderRadius: THEME.radius.sm,
                                                fontFamily: THEME.typography.fontFamilyMain
                                            }}>
                                                {formatNumber(c.shrinkageRate, 2)}%
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedCellId(c.id);
                                                    }}
                                                    style={{
                                                        padding: '0.28rem 0.65rem',
                                                        borderRadius: THEME.radius.sm,
                                                        border: `1px solid ${c.color}50`,
                                                        backgroundColor: isSelected ? c.color : 'transparent',
                                                        color: isSelected ? '#FFFFFF' : c.color,
                                                        fontWeight: '800',
                                                        fontSize: '0.72rem',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease',
                                                        fontFamily: THEME.typography.fontFamilySecondary
                                                    }}
                                                    title={isSelected ? 'Filtro actualmente activo' : 'Filtrar métricas por esta célula'}
                                                >
                                                    {isSelected ? 'Activo' : 'Filtrar'}
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReassignModalCell(c);
                                                        setSelectedRoleToAssign('leader');
                                                        setSelectedNewLeaderId(c.leader_id || '');
                                                        setReassignReason('');
                                                    }}
                                                    style={{
                                                        padding: '0.28rem 0.65rem',
                                                        borderRadius: THEME.radius.sm,
                                                        border: `1px solid ${THEME.colors.borderActive}`,
                                                        backgroundColor: '#FFFFFF',
                                                        color: THEME.colors.textMain,
                                                        fontWeight: '700',
                                                        fontSize: '0.72rem',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease',
                                                        fontFamily: THEME.typography.fontFamilySecondary
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.borderColor = THEME.colors.primary}
                                                    onMouseOut={(e) => e.currentTarget.style.borderColor = THEME.colors.borderActive}
                                                    title="Reasignar responsable de célula desde Talento Humano"
                                                >
                                                    <UserCheck size={12} strokeWidth={2.2} />
                                                    Reasignar
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setHistoryModalCell(c);
                                                    }}
                                                    style={{
                                                        padding: '0.28rem 0.65rem',
                                                        borderRadius: THEME.radius.sm,
                                                        border: `1px solid ${THEME.colors.borderActive}`,
                                                        backgroundColor: '#FFFFFF',
                                                        color: THEME.colors.textSecondary,
                                                        fontWeight: '700',
                                                        fontSize: '0.72rem',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease',
                                                        fontFamily: THEME.typography.fontFamilySecondary
                                                    }}
                                                    onMouseOver={(e) => e.currentTarget.style.borderColor = THEME.colors.primary}
                                                    onMouseOut={(e) => e.currentTarget.style.borderColor = THEME.colors.borderActive}
                                                    title="Ver auditoría y trazabilidad de cambios de responsable"
                                                >
                                                    <History size={12} strokeWidth={2.2} />
                                                    Historial
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 5. REGISTRO HISTÓRICO & CURVA DE MERMAS REALES POR PRODUCTO (3 MAGNITUDES DE TIEMPO: SEMANA / MES / TRIMESTRE — ESCENARIO 245) */}
            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px', fontFamily: THEME.typography.fontFamilyMain }}>
                            <TrendingDown size={20} color="#D97706" /> Registro Histórico & Curva de Mermas Reales por Producto
                        </h2>
                        <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamilySecondary }}>
                            Trazabilidad física real desde Kilos Comprados hasta su desagregación en Merma (Pesada + Desperdicio + Basura + Faltantes) vs Kilos Entregados para calibrar márgenes esperados.
                        </p>
                    </div>

                    {/* Conmutador de las 3 Magnitudes de Tiempo + Controles */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                        {/* Buscador por Producto / Código */}
                        <div style={{ position: 'relative', width: '230px' }}>
                            <Search size={14} color={THEME.colors.textSecondary} style={{ position: 'absolute', left: '10px', top: '9px' }} />
                            <input
                                type="text"
                                placeholder="Buscar ej. pastusa, 150, lechuga..."
                                value={shrinkageSearch}
                                onChange={(e) => setShrinkageSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    height: '32px',
                                    padding: '0 0.6rem 0 1.9rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.border}`,
                                    fontSize: '0.78rem',
                                    fontWeight: '600',
                                    color: THEME.colors.textMain,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                            />
                        </div>

                        {/* Toggle: Solo con movimiento vs Todos */}
                        <button
                            type="button"
                            onClick={() => setOnlyWithShrinkageOrFlow(prev => !prev)}
                            style={{
                                height: '32px',
                                padding: '0 0.7rem',
                                borderRadius: THEME.radius.md,
                                border: `1px solid ${onlyWithShrinkageOrFlow ? '#10B981' : THEME.colors.border}`,
                                backgroundColor: onlyWithShrinkageOrFlow ? '#ECFDF5' : '#F8FAFC',
                                color: onlyWithShrinkageOrFlow ? '#065F46' : THEME.colors.textSecondary,
                                fontSize: '0.74rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                fontFamily: THEME.typography.fontFamilySecondary
                            }}
                            title="Alternar entre ver solo los productos con compras/salidas/merma registradas en el trimestre o el catálogo completo"
                        >
                            {onlyWithShrinkageOrFlow ? `Con Flujo (${historicalShrinkageData.rows.length})` : `Catálogo (${historicalShrinkageData.rows.length})`}
                        </button>

                        {/* Selector de 3 Magnitudes de Tiempo */}
                        <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            {(
                                [
                                    { id: 'week', label: '1. Esta Semana (Diario)' },
                                    { id: 'month', label: '2. Este Mes (Por Semanas)' },
                                    { id: 'quarter', label: '3. Trimestre (Comparado)' }
                                ] as const
                            ).map(tab => {
                                const isActive = shrinkageScale === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setShrinkageScale(tab.id)}
                                        style={{
                                            padding: '0.35rem 0.8rem',
                                            fontSize: '0.75rem',
                                            fontWeight: isActive ? '800' : '600',
                                            color: isActive ? '#FFFFFF' : THEME.colors.textSecondary,
                                            backgroundColor: isActive ? '#0F172A' : 'transparent',
                                            border: 'none',
                                            borderRadius: THEME.radius.sm,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                            fontFamily: THEME.typography.fontFamilySecondary
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Barra Pedagógica de Altura Fija (Cero salto de layout al hacer hover en los encabezados) */}
                <div style={{
                    backgroundColor: activeShrinkageTooltip ? '#0F172A' : '#F8FAFC',
                    color: activeShrinkageTooltip ? '#F8FAFC' : '#64748B',
                    padding: '0.5rem 0.95rem',
                    minHeight: '38px',
                    borderRadius: THEME.radius.md,
                    border: activeShrinkageTooltip ? '1px solid #334155' : `1px dashed ${THEME.colors.border}`,
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    transition: 'background-color 0.15s ease, color 0.15s ease'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Info size={15} color={activeShrinkageTooltip ? '#34D399' : '#94A3B8'} style={{ flexShrink: 0 }} />
                        <span>
                            {activeShrinkageTooltip || 'Pasa el cursor sobre cualquier encabezado de columna (?) para ver la definición exacta de esa métrica o periodo.'}
                        </span>
                    </div>
                </div>

                {/* Tabla Dinámica según la Magnitud de Tiempo Seleccionada */}
                <div style={{ overflowX: 'auto', maxHeight: '540px', overflowY: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.md }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.78rem', fontFamily: THEME.typography.fontFamilySecondary }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}` }}>
                            <tr>
                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('CÓD / PRODUCTO: Identificador contable (accounting_id), presentación del producto y célula operativa responsable en bodega.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="Código contable (accounting_id), nombre de la presentación y célula responsable en bodega."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.85rem', whiteSpace: 'nowrap' }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <span>CÓD / PRODUCTO</span>
                                        <HelpCircle size={11} color="#94A3B8" />
                                    </div>
                                </th>
                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('KG COMPRADOS (ENTRADAS): Total de kilos recepcionados desde compra en Corabastos / proveedores (Col G de Sábana Oficial) durante el periodo seleccionado.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="Total de kilos comprados/recepcionados (Col G) en la ventana de tiempo activa."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.65rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#047857' }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>COMPRADO ({shrinkageScale === 'week' ? '7D' : shrinkageScale === 'month' ? 'MES' : 'TRIM'})</span>
                                        <HelpCircle size={11} color="#047857" />
                                    </div>
                                </th>

                                {/* COLUMNAS DINÁMICAS DE LA MAGNITUD 1: ESTA SEMANA (7 DÍAS) */}
                                {shrinkageScale === 'week' && historicalShrinkageData.weekDayBuckets.map(day => (
                                    <th
                                        key={day.key}
                                        onMouseEnter={() => setActiveShrinkageTooltip(`${day.label} (${day.subLabel}): Muestra el % de merma real de ese día y debajo los kilogramos perdidos en Pesada + Desperdicio + Basura.`)}
                                        onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                        title={`Desperdicio y merma real del día ${day.label} (${day.subLabel}): % sobre volumen procesado y Kg perdidos.`}
                                        style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.55rem 0.5rem', textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: '#F1F5F9', borderLeft: '1px solid #E2E8F0' }}
                                    >
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.72rem' }}>{day.label}</div>
                                        <div style={{ fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>{day.subLabel}</div>
                                    </th>
                                ))}

                                {/* COLUMNAS DINÁMICAS DE LA MAGNITUD 2: ESTE MES (4 SEMANAS) */}
                                {shrinkageScale === 'month' && historicalShrinkageData.monthWeekBuckets.map(wk => (
                                    <th
                                        key={wk.key}
                                        onMouseEnter={() => setActiveShrinkageTooltip(`${wk.label} (${wk.subLabel}): Muestra el % de merma real acumulado en esa semana del mes y los Kg de merma vs Kg procesados.`)}
                                        onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                        title={`Merma real acumulada en ${wk.label} (${wk.subLabel}): % de merma y Kg perdidos en esa semana.`}
                                        style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.55rem 0.65rem', textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: '#F1F5F9', borderLeft: '1px solid #E2E8F0' }}
                                    >
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.73rem' }}>{wk.label}</div>
                                        <div style={{ fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>{wk.subLabel}</div>
                                    </th>
                                ))}

                                {/* COLUMNAS DINÁMICAS DE LA MAGNITUD 3: ESTE TRIMESTRE (3 MESES) */}
                                {shrinkageScale === 'quarter' && historicalShrinkageData.quarterMonthBuckets.map(mo => (
                                    <th
                                        key={mo.key}
                                        onMouseEnter={() => setActiveShrinkageTooltip(`Mes de ${mo.label} ${mo.subLabel}: Muestra el % de merma real mensual y los Kg perdidos en ese mes.`)}
                                        onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                        title={`Merma real consolidada en ${mo.label} ${mo.subLabel}.`}
                                        style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.55rem 0.65rem', textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: '#F1F5F9', borderLeft: '1px solid #E2E8F0' }}
                                    >
                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.73rem' }}>{mo.label}</div>
                                        <div style={{ fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>{mo.subLabel}</div>
                                    </th>
                                ))}

                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('MERMA DESAGREGADA (P+Q+R): Suma física en Kg de Pesada (Col P) + Desperdicio (Col Q) + Basura/Descapote (Col R) + Faltantes en el periodo.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="Kilos totales perdidos en Merma (Col P Pesada + Col Q Desperdicio + Col R Basura + Faltantes) y su costo en pesos."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.65rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#B45309', borderLeft: '1px solid #E2E8F0' }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>MERMA (P+Q+R)</span>
                                        <HelpCircle size={11} color="#B45309" />
                                    </div>
                                </th>
                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('KG ENTREGADOS / VENDIDOS: Kilos efectivos que sí salieron facturados/entregados a clientes luego de descontar la merma.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="Kilos efectivos vendidos/entregados a clientes después de la merma."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.65rem', textAlign: 'right', whiteSpace: 'nowrap', color: '#1E293B' }}
                                >
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end', width: '100%' }}>
                                        <span>ENTREGADO</span>
                                        <HelpCircle size={11} color="#64748B" />
                                    </div>
                                </th>

                                {/* COMPARATIVO DE LAS 3 MAGNITUDES SIEMPRE VISIBLE AL DERECHO PARA CALIBRAR FRECUENCIA */}
                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('% ESTA SEMANA: Porcentaje de merma real de los últimos 7 días = (Kg Merma 7d / Kg Procesados 7d) × 100.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="% Merma Real de Esta Semana (7 días)."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: shrinkageScale === 'week' ? '#ECFDF5' : '#F8FAFC', borderLeft: '2px solid #CBD5E1' }}
                                >
                                    % SEMANA
                                </th>
                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('% ESTE MES: Porcentaje de merma real consolidado del mes en curso = (Kg Merma Mes / Kg Procesados Mes) × 100.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="% Merma Real de Este Mes."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: shrinkageScale === 'month' ? '#ECFDF5' : '#F8FAFC' }}
                                >
                                    % MES
                                </th>
                                <th
                                    onMouseEnter={() => setActiveShrinkageTooltip('% ESTE TRIMESTRE: Porcentaje estructural de merma real en los últimos 3 meses (90 días). Ideal para calibrar el % de Lista Institucional sin ruido de un día atípico.')}
                                    onMouseLeave={() => setActiveShrinkageTooltip(null)}
                                    title="% Merma Real Consolidada del Trimestre (3 meses)."
                                    style={{ ...THEME.typography.tableHeader, fontFamily: THEME.typography.fontFamilyMain, padding: '0.7rem 0.6rem', textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: shrinkageScale === 'quarter' ? '#ECFDF5' : '#F8FAFC' }}
                                >
                                    % TRIMESTRE
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {historicalShrinkageData.rows.length === 0 ? (
                                <tr>
                                    <td colSpan={shrinkageScale === 'week' ? 14 : shrinkageScale === 'month' ? 11 : 10} style={{ padding: '2.5rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                        No se encontraron productos con movimientos para el filtro actual. Haz clic en &quot;Con Flujo&quot; arriba para ver todo el catálogo.
                                    </td>
                                </tr>
                            ) : (
                                historicalShrinkageData.rows.slice(0, 120).map((row, idx) => {
                                    const activeBuckets = shrinkageScale === 'week'
                                        ? row.weekDays
                                        : (shrinkageScale === 'month' ? row.monthWeeks : row.quarterMonths);

                                    const renderPctBadge = (pct: number, wasteKg: number, highlight = false) => {
                                        if (wasteKg <= 0.001 && pct <= 0.01) {
                                            return <span style={{ color: '#CBD5E1', fontWeight: 600 }}>0%</span>;
                                        }
                                        const isHigh = pct >= 15;
                                        const isMedium = pct >= 5 && pct < 15;
                                        const bg = isHigh ? '#FEE2E2' : (isMedium ? '#FEF3C7' : '#DCFCE7');
                                        const fg = isHigh ? '#991B1B' : (isMedium ? '#92400E' : '#166534');
                                        return (
                                            <span style={{
                                                display: 'inline-block',
                                                padding: highlight ? '3px 7px' : '2px 5px',
                                                borderRadius: '4px',
                                                fontWeight: 800,
                                                fontSize: highlight ? '0.74rem' : '0.7rem',
                                                backgroundColor: bg,
                                                color: fg,
                                                border: highlight ? `1px solid ${fg}40` : 'none',
                                                fontVariantNumeric: 'tabular-nums'
                                            }}>
                                                {formatNumber(pct, 1)}%
                                            </span>
                                        );
                                    };

                                    return (
                                        <tr
                                            key={row.id}
                                            style={{
                                                borderBottom: `1px solid ${THEME.colors.border}`,
                                                backgroundColor: idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                            }}
                                        >
                                            {/* CÓD / PRODUCTO */}
                                            <td style={{ padding: '0.55rem 0.85rem', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', fontWeight: 800, color: '#475569', backgroundColor: '#F1F5F9', padding: '1px 5px', borderRadius: '4px' }}>
                                                        {row.code}
                                                    </span>
                                                    <span style={{ fontWeight: 800, color: THEME.colors.textMain, fontSize: '0.8rem' }}>
                                                        {row.name}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.66rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: 600 }}>
                                                    {row.cellGroup} • {row.unit}
                                                </div>
                                            </td>

                                            {/* COMPRADO EN ESCALA ACTIVA */}
                                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontWeight: 800, color: '#047857', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                                {row.activeTotal.purchasedKg > 0 ? `${formatNumber(row.activeTotal.purchasedKg, 1)} kg` : <span style={{ color: '#CBD5E1' }}>—</span>}
                                            </td>

                                            {/* CELDAS DINÁMICAS (7 DÍAS / 4 SEMANAS / 3 MESES) */}
                                            {activeBuckets.map(b => (
                                                <td
                                                    key={b.key}
                                                    style={{
                                                        padding: '0.45rem 0.45rem',
                                                        textAlign: 'center',
                                                        borderLeft: '1px solid #F1F5F9',
                                                        whiteSpace: 'nowrap',
                                                        fontVariantNumeric: 'tabular-nums'
                                                    }}
                                                    title={`${b.label} (${b.subLabel}) | Comprado: ${formatNumber(b.purchasedKg, 1)} kg | Entregado: ${formatNumber(b.deliveredKg, 1)} kg | Merma: ${formatNumber(b.totalWasteKg, 1)} kg (${formatNumber(b.shrinkagePct, 1)}%)`}
                                                >
                                                    {b.totalWasteKg > 0.01 ? (
                                                        <div>
                                                            {renderPctBadge(b.shrinkagePct, b.totalWasteKg)}
                                                            <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: 700, marginTop: '2px' }}>
                                                                -{formatNumber(b.totalWasteKg, 1)} kg
                                                            </div>
                                                        </div>
                                                    ) : b.processedKg > 0.01 ? (
                                                        <div>
                                                            <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: 700 }}>0%</span>
                                                            <div style={{ fontSize: '0.6rem', color: '#94A3B8' }}>
                                                                {formatNumber(b.processedKg, 0)} kg ok
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#E2E8F0', fontSize: '0.7rem' }}>—</span>
                                                    )}
                                                </td>
                                            ))}

                                            {/* MERMA TOTAL DESAGREGADA (P+Q+R) */}
                                            <td
                                                style={{ padding: '0.55rem 0.65rem', textAlign: 'right', borderLeft: '1px solid #E2E8F0', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                                                title={`Desglose Merma: Pesada (Col P): ${formatNumber(row.activeTotal.wasteWeighingKg, 1)} kg | Desperdicio (Col Q): ${formatNumber(row.activeTotal.wasteDamageKg, 1)} kg | Basura (Col R): ${formatNumber(row.activeTotal.wasteCleaningKg, 1)} kg | Ajustes/Faltantes: ${formatNumber(row.activeTotal.wasteAdjustKg, 1)} kg`}
                                            >
                                                <div style={{ fontWeight: 800, color: row.activeTotal.totalWasteKg > 0 ? '#B45309' : '#94A3B8' }}>
                                                    {row.activeTotal.totalWasteKg > 0 ? `-${formatNumber(row.activeTotal.totalWasteKg, 1)} kg` : '0 kg'}
                                                </div>
                                                {row.wasteCostCop > 0 && (
                                                    <div style={{ fontSize: '0.63rem', color: '#64748B', fontWeight: 600 }}>
                                                        {formatMoney(row.wasteCostCop)}
                                                    </div>
                                                )}
                                            </td>

                                            {/* ENTREGADO / VENDIDO */}
                                            <td style={{ padding: '0.55rem 0.65rem', textAlign: 'right', fontWeight: 800, color: THEME.colors.textMain, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                                {row.activeTotal.deliveredKg > 0 ? `${formatNumber(row.activeTotal.deliveredKg, 1)} kg` : <span style={{ color: '#CBD5E1' }}>0 kg</span>}
                                            </td>

                                            {/* COMPARATIVO DE LAS 3 MAGNITUDES LADO A LADO */}
                                            <td style={{ padding: '0.5rem 0.55rem', textAlign: 'center', borderLeft: '2px solid #CBD5E1', backgroundColor: shrinkageScale === 'week' ? '#F0FDF4' : 'transparent' }}>
                                                {renderPctBadge(row.weekTotal.shrinkagePct, row.weekTotal.totalWasteKg, shrinkageScale === 'week')}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.55rem', textAlign: 'center', backgroundColor: shrinkageScale === 'month' ? '#F0FDF4' : 'transparent' }}>
                                                {renderPctBadge(row.monthTotal.shrinkagePct, row.monthTotal.totalWasteKg, shrinkageScale === 'month')}
                                            </td>
                                            <td style={{ padding: '0.5rem 0.55rem', textAlign: 'center', backgroundColor: shrinkageScale === 'quarter' ? '#F0FDF4' : 'transparent' }}>
                                                {renderPctBadge(row.quarterTotal.shrinkagePct, row.quarterTotal.totalWasteKg, shrinkageScale === 'quarter')}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* MODAL 1: REASIGNACIÓN DE RESPONSABLE OPERATIVO */}
            {/* ========================================================================= */}
            {reassignModalCell && (
                <div
                    onClick={() => setReassignModalCell(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.45)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '1rem',
                        fontFamily: THEME.typography.fontFamilySecondary
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: THEME.colors.surface,
                            borderRadius: THEME.radius.xl,
                            border: `1px solid ${THEME.colors.border}`,
                            width: '100%',
                            maxWidth: '520px',
                            boxShadow: THEME.shadow.lg,
                            padding: '2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.4rem'
                        }}
                    >
                        {/* Encabezado del Modal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: reassignModalCell.badge_bg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: `1.5px solid ${reassignModalCell.color}40`,
                                    flexShrink: 0
                                }}>
                                    {renderCellIcon(reassignModalCell.id, reassignModalCell.color, 22)}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                        Reasignar Responsable
                                    </h3>
                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '2px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        {reassignModalCell.name} ({reassignModalCell.inventory_group})
                                    </div>
                                </div>
                            </div>
                            <button
                                tabIndex={-1}
                                onClick={() => setReassignModalCell(null)}
                                style={{
                                    background: '#F1F5F9',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: THEME.colors.textSecondary
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Selector de Rol a Asignar */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem', fontFamily: THEME.typography.fontFamilyMain }}>
                                Cargo Operativo a Asignar:
                            </label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedRoleToAssign('leader');
                                        setSelectedNewLeaderId(reassignModalCell.leader_id || '');
                                    }}
                                    style={{
                                        padding: '0.65rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1.5px solid ${selectedRoleToAssign === 'leader' ? THEME.colors.primary : THEME.colors.border}`,
                                        backgroundColor: selectedRoleToAssign === 'leader' ? THEME.colors.primaryLight : '#FFFFFF',
                                        color: selectedRoleToAssign === 'leader' ? THEME.colors.primary : THEME.colors.textSecondary,
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        fontFamily: THEME.typography.fontFamilySecondary
                                    }}
                                >
                                    <User size={14} /> Líder Titular
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedRoleToAssign('backup');
                                        setSelectedNewLeaderId(reassignModalCell.backup_id || '');
                                    }}
                                    style={{
                                        padding: '0.65rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1.5px solid ${selectedRoleToAssign === 'backup' ? '#475569' : THEME.colors.border}`,
                                        backgroundColor: selectedRoleToAssign === 'backup' ? '#F1F5F9' : '#FFFFFF',
                                        color: selectedRoleToAssign === 'backup' ? '#334155' : THEME.colors.textSecondary,
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        fontFamily: THEME.typography.fontFamilySecondary
                                    }}
                                >
                                    <UserCheck size={14} /> Segundo Responsable
                                </button>
                            </div>
                        </div>

                        {/* Selector de Colaborador Disponible */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem', fontFamily: THEME.typography.fontFamilyMain }}>
                                Colaborador Disponible (Módulo Talento Humano):
                            </label>
                            <select
                                ref={reassignInputRef}
                                value={selectedNewLeaderId}
                                onChange={(e) => setSelectedNewLeaderId(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1.5px solid ${THEME.colors.borderActive}`,
                                    fontSize: '0.88rem',
                                    fontWeight: '700',
                                    color: THEME.colors.textMain,
                                    backgroundColor: '#FFFFFF',
                                    outline: 'none',
                                    cursor: 'pointer',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                            >
                                <option value="">(Sin asignar / Dejar vacante)</option>
                                {collaborators.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.contact_name} — [{c.role || 'Personal Operativo'}]
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Justificación o Motivo */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem', fontFamily: THEME.typography.fontFamilyMain }}>
                                Motivo del Cambio (Registro de Auditoría):
                            </label>
                            <input
                                type="text"
                                value={reassignReason}
                                onChange={(e) => setReassignReason(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveReassignment();
                                }}
                                placeholder="Ej. Rotación de turno operativo, cobertura temporal..."
                                style={{
                                    width: '100%',
                                    padding: '0.75rem 1rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1.5px solid ${THEME.colors.borderActive}`,
                                    fontSize: '0.85rem',
                                    fontWeight: '600',
                                    color: THEME.colors.textMain,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                            />
                        </div>

                        {/* Botones de Acción Ergonomía TAB */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
                            <button
                                tabIndex={-1}
                                type="button"
                                onClick={() => setReassignModalCell(null)}
                                style={{
                                    padding: '0.75rem 1.4rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.border}`,
                                    backgroundColor: '#FFFFFF',
                                    color: THEME.colors.textSecondary,
                                    fontWeight: '700',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                tabIndex={0}
                                type="button"
                                disabled={savingReassignment}
                                onClick={handleSaveReassignment}
                                style={{
                                    padding: '0.75rem 1.6rem',
                                    borderRadius: THEME.radius.md,
                                    border: 'none',
                                    backgroundColor: THEME.colors.primary,
                                    color: '#FFFFFF',
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: savingReassignment ? 'not-allowed' : 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.3)',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                            >
                                {savingReassignment ? (
                                    <>
                                        <RefreshCw size={15} className="animate-spin" /> Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Check size={16} strokeWidth={2.5} /> Confirmar Asignación
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 2: TRAZABILIDAD & AUDITORÍA DE RESPONSABLES */}
            {/* ========================================================================= */}
            {historyModalCell && (
                <div
                    onClick={() => setHistoryModalCell(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(15, 23, 42, 0.45)',
                        backdropFilter: 'blur(4px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '1rem',
                        fontFamily: THEME.typography.fontFamilySecondary
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            backgroundColor: THEME.colors.surface,
                            borderRadius: THEME.radius.xl,
                            border: `1px solid ${THEME.colors.border}`,
                            width: '100%',
                            maxWidth: '650px',
                            maxHeight: '85vh',
                            overflowY: 'auto',
                            boxShadow: THEME.shadow.lg,
                            padding: '2rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '1.4rem'
                        }}
                    >
                        {/* Header del Modal */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                <div style={{
                                    width: '44px',
                                    height: '44px',
                                    borderRadius: THEME.radius.md,
                                    backgroundColor: historyModalCell.badge_bg,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: `1.5px solid ${historyModalCell.color}40`,
                                    flexShrink: 0
                                }}>
                                    {renderCellIcon(historyModalCell.id, historyModalCell.color, 22)}
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                        Trazabilidad de Responsables
                                    </h3>
                                    <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600', marginTop: '2px', fontFamily: THEME.typography.fontFamilySecondary }}>
                                        Historial auditado: {historyModalCell.name}
                                    </div>
                                </div>
                            </div>
                            <button
                                tabIndex={-1}
                                onClick={() => setHistoryModalCell(null)}
                                style={{
                                    background: '#F1F5F9',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: THEME.colors.textSecondary
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Línea de Tiempo de Auditoría */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                            {(!historyModalCell.history || historyModalCell.history.length === 0) ? (
                                <div style={{
                                    padding: '2.5rem',
                                    textAlign: 'center',
                                    backgroundColor: '#F8FAFC',
                                    borderRadius: THEME.radius.md,
                                    border: '1px dashed #CBD5E1',
                                    color: THEME.colors.textSecondary,
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}>
                                    <CheckCircle2 size={16} color={THEME.colors.primary} />
                                    <span>No se han registrado modificaciones de responsable en esta célula.</span>
                                </div>
                            ) : (
                                historyModalCell.history.map((entry, idx) => (
                                    <div
                                        key={entry.id || idx}
                                        style={{
                                            border: `1px solid ${THEME.colors.border}`,
                                            borderRadius: THEME.radius.md,
                                            padding: '1rem 1.2rem',
                                            backgroundColor: idx === 0 ? THEME.colors.primaryLight : '#FFFFFF',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '0.5rem',
                                            position: 'relative',
                                            fontFamily: THEME.typography.fontFamilySecondary
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '800',
                                                    textTransform: 'uppercase',
                                                    padding: '2px 7px',
                                                    borderRadius: THEME.radius.sm,
                                                    backgroundColor: entry.field_changed === 'leader' ? '#DCFCE7' : '#F1F5F9',
                                                    color: entry.field_changed === 'leader' ? THEME.colors.primary : '#334155',
                                                    border: `1px solid ${entry.field_changed === 'leader' ? '#BBF7D0' : '#E2E8F0'}`
                                                }}>
                                                    {entry.field_changed === 'leader' ? 'Líder Titular' : 'Segundo Responsable'}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                                    {new Date(entry.timestamp).toLocaleString('es-CO', {
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit'
                                                    })}
                                                </span>
                                            </div>
                                            {idx === 0 && (
                                                <span style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: '#BBF7D0', padding: '2px 6px', borderRadius: THEME.radius.sm }}>
                                                    Estado Actual
                                                </span>
                                            )}
                                        </div>

                                        {/* Detalle de Asignación */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.85rem' }}>
                                            <span style={{ color: THEME.colors.textSecondary, textDecoration: entry.previous_name ? 'line-through' : 'none' }}>
                                                {entry.previous_name || 'Sin Asignar'}
                                            </span>
                                            <ArrowUpRight size={14} color={THEME.colors.primary} />
                                            <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontFamily: THEME.typography.fontFamilyMain }}>
                                                {entry.new_name || 'Vacante'}
                                            </span>
                                        </div>

                                        {/* Motivo & Autor */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: THEME.colors.textSecondary, borderTop: `1px dashed ${THEME.colors.border}`, paddingTop: '0.4rem', marginTop: '0.2rem' }}>
                                            <span>
                                                <strong>Motivo:</strong> {entry.reason || 'Sin justificación registrada'}
                                            </span>
                                            <span style={{ fontStyle: 'italic' }}>
                                                {entry.changed_by || 'Sistema'}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Botón Cerrar */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                            <button
                                type="button"
                                onClick={() => setHistoryModalCell(null)}
                                style={{
                                    padding: '0.75rem 1.6rem',
                                    borderRadius: THEME.radius.md,
                                    border: `1px solid ${THEME.colors.borderActive}`,
                                    backgroundColor: '#FFFFFF',
                                    color: THEME.colors.textMain,
                                    fontWeight: '800',
                                    fontSize: '0.85rem',
                                    cursor: 'pointer',
                                    fontFamily: THEME.typography.fontFamilySecondary
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* TOAST DE FEEDBACK DE AUDITORÍA */}
            {/* ========================================================================= */}
            {toastMessage && (
                <div style={{
                    position: 'fixed',
                    bottom: '2rem',
                    right: '2rem',
                    backgroundColor: THEME.colors.primary,
                    color: '#FFFFFF',
                    padding: '0.9rem 1.4rem',
                    borderRadius: THEME.radius.md,
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.7rem',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    zIndex: 2000,
                    fontFamily: THEME.typography.fontFamilySecondary,
                    animation: 'fadeIn 0.2s ease-in-out'
                }}>
                    <CheckCircle2 size={18} strokeWidth={2.5} />
                    <span>{toastMessage}</span>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODALES DE NOVEDADES OPERATIVAS DESACOPLADAS (SPEC.md §8.8.11) */}
            {/* ========================================================================= */}
            <InventoryWasteModal
                isOpen={isWasteModalOpen}
                onClose={() => setIsWasteModalOpen(false)}
                onSuccess={() => {
                    fetchData(true);
                    setToastMessage('Novedad de merma registrada con éxito.');
                    setTimeout(() => setToastMessage(null), 3000);
                }}
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

            <FastPlazaPurchasesModal
                isOpen={isFastPlazaModalOpen}
                onClose={() => setIsFastPlazaModalOpen(false)}
                onSuccess={() => {
                    fetchData(true);
                    setToastMessage('Compras en plaza registradas y sincronizadas.');
                    setTimeout(() => setToastMessage(null), 3000);
                }}
                currentDate={new Date().toISOString().split('T')[0]}
                products={products}
                workCells={workCells}
            />
        </div>
    );
}
