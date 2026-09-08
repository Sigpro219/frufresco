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
    RefreshCw
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
    actual_qty: number | null;
}

interface ProductWithStock {
    id: string;
    name: string;
    accounting_id: number | null;
    category: string | null;
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

const CATEGORY_NAMES: Record<string, string> = {
    'Todos': 'Todos',
    'FR': 'Frutas',
    'VE': 'Verduras',
    'HO': 'Hojas / Hierbas',
    'TU': 'Tubérculos',
    'LA': 'Lácteos',
    'DE': 'Despensa',
    'CO': 'Congelados',
};

export default function OpsInventoryPage() {
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'full_count' | 'returns' | 'audits'>('full_count');
    const [submitting, setSubmitting] = useState(false);
    const router = useRouter();
    const isMounted = useRef(true);

    // Conteo Físico State
    const [products, setProducts] = useState<ProductWithStock[]>([]);
    const [warehouseId, setWarehouseId] = useState<string>('d606c381-45bd-45f3-a0a9-9b8b3b196ac3');
    const [counts, setCounts] = useState<Record<string, string>>({});
    const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
    const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [filterOnlyWithCount, setFilterOnlyWithCount] = useState<boolean>(false);
    const [savingItem, setSavingItem] = useState<string | null>(null);
    const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

    // Retornos & Auditorías State
    const [activeTask, setActiveTask] = useState<InventoryTask | null>(null);
    const [auditCounts, setAuditCounts] = useState<Record<string, string>>({});
    const [pendingReturns, setPendingReturns] = useState<any[]>([]);

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
                    id, name, accounting_id, category, unit_of_measure, parent_id, is_active,
                    inventory_stocks!product_id (
                        id, quantity, status, warehouse_id
                    )
                `)
                .eq('is_active', true)
                .order('name')
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

    // 5. Filtrar familias por categoría, término de búsqueda e ID Contable
    const filteredFamilies = useMemo(() => {
        return families.filter(fam => {
            // Filtro por categoría
            if (selectedCategory !== 'Todos') {
                const parentCatMatch = fam.parent.category === selectedCategory;
                const childCatMatch = fam.children.some(c => c.category === selectedCategory);
                if (!parentCatMatch && !childCatMatch) return false;
            }

            // Filtro por búsqueda (Nombre o ID Contable)
            if (searchTerm.trim()) {
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

            // Filtro por solo los que tienen conteo ingresado
            if (filterOnlyWithCount) {
                const hasParentCount = counts[fam.parent.id] !== undefined && counts[fam.parent.id] !== '';
                const hasChildCount = fam.children.some(c => counts[c.id] !== undefined && counts[c.id] !== '');
                if (!hasParentCount && !hasChildCount) return false;
            }

            return true;
        });
    }, [families, selectedCategory, searchTerm, filterOnlyWithCount, counts]);

    // Categorías disponibles detectadas en productos activos
    const availableCategories = useMemo(() => {
        const set = new Set(products.map(p => p.category).filter(Boolean) as string[]);
        return ['Todos', ...Array.from(set).sort()];
    }, [products]);

    // Conteo total de ítems ingresados por el usuario
    const totalCountedItemsCount = useMemo(() => {
        return Object.keys(counts).filter(id => counts[id] !== undefined && counts[id] !== '').length;
    }, [counts]);

    // 6. Aplicar ajuste individual
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

        setSavingItem(product.id);
        try {
            if (Math.abs(diff) > 0.0001) {
                const { error } = await supabase.from('inventory_movements').insert([{
                    product_id: product.id,
                    warehouse_id: warehouseId,
                    quantity: diff,
                    type: 'adjustment',
                    status_to: 'available',
                    notes: `Conteo Físico: Anterior ${currentQty} -> Contado ${countedQty} (Dif: ${diff > 0 ? '+' : ''}${diff.toFixed(2)})` + (itemNotes[product.id] ? ` | Obs: ${itemNotes[product.id]}` : ''),
                    reference_type: 'physical_count'
                }]);

                if (error) throw error;
            }

            window.showToast?.(`✅ ${product.name} ajustado a ${countedQty} ${product.unit_of_measure}`, 'success');
            
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

    // 7. Guardar y Aplicar Conteo Físico en lote (Batch)
    const handleSavePhysicalCountBatch = async () => {
        const countedIds = Object.keys(counts).filter(id => {
            const val = counts[id];
            return val !== undefined && val !== '' && !isNaN(parseFloat(val));
        });

        if (countedIds.length === 0) {
            alert('Por favor ingrese al menos una cantidad física antes de guardar.');
            return;
        }

        const confirmMsg = `¿Desea registrar y aplicar el conteo físico para los ${countedIds.length} productos ingresados?`;
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

                if (Math.abs(diff) > 0.0001) {
                    movementRows.push({
                        product_id: prodId,
                        warehouse_id: warehouseId,
                        quantity: diff,
                        type: 'adjustment',
                        status_to: 'available',
                        notes: `Conteo Físico Operaciones: Stock anterior ${currentQty} -> Contado ${countedQty} (Dif: ${diff > 0 ? '+' : ''}${diff.toFixed(2)})` + (itemNotes[prodId] ? ` | Obs: ${itemNotes[prodId]}` : ''),
                        reference_type: 'physical_count'
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

            window.showToast?.(`✅ Conteo físico aplicado exitosamente (${adjustedCount} productos actualizados)`, 'success');
            
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

            window.showToast?.('✅ Auditoría a ciegas completada', 'success');
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

            window.showToast?.(`✅ Producto gestionado como ${decision}`, 'success');
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
                    <div style={{ fontSize: '2.5rem', marginBottom: '1rem', animation: 'spin 1.5s linear infinite' }}>📦</div>
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
                    </div>

                    <h1 style={{ fontSize: '1.8rem', fontWeight: '950', color: 'var(--ops-text)', margin: 0, letterSpacing: '-0.5px' }}>
                        {activeView === 'full_count' && 'Conteo Físico Total de Bodega'}
                        {activeView === 'returns' && 'Gestión de Retornos y Devoluciones'}
                        {activeView === 'audits' && 'Auditorías a Ciegas de Piso'}
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: 'var(--ops-text-muted)', marginTop: '0.35rem' }}>
                        {activeView === 'full_count' && 'Ingreso y ajuste reactivo de inventario físico en tiempo real (Base Cero)'}
                        {activeView === 'returns' && 'Recepción de canastillas en patio y liquidación de sobrantes devueltos de ruta'}
                        {activeView === 'audits' && 'Muestreos aleatorios y auditorías de control programadas'}
                    </p>
                </header>

                {/* ========================================================================= */}
                {/* VISTA 1: CONTEO FÍSICO TOTAL                                              */}
                {/* ========================================================================= */}
                {activeView === 'full_count' && (
                    <div>
                        {/* Barra Sticky de Búsqueda y Filtros con Blur */}
                        <div style={{ 
                            position: 'sticky', 
                            top: '10px', 
                            zIndex: 45, 
                            backgroundColor: 'rgba(255, 255, 255, 0.94)', 
                            backdropFilter: 'blur(12px)',
                            WebkitBackdropFilter: 'blur(12px)',
                            padding: '1rem', 
                            borderRadius: '20px', 
                            border: '1px solid var(--ops-border)',
                            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.06)',
                            marginBottom: '1.5rem',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.75rem'
                        }}>
                            {/* Input de Búsqueda */}
                            <div style={{ position: 'relative' }}>
                                <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ops-text-muted)' }} />
                                <input 
                                    type="text"
                                    placeholder="Buscar por nombre o ID Contable..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem 1rem 0.75rem 2.75rem',
                                        borderRadius: '12px',
                                        border: '1px solid var(--ops-border)',
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

                            {/* Categorías deslizables */}
                            <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', paddingBottom: '2px', scrollbarWidth: 'none' }}>
                                {availableCategories.map(cat => {
                                    const isSelected = selectedCategory === cat;
                                    const label = CATEGORY_NAMES[cat] || cat;
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => setSelectedCategory(cat)}
                                            style={{
                                                padding: '0.45rem 0.9rem',
                                                borderRadius: '100px',
                                                border: isSelected ? 'none' : '1px solid var(--ops-border)',
                                                backgroundColor: isSelected ? 'var(--ops-text)' : 'var(--ops-surface)',
                                                color: isSelected ? 'var(--ops-surface)' : 'var(--ops-text-muted)',
                                                fontWeight: '800',
                                                fontSize: '0.75rem',
                                                cursor: 'pointer',
                                                whiteSpace: 'nowrap',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Fila de Contadores y Toggle de solo con conteo */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', paddingTop: '0.25rem', borderTop: '1px dashed var(--ops-border)' }}>
                                <div style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                    Mostrando <span style={{ color: 'var(--ops-text)', fontWeight: '950' }}>{filteredFamilies.length}</span> familias / productos
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
                        </div>

                        {/* Listado de Familias y Productos */}
                        {filteredFamilies.length === 0 ? (
                            <div style={{ backgroundColor: 'var(--ops-surface)', padding: '3rem 2rem', borderRadius: '24px', textAlign: 'center', border: '1px solid var(--ops-border)' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🔍</div>
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
                                                                <span style={{ fontSize: '0.65rem', fontWeight: '900', backgroundColor: '#ECFDF5', color: '#059669', padding: '2px 8px', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                                                                    PADRE ({family.children.length} variantes)
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--ops-text-muted)', marginTop: '2px' }}>
                                                                Existencia total calculada como sumatoria estricta de sus variantes
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Resumen de Stock Padre */}
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                                            SISTEMA: <span style={{ color: 'var(--ops-text)', fontWeight: '900' }}>{childrenCurrentStockSum.toFixed(2)}</span> {family.parent.unit_of_measure}
                                                        </div>
                                                        {anyChildHasCount && (
                                                            <div style={{ fontSize: '0.85rem', fontWeight: '950', color: 'var(--ops-primary)', marginTop: '2px' }}>
                                                                Total Contado: {childrenCountedStockSum.toFixed(2)} {family.parent.unit_of_measure}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Lista de Variantes (Hijos) */}
                                                {isExpanded && (
                                                    <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                                        {family.children.map((child) => {
                                                            const childStockRec = child.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || child.inventory_stocks?.[0];
                                                            const currentQty = Number(childStockRec?.quantity || 0);
                                                            const rawVal = counts[child.id] || '';
                                                            const hasCount = rawVal !== '';
                                                            const countedNum = hasCount ? parseFloat(rawVal) : currentQty;
                                                            const diff = hasCount && !isNaN(countedNum) ? countedNum - currentQty : 0;
                                                            const isSavingThis = savingItem === child.id;

                                                            return (
                                                                <div 
                                                                    key={child.id}
                                                                    style={{
                                                                        padding: '1rem',
                                                                        backgroundColor: hasCount ? 'rgba(16, 185, 129, 0.05)' : 'var(--ops-bg)',
                                                                        borderRadius: '16px',
                                                                        border: hasCount ? '1px solid var(--ops-primary)' : '1px solid var(--ops-border)',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: '0.75rem'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                        <div>
                                                                            <div style={{ fontWeight: '900', fontSize: '0.95rem' }}>
                                                                                {child.name}
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '3px' }}>
                                                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                                                                    ID: {child.accounting_id || child.id.slice(0, 8)}
                                                                                </span>
                                                                                <span style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>
                                                                                    • Stock Sistema: <b style={{ color: 'var(--ops-text)' }}>{currentQty.toFixed(2)} {child.unit_of_measure}</b>
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        {hasCount && !isNaN(diff) && (
                                                                            <div style={{
                                                                                fontSize: '0.75rem',
                                                                                fontWeight: '900',
                                                                                padding: '3px 8px',
                                                                                borderRadius: '6px',
                                                                                backgroundColor: diff > 0 ? '#ECFDF5' : diff < 0 ? '#FEF2F2' : '#F3F4F6',
                                                                                color: diff > 0 ? '#059669' : diff < 0 ? '#DC2626' : '#6B7280'
                                                                            }}>
                                                                                {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} {child.unit_of_measure}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Input de Conteo */}
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
                                                                                    border: '1px solid var(--ops-border)',
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
                                    const stockRec = standaloneProduct.inventory_stocks?.find(s => s.warehouse_id === warehouseId) || standaloneProduct.inventory_stocks?.[0];
                                    const currentQty = Number(stockRec?.quantity || 0);
                                    const rawVal = counts[standaloneProduct.id] || '';
                                    const hasCount = rawVal !== '';
                                    const countedNum = hasCount ? parseFloat(rawVal) : currentQty;
                                    const diff = hasCount && !isNaN(countedNum) ? countedNum - currentQty : 0;
                                    const isSavingThis = savingItem === standaloneProduct.id;

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
                                                        {standaloneProduct.category && (
                                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: '#F3F4F6', color: '#6B7280', padding: '2px 6px', borderRadius: '4px' }}>
                                                                {CATEGORY_NAMES[standaloneProduct.category] || standaloneProduct.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-text-muted)', marginTop: '4px' }}>
                                                        Stock en Sistema: <b style={{ color: 'var(--ops-text)' }}>{currentQty.toFixed(2)} {standaloneProduct.unit_of_measure}</b>
                                                    </div>
                                                </div>

                                                {hasCount && !isNaN(diff) && (
                                                    <div style={{
                                                        fontSize: '0.8rem',
                                                        fontWeight: '900',
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        backgroundColor: diff > 0 ? '#ECFDF5' : diff < 0 ? '#FEF2F2' : '#F3F4F6',
                                                        color: diff > 0 ? '#059669' : diff < 0 ? '#DC2626' : '#6B7280'
                                                    }}>
                                                        Dif: {diff > 0 ? `+${diff.toFixed(2)}` : diff.toFixed(2)} {standaloneProduct.unit_of_measure}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Input Conteo Standalone */}
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
                                            <div style={{ position: 'absolute', bottom: 10, left: 10, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.65rem', color: 'white' }}>📸 FOTO DE RUTA</div>
                                        </div>
                                    )}
                                    <div style={{ padding: '1.5rem' }}>
                                        <div style={{ marginBottom: '1rem' }}>
                                            <div style={{ fontWeight: '900', fontSize: '1.1rem' }}>{ret.products?.name}</div>
                                            <div style={{ fontSize: '0.85rem', color: '#F59E0B', fontWeight: '800' }}>Regresan: {ret.quantity} {ret.products?.unit_of_measure}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '4px' }}>💬 {ret.notes}</div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'inventory')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#10B981', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                📦 BODEGA
                                            </button>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'waste')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#EF4444', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                🗑️ DESPERD.
                                            </button>
                                            <button 
                                                onClick={() => handleReturnDecision(ret.id, 'donation')}
                                                style={{ padding: '0.8rem 0.4rem', borderRadius: '12px', border: 'none', background: '#3B82F6', color: 'white', fontSize: '0.65rem', fontWeight: '900', cursor: 'pointer' }}
                                            >
                                                🤝 DONA
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
                                <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>✨</div>
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
        </main>
    );
}
