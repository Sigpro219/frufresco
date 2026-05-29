'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { isAbortError } from '@/lib/errorUtils';
import { RealtimeChannel } from '@supabase/supabase-js';
import { 
    Calendar, 
    GraduationCap, 
    Search, 
    X, 
    ClipboardList, 
    Filter, 
    Layers, 
    User, 
    CheckCircle, 
    AlertTriangle, 
    Check, 
    Scale, 
    XCircle,
    AlertCircle,
    Grid,
    ChevronUp,
    RefreshCw,
    Sparkles
} from 'lucide-react';


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
    const [showFilterGrid, setShowFilterGrid] = useState(false);
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
                    id, status,
                    profiles:profiles(id, company_name, contact_name, role, id_zr),
                    order_items (
                        id, product_id, quantity, picked_quantity, quality_status, quality_notes, nickname, variant_label,
                        products (name, category, unit_of_measure, buying_team)
                    )
                `)
                .in('status', ['para_compra', 'approved', 'picking']);

            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
            const targetDate = now.toISOString().split('T')[0];
            query = query.eq('delivery_date', targetDate);
            console.log(`🔍 Picking filtered for operational date: ${targetDate}`);

            if (signal) query = query.abortSignal(signal);

            const { data: activeOrders, error: orderError } = await query;

            if (orderError) {
                if (isAbortError(orderError)) return;
                console.error('Database Error (orders):', orderError.message);
                return;
            }

            // Helper: deriva el nombre del cliente del perfil unido
            const getOrderName = (order: any): string => {
                const p = order.profiles;
                if (!p) return '';
                if (p.role === 'b2b_client') return p.company_name || 'Sin Razón Social';
                return p.contact_name || p.company_name || 'Cliente';
            };

            // Local fallback map for zones
            const ZONE_NAMES: Record<string, string> = {
                '0': 'CENTRO',
                '1': 'NORTE',
                '2': 'SUR',
                '3': 'ORIENTE',
                '4': 'OCCIDENTE'
            };

            const getZoneName = (idZr: string | null | undefined): string => {
                if (!idZr) return 'GENERAL';
                if (ZONE_NAMES[idZr]) return ZONE_NAMES[idZr];
                return `RUTA ${idZr}`;
            };

            // Build unique client list from orders
            const seenClients = new Map<string, { name: string; zone: string }>();
            (activeOrders || []).forEach(order => {
                const name = getOrderName(order);
                if (name && !seenClients.has(name)) {
                    const idZr = (order as any).profiles?.id_zr;
                    const zone = getZoneName(idZr);
                    seenClients.set(name, { name, zone });
                }
            });

            // Fetch logistic parameters for LIFO space calculation
            const { data: lpData } = await supabase.from('logistic_parameters').select('*');
            let spaceCapacity = 36;
            let avgKgPerCrate = 12.5;
            if (lpData) {
                const cap = lpData.find(x => x.id === 'space_capacity');
                if (cap) spaceCapacity = parseInt(cap.value) || 36;
                const avg = lpData.find(x => x.id === 'avg_kg_per_crate');
                if (avg) avgKgPerCrate = parseFloat(avg.value) || 12.5;
            }

            // Fetch route stops to determine delivery sequence
            const { data: routeStops } = await supabase
                .from('route_stops')
                .select('order_id, sequence_number, route_id, routes(vehicle_plate)')
                .in('order_id', (activeOrders || []).map(o => o.id));

            // Group stops by route
            const routeGroups: Record<string, { plate: string; stops: any[] }> = {};
            const routedOrderIds = new Set<string>();

            (routeStops || []).forEach(rs => {
                routedOrderIds.add(rs.order_id);
                if (!routeGroups[rs.route_id]) {
                    routeGroups[rs.route_id] = {
                        plate: (rs.routes as any)?.vehicle_plate || 'Sin Placa',
                        stops: []
                    };
                }
                routeGroups[rs.route_id].stops.push(rs);
            });

            let currentSpaceCounter = 1;
            const globalSpaceMap = new Map<string, number>();

            // LIFO logic: For each route, sort stops by sequence_number in DESC order
            Object.keys(routeGroups).forEach(routeId => {
                const group = routeGroups[routeId];
                group.stops.sort((a, b) => b.sequence_number - a.sequence_number);

                group.stops.forEach(stop => {
                    const order = (activeOrders || []).find(o => o.id === stop.order_id);
                    if (!order) return;
                    const clientName = getOrderName(order);
                    const crates = Math.ceil((order.total_weight_kg || 0) / avgKgPerCrate);
                    const spacesNeeded = Math.ceil(crates / spaceCapacity) || 1;
                    
                    if (!globalSpaceMap.has(clientName)) {
                        globalSpaceMap.set(clientName, currentSpaceCounter);
                        currentSpaceCounter += spacesNeeded;
                    }
                });
            });

            // Assign remaining spaces to unrouted orders
            (activeOrders || []).forEach(order => {
                const clientName = getOrderName(order);
                if (clientName && !routedOrderIds.has(order.id) && !globalSpaceMap.has(clientName)) {
                    globalSpaceMap.set(clientName, currentSpaceCounter);
                    currentSpaceCounter += 1;
                }
            });

            const formattedTasks: Record<string, PickingTask> = {};
            (activeOrders || [])
                .forEach(order => {
                    const clientName = getOrderName(order);
                    if (!clientName) return;

                    const items = (order.order_items as unknown as any[]) || [];
                    
                    const itemsInCategory = items
                        .filter(item => {
                            const product = Array.isArray(item.products) ? item.products[0] : item.products;
                            return product?.buying_team === selectedCategory;
                        })
                        .map(item => {
                            const product = Array.isArray(item.products) ? item.products[0] : item.products;
                            const variant = item.variant_label || item.nickname || '';
                            const dispName = variant ? `${product?.name} (${variant})` : (product?.name || 'Producto Desconocido');
                            return {
                                id: item.id,
                                product_id: item.product_id,
                                product_name: dispName,
                                quantity: item.quantity,
                                picked_quantity: item.picked_quantity || 0,
                                quality_status: item.quality_status,
                                quality_notes: item.quality_notes,
                                unit: product?.unit_of_measure || 'un'
                            };
                        });

                    if (itemsInCategory.length > 0) {
                        if (!formattedTasks[clientName]) {
                            const clientData = seenClients.get(clientName);
                            formattedTasks[clientName] = {
                                id: order.id,
                                company_name: clientName,
                                assigned_space: globalSpaceMap.get(clientName) || 0,
                                zone: clientData?.zone || 'GENERAL',
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
            const { data: prods } = (await supabase.from('products').select('buying_team').abortSignal(signal as any)) as { data: { buying_team: string }[] | null };
            const uniqueCats = Array.from(new Set((prods || []).map((p: any) => p.buying_team))).filter(Boolean).sort() as string[];
            
            if (isMounted.current) {
                setCategories(uniqueCats);
                if (uniqueCats.length > 0 && !selectedCategory) {
                    setSelectedCategory(uniqueCats[0]);
                } else {
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
        setExceptionQuality('green');
        setIsQuantityValidated(true);
    };

    // Group tasks by product for the 'product' view (Suministro)
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
        
        Object.keys(tempGroups).sort().forEach(key => {
            const group = tempGroups[key];
            group.clients.sort((a, b) => {
                if (a.quality_status === 'red' && b.quality_status !== 'red') return -1;
                if (a.quality_status !== 'red' && b.quality_status === 'red') return 1;
                if (a.quality_status === 'yellow' && b.quality_status !== 'yellow') return -1;
                if (a.quality_status !== 'yellow' && b.quality_status === 'yellow') return 1;
                if (!a.isDone && b.isDone) return -1;
                if (a.isDone && !b.isDone) return 1;
                return (a.space || 0) - (b.space || 0);
            });
            productGroups.push(group);
        });
    }

    const openExceptionModal = (item: PickingItem) => {
        setExceptionItem(item);
        setExceptionQty('');
        setExceptionQuality(null);
        setIsQuantityValidated(false);
    };

    const handleValidateQuantity = () => {
        if (!exceptionItem || !exceptionQty) return;
        setIsQuantityValidated(true);
    };

    const handleExceptionSave = async () => {
        if (!exceptionItem) return;
        const qty = parseFloat(exceptionQty);
        if (isNaN(qty)) return alert('Cantidad inválida');
        
        setIsSaving(true);
        try {
            const { error: orderItemError } = await supabase.from('order_items').update({ 
                picked_quantity: qty,
                quality_status: exceptionQuality,
                quality_notes: exceptionReason
            }).eq('id', exceptionItem.id);

            if (orderItemError) throw orderItemError;

            // Inventory Integration
            if (exceptionQuality === 'red' || qty < exceptionItem.quantity) {
                const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).single();
                
                if (warehouseData) {
                    const diff = exceptionItem.quantity - qty;
                    
                    if (exceptionQuality === 'red') {
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
        <div style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#0A111C', minHeight: '100vh', paddingBottom: '7rem', color: '#F8FAFC' }}>
            
            {/* Título y Botón (No pegajosos, se ocultan al hacer scroll) */}
            <div
                className="no-print"
                style={{
                    paddingTop: "0.5rem",
                    paddingBottom: "0.5rem",
                    backgroundColor: "#0A111C",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.5rem",
                        padding: "0 1rem",
                        flexWrap: "wrap",
                        gap: "0.5rem"
                    }}
                >
                    <div>
                        <h1 
                            className="header-title-container"
                            onClick={() => router.push('/ops')}
                            style={{ fontSize: "1.5rem", fontWeight: "900", margin: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "nowrap" }}
                        >
                            <span style={{ whiteSpace: "nowrap" }}>Alistamiento <span style={{ color: "#0D7A57" }}>Bodega</span></span>
                            <span className="header-date-badge" style={{ fontSize: "0.8rem", color: "#F59E0B", fontWeight: "800", backgroundColor: "rgba(245, 158, 11, 0.12)", padding: "2px 8px", borderRadius: "6px", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px" }}>
                                <Calendar size={14} /> {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "short" })}
                            </span>
                        </h1>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                        <button
                            onClick={() => router.push('/ops')}
                            className="header-tutor-btn"
                            style={{
                                backgroundColor: '#121D2D', color: '#0D7A57', border: '1px solid #0D7A57',
                                padding: '0.5rem 0.75rem', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '900', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap'
                            }}
                        >
                            <GraduationCap size={14} /> TUTOR
                        </button>
                    </div>
                </div>
            </div>
            {totalTasks > 0 && (
                <div
                    className="no-print"
                    style={{
                        position: "sticky",
                        top: "57px",
                        zIndex: 50,
                        backgroundColor: "#0A111C",
                        padding: "0 1rem 0.8rem 1rem",
                        marginBottom: "1rem",
                        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    }}
                >
                    {/* Barra de Progreso Lineal (General) */}
                    <div style={{ width: "100%", marginTop: "0.4rem", marginBottom: "1rem" }}>
                        <div style={{
                            width: "100%",
                            height: "8px",
                            backgroundColor: "#121D2D",
                            borderRadius: "4px",
                            overflow: "hidden",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            display: 'flex'
                        }}>
                            <div style={{ width: `${readyPct}%`, height: '100%', backgroundColor: '#0D7A57', transition: 'width 0.5s ease-out' }} />
                            <div style={{ width: `${partialPct}%`, height: '100%', backgroundColor: '#EAB308', transition: 'width 0.5s ease-out' }} />
                            <div style={{ width: `${alertPct}%`, height: '100%', backgroundColor: '#EF4444', transition: 'width 0.5s ease-out' }} />
                        </div>
                    </div>

                    {/* Dashboard de Estados (Semáforo) */}
                    <div
                        style={{
                            backgroundColor: "#121D2D",
                            padding: "0.6rem 0.8rem",
                            borderRadius: "16px",
                            border: "1px solid rgba(255, 255, 255, 0.08)",
                            boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                            display: "flex",
                            justifyContent: "space-evenly",
                            alignItems: "center",
                            marginBottom: "1rem"
                        }}
                    >
                        {/* Pendiente */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#94A3B8" }}>
                                {pendingTasks}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#64748B", textTransform: "uppercase" }}>
                                PENDIENTE
                            </div>
                        </div>

                        {/* Parcial */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#EAB308" }}>
                                {partialTasks}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#64748B", textTransform: "uppercase" }}>
                                PARCIAL
                            </div>
                        </div>

                        {/* Alertas */}
                        <div style={{ textAlign: "center", position: "relative" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#EF4444" }}>
                                {alertTasks}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#EF4444", textTransform: "uppercase" }}>
                                ALERTAS
                            </div>
                            {alertTasks > 0 && (
                                <div style={{ position: "absolute", top: -4, right: -4, width: "5px", height: "5px", borderRadius: "50%", background: "#EF4444" }} />
                            )}
                        </div>

                        {/* Listo */}
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "1.1rem", fontWeight: "900", color: "#0D7A57" }}>
                                {readyTasks}
                            </div>
                            <div style={{ fontSize: "0.55rem", fontWeight: "bold", color: "#64748B", textTransform: "uppercase" }}>
                                LISTO
                            </div>
                        </div>

                        {/* Avance Badge */}
                        <div
                            style={{
                                textAlign: "center",
                                borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
                                paddingLeft: "0.8rem",
                                marginLeft: "0.2rem",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem"
                            }}
                        >
                            <div
                                style={{
                                    backgroundColor: "rgba(13, 122, 87, 0.15)",
                                    padding: "0.4rem 0.6rem",
                                    borderRadius: "10px",
                                    border: "1px solid rgba(13, 122, 87, 0.3)",
                                    boxShadow: progress > 0 ? "0 0 15px rgba(13, 122, 87, 0.2)" : "none",
                                    transition: "all 0.4s ease",
                                }}
                            >
                                <div style={{ fontSize: "1.2rem", fontWeight: "900", color: "white", lineHeight: "1" }}>
                                    {progress}%
                                </div>
                                <div style={{ fontSize: "0.5rem", fontWeight: "900", color: "white", opacity: 0.8, marginTop: "2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                    AVANCE
                                </div>
                            </div>
                            <button
                                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    color: 'white',
                                    borderRadius: '8px',
                                    width: '28px',
                                    height: '28px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    transition: 'all 0.2s',
                                    flexShrink: 0
                                }}
                                title="Subir al inicio"
                            >
                                <ChevronUp size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Category Filter — Colapsable */}
                    <div style={{ marginBottom: "0.6rem" }}>
                        {/* Barra activa: siempre visible */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {/* Pill de categoría activa */}
                            <div
                                style={{
                                    flex: 1,
                                    height: "40px",
                                    boxSizing: "border-box",
                                    padding: "0 1rem",
                                    borderRadius: "12px",
                                    backgroundColor: "rgba(13, 122, 87, 0.12)",
                                    border: "1px solid #0D7A57",
                                    color: "white",
                                    fontSize: "0.75rem",
                                    fontWeight: "800",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.05em",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                }}
                            >
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                    <ClipboardList size={14} />
                                    {selectedCategory ? selectedCategory.toUpperCase() : 'SELECCIONAR EQUIPO'}
                                </span>
                                <span style={{ opacity: 0.7, fontSize: "0.65rem" }}>activo</span>
                            </div>

                            {/* Botón toggle del grid */}
                            <button
                                onClick={() => setShowFilterGrid(v => !v)}
                                title={showFilterGrid ? "Ocultar filtros" : "Cambiar categoría"}
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "12px",
                                    border: `1px solid ${showFilterGrid ? "#0D7A57" : "rgba(255, 255, 255, 0.08)"}`,
                                    backgroundColor: showFilterGrid ? "rgba(13, 122, 87, 0.15)" : "#121D2D",
                                    color: showFilterGrid ? "#0D7A57" : "#94A3B8",
                                    fontSize: "1rem",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                    flexShrink: 0,
                                    transition: "all 0.2s ease",
                                }}
                            >
                                {showFilterGrid ? <X size={16} /> : <Grid size={16} />}
                            </button>
                        </div>

                        {/* Grid de Filtros */}
                        {showFilterGrid && (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 1fr",
                                    gap: "0.4rem",
                                    marginTop: "0.5rem",
                                    animation: "slideDown 0.18s ease-out",
                                }}
                            >
                                {categories.map((cat) => {
                                    const isActive = selectedCategory === cat;
                                    return (
                                        <button
                                            key={cat}
                                            onClick={() => {
                                                setSelectedCategory(cat);
                                                setShowFilterGrid(false);
                                            }}
                                            style={{
                                                padding: "0.55rem 0.75rem",
                                                borderRadius: "10px",
                                                border: `1px solid ${isActive ? "#0D7A57" : "rgba(255, 255, 255, 0.08)"}`,
                                                backgroundColor: isActive
                                                    ? "rgba(13, 122, 87, 0.12)"
                                                    : "#121D2D",
                                                color: isActive ? "white" : "#94A3B8",
                                                fontSize: "0.7rem",
                                                fontWeight: "700",
                                                textAlign: "left",
                                                cursor: "pointer",
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "2px",
                                                transition: "all 0.15s ease",
                                            }}
                                        >
                                            <span style={{ textTransform: "uppercase", letterSpacing: "0.03em", lineHeight: 1.2 }}>
                                                {cat}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Intelligent Search Bar */}
                    <div style={{ position: 'relative', marginBottom: '0.65rem' }}>
                        <input 
                            type="text"
                            placeholder={viewMode === 'client' ? "Buscar cliente o espacio..." : "Buscar producto..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', height: '40px', padding: '0 1rem 0 2.5rem', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.08)',
                                backgroundColor: '#121D2D', color: 'white', fontSize: '0.9rem', outline: 'none', transition: 'all 0.2s',
                                boxSizing: 'border-box'
                            }}
                        />
                        <Search size={16} strokeWidth={2.5} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5, color: '#94A3B8' }} />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Sub-filter row (Cubículo & Suministro) */}
                    <div style={{ 
                        background: 'rgba(18, 29, 45, 0.6)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        padding: '4px',
                        borderRadius: '12px',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
                    }}>
                        <button
                            onClick={() => setViewMode('client')}
                            style={{
                                height: '32px',
                                boxSizing: 'border-box',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: viewMode === 'client' ? '#0D7A57' : 'transparent',
                                color: viewMode === 'client' ? 'white' : '#94A3B8',
                                fontWeight: '900',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        >
                            <User size={14} strokeWidth={2.5} /> Cubículo
                        </button>
                        <button
                            onClick={() => setViewMode('product')}
                            style={{
                                height: '32px',
                                boxSizing: 'border-box',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: viewMode === 'product' ? '#0D7A57' : 'transparent',
                                color: viewMode === 'product' ? 'white' : '#94A3B8',
                                fontWeight: '900',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.4rem',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                        >
                            <Layers size={14} strokeWidth={2.5} /> Suministro
                        </button>
                    </div>
                </div>
            )}

            {/* MAIN CONTENT AREA */}
            <div style={{ padding: '0.5rem 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: "4rem 2rem", animation: "pulse 2s infinite", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
                        <RefreshCw size={36} style={{ color: "#0D7A57", animation: "spin 2s linear infinite" }} />
                        <p style={{ color: "#94A3B8", fontWeight: "700", letterSpacing: "0.05em" }}>
                            BUSCANDO PEDIDOS...
                        </p>
                    </div>
                ) : (
                    <>
                        {/* VIEW 1: BY CLIENT (CUBÍCULO) */}
                        {viewMode === 'client' && (() => {
                    const hasAnyTasks = tasks.length > 0;
                    const filteredTasks = tasks
                        .filter(t => (showCompleted || t.status !== 'ready'))
                        .filter(t => !searchTerm || t.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) || t.assigned_space?.toString() === searchTerm);
                    
                    if (filteredTasks.length === 0) {
                        return (
                            <div style={{
                                textAlign: 'center',
                                padding: '4rem 2rem',
                                backgroundColor: '#121D2D',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '16px',
                                color: '#94A3B8',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                                marginTop: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center'
                            }}>
                                <CheckCircle size={48} strokeWidth={1.5} style={{ color: '#0D7A57', marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#F8FAFC', margin: '0 0 0.5rem 0' }}>
                                    {hasAnyTasks ? '¡Todo alistado!' : 'Sin pedidos'}
                                </h3>
                                <p style={{ fontSize: '0.85rem', margin: 0 }}>
                                    {hasAnyTasks 
                                        ? `Has completado todos los pedidos de la categoría ${selectedCategory?.toUpperCase()}.` 
                                        : `No hay pedidos para la categoría ${selectedCategory?.toUpperCase()} el día de hoy.`}
                                </p>
                            </div>
                        );
                    }

                    return (
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            {filteredTasks.map(task => (
                            <div key={task.company_name} style={{
                                backgroundColor: '#121D2D', borderRadius: '16px', overflow: 'hidden',
                                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRight: '1px solid rgba(255, 255, 255, 0.08)',
                                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                borderLeft: `6px solid ${task.status === 'ready' ? '#0D7A57' : (task.status === 'partial' ? '#EAB308' : '#64748B')}`,
                                boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                                opacity: task.status === 'ready' ? 0.6 : 1,
                                transition: 'all 0.2s ease-in-out'
                            }} className="client-card">
                                <div style={{ 
                                    padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '1rem', 
                                    backgroundColor: task.hasAlert ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.01)',
                                }}>
                                    <div style={{ padding: '0.5rem', minWidth: '80px', height: '45px', backgroundColor: '#0A111C', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: '#0D7A57', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontSize: '0.6rem', opacity: 0.6, lineHeight: 1 }}>ESPACIO</div>
                                        <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>{task.assigned_space}</div>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#F8FAFC' }}>{task.company_name?.toUpperCase() || 'CLIENTE SIN NOMBRE'}</div>
                                        {task.zone && <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 'bold' }}>📍 RUTA: {task.zone.toUpperCase()}</div>}
                                    </div>
                                    <button 
                                        onClick={() => setShowCompleted(!showCompleted)}
                                        style={{ fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.05)', color: '#94A3B8', padding: '0.4rem 0.6rem', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}>
                                        {showCompleted ? 'OCULTAR LISTOS' : 'VER LISTOS'}
                                    </button>
                                </div>
                                <div style={{ padding: '0.5rem 1rem' }}>
                                    {task.items.map(item => {
                                        const isDone = item.picked_quantity >= item.quantity;
                                        return (
                                            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.8rem 0', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                                <div onClick={() => openExceptionModal(item)} style={{ flex: 1, cursor: 'pointer' }}>
                                                    <div style={{ fontSize: '0.95rem', fontWeight: '700', color: isDone ? '#94A3B8' : '#F8FAFC', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                        {item.product_name} 
                                                        {item.quality_status === 'red' && <span style={{ color: '#EF4444', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '2px' }}><AlertCircle size={10} /> RECHAZADO</span>}
                                                        {item.quality_status === 'yellow' && <span style={{ color: '#EAB308', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '2px' }}><AlertTriangle size={10} /> VERIFICAR</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: item.quality_status === 'red' ? '#EF4444' : (isDone ? '#0D7A57' : '#EAB308'), fontWeight: '800' }}>
                                                        {item.quality_status === 'red' ? `RECHAZADO: ${item.quality_notes}` : (isDone ? 'COMPLETO' : `${item.quantity} ${item.unit}`)} 
                                                        {item.picked_quantity > 0 && !isDone && item.quality_status !== 'red' && ` (Llevas: ${item.picked_quantity})`}
                                                    </div>
                                                </div>
                                                {!isDone ? (
                                                    <button onClick={(e) => { e.stopPropagation(); quickComplete(item); }} style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.5rem 1.2rem', borderRadius: '10px', fontWeight: '900', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                        LISTO
                                                    </button>
                                                ) : <div onClick={() => openExceptionModal(item)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}><CheckCircle size={20} className="text-emerald-500" /></div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            ))}
                        </div>
                    );
                })()}

                {/* VIEW 2: BY PRODUCT (SUMINISTRO) */}
                {viewMode === 'product' && (() => {
                    const hasAnyGroups = productGroups.length > 0;
                    const filteredProductGroups = productGroups
                        .filter(g => !searchTerm || g.name?.toLowerCase().includes(searchTerm.toLowerCase()));
                    
                    if (filteredProductGroups.length === 0) {
                        return (
                            <div style={{
                                textAlign: 'center',
                                padding: '4rem 2rem',
                                backgroundColor: '#121D2D',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                                borderRadius: '16px',
                                color: '#94A3B8',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                                marginTop: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center'
                            }}>
                                <CheckCircle size={48} strokeWidth={1.5} style={{ color: '#0D7A57', marginBottom: '1rem' }} />
                                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#F8FAFC', margin: '0 0 0.5rem 0' }}>
                                    {hasAnyGroups ? '¡Todo alistado!' : 'Sin pedidos'}
                                </h3>
                                <p style={{ fontSize: '0.85rem', margin: 0 }}>
                                    {hasAnyGroups 
                                        ? `Has completado todos los pedidos de la categoría ${selectedCategory?.toUpperCase()}.` 
                                        : `No hay pedidos para la categoría ${selectedCategory?.toUpperCase()} el día de hoy.`}
                                </p>
                            </div>
                        );
                    }

                    return (
                        <div style={{ display: 'grid', gap: '1.5rem' }}>
                            {filteredProductGroups.map(group => (
                            <div key={group.name} style={{ backgroundColor: '#121D2D', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)' }}>
                                <div style={{ padding: '1.2rem', backgroundColor: '#0D7A57', color: 'white' }}>
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
                                                borderBottom: '1px solid rgba(255,255,255,0.08)', 
                                                opacity: (target.isDone && !target.quality_status) ? 0.4 : 1,
                                                backgroundColor: target.quality_status === 'red' ? 'rgba(239, 68, 68, 0.15)' : (target.quality_status === 'yellow' ? 'rgba(234, 179, 8, 0.15)' : 'transparent'),
                                                border: target.quality_status === 'red' ? '2px solid rgba(239, 68, 68, 0.5)' : (target.quality_status === 'yellow' ? '2px solid rgba(234, 179, 8, 0.5)' : '1px solid transparent'),
                                                marginBottom: '5px',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            <div style={{ padding: '0.3rem', minWidth: '60px', height: '40px', backgroundColor: '#0A111C', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontWeight: '900', color: target.quality_status === 'red' ? '#EF4444' : '#0D7A57', border: '1px solid rgba(255,255,255,0.08)' }}>
                                                <div style={{ fontSize: '0.5rem', opacity: 0.6, lineHeight: 1 }}>ESP</div>
                                                <div style={{ fontSize: '1.1rem', lineHeight: 1 }}>{target.space}</div>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    {target.company_name}
                                                    {target.quality_status === 'red' && <span style={{ color: '#EF4444', fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '2px' }}><AlertCircle size={10} /> RECHAZO</span>}
                                                    {target.quality_status === 'yellow' && <span style={{ color: '#EAB308', fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '2px' }}><AlertTriangle size={10} /> VERIF</span>}
                                                </div>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: target.quality_status === 'red' ? '#EF4444' : (target.isDone ? '#0D7A57' : '#EAB308') }}>
                                                    {target.quality_status === 'red' ? `RECHAZADO: ${target.quality_notes}` : `${target.quantity} ${group.unit}`}
                                                    {target.picked_quantity > 0 && !target.isDone && target.quality_status !== 'red' && ` (Llevas: ${target.picked_quantity})`}
                                                </div>
                                            </div>
                                            {!target.isDone ? (
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); quickComplete({ ...target, product_name: group.name, unit: group.unit }); }}
                                                    style={{ backgroundColor: target.quality_status === 'red' ? '#EF4444' : '#0D7A57', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '800', cursor: 'pointer' }}>
                                                    {target.quality_status === 'red' ? 'RE-ALISTAR' : 'LISTO'}
                                                </button>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center' }}><CheckCircle size={20} className="text-emerald-500" /></div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            ))}
                        </div>
                    );
                })()}
                    </>
                )}
            </div>

            {/* VALIDATION MODAL (MOBILE BOTTOM SHEET LAYOUT) */}
            {exceptionItem && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    backgroundColor: 'rgba(10, 17, 28, 0.85)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                }}>
                    <div style={{ 
                        backgroundColor: '#121D2D',
                        width: '100%',
                        maxWidth: '500px',
                        borderTopLeftRadius: '24px',
                        borderTopRightRadius: '24px',
                        borderBottomLeftRadius: '0px',
                        borderBottomRightRadius: '0px',
                        padding: '2rem 1.5rem',
                        position: 'relative',
                        boxShadow: '0 -10px 25px rgba(0, 0, 0, 0.5)',
                        color: 'white',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderBottom: 'none'
                    }}>
                        {/* Close Button */}
                        <button onClick={handleCloseExceptionModal} style={{ position: 'absolute', top: '1rem', right: '1rem', background: '#0A111C', border: '1px solid rgba(255,255,255,0.08)', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>
                            <X size={18} />
                        </button>

                        <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'white', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Scale size={20} strokeWidth={2.5} className="text-slate-400" />
                            Validar Alistamiento
                        </h2>
                        <button onClick={() => setExceptionQty('0')} style={{ background: 'none', border: 'none', color: '#EF4444', fontWeight: 'bold', fontSize: '0.85rem', padding: 0, marginBottom: '1.5rem', cursor: 'pointer', textDecoration: 'underline' }}>¿Reportar Faltante Total?</button>

                        {/* Product Info Chips */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                            <div style={{ backgroundColor: '#0A111C', border: '1px solid rgba(255,255,255,0.08)', padding: '0.8rem 1rem', borderRadius: '16px', flex: 1 }}>
                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 'bold', marginBottom: '4px' }}>PRODUCTO</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: '800', color: 'white' }}>{exceptionItem.product_name}</div>
                            </div>
                            <div style={{ backgroundColor: '#0A111C', border: '1px dashed rgba(13, 122, 87, 0.4)', padding: '0.8rem 1rem', borderRadius: '16px', minWidth: '100px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', color: '#0D7A57', fontWeight: 'bold', marginBottom: '4px' }}>A ALISTAR</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: 'white' }}>{exceptionItem.quantity} <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{exceptionItem.unit}</span></div>
                            </div>
                        </div>

                        {!isQuantityValidated ? (
                            /* PHASE 1: QUANTITY VALIDATION - Mobile stacked layout */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div style={{ 
                                    backgroundColor: 'rgba(13, 122, 87, 0.1)',
                                    color: 'white',
                                    padding: '1.5rem 1rem',
                                    borderRadius: '16px', 
                                    border: '1px solid #0D7A57',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#0D7A57', marginBottom: '6px' }}>
                                        CANTIDAD ALISTADA ({exceptionQty || '0'} / {exceptionItem.quantity} {exceptionItem.unit})
                                    </div>
                                    <input 
                                        type="number"
                                        value={exceptionQty}
                                        onChange={(e) => setExceptionQty(e.target.value)}
                                        placeholder="0"
                                        autoFocus
                                        step="any"
                                        style={{ 
                                            background: 'none', border: 'none', width: '100%', textAlign: 'center', 
                                            fontSize: '2.4rem', fontWeight: '900', color: 'white', outline: 'none' 
                                        }}
                                    />
                                </div>
                                
                                <button 
                                    onClick={handleValidateQuantity}
                                    disabled={!exceptionQty}
                                    style={{ 
                                        width: '100%', 
                                        backgroundColor: (parseFloat(exceptionQty) < exceptionItem.quantity) ? '#F59E0B' : '#0D7A57', 
                                        color: 'white',
                                        padding: '1.1rem', 
                                        borderRadius: '16px',
                                        border: 'none',
                                        fontWeight: '900',
                                        fontSize: '1.1rem',
                                        cursor: 'pointer',
                                        opacity: !exceptionQty ? 0.5 : 1,
                                        transition: 'all 0.2s',
                                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
                                    }}
                                >
                                    {(parseFloat(exceptionQty) < exceptionItem.quantity) ? 'Confirmar Parcial' : 'Validar Cantidad'}
                                </button>

                                {parseFloat(exceptionQty) < exceptionItem.quantity && (
                                    <div style={{ 
                                        padding: '1rem', borderRadius: '16px', backgroundColor: 'rgba(234,179,8,0.1)', 
                                        color: '#FBBF24', fontWeight: 'bold', fontSize: '0.85rem',
                                        border: '1px solid rgba(234,179,8,0.3)', textAlign: 'center'
                                    }}>
                                        ⚠️ Estás registrando una entrega parcial.
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* PHASE 2: QUALITY VALIDATION */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                <div style={{ 
                                    backgroundColor: 'rgba(13, 122, 87, 0.15)', color: 'white', padding: '0.8rem', borderRadius: '16px', 
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontWeight: '900', 
                                    fontSize: '0.9rem', border: '1px solid #0D7A57'
                                }}>
                                    <CheckCircle size={18} className="text-emerald-500" /> Cantidad Correcta ({exceptionQty} {exceptionItem.unit})
                                </div>

                                <h3 style={{ textAlign: 'center', fontSize: '1rem', color: '#94A3B8', margin: '0.5rem 0' }}>Validar Calidad</h3>
                                
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginBottom: '1rem' }}>
                                    <button 
                                        onClick={() => setExceptionQuality('green')}
                                        style={{ 
                                            width: '64px', height: '64px', borderRadius: '50%', 
                                            backgroundColor: exceptionQuality === 'green' ? '#0D7A57' : '#0A111C',
                                            color: exceptionQuality === 'green' ? 'white' : '#64748B',
                                            fontSize: '1.4rem', cursor: 'pointer', transition: 'all 0.2s',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            boxShadow: exceptionQuality === 'green' ? '0 10px 15px -3px rgba(13, 122, 87, 0.4)' : 'none',
                                            transform: exceptionQuality === 'green' ? 'scale(1.1)' : 'scale(1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <Check size={28} strokeWidth={3} />
                                    </button>
                                    <button 
                                        onClick={() => setExceptionQuality('yellow')}
                                        style={{ 
                                            width: '64px', height: '64px', borderRadius: '50%', 
                                            backgroundColor: exceptionQuality === 'yellow' ? '#EAB308' : '#0A111C',
                                            color: exceptionQuality === 'yellow' ? 'black' : '#64748B',
                                            fontSize: '1.4rem', cursor: 'pointer', transition: 'all 0.2s',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            boxShadow: exceptionQuality === 'yellow' ? '0 10px 15px -3px rgba(234, 179, 8, 0.4)' : 'none',
                                            transform: exceptionQuality === 'yellow' ? 'scale(1.1)' : 'scale(1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <AlertTriangle size={26} strokeWidth={2.5} />
                                    </button>
                                    <button 
                                        onClick={() => setExceptionQuality('red')}
                                        style={{ 
                                            width: '64px', height: '64px', borderRadius: '50%', 
                                            backgroundColor: exceptionQuality === 'red' ? '#EF4444' : '#0A111C',
                                            color: exceptionQuality === 'red' ? 'white' : '#64748B',
                                            fontSize: '1.4rem', cursor: 'pointer', transition: 'all 0.2s',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            boxShadow: exceptionQuality === 'red' ? '0 10px 15px -3px rgba(239, 68, 68, 0.4)' : 'none',
                                            transform: exceptionQuality === 'red' ? 'scale(1.1)' : 'scale(1)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <XCircle size={28} strokeWidth={2.5} />
                                    </button>
                                </div>

                                {/* Rejection Reasons Chips */}
                                {exceptionQuality && exceptionQuality !== 'green' && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <h4 style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', marginBottom: '0.6rem', textAlign: 'center' }}>¿CUÁL ES EL MOTIVO?</h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
                                            {REJECTION_REASONS.map(reason => (
                                                <button
                                                    key={reason}
                                                    onClick={() => setExceptionReason(reason)}
                                                    style={{
                                                        padding: '0.5rem 0.8rem', borderRadius: '12px',
                                                        backgroundColor: exceptionReason === reason ? 'white' : '#0A111C',
                                                        color: exceptionReason === reason ? 'black' : '#94A3B8',
                                                        fontSize: '0.7rem', fontWeight: '700', cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        border: exceptionReason === reason ? '2px solid white' : '2px solid rgba(255,255,255,0.08)'
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
                                        width: '100%', padding: '1.2rem', borderRadius: '16px', 
                                        color: 'white', border: 'none', 
                                        fontWeight: '900', fontSize: '1.1rem', cursor: 'pointer',
                                        background: (exceptionQuality === 'green' || (exceptionQuality && exceptionReason)) ? '#0D7A57' : '#475569',
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

            <style jsx>{`
                @keyframes slideDown {
                    from { opacity: 0; transform: translateY(-6px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.6; transform: scale(0.98); }
                    100% { opacity: 1; transform: scale(1); }
                }
                .client-card:hover {
                    border-color: rgba(13, 122, 87, 0.4) !important;
                    transform: translateY(-2px);
                }
            `}</style>
        </div>
    );
}
