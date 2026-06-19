'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Toast from '@/components/Toast';
import Link from 'next/link';
import { Package, Search, Filter, Plus, ArrowUpRight, ArrowDownLeft, AlertTriangle, TrendingUp, History, Download, ChevronRight, Scale, Tag, Calendar, Database, Sparkles, Building2, Truck, MoreVertical, Edit2, Trash2, RefreshCw, ClipboardList } from 'lucide-react';
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
    container: { maxWidth: '1440px', margin: '0 auto', padding: '1.5rem' },
    header: { display: 'flex' as const, justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' },
    titleArea: { flex: 1 },
    title: { fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.03em', margin: 0, color: THEME.colors.textMain },
    subtitle: { color: THEME.colors.textSecondary, fontSize: '0.9rem', marginTop: '0.3rem', fontWeight: '400' },
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
        overflow: 'hidden',
        position: 'relative' as const
    },
    table: { width: '100%', borderCollapse: 'collapse' as const },
    stickyHeader: { 
        position: 'sticky' as const, 
        top: '-1px', 
        backgroundColor: '#F9FAFB', 
        zIndex: 10,
        borderBottom: `1px solid #E5E7EB`
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

export default function InventoryAdminPage() {
    const [stocks, setStocks] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
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
        autoEnabled: true,
        generationTime: '09:30' // Cut-off at 09:30 AM
    });
    const [generatingAudit, setGeneratingAudit] = useState(false);
    const [isInfoGuideOpen, setIsInfoGuideOpen] = useState(false);
    const ITEMS_PER_PAGE = 50;
    const isMounted = useRef(true);

    const fetchData = useCallback(async (signal?: AbortSignal, silent = false) => {
        if (silent) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
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
            if (isMounted.current) {
                setLoading(false);
                setRefreshing(false);
            }
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
        } catch (error: any) {
            console.error('Error applying inventory movement:', error);
            const message = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
            alert('Error al aplicar ajuste: ' + message);
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

        // 2. Split query by commas for multiple searches (OR logic between comma-separated terms)
        const segments = query.split(',').map(s => s.trim()).filter(Boolean);

        if (segments.length === 0) return filtered;

        return filtered.filter(s => {
            const p = s.products;
            if (!p) return false;

            return segments.some(segment => {
                // Apply "Power Search" logic to each segment
                const parts = segment.split(/\s+/);
                const tags = parts.filter(pt => pt.startsWith('@')).map(t => t.slice(1));
                const searchTerms = parts.filter(pt => !pt.startsWith('@'));

                // Text search (AND logic within a single segment)
                const matchesText = searchTerms.every(term => 
                    p.name?.toLowerCase().includes(term) ||
                    p.sku?.toLowerCase().includes(term) ||
                    p.accounting_id?.toString()?.includes(term)
                );

                if (!matchesText && searchTerms.length > 0) return false;

                // Tag search (AND logic within a single segment)
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
                        <h1 style={styles.title}>Control de Inventarios</h1>
                        <p style={styles.subtitle}>Consolidación multi-estado, trazabilidad total y auditoría inteligente.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <button 
                            onClick={() => {
                                const controller = new AbortController();
                                fetchData(controller.signal);
                            }}
                            disabled={loading || refreshing}
                            style={{ 
                                padding: '0.55rem 1rem', 
                                borderRadius: '8px', 
                                border: `1.5px solid ${THEME.colors.border}`, 
                                background: 'white', 
                                color: THEME.colors.textMain, 
                                fontWeight: '700', 
                                fontSize: '0.8rem', 
                                cursor: 'pointer', 
                                boxShadow: THEME.shadow.sm,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                transition: 'all 0.2s ease-in-out'
                            }}
                            onMouseEnter={(e) => { 
                                e.currentTarget.style.backgroundColor = '#F4F7F6'; 
                                e.currentTarget.style.borderColor = THEME.colors.primary;
                            }}
                            onMouseLeave={(e) => { 
                                e.currentTarget.style.backgroundColor = 'white'; 
                                e.currentTarget.style.borderColor = THEME.colors.border; 
                            }}
                        >
                            <RefreshCw 
                                size={14} 
                                style={{ 
                                    animation: (loading || refreshing) ? 'spin 1s linear infinite' : 'none' 
                                }} 
                            />
                            {loading || refreshing ? 'Sincronizando...' : 'Sincronizar'}
                        </button>
                        <Link href="/admin/master/products" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    padding: '0.55rem 1.25rem', 
                                    borderRadius: '8px', 
                                    border: 'none', 
                                    background: THEME.colors.primary, 
                                    color: 'white', 
                                    fontWeight: '700', 
                                    fontSize: '0.8rem', 
                                    cursor: 'pointer', 
                                    boxShadow: '0 4px 10px rgba(13, 122, 87, 0.2)',
                                    transition: 'all 0.2s ease-in-out'
                                }}
                                onMouseEnter={(e) => { 
                                    e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                    e.currentTarget.style.transform = 'translateY(-1px)'; 
                                    e.currentTarget.style.boxShadow = '0 6px 14px rgba(13, 122, 87, 0.3)'; 
                                }}
                                onMouseLeave={(e) => { 
                                    e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                    e.currentTarget.style.transform = 'translateY(0)'; 
                                    e.currentTarget.style.boxShadow = '0 4px 10px rgba(13, 122, 87, 0.2)'; 
                                }}
                            >
                                Catálogo Maestro
                            </button>
                        </Link>
                        <Link href="/admin/commercial/inventory/tasks" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    padding: '0.55rem 1.25rem', 
                                    borderRadius: '8px', 
                                    border: `1.5px solid ${THEME.colors.border}`, 
                                    background: 'white', 
                                    color: THEME.colors.textMain, 
                                    fontWeight: '700', 
                                    fontSize: '0.8rem', 
                                    cursor: 'pointer', 
                                    boxShadow: THEME.shadow.sm,
                                    transition: 'all 0.2s ease-in-out'
                                }}
                                onMouseEnter={(e) => { 
                                    e.currentTarget.style.backgroundColor = '#F4F7F6'; 
                                    e.currentTarget.style.borderColor = THEME.colors.primary;
                                }}
                                onMouseLeave={(e) => { 
                                    e.currentTarget.style.backgroundColor = 'white'; 
                                    e.currentTarget.style.borderColor = THEME.colors.border; 
                                }}
                            >
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                    <KPICard title="Items Monitoreados" value={formatNumber(stats.totalItems, 0)} color="#E0F2FE" subtitle="Cruzado con catálogo" />
                    <KPICard title="Alertas de Stock" value={formatNumber(stats.lowStock, 0)} color="#FEE2E2" subtitle="Bajo nivel mínimo" />
                    <KPICard title="Valor en Libros" value={formatMoney(stats.totalValue)} color="#DCFCE7" subtitle="Costo base total" />
                    <KPICard title="Tareas Pendientes" value={formatNumber(stats.pendingTasks, 0)} color="#FEF3C7" subtitle="Auditoría de piso" />
                </div>

                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: '1.5rem', 
                    backgroundColor: 'rgba(255, 255, 255, 0.85)', 
                    padding: '0.5rem 1rem', 
                    borderRadius: '16px', 
                    border: `1px solid ${THEME.colors.border}`, 
                    gap: '1rem',
                    boxShadow: THEME.shadow.sm
                }}>
                    <div style={{ 
                        display: 'flex', 
                        gap: '0.25rem', 
                        flexShrink: 0,
                        backgroundColor: '#EDF1EE',
                        padding: '3px',
                        borderRadius: '10px'
                    }}>
                        <TabButton active={activeTab === 'stock'} onClick={() => setActiveTab('stock')} label="Consolidado" />
                        <TabButton active={activeTab === 'movements'} onClick={() => setActiveTab('movements')} label="Movimientos" />
                        <TabButton active={activeTab === 'random_tasks'} onClick={() => setActiveTab('random_tasks')} label="Auditoría" />
                        <TabButton active={activeTab === 'novedades'} onClick={() => setActiveTab('novedades')} label="Novedades" />
                        <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Políticas" />
                    </div>
                    
                    <div style={{ position: 'relative', flex: 1, maxWidth: '500px' }}>
                        <div style={{ position: 'absolute', left: '0.9rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center' }}>
                            <Search size={16} />
                        </div>
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre, SKU o categoría..." 
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            style={{ 
                                width: '100%', 
                                padding: '0.65rem 2.8rem 0.65rem 2.5rem', 
                                borderRadius: '12px', 
                                border: `1px solid ${THEME.colors.border}`, 
                                fontSize: '0.85rem', 
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
                            >
                                ✕
                            </button>
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                        {activeTab === 'stock' && (
                            <>
                                <div style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                    {formatNumber(filteredStocks.length, 0)} <span style={{ fontWeight: '400', fontSize: '0.75rem' }}>items</span>
                                </div>
                                <select 
                                    value={stockStatusFilter}
                                    onChange={(e) => { setStockStatusFilter(e.target.value as any); setCurrentPage(1); }}
                                    style={{ 
                                        padding: '0.55rem 1.25rem', 
                                        borderRadius: '10px', 
                                        border: `1px solid ${THEME.colors.border}`, 
                                        backgroundColor: '#FFFFFF',
                                        color: THEME.colors.textMain,
                                        fontWeight: '600',
                                        fontSize: '0.8rem',
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
                            </>
                        )}
                        {activeTab === 'movements' && (
                            <div style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textSecondary }}>
                                {formatNumber(movements.length, 0)} <span style={{ fontWeight: '400', fontSize: '0.75rem' }}>registros</span>
                            </div>
                        )}
                    </div>
                </div>

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
                                                <tr 
                                                    key={item.id || `stock-${item.product_id}-${item.status}`} 
                                                    style={{ transition: 'background-color 0.2s' }} 
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} 
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                >
                                                    <td style={styles.td}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                            <div style={{ width: '44px', height: '44px', backgroundColor: '#EDF1EE', borderRadius: '10px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${THEME.colors.border}` }}>
                                                                {item.products?.image_url ? (
                                                                    <img 
                                                                        src={item.products.image_url} 
                                                                        alt={item.products.name} 
                                                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                    />
                                                                ) : (
                                                                    <Package size={20} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: '700', fontSize: '0.9rem', color: THEME.colors.textMain }}>{item.products?.name || 'Desconocido'}</div>
                                                                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                                                                    <code style={{ fontSize: '0.7rem', color: '#0A5C36', backgroundColor: '#EDF5F1', padding: '2.5px 6px', borderRadius: '4px', fontWeight: '700', letterSpacing: '0.03em' }}>
                                                                        {item.products?.sku || 'S/N'}
                                                                    </code>
                                                                    {item.products?.accounting_id && (
                                                                        <code style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, backgroundColor: '#EDF1EE', padding: '2.5px 6px', borderRadius: '4px', fontWeight: '700' }}>
                                                                            ID: {item.products.accounting_id}
                                                                        </code>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span style={styles.badge(
                                                                item.status === 'available' ? THEME.colors.successBg : item.status === 'returned' ? THEME.colors.blueBg : THEME.colors.purpleBg,
                                                                item.status === 'available' ? THEME.colors.successText : item.status === 'returned' ? THEME.colors.blueText : THEME.colors.purpleText
                                                            )}>
                                                                {item.status.toUpperCase()}
                                                            </span>
                                                            {item.products?.is_active === false && (
                                                                <span style={{
                                                                    fontSize: '0.6rem',
                                                                    backgroundColor: '#FEF2F2',
                                                                    color: '#991B1B',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px',
                                                                    fontWeight: '700',
                                                                    border: '1px solid #FECACA',
                                                                    textAlign: 'center',
                                                                    letterSpacing: '0.04em',
                                                                    width: 'fit-content'
                                                                }}>
                                                                    MASTER OFF
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ 
                                                        ...styles.td, 
                                                        textAlign: 'center' as const,
                                                        backgroundColor: item.products?.min_inventory_level > 0 ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                    }}>
                                                        {item.products?.min_inventory_level > 0 ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                <span style={{ fontWeight: '700', color: '#B91C1C', fontSize: '0.9rem' }}>
                                                                    {formatNumber(item.products.min_inventory_level, 0)}
                                                                </span>
                                                                {item.quantity <= item.products.min_inventory_level && (
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
                                                            {avgCosts[item.product_id] ? formatMoney(avgCosts[item.product_id]) : '—'}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'center' as const }}>
                                                        <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem' }}>
                                                            {avgCosts[item.product_id] ? formatMoney(avgCosts[item.product_id] * item.quantity) : '—'}
                                                        </div>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <span style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                            {item.products.unit_of_measure}
                                                        </span>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <div style={{ 
                                                            fontSize: '0.95rem', 
                                                            fontWeight: '700', 
                                                            color: item.quantity <= (item.products?.min_inventory_level || 0) ? '#B91C1C' : THEME.colors.textMain 
                                                        }}>
                                                            {formatNumber(item.quantity)}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...styles.td, textAlign: 'right' as const }}>
                                                        <button 
                                                            onClick={() => { setSelectedProduct({id: item.product_id, name: item.products?.name || 'Desconocido'}); setIsMovementModalOpen(true); }}
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
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {activeTab === 'movements' && (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={styles.table}>
                                        <thead style={styles.stickyHeader}>
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
                                                <tr key={m.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <td style={styles.td}>{new Date(m.created_at).toLocaleString()}</td>
                                                    <td style={styles.td}><strong>{m.products?.name || 'Producto Desconocido'}</strong></td>
                                                    <td style={styles.td}>
                                                        <span style={styles.badge(
                                                            m.quantity > 0 ? THEME.colors.successBg : '#FEE2E2', 
                                                            m.quantity > 0 ? THEME.colors.successText : '#B91C1C'
                                                        )}>
                                                            {m.type.toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td style={styles.td}>
                                                        <span style={styles.badge(
                                                            m.status_to === 'available' ? THEME.colors.successBg : m.status_to === 'returned' ? THEME.colors.blueBg : THEME.colors.purpleBg,
                                                            m.status_to === 'available' ? THEME.colors.successText : m.status_to === 'returned' ? THEME.colors.blueText : THEME.colors.purpleText
                                                        )}>
                                                            {(m.status_to || 'available').toUpperCase()}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...styles.td, fontWeight: '700', color: m.quantity > 0 ? '#059669' : '#B91C1C' }}>
                                                        {m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity)}
                                                     </td>
                                                    <td style={styles.td}>{m.notes || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
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
                                <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
                                     <h2 style={{ fontWeight: '800', fontSize: '1.25rem', color: THEME.colors.textMain, marginBottom: '0.25rem' }}>Políticas de Auditoría</h2>
                                     <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', marginBottom: '2rem' }}>Configure los criterios inteligentes para la selección automática de productos a auditar.</p>
                                     
                                     <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                         <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.md }}>
                                             <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.textMain, marginTop: 0, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.75rem' }}>Parámetros y Automatización</h3>
                                             <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem', backgroundColor: '#F4F7F6', borderRadius: '10px', border: `1px solid ${THEME.colors.border}` }}>
                                                     <div>
                                                         <div style={{ fontWeight: '700', fontSize: '0.8rem', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                              <Sparkles size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Generación Automática
                                                          </div>
                                                         <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>Ciclo diario sin intervención manual</div>
                                                     </div>
                                                     <input 
                                                         type="checkbox" 
                                                         checked={auditPolicy.autoEnabled}
                                                         onChange={(e) => setAuditPolicy({...auditPolicy, autoEnabled: e.target.checked})}
                                                         style={{ width: '36px', height: '18px', cursor: 'pointer', accentColor: THEME.colors.primary }}
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
                                                                 style={{
                                                                     ...styles.input,
                                                                     padding: '0.5rem',
                                                                     fontSize: '0.8rem',
                                                                     fontWeight: '600'
                                                                 }} 
                                                             />
                                                             <span style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.85rem' }}>%</span>
                                                         </div>
                                                         <p style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, marginTop: '0.3rem' }}>Usa el 100% para conteo total de SKUs con movimiento.</p>
                                                     </div>
                                                     <div>
                                                         <label style={styles.label}>Hora de Corte (Snapshot)</label>
                                                         <input 
                                                             type="time" 
                                                             value={auditPolicy.generationTime} 
                                                             onChange={(e) => setAuditPolicy({...auditPolicy, generationTime: e.target.value})}
                                                             style={{
                                                                 ...styles.input,
                                                                 padding: '0.5rem',
                                                                 fontSize: '0.8rem',
                                                                 fontWeight: '600'
                                                             }} 
                                                         />
                                                     </div>
                                                 </div>
 
                                                 <div>
                                                     <label style={styles.label}>Umbral de Alerta (%)</label>
                                                     <input 
                                                         type="number" 
                                                         value={auditPolicy.alertThreshold} 
                                                         onChange={(e) => setAuditPolicy({...auditPolicy, alertThreshold: parseInt(e.target.value)})}
                                                         style={{
                                                             ...styles.input,
                                                             padding: '0.5rem',
                                                             fontSize: '0.8rem',
                                                             fontWeight: '600'
                                                         }} 
                                                     />
                                                 </div>
                                             </div>
                                         </div>
 
                                         <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.md }}>
                                             <h3 style={{ fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.textMain, marginTop: 0, borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.75rem' }}>Criterios de Selección</h3>
                                             <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                                  {[
                                                      { id: 'prioritizeHighValue', label: 'Priorizar Productos de Alto Valor (Clase A)', icon: Scale },
                                                      { id: 'prioritizeHighRotation', label: 'Priorizar Alta Rotación (Velocidad)', icon: TrendingUp },
                                                      { id: 'prioritizePerishables', label: 'Priorizar Perecederos (Frutas/Verduras)', icon: Package },
                                                      { id: 'prioritizeCriticalStock', label: 'Enfocarse en Stock Crítico / Quiebre', icon: AlertTriangle },
                                                      { id: 'excludeAuditedRecently', label: 'Excluir auditados recientemente (< 7 días)', icon: Calendar }
                                                  ].map(policy => {
                                                      const PolicyIcon = policy.icon;
                                                      return (
                                                          <label key={policy.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', padding: '0.4rem', borderRadius: '6px', transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F4F7F6'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                              <input 
                                                                  type="checkbox" 
                                                                  checked={(auditPolicy as any)[policy.id]} 
                                                                  onChange={(e) => setAuditPolicy({...auditPolicy, [policy.id]: e.target.checked})}
                                                                  style={{ width: '18px', height: '18px', accentColor: THEME.colors.primary }} 
                                                              />
                                                              <div>
                                                                  <div style={{ fontSize: '0.8rem', fontWeight: '600', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                      <PolicyIcon size={14} strokeWidth={1.5} style={{ color: THEME.colors.textSecondary }} /> {policy.label}
                                                                  </div>
                                                              </div>
                                                          </label>
                                                      );
                                                  })}
                                             </div>
                                         </div>
                                     </div>
 
                                     <div style={{ marginTop: '2.5rem', borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                                         <button 
                                             onClick={() => alert('Políticas guardadas correctamente.')}
                                             style={{ 
                                                 backgroundColor: THEME.colors.primary, 
                                                 color: 'white', 
                                                 padding: '0.75rem 2rem', 
                                                 borderRadius: '10px', 
                                                 border: 'none', 
                                                 fontWeight: '700', 
                                                 cursor: 'pointer',
                                                 fontSize: '0.85rem',
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
                                             Guardar Configuración
                                         </button>
                                     </div>
                                 </div>
                            )}

                            {activeTab === 'novedades' && (
                                <div style={{ overflowX: 'auto' }}>
                                     <table style={styles.table}>
                                         <thead style={styles.stickyHeader}>
                                             <tr>
                                                 <th style={styles.th}>Fecha</th>
                                                 <th style={styles.th}>Producto / SKU</th>
                                                 <th style={styles.th}>Evidencia (Ruta)</th>
                                                 <th style={styles.th}>Decisión Bodega</th>
                                                 <th style={{ ...styles.th, textAlign: 'center' }}>Cant.</th>
                                                 <th style={styles.th}>Notas</th>
                                             </tr>
                                         </thead>
                                         <tbody>
                                             {movements
                                                 .filter(m => m.status_to === 'returned' || m.admin_decision)
                                                 .filter(m => (m.products?.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
                                                 .map((m) => (
                                                 <tr key={m.id} style={{ transition: 'background-color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAF9'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                     <td style={styles.td}>{new Date(m.created_at).toLocaleDateString()}</td>
                                                     <td style={styles.td}>
                                                         <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>{m.products?.name}</div>
                                                         <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>{m.products?.sku}</div>
                                                     </td>
                                                     <td style={styles.td}>
                                                         {m.evidence_url ? (
                                                             <div style={{ 
                                                                 position: 'relative', 
                                                                 width: '80px', 
                                                                 height: '55px', 
                                                                 borderRadius: '8px', 
                                                                 overflow: 'hidden', 
                                                                 border: `1px solid ${THEME.colors.border}`, 
                                                                 cursor: 'zoom-in',
                                                                 boxShadow: THEME.shadow.sm 
                                                             }} onClick={() => window.open(m.evidence_url, '_blank')}>
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
                                                     <td style={{ ...styles.td, textAlign: 'center' as const, fontWeight: '700', color: THEME.colors.textMain }}>{formatNumber(Math.abs(m.quantity))}</td>
                                                     <td style={{ ...styles.td, fontSize: '0.8rem', color: THEME.colors.textSecondary, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.notes}>
                                                         {m.notes || '-'}
                                                     </td>
                                                 </tr>
                                             ))}
                                         </tbody>
                                     </table>
                                     {movements.filter(m => m.status_to === 'returned' || m.admin_decision).length === 0 && (
                                         <div style={{ textAlign: 'center', padding: '5rem 2rem' }}>
                                             <div style={{ color: THEME.colors.textSecondary, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                                                 <Package size={48} strokeWidth={1.5} />
                                             </div>
                                             <h3 style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.05rem' }}>Sin novedades registradas</h3>
                                             <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', marginTop: '0.25rem' }}>Los retornos marcados por conductores aparecerán aquí.</p>
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

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon?: string }) {
    return (
        <button 
            onClick={onClick}
            style={{ 
                display: 'flex', 
                alignItems: 'center', 
                padding: '0.5rem 1rem', 
                borderRadius: '8px', 
                border: 'none', 
                backgroundColor: active ? THEME.colors.primary : 'transparent', 
                color: active ? '#FFFFFF' : THEME.colors.textSecondary, 
                fontWeight: '700', 
                cursor: 'pointer', 
                transition: 'all 0.2s ease-in-out',
                fontSize: '0.8rem',
                whiteSpace: 'nowrap',
                boxShadow: active ? '0 4px 10px rgba(13, 122, 87, 0.2)' : 'none'
            }}
            onMouseEnter={(e) => { 
                if(!active) {
                    e.currentTarget.style.backgroundColor = '#EAEFEA'; 
                    e.currentTarget.style.color = THEME.colors.textMain;
                }
            }}
            onMouseLeave={(e) => { 
                if(!active) {
                    e.currentTarget.style.backgroundColor = 'transparent'; 
                    e.currentTarget.style.color = THEME.colors.textSecondary;
                }
            }}
        >
            {icon && <span style={{ fontSize: '1rem', marginRight: '0.4rem' }}>{icon}</span>}
            {label}
        </button>
    );
}
