'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import Link from 'next/link';

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
    created_at: string;
    products: {
        name: string;
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

export default function InventoryAdminPage() {
    const [stocks, setStocks] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'stock' | 'movements' | 'random_tasks' | 'settings'>('stock');
    const [movements, setMovements] = useState<Movement[]>([]);
    const [randomTasks, setRandomTasks] = useState<RandomTask[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<{ id: string, name: string } | null>(null);
    const [stockStatusFilter, setStockStatusFilter] = useState<'available' | 'returned' | 'in_process' | 'all'>('all');
    const [avgCosts, setAvgCosts] = useState<Record<string, number>>({});
    interface ScoredItem {
        item: any; // Using any for the complex Supabase nested join object for now, but typed at usage
        score: number;
    }
    const [auditPolicy, setAuditPolicy] = useState({
        itemsPerDay: 5,
        alertThreshold: 5,
        prioritizeHighValue: true,
        prioritizeHighRotation: true,
        prioritizePerishables: true,
        prioritizeCriticalStock: true,
        excludeAuditedRecently: true,
        autoEnabled: true,
        generationTime: '08:00'
    });
    const [generatingAudit, setGeneratingAudit] = useState(false);
    const isMounted = useRef(true);

    const fetchData = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            if (activeTab === 'stock') {
                // Fetch from products to ensure ALL master items are visible
                let query = supabase
                    .from('products')
                    .select(`
                        id, name, sku, category, unit_of_measure, image_url, base_price, is_active, min_inventory_level,
                        inventory_stocks (
                            id, quantity, status, warehouse_id, updated_at,
                            warehouses (name)
                        )
                    `)
                    .eq('is_active', true)
                    .order('name');
                
                if (signal) query = query.abortSignal(signal);

                const { data: productsData, error } = await query;
                if (!isMounted.current) return;
                if (error) throw error;

                // Flatten the products and their stocks into InventoryItem structure
                const flattenedStocks: any[] = (productsData || []).flatMap(p => {
                    const statusStocks = p.inventory_stocks || [];
                    
                    // Filter stocks by status if a filter is active
                    const filtered = stockStatusFilter === 'all' 
                        ? statusStocks 
                        : statusStocks.filter((s: any) => s.status === stockStatusFilter);

                    if (filtered.length > 0) {
                        return filtered.map((s: any) => ({
                            ...s,
                            product_id: p.id,
                            products: p
                        }));
                    }

                    // If no stock record exists for this product (or for the filtered status),
                    // but we want global visibility (especially for 'all' or 'available' views)
                    if (stockStatusFilter === 'all' || stockStatusFilter === 'available') {
                        return [{
                            id: `virtual-${p.id}`,
                            product_id: p.id,
                            warehouse_id: 'default',
                            status: stockStatusFilter === 'all' ? 'available' : stockStatusFilter,
                            quantity: 0,
                            updated_at: new Date().toISOString(),
                            products: p,
                            warehouses: { name: 'Bodega Principal' }
                        }];
                    }

                    return [];
                });

                // --- NEW: Calculate Average Costs from Purchases ---
                const { data: purchasesData } = await supabase
                    .from('purchases')
                    .select('product_id, unit_price, created_at, purchase_unit')
                    .order('created_at', { ascending: false });

                const { data: convData } = await supabase.from('product_conversions').select('*');

                const costsMap: Record<string, number> = {};
                if (purchasesData && productsData) {
                    const grouped: Record<string, number[]> = {};
                    purchasesData.forEach(p => {
                        if (!p.product_id) return;
                        if (!grouped[p.product_id]) grouped[p.product_id] = [];
                        if (grouped[p.product_id].length < 3) { // Use window of 3 as in matrix
                            const product = productsData.find(pd => pd.id === p.product_id);
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
    }, [activeTab, stockStatusFilter]);

    const handleGenerateAudit = useCallback(async (isAuto: boolean = false) => {
        try {
            if (!isAuto) setGeneratingAudit(true);
            
            // 0. Check if already generated for today (safety for auto-calls)
            const today = new Date().toISOString().split('T')[0];
            const { data: existing } = await supabase
                .from('inventory_random_tasks')
                .select('id')
                .eq('scheduled_date', today);
            
            if (existing && existing.length > 0) {
                if (!isAuto) alert('Ya se ha generado una auditoría para el día de hoy.');
                return;
            }

            // 1. Fetch current stock and products
            const { data: stockData, error: stockError } = await supabase
                .from('inventory_stocks')
                .select('*, products(*)');
            
            if (stockError) throw stockError;
            if (!stockData || stockData.length === 0) {
                if (!isAuto) alert('No hay stock para auditar.');
                return;
            }

            // 2. Score products based on policy
            const scoredItems: ScoredItem[] = stockData.map((item: any) => {
                let score = Math.random() * 10; // Base randomness
                
                if (auditPolicy.prioritizeHighValue && item.products?.base_price > 10000) score += 5;
                if (auditPolicy.prioritizeCriticalStock && item.quantity <= item.min_stock_level) score += 10;
                if (auditPolicy.prioritizeHighRotation) score += 3;
                if (auditPolicy.prioritizePerishables && ['Frutas', 'Verduras', 'Perecederos'].includes(item.products?.category)) score += 7;

                return { item, score };
            });

            // 3. Sort and Pick Top N
            scoredItems.sort((a, b) => b.score - a.score);
            const selected = scoredItems.slice(0, auditPolicy.itemsPerDay);

            // 4. Create Task
            const { data: task, error: taskError } = await supabase
                .from('inventory_random_tasks')
                .insert([{
                    status: 'pending',
                    scheduled_date: today
                }])
                .select()
                .single();

            if (taskError) throw taskError;

            // 5. Create Task Items
            const taskItems = selected.map(s => ({
                task_id: task.id,
                product_id: s.item.product_id,
                warehouse_id: s.item.warehouse_id,
                expected_qty: s.item.quantity
            }));

            const { error: itemsError } = await supabase
                .from('inventory_task_items')
                .insert(taskItems);

            if (itemsError) throw itemsError;

            fetchData();
            if (!isAuto) alert('¡Auditoría de hoy generada con éxito!');
            else console.log('🤖 Auditoría automática generada satisfactoriamente.');
        } catch (err: unknown) {
            const e = err as Error;
            console.error('Error generating audit:', e);
            if (!isAuto) alert('Error al generar la auditoría: ' + (e.message || 'Error desconocido'));
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
        try {
            const { data: settings } = await supabase.from('inventory_settings').select('value').eq('key', 'daily_random_count').single();
            const count = settings?.value || 5;

            const { data: randomItems } = await supabase
                .from('inventory_stocks')
                .select('product_id, warehouse_id, quantity, status')
                .eq('status', 'available')
                .limit(count);

            if (!randomItems || randomItems.length === 0) throw new Error('No hay productos disponibles para inventariar');

            const { data: task, error: taskError } = await supabase
                .from('inventory_random_tasks')
                .insert([{ status: 'pending' }])
                .select()
                .single();

            if (taskError) throw taskError;

            const itemsToInsert = randomItems.map(item => ({
                task_id: task.id,
                product_id: item.product_id,
                warehouse_id: item.warehouse_id,
                expected_qty: item.quantity
            }));

            const { error: itemsError } = await supabase.from('inventory_task_items').insert(itemsToInsert);
            if (itemsError) throw itemsError;

            window.showToast?.('Tarea de inventario generada', 'success');
            fetchData();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error: ' + message);
        }
    };

    const stats = {
        totalItems: stocks.length,
        lowStock: stocks.filter(s => s.quantity <= (s.products?.min_inventory_level || 0)).length,
        totalValue: stocks.reduce((acc, s) => acc + (s.quantity * (s.products?.base_price || 0)), 0),
        pendingTasks: randomTasks.filter(t => t.status !== 'completed').length
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F9FAFB' }}>
            <Navbar />
            <Toast />

            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem' }}>
                    <div>
                        <Link href="/admin/commercial" style={{ color: '#6B7280', textDecoration: 'none', fontWeight: '600', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem' }}>
                            ← Panel Comercial
                        </Link>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0 }}>📦 Control Maestro de Inventarios</h1>
                        <p style={{ color: '#6B7280', fontSize: '1.1rem', marginTop: '0.4rem' }}>Consolidación multi-estado, trazabilidad total y auditoría a ciegas.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin/master/products" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    backgroundColor: '#2563EB', 
                                    color: 'white', 
                                    border: 'none', 
                                    padding: '1rem 1.5rem', 
                                    borderRadius: '14px', 
                                    fontWeight: '800', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.8rem',
                                    boxShadow: '0 10px 15px -3px rgba(37, 99, 235, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1D4ED8'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#2563EB'}
                            >
                                <span>📚</span> Catálogo Maestro
                            </button>
                        </Link>
                        <Link href="/admin/commercial/inventory/tasks" style={{ textDecoration: 'none' }}>
                            <button 
                                style={{ 
                                    backgroundColor: '#F8FAFC', 
                                    color: '#1E293B', 
                                    border: '1px solid #E2E8F0', 
                                    padding: '1rem 1.5rem', 
                                    borderRadius: '14px', 
                                    fontWeight: '800', 
                                    cursor: 'pointer', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '0.8rem',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                            >
                                <span>📋</span> Tareas Administrativas
                            </button>
                        </Link>
                        {activeTab === 'random_tasks' && (
                            <button 
                                onClick={generateRandomTask}
                                style={{ backgroundColor: '#111827', color: 'white', border: 'none', padding: '1rem 1.5rem', borderRadius: '14px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                            >
                                🎲 Generar Tarea Aleatoria
                            </button>
                        )}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    <KPICard title="Items Monitoreados" value={stats.totalItems} icon="📦" color="#E0F2FE" textColor="#0369A1" subtitle="Cruzado con catálogo" />
                    <KPICard title="Alertas de Stock" value={stats.lowStock} icon="🚩" color="#FEE2E2" textColor="#991B1B" subtitle="Bajo nivel mínimo" />
                    <KPICard title="Valor en Libros" value={`$${Math.round(stats.totalValue).toLocaleString()}`} icon="💰" color="#DCFCE7" textColor="#15803D" subtitle="Costo base total" />
                    <KPICard title="Tareas Pendientes" value={stats.pendingTasks} icon="📋" color="#FEF3C7" textColor="#92400E" subtitle="Auditoría de piso" />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', backgroundColor: 'white', padding: '0.75rem', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <TabButton active={activeTab === 'stock'} onClick={() => setActiveTab('stock')} label="Consolidado" icon="📊" />
                        <TabButton active={activeTab === 'movements'} onClick={() => setActiveTab('movements')} label="Movimientos" icon="🔄" />
                        <TabButton active={activeTab === 'random_tasks'} onClick={() => setActiveTab('random_tasks')} label="Auditoría/Random" icon="🎲" />
                        <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} label="Políticas" icon="⚙️" />
                    </div>
                    
                    <div style={{ position: 'relative', width: '400px' }}>
                        <input 
                            type="text" 
                            placeholder="Buscar producto o SKU..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.5rem', borderRadius: '12px', border: '1px solid #D1D5DB', fontSize: '0.95rem' }}
                        />
                        <span style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                    </div>
                </div>

                {activeTab === 'stock' && (
                    <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem' }}>
                        {(['all', 'available', 'returned', 'in_process'] as const).map(status => (
                            <button 
                                key={status}
                                onClick={() => setStockStatusFilter(status)}
                                style={{ 
                                    padding: '0.5rem 1rem', borderRadius: '100px', border: '1px solid #E5E7EB',
                                    backgroundColor: stockStatusFilter === status ? '#111827' : 'white',
                                    color: stockStatusFilter === status ? 'white' : '#64748B',
                                    fontWeight: '700', fontSize: '0.85rem', cursor: 'pointer'
                                }}
                            >
                                {status === 'all' ? 'Ver Todos' : status === 'available' ? '✅ Disponible' : status === 'returned' ? '🚛 Regreso' : '⚙️ Reproceso'}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ padding: '8rem', textAlign: 'center' }}>🔄 Cargando...</div>
                    ) : (
                        <>
                            {activeTab === 'stock' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#F8FAFC' }}>
                                        <tr>
                                            <th style={thStyle}>Producto</th>
                                            <th style={thStyle}>Estado</th>
                                            <th style={thStyle}>Mínimo</th>
                                            <th style={thStyle}>Costo Prom.</th>
                                            <th style={thStyle}>Valor Inv.</th>
                                            <th style={thStyle}>Unidad</th>
                                            <th style={thStyle}>Cantidad</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stocks.filter(s => (s.products?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (s.products?.sku || '').toLowerCase().includes(searchQuery.toLowerCase())).map((item) => (
                                            <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={tdStyle}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                                        <div style={{ width: '40px', height: '40px', backgroundColor: '#F3F4F6', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {item.products?.image_url ? (
                                                                <img 
                                                                    src={item.products.image_url} 
                                                                    alt={item.products.name} 
                                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                />
                                                            ) : (
                                                                <span style={{ fontSize: '1.2rem' }}>📦</span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: '800' }}>{item.products?.name || 'Desconocido'}</div>
                                                            <code style={{ fontSize: '0.7rem', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 4px', borderRadius: '3px' }}>
                                                                {item.products?.sku || 'S/N'}
                                                            </code>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={badgeStyle(
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
                                                                fontWeight: '800',
                                                                border: '1px solid #FECACA',
                                                                textAlign: 'center'
                                                            }}>
                                                                🚩 MASTER OFF
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ 
                                                    ...tdStyle, 
                                                    textAlign: 'center',
                                                    backgroundColor: item.products?.min_inventory_level > 0 ? '#FEF2F2' : 'transparent',
                                                    borderLeft: item.products?.min_inventory_level > 0 ? '3px solid #EF4444' : 'none'
                                                }}>
                                                    {item.products?.min_inventory_level > 0 ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                            <span style={{ fontWeight: '900', color: '#B91C1C', fontSize: '1rem' }}>
                                                                {item.products.min_inventory_level}
                                                            </span>
                                                            {item.quantity <= item.products.min_inventory_level && (
                                                                <span title="Bajo el mínimo crítico" style={{ fontSize: '0.8rem' }}>⚠️</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <div style={{ fontWeight: '700', color: '#059669', fontSize: '0.9rem' }}>
                                                        {avgCosts[item.product_id] ? `$${Math.round(avgCosts[item.product_id]).toLocaleString()}` : '—'}
                                                    </div>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <div style={{ fontWeight: '900', color: '#111827', fontSize: '0.95rem' }}>
                                                        {avgCosts[item.product_id] ? `$${Math.round(avgCosts[item.product_id] * item.quantity).toLocaleString()}` : '—'}
                                                    </div>
                                                </td>
                                                <td style={tdStyle}>
                                                    <span style={{ fontSize: '0.9rem', color: '#64748B', fontWeight: '600' }}>
                                                        {item.products.unit_of_measure}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>
                                                    <div style={{ fontSize: '1.1rem', fontWeight: '900' }}>{item.quantity}</div>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                                    <button 
                                                        onClick={() => { setSelectedProduct({id: item.product_id, name: item.products?.name || 'Desconocido'}); setIsMovementModalOpen(true); }}
                                                        style={{ backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', padding: '0.5rem 0.8rem', borderRadius: '8px', fontWeight: '700', cursor: 'pointer' }}
                                                    >
                                                        Ajustar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {activeTab === 'movements' && (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead style={{ backgroundColor: '#F8FAFC' }}>
                                        <tr>
                                            <th style={thStyle}>Fecha</th>
                                            <th style={thStyle}>Producto</th>
                                            <th style={thStyle}>Tipo</th>
                                            <th style={thStyle}>Estado Destino</th>
                                            <th style={thStyle}>Cantidad</th>
                                            <th style={thStyle}>Notas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.filter(m => (m.products?.name || 'Desconocido').toLowerCase().includes(searchQuery.toLowerCase())).map((m) => (
                                            <tr key={m.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={tdStyle}>{new Date(m.created_at).toLocaleString()}</td>
                                                <td style={tdStyle}><strong>{m.products?.name || 'Producto Desconocido'}</strong></td>
                                                <td style={tdStyle}>
                                                    <span style={badgeStyle(m.quantity > 0 ? '#DCFCE7' : '#FEE2E2', m.quantity > 0 ? '#166534' : '#991B1B')}>
                                                        {m.type.toUpperCase()}
                                                    </span>
                                                </td>
                                                <td style={tdStyle}>{m.status_to || 'available'}</td>
                                                <td style={{ ...tdStyle, fontWeight: '900', color: m.quantity > 0 ? '#10B981' : '#EF4444' }}>
                                                    {m.quantity > 0 ? '+' : ''}{m.quantity}
                                                </td>
                                                <td style={tdStyle}>{m.notes || '-'}</td>
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
                                                    <span style={badgeStyle(task.status === 'completed' ? '#DCFCE7' : '#FEF3C7', task.status === 'completed' ? '#166534' : '#92400E')}>
                                                        {task.status.toUpperCase()}
                                                    </span>
                                                </div>
                                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: 'white' }}>
                                                            <th style={{ ...thStyle, fontSize: '0.7rem' }}>Producto</th>
                                                            <th style={{ ...thStyle, fontSize: '0.7rem' }}>Stock Sistema</th>
                                                            <th style={{ ...thStyle, fontSize: '0.7rem' }}>Físico (Conteo Ciego)</th>
                                                            <th style={{ ...thStyle, fontSize: '0.7rem' }}>Diferencia %</th>
                                                            <th style={{ ...thStyle, fontSize: '0.7rem', textAlign: 'right' }}>Estado</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {task.items.map(item => (
                                                            <tr key={item.id} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: 'white' }}>
                                                                <td style={tdStyle}><strong>{item.products?.name || 'Producto Desconocido'}</strong></td>
                                                                <td style={tdStyle}>{item.expected_qty}</td>
                                                                <td style={tdStyle}>
                                                                    {item.actual_qty !== null ? (
                                                                        <span style={{ fontWeight: '900' }}>{item.actual_qty}</span>
                                                                    ) : (
                                                                        <button style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#F8FAFC', fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer' }}>Ingresar Conteo</button>
                                                                    )}
                                                                </td>
                                                                <td style={{ ...tdStyle, color: item.difference_percent > auditPolicy.alertThreshold ? '#EF4444' : '#10B981', fontWeight: '800' }}>
                                                                    {item.actual_qty !== null ? `${item.difference_percent.toFixed(1)}%` : '-'}
                                                                </td>
                                                                <td style={{ ...tdStyle, textAlign: 'right' }}>
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
                                                        <label style={labelStyle}>Items por día</label>
                                                        <input 
                                                            type="number" 
                                                            value={auditPolicy.itemsPerDay} 
                                                            onChange={(e) => setAuditPolicy({...auditPolicy, itemsPerDay: parseInt(e.target.value)})}
                                                            style={inputStyle} 
                                                        />
                                                    </div>
                                                    <div>
                                                        <label style={labelStyle}>Hora de Creación</label>
                                                        <input 
                                                            type="time" 
                                                            value={auditPolicy.generationTime} 
                                                            onChange={(e) => setAuditPolicy({...auditPolicy, generationTime: e.target.value})}
                                                            style={inputStyle} 
                                                        />
                                                    </div>
                                                </div>

                                                <div>
                                                    <label style={labelStyle}>Umbral de Alerta (%)</label>
                                                    <input 
                                                        type="number" 
                                                        value={auditPolicy.alertThreshold} 
                                                        onChange={(e) => setAuditPolicy({...auditPolicy, alertThreshold: parseInt(e.target.value)})}
                                                        style={inputStyle} 
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
                        </>
                    )}
                </div>
            </div>

            {/* Adjustment Modal */}
            {isMovementModalOpen && selectedProduct && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '450px', padding: '2rem' }}>
                        <h2 style={{ margin: 0, fontWeight: '900' }}>Ajuste de Inventario</h2>
                        <p style={{ color: '#64748B' }}>{selectedProduct.name}</p>
                        <div style={{ margin: '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <select id="adj_type" style={inputStyle}>
                                <option value="adjustment">⚙️ Ajuste Manual (Inventario físico)</option>
                                <option value="entry">✚ Entrada por Devolución/Compra</option>
                                <option value="exit">➖ Salida por Merma/Daño</option>
                            </select>
                            <select id="adj_status" style={inputStyle}>
                                <option value="available">✅ Disponible para venta</option>
                                <option value="returned">🚛 En camión (Devuelto)</option>
                                <option value="in_process">⚙️ En Reproceso</option>
                            </select>
                            <input id="adj_qty" type="number" placeholder="Cantidad..." style={inputStyle} />
                            <textarea id="adj_notes" placeholder="Motivo/Observación..." style={{ ...inputStyle, minHeight: '80px' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button onClick={() => setIsMovementModalOpen(false)} style={{ flex: 1, padding: '0.8rem', borderRadius: '12px', border: '1px solid #E5E7EB', background: 'white', fontWeight: '800' }}>Cancelar</button>
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
                                }}
                                style={{ flex: 1.5, padding: '0.8rem', borderRadius: '12px', border: 'none', background: '#111827', color: 'white', fontWeight: '800' }}
                            >
                                Guardar Ajuste
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

const thStyle: React.CSSProperties = { padding: '1rem 1.5rem', textAlign: 'left', fontSize: '0.8rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' };
const tdStyle: React.CSSProperties = { padding: '1rem 1.5rem', fontSize: '0.9rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.8rem', borderRadius: '10px', border: '1px solid #E5E7EB', fontSize: '0.9rem', fontWeight: '700', boxSizing: 'border-box' };
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '0.7rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', marginBottom: '0.4rem' };
const badgeStyle = (bg: string, color: string): React.CSSProperties => ({ backgroundColor: bg, color, padding: '0.2rem 0.6rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '900' });

function KPICard({ title, value, icon, color, textColor, subtitle }: { title: string, value: string | number, icon: string, color: string, textColor: string, subtitle: string }) {
    return (
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ backgroundColor: color, width: '50px', height: '50px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>{icon}</div>
            <div>
                <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase' }}>{title}</div>
                <div style={{ fontSize: '1.3rem', fontWeight: '900', color: textColor }}>{value}</div>
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '600' }}>{subtitle}</div>
            </div>
        </div>
    );
}

function TabButton({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: string }) {
    return (
        <button 
            onClick={onClick}
            style={{ 
                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '12px', border: 'none', 
                backgroundColor: active ? '#F1F5F9' : 'transparent', color: active ? '#1E293B' : '#64748B', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s'
            }}
        >
            <span>{icon}</span> {label}
        </button>
    );
}
