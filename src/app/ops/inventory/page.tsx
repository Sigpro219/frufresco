'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { 
    Truck, 
    Package, 
    Plus, 
    CheckCircle2, 
    Building2, 
    Camera, 
    X, 
    Search, 
    RotateCcw, 
    ClipboardCheck, 
    ArrowRight, 
    Save, 
    Layers, 
    AlertCircle,
    Check,
    ChevronDown,
    ChevronRight,
    RefreshCw,
    Globe,
    Lock,
    PackageCheck,
    ClipboardList,
    MessageSquare,
    Warehouse,
    Trash2,
    HeartHandshake,
    Sparkles,
    Apple,
    Carrot,
    Salad,
    Boxes,
    Milk,
    Sprout,
    Beef,
    Wheat
} from 'lucide-react';

interface InventoryTask {
    id: string;
    scheduled_date: string;
    status: 'pending' | 'in_progress' | 'completed';
    items: TaskItem[];
}

interface TaskItem {
    id: string;
    product_id: string;
    products: {
        name: string;
        sku?: string;
        accounting_id?: number | null;
        unit_of_measure: string;
        category?: string;
    };
    warehouse_id: string;
    expected_qty: number;
    actual_qty: number;
    difference_percent: number;
    status: 'pending' | 'counted' | 'reconciled';
}

import { WorkCell } from '@/types/workCells';
import InventoryWasteModal from '@/components/InventoryWasteModal';

interface ProductWithStock {
    id: string;
    name: string;
    accounting_id: number | null;
    category: string | null;
    inventory_group?: string | null;
    buying_team?: string | null;
    unit_of_measure: string;
    parent_id: string | null;
    is_active: boolean;
    inventory_stocks?: {
        id: string;
        quantity: number;
        status: string;
        warehouse_id: string;
    }[];
}

interface ProductFamily {
    id: string;
    parent: ProductWithStock;
    isParent: boolean;
    children: ProductWithStock[];
}

interface VerificationLog {
    id: string;
    product_id: string;
    verified_qty: number;
    system_qty: number;
    difference_percent: number;
    verified_by?: string;
    notes?: string;
    created_at: string;
    products?: {
        name: string;
        sku?: string;
        unit_of_measure: string;
    };
}

const renderCellLucideIcon = (cell?: WorkCell | null, size = 15) => {
    if (!cell) return <Layers size={size} />;
    const iconKey = (cell.icon || '').toLowerCase();
    const name = (cell.short_name || cell.name || '').toLowerCase();
    if (iconKey === 'sprout' || iconKey === '🥬' || name.includes('hortaliza')) return <Sprout size={size} />;
    if (iconKey === 'carrot' || iconKey === '🥦' || name.includes('verdura')) return <Carrot size={size} />;
    if (iconKey === 'apple' || iconKey === '🍎' || name.includes('fruta')) return <Apple size={size} />;
    if (iconKey === 'boxes' || iconKey === '🧀' || name.includes('abarrote') || name.includes('seco')) return <Boxes size={size} />;
    if (iconKey === 'layers' || iconKey === '🥔' || name.includes('tuberculo') || name.includes('papa') || name.includes('platano') || name.includes('tomate')) return <Layers size={size} />;
    if (iconKey === 'milk' || iconKey === '🥛' || name.includes('lacteo') || name.includes('lácteo')) return <Milk size={size} />;
    if (iconKey === 'beef' || iconKey === '🥩' || name.includes('carne')) return <Beef size={size} />;
    if (iconKey === 'wheat' || iconKey === '🌾' || name.includes('grano')) return <Wheat size={size} />;
    return <Package size={size} />;
};

const DEFAULT_WORK_CELLS: WorkCell[] = [
    {
        id: 'cell_abarrotes',
        name: 'Célula de Abarrotes, Frutos Secos, Lácteos & Carnes Frías',
        short_name: 'Abarrotes, Frutos Secos, Lácteos & Carnes Frías',
        icon: 'boxes',
        inventory_group: 'INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS',
        categories: ['ABARROTES', 'LACTEOS', 'CARNES'],
        buying_teams: [],
        leader_id: null,
        leader_name: 'CORONADO',
        color: '#D97706',
        badge_bg: '#FEF3C7',
        badge_text: '#92400E',
        description: 'Abarrotes, frutos secos, lácteos y carnes frías'
    },
    {
        id: 'cell_frutas',
        name: 'Célula de Frutas & Otros',
        short_name: 'Frutas & Otros',
        icon: 'apple',
        inventory_group: 'INVENTARIO DE FRUTAS Y OTROS',
        categories: ['FRUTAS'],
        buying_teams: [],
        leader_id: null,
        leader_name: 'MENDOZA',
        color: '#E11D48',
        badge_bg: '#FFE4E6',
        badge_text: '#9F1239',
        description: 'Frutas frescas y otros'
    },
    {
        id: 'cell_verduras',
        name: 'Célula de Verduras',
        short_name: 'Verduras',
        icon: 'carrot',
        inventory_group: 'INVENTARIO DE VERDURAS',
        categories: ['VERDURAS'],
        buying_teams: [],
        leader_id: null,
        leader_name: 'GALVIS',
        color: '#059669',
        badge_bg: '#D1FAE5',
        badge_text: '#065F46',
        description: 'Verduras de hoja y tallo'
    },
    {
        id: 'cell_hortalizas',
        name: 'Célula de Hortalizas',
        short_name: 'Hortalizas',
        icon: 'sprout',
        inventory_group: 'INVENTARIO DE HORTALIZAS',
        categories: ['HORTALIZAS'],
        buying_teams: [],
        leader_id: null,
        leader_name: 'LEAL',
        color: '#10B981',
        badge_bg: '#CCFBF1',
        badge_text: '#115E59',
        description: 'Hortalizas y hierbas'
    },
    {
        id: 'cell_papas',
        name: 'Célula de Papas, Plátano, Tomate y Aguacates',
        short_name: 'Papas, Plátano, Tomate & Aguacates',
        icon: 'layers',
        inventory_group: 'INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES',
        categories: ['TUBERCULOS'],
        buying_teams: [],
        leader_id: null,
        leader_name: 'BAUTISTA',
        color: '#EA580C',
        badge_bg: '#FFEDD5',
        badge_text: '#9A3412',
        description: 'Papas, plátanos, tomates y aguacates'
    }
];

export default function OpsInventoryPage() {
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'full_count' | 'returns' | 'audits'>('full_count');
    const [submitting, setSubmitting] = useState(false);
    const router = useRouter();
    const isMounted = useRef(true);

    // Gobernanza por Células de Trabajo
    const [workCells, setWorkCells] = useState<WorkCell[]>(DEFAULT_WORK_CELLS);
    const [selectedCellId, setSelectedCellId] = useState<string>('ALL');
    const [stockFilterMode, setStockFilterMode] = useState<'with_stock' | 'all'>('with_stock');

    // Conteo Físico State
    const [products, setProducts] = useState<ProductWithStock[]>([]);
    const [warehouseId, setWarehouseId] = useState<string>('d606c381-45bd-45f3-a0a9-9b8b3b196ac3');
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [filterOnlyWithCount, setFilterOnlyWithCount] = useState<boolean>(false);
    const [savingItem, setSavingItem] = useState<string | null>(null);
    const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

    // Retornos & Auditorías State
    const [activeTask, setActiveTask] = useState<InventoryTask | null>(null);
    const [auditCounts, setAuditCounts] = useState<Record<string, string>>({});
    const [pendingReturns, setPendingReturns] = useState<any[]>([]);
    const [isWasteModalOpen, setIsWasteModalOpen] = useState(false);

    const cellByGroup = useMemo(() => {
        const map = new Map<string, WorkCell>();
        (workCells || []).forEach(c => {
            if (c.inventory_group) {
                map.set(c.inventory_group.trim().toUpperCase(), c);
            }
        });
        return map;
    }, [workCells]);

    const activeSelectedCell = useMemo(() => {
        if (selectedCellId === 'ALL') return null;
        return workCells.find(c => c.id === selectedCellId) || null;
    }, [selectedCellId, workCells]);

    const getProductCell = useCallback((p?: ProductWithStock | null): WorkCell | null => {
        if (!p?.inventory_group) return null;
        return cellByGroup.get(p.inventory_group.trim().toUpperCase()) || null;
    }, [cellByGroup]);

    const fetchWorkCells = useCallback(async () => {
        try {
            const { data } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'work_cells_governance')
                .maybeSingle();

            if (data?.value) {
                const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                if (Array.isArray(parsed) && parsed.length > 0) {
                    setWorkCells(parsed);
                }
            }
        } catch (e) {
            console.error('Error fetching work cells in ops inventory:', e);
        }
    }, []);

    useEffect(() => {
        fetchWorkCells();
    }, [fetchWorkCells]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // 1. Cargar productos activos con su stock para Conteo Físico Total
    const fetchCountProducts = useCallback(async () => {
        try {
            setLoading(true);
            const { data: whData } = await supabase.from('warehouses').select('id').limit(1).single();
            if (whData?.id) {
                setWarehouseId(whData.id);
            }

            const { data, error } = await supabase
                .from('products')
                .select(`
                    id, name, accounting_id, category, inventory_group, buying_team, unit_of_measure, parent_id, is_active,
                    inventory_stocks!product_id (
                        id, quantity, status, warehouse_id
                    )
                `)
                .eq('is_active', true)
                .order('accounting_id', { ascending: true })
                .limit(2000);

            if (!isMounted.current) return;

            if (error) {
                console.error('Error fetching products for count:', error);
                window.showToast?.('Error al cargar productos para conteo', 'error');
            } else if (data) {
                setProducts(data as ProductWithStock[]);
            }
        } catch (err) {
            if (!isAbortError(err)) {
                console.error('Error in fetchCountProducts:', err);
            }
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    // 2. Cargar auditorías a ciegas existentes (si hay alguna previa)
    const fetchTasks = useCallback(async () => {
        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];
            const { data, error } = await supabase
                .from('inventory_random_tasks')
                .select(`
                    *,
                    items:inventory_task_items (
                        id,
                        product_id,
                        actual_qty,
                        products (name, sku, accounting_id, unit_of_measure, category)
                    )
                `)
                .or(`scheduled_date.eq.${today},status.eq.pending`)
                .order('created_at', { ascending: false });

            if (!isMounted.current) return;

            if (!error && data) {
                const pending = data.find(t => t.status !== 'completed');
                setActiveTask(pending || null);
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error('Error fetching floor tasks:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    // 3. Cargar retornos pendientes de ruta
    const fetchReturns = useCallback(async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('inventory_movements')
                .select(`
                    id, created_at, quantity, notes, evidence_url,
                    products (name, sku, accounting_id, unit_of_measure)
                `)
                .eq('status_to', 'returned')
                .is('admin_decision', null)
                .order('created_at', { ascending: false });

            if (!isMounted.current) return;

            if (!error && data) {
                setPendingReturns(data);
            }
        } catch (err) {
            console.error('Error fetching returns:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (activeView === 'full_count') {
            fetchCountProducts();
        } else if (activeView === 'audits') {
            fetchTasks();
        } else if (activeView === 'returns') {
            fetchReturns();
        }
    }, [activeView, fetchCountProducts, fetchTasks, fetchReturns]);

    // 4. Agrupar productos en familias (Padre -> Hijos) para evitar fraccionamiento divergente
    const families = useMemo(() => {
        if (!products || products.length === 0) return [];

        const parentIdsWithChildren = new Set(
            products.filter(p => p.parent_id).map(p => p.parent_id as string)
        );

        const map: Record<string, ProductFamily> = {};

        products.forEach(p => {
            if (!p.parent_id) {
                map[p.id] = {
                    id: p.id,
                    parent: p,
                    isParent: parentIdsWithChildren.has(p.id),
                    children: []
                };
            }
        });

        products.forEach(p => {
            if (p.parent_id) {
                if (map[p.parent_id]) {
                    map[p.parent_id].children.push(p);
                } else {
                    // Huérfano: tratar como familia independiente
                    map[p.id] = {
                        id: p.id,
                        parent: p,
                        isParent: false,
                        children: []
                    };
                }
            }
        });

        return Object.values(map);
    }, [products]);

    // 5. Estadísticas de inventario por Célula
    const cellStats = useMemo(() => {
        const stats: Record<string, { totalItems: number; withStockItems: number }> = {};
        workCells.forEach(c => {
            stats[c.id] = { totalItems: 0, withStockItems: 0 };
        });

        products.forEach(p => {
            const cell = getProductCell(p);
            if (cell && stats[cell.id]) {
                stats[cell.id].totalItems++;
                const qty = Number(p.inventory_stocks?.find(s => s.warehouse_id === warehouseId)?.quantity || p.inventory_stocks?.[0]?.quantity || 0);
                if (qty > 0.0001) {
                    stats[cell.id].withStockItems++;
                }
            }
        });
        return stats;
    }, [workCells, products, getProductCell, warehouseId]);

    // 6. Filtrar familias por Célula / Grupo de Inventario, Búsqueda y Existencias Teóricas
    const filteredFamilies = useMemo(() => {
        return families.filter(fam => {
            // A. Filtro por Célula / Grupo de Inventario
            if (selectedCellId !== 'ALL' && activeSelectedCell) {
                const targetGroup = (activeSelectedCell.inventory_group || '').trim().toUpperCase();
                const parentGroup = (fam.parent.inventory_group || '').trim().toUpperCase();
                const parentMatches = parentGroup === targetGroup;
                const childMatches = fam.children.some(c => 
                    (c.inventory_group || '').trim().toUpperCase() === targetGroup
                );
                if (!parentMatches && !childMatches) return false;
            }

            // B. Filtro por término de búsqueda (Nombre o ID Contable)
            const hasSearch = Boolean(searchTerm.trim());
            if (hasSearch) {
                const term = searchTerm.toLowerCase().trim();
                const parentMatch = 
                    fam.parent.name.toLowerCase().includes(term) ||
                    String(fam.parent.accounting_id || '').includes(term);

                const childMatch = fam.children.some(c => 
                    c.name.toLowerCase().includes(term) ||
                    String(c.accounting_id || '').includes(term)
                );

                if (!parentMatch && !childMatch) return false;
            }

            // C. Filtro por Existencias Teóricas vs Todo el Catálogo
            // Si stockFilterMode === 'with_stock':
            // Se mantiene si:
            // - El usuario buscó algo explícitamente (hasSearch) -> permite encontrar ítems en cero fácilmente
            // - O ya se le ingresó conteo físico en la sesión (hasParentCount || hasChildCount)
            // - O tiene existencia teórica > 0 en bodega
            if (stockFilterMode === 'with_stock' && !hasSearch) {
                const parentStock = Number(
                    fam.parent.inventory_stocks?.find(s => s.warehouse_id === warehouseId)?.quantity || 
                    fam.parent.inventory_stocks?.[0]?.quantity || 0
                );
                const childrenStockSum = fam.children.reduce((acc, c) => {
                    const st = c.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || c.inventory_stocks?.[0];
                    return acc + Number(st?.quantity || 0);
                }, 0);

                const totalSysStock = fam.isParent ? childrenStockSum : parentStock;
                const hasSysStock = totalSysStock > 0.0001;

                const hasParentCount = counts[fam.parent.id] !== undefined && counts[fam.parent.id] !== '';
                const hasChildCount = fam.children.some(c => counts[c.id] !== undefined && counts[c.id] !== '');

                if (!hasSysStock && !hasParentCount && !hasChildCount) return false;
            }

            // D. Filtro por solo los que tienen conteo ingresado
            if (filterOnlyWithCount) {
                const hasParentCount = counts[fam.parent.id] !== undefined && counts[fam.parent.id] !== '';
                const hasChildCount = fam.children.some(c => counts[c.id] !== undefined && counts[c.id] !== '');
                if (!hasParentCount && !hasChildCount) return false;
            }

            return true;
        });
    }, [families, selectedCellId, activeSelectedCell, searchTerm, stockFilterMode, filterOnlyWithCount, counts, warehouseId]);

    // Conteo total de ítems ingresados por el usuario
    const totalCountedItemsCount = useMemo(() => {
        return Object.keys(counts).filter(id => counts[id] !== undefined && counts[id] !== '').length;
    }, [counts]);

    // 7. Aplicar ajuste individual
    const handleSaveSingleItem = async (product: ProductWithStock) => {
        const rawVal = counts[product.id];
        if (rawVal === undefined || rawVal === '' || isNaN(parseFloat(rawVal))) {
            alert('Ingrese una cantidad válida.');
            return;
        }

        const countedQty = parseFloat(rawVal);
        if (countedQty < 0) {
            alert('La cantidad no puede ser negativa.');
            return;
        }

        const currentStockRecord = product.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || product.inventory_stocks?.[0];
        const currentQty = Number(currentStockRecord?.quantity || 0);
        const diff = countedQty - currentQty;
        const cell = getProductCell(product) || activeSelectedCell;
        const cellInfo = cell ? ` | Célula: ${cell.name} (Líder: ${cell.leader_name || 'Sin asignar'})` : '';

        setSavingItem(product.id);
        try {
            if (Math.abs(diff) > 0.0001) {
                const { error } = await supabase.from('inventory_movements').insert([{
                    product_id: product.id,
                    warehouse_id: warehouseId,
                    quantity: diff,
                    type: 'adjustment',
                    status_to: 'available',
                    notes: `Cruce a ciegas fin de turno${cellInfo} | Stock anterior: ${currentQty} -> Contado: ${countedQty} (Dif: ${diff > 0 ? '+' : ''}${diff.toFixed(2)})` + (itemNotes[product.id] ? ` | Obs: ${itemNotes[product.id]}` : ''),
                    reference_type: 'blind_count_shift_close'
                }]);

                if (error) throw error;
            }

            window.showToast?.(`${product.name} ajustado a ${countedQty} ${product.unit_of_measure}`, 'success');
            
            // Actualizar localmente el producto
            setProducts(prev => prev.map(p => {
                if (p.id !== product.id) return p;
                const updatedStocks = p.inventory_stocks?.map(s => {
                    if (s.warehouse_id === warehouseId || !s.warehouse_id) {
                        return { ...s, quantity: countedQty };
                    }
                    return s;
                }) || [{ id: '', quantity: countedQty, status: 'available', warehouse_id: warehouseId }];
                return { ...p, inventory_stocks: updatedStocks };
            }));

            // Limpiar conteo de este ítem
            setCounts(prev => {
                const next = { ...prev };
                delete next[product.id];
                return next;
            });
        } catch (err: any) {
            console.error('Error saving single item count:', err);
            alert(`Error al guardar: ${err?.message || 'Error desconocido'}`);
        } finally {
            setSavingItem(null);
        }
    };

    // 8. Guardar y Aplicar Conteo Físico en lote (Batch)
    const handleSavePhysicalCountBatch = async () => {
        const countedIds = Object.keys(counts).filter(id => {
            const val = counts[id];
            return val !== undefined && val !== '' && !isNaN(parseFloat(val));
        });

        if (countedIds.length === 0) {
            alert('Por favor ingrese al menos una cantidad física antes de guardar.');
            return;
        }

        const confirmMsg = `¿Desea registrar y aplicar el cruce a ciegas para los ${countedIds.length} productos ingresados?`;
        if (!confirm(confirmMsg)) return;

        setSubmitting(true);
        try {
            const movementRows: any[] = [];
            let adjustedCount = 0;

            for (const prodId of countedIds) {
                const product = products.find(p => p.id === prodId);
                if (!product) continue;

                const countedQty = parseFloat(counts[prodId]);
                if (countedQty < 0) continue;

                const stockRec = product.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || product.inventory_stocks?.[0];
                const currentQty = Number(stockRec?.quantity || 0);
                const diff = countedQty - currentQty;
                const cell = getProductCell(product) || activeSelectedCell;
                const cellInfo = cell ? ` | Célula: ${cell.name} (Líder: ${cell.leader_name || 'Sin asignar'})` : '';

                if (Math.abs(diff) > 0.0001) {
                    movementRows.push({
                        product_id: prodId,
                        warehouse_id: warehouseId,
                        quantity: diff,
                        type: 'adjustment',
                        status_to: 'available',
                        notes: `Cruce a ciegas fin de turno${cellInfo} | Stock anterior: ${currentQty} -> Contado: ${countedQty} (Dif: ${diff > 0 ? '+' : ''}${diff.toFixed(2)})` + (itemNotes[prodId] ? ` | Obs: ${itemNotes[prodId]}` : ''),
                        reference_type: 'blind_count_shift_close'
                    });
                    adjustedCount++;
                }
            }

            if (movementRows.length > 0) {
                const { error: insertError } = await supabase
                    .from('inventory_movements')
                    .insert(movementRows);

                if (insertError) throw insertError;
            }

            window.showToast?.(`Conteo físico aplicado exitosamente (${adjustedCount} productos actualizados)`, 'success');
            
            // Limpiar conteos y recargar
            setCounts({});
            setItemNotes({});
            await fetchCountProducts();
        } catch (err: any) {
            console.error('Error saving physical count batch:', err);
            alert(`Error al guardar conteo: ${err?.message || 'Error desconocido'}`);
        } finally {
            setSubmitting(false);
        }
    };

    // 8. Manejar auditoría a ciegas antigua
    const handleSubmitBlindAudit = async () => {
        if (!activeTask) return;
        setSubmitting(true);

        try {
            for (const item of activeTask.items) {
                const qtyStr = auditCounts[item.id];
                if (qtyStr !== undefined && qtyStr !== '') {
                    const { error } = await supabase
                        .from('inventory_task_items')
                        .update({ actual_qty: parseFloat(qtyStr) })
                        .eq('id', item.id);
                    if (error) throw error;
                }
            }

            await supabase
                .from('inventory_random_tasks')
                .update({ status: 'completed' })
                .eq('id', activeTask.id);

            window.showToast?.('Auditoría a ciegas completada', 'success');
            setActiveTask(null);
            fetchTasks();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error al guardar: ' + message);
        } finally {
            setSubmitting(false);
        }
    };

    // 9. Manejar decisión de retornos de ruta
    const handleReturnDecision = async (movementId: string, decision: 'inventory' | 'waste' | 'donation') => {
        setSubmitting(true);
        try {
            const movement = pendingReturns.find(m => m.id === movementId);
            if (!movement) return;

            const { error: updateError } = await supabase
                .from('inventory_movements')
                .update({ 
                    admin_decision: decision,
                    status_to: decision === 'inventory' ? 'available' : 'exit',
                    notes: `${movement.notes || ''} | Decisión Bodega: ${decision.toUpperCase()}`
                })
                .eq('id', movementId);

            if (updateError) throw updateError;

            window.showToast?.(`Producto gestionado como ${decision}`, 'success');
            fetchReturns();
        } catch (error) {
            alert('Error al procesar decisión');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleParentExpand = (parentId: string) => {
        setExpandedParents(prev => ({
            ...prev,
            [parentId]: prev[parentId] === undefined ? false : !prev[parentId]
        }));
    };

    if (loading && products.length === 0 && !activeTask && pendingReturns.length === 0) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--ops-bg)' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                        <Package size={44} color="var(--ops-primary)" className="animate-spin" />
                    </div>
                    <div style={{ fontWeight: '800', color: 'var(--ops-text)', fontSize: '1.2rem' }}>Cargando inventario operativo...</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', marginTop: '0.5rem' }}>Sincronizando existencias de bodega</div>
                </div>
            </div>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: 'var(--ops-bg)', paddingBottom: '7rem', color: 'var(--ops-text)' }}>
            <Toast />
            
            <div style={{ maxWidth: '850px', margin: '0 auto', padding: '1.5rem 1rem' }}>
                
                {/* Cabecera Principal */}
                <header style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    {/* Botones de Cambio de Vista */}
                    <div style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '0.4rem', 
                        backgroundColor: 'var(--ops-surface)', 
                        padding: '0.4rem', 
                        borderRadius: '100px', 
                        marginBottom: '1.2rem', 
                        border: '1px solid var(--ops-border)',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.04)'
                    }}>
                        <button 
                            onClick={() => setActiveView('full_count')}
                            style={{ 
                                padding: '0.55rem 1.25rem', 
                                borderRadius: '100px', 
                                border: 'none', 
                                backgroundColor: activeView === 'full_count' ? 'var(--ops-primary)' : 'transparent', 
                                color: activeView === 'full_count' ? 'white' : 'var(--ops-text-muted)', 
                                fontWeight: '800', 
                                fontSize: '0.8rem', 
                                cursor: 'pointer', 
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Package size={15} /> Conteo Físico Total
                        </button>
                        <button 
                            onClick={() => setActiveView('returns')}
                            style={{ 
                                padding: '0.55rem 1.25rem', 
                                borderRadius: '100px', 
                                border: 'none', 
                                backgroundColor: activeView === 'returns' ? '#F59E0B' : 'transparent', 
                                color: activeView === 'returns' ? 'white' : 'var(--ops-text-muted)', 
                                fontWeight: '800', 
                                fontSize: '0.8rem', 
                                cursor: 'pointer', 
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Truck size={15} /> Retornos 
                            {pendingReturns.length > 0 && (
                                <span style={{ 
                                    marginLeft: '2px', 
                                    backgroundColor: activeView === 'returns' ? 'white' : '#F59E0B', 
                                    color: activeView === 'returns' ? '#F59E0B' : 'white', 
                                    padding: '1px 6px', 
                                    borderRadius: '50%', 
                                    fontSize: '0.65rem' 
                                }}>
                                    {pendingReturns.length}
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => setActiveView('audits')}
                            style={{ 
                                padding: '0.55rem 1.25rem', 
                                borderRadius: '100px', 
                                border: 'none', 
                                backgroundColor: activeView === 'audits' ? '#6366F1' : 'transparent', 
                                color: activeView === 'audits' ? 'white' : 'var(--ops-text-muted)', 
                                fontWeight: '800', 
                                fontSize: '0.8rem', 
                                cursor: 'pointer', 
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <ClipboardCheck size={15} /> Auditorías a Ciegas
                        </button>
                        <button 
                            type="button"
                            onClick={() => setIsWasteModalOpen(true)}
                            style={{ 
                                padding: '0.55rem 1.25rem', 
                                borderRadius: '100px', 
                                border: 'none', 
                                backgroundColor: '#DC2626', 
                                color: 'white', 
                                fontWeight: '800', 
                                fontSize: '0.8rem', 
                                cursor: 'pointer', 
                                transition: 'all 0.2s',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)'
                            }}
                        >
                            <Camera size={15} /> + Merma / Salida
                        </button>
                    </div>

                    <h1 style={{ fontSize: '1.8rem', fontWeight: '950', color: 'var(--ops-text)', margin: 0, letterSpacing: '-0.5px' }}>
                        {activeView === 'full_count' && 'Conteo Físico a Ciegas por Célula'}
                        {activeView === 'returns' && 'Gestión de Retornos y Devoluciones'}
                        {activeView === 'audits' && 'Auditorías a Ciegas de Piso'}
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', marginTop: '0.35rem' }}>
                        {activeView === 'full_count' && 'Cruce de inventario operativo al cierre de turno por Jefe de Célula (Protocolo a Ciegas)'}
                        {activeView === 'returns' && 'Recepción de canastillas en patio y liquidación de sobrantes devueltos de ruta'}
                        {activeView === 'audits' && 'Muestreos aleatorios y auditorías de control programadas'}
                    </p>
                </header>

                {/* ========================================================================= */}
                {/* VISTA 1: CONTEO FÍSICO A CIEGAS POR CÉLULA                                */}
                {/* ========================================================================= */}
                {activeView === 'full_count' && (
                    <div>
                        {/* Barra Sticky de Búsqueda y Filtros */}
                        <div style={{ 
                            position: 'sticky', 
                            top: '10px', 
                            zIndex: 45, 
                            backgroundColor: 'var(--ops-surface)', 
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            padding: '1rem', 
                            borderRadius: '20px', 
                            border: '1px solid var(--ops-border)',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.85rem'
                        }}>
                            {/* Input de Búsqueda */}
                            <div style={{ position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ops-text-muted)' }} />
                                <input 
                                    type="text"
                                    placeholder="Buscar por nombre o ID Contable (incluso productos con stock 0)..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem 0.75rem 2.75rem',
                                        borderRadius: '12px',
                                        border: '1.5px solid var(--ops-border)',
                                        backgroundColor: 'var(--ops-bg)',
                                        color: 'var(--ops-text)',
                                        fontSize: '0.9rem',
                                        fontWeight: '700',
                                        outline: 'none'
                                    }}
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')}
                                        style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ops-text-muted)' }}
                                    >
                                        <X size={16} />
                                    </button>
                                )}
                            </div>

                            {/* Selector de Células de Trabajo / Grupos de Inventario */}
                            <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                                <button
                                    onClick={() => setSelectedCellId('ALL')}
                                    style={{
                                        padding: '0.5rem 0.95rem',
                                        borderRadius: '100px',
                                        border: selectedCellId === 'ALL' ? 'none' : '1px solid var(--ops-border)',
                                        backgroundColor: selectedCellId === 'ALL' ? 'var(--ops-text)' : 'var(--ops-bg)',
                                        color: selectedCellId === 'ALL' ? 'var(--ops-surface)' : 'var(--ops-text-muted)',
                                        fontWeight: '800',
                                        fontSize: '0.75rem',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        transition: 'all 0.15s'
                                    }}
                                >
                                    <Globe size={15} /> <span>Todas las Células</span>
                                </button>
                                {workCells.map(cell => {
                                    const isSelected = selectedCellId === cell.id;
                                    const withStockCount = cellStats[cell.id]?.withStockItems || 0;
                                    return (
                                        <button
                                            key={cell.id}
                                            onClick={() => setSelectedCellId(cell.id)}
                                            style={{
                                                padding: '0.5rem 0.95rem',
                                                borderRadius: '100px',
                                                border: isSelected ? `2px solid ${cell.color}` : '1px solid var(--ops-border)',
                                                backgroundColor: isSelected ? (cell.badge_bg || 'var(--ops-surface)') : 'var(--ops-bg)',
                                                color: isSelected ? (cell.badge_text || 'var(--ops-text)') : 'var(--ops-text-muted)',
                                                fontWeight: '800',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: isSelected ? `0 2px 10px ${cell.color}35` : 'none',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {renderCellLucideIcon(cell, 15)}
                                            <span>{cell.short_name || cell.name}</span>
                                            {cell.leader_name && (
                                                <span style={{ 
                                                    opacity: 0.9, 
                                                    fontWeight: '700',
                                                    fontSize: '0.68rem',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    backgroundColor: isSelected ? 'rgba(0,0,0,0.08)' : 'var(--ops-border)'
                                                }}>
                                                    {cell.leader_name.split(' ')[0]}
                                                </span>
                                            )}
                                            <span style={{ 
                                                fontSize: '0.65rem', 
                                                fontWeight: '800',
                                                backgroundColor: 'rgba(0,0,0,0.1)',
                                                padding: '1px 5px',
                                                borderRadius: '10px'
                                            }}>
                                                {withStockCount}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Banner Operativo de Célula Seleccionada */}
                            {activeSelectedCell && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    borderRadius: '14px',
                                    backgroundColor: activeSelectedCell.badge_bg || 'var(--ops-surface)',
                                    border: `1.5px solid ${activeSelectedCell.color}45`,
                                    color: activeSelectedCell.badge_text || 'var(--ops-text)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '0.5rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        {renderCellLucideIcon(activeSelectedCell, 22)}
                                        <div>
                                            <div style={{ fontWeight: '950', fontSize: '0.9rem' }}>
                                                {activeSelectedCell.name}
                                            </div>
                                            <div style={{ fontSize: '0.72rem', opacity: 0.9 }}>
                                                Líder: <b>{activeSelectedCell.leader_name || 'Sin asignar'}</b> · Cruce de inventario a ciegas
                                            </div>
                                        </div>
                                    </div>
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        backgroundColor: 'rgba(0,0,0,0.08)',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Lock size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Modo a Ciegas Activo
                                    </span>
                                </div>
                            )}

                            {/* Selector de Modo de Existencias: Solo con Stock vs Catálogo Completo */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                    <button
                                        onClick={() => setStockFilterMode('with_stock')}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '8px',
                                            border: stockFilterMode === 'with_stock' ? '1.5px solid var(--ops-primary)' : '1px solid var(--ops-border)',
                                            backgroundColor: stockFilterMode === 'with_stock' ? 'rgba(16, 185, 129, 0.12)' : 'var(--ops-bg)',
                                            color: stockFilterMode === 'with_stock' ? 'var(--ops-primary)' : 'var(--ops-text-muted)',
                                            fontSize: '0.73rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <PackageCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Con Existencias Teóricas
                                    </button>
                                    <button
                                        onClick={() => setStockFilterMode('all')}
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '8px',
                                            border: stockFilterMode === 'all' ? '1.5px solid var(--ops-primary)' : '1px solid var(--ops-border)',
                                            backgroundColor: stockFilterMode === 'all' ? 'rgba(16, 185, 129, 0.12)' : 'var(--ops-bg)',
                                            color: stockFilterMode === 'all' ? 'var(--ops-primary)' : 'var(--ops-text-muted)',
                                            fontSize: '0.73rem',
                                            fontWeight: '800',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <ClipboardList size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Catálogo Completo (Inc. Stock 0)
                                    </button>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', color: filterOnlyWithCount ? 'var(--ops-primary)' : 'var(--ops-text-muted)' }}>
                                        <input 
                                            type="checkbox" 
                                            checked={filterOnlyWithCount} 
                                            onChange={(e) => setFilterOnlyWithCount(e.target.checked)}
                                            style={{ accentColor: 'var(--ops-primary)', cursor: 'pointer' }}
                                        />
                                        Solo con conteo ({totalCountedItemsCount})
                                    </label>
                                    <button 
                                        onClick={fetchCountProducts} 
                                        title="Actualizar datos" 
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ops-text-muted)', display: 'flex', alignItems: 'center' }}
                                    >
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Mensaje de ayuda para productos con stock 0 */}
                            {stockFilterMode === 'with_stock' && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', borderTop: '1px dashed var(--ops-border)', paddingTop: '0.35rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.3rem' }}>
                                    <div>
                                        Mostrando <span style={{ color: 'var(--ops-text)', fontWeight: '900' }}>{filteredFamilies.length}</span> ítems con existencia teórica o buscados
                                    </div>
                                    <div>
                                        ¿Producto físico con saldo 0 en sistema? <span style={{ color: 'var(--ops-primary)', fontWeight: '700' }}>Escribe su nombre arriba para ingresarlo</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Listado de Familias y Productos */}
                        {filteredFamilies.length === 0 ? (
                            <div style={{ backgroundColor: 'var(--ops-surface)', padding: '3rem 2rem', borderRadius: '24px', textAlign: 'center', border: '1px solid var(--ops-border)' }}>
                                <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                                    <Search size={40} color="var(--ops-text-muted)" />
                                </div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: '900', margin: '0 0 0.5rem 0' }}>No se encontraron productos</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', margin: 0 }}>
                                    Intente modificando los filtros de categoría o el término de búsqueda.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {filteredFamilies.map(family => {
                                    const isParentWithVariants = family.isParent && family.children.length > 0;
                                    const isExpanded = expandedParents[family.id] !== false; // por defecto expandido

                                    // Lógica de cálculo reactivo para el padre
                                    const childrenCurrentStockSum = family.children.reduce((acc, c) => {
                                        const stockRec = c.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || c.inventory_stocks?.[0];
                                        return acc + Number(stockRec?.quantity || 0);
                                    }, 0);

                                    // Sumatoria reactiva de lo que se va contando
                                    const childrenCountedStockSum = family.children.reduce((acc, c) => {
                                        const raw = counts[c.id];
                                        if (raw !== undefined && raw !== '' && !isNaN(parseFloat(raw))) {
                                            return acc + parseFloat(raw);
                                        }
                                        const stockRec = c.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || c.inventory_stocks?.[0];
                                        return acc + Number(stockRec?.quantity || 0);
                                    }, 0);

                                    const anyChildHasCount = family.children.some(c => counts[c.id] !== undefined && counts[c.id] !== '');

                                    if (isParentWithVariants) {
                                        // RENDER PRODUCTO PADRE CON VARIANTES
                                        const parentCell = getProductCell(family.parent);

                                        return (
                                            <div 
                                                key={family.id} 
                                                style={{ 
                                                    backgroundColor: 'var(--ops-surface)', 
                                                    borderRadius: '24px', 
                                                    border: '1px solid var(--ops-border)',
                                                    overflow: 'hidden',
                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                                                }}
                                            >
                                                {/* Header Padre */}
                                                <div 
                                                    onClick={() => toggleParentExpand(family.id)}
                                                    style={{ 
                                                        padding: '1.25rem', 
                                                        backgroundColor: 'rgba(16, 185, 129, 0.04)', 
                                                        borderBottom: isExpanded ? '1px solid var(--ops-border)' : 'none',
                                                        display: 'flex', 
                                                        justifyContent: 'space-between', 
                                                        alignItems: 'center',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                        <div style={{ color: 'var(--ops-primary)', display: 'flex', alignItems: 'center' }}>
                                                            {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                                        </div>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontWeight: '950', fontSize: '1.05rem', color: 'var(--ops-text)' }}>
                                                                    {family.parent.name}
                                                                </span>
                                                                {family.parent.accounting_id && (
                                                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', backgroundColor: 'var(--ops-border)', color: 'var(--ops-text-muted)', padding: '2px 8px', borderRadius: '6px' }}>
                                                                        ID: {family.parent.accounting_id}
                                                                    </span>
                                                                )}
                                                                {parentCell && (
                                                                    <span style={{
                                                                        fontSize: '0.65rem',
                                                                        fontWeight: '800',
                                                                        backgroundColor: parentCell.badge_bg || 'var(--ops-bg)',
                                                                        color: parentCell.badge_text || 'var(--ops-primary)',
                                                                        border: `1px solid ${parentCell.color}40`,
                                                                        padding: '2px 7px',
                                                                        borderRadius: '6px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}>
                                                                        {renderCellLucideIcon(parentCell, 13)}
                                                                        <span>{parentCell.short_name || parentCell.name}</span>
                                                                    </span>
                                                                )}
                                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', backgroundColor: 'rgba(16, 185, 129, 0.15)', color: 'var(--ops-primary)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--ops-primary)' }}>
                                                                    PADRE ({family.children.length} variantes)
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                                                                Conteo a ciegas agrupado para las {family.children.length} variantes
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Estado de Conteo Padre a Ciegas (Sin mostrar stock de sistema) */}
                                                    <div style={{ textAlign: 'right' }}>
                                                        {anyChildHasCount ? (
                                                            <div style={{
                                                                fontSize: '0.8rem',
                                                                fontWeight: '950',
                                                                color: 'var(--ops-primary)',
                                                                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                                                padding: '4px 10px',
                                                                borderRadius: '8px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px'
                                                            }}>
                                                                <Check size={14} /> Contado: {childrenCountedStockSum.toFixed(2)} {family.parent.unit_of_measure}
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                fontSize: '0.72rem',
                                                                fontWeight: '800',
                                                                color: 'var(--ops-text-muted)',
                                                                backgroundColor: 'var(--ops-bg)',
                                                                border: '1px solid var(--ops-border)',
                                                                padding: '3px 8px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                Pendiente
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                        {/* Lista de Variantes (Hijos) */}
                                        {isExpanded && (
                                            <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                {family.children.map((child) => {
                                                    const rawVal = counts[child.id] || '';
                                                    const hasCount = rawVal !== '';
                                                    const isSavingThis = savingItem === child.id;

                                                    return (
                                                        <div 
                                                            key={child.id}
                                                            style={{
                                                                padding: '1rem',
                                                                backgroundColor: hasCount ? 'rgba(16, 185, 129, 0.08)' : 'var(--ops-bg)',
                                                                borderRadius: '16px',
                                                                border: hasCount ? '1.5px solid var(--ops-primary)' : '1px solid var(--ops-border)',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '0.75rem'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: '900', fontSize: '0.95rem', color: 'var(--ops-text)' }}>
                                                                        {child.name}
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px' }}>
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                                                            ID: {child.accounting_id || child.id.slice(0, 8)}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                                                            • Unidad: <b style={{ color: 'var(--ops-text)' }}>{child.unit_of_measure}</b>
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {hasCount ? (
                                                                    <div style={{
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: '900',
                                                                        padding: '3px 8px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                                        color: 'var(--ops-primary)',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}>
                                                                        <Check size={12} /> Contado: {parseFloat(rawVal).toFixed(2)} {child.unit_of_measure}
                                                                    </div>
                                                                ) : (
                                                                    <div style={{
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: '800',
                                                                        padding: '2px 7px',
                                                                        borderRadius: '6px',
                                                                        backgroundColor: 'var(--ops-surface)',
                                                                        color: 'var(--ops-text-muted)',
                                                                        border: '1px solid var(--ops-border)'
                                                                    }}>
                                                                        Pendiente
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Input de Conteo a Ciegas */}
                                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                                <div style={{ position: 'relative', flex: 1 }}>
                                                                    <input 
                                                                        type="number"
                                                                        step="any"
                                                                        placeholder="0.00"
                                                                        value={rawVal}
                                                                        onChange={(e) => setCounts({ ...counts, [child.id]: e.target.value })}
                                                                        style={{
                                                                            width: '100%',
                                                                            padding: '0.8rem 3.5rem 0.8rem 1rem',
                                                                            borderRadius: '12px',
                                                                            border: '1.5px solid var(--ops-border)',
                                                                            backgroundColor: 'var(--ops-surface)',
                                                                            fontSize: '1.25rem',
                                                                            fontWeight: '950',
                                                                            color: 'var(--ops-text)',
                                                                            outline: 'none'
                                                                        }}
                                                                    />
                                                                    <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>
                                                                        {child.unit_of_measure}
                                                                    </div>
                                                                </div>

                                                                {/* Botón Guardar Individual */}
                                                                {hasCount && (
                                                                    <button
                                                                        onClick={() => handleSaveSingleItem(child)}
                                                                        disabled={isSavingThis}
                                                                        title="Aplicar ajuste para este producto"
                                                                        style={{
                                                                            padding: '0.8rem 1rem',
                                                                            borderRadius: '12px',
                                                                            border: 'none',
                                                                            backgroundColor: 'var(--ops-primary)',
                                                                            color: 'white',
                                                                            fontWeight: '800',
                                                                            fontSize: '0.8rem',
                                                                            cursor: 'pointer',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}
                                                                    >
                                                                        {isSavingThis ? '...' : <Check size={18} />}
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            }

                            // RENDER PRODUCTO STANDALONE (Sin variantes)
                            const standaloneProduct = family.parent;
                            const rawVal = counts[standaloneProduct.id] || '';
                            const hasCount = rawVal !== '';
                            const isSavingThis = savingItem === standaloneProduct.id;
                            const productCell = getProductCell(standaloneProduct);

                            return (
                                <div 
                                    key={standaloneProduct.id}
                                    style={{
                                        backgroundColor: 'var(--ops-surface)',
                                        borderRadius: '24px',
                                        border: hasCount ? '1.5px solid var(--ops-primary)' : '1px solid var(--ops-border)',
                                        padding: '1.25rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.85rem',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: '950', fontSize: '1.05rem', color: 'var(--ops-text)' }}>
                                                    {standaloneProduct.name}
                                                </span>
                                                {standaloneProduct.accounting_id && (
                                                    <span style={{ fontSize: '0.7rem', fontWeight: '800', backgroundColor: 'var(--ops-bg)', color: 'var(--ops-text-muted)', padding: '2px 8px', borderRadius: '6px', border: '1px solid var(--ops-border)' }}>
                                                        ID: {standaloneProduct.accounting_id}
                                                    </span>
                                                )}
                                                {productCell && (
                                                    <span style={{
                                                        fontSize: '0.65rem',
                                                        fontWeight: '800',
                                                        backgroundColor: productCell.badge_bg || 'var(--ops-bg)',
                                                        color: productCell.badge_text || 'var(--ops-primary)',
                                                        border: `1px solid ${productCell.color}40`,
                                                        padding: '2px 7px',
                                                        borderRadius: '6px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        {renderCellLucideIcon(productCell, 13)}
                                                        <span>{productCell.short_name || productCell.name}</span>
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)', marginTop: '4px' }}>
                                                Unidad de medida: <b style={{ color: 'var(--ops-text)' }}>{standaloneProduct.unit_of_measure}</b>
                                            </div>
                                        </div>

                                        {hasCount ? (
                                            <div style={{
                                                fontSize: '0.8rem',
                                                fontWeight: '900',
                                                padding: '4px 10px',
                                                borderRadius: '8px',
                                                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                                                color: 'var(--ops-primary)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}>
                                                <Check size={14} /> Contado: {parseFloat(rawVal).toFixed(2)} {standaloneProduct.unit_of_measure}
                                            </div>
                                        ) : (
                                            <div style={{
                                                fontSize: '0.72rem',
                                                fontWeight: '800',
                                                padding: '3px 8px',
                                                borderRadius: '6px',
                                                backgroundColor: 'var(--ops-bg)',
                                                color: 'var(--ops-text-muted)',
                                                border: '1px solid var(--ops-border)'
                                            }}>
                                                Pendiente
                                            </div>
                                        )}
                                    </div>

                                    {/* Input Conteo Standalone a Ciegas */}
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <div style={{ position: 'relative', flex: 1 }}>
                                            <input 
                                                type="number"
                                                step="any"
                                                placeholder="0.00"
                                                value={rawVal}
                                                onChange={(e) => setCounts({ ...counts, [standaloneProduct.id]: e.target.value })}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.85rem 3.5rem 0.85rem 1rem',
                                                    borderRadius: '14px',
                                                    border: '1.5px solid var(--ops-border)',
                                                    backgroundColor: 'var(--ops-bg)',
                                                    fontSize: '1.35rem',
                                                    fontWeight: '950',
                                                    color: 'var(--ops-text)',
                                                    outline: 'none'
                                                }}
                                            />
                                            <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', fontSize: '0.85rem', color: 'var(--ops-text-muted)' }}>
                                                {standaloneProduct.unit_of_measure}
                                            </div>
                                        </div>

                                        {hasCount && (
                                            <button
                                                onClick={() => handleSaveSingleItem(standaloneProduct)}
                                                disabled={isSavingThis}
                                                title="Guardar este producto"
                                                style={{
                                                    padding: '0.85rem 1.2rem',
                                                    borderRadius: '14px',
                                                    border: 'none',
                                                    backgroundColor: 'var(--ops-primary)',
                                                    color: 'white',
                                                    fontWeight: '900',
                                                    fontSize: '0.85rem',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                {isSavingThis ? '...' : <Check size={20} />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                                })}
                            </div>
                        )}

                        {/* Barra Inferior Fija para Aplicar Conteo en Lote */}
                        {totalCountedItemsCount > 0 && (
                            <div style={{
                                position: 'fixed',
                                bottom: '20px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 'calc(100% - 2rem)',
                                maxWidth: '600px',
                                zIndex: 60,
                                backgroundColor: 'rgba(17, 24, 39, 0.95)',
                                backdropFilter: 'blur(16px)',
                                WebkitBackdropFilter: 'blur(16px)',
                                padding: '0.9rem 1.25rem',
                                borderRadius: '20px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.2)',
                                border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}>
                                <div>
                                    <div style={{ color: 'white', fontWeight: '950', fontSize: '0.95rem' }}>
                                        {totalCountedItemsCount} producto(s) listo(s)
                                    </div>
                                    <div style={{ color: '#9CA3AF', fontSize: '0.72rem' }}>
                                        Ajuste automático en tiempo real
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => setCounts({})}
                                        style={{
                                            padding: '0.65rem 0.9rem',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            backgroundColor: 'transparent',
                                            color: '#D1D5DB',
                                            fontWeight: '800',
                                            fontSize: '0.75rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Limpiar
                                    </button>
                                    <button
                                        onClick={handleSavePhysicalCountBatch}
                                        disabled={submitting}
                                        style={{
                                            padding: '0.65rem 1.25rem',
                                            borderRadius: '12px',
                                            border: 'none',
                                            backgroundColor: 'var(--ops-primary)',
                                            color: 'white',
                                            fontWeight: '950',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Save size={16} /> {submitting ? 'Guardando...' : 'Aplicar Conteo'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ========================================================================= */}
                {/* VISTA 2: GESTIÓN DE RETORNOS                                              */}
                {/* ========================================================================= */}
                {activeView === 'returns' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Recepción Directa de Canastillas en Patio */}
                        <div style={{ backgroundColor: 'var(--ops-surface)', padding: '1.25rem', borderRadius: '24px', border: '1px solid var(--ops-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: '900', color: 'var(--ops-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Package size={20} style={{ color: '#10B981' }} /> Recepción Directa de Canastillas en Patio
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                                    Para clientes que entregan vacías directamente en planta sin camión de ruta
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    alert('Ingrese el nombre de la sucursal y la cantidad de canastillas recibidas físicamente en patio.');
                                }}
                                style={{ padding: '0.8rem 1.25rem', borderRadius: '14px', border: 'none', backgroundColor: '#10B981', color: 'white', fontWeight: '900', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)' }}
                            >
                                <Plus size={16} /> REGISTRAR DEVOLUCIÓN DIRECTA
                            </button>
                        </div>

                        {pendingReturns.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', backgroundColor: 'var(--ops-surface)', borderRadius: '32px', border: '1px solid var(--ops-border)' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}><Truck size={48} style={{ color: 'var(--ops-text-muted)', margin: '0 auto' }} /></div>
                                <div style={{ fontWeight: '800', color: 'var(--ops-text-muted)' }}>No hay camiones ni devoluciones de ruta pendientes por liquidar</div>
                            </div>
                        ) : (
                            pendingReturns.map(ret => (
                                <div key={ret.id} style={{ backgroundColor: 'var(--ops-surface)', borderRadius: '24px', border: '1px solid var(--ops-border)', overflow: 'hidden' }}>
                                    {ret.evidence_url && (
                                        <div style={{ height: '150px', position: 'relative' }}>
                                            <img src={ret.evidence_url} alt="Evidencia ruta" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                             <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Camera size={12} /> FOTO DE RUTA
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ padding: '1.5rem' }}>
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontWeight: '900', fontSize: '1.1rem' }}>{ret.products?.name}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: '800' }}>Regresan: {ret.quantity} {ret.products?.unit_of_measure}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <MessageSquare size={12} /> {ret.notes}
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'inventory')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#10B981', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                            >
                                                <Warehouse size={13} /> BODEGA
                                            </button>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'waste')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#EF4444', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                            >
                                                <Trash2 size={13} /> DESPERD.
                                            </button>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'donation')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#3B82F6', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                            >
                                                <HeartHandshake size={13} /> DONA
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* ========================================================================= */}
                {/* VISTA 3: AUDITORÍAS A CIEGAS (HISTÓRICO / EN PAUSA)                       */}
                {/* ========================================================================= */}
                {activeView === 'audits' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Banner Informativo sobre Pausa del Corte 09:30 AM */}
                        <div style={{ 
                            backgroundColor: '#EEF2FF', 
                            border: '1px solid #C7D2FE', 
                            padding: '1.25rem', 
                            borderRadius: '20px',
                            display: 'flex',
                            gap: '0.85rem',
                            alignItems: 'flex-start'
                        }}>
                            <AlertCircle size={22} style={{ color: '#4F46E5', flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: '900', color: '#312E81' }}>
                                    Corte Automático a Ciegas (09:30 AM) Desactivado
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#4338CA', marginTop: '4px', lineHeight: '1.5' }}>
                                    El corte automático ha sido retirado ya que no actualizaba el stock físico. La actualización de existencias reales ahora se realiza de forma directa mediante la pestaña <b>Conteo Físico Total</b>.
                                </div>
                            </div>
                        </div>

                        {!activeTask ? (
                            <div style={{ backgroundColor: 'var(--ops-surface)', padding: '3rem 2rem', borderRadius: '32px', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.06)', border: '1px solid var(--ops-border)' }}>
                                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                                    <Sparkles size={48} color="var(--ops-primary)" />
                                </div>
                                <h2 style={{ fontWeight: '950', color: 'var(--ops-text)', fontSize: '1.3rem', marginBottom: '0.5rem' }}>Sin auditorías pendientes</h2>
                                <p style={{ color: 'var(--ops-text-muted)', fontSize: '0.85rem', lineHeight: '1.5', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
                                    No hay tareas de conteo a ciegas asignadas para hoy. Utilice el módulo de Conteo Físico Total para ingresar los stocks de bodega.
                                </p>
                                <button 
                                    onClick={() => setActiveView('full_count')} 
                                    style={{ padding: '0.9rem 1.75rem', borderRadius: '14px', border: 'none', background: 'var(--ops-primary)', color: 'white', fontWeight: '900', fontSize: '0.85rem', cursor: 'pointer' }}
                                >
                                    Ir a Conteo Físico Total
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {activeTask.items.map((item, idx) => (
                                    <div key={item.id} style={{ backgroundColor: 'var(--ops-surface)', padding: '1.25rem', borderRadius: '20px', border: '1px solid var(--ops-border)' }}>
                                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'var(--ops-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: 'var(--ops-primary)' }}>{idx + 1}</div>
                                            <div>
                                                <div style={{ fontWeight: '900', fontSize: '1.05rem' }}>{item.products.name}</div>
                                                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--ops-text-muted)' }}>
                                                    ID: {item.products.accounting_id || item.product_id?.slice(0, 8)}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ position: 'relative' }}>
                                            <input 
                                                type="number" 
                                                placeholder="0.00" 
                                                value={auditCounts[item.id] || ''} 
                                                onChange={(e) => setAuditCounts({ ...auditCounts, [item.id]: e.target.value })}
                                                style={{ width: '100%', padding: '0.85rem 3rem 0.85rem 1rem', borderRadius: '12px', border: '1.5px solid var(--ops-border)', backgroundColor: 'var(--ops-bg)', fontSize: '1.25rem', fontWeight: '950', color: 'var(--ops-text)' }}
                                            />
                                            <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                                {item.products.unit_of_measure}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                <button 
                                    onClick={handleSubmitBlindAudit} 
                                    disabled={submitting} 
                                    style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', border: 'none', background: 'var(--ops-primary)', color: 'white', fontSize: '1rem', fontWeight: '950', cursor: 'pointer' }}
                                >
                                    {submitting ? '⏳ Guardando...' : 'Finalizar Auditoría'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal de Registro de Mermas y Novedades con Evidencia */}
            <InventoryWasteModal
                isOpen={isWasteModalOpen}
                onClose={() => setIsWasteModalOpen(false)}
                onSuccess={() => fetchCountProducts()}
                warehouseId={warehouseId}
            />
        </main>
    );
}
