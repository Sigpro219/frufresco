'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { Package, Search, Filter, Plus, ArrowUpRight, ArrowDownLeft, AlertTriangle, TrendingUp, History, Download, ChevronRight, Scale, Tag, Calendar, Database, Sparkles, Building2, Truck, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { CATEGORY_MAP } from '@/lib/constants';

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
        unit_of_measure: string;
        image_url: string;
        base_price: number;
        is_active: boolean;
        min_inventory_level: number;
        accounting_id?: number | null;
    };
    warehouses: {
        name: string;
    };
}

interface Movement {
    id: string;
    product_id: string;
    quantity: number;
    type: 'entry' | 'exit' | 'adjustment' | 'transfer';
    status_to: string;
    notes?: string;
    evidence_url?: string;
    admin_decision?: string;
    created_at: string;
    products: {
        name: string;
        sku?: string;
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

// --- UI THEME & STYLES ---
const THEME = {
    colors: {
        bg: '#F9FAFB',
        surface: 'white',
        border: '#E5E7EB',
        textMain: '#111827',
        textSecondary: '#64748B',
        primary: '#2563EB',
        primaryHover: '#1D4ED8',
        accent: '#111827',
        success: '#10B981',
        error: '#EF4444'
    },
    radius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px'
    },
    shadow: {
        sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
        lg: '0 10px 15px -3px rgb(37, 99, 235, 0.2)',
        xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)'
    }
};

const styles = {
    main: { minHeight: '100vh', backgroundColor: THEME.colors.bg, color: THEME.colors.textMain },
    container: { maxWidth: '1440px', margin: '0 auto', padding: '0.75rem' },
    header: { display: 'flex' as const, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' },
    titleArea: { flex: 1 },
    title: { fontSize: '1.5rem', fontWeight: '900', letterSpacing: '-0.025em', margin: 0, color: THEME.colors.textMain },
    subtitle: { color: THEME.colors.textSecondary, fontSize: '0.85rem', marginTop: '0.1rem' },
    actions: { display: 'flex' as const, gap: '0.5rem' },
    kpiGrid: { display: 'grid' as const, gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1rem' },
    controlBar: { 
        display: 'flex' as const, 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1rem', 
        backgroundColor: THEME.colors.surface, 
        padding: '0.5rem 0.75rem', 
        borderRadius: THEME.radius.lg, 
        border: `1px solid ${THEME.colors.border}`,
        boxShadow: THEME.shadow.sm
    },
    tableContainer: { 
        backgroundColor: THEME.colors.surface, 
        borderRadius: THEME.radius.xl, 
        border: `1px solid ${THEME.colors.border}`, 
        boxShadow: THEME.shadow.md, 
        overflow: 'hidden',
        position: 'relative' as const
    },
    table: { width: '100%', borderCollapse: 'collapse' as const },
    stickyHeader: { 
        position: 'sticky' as const, 
        top: '-1px', // Slight offset to ensure no gap
        backgroundColor: '#F8FAFC', 
        zIndex: 10,
        boxShadow: '0 2px 4px -2px rgba(0,0,0,0.1)'
    },
    th: { padding: '0.6rem 0.75rem', textAlign: 'left' as const, fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '900', textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    td: { padding: '0.6rem 0.75rem', fontSize: '0.8rem', borderBottom: `1px solid #F1F5F9` },
    input: { width: '100%', padding: '0.7rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, fontSize: '0.85rem', fontWeight: '700', boxSizing: 'border-box' as const },
    label: { display: 'block', fontSize: '0.65rem', fontWeight: '900', color: THEME.colors.textSecondary, textTransform: 'uppercase' as const, marginBottom: '0.3rem' },
    badge: (bg: string, color: string) => ({ backgroundColor: bg, color, padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.7rem', fontWeight: '800' })
};

export default function InventoryAdminPage() {
    const [stocks, setStocks] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'stock' | 'movements' | 'random_tasks' | 'settings' | 'novedades'>('stock');
    const [movements, setMovements] = useState<Movement[]>([]);
    const [randomTasks, setRandomTasks] = useState<RandomTask[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<{ id: string, name: string } | null>(null);
    const [stockStatusFilter, setStockStatusFilter] = useState<'available' | 'returned' | 'in_process' | 'all'>('all');
    const [currentPage, setCurrentPage] = useState(1);
    const [avgCosts, setAvgCosts] = useState<Record<string, number>>({});
    interface ScoredItem {
        item: any; // Using any for the complex Supabase nested join object for now, but typed at usage
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
        autoEnabled: true,
        generationTime: '09:30' // Cut-off at 09:30 AM
    });
    const [generatingAudit, setGeneratingAudit] = useState(false);
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const ITEMS_PER_PAGE = 50;
    const isMounted = useRef(true);

    const fetchData = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            if (activeTab === 'stock') {
                // Fetch from products to ensure ALL master items are visible
                let allProducts: any[] = [];
                let from = 0;
                const limit = 1000;
                let hasMore = true;

                while (hasMore) {
                    let query = supabase
                        .from('products')
                        .select(`
                            id, name, sku, category, unit_of_measure, image_url, base_price, is_active, min_inventory_level, accounting_id,
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

                // --- NEW: Calculate Average Costs from Purchases ---
                const { data: purchasesData } = await supabase
                    .from('purchases')
                    .select('product_id, unit_price, created_at, purchase_unit')
                    .order('created_at', { ascending: false });

                const { data: convData } = await supabase.from('product_conversions').select('*');

                const costsMap: Record<string, number> = {};
                if (purchasesData && allProducts) {
                    const grouped: Record<string, number[]> = {};
                    purchasesData.forEach(p => {
                        if (!p.product_id) return;
                        if (!grouped[p.product_id]) grouped[p.product_id] = [];
                        if (grouped[p.product_id].length < 3) { // Use window of 3 as in matrix
                            const product = allProducts.find(pd => pd.id === p.product_id);
                            let normalizedPrice = p.unit_price;
                            
                            if (product && p.purchase_unit && p.purchase_unit !== product.unit_of_measure) {
                                const conv = (convData || []).find(c => 
                                    c.product_id === p.product_id && 
                                    c.from_unit === p.purchase_unit && 
                                    c.to_unit === product.unit_of_measure
                                );
                                if (conv?.conversion_factor) {
                                    normalizedPrice = normalizedPrice / conv.conversion_factor;
                                }
                            }
                            grouped[p.product_id].push(normalizedPrice);
                        }
                    });

                    Object.keys(grouped).forEach(pid => {
                        const prices = grouped[pid];
                        costsMap[pid] = prices.reduce((a, b) => a + b, 0) / prices.length;
                    });
                }
                setAvgCosts(costsMap);
                setStocks(flattenedStocks);
            } else if (activeTab === 'movements') {
                const { data, error } = await supabase
                    .from('inventory_movements')
                    .select(`
                        *,
                        products (name)
                    `)
                    .order('created_at', { ascending: false })
                    .limit(100)
                    .abortSignal(signal as any);

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
                console.error('🚨 ERROR: La tabla de inventario "inventory_stocks" no existe.');
                console.error('Sugerencia: Ejecuta el script REPAIR_INVENTORY_SYSTEM.sql en el dashboard de Supabase.');
            }

            // Silenciosamente ignorar abortos
            if (isAbortError(err)) return;

            console.error('Error fetching inventory details:', pgError.message || err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [activeTab]);

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
                    notes: `Snapshot Automático 09:30 AM - Cobertura ${auditPolicy.coveragePercent}%`
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

    // Effect for Automatic Generation
    useEffect(() => {
        if (!auditPolicy.autoEnabled) return;

        const timer = setInterval(() => {
            const now = new Date();
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            if (currentTime === auditPolicy.generationTime) {
                handleGenerateAudit(true);
            }
        }, 60000); // Check every minute

        return () => clearInterval(timer);
    }, [auditPolicy.autoEnabled, auditPolicy.generationTime, handleGenerateAudit]);

    useEffect(() => {
        isMounted.current = true;
        const controller = new AbortController();
        fetchData(controller.signal);
        return () => { 
            isMounted.current = false;
            controller.abort();
        };
    }, [fetchData]);

    const handleApplyMovement = useCallback(async (productId: string, qty: number, type: 'entry' | 'exit' | 'adjustment', status: string, notes: string) => {
        try {
            const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
            if (!warehouseData) throw new Error('No hay bodegas configuradas');

            const { error } = await supabase
                .from('inventory_movements')
                .insert([{
                    product_id: productId,
                    warehouse_id: warehouseData.id,
                    quantity: type === 'exit' ? -Math.abs(qty) : qty,
                    type,
                    status_to: status,
                    notes,
                    reference_type: 'manual'
                }]);

            if (error) throw error;

            window.showToast?.('Movimiento registrado con éxito', 'success');
            setIsMovementModalOpen(false);
            fetchData();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error: ' + message);
        }
    }, [fetchData]);

    const generateRandomTask = async () => {
        // ... previous implementation ...
    };

    const filteredStocks = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        
        // 1. First apply Status Filter (Tab buttons)
        const filtered = stockStatusFilter === 'all' 
            ? stocks 
            : stocks.filter(s => s.status === stockStatusFilter);

        if (!query) return filtered;

        // 2. Apply "Power Search" logic
        const parts = query.split(/\s+/);
        const tags = parts.filter(p => p.startsWith('@')).map(t => t.slice(1));
        const searchTerms = parts.filter(p => !p.startsWith('@'));

        return filtered.filter(s => {
            const p = s.products;
            if (!p) return false;

            // Text search (AND)
            const matchesText = searchTerms.every(term => 
                p.name?.toLowerCase().includes(term) ||
                p.sku?.toLowerCase().includes(term) ||
                p.accounting_id?.toString()?.includes(term)
            );

            if (!matchesText && searchTerms.length > 0) return false;

            // Tag search (AND)
            const matchesTags = tags.every(tag => {
                // Low stock/alert
                if (tag === 'alerta' || tag === 'bajo' || tag === 'critico') {
                    return s.quantity <= (p.min_inventory_level || 0);
                }
                
                // Status tags
                if (tag === 'disponible' || tag === 'ok') return s.status === 'available';
                if (tag === 'regreso') return s.status === 'returned';
                if (tag === 'reproceso') return s.status === 'in_process';

                // Category tags
                const categoryEntry = Object.entries(CATEGORY_MAP).find(([, label]) => 
                    label.toLowerCase().startsWith(tag)
                );
                if (categoryEntry && p.category === categoryEntry[0]) return true;

                return false;
            });

            return matchesTags;
        });
    }, [stocks, searchQuery, stockStatusFilter]);

    const paginatedStocks = useMemo(() => {
        // --- RANKING DE VARIACIÓN PARA AUDITORÍA (2:00 PM) ---
        // if we are checking stock, let's prioritize items with differences in the latest audit
        const sortedStocks = [...filteredStocks].sort((a, b) => {
            const today = new Date().toISOString().split('T')[0];
            const currentTask = randomTasks.find(t => t.scheduled_date === today);
            
            if (currentTask) {
                const itemA = currentTask.items.find(i => i.product_id === a.product_id);
                const itemB = currentTask.items.find(i => i.product_id === b.product_id);
                
                // Prioritize items with higher difference percentage
                const diffA = itemA?.actual_qty !== null ? Math.abs(itemA?.difference_percent || 0) : 0;
                const diffB = itemB?.actual_qty !== null ? Math.abs(itemB?.difference_percent || 0) : 0;
                
                if (diffA !== diffB) return diffB - diffA;
            }
            
            // Default sort by accounting_id if no differences to compare
            return (a.products?.accounting_id || 0) - (b.products?.accounting_id || 0);
        });

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return sortedStocks.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [filteredStocks, currentPage, randomTasks]);

    const totalPages = Math.ceil(filteredStocks.length / ITEMS_PER_PAGE);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, stockStatusFilter]);

    const stats = {
        totalItems: stocks.length, // total monitored
        lowStock: stocks.filter(s => (s.products?.min_inventory_level || 0) > 0 && s.quantity < (s.products?.min_inventory_level || 0)).length,
        totalValue: stocks.reduce((acc, s) => acc + (s.quantity * (avgCosts[s.product_id] || 0)), 0),
        pendingTasks: randomTasks.filter(t => t.status !== 'completed').length
    };

    return (
        <main style={styles.main}>
            <Toast />

            <div style={styles.container}>
                <div style={styles.header}>
                    <div style={styles.titleArea}>
                        <h1 style={styles.title}>Control Maestro de Inventarios</h1>
                        <p style={styles.subtitle}>Consolidación multi-estado, trazabilidad total y auditoría inteligente.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
                        <Link href="/admin/master/products" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    padding: '0.6rem 1.4rem', 
                                    borderRadius: '100px', 
                                    border: 'none', 
                                    background: `linear-gradient(135deg, ${THEME.colors.primary}, #3B82F6)`, 
                                    color: 'white', 
                                    fontWeight: '800', 
                                    fontSize: '0.85rem', 
                                    cursor: 'pointer', 
                                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.3)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.2)'; }}
                            >
                                Catálogo Maestro
                            </button>
                        </Link>
                        <Link href="/admin/commercial/inventory/tasks" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    padding: '0.6rem 1.4rem', 
                                    borderRadius: '100px', 
                                    border: `1.5px solid ${THEME.colors.border}`, 
                                    background: 'white', 
                                    color: THEME.colors.textMain, 
                                    fontWeight: '800', 
                                    fontSize: '0.85rem', 
                                    cursor: 'pointer', 
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'white'; e.currentTarget.style.borderColor = THEME.colors.border; }}
                            >
                                Tareas Administrativas
                            </button>
                        </Link>
                        {activeTab === 'random_tasks' && (
                            <button 
                                onClick={generateRandomTask}
                                style={{ 
                                    padding: '0.6rem 1.4rem', 
                                    borderRadius: '100px', 
                                    border: 'none', 
                                    background: THEME.colors.accent, 
                                    color: 'white', 
                                    fontWeight: '800', 
                                    fontSize: '0.85rem', 
                                    cursor: 'pointer', 
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-1px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                Generar Tarea
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    <KPICard title="Items Monitoreados" value={stats.totalItems} color="#E0F2FE" subtitle="Cruzado con catálogo" />
                    <KPICard title="Alertas de Stock" value={stats.lowStock} color="#FEE2E2" subtitle="Bajo nivel mínimo" />
                    <KPICard title="Valor en Libros" value={`$${Math.round(stats.totalValue).toLocaleString()}`} color="#DCFCE7" subtitle="Costo base total" />
                    <KPICard title="Tareas Pendientes" value={stats.pendingTasks} color="#FEF3C7" subtitle="Auditoría de piso" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', backgroundColor: 'white', padding: '0.6rem 1rem', borderRadius: '16px', border: '1px solid #E5E7EB', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.1rem', flexShrink: 0 }}>
                        <TabButton active={activeTab === 'stock'} onClick={() => setActiveTab('stock')} label="Consolidado" icon="" />
                        <TabButton active={activeTab === 'movements'} onClick={() => setActiveTab('movements')} label="Movimientos" icon="" />
                        <TabButton active={activeTab === 'random_tasks'} onClick={() => setActiveTab('random_tasks')} label="Auditoría" icon="" />
                        <TabButton active={activeTab === 'novedades'} onClick={() => setActiveTab('novedades')} label="Novedades" icon="" />
                        <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Políticas" icon="" />
                    </div>
                    
                    <div style={{ position: 'relative', flex: 1, maxWidth: '600px' }}>
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre, SKU o categoría..." 
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            style={{ width: '100%', padding: '0.7rem 2.8rem 0.7rem 2.5rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.9rem', fontWeight: '600' }}
                        />
                        <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, fontSize: '1rem' }}>🔍</span>
                        
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                style={{ position: 'absolute', right: '2.8rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94A3B8' }}
                            >
                                ✕
                            </button>
                        )}
                        
                        <button 
                            onClick={() => setIsInfoGuideOpen(!isInfoGuideOpen)}
                            style={{ position: 'absolute', right: '0.8rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#3B82F6' }}
                        >
                            ℹ️
                        </button>

                        {isInfoGuideOpen && (
                            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.8rem', width: '300px', backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', zIndex: 100, border: '1px solid #E5E7EB' }}>
                                <h4 style={{ margin: '0 0 1rem 0', fontWeight: '900', color: '#111827' }}>Guía de Búsqueda Inteligente</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <code style={{ color: '#2563EB', fontWeight: '800', backgroundColor: '#EFF6FF', padding: '2px 4px', borderRadius: '4px' }}>@bajo</code>
                                        <span style={{ marginLeft: '8px', color: '#64748B' }}>Bajo stock mín.</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <code style={{ color: '#059669', fontWeight: '800', backgroundColor: '#ECFDF5', padding: '2px 4px', borderRadius: '4px' }}>@disponible</code>
                                        <span style={{ marginLeft: '8px', color: '#64748B' }}>Solo stock venta</span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem' }}>
                                        <code style={{ color: '#D97706', fontWeight: '800', backgroundColor: '#FFFBEB', padding: '2px 4px', borderRadius: '4px' }}>@regreso</code>
                                        <span style={{ marginLeft: '8px', color: '#64748B' }}>Devoluciones</span>
                                    </div>
                                    <div style={{ padding: '0.6rem', backgroundColor: '#F8FAFC', borderRadius: '10px', fontSize: '0.7rem', color: '#64748B' }}>
                                        💡 Ej: <strong>Tomate @bajo</strong>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                        {activeTab === 'stock' && (
                            <>
                                <div style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary }}>
                                    {filteredStocks.length} <span style={{ fontWeight: '400', fontSize: '0.75rem' }}>items</span>
                                </div>
                                <select 
                                    value={stockStatusFilter}
                                    onChange={(e) => { setStockStatusFilter(e.target.value as any); setCurrentPage(1); }}
                                    style={{ 
                                        padding: '0.6rem 1.2rem', 
                                        borderRadius: '10px', 
                                        border: '1px solid #E2E8F0', 
                                        backgroundColor: '#F8FAFC',
                                        color: '#1E293B',
                                        fontWeight: '800',
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        outline: 'none'
                                    }}
                                >
                                    <option value="all">Ver Todos</option>
                                    <option value="available">Disponible</option>
                                    <option value="returned">Devuelto</option>
                                    <option value="in_process">En Proceso</option>
                                </select>
                            </>
                        )}
                        {activeTab === 'movements' && (
                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textSecondary }}>
                                {movements.length} <span style={{ fontWeight: '400', fontSize: '0.75rem' }}>registros</span>
                            </div>
                        )}
                    </div>
                </div>



                <div style={styles.tableContainer}>
                    {loading ? (
                        <div style={{ padding: '10rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
                            <div style={{ fontSize: '2.5rem', animation: 'spin 2s linear infinite' }}>🔄</div>
                            <div style={{ fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '1.1rem' }}>Sincronizando inventarios maestros...</div>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'stock' && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={styles.table}>
                                        <thead style={styles.stickyHeader}>
                                            <tr>
                                                <th style={styles.th}>Producto</th>
                                                <th style={styles.th}>Estado</th>
                                                <th style={{ ...styles.th, textAlign: 'center' }}>Stock Mín.</th>
                                                <th style={{ ...styles.th, textAlign: 'center' }}>Costo Prom.</th>
                                                <th style={{ ...styles.th, textAlign: 'center' }}>Valor Inv.</th>
                                                <th style={styles.th}>Unidad</th>
                                                <th style={styles.th}>Cantidad</th>
                                                <th style={{ ...styles.th, textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedStocks.map((item) => (
                                                <tr key={item.id || `stock-${item.product_id}-${item.status}`} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <td style={styles.td}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ width: '48px', height: '48px', backgroundColor: '#F3F4F6', borderRadius: '12px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #E5E7EB' }}>
                                                                {item.products?.image_url ? (
                                                                    <img 
                                                                        src={item.products.image_url} 
                                                                        alt={item.products.name} 
                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                    />
                                                                ) : (
                                                                    <span style={{ fontSize: '1.4rem' }}>📦</span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: '800', fontSize: '1rem', color: THEME.colors.textMain }}>{item.products?.name || 'Desconocido'}</div>
                                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                                                                    <code style={{ fontSize: '0.7rem', color: THEME.colors.primary, backgroundColor: '#EFF6FF', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                                        {item.products?.sku || 'S/N'}
                                                                    </code>
                                                                    {item.products?.accounting_id && (
                                                                        <code style={{ fontSize: '0.7rem', color: '#64748B', backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                                            ID: {item.products.accounting_id}
                                                                        </code>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                            <span style={styles.badge(
                                                                item.status === 'available' ? '#DCFCE7' : item.status === 'returned' ? '#E0F2FE' : '#F3E8FF',
                                                                item.status === 'available' ? '#166534' : item.status === 'returned' ? '#0369A1' : '#7E22CE'
                                                            )}>
                                                                {item.status.toUpperCase()}
                                                            </span>
                                                            {item.products?.is_active === false && (
                                                                <span style={{
                                                                    fontSize: '0.65rem',
                                                                    backgroundColor: '#FEF2F2',
                                                                    color: '#991B1B',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '10px',
                                                                    fontWeight: '900',
                                                                    border: '1px solid #FECACA',
                                                                    textAlign: 'center',
                                                                    letterSpacing: '0.05em'
                                                                }}>
                                                                    🚩 MASTER OFF
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ 
                                                        ...styles.td, 
                                                        textAlign: 'center',
                                                        backgroundColor: item.products?.min_inventory_level > 0 ? '#FFF1F2' : 'transparent',
                                                    }}>
                                                        {item.products?.min_inventory_level > 0 ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                <span style={{ fontWeight: '900', color: THEME.colors.error, fontSize: '1.1rem' }}>
                                                                    {item.products.min_inventory_level}
                                                                </span>
                                                                {item.quantity <= item.products.min_inventory_level && (
                                                                    <span title="Bajo el mínimo crítico">🚩</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#CBD5E1', fontSize: '0.8rem' }}>—</span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'center' }}>
                                                        <div style={{ fontWeight: '800', color: '#059669', fontSize: '0.95rem' }}>
                                                            {avgCosts[item.product_id] ? `$${Math.round(avgCosts[item.product_id]).toLocaleString()}` : '—'}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'center' }}>
                                                        <div style={{ fontWeight: '900', color: THEME.colors.textMain, fontSize: '1.05rem' }}>
                                                            {avgCosts[item.product_id] ? `$${Math.round(avgCosts[item.product_id] * item.quantity).toLocaleString()}` : '—'}
                                                        </div>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <span style={{ fontSize: '0.9rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>
                                                            {item.products.unit_of_measure}
                                                        </span>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: item.quantity <= (item.products?.min_inventory_level || 0) ? THEME.colors.error : THEME.colors.textMain }}>
                                                            {item.quantity}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'right' }}>
                                                        <button 
                                                            onClick={() => { setSelectedProduct({id: item.product_id, name: item.products?.name || 'Desconocido'}); setIsMovementModalOpen(true); }}
                                                            style={{ 
                                                                backgroundColor: THEME.colors.accent, 
                                                                color: 'white',
                                                                border: 'none', 
                                                                padding: '0.6rem 1.2rem', 
                                                                borderRadius: THEME.radius.md, 
                                                                fontWeight: '800', 
                                                                cursor: 'pointer',
                                                                transition: 'transform 0.1s, opacity 0.2s',
                                                                fontSize: '0.85rem'
                                                            }}
                                                            onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                                            onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                                        >
                                                            Ajustar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'movements' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#F8FAFC' }}>
                                        <tr>
                                            <th style={styles.th}>Fecha</th>
                                            <th style={styles.th}>Producto</th>
                                            <th style={styles.th}>Tipo</th>
                                            <th style={styles.th}>Estado Destino</th>
                                            <th style={styles.th}>Cantidad</th>
                                            <th style={styles.th}>Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.filter(m => (m.products?.name || 'Desconocido').toLowerCase().includes(searchQuery.toLowerCase())).map((m) => (
                                            <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={styles.td}>{new Date(m.created_at).toLocaleString()}</td>
                                                <td style={styles.td}><strong>{m.products?.name || 'Producto Desconocido'}</strong></td>
                                                <td style={styles.td}>
                                                    <span style={styles.badge(m.quantity > 0 ? '#DCFCE7' : '#FEE2E2', m.quantity > 0 ? '#166534' : '#991B1B')}>
                                                        {m.type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={styles.td}>{m.status_to || 'available'}</td>
                                                <td style={{ ...styles.td, fontWeight: '900', color: m.quantity > 0 ? '#10B981' : '#EF4444' }}>
                                                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                                                </td>
                                                <td style={styles.td}>{m.notes || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                             {activeTab === 'random_tasks' && (
                                <div style={{ padding: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                        <div>
                                            <h2 style={{ margin: 0, fontWeight: '900' }}>Auditorías Recientes</h2>
                                            <p style={{ color: '#64748B', margin: 0 }}>Gestione los conteos ciegos aleatorios del día.</p>
                                        </div>
                                        <button 
                                            onClick={() => handleGenerateAudit()}
                                            disabled={generatingAudit}
                                            style={{ 
                                                backgroundColor: '#111827', color: 'white', padding: '0.8rem 1.5rem', 
                                                borderRadius: '12px', border: 'none', fontWeight: '800', cursor: 'pointer',
                                                opacity: generatingAudit ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem'
                                            }}
                                        >
                                            {generatingAudit ? 'Generando...' : '✚ Generar Auditoría de Hoy'}
                                        </button>
                                    </div>

                                    {randomTasks.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#F8FAFC', borderRadius: '24px', border: '2px dashed #E2E8F0' }}>
                                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                                            <h3 style={{ fontWeight: '900', color: '#1E293B' }}>Sin auditorías generadas</h3>
                                            <p style={{ color: '#64748B', maxWidth: '300px', margin: '0.5rem auto 1.5rem' }}>
                                                Haga clic en el botón superior para generar una lista aleatoria de productos para auditar hoy.
                                            </p>
                                        </div>
                                    ) : (
                                        randomTasks.map(task => (
                                            <div key={task.id} style={{ marginBottom: '2rem', border: '1px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                                                <div style={{ backgroundColor: '#F8FAFC', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E5E7EB' }}>
                                                    <div>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B' }}>FECHA PLANIFICADA: {task.scheduled_date}</span>
                                                        <div style={{ fontWeight: '900', color: '#111827', fontSize: '1.1rem' }}>Auditoría Aleatoria #{task.id.split('-')[0]}</div>
                                                    </div>
                                                    <span style={styles.badge(task.status === 'completed' ? '#DCFCE7' : '#FEF3C7', task.status === 'completed' ? '#166534' : '#92400E')}>
                                                        {task.status.toUpperCase()}
                                                    </span>
                                                </div>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: 'white' }}>
                                                            <th style={{ ...styles.th, fontSize: '0.7rem' }}>Producto</th>
                                                            <th style={{ ...styles.th, fontSize: '0.7rem' }}>Stock Sistema</th>
                                                            <th style={{ ...styles.th, fontSize: '0.7rem' }}>Físico (Conteo Ciego)</th>
                                                            <th style={{ ...styles.th, fontSize: '0.7rem' }}>Diferencia %</th>
                                                            <th style={{ ...styles.th, fontSize: '0.7rem', textAlign: 'right' }}>Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {task.items.map(item => (
                                                            <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: 'white' }}>
                                                                <td style={styles.td}><strong>{item.products?.name || 'Producto Desconocido'}</strong></td>
                                                                <td style={styles.td}>{item.expected_qty}</td>
                                                                <td style={styles.td}>
                                                                    {item.actual_qty !== null ? (
                                                                        <span style={{ fontWeight: '900' }}>{item.actual_qty}</span>
                                                                    ) : (
                                                                        <button style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer' }}>Ingresar Conteo</button>
                                                                    )}
                                                                </td>
                                                                <td style={{ ...styles.td, color: item.difference_percent > auditPolicy.alertThreshold ? '#EF4444' : '#10B981', fontWeight: '800' }}>
                                                                    {item.actual_qty !== null ? `${item.difference_percent.toFixed(1)}%` : '-'}
                                                                </td>
                                                                <td style={{ ...styles.td, textAlign: 'right' }}>
                                                                    <span style={{ 
                                                                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.3rem 0.6rem', borderRadius: '8px', 
                                                                        fontSize: '0.7rem', fontWeight: '800',
                                                                        backgroundColor: item.difference_percent > auditPolicy.alertThreshold ? '#FEE2E2' : item.actual_qty !== null ? '#DCFCE7' : '#F1F5F9',
                                                                        color: item.difference_percent > auditPolicy.alertThreshold ? '#991B1B' : item.actual_qty !== null ? '#166534' : '#475569'
                                                                    }}>
                                                                        {item.difference_percent > auditPolicy.alertThreshold ? '🚨 DESCUADRE' : item.actual_qty !== null ? '✅ OK' : '⏳ PENDIENTE'}
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
                                <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
                                    <h2 style={{ fontWeight: '900', marginBottom: '0.5rem' }}>Políticas de Auditoría</h2>
                                    <p style={{ color: '#64748B', marginBottom: '2rem' }}>Configure los criterios inteligentes para la selección automática de productos a auditar.</p>
                                    
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E5E7EB' }}>
                                            <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#111827', marginTop: 0 }}>Parámetros y Automatización</h3>
                                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '14px', border: '1px solid #F1F5F9' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '900', fontSize: '0.85rem' }}>🤖 Generación Automática</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Ciclo diario sin intervención manual</div>
                                                    </div>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={auditPolicy.autoEnabled}
                                                        onChange={(e) => setAuditPolicy({...auditPolicy, autoEnabled: e.target.checked})}
                                                        style={{ width: '40px', height: '20px', cursor: 'pointer' }}
                                                    />
                                                </div>
                                                
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                                    <div>
                                                        <label style={styles.label}>% COBERTURA SKUS ACTIVOS</label>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <input 
                                                                type="number" 
                                                                value={auditPolicy.coveragePercent} 
                                                                onChange={(e) => setAuditPolicy({...auditPolicy, coveragePercent: parseInt(e.target.value)})}
                                                                style={styles.input} 
                                                            />
                                                            <span style={{ fontWeight: '900' }}>%</span>
                                                        </div>
                                                        <p style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '0.3rem' }}>Usa el 100% para conteo total de SKUs con movimiento.</p>
                                                    </div>
                                                    <div>
                                                        <label style={styles.label}>Hora de Corte (Snapshot)</label>
                                                        <input 
                                                            type="time" 
                                                            value={auditPolicy.generationTime} 
                                                            onChange={(e) => setAuditPolicy({...auditPolicy, generationTime: e.target.value})}
                                                            style={styles.input} 
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={styles.label}>Umbral de Alerta (%)</label>
                                                    <input 
                                                        type="number" 
                                                        value={auditPolicy.alertThreshold} 
                                                        onChange={(e) => setAuditPolicy({...auditPolicy, alertThreshold: parseInt(e.target.value)})}
                                                        style={styles.input} 
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E5E7EB' }}>
                                            <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#111827', marginTop: 0 }}>Criterios de Selección</h3>
                                            <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {[
                                                    { id: 'prioritizeHighValue', label: 'Priorizar Productos de Alto Valor (Clase A)', icon: '💎' },
                                                    { id: 'prioritizeHighRotation', label: 'Priorizar Alta Rotación (Velocidad)', icon: '⚡' },
                                                    { id: 'prioritizePerishables', label: 'Priorizar Perecederos (Frutas/Verduras)', icon: '🍎' },
                                                    { id: 'prioritizeCriticalStock', label: 'Enfocarse en Stock Crítico / Quiebre', icon: '📉' },
                                                    { id: 'excludeAuditedRecently', label: 'Excluir auditados recientemente (< 7 días)', icon: '📅' }
                                                ].map(policy => (
                                                    <label key={policy.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer', padding: '0.5rem', borderRadius: '8px' }}>
                                                        <input 
                                                            type="checkbox" 
                                                            checked={(auditPolicy as any)[policy.id]} 
                                                            onChange={(e) => setAuditPolicy({...auditPolicy, [policy.id]: e.target.checked})}
                                                            style={{ width: '20px', height: '20px', accentColor: '#111827' }} 
                                                        />
                                                        <div>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: '800' }}>{policy.icon} {policy.label}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: '3rem', borderTop: '1px solid #E5E7EB', paddingTop: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                                        <button 
                                            onClick={() => alert('Políticas guardadas correctamente.')}
                                            style={{ backgroundColor: '#111827', color: 'white', padding: '1rem 3rem', borderRadius: '12px', border: 'none', fontWeight: '800', cursor: 'pointer' }}
                                        >
                                            Guardar Configuración
                                        </button>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'novedades' && (
                                <div style={{ padding: '0' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead style={styles.stickyHeader}>
                                            <tr>
                                                <th style={styles.th}>Fecha</th>
                                                <th style={styles.th}>Producto / SKU</th>
                                                <th style={styles.th}>Evidencia (Ruta)</th>
                                                <th style={styles.th}>Decisión Bodega</th>
                                                <th style={styles.th}>Cant.</th>
                                                <th style={styles.th}>Notas</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {movements
                                                .filter(m => m.status_to === 'returned' || m.admin_decision)
                                                .filter(m => (m.products?.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                                                .map((m) => (
                                                <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={styles.td}>{new Date(m.created_at).toLocaleDateString()}</td>
                                                    <td style={styles.td}>
                                                        <div style={{ fontWeight: '800' }}>{m.products?.name}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B' }}>{m.products?.sku}</div>
                                                    </td>
                                                    <td style={styles.td}>
                                                        {m.evidence_url ? (
                                                            <div style={{ position: 'relative', width: '80px', height: '60px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', cursor: 'zoom-in' }} onClick={() => window.open(m.evidence_url, '_blank')}>
                                                                <img src={m.evidence_url} alt="Evidencia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                <div style={{ position: 'absolute', bottom: 0, right: 0, padding: '2px 4px', background: 'rgba(0,0,0,0.5)', color: 'white', fontSize: '0.6rem' }}>🔍</div>
                                                            </div>
                                                        ) : (
                                                            <span style={{ color: '#94A3B8', fontSize: '0.8rem', fontStyle: 'italic' }}>Sin foto</span>
                                                        )}
                                                    </td>
                                                    <td style={styles.td}>
                                                        {m.admin_decision ? (
                                                            <span style={styles.badge(
                                                                m.admin_decision === 'inventory' ? '#DCFCE7' : m.admin_decision === 'waste' ? '#FEE2E2' : '#DBEAFE',
                                                                m.admin_decision === 'inventory' ? '#166534' : m.admin_decision === 'waste' ? '#991B1B' : '#1E40AF'
                                                            )}>
                                                                {m.admin_decision.toUpperCase()}
                                                            </span>
                                                        ) : (
                                                            <span style={{ ...styles.badge('#FEF3C7', '#92400E'), animation: 'pulse 2s infinite' }}>PENDIENTE</span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...styles.td, fontWeight: '900' }}>{Math.abs(m.quantity)}</td>
                                                    <td style={{ ...styles.td, fontSize: '0.8rem', color: '#64748B', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.notes}>
                                                        {m.notes || '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {movements.filter(m => m.status_to === 'returned' || m.admin_decision).length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍃</div>
                                            <h3 style={{ fontWeight: '900', color: '#1E293B' }}>Sin novedades registradas</h3>
                                            <p style={{ color: '#64748B' }}>Los retornos marcados por conductores aparecerán aquí.</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
                {activeTab === 'stock' && (
                    <div style={{ padding: '2.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem', backgroundColor: '#F8FAFC' }}>
                        <div style={{ fontSize: '0.9rem', color: THEME.colors.textSecondary, fontWeight: '800' }}>
                            Página <span style={{ color: THEME.colors.textMain }}>{currentPage}</span> de <span style={{ color: THEME.colors.textMain }}>{totalPages || 1}</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                            <button 
                                disabled={currentPage === 1} 
                                onClick={() => setCurrentPage(p => p - 1)} 
                                style={{ padding: '0.8rem 1.75rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, backgroundColor: currentPage === 1 ? '#F9FAFB' : 'white', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: '800', color: currentPage === 1 ? '#94A3B8' : THEME.colors.textMain, transition: 'all 0.2s' }}
                            >
                                Anterior
                            </button>
                            <button 
                                disabled={currentPage === totalPages || totalPages === 0} 
                                onClick={() => setCurrentPage(p => p + 1)} 
                                style={{ padding: '0.8rem 1.75rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, backgroundColor: (currentPage === totalPages || totalPages === 0) ? '#F9FAFB' : 'white', cursor: (currentPage === totalPages || totalPages === 0) ? 'not-allowed' : 'pointer', fontWeight: '800', color: (currentPage === totalPages || totalPages === 0) ? '#94A3B8' : THEME.colors.textMain, transition: 'all 0.2s' }}
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                )}
            </div>

                           {/* Adjustment Modal */}
            {isMovementModalOpen && selectedProduct && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, width: '100%', maxWidth: '480px', padding: '2.5rem', boxShadow: THEME.shadow.xl }}>
                        <h2 style={{ margin: 0, fontWeight: '900', fontSize: '1.75rem', color: THEME.colors.textMain }}>Ajuste de Inventario</h2>
                        <p style={{ color: THEME.colors.textSecondary, marginBottom: '2rem', fontSize: '1rem', fontWeight: '600' }}>{selectedProduct.name}</p>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={styles.label}>TIPO DE MOVIMIENTO</label>
                                <select id="adj_type" style={styles.input}>
                                    <option value="adjustment">⚙️ Ajuste Manual (Inventario físico)</option>
                                    <option value="entry">✚ Entrada por Devolución/Compra</option>
                                    <option value="exit">➖ Salida por Merma/Daño</option>
                                </select>
                            </div>

                            <div>
                                <label style={styles.label}>ESTADO DESTINO</label>
                                <select id="adj_status" style={styles.input}>
                                    <option value="available">✅ Disponible para venta</option>
                                    <option value="returned">🚛 En camión (Devuelto)</option>
                                    <option value="in_process">⚙️ En Reproceso</option>
                                </select>
                            </div>

                            <div>
                                <label style={styles.label}>CANTIDAD</label>
                                <input id="adj_qty" type="number" placeholder="0.00" style={styles.input} />
                            </div>

                            <div>
                                <label style={styles.label}>MOTIVO / OBSERVACIONES</label>
                                <textarea id="adj_notes" placeholder="Describa el motivo del ajuste..." style={{ ...styles.input, minHeight: '100px', resize: 'none' }} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
                            <button 
                                onClick={() => setIsMovementModalOpen(false)} 
                                style={{ flex: 1, padding: '1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, background: 'white', fontWeight: '800', cursor: 'pointer' }}
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
                                style={{ flex: 1.5, padding: '1rem', borderRadius: THEME.radius.md, border: 'none', background: THEME.colors.accent, color: 'white', fontWeight: '800', cursor: 'pointer' }}
                            >
                                Guardar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </main>
    );
}

function KPICard({ title, value, color, subtitle }: { title: string, value: string | number, color: string, subtitle: string }) {
    return (
        <div style={{ 
            backgroundColor: 'white', 
            padding: '0.85rem', 
            borderRadius: THEME.radius.xl, 
            border: `1px solid ${THEME.colors.border}`,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            position: 'relative',
            overflow: 'hidden'
        }} onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = THEME.shadow.md; }} onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.05)'; }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', backgroundColor: color }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ color: THEME.colors.textSecondary, fontSize: '0.7rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain }}>{value}</span>
            </div>
            <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                {subtitle}
            </div>
        </div>
    );
}

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon?: string }) {
    return (
        <button 
            onClick={onClick}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '0.4rem 0.6rem', 
                borderRadius: THEME.radius.md, 
                border: 'none', 
                backgroundColor: active ? THEME.colors.accent : 'transparent', 
                color: active ? 'white' : THEME.colors.textSecondary, 
                fontWeight: '800', 
                cursor: 'pointer', 
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                fontSize: '0.75rem',
                whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => { if(!active) e.currentTarget.style.backgroundColor = '#F1F5F9'; }}
            onMouseLeave={(e) => { if(!active) e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
            {icon && <span style={{ fontSize: '1rem', marginRight: '0.4rem' }}>{icon}</span>}
            {label}
        </button>
    );
}
