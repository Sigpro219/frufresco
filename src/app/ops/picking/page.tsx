'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { RealtimeChannel } from '@supabase/supabase-js';

interface PickingItem {
    id: string;
    product_id: string;
    product_name: string;
    quantity: number;
    picked_quantity: number;
    unit: string;
    quality_status?: 'green' | 'yellow' | 'red' | null;
    quality_notes?: string;
}

interface PickingTask {
    id: string; // client id
    company_name: string;
    assigned_space: number | null;
    zone: string;
    items: PickingItem[];
    status: 'pending' | 'partial' | 'ready';
    hasAlert?: boolean;
}

export default function PickingExecutionPage() {
    const [showCompleted, setShowCompleted] = useState(false);
    const [viewMode, setViewMode] = useState<'client' | 'product'>('client');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [categories, setCategories] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [tasks, setTasks] = useState<PickingTask[]>([]);
    
    const [exceptionItem, setExceptionItem] = useState<PickingItem | null>(null);
    const [exceptionQty, setExceptionQty] = useState('');
    const [exceptionQuality, setExceptionQuality] = useState<'green' | 'yellow' | 'red' | null>(null);
    const [exceptionReason, setExceptionReason] = useState<string>('');

    const REJECTION_REASONS = [
        "Producto Dañado",
        "Madurez Incorrecta",
        "Presencia de Plagas",
        "Embalaje Roto",
        "Color/Tamaño No Cumple",
        "Faltante"
    ];

    // Validation Flow States
    const [isQuantityValidated, setIsQuantityValidated] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [realtimeChannel, setRealtimeChannel] = useState<RealtimeChannel | null>(null);
    
    const router = useRouter();

    const isMounted = useRef(true);

    const fetchTasks = useCallback(async (signal?: AbortSignal) => {
        try {
            let query = supabase
                .from('orders')
                .select(`
                    id, customer_name, status,
                    order_items (
                        id, product_id, quantity, picked_quantity, quality_status, quality_notes,
                        products (name, category, unit_of_measure)
                    )
                `)
                .neq('status', 'cancelled');

            // Check Global Cutoff Switch
            const { data: settings } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'enable_cutoff_rules')
                .single()
                .abortSignal(signal as any);
            
            const cutoffEnabled = settings?.value !== 'false';

            if (cutoffEnabled) {
                // Apply strict daily filter if enabled
                // For example, picking only for "today's" orders or similar logic if applicable.
                // Currently fetching ALL non-cancelled. If we need to filter by date/cutoff, add here.
                // If picking logic relies on specific statuses that depend on procurement consolidation,
                // then the upstream switch in Compras might be enough.
                // However, adding a log or explicit filter if needed:
                // query = query.gte('created_at', todayStart)...
            } else {
                 console.log("🛑 Cutoff Rules DISABLED: Fetching ALL active orders for Picking.");
            }

            if (signal) query = query.abortSignal(signal);

            const { data: activeOrders, error: orderError } = await query;

            if (orderError) {
                if (isAbortError(orderError)) return;
                console.error('Database Error (orders):', orderError.message);
                return;
            }

            const { data: profiles } = await supabase.from('profiles').select('id, company_name, delivery_zone_id').eq('role', 'b2b_client').abortSignal(signal as any);
            const { data: zones } = await supabase.from('delivery_zones').select('id, name').abortSignal(signal as any);
            const zoneMap = new Map((zones || []).map(z => [z.id, z.name]));
            const profileMap = new Map((profiles || []).map(p => [p.company_name, p]));

            const allOrderClients = new Set(
                (activeOrders || [])
                    .map(o => o.customer_name)
                    .filter(name => !!name)
            );
            
            const clientList = Array.from(allOrderClients)
                .map(name => {
                    const profile = profileMap.get(name);
                    const zone = zoneMap.get(profile?.delivery_zone_id) || 'GENERAL';
                    return { name, zone };
                });

            clientList.sort((a, b) => {
                const zoneA = a.zone.toUpperCase();
                const zoneB = b.zone.toUpperCase();
                if (zoneA !== zoneB) return zoneA.localeCompare(zoneB);
                const nameA = a.name.toUpperCase();
                const nameB = b.name.toUpperCase();
                return nameA.localeCompare(nameB);
            });

            const globalSpaceMap = new Map<string, number>();
            clientList.forEach((client, index) => {
                globalSpaceMap.set(client.name, index + 1);
            });

            const formattedTasks: Record<string, PickingTask> = {};
            (activeOrders || [])
                .filter(o => !!o.customer_name)
                .forEach(order => {
                    const clientName = order.customer_name;
                    // Safely type cast the order items since we know the structure of our query
                    const items = (order.order_items as unknown as any[]) || [];
                    
                    const itemsInCategory = items
                        .filter(item => {
                            const product = Array.isArray(item.products) ? item.products[0] : item.products;
                            return product?.category === selectedCategory;
                        })
                        .map(item => {
                            const product = Array.isArray(item.products) ? item.products[0] : item.products;
                            return {
                                id: item.id,
                                product_id: item.product_id,
                                product_name: product?.name || 'Producto Desconocido',
                                quantity: item.quantity,
                                picked_quantity: item.picked_quantity || 0,
                                quality_status: item.quality_status,
                                quality_notes: item.quality_notes,
                                unit: product?.unit_of_measure || 'un'
                            };
                        });

                    if (itemsInCategory.length > 0) {
                        if (!formattedTasks[clientName]) {
                            const profile = profileMap.get(clientName);
                            const zoneName = zoneMap.get(profile?.delivery_zone_id) || 'GENERAL';

                            formattedTasks[clientName] = {
                                id: order.id,
                                company_name: clientName,
                                assigned_space: globalSpaceMap.get(clientName) || 0,
                                zone: zoneName,
                                items: [],
                                status: 'pending'
                            };
                        }
                        formattedTasks[clientName].items.push(...itemsInCategory);
                    }
                });

            let finalTasks = Object.values(formattedTasks);

            finalTasks = finalTasks.map(task => {
                const completed = task.items.filter(i => i.picked_quantity >= i.quantity && i.quality_status !== 'red').length;
                const hasAlert = task.items.some(i => i.quality_status === 'red' || i.quality_status === 'yellow');
                const isAllProcessed = task.items.every(i => i.picked_quantity > 0 || i.quality_status === 'red');
                
                let status: 'pending' | 'partial' | 'ready' = 'pending';
                if (completed === task.items.length) status = 'ready';
                else if (completed > 0 || hasAlert || isAllProcessed) status = 'partial';
                
                return { ...task, status, hasAlert };
            });

            if (isMounted.current) {
                setTasks(finalTasks.sort((a, b) => {
                    if (a.hasAlert && !b.hasAlert) return -1;
                    if (!a.hasAlert && b.hasAlert) return 1;
                    if (a.status !== 'ready' && b.status === 'ready') return -1;
                    if (a.status === 'ready' && b.status !== 'ready') return 1;
                    return (a.assigned_space || 999) - (b.assigned_space || 999);
                }));
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error('Error in fetchTasks:', err);
        }
    }, [selectedCategory]);

    const fetchInitialData = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        try {
            const { data: prods } = await supabase.from('products').select('category').abortSignal(signal as any);
            const uniqueCats = Array.from(new Set((prods || []).map(p => p.category))).filter(Boolean);
            
            if (isMounted.current) {
                setCategories(uniqueCats);
                if (uniqueCats.length > 0 && !selectedCategory) {
                    setSelectedCategory(uniqueCats[0]);
                } else {
                    // If we already have a category or none available, just fetch tasks
                    await fetchTasks(signal);
                }
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return;
            console.error('Error fetching initial picking data:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [fetchTasks, selectedCategory]);

    useEffect(() => {
        isMounted.current = true;
        const controller = new AbortController();
        
        // Initial load
        fetchInitialData(controller.signal);
        
        return () => {
            isMounted.current = false;
            controller.abort();
        };
    }, [fetchInitialData]);

    useEffect(() => {
        if (selectedCategory) {
            const controller = new AbortController();
            fetchTasks(controller.signal);
            return () => controller.abort();
        }
    }, [selectedCategory, showCompleted, fetchTasks]);

    // Establish persistent Realtime Channel for broadcasting
    useEffect(() => {
        console.log('🔌 Estableciendo canal de comunicación...');
        const channel = supabase.channel('picking-realtime');
        channel.subscribe((status) => {
             console.log('📡 Estado de conexión (Capitán):', status);
        });
        setRealtimeChannel(channel);

        return () => {
            console.log('🔌 Desconectando canal...');
            supabase.removeChannel(channel);
        };
    }, []);

    const quickComplete = (item: PickingItem) => {
        setExceptionItem({
            id: item.id,
            product_id: item.product_id,
            product_name: item.product_name || '',
            quantity: item.quantity,
            picked_quantity: item.picked_quantity || 0,
            unit: item.unit || ''
        });
        setExceptionQty(item.quantity.toString());
        setExceptionQuality(null);
        setIsQuantityValidated(true); // Direct to Quality Semaphore
    };

    // Group tasks by product for the 'product' view
    interface ProductGroup {
        name: string;
        unit: string;
        clients: {
            id: string;
            order_id: string;
            company_name: string;
            space: number;
            quantity: number;
            picked_quantity: number;
            quality_status: 'green' | 'yellow' | 'red' | null;
            quality_notes: string;
            isDone: boolean;
        }[];
    }
    const productGroups: ProductGroup[] = [];
    if (viewMode === 'product') {
        const tempGroups: Record<string, ProductGroup> = {};
        tasks.forEach(task => {
            task.items.forEach(item => {
                const hasAlert = item.quality_status === 'red' || item.quality_status === 'yellow';
                const isItemDone = item.picked_quantity >= item.quantity && item.quality_status !== 'red';
                
                // Show if NOT done, OR if it has an alert (we need to see the glow!)
                const shouldShow = showCompleted || !isItemDone || hasAlert;
                if (!shouldShow) return;

                if (!tempGroups[item.product_name]) {
                    tempGroups[item.product_name] = {
                        name: item.product_name,
                        unit: item.unit,
                        clients: []
                    };
                }
                
                tempGroups[item.product_name].clients.push({
                    id: item.id,
                    order_id: task.id,
                    company_name: task.company_name,
                    space: task.assigned_space || 0,
                    quantity: item.quantity,
                    picked_quantity: item.picked_quantity,
                    quality_status: item.quality_status || null,
                    quality_notes: item.quality_notes || '',
                    isDone: isItemDone
                });
            });
        });
        // Sort groups by name
        Object.keys(tempGroups).sort().forEach(key => {
            const group = tempGroups[key];
            // Sort clients within the group: RECHAZOS > VERIFICA > PENDIENTE > ESPACIO
            group.clients.sort((a, b) => {
                // 1. Red alerts first
                if (a.quality_status === 'red' && b.quality_status !== 'red') return -1;
                if (a.quality_status !== 'red' && b.quality_status === 'red') return 1;
                // 2. Yellow alerts second
                if (a.quality_status === 'yellow' && b.quality_status !== 'yellow') return -1;
                if (a.quality_status !== 'yellow' && b.quality_status === 'yellow') return 1;
                // 3. Then pending
                if (!a.isDone && b.isDone) return -1;
                if (a.isDone && !b.isDone) return 1;
                // 4. Finally by space
                return (a.space || 0) - (b.space || 0);
            });
            productGroups.push(group);
        });
    }

    const openExceptionModal = (item: PickingItem) => {
        setExceptionItem(item);
        setExceptionQty(''); // Start empty for blind entry
        setExceptionQuality(null);
        setIsQuantityValidated(false);
    };

    const handleValidateQuantity = () => {
        if (!exceptionItem || !exceptionQty) return;
        
        // In picking, we trust the captain's input. 
        // Any value entered moves to the quality stage.
        setIsQuantityValidated(true);
    };

    const handleExceptionSave = async () => {
        if (!exceptionItem) return;
        const qty = parseFloat(exceptionQty);
        if (isNaN(qty)) return alert('Cantidad inválida');
        
        setIsSaving(true);
        try {
            // 1. Update order_items with picked_quantity and quality_status
            const { error: orderItemError } = await supabase.from('order_items').update({ 
                picked_quantity: qty,
                quality_status: exceptionQuality,
                quality_notes: exceptionReason
            }).eq('id', exceptionItem.id);

            if (orderItemError) throw orderItemError;

            // 2. NEW: Inventory Integration
            // If it's a rejection (Red) or a discrepancy, record in inventory
            if (exceptionQuality === 'red' || qty < exceptionItem.quantity) {
                const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
                
                if (warehouseData) {
                    const diff = exceptionItem.quantity - qty;
                    
                    // If rejected or partially missing, we need to track it
                    if (exceptionQuality === 'red') {
                        // Entire quantity is now "In-Process" (Reproceso) because it's not apt for sale
                        await supabase.from('inventory_movements').insert([{
                            product_id: exceptionItem.product_id,
                            warehouse_id: warehouseData.id,
                            quantity: -exceptionItem.quantity,
                            type: 'adjustment',
                            status_to: 'in_process',
                            notes: `Rechazo en picking: ${exceptionReason}`,
                            reference_type: 'order_picking',
                            reference_id: exceptionItem.id
                        }]);
                    } else if (qty < exceptionItem.quantity) {
                        // Partial missing - subtract the difference from available
                        // This might be "merma" or just a stock error
                        await supabase.from('inventory_movements').insert([{
                            product_id: exceptionItem.product_id,
                            warehouse_id: warehouseData.id,
                            quantity: -diff,
                            type: 'exit',
                            status_to: 'available',
                            notes: `Faltante en picking: ${exceptionReason || 'No especificado'}`,
                            reference_type: 'order_picking',
                            reference_id: exceptionItem.id
                        }]);
                    }
                }
            }

            // Send broadcast using persistent channel
            if (realtimeChannel) {
                realtimeChannel.send({
                    type: 'broadcast',
                    event: 'refresh',
                    payload: { id: exceptionItem.id, qty }
                }).then(() => console.log('🚀 Broadcast enviado con éxito'));
            }
            
            handleCloseExceptionModal();
            fetchTasks();
            window.showToast?.('Picking actualizado e inventario sincronizado', 'success');
        } catch (err: unknown) {
            console.error('Error in handleExceptionSave:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar: ' + message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCloseExceptionModal = () => {
        setExceptionItem(null);
        setExceptionQty('');
        setExceptionQuality(null);
        setExceptionReason('');
        setIsQuantityValidated(false);
    };

    // Dashboard Metrics
    const pendingTasks = tasks.filter(t => t.status === 'pending' && !t.hasAlert).length;
    const partialTasks = tasks.filter(t => t.status === 'partial' && !t.hasAlert).length;
    const alertTasks = tasks.filter(t => t.hasAlert).length;
    const readyTasks = tasks.filter(t => t.status === 'ready').length;
    const totalTasks = tasks.length;
    
    const progress = totalTasks > 0 ? Math.round((readyTasks / totalTasks) * 100) : 0;
    const readyPct = totalTasks > 0 ? (readyTasks / totalTasks) * 100 : 0;
    const partialPct = totalTasks > 0 ? (partialTasks / totalTasks) * 100 : 0;
    const alertPct = totalTasks > 0 ? (alertTasks / totalTasks) * 100 : 0;

    return (
        <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0F172A', minHeight: '100vh', paddingBottom: '7rem' }}>
            
            {/* DARK DASHBOARD HEADER */}
            <div style={{
                backgroundColor: '#1E293B',
                padding: '1.5rem 1.5rem 2.5rem 1.5rem',
                borderBottomLeftRadius: '32px',
                borderBottomRightRadius: '32px',
                color: 'white',
                marginBottom: '-1.5rem',
                position: 'relative',
                zIndex: 10,
                boxShadow: '0 4px 20px -5px rgba(0, 0, 0, 0.4)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <h1 style={{ fontSize: '1.8rem', fontWeight: '900', margin: 0, letterSpacing: '-1px' }}>
                            Picking <span style={{ color: '#22C55E' }}>Capitán</span>
                        </h1>
                        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                            <button 
                                onClick={() => setViewMode('client')}
                                style={{ 
                                    padding: '0.4rem 0.6rem', fontSize: '0.65rem', fontWeight: 'bold', borderRadius: '8px', border: 'none',
                                    backgroundColor: viewMode === 'client' ? '#22C55E' : 'rgba(255,255,255,0.05)',
                                    color: viewMode === 'client' ? '#064E3B' : '#94A3B8'
                                }}>📦 CUBÍCULO</button>
                            <button 
                                onClick={() => setViewMode('product')}
                                style={{ 
                                    padding: '0.4rem 0.6rem', fontSize: '0.65rem', fontWeight: 'bold', borderRadius: '8px', border: 'none',
                                    backgroundColor: viewMode === 'product' ? '#22C55E' : 'rgba(255,255,255,0.05)',
                                    color: viewMode === 'product' ? '#064E3B' : '#94A3B8'
                                }}>🥦 SUMINISTRO</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'flex-end' }}>
                        <button 
                            onClick={() => router.push('/ops')}
                            style={{ background: 'rgba(255,255,255,0.1)', padding: '0.5rem', borderRadius: '10px', border: 'none', color: 'white', fontSize: '1rem' }}>
                            🚪
                        </button>
                        <button 
                            onClick={() => setShowCompleted(!showCompleted)}
                            style={{ fontSize: '0.6rem', backgroundColor: showCompleted ? '#22C55E' : 'rgba(255,255,255,0.05)', color: 'white', padding: '0.4rem 0.6rem', borderRadius: '8px', border: 'none', fontWeight: 'bold' }}>
                            {showCompleted ? 'OCULTAR LISTOS' : 'VER LISTOS'}
                        </button>
                    </div>
                </div>

                {/* Intelligent Search Bar */}
                <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                    <input 
                        type="text"
                        placeholder={viewMode === 'client' ? "Buscar cliente o espacio..." : "Buscar producto..."}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                            width: '100%', padding: '0.8rem 1rem 0.8rem 2.8rem', borderRadius: '14px', border: '2px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(0,0,0,0.2)', color: 'white', fontSize: '0.9rem', outline: 'none', transition: 'border-color 0.2s'
                        }}
                    />
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                    {searchTerm && (
                        <button 
                            onClick={() => setSearchTerm('')}
                            style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                    )}
                </div>

                {/* Progress Bar */}
                {totalTasks > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: '700', color: '#CBD5E1' }}>
                            <span>AVANCE DE RUTA</span>
                            <span style={{ color: '#22C55E' }}>{progress}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#334155', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                            <div style={{ width: `${readyPct}%`, height: '100%', backgroundColor: '#22C55E', transition: 'width 0.5s ease-out' }} />
                            <div style={{ width: `${partialPct}%`, height: '100%', backgroundColor: '#EAB308', transition: 'width 0.5s ease-out' }} />
                            <div style={{ width: `${alertPct}%`, height: '100%', backgroundColor: '#EF4444', transition: 'width 0.5s ease-out' }} />
                        </div>
                    </div>
                )}

                {/* Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '0.6rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#94A3B8' }}>{pendingTasks}</div>
                        <div style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#64748B' }}>PENDIENTE</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '0.6rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#EAB308' }}>{partialTasks}</div>
                        <div style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#64748B' }}>PARCIAL</div>
                    </div>
                    <div style={{ backgroundColor: alertTasks > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '0.6rem', textAlign: 'center', border: alertTasks > 0 ? '1px solid #EF4444' : '1px solid rgba(255,255,255,0.05)', animation: alertTasks > 0 ? 'pulseRed 2s infinite' : 'none' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#EF4444' }}>{alertTasks}</div>
                        <div style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#EF4444' }}>ALERTAS</div>
                    </div>
                    <div style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '14px', padding: '0.6rem', textAlign: 'center', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#22C55E' }}>{readyTasks}</div>
                        <div style={{ fontSize: '0.5rem', fontWeight: 'bold', color: '#64748B' }}>LISTO</div>
                    </div>
                </div>

                {/* Filters */}
                <div style={{ 
                    display: 'flex', gap: '0.6rem', overflowX: 'auto', 
                    paddingBottom: '0.5rem', 
                    paddingTop: '0px', paddingRight: '0px', paddingLeft: '0px', // Explicit properties to avoid conflict
                    scrollbarWidth: 'none' 
                }}>
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            style={{
                                padding: '0.5rem 1rem', borderRadius: '20px', border: 'none',
                                backgroundColor: selectedCategory === cat ? '#22C55E' : 'rgba(255,255,255,0.1)',
                                color: selectedCategory === cat ? '#022C22' : '#94A3B8', 
                                fontWeight: '800', fontSize: '0.8rem', whiteSpace: 'nowrap',
                                transition: 'all 0.2s'
                            }}
                        >
                            {cat.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            {/* MAIN CONTENT AREA */}
            <div style={{ padding: '2.5rem 1rem 1rem 1rem' }}>
                
                {/* VIEW 1: BY CLIENT (CUBÍCULO) */}
                {viewMode === 'client' && (
                    <div style={{ display: 'grid', gap: '1rem' }}>
                        {tasks
                            .filter(t => (showCompleted || t.status !== 'ready'))
                            .filter(t => !searchTerm || t.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) || t.assigned_space?.toString() === searchTerm)
                            .map(task => (
                            <div key={task.company_name} style={{
                                backgroundColor: '#1E293B', borderRadius: '20px', overflow: 'hidden',
                                borderLeft: `8px solid ${task.status === 'ready' ? '#22C55E' : (task.status === 'partial' ? '#EAB308' : '#64748B')}`,
                                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                opacity: task.status === 'ready' ? 0.6 : 1
                            }}>
                                <div style={{ 
                                    padding: '1rem', borderBottom: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '1rem', 
                                    backgroundColor: task.hasAlert ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.02)',
                                    animation: task.hasAlert ? 'pulseRedSoft 3s infinite' : 'none'
                                }}>
                                    <div style={{ padding: '0.5rem', minWidth: '80px', height: '45px', backgroundColor: '#0F172A', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#22C55E' }}>
                                        <div style={{ fontSize: '0.6rem', opacity: 0.6, lineHeight: 1 }}>ESPACIO</div>
                                        <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>{task.assigned_space}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '1rem', fontWeight: '800' }}>{task.company_name?.toUpperCase() || 'CLIENTE SIN NOMBRE'}</div>
                                        {task.zone && <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 'BOLD' }}>📍 RUTA: {task.zone.toUpperCase()}</div>}
                                    </div>
                                </div>
                                <div style={{ padding: '0.5rem 1rem' }}>
                                    {task.items.map(item => {
                                        const isDone = item.picked_quantity >= item.quantity;
                                        return (
                                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 0', borderBottom: '1px solid #334155' }}>
                                                <div onClick={() => openExceptionModal(item)} style={{ flex: 1, cursor: 'pointer' }}>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: isDone ? '#94A3B8' : '#F8FAFC', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        {item.product_name} 
                                                        {item.quality_status === 'red' && <span style={{ color: '#EF4444', fontSize: '0.7rem' }}>🚨 RECHAZADO</span>}
                                                        {item.quality_status === 'yellow' && <span style={{ color: '#EAB308', fontSize: '0.7rem' }}>⚠️ VERIFICAR</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: item.quality_status === 'red' ? '#EF4444' : (isDone ? '#22C55E' : '#EAB308'), fontWeight: '800' }}>
                                                        {item.quality_status === 'red' ? `RECHAZADO: ${item.quality_notes}` : (isDone ? 'COMPLETO' : `${item.quantity} ${item.unit}`)} 
                                                        {item.picked_quantity > 0 && !isDone && item.quality_status !== 'red' && ` (Llevas: ${item.picked_quantity})`}
                                                    </div>
                                                </div>
                                                {!isDone ? (
                                                    <button onClick={(e) => { e.stopPropagation(); quickComplete(item); }} style={{ backgroundColor: '#22C55E', color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem' }}>
                                                        LISTO
                                                    </button>
                                                ) : <div onClick={() => openExceptionModal(item)} style={{ fontSize: '1.2rem', cursor: 'pointer' }}>✅</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* VIEW 2: BY PRODUCT (SUMINISTRO) */}
                {viewMode === 'product' && (
                    <div style={{ display: 'grid', gap: '1.5rem' }}>
                        {productGroups
                            .filter(g => !searchTerm || g.name?.toLowerCase().includes(searchTerm.toLowerCase()))
                            .map(group => (
                            <div key={group.name} style={{ backgroundColor: '#1E293B', borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
                                <div style={{ padding: '1.2rem', backgroundColor: '#22C55E', color: '#064E3B' }}>
                                    <h2 style={{ fontSize: '1.2rem', fontWeight: '900', margin: 0 }}>{group.name.toUpperCase()}</h2>
                                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 'bold', opacity: 0.8 }}>REPARTIR A {group.clients.filter((c:any) => !c.isDone).length} RECINTOS</p>
                                </div>
                                <div style={{ padding: '1rem' }}>
                                    {group.clients.map((target: any) => (
                                        <div 
                                            key={target.id} 
                                            onClick={() => openExceptionModal({ ...target, product_name: group.name, unit: group.unit })}
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 0.5rem', 
                                                borderRadius: '16px',
                                                borderBottom: '1px solid #334155', 
                                                opacity: (target.isDone && !target.quality_status) ? 0.4 : 1,
                                                backgroundColor: target.quality_status === 'red' ? 'rgba(239, 68, 68, 0.15)' : (target.quality_status === 'yellow' ? 'rgba(234, 179, 8, 0.15)' : 'transparent'),
                                                border: target.quality_status === 'red' ? '2px solid rgba(239, 68, 68, 0.5)' : (target.quality_status === 'yellow' ? '2px solid rgba(234, 179, 8, 0.5)' : '1px solid transparent'),
                                                animation: target.quality_status === 'red' ? 'pulseRedSoft 3s infinite' : (target.quality_status === 'yellow' ? 'pulseYellowSoft 3s infinite' : 'none'),
                                                marginBottom: '5px',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ padding: '0.3rem', minWidth: '60px', height: '40px', backgroundColor: '#0F172A', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: target.quality_status === 'red' ? '#EF4444' : '#22C55E', border: '1px solid #334155' }}>
                                                <div style={{ fontSize: '0.5rem', opacity: 0.6, lineHeight: 1 }}>ESP</div>
                                                <div style={{ fontSize: '1.1rem', lineHeight: 1 }}>{target.space}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    {target.company_name}
                                                    {target.quality_status === 'red' && <span style={{ color: '#EF4444', fontSize: '0.6rem' }}>🚨 RECHAZO</span>}
                                                    {target.quality_status === 'yellow' && <span style={{ color: '#EAB308', fontSize: '0.6rem' }}>⚠️ VERIF</span>}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: target.quality_status === 'red' ? '#EF4444' : (target.isDone ? '#22C55E' : '#EAB308') }}>
                                                    {target.quality_status === 'red' ? `RECHAZADO: ${target.quality_notes}` : `${target.quantity} ${group.unit}`}
                                                    {target.picked_quantity > 0 && !target.isDone && target.quality_status !== 'red' && ` (Llevas: ${target.picked_quantity})`}
                                                </div>
                                            </div>
                                            {!target.isDone ? (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); quickComplete({ ...target, product_name: group.name, unit: group.unit }); }}
                                                    style={{ backgroundColor: target.quality_status === 'red' ? '#EF4444' : '#22C55E', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '800' }}>
                                                    {target.quality_status === 'red' ? 'RE-ALISTAR' : 'LISTO'}
                                                </button>
                                            ) : (
                                                <div style={{ fontSize: '1.2rem' }}>✅</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* VALIDATION MODAL (MIMIC RECEPTION/UX) */}
            {exceptionItem && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ 
                        backgroundColor: 'white', width: '100%', maxWidth: '500px', borderRadius: '32px', 
                        padding: '2.5rem', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                        animation: 'modalSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                        color: '#1E293B'
                    }}>
                        {/* Close Button */}
                        <button onClick={handleCloseExceptionModal} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: '#F1F5F9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.2rem', color: '#64748B' }}>✕</button>

                        <h2 style={{ fontSize: '1.8rem', fontWeight: '900', color: '#1E293B', margin: '0 0 1rem 0' }}>Validar Alistamiento ⚖️</h2>
                        <button style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 'bold', fontSize: '0.9rem', padding: 0, marginBottom: '2rem', cursor: 'pointer', textDecoration: 'underline' }}>¿Reportar Faltante Total?</button>

                        {/* Product Info Chips */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '2rem' }}>
                            <div style={{ backgroundColor: '#F1F5F9', padding: '0.8rem 1.2rem', borderRadius: '16px', flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 'bold', marginBottom: '4px' }}>PRODUCTO</div>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1E293B' }}>{exceptionItem.product_name}</div>
                            </div>
                            <div style={{ backgroundColor: '#F8FAFC', border: '2px dashed #E2E8F0', padding: '0.8rem 1.2rem', borderRadius: '16px', minWidth: '100px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: '#22C55E', fontWeight: 'bold', marginBottom: '4px' }}>A ALISTAR</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#166534' }}>{exceptionItem.quantity} <span style={{ fontSize: '0.7rem' }}>{exceptionItem.unit}</span></div>
                            </div>
                        </div>

                        {!isQuantityValidated ? (
                            /* PHASE 1: QUANTITY VALIDATION */
                            <div>
                                <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ 
                                        backgroundColor: '#DCFCE7', color: '#166534', padding: '1rem', borderRadius: '16px', 
                                        border: '2px solid #22C55E', minWidth: '150px', textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '900', color: '#22C55E', marginBottom: '4px' }}>
                                            {exceptionQty || '0'} / {exceptionItem.quantity} A ALISTAR
                                        </div>
                                        <input 
                                            type="number"
                                            value={exceptionQty}
                                            onChange={(e) => setExceptionQty(e.target.value)}
                                            placeholder="0"
                                            autoFocus
                                            style={{ 
                                                background: 'none', border: 'none', width: '100%', textAlign: 'center', 
                                                fontSize: '1.8rem', fontWeight: '900', color: '#166534', outline: 'none' 
                                            }}
                                        />
                                    </div>
                                    <button 
                                        onClick={handleValidateQuantity}
                                        disabled={!exceptionQty}
                                        style={{ 
                                            flex: 1, 
                                            backgroundColor: (parseFloat(exceptionQty) < exceptionItem.quantity) ? '#F59E0B' : '#1E293B', 
                                            color: 'white', padding: '1.2rem', 
                                            borderRadius: '16px', border: 'none', fontWeight: '900', fontSize: '1rem', cursor: 'pointer',
                                            opacity: !exceptionQty ? 0.5 : 1,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {(parseFloat(exceptionQty) < exceptionItem.quantity) ? 'Confirmar Parcial' : 'Validar'}
                                    </button>
                                </div>

                                {parseFloat(exceptionQty) < exceptionItem.quantity && (
                                    <div style={{ 
                                        padding: '1rem', borderRadius: '16px', backgroundColor: '#FFFBEB', 
                                        color: '#B45309', fontWeight: 'bold', fontSize: '0.9rem',
                                        marginBottom: '1rem', border: '1px solid #FCD34D'
                                    }}>
                                        ⚠️ Estás registrando una entrega parcial.
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* PHASE 2: QUALITY VALIDATION */
                            <div style={{ animation: 'fadeIn 0.3s' }}>
                                <div style={{ 
                                    backgroundColor: '#DCFCE7', color: '#166534', padding: '1rem', borderRadius: '16px', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight: '900', 
                                    marginBottom: '2rem' 
                                }}>
                                    ✅ Cantidad Correcta ({exceptionQty} {exceptionItem.unit})
                                </div>

                                <h3 style={{ textAlign: 'center', fontSize: '1.1rem', color: '#475569', marginBottom: '1.5rem' }}>Validar Calidad</h3>
                                
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '2.5rem' }}>
                                    <button 
                                        onClick={() => setExceptionQuality('green')}
                                        style={{ 
                                            width: '70px', height: '70px', borderRadius: '50%', border: 'none', 
                                            backgroundColor: exceptionQuality === 'green' ? '#22C55E' : '#F1F5F9',
                                            color: exceptionQuality === 'green' ? 'white' : '#64748B',
                                            fontSize: '1.5rem', cursor: 'pointer', transition: 'all 0.2s',
                                            boxShadow: exceptionQuality === 'green' ? '0 10px 15px -3px rgba(34, 197, 94, 0.4)' : 'none',
                                            transform: exceptionQuality === 'green' ? 'scale(1.1)' : 'scale(1)'
                                        }}
                                    >✓</button>
                                    <button 
                                        onClick={() => setExceptionQuality('yellow')}
                                        style={{ 
                                            width: '70px', height: '70px', borderRadius: '50%', border: 'none', 
                                            backgroundColor: exceptionQuality === 'yellow' ? '#EAB308' : '#F1F5F9',
                                            color: exceptionQuality === 'yellow' ? 'white' : '#64748B',
                                            fontSize: '1.5rem', cursor: 'pointer', transition: 'all 0.2s',
                                            boxShadow: exceptionQuality === 'yellow' ? '0 10px 15px -3px rgba(234, 179, 8, 0.4)' : 'none',
                                            transform: exceptionQuality === 'yellow' ? 'scale(1.1)' : 'scale(1)'
                                        }}
                                    >⚠</button>
                                    <button 
                                        onClick={() => setExceptionQuality('red')}
                                        style={{ 
                                            width: '70px', height: '70px', borderRadius: '50%', border: 'none', 
                                            backgroundColor: exceptionQuality === 'red' ? '#EF4444' : '#F1F5F9',
                                            color: exceptionQuality === 'red' ? 'white' : '#64748B',
                                            fontSize: '1.5rem', cursor: 'pointer', transition: 'all 0.2s',
                                            boxShadow: exceptionQuality === 'red' ? '0 10px 15px -3px rgba(239, 68, 68, 0.4)' : 'none',
                                            transform: exceptionQuality === 'red' ? 'scale(1.1)' : 'scale(1)'
                                        }}
                                    >✕</button>
                                </div>

                                {/* Rejection Reasons Chips */}
                                {exceptionQuality && exceptionQuality !== 'green' && (
                                    <div style={{ marginBottom: '2rem', animation: 'fadeIn 0.2s' }}>
                                        <h4 style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748B', marginBottom: '0.8rem', textAlign: 'center' }}>¿CUÁL ES EL MOTIVO?</h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                                            {REJECTION_REASONS.map(reason => (
                                                <button
                                                    key={reason}
                                                    onClick={() => setExceptionReason(reason)}
                                                    style={{
                                                        padding: '0.6rem 1rem', borderRadius: '12px',
                                                        backgroundColor: exceptionReason === reason ? '#1E293B' : '#F1F5F9',
                                                        color: exceptionReason === reason ? 'white' : '#64748B',
                                                        fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        border: exceptionReason === reason ? '2px solid #1E293B' : '2px solid transparent'
                                                    }}
                                                >
                                                    {reason}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <button 
                                    onClick={handleExceptionSave}
                                    disabled={!exceptionQuality || (exceptionQuality !== 'green' && !exceptionReason) || isSaving}
                                    style={{ 
                                        width: '100%', padding: '1.5rem', borderRadius: '20px', 
                                        backgroundColor: '#64748B', color: 'white', border: 'none', 
                                        fontWeight: '900', fontSize: '1.2rem', cursor: 'pointer',
                                        background: (exceptionQuality === 'green' || (exceptionQuality && exceptionReason)) ? '#1E293B' : '#94A3B8',
                                        transition: 'all 0.2s',
                                        opacity: isSaving ? 0.7 : 1
                                    }}
                                >
                                    {isSaving ? 'GUARDANDO...' : 'FINALIZAR PICKING'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {loading && (
                <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15,23,42,0.8)', zIndex: 100 }}>
                    BUSCANDO PEDIDOS...
                </div>
            )}
            
            <style jsx>{`
                @keyframes slideUp {
                    from { transform: translateY(100%); }
                    to { transform: translateY(0); }
                }
                @keyframes pulseRed {
                    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                @keyframes pulseRedSoft {
                    0% { background-color: rgba(239, 68, 68, 0.02); }
                    50% { background-color: rgba(239, 68, 68, 0.08); }
                    100% { background-color: rgba(239, 68, 68, 0.02); }
                }
                @keyframes pulseYellowSoft {
                    0% { background-color: rgba(234, 179, 8, 0.02); }
                    50% { background-color: rgba(234, 179, 8, 0.15); }
                    100% { background-color: rgba(234, 179, 8, 0.02); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
            `}</style>
        </div>
    );
}
