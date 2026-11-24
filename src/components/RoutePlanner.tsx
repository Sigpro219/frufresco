'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { getOperationalTargetDate } from '@/lib/ops/operationalCells';
import { getOrderSpaceDisplayLabel } from '@/lib/stagingSpaceAllocator';
import { 
    Calendar, 
    Scale, 
    MapPin, 
    Building2, 
    Clock, 
    AlertTriangle, 
    Sparkles, 
    Check, 
    Trash2, 
    X, 
    Truck, 
    Settings, 
    Activity,
    FileText,
    Users,
    Banknote,
    Package,
    Zap,
    Bot,
    ShoppingBag,
    CheckCircle2,
    Coins,
    Star,
    Search,
    Sliders,
    ArrowDownUp,
    Printer,
    MessageSquare,
    Navigation
} from 'lucide-react';

interface Order {
    id: string;
    customer_name: string;
    status: string;
    total_weight_kg: number;
    delivery_slot: string;
    delivery_zone?: string;
    is_b2b?: boolean;
    latitude?: number;
    longitude?: number;
    address?: string;
    crates?: number;
    novedad?: string;
    address_complement?: string;
    display_slot?: string;
    slot_type?: 'manual' | 'profile' | 'b2c_slot' | 'flexible';
    payment_method?: string;
    payment_status?: string;
    warehouse_spaces?: number[] | null;
    logistics_data?: Record<string, any> | null;
}

interface Vehicle {
    id: string;
    plate: string;
    vehicle_type: string;
    capacity_kg: number;
    driver_id?: string;
    driver_name?: string;
    driver_avatar?: string;
    driver?: {
        contact_name: string;
        avatar_url?: string;
    } | null;
    max_crates_capacity: number;
}

export default function RoutePlanner({ readOnly = false }: { readOnly?: boolean }) {
    const [orders, setOrders] = useState<Order[]>([]);
    const [priorityOrderIds, setPriorityOrderIds] = useState<string[]>([]);

    useEffect(() => {
        const validIds = new Set(orders.map(o => String(o.id)));
        setPriorityOrderIds(prev => {
            const filtered = prev.filter(id => validIds.has(id));
            return filtered.length === prev.length ? prev : filtered;
        });
    }, [orders]);

    const togglePriorityOrder = (orderId: string) => {
        if (readOnly) return;
        const targetId = String(orderId);
        const clicked = orders.find(o => String(o.id) === targetId);
        const parentId = clicked?.logistics_data?.is_off_agreement_split && clicked?.logistics_data?.parent_order_id
            ? String(clicked.logistics_data.parent_order_id)
            : targetId;
        const familyIds = new Set<string>([parentId]);
        orders.forEach(o => {
            if (o?.logistics_data?.is_off_agreement_split && String(o?.logistics_data?.parent_order_id || '') === parentId) {
                familyIds.add(String(o.id));
            }
        });
        setPriorityOrderIds(prev => {
            const isCurrentlyPriority = Array.from(familyIds).some(id => prev.includes(id));
            if (isCurrentlyPriority) {
                return prev.filter(id => !familyIds.has(id));
            }
            const next = new Set(prev);
            familyIds.forEach(id => next.add(id));
            return Array.from(next);
        });
    };
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [tableSearch, setTableSearch] = useState<string>('');
    const [tableFilter, setTableFilter] = useState<'all' | 'pending' | 'priority'>('all');
    const [routeViewMode, setRouteViewMode] = useState<'delivery' | 'lifo'>('delivery');
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [optimizationError, setOptimizationError] = useState<string | null>(null);
    const [confirmationError, setConfirmationError] = useState<string | null>(null);
    const [copiedWhatsApp, setCopiedWhatsApp] = useState<boolean>(false);
    const [popupBlockedWarning, setPopupBlockedWarning] = useState<boolean>(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiReportText, setAiReportText] = useState('');
    const [debugInfo, setDebugInfo] = useState({ targetDate: '', count: 0, cutoff: false, driversFound: '' });

    const [selectedDeliveryDate, setSelectedDeliveryDate] = useState<string>(() => {
        if (typeof window !== 'undefined') {
            const urlDate = new URLSearchParams(window.location.search).get('date');
            if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate)) {
                return urlDate;
            }
        }
        return getOperationalTargetDate(20);
    });
    const [showAllDates, setShowAllDates] = useState<boolean>(false);

    const [showSettings, setShowSettings] = useState(false);
    const [params, setParams] = useState<Record<string, any>>({
        b2b_kg_min: 10,
        b2c_kg_min: 5,
        base_setup_time: 4,               // X: Tiempo base alistamiento
        time_per_10_crates_unload: 4,      // Y: Descarga física de 10 canastillas
        time_per_10_crates_delivery: 10,   // Z: Recepción/Revisión de 10 canastillas
        avg_kg_per_crate: 12.5,
        space_capacity: 36,               // Capacidad de canastillas por bahía física
        driver_break_mins: 45,
        fleet_start_time: '04:30',
        fleet_end_time: '19:00',
        optimization_strategy: 'balanced',
        warehouse_base_load_time: 15,
        warehouse_time_per_10_crates_load: 5
    });
    const [assignments, setAssignments] = useState<Record<string, string[]>>({}); 
    const [routeStartTimes, setRouteStartTimes] = useState<Record<string, string>>({});
    const [stopEtas, setStopEtas] = useState<Record<string, string>>({});
    const [confirmedManifest, setConfirmedManifest] = useState<any[] | null>(null);
    const [showPreConfirm, setShowPreConfirm] = useState(false);
    const [optimizationSource, setOptimizationSource] = useState<'google' | 'simulation' | null>(null);

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        fetchInitialData();
        return () => { isMounted.current = false; };
    }, [selectedDeliveryDate, showAllDates]);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            
            // 1. Fetch Logistic Parameters
            const { data: paramData, error: pErr } = await supabase.from('logistic_parameters').select('*');
            if (pErr) console.warn('Note: Could not fetch logistic parameters:', pErr.message);
            
            let avgCrateWeight = 12.5; // default fallback
            if (paramData && isMounted.current) {
                const pMap: Record<string, any> = {};
                paramData.forEach((p: any) => {
                    const valFloat = parseFloat(p.value);
                    pMap[p.id] = isNaN(valFloat) || p.value.includes(':') ? p.value : valFloat;
                });
                setParams(prev => ({ ...prev, ...pMap }));
                if (pMap.avg_kg_per_crate) {
                    avgCrateWeight = pMap.avg_kg_per_crate;
                }
            }

            // 2. Fetch Orders (with date filter or all dates)
            let apiUrl = '/api/transport/orders';
            if (!showAllDates && selectedDeliveryDate) {
                apiUrl += `?date=${selectedDeliveryDate}&t=${Date.now()}`;
            } else {
                apiUrl += `?t=${Date.now()}`;
            }

            const response = await fetch(apiUrl, { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch orders');
            const orderData = await response.json();

            // 3. Fetch Fleet with Driver Join (Matching FleetManagement logic)
            const { data: fleetData, error: fErr } = await supabase
                .from('fleet_vehicles')
                .select(`
                    *,
                    driver:collaborators!driver_id (
                        id,
                        contact_name
                    )
                `)
                .eq('status', 'available');

            if (!isMounted.current) return;
            if (fErr) throw fErr;

            if (isMounted.current) {
                setDebugInfo({ 
                    targetDate: showAllDates ? 'TODOS' : selectedDeliveryDate, 
                    count: (orderData || []).length,
                    cutoff: !showAllDates,
                    driversFound: 'Sincronizado con FLOTA'
                });
            }

            const enhancedFleet = (fleetData || []).map(v => ({
                ...v,
                driver_name: v.driver?.contact_name || 'Sin Asignar'
            }));

            // Update State
            setVehicles(enhancedFleet);
            
            const mappedOrders = (orderData || []).map((o: any) => {
                let name = o.customer_name || 'Sin Nombre';
                if (o.profiles) {
                    if (o.profiles.role === 'b2b_client') {
                        name = o.profiles.company_name || 'Sin Razón Social';
                    } else {
                        name = o.profiles.contact_name || o.profiles.company_name || 'Cliente Registrado';
                    }
                } else if (o.admin_notes && o.admin_notes.includes('CLIENTE HOGAR')) {
                    const nameMatch = o.admin_notes.match(/Nombre: (.*?) \|/);
                    if (nameMatch) name = nameMatch[1];
                }

                // Extraer solo la restricción o instrucción logística real, omitiendo volcados de email y logs
                let notes = o.admin_notes || '';
                if (notes) {
                    notes = notes.replace(/\[PAGO:.*?\]/gi, '')
                                 .replace(/\[ORIGIN:.*?\]/gi, '')
                                 .replace(/\[CLIENTE HOGAR.*?\]/gi, '')
                                 .replace(/\[Audit[^\]]*\]/gi, '')
                                 .replace(/\[AUDITOR[IÍ]A[^\]]*\]/gi, '')
                                 .replace(/\[ORDEN DE COMPRA[^\]]*\]/gi, '')
                                 .replace(/CLIENTE HOGAR.*?(\||\n|$)/gi, '')
                                 .replace(/\[PEDIDO CORREO\][\s\S]*$/gi, '')
                                 .replace(/Asunto:[\s\S]*$/gi, '')
                                 .replace(/De:[\s\S]*$/gi, '')
                                 .replace(/Enviado el:[\s\S]*$/gi, '')
                                 .replace(/Estimados señores[\s\S]*$/gi, '')
                                 .replace(/Pago en línea verificado.*?(\.|\n|$)/gi, '')
                                 .replace(/Pago contra entrega.*?(\.|\n|$)/gi, '')
                                 .replace(/Pago en efectivo.*?(\.|\n|$)/gi, '')
                                 .replace(/Contraentrega.*?(\.|\n|$)/gi, '')
                                 .replace(/Wompi.*?(\.|\n|$)/gi, '')
                                 .replace(/Aprobado.*?(\.|\n|$)/gi, '')
                                 .replace(/Nombre:.*?(\||\n|$)/gi, '')
                                 .replace(/Tel:.*?(\||\n|$)/gi, '')
                                 .replace(/ID:[a-f0-9-]{36}/gi, '') // Removes UUIDs
                                 .replace(/ID:.*?(\||\n|$)/gi, '')
                                 .replace(/\|/g, '') // Remove remaining separators
                                 .trim();
                }




                const resolvedIsB2B = !!o.is_b2b || (o.type?.toLowerCase().includes('b2b') ?? false) || o.profiles?.role === 'b2b_client' || o.profiles?.role === 'b2b';

                // Resolve display time window and type
                let displaySlot = 'Flexible';
                let slotType: 'manual' | 'profile' | 'b2c_slot' | 'flexible' = 'flexible';

                if (o.is_manual_delivery && o.manual_delivery_time) {
                    // Si tiene una hora específica en la cabecera (como los pedidos que generamos)
                    // ej. 08:30 y margen 60 -> 07:30 - 09:30
                    const margin = o.manual_delivery_margin || 60;
                    const [h, m] = o.manual_delivery_time.split(':').map(Number);
                    
                    const pad = (n: number) => n.toString().padStart(2, '0');
                    
                    // Calcular hora de inicio
                    const totalMinStart = (h * 60 + m - margin + 1440) % 1440;
                    const startH = Math.floor(totalMinStart / 60);
                    const startM = totalMinStart % 60;
                    
                    // Calcular hora de fin
                    const totalMinEnd = (h * 60 + m + margin) % 1440;
                    const endH = Math.floor(totalMinEnd / 60);
                    const endM = totalMinEnd % 60;

                    displaySlot = `${pad(startH)}:${pad(startM)} - ${pad(endH)}:${pad(endM)}`;
                    slotType = 'manual';
                } else if (resolvedIsB2B) {
                    if (o.is_manual_delivery && o.logistics_data?.windows?.[0]) {
                        const win = o.logistics_data.windows[0];
                        if (win.startTime && win.endTime) {
                            displaySlot = `${win.startTime} - ${win.endTime}`;
                            slotType = 'manual';
                        }
                    } else if (o.profiles?.logistics_data?.windows?.[0]) {
                        const win = o.profiles.logistics_data.windows[0];
                        if (win.startTime && win.endTime) {
                            displaySlot = `${win.startTime} - ${win.endTime}`;
                            slotType = 'profile';
                        }
                    }
                }

                return {
                    ...o,
                    customer_name: name,
                    address: o.shipping_address || 'Sin Dirección',
                    address_complement: o.profiles?.address_complement || '',
                    crates: o.crates || (o.total_weight_kg ? Math.ceil(o.total_weight_kg / avgCrateWeight) : 0),
                    novedad: notes,
                    total_weight_kg: o.total_weight_kg || 0,
                    is_b2b: resolvedIsB2B,
                    delivery_zone: o.delivery_zone || '',
                    display_slot: displaySlot,
                    slot_type: slotType,
                    payment_method: o.payment_method,
                    payment_status: o.payment_status
                };
            });
            setOrders(mappedOrders);

            // Cargar asignaciones guardadas de localStorage si existen para el día de hoy
            try {
                const savedDataStr = localStorage.getItem('frufresco_route_planner_draft');
                if (savedDataStr) {
                    const savedData = JSON.parse(savedDataStr);
                    if (savedData.targetDate === selectedDeliveryDate) {
                        const validOrderIds = new Set(mappedOrders.map((o: any) => String(o.id)));
                        const filteredAssignments: Record<string, string[]> = {};
                        
                        Object.keys(savedData.assignments || {}).forEach(vehicleId => {
                            const oids = (savedData.assignments[vehicleId] || []).filter((oid: string) => validOrderIds.has(String(oid)));
                            if (oids.length > 0) {
                                filteredAssignments[vehicleId] = oids;
                            }
                        });
                        
                        setAssignments(filteredAssignments);
                        setIsOptimized(savedData.isOptimized || false);
                        if (savedData.optimizationSource === 'google' || savedData.optimizationSource === 'simulation') {
                            setOptimizationSource(savedData.optimizationSource);
                        } else {
                            setOptimizationSource(null);
                        }
                        if (savedData.stopEtas && typeof savedData.stopEtas === 'object') {
                            setStopEtas(savedData.stopEtas);
                        }
                        if (savedData.routeStartTimes && typeof savedData.routeStartTimes === 'object') {
                            setRouteStartTimes(savedData.routeStartTimes);
                        }
                        if (savedData.theoreticalMetrics) {
                            setTheoreticalMetrics(savedData.theoreticalMetrics);
                        }
                        if (savedData.aiReportText) {
                            setAiReportText(savedData.aiReportText);
                        }
                    }
                }
            } catch (e) {
                console.error("Error al cargar borrador de localStorage:", e);
            }

        } catch (err: any) {
            console.error('Error fetching planner data:', err.message || err.details || err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const [isOptimized, setIsOptimized] = useState(false);
    const [theoreticalMetrics, setTheoreticalMetrics] = useState<{distance_km: number, duration_min: number} | null>(null);
    const [dragOverVehicleId, setDragOverVehicleId] = useState<string | null>(null);
    const [dragOverSidebar, setDragOverSidebar] = useState<boolean>(false);

    // Guardar automáticamente el borrador en localStorage cuando cambie la asignación
    useEffect(() => {
        if (loading) return;
        try {
            const targetDate = selectedDeliveryDate || getOperationalTargetDate(20);
            
            const draftData = {
                targetDate,
                assignments,
                isOptimized,
                optimizationSource,
                stopEtas,
                routeStartTimes,
                theoreticalMetrics,
                aiReportText
            };
            localStorage.setItem('frufresco_route_planner_draft', JSON.stringify(draftData));
        } catch (e) {
            console.error("Error al guardar borrador en localStorage:", e);
        }
    }, [assignments, isOptimized, optimizationSource, stopEtas, routeStartTimes, theoreticalMetrics, aiReportText, loading, selectedDeliveryDate]);

    const handleAutoOptimize = async () => {
        if (readOnly) return;
        try {
            setOptimizing(true);
            
            const response = await fetch('/api/transport/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orders,
                    vehicles,
                    parameters: params,
                    priorityOrderIds
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Error en el servidor de optimización (código ${response.status})`);
            }

            const result = await response.json();
            
            if (result.routes) {
                setAssignments(result.routes);
                const isSim = Boolean(result.simulation);
                setOptimizationSource(isSim ? 'simulation' : 'google');
                setIsOptimized(!isSim);
                if (result.route_start_times) {
                    setRouteStartTimes(result.route_start_times);
                }
                if (result.stop_etas) {
                    setStopEtas(result.stop_etas);
                }
                if (!isSim && result.theoretical_metrics) {
                    setTheoreticalMetrics(result.theoretical_metrics);
                } else {
                    setTheoreticalMetrics(null);
                }
            }


            if (result.explanation) {
                setAiReportText(result.explanation);
                setShowAiModal(true);
            }

        } catch (err: any) {
            console.error('Optimization failed:', err);
            const msg = err?.message || 'Ocurrió un error al procesar las rutas.';
            setOptimizationError(msg);
            setTimeout(() => setOptimizationError(null), 8000);
        } finally {
            setOptimizing(false);
        }
    };

    const getInitials = (name: string) => {
        if (!name || name === 'Sin Asignar') return '';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const renderAiReport = (text: string) => {
        if (!text) return null;
        
        const lines = text.split('\n');
        return lines.map((line, idx) => {
            const trimmed = line.trim();
            if (!trimmed) return <div key={idx} style={{ height: '0.75rem' }} />;
            
            const parts = trimmed.split(/(\*\*.*?\*\*)/g);
            const content = parts.map((part, pIdx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={pIdx} style={{ fontWeight: '800', color: '#1E1B4B' }}>{part.slice(2, -2)}</strong>;
                }
                return part;
            });

            if (trimmed.startsWith('-') || trimmed.startsWith('•') || /^[^\w\s]\s*-/.test(trimmed)) {
                const cleanContent = trimmed.replace(/^[-•]\s*/, '');
                const bulletParts = cleanContent.split(/(\*\*.*?\*\*)/g).map((part, pIdx) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={pIdx} style={{ fontWeight: '800', color: '#1E1B4B' }}>{part.slice(2, -2)}</strong>;
                    }
                    return part;
                });
                return (
                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                        <span style={{ color: '#6366F1', marginTop: '0.2rem' }}>•</span>
                        <span style={{ flex: 1 }}>{bulletParts}</span>
                    </div>
                );
            }
            
            return (
                <p key={idx} style={{ margin: '0 0 0.75rem 0' }}>
                    {content}
                </p>
            );
        });
    };

    const handleConfirmRoutes = async () => {
        if (readOnly) return;
        try {
            setLoading(true);
            // Construir un mapeo de vehículo -> hora de salida (dinámica calculada o default)
            const dynamicStartTimes: Record<string, string> = {};
            Object.keys(assignments).forEach(vehicleId => {
                dynamicStartTimes[vehicleId] = routeStartTimes[vehicleId] || params.fleet_start_time || '04:30';
            });

            const response = await fetch('/api/transport/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    assignments,
                    vehicles,
                    isOptimized,
                    theoreticalMetrics,
                    params,
                    routeStartTimes: dynamicStartTimes, // Pasar las horas de salida estimadas dinámicas
                    preserveExistingSpaces: true,
                    ...(Object.keys(stopEtas).length > 0 ? { stopEtas } : {})
                })
            });


            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al confirmar las rutas en el servidor');
            }

            const result = await response.json();
            
            if (result.routeConfirmations && Array.isArray(result.routeConfirmations)) {
                const enrichedConfirmations = result.routeConfirmations.map((route: any) => {
                    const stops = (route.order_ids || []).map((oid: string) => {
                        const localOrder = orders.find(o => String(o.id) === String(oid));
                        return {
                            id: oid,
                            customer_name: localOrder?.customer_name || 'Cliente',
                            total_weight_kg: localOrder?.total_weight_kg || 0,
                            crates: localOrder?.crates || 0,
                            address: localOrder?.address || 'Sin Dirección',
                            warehouse_spaces: route.order_spaces?.[oid] || [],
                            logistics_data: localOrder?.logistics_data || null
                        };
                    });
                    return {
                        ...route,
                        stops
                    };
                });
                setConfirmedManifest(enrichedConfirmations);
            }
            
            // Limpiar borrador del día al confirmar
            try { localStorage.removeItem('frufresco_route_planner_draft'); } catch (_) {}
            setAssignments({});
            setStopEtas({});
            setPriorityOrderIds([]);
            await fetchInitialData();

        } catch (err: any) {
            console.error('Error confirming routes:', err);
            const msg = err?.message || 'Error al confirmar las rutas';
            setConfirmationError(msg);
            setTimeout(() => setConfirmationError(null), 8000);
        } finally {
            setLoading(false);
        }
    };

    const getVehicleLoad = (vehicleId: string) => {
        const orderIds = assignments[vehicleId] || [];
        return orders.filter(o => orderIds.includes(o.id)).reduce((sum, o) => sum + o.total_weight_kg, 0);
    };

    const getOrderCrates = (order?: Order | null) => {
        const avgKg = parseFloat(String(params.avg_kg_per_crate || '12.5').replace(',', '.')) || 12.5;
        const w = Number(order?.total_weight_kg) || 0;
        return Math.max(1, Math.ceil(w / avgKg));
    };

    const getVehicleCrates = (vehicleId: string) => {
        const orderIds = assignments[vehicleId] || [];
        return orderIds.reduce((sum, oid) => {
            const ord = orders.find(o => o.id === oid);
            return sum + (ord ? getOrderCrates(ord) : 0);
        }, 0);
    };

    const NUMERIC_PARAM_IDS = new Set([
        'base_setup_time',
        'time_per_10_crates_unload',
        'time_per_10_crates_delivery',
        'driver_break_mins',
        'avg_kg_per_crate',
        'warehouse_base_load_time',
        'warehouse_time_per_10_crates_load',
        'space_capacity',
        'b2b_kg_min',
        'b2c_kg_min'
    ]);

    const updateParameter = async (id: string, value: any) => {
        if (readOnly) return;
        setParams(prev => ({ ...prev, [id]: value }));
        if (NUMERIC_PARAM_IDS.has(id)) {
            const norm = String(value ?? '').replace(',', '.').trim();
            if (!norm || norm.endsWith('.')) return;
            const parsedNum = Number(norm);
            if (!Number.isFinite(parsedNum) || parsedNum < 0) return;
            await supabase.from('logistic_parameters').upsert({ id, value: String(parsedNum) });
            return;
        }
        await supabase.from('logistic_parameters').upsert({ id, value: String(value) });
    };

    const toggleAssignment = (orderId: string, vehicleId: string) => {
        if (readOnly) return;
        setIsOptimized(false); // If manual change happens, reset optimized flag
        setOptimizationSource(null);
        setTheoreticalMetrics(null);
        setStopEtas({});
        const currentOrders = assignments[vehicleId] || [];
        if (currentOrders.includes(orderId)) {
            setAssignments({ ...assignments, [vehicleId]: currentOrders.filter(id => id !== orderId) });
        } else {
            const cleaned = { ...assignments };
            Object.keys(cleaned).forEach(vid => {
                cleaned[vid] = cleaned[vid].filter(id => id !== orderId);
            });
            cleaned[vehicleId] = [...(cleaned[vehicleId] || []), orderId];
            setAssignments(cleaned);
        }
    };

    // Drag and Drop Handlers
    const handleDragStart = (e: React.DragEvent, orderId: string, sourceVehicleId?: string, sourceIndex?: number) => {
        if (readOnly || (sourceVehicleId && routeViewMode === 'lifo')) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', orderId);
        if (sourceVehicleId) {
            e.dataTransfer.setData('sourceVehicleId', sourceVehicleId);
        }
        if (sourceIndex !== undefined) {
            e.dataTransfer.setData('sourceIndex', String(sourceIndex));
        }
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDropOnVehicle = (e: React.DragEvent, targetVehicleId: string, targetIndex?: number) => {
        e.preventDefault();
        if (readOnly) return;
        if (targetIndex !== undefined && routeViewMode === 'lifo') return;
        const orderId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('orderId');
        if (!orderId) return;

        setAssignments(prev => {
            const cleaned = { ...prev };
            
            // Remove the order from whichever vehicle it was previously assigned to
            Object.keys(cleaned).forEach(vid => {
                cleaned[vid] = (cleaned[vid] || []).filter(id => id !== orderId);
            });

            // Insert the order into the target vehicle's list at the target index (or append to end)
            const targetList = [...(cleaned[targetVehicleId] || [])];
            if (targetIndex !== undefined) {
                targetList.splice(targetIndex, 0, orderId);
            } else {
                targetList.push(orderId);
            }
            cleaned[targetVehicleId] = targetList;
            return cleaned;
        });
        setIsOptimized(false);
        setOptimizationSource(null);
        setTheoreticalMetrics(null);
        setStopEtas({});
    };

    const handleSidebarDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (readOnly) return;
        const orderId = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('orderId');
        if (orderId) {
            setAssignments(prev => {
                const cleaned = { ...prev };
                Object.keys(cleaned).forEach(vid => {
                    cleaned[vid] = (cleaned[vid] || []).filter(id => id !== orderId);
                });
                return cleaned;
            });
            setIsOptimized(false);
            setOptimizationSource(null);
            setTheoreticalMetrics(null);
            setStopEtas({});
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (readOnly) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        e.dataTransfer.dropEffect = 'move';
    };

    const getEstimatedTimesForVehicle = (vehicleId: string, totalCrates: number) => {
        // Departure time (dynamic per vehicle from optimization, or default fleet start)
        const departureTimeStr = routeStartTimes[vehicleId] || params.fleet_start_time || '04:30';
        const [h, m] = departureTimeStr.split(':').map(Number);
        const totalMinutes = h * 60 + m;


        // Calculate load time in minutes: base_load + (crates * (time_per_10_crates / 10))
        const baseLoad = parseFloat(params.warehouse_base_load_time) || 15;
        const timePer10 = parseFloat(params.warehouse_time_per_10_crates_load) || 5;
        const loadDuration = Math.round(baseLoad + (totalCrates * (timePer10 / 10)));

        // Load start time
        let loadMinutes = totalMinutes - loadDuration;
        if (loadMinutes < 0) loadMinutes += 1440; // wrap around day if needed

        const loadH = Math.floor(loadMinutes / 60);
        const loadM = loadMinutes % 60;

        const formatTime = (hh: number, mm: number) => {
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const displayH = hh % 12 || 12;
            const displayM = mm.toString().padStart(2, '0');
            return `${displayH}:${displayM} ${ampm}`;
        };

        return {
            loadStart: formatTime(loadH, loadM),
            departure: formatTime(h, m),
            duration: loadDuration
        };
    };

    const printManifestViaNewWindow = () => {
        if (!confirmedManifest) return;

        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            setPopupBlockedWarning(true);
            setTimeout(() => setPopupBlockedWarning(false), 6000);
            return;
        }

        const dateStr = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });

        const routesHtml = confirmedManifest.map((route: any, idx: number) => {
            const stopsHtml = route.stops && route.stops.length > 0 
                ? `
                <div style="margin-top: 1rem;">
                    <div style="font-size: 10px; font-weight: 800; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">Secuencia de Carga y Entrega</div>
                    <div style="display: flex; flex-direction: column; gap: 0.4rem;">
                        ${route.stops.map((stop: any, sIdx: number) => `
                            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; padding: 0.25rem 0; border-bottom: 1px solid #F1F5F9;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="background-color: #E2E8F0; color: #475569; font-size: 0.65rem; font-weight: 800; border-radius: 50%; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center;">${sIdx + 1}</span>
                                    <span style="font-weight: 700; color: #1E293B;">${stop.customer_name}</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <span style="font-size: 0.75rem; color: #64748B;">${formatNumber(stop.total_weight_kg || 0, 1)} kg (${stop.crates} can.)</span>
                                    <span style="font-size: 0.7rem; font-weight: 850; background-color: rgba(14, 165, 233, 0.08); color: #0284C7; padding: 2px 6px; border-radius: 4px;">
                                        ${(() => {
                                            const label = getOrderSpaceDisplayLabel({ warehouse_spaces: stop.warehouse_spaces, logistics_data: stop.logistics_data });
                                            return label ? `ESP ${label}` : (stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? `ESP ${stop.warehouse_spaces.join(', ')}` : 'Sin Espacio');
                                        })()}
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                `
                : '';

            return `
            <div class="page-break-inside-avoid" style="border: 1px solid #E2E8F0; border-radius: 16px; padding: 1.25rem; background-color: #F8FAFC; margin-bottom: 1rem; display: flex; flex-direction: column; gap: 1rem;">
                <div style="display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 1rem; align-items: center; border-bottom: ${route.stops && route.stops.length > 0 ? '1px solid #F1F5F9' : 'none'}; padding-bottom: ${route.stops && route.stops.length > 0 ? '0.75rem' : 0};">
                    <div>
                        <div style="font-weight: 900; color: #0F172A; font-size: 0.95rem;">${route.vehicle_plate}</div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 700; margin-top: 2px;">Conductor: ${route.driver_name}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 800;">ENTREGAS / PESO</div>
                        <div style="font-weight: 800; color: #1E293B; font-size: 0.85rem; margin-top: 2px;">${route.stops_count} entregas • ${formatNumber(route.total_kilos || 0, 1)} kg</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 800;">ESPACIOS BODEGA</div>
                        <div style="font-weight: 900; color: #0EA5E9; font-size: 0.85rem; margin-top: 2px;">
                            ${route.warehouse_spaces && route.warehouse_spaces.length > 0 
                                ? `[${route.warehouse_spaces.join(', ')}]` 
                                : 'Por asignar'}
                        </div>
                    </div>
                </div>
                ${stopsHtml}
            </div>
            `;
        }).join('');

        const logoUrl = window.location.origin + '/assets/branding/logo_corporate.png?v=3';

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Manifiesto de Despacho - Investments Cortes</title>
                <style>
                    @page { margin: 15mm 15mm; size: letter; }
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #ffffff !important; margin: 0; color: #1f2937; }
                    .page-break-inside-avoid { page-break-inside: avoid !important; break-inside: avoid !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                </style>
            </head>
            <body style="background-color: #ffffff; margin: 0;">
                <div style="max-width: 210mm; margin: 0 auto; min-height: 297mm; padding: 2rem; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">
                    <div>
                        <!-- Header -->
                        <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                            <div>
                                <img src="${logoUrl}" alt="Investments Cortes Logo" style="height: 65px; width: auto; object-fit: contain;" />
                            </div>
                            <div style="text-align: right; font-size: 0.8rem; color: #4b5563; line-height: 1.4;">
                                <div style="font-weight: 800; color: #111827; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 0.25rem;">Investments Cortes S.A.S</div>
                                <div>NIT: 901.393.217-5</div>
                                <div style="font-weight: 700; color: #1E293B;">Contáctanos</div>
                                <div>30154217612</div>
                                <div>pedidos@frufresco.com</div>
                                <div style="color: #0D7A57; font-weight: 600;">www.frufresco.com</div>
                            </div>
                        </header>

                        <!-- Meta -->
                        <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; font-size: 0.9rem; color: #6b7280;">
                            <div>Fecha: <span style="font-weight: 700; color: #374151;">${dateStr}</span></div>
                            <div>Ref: <span style="font-weight: 700; color: #374151;">Manifiesto de Despacho</span></div>
                        </div>

                        <!-- Title -->
                        <h1 style="font-size: 1.5rem; font-weight: 900; color: #111827; margin-bottom: 1.5rem; text-align: center; text-transform: uppercase; letter-spacing: -0.025em;">
                            Manifiesto de Despacho y Plan de Rutas
                        </h1>

                        <!-- Content -->
                        <div>
                            ${routesHtml}
                        </div>
                    </div>

                    <!-- Footer -->
                    <footer style="margin-top: 3rem; border-top: 1px solid #f3f4f6; padding-top: 1.5rem; font-size: 0.75rem; color: #9ca3af; text-align: center;">
                        <p>Este documento es propiedad de Investments Cortes S.A.S. Prohibida su reproducción total o parcial sin autorización.</p>
                        <div style="margin-top: 0.5rem; font-weight: 600; color: #4b5563; letter-spacing: 0.05em;">CORTESÍA • CALIDAD • COMPROMISO</div>
                    </footer>
                </div>
                
                <script>
                    (function() {
                        var printed = false;
                        function doPrint() {
                            if (printed) return;
                            printed = true;
                            try {
                                window.focus();
                                window.print();
                            } catch (e) {
                                console.error('Error al imprimir manifiesto:', e);
                            }
                        }
                        if (document.readyState === 'complete') {
                            setTimeout(doPrint, 200);
                        } else {
                            window.addEventListener('load', function() { setTimeout(doPrint, 150); });
                            setTimeout(doPrint, 600);
                        }
                    })();
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>Iniciando motores...</div>;

    return (
        <>
            <div className="rp-layout">
            {/* Orders Sidebar */}
            <div 
                onDragOver={(e) => { e.preventDefault(); setDragOverSidebar(true); }}
                onDragLeave={() => setDragOverSidebar(false)}
                onDrop={(e) => { handleSidebarDrop(e); setDragOverSidebar(false); }}
                className="rp-sidebar"
                style={{ 
                    backgroundColor: dragOverSidebar ? '#ECFDF5' : '#FFFFFF', 
                    borderRadius: '16px', 
                    border: dragOverSidebar ? '2px dashed #0D7A57' : '1px solid #E2E8F0', 
                    boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    display: 'flex', 
                    flexDirection: 'column', 
                    overflow: 'hidden',
                    zIndex: 20,
                    minHeight: '420px',
                    transition: 'all 0.2s'
                }}
            >
                <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#1F2937', letterSpacing: '-0.02em' }}>PEDIDOS PICKING</h3>
                            <div style={{ fontSize: '0.62rem', color: '#6B7280', fontWeight: '800', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <div style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #D1D5DB',
                                    borderRadius: '6px',
                                    padding: '2px 6px'
                                }}>
                                    <Calendar size={12} color="#6B7280" />
                                    <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#4B5563' }}>Despacho:</span>
                                    <input
                                        type="date"
                                        value={selectedDeliveryDate}
                                        disabled={showAllDates}
                                        onChange={(e) => setSelectedDeliveryDate(e.target.value)}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            fontSize: '0.68rem',
                                            fontWeight: '800',
                                            color: showAllDates ? '#9CA3AF' : '#111827',
                                            outline: 'none',
                                            cursor: showAllDates ? 'not-allowed' : 'pointer'
                                        }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAllDates(prev => !prev)}
                                    style={{
                                        border: '1px solid #E5E7EB',
                                        borderRadius: '6px',
                                        padding: '2px 6px',
                                        fontSize: '0.60rem',
                                        fontWeight: '800',
                                        backgroundColor: showAllDates ? '#EDE9FE' : '#FFFFFF',
                                        color: showAllDates ? '#6D28D9' : '#6B7280',
                                        cursor: 'pointer'
                                    }}
                                    title={showAllDates ? "Filtrar por fecha específica" : "Mostrar todos los pedidos sin filtro de fecha"}
                                >
                                    {showAllDates ? "Ver Solo Fecha" : "Ver Todos"}
                                </button>
                                <span style={{ color: '#E5E7EB' }}>•</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#0D9488' }}>
                                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
                                    Flota Conectada
                                </span>
                            </div>
                            <div style={{ fontSize: '0.62rem', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#F1F5F9', color: '#475569', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #E2E8F0', fontWeight: '800' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Scale size={12} strokeWidth={1.5} /> Carga:</span> {formatNumber(orders.reduce((acc, curr) => acc + curr.total_weight_kg, 0), 1)} kg
                                </span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#E6FFFA', color: '#0D9488', padding: '0.2rem 0.5rem', borderRadius: '6px', border: '1px solid #CCFBF1', fontWeight: '800' }}>
                                    <Package size={12} strokeWidth={1.5} /> Canastillas: {orders.reduce((acc, curr) => acc + curr.crates, 0)} und
                                </span>
                                {(() => {
                                    const unassignedOrders = orders.filter(o => !Object.values(assignments).some(ids => ids.includes(o.id)));
                                    if (unassignedOrders.length < orders.length) {
                                        const unassignedWeight = unassignedOrders.reduce((acc, curr) => acc + curr.total_weight_kg, 0);
                                        return (
                                            <span style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: '700' }}>
                                                ({formatNumber(unassignedWeight, 1)} kg sin asignar)
                                            </span>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {priorityOrderIds.length > 0 && (
                                <span style={{ fontSize: '0.62rem', backgroundColor: '#FFFBEB', color: '#B45309', padding: '0.25rem 0.6rem', borderRadius: '20px', fontWeight: '800', border: '1px solid #FDE68A', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Star size={11} fill="#F59E0B" stroke="#B45309" strokeWidth={2} />
                                    {priorityOrderIds.length} prioritario{priorityOrderIds.length > 1 ? 's' : ''}
                                </span>
                            )}
                            <span style={{ fontSize: '0.62rem', backgroundColor: '#F1F5F9', color: '#0F172A', padding: '0.25rem 0.6rem', borderRadius: '20px', fontWeight: '800', border: '1px solid #CBD5E1' }}>
                                {orders.length} pedidos
                            </span>
                        </div>
                    </div>
                    {/* Compact Search + Filter Pills */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={13} style={{ position: 'absolute', left: '9px', color: '#64748B', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                value={tableSearch}
                                onChange={(e) => setTableSearch(e.target.value)}
                                placeholder="Buscar cliente, dirección o ESP..."
                                style={{
                                    width: '100%',
                                    padding: '5px 26px 5px 28px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    backgroundColor: '#FFFFFF',
                                    fontSize: '0.70rem',
                                    fontWeight: '600',
                                    color: '#0F172A',
                                    outline: 'none'
                                }}
                            />
                            {tableSearch && (
                                <button
                                    type="button"
                                    onClick={() => setTableSearch('')}
                                    aria-label="Limpiar búsqueda"
                                    style={{ position: 'absolute', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', padding: '2px', display: 'flex' }}
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {(() => {
                                const pendingCount = orders.filter(o => !Object.values(assignments).some(ids => ids.includes(o.id))).length;
                                const pills: Array<{ id: 'all' | 'pending' | 'priority'; label: string }> = [
                                    { id: 'all', label: `Todos (${orders.length})` },
                                    { id: 'pending', label: `Pendientes (${pendingCount})` },
                                    { id: 'priority', label: `★ Prioritarios (${priorityOrderIds.length})` }
                                ];
                                return pills.map(p => {
                                    const active = tableFilter === p.id;
                                    return (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => setTableFilter(p.id)}
                                            style={{
                                                padding: '3px 8px',
                                                borderRadius: '9999px',
                                                fontSize: '0.62rem',
                                                fontWeight: '800',
                                                border: active ? '1px solid #0D7A57' : '1px solid #E2E8F0',
                                                backgroundColor: active ? '#ECFDF5' : '#FFFFFF',
                                                color: active ? '#065F46' : '#475569',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0', scrollbarWidth: 'thin' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.7rem' }}>
                        <thead>
                            <tr>
                                <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'left', padding: '0.55rem 0.65rem', borderBottom: '2px solid #CBD5E1', width: '56px' }}>TIPO</th>
                                <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'left', padding: '0.55rem 0.45rem', borderBottom: '2px solid #CBD5E1' }}>CLIENTE &amp; LOGÍSTICA</th>
                                <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#F1F5F9', color: '#0F172A', fontWeight: '800', textAlign: 'right', padding: '0.55rem 0.65rem', borderBottom: '2px solid #CBD5E1', width: '74px' }}>CARGA</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...orders]
                                .filter(order => {
                                    const isAssigned = Object.values(assignments).some(ids => ids.includes(order.id));
                                    const isPriority = priorityOrderIds.includes(String(order.id));
                                    if (tableFilter === 'pending' && isAssigned) return false;
                                    if (tableFilter === 'priority' && !isPriority) return false;
                                    if (tableSearch.trim()) {
                                        const q = tableSearch.trim().toLowerCase();
                                        const espLabel = (getOrderSpaceDisplayLabel(order) || '').toLowerCase();
                                        const hay = `${order.customer_name || ''} ${order.address || ''} ${order.delivery_zone || ''} esp ${espLabel} ${espLabel}`.toLowerCase();
                                        if (!hay.includes(q)) return false;
                                    }
                                    return true;
                                })
                                .sort((a, b) => {
                                    const aAssigned = Object.values(assignments).some(ids => ids.includes(a.id));
                                    const bAssigned = Object.values(assignments).some(ids => ids.includes(b.id));
                                    if (aAssigned && !bAssigned) return 1;
                                    if (!aAssigned && bAssigned) return -1;
                                    const aPrio = priorityOrderIds.includes(String(a.id)) ? 1 : 0;
                                    const bPrio = priorityOrderIds.includes(String(b.id)) ? 1 : 0;
                                    if (aPrio !== bPrio) return bPrio - aPrio;
                                    return 0;
                                })
                                .map(order => {
                                    const assignedVehicleId = Object.keys(assignments).find(vid => (assignments[vid] || []).includes(order.id));
                                    const assignedVehicle = assignedVehicleId ? vehicles.find(v => v.id === assignedVehicleId) : null;
                                    const isAssigned = Boolean(assignedVehicleId);
                                    const isPriority = priorityOrderIds.includes(String(order.id));
                                    const rowBg = isPriority ? '#FFFBEB' : (isAssigned ? '#F8FAFC' : '#FFFFFF');
                                    const rowHoverBg = isPriority ? '#FEF3C7' : (isAssigned ? '#F1F5F9' : '#F8FAFC');
                                    const spaceLabel = getOrderSpaceDisplayLabel(order);
                                    const orderCrates = getOrderCrates(order);
                                    return (
                                    <tr 
                                        key={order.id} 
                                        draggable={!readOnly}
                                        onDragStart={(e) => handleDragStart(e, order.id)}
                                        style={{ 
                                            backgroundColor: rowBg,
                                            cursor: readOnly ? 'default' : 'grab'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = rowHoverBg}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = rowBg}
                                    >
                                        <td style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid #E2E8F0', borderLeft: isAssigned ? '3px solid #10B981' : '3px solid transparent', verticalAlign: 'top' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    disabled={readOnly}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        togglePriorityOrder(String(order.id));
                                                    }}
                                                    title={isPriority ? 'Quitar prioridad de salida temprana' : 'Marcar como pedido prioritario (1-2 por camión)'}
                                                    aria-label={isPriority ? 'Quitar prioridad' : 'Marcar como prioritario'}
                                                    style={{
                                                        width: '22px',
                                                        height: '22px',
                                                        borderRadius: '6px',
                                                        border: `1px solid ${isPriority ? '#F59E0B' : '#CBD5E1'}`,
                                                        backgroundColor: isPriority ? '#FEF3C7' : '#FFFFFF',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: readOnly ? 'default' : 'pointer',
                                                        flexShrink: 0,
                                                        padding: 0
                                                    }}
                                                >
                                                    <Star
                                                        size={12}
                                                        fill={isPriority ? '#F59E0B' : 'none'}
                                                        stroke={isPriority ? '#B45309' : '#94A3B8'}
                                                        strokeWidth={2}
                                                    />
                                                </button>
                                                <div style={{ 
                                                    width: '24px', height: '22px', borderRadius: '6px', 
                                                    backgroundColor: order.is_b2b ? '#E0F2FE' : '#F1F5F9', 
                                                    color: order.is_b2b ? '#0369A1' : '#334155', 
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: '900', fontSize: '0.58rem', border: `1px solid ${order.is_b2b ? '#BAE6FD' : '#CBD5E1'}`,
                                                    flexShrink: 0
                                                }}>
                                                    {order.is_b2b ? 'B2B' : 'B2C'}
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.45rem', borderBottom: '1px solid #E2E8F0', maxWidth: '260px', verticalAlign: 'top' }}>
                                            <div className="line-clamp-2" style={{ fontWeight: '800', color: isAssigned ? '#334155' : '#0F172A', lineHeight: 1.25 }}>
                                                {order.customer_name}
                                            </div>
                                            <div style={{ fontSize: '0.60rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '2px' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}><MapPin size={10} strokeWidth={1.5} /> {order.address}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                                {assignedVehicle && (
                                                    <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.58rem', fontWeight: '800', color: '#FFFFFF', backgroundColor: '#1E3A5F', padding: '1px 5px', borderRadius: '4px' }}>
                                                        {assignedVehicle.plate}
                                                    </span>
                                                )}
                                                {spaceLabel && (
                                                    <span style={{ fontSize: '0.56rem', fontWeight: '900', color: '#0369A1', backgroundColor: '#E0F2FE', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px' }}>
                                                        ESP {spaceLabel}
                                                    </span>
                                                )}
                                                <span style={{
                                                    fontSize: '0.56rem',
                                                    fontWeight: '800',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '3px',
                                                    backgroundColor: order.slot_type === 'manual' ? '#EFF6FF' : order.slot_type === 'profile' ? '#ECFDF5' : '#F8FAFC',
                                                    color: order.slot_type === 'manual' ? '#1D4ED8' : order.slot_type === 'profile' ? '#065F46' : '#475569',
                                                    border: `1px solid ${order.slot_type === 'manual' ? '#BFDBFE' : order.slot_type === 'profile' ? '#A7F3D0' : '#E2E8F0'}`
                                                }}>
                                                    <Clock size={9} strokeWidth={2} /> {order.display_slot}
                                                </span>
                                                {!order.is_b2b && order.payment_method === 'contra_entrega' && order.payment_status !== 'Pagado' && (
                                                    <span style={{ fontSize: '0.56rem', fontWeight: '800', color: '#B45309', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '1px 5px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                        <Coins size={8} strokeWidth={2} /> Por Cobrar
                                                    </span>
                                                )}
                                                {order.novedad && (
                                                    <span title={order.novedad} style={{ fontSize: '0.56rem', fontWeight: '800', color: '#475569', backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', padding: '1px 4px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '2px', cursor: 'help' }}>
                                                        <MessageSquare size={9} strokeWidth={2} /> Nota
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.65rem', borderBottom: '1px solid #E2E8F0', textAlign: 'right', verticalAlign: 'top', fontVariantNumeric: 'tabular-nums' }}>
                                            <div style={{ fontWeight: '900', color: '#0F172A' }}>{formatNumber(order.total_weight_kg, 1)} <span style={{fontSize:'0.55rem', color:'#64748B'}}>kg</span></div>
                                            <div style={{ fontSize: '0.58rem', color: '#0D7A57', fontWeight: '800', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '2px' }}>
                                                <Package size={10} /> {orderCrates} can.
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

            </div>

            {/* Planning Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative', minWidth: 0 }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '0.65rem 0.9rem',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#0F172A' }}>FLOTA Y RUTAS</h3>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#F1F5F9', color: '#334155', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '800', border: '1px solid #E2E8F0' }}>
                            {Object.values(assignments).reduce((acc, curr) => acc + curr.length, 0)} ASIGNADOS
                        </span>
                        {/* Segmented Toggle: Entrega 1->N vs Cargue LIFO */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: '8px', padding: '2px', border: '1px solid #E2E8F0' }}>
                            <button
                                type="button"
                                onClick={() => setRouteViewMode('delivery')}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.64rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    backgroundColor: routeViewMode === 'delivery' ? '#1E3A5F' : 'transparent',
                                    color: routeViewMode === 'delivery' ? '#FFFFFF' : '#475569'
                                }}
                                title="Ver paradas en orden de entrega (1ra parada arriba)"
                            >
                                Entrega 1→N
                            </button>
                            <button
                                type="button"
                                onClick={() => setRouteViewMode('lifo')}
                                style={{
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.64rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    backgroundColor: routeViewMode === 'lifo' ? '#0D7A57' : 'transparent',
                                    color: routeViewMode === 'lifo' ? '#FFFFFF' : '#475569',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px'
                                }}
                                title="Ver orden físico de cargue LIFO en muelle (Fondo → Puerta)"
                            >
                                <ArrowDownUp size={10} /> Cargue LIFO
                            </button>
                        </div>
                    </div>
                    {!readOnly && (
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button 
                                onClick={() => setShowSettings(!showSettings)}
                                title="Ajustes de Optimización"
                                style={{ 
                                    backgroundColor: showSettings ? '#E5E7EB' : '#F3F4F6', 
                                    border: '1px solid #E5E7EB', 
                                    borderRadius: '8px', 
                                    padding: '0.4rem 0.6rem', 
                                    fontSize: '0.75rem', 
                                    color: '#4B5563', 
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#E5E7EB'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                            >
                                <Settings size={14} />
                            </button>
                        <button 
                            onClick={handleAutoOptimize}
                            disabled={optimizing}
                            style={{ 
                                padding: '0.4rem 1.0rem', 
                                borderRadius: '8px', 
                                backgroundColor: optimizing ? '#94A3B8' : '#1E3A5F', 
                                color: 'white', 
                                border: 'none', 
                                fontWeight: '800', 
                                cursor: optimizing ? 'not-allowed' : 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.35rem',
                                fontSize: '0.74rem',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            {optimizing ? 'Optimizando...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12} strokeWidth={1.8} /> Auto-Asignar</span>}
                        </button>
                        {(() => {
                            const totalAssigned = Object.values(assignments).reduce((s, l) => s + l.length, 0);
                            if (optimizationSource === 'google') {
                                return (
                                    <span style={{
                                        padding: '0.32rem 0.65rem',
                                        borderRadius: '8px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        backgroundColor: '#ECFDF5',
                                        color: '#065F46',
                                        border: '1px solid #A7F3D0',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Navigation size={11} />
                                        Google Tráfico Real
                                        {theoreticalMetrics ? ` · ${formatNumber(theoreticalMetrics.distance_km, 0)} km · ${Math.round(theoreticalMetrics.duration_min)} min` : ''}
                                    </span>
                                );
                            }
                            if (optimizationSource === 'simulation') {
                                return (
                                    <span
                                        title="Distancias estimadas en línea recta; verificar ETAs manualmente"
                                        style={{
                                            padding: '0.32rem 0.65rem',
                                            borderRadius: '8px',
                                            fontSize: '0.68rem',
                                            fontWeight: '800',
                                            backgroundColor: '#FFFBEB',
                                            color: '#92400E',
                                            border: '1px solid #FDE68A',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: 'help'
                                        }}
                                    >
                                        <AlertTriangle size={11} /> Motor Local (Sin tráfico Google)
                                    </span>
                                );
                            }
                            if (!isOptimized && totalAssigned > 0) {
                                return (
                                    <span style={{
                                        padding: '0.32rem 0.65rem',
                                        borderRadius: '8px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        backgroundColor: '#F1F5F9',
                                        color: '#334155',
                                        border: '1px solid #CBD5E1',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}>
                                        <Sliders size={11} /> Ajustado manualmente
                                    </span>
                                );
                            }
                            return null;
                        })()}
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button 
                                onClick={() => setShowPreConfirm(true)}
                                disabled={loading}
                                style={{ 
                                    padding: '0.4rem 1.0rem', 
                                    borderRadius: '8px', 
                                    backgroundColor: '#0D7A57', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    fontSize: '0.74rem',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={12} strokeWidth={2} /> Confirmar</span>
                            </button>
                        )}
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button
                                onClick={() => {
                                    if (confirm('¿Seguro que quieres limpiar todas las asignaciones? Los pedidos volverán al tablero sin asignar.')) {
                                        try { localStorage.removeItem('frufresco_route_planner_draft'); } catch (_) {}
                                        setAssignments({});
                                        setPriorityOrderIds([]);
                                        setIsOptimized(false);
                                        setOptimizationSource(null);
                                        setTheoreticalMetrics(null);
                                        setStopEtas({});
                                        setRouteStartTimes({});
                                    }
                                }}
                                style={{ 
                                    padding: '0.4rem 1rem', 
                                    borderRadius: '8px', 
                                    backgroundColor: 'transparent',
                                    color: '#EF4444',
                                    border: '1px solid #EF4444',
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#FEE2E2';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Trash2 size={12} strokeWidth={1.5} /> Limpiar</span>
                            </button>
                        )}
                        </div>
                    )}
                </div>

                {/* Alertas de error en tiempo real sin modal bloqueante */}
                {(optimizationError || confirmationError) && (
                    <div style={{
                        marginTop: '0.65rem',
                        marginBottom: '0.5rem',
                        backgroundColor: '#FEE2E2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '8px',
                        padding: '0.5rem 0.85rem',
                        color: '#991B1B',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <AlertTriangle size={14} />
                            <span>{optimizationError ? `Error de Optimización: ${optimizationError}` : `Error al Confirmar: ${confirmationError}`}</span>
                        </div>
                        <button
                            type="button"
                            onClick={() => { setOptimizationError(null); setConfirmationError(null); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: 0 }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* Settings Drawer */}
                {showSettings && (
                    <div 
                        style={{ 
                            position: 'fixed', 
                            top: 0, 
                            left: 0, 
                            width: '100vw', 
                            height: '100vh', 
                            backgroundColor: 'rgba(15, 23, 42, 0.3)', 
                            backdropFilter: 'blur(5px)', 
                            zIndex: 1000, 
                            display: 'flex',
                            justifyContent: 'flex-end',
                            animation: 'fadeInPlanner 0.25s ease-out'
                        }}
                        onClick={() => setShowSettings(false)}
                    >
                        <style>{`
                            @keyframes fadeInPlanner {
                                from { opacity: 0; }
                                to { opacity: 1; }
                            }
                            @keyframes slideInRightPlanner {
                                from { transform: translateX(100%); }
                                to { transform: translateX(0); }
                            }
                        `}</style>
                        <div 
                            style={{ 
                                width: '380px',
                                maxWidth: '85vw',
                                height: '100%', 
                                backgroundColor: 'white', 
                                padding: '2rem 1.5rem', 
                                boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.15)', 
                                display: 'flex',
                                flexDirection: 'column',
                                overflowY: 'auto',
                                animation: 'slideInRightPlanner 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                                cursor: 'default'
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', alignItems: 'center' }}>
                                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#111827', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Settings size={18} color="#4F46E5" /> Ajustes del Optimizador
                                </h4>
                                <button 
                                    onClick={() => setShowSettings(false)} 
                                    style={{ 
                                        border: 'none', 
                                        background: '#F3F4F6', 
                                        cursor: 'pointer', 
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#4B5563',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#E5E7EB'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#F3F4F6'}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1 }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Tiempo base de alistamiento (min)</label>

                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.base_setup_time ?? ''} 
                                        onChange={(e) => updateParameter('base_setup_time', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descarga física de 10 canastillas (min)</label>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.time_per_10_crates_unload ?? ''} 
                                        onChange={(e) => updateParameter('time_per_10_crates_unload', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Revisión/Firma de 10 canastillas (min)</label>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.time_per_10_crates_delivery ?? ''} 
                                        onChange={(e) => updateParameter('time_per_10_crates_delivery', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Salida de Flota (Inicio)</label>
                                        <input 
                                            type="time" 
                                            value={params.fleet_start_time || '04:30'} 
                                            onChange={(e) => updateParameter('fleet_start_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.8rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Retorno de Flota (Cierre)</label>
                                        <input 
                                            type="time" 
                                            value={params.fleet_end_time || '19:00'} 
                                            onChange={(e) => updateParameter('fleet_end_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.5rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.8rem' }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Estrategia de Optimización</label>
                                    <select 
                                        value={params.optimization_strategy || 'balanced'} 
                                        onChange={(e) => updateParameter('optimization_strategy', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700', fontSize: '0.8rem', backgroundColor: 'white', cursor: 'pointer' }}
                                    >
                                        <option value="balanced">Balanceada (Recomendado)</option>
                                        <option value="minimize_vehicles">Usar menos camiones (Ahorro)</option>
                                        <option value="minimize_time">Terminar más rápido (Velocidad)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descanso de Conductor (minutos)</label>
                                    <input 
                                        type="text"
                                        inputMode="decimal"
                                        value={params.driver_break_mins ?? ''} 
                                        onChange={(e) => updateParameter('driver_break_mins', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div style={{ padding: '0.5rem 0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.6rem', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#0891B2' }}>kg / Canastilla Promedio</label>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#111827', backgroundColor: '#ECFEFF', padding: '0.2rem 0.6rem', borderRadius: '8px', border: '1px solid #A5F3FC' }}>
                                            {params.avg_kg_per_crate} kg
                                        </span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="25" 
                                        step="0.01"
                                        value={params.avg_kg_per_crate} 
                                        onChange={(e) => updateParameter('avg_kg_per_crate', parseFloat(e.target.value))}
                                        style={{ width: '100%', accentColor: '#0891B2', cursor: 'grab' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.55rem', color: '#94A3B8', fontWeight: '700' }}>
                                        <span>10 kg</span>
                                        <span>12.5 kg (Estándar)</span>
                                        <span>25 kg</span>
                                    </div>
                                </div>
                                <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '1rem', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#10B981', display: 'flex', alignItems: 'center', gap: '6px', letterSpacing: '-0.01em' }}>
                                        <Package size={16} /> Cargue en Bodega (Tiempos)
                                    </span>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Alistamiento Fijo Bodega (min)</label>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={params.warehouse_base_load_time ?? ''} 
                                            onChange={(e) => updateParameter('warehouse_base_load_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Cargue de 10 canastillas (min)</label>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={params.warehouse_time_per_10_crates_load ?? ''} 
                                            onChange={(e) => updateParameter('warehouse_time_per_10_crates_load', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280' }}>Capacidad por Espacio de Alistamiento</label>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#10B981', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '6px', border: '1px solid #A7F3D0' }}>
                                                {params.space_capacity || 36} canastillas
                                            </span>
                                        </div>
                                        <input 
                                            type="text"
                                            inputMode="decimal"
                                            value={params.space_capacity ?? 36} 
                                            onChange={(e) => updateParameter('space_capacity', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                        <span style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px', display: 'block' }}>
                                            Canastillas máximas por bahía en bodega. Si un pedido supera este valor, se le asignan espacios múltiples (ej: 4-5).
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', fontSize: '0.65rem', color: '#64748B', lineHeight: '1.4' }}>
                                Estos valores afectan el cálculo de `service_duration` enviado a Google Maps.
                            </div>
                        </div>
                    </div>
                )}

                {routeViewMode === 'lifo' && (
                    <div style={{
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#065F46',
                        borderRadius: '10px',
                        padding: '0.45rem 0.85rem',
                        fontSize: '0.70rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <ArrowDownUp size={13} />
                            <strong>Vista Cargue LIFO (Fondo → Puerta):</strong> arriba aparece lo que entra primero al fondo del furgón. Cambia a <strong>Entrega 1→N</strong> para reordenar paradas.
                        </span>
                    </div>
                )}

                {(() => {
                    const sortedVehicles = [...vehicles].sort((a, b) => {
                        const aOrders = assignments[a.id] || [];
                        const bOrders = assignments[b.id] || [];
                        if (aOrders.length > 0 && bOrders.length === 0) return -1;
                        if (bOrders.length > 0 && aOrders.length === 0) return 1;
                        if (aOrders.length > 0 && bOrders.length > 0) {
                            const getFirstOrderMin = (vId: string) => {
                                const firstOrderId = assignments[vId][0];
                                const order = orders.find(o => o.id === firstOrderId);
                                if (order && order.display_slot && order.display_slot !== 'Flexible') {
                                    const startTimeStr = order.display_slot.split(' - ')[0];
                                    const [h, m] = startTimeStr.split(':').map(Number);
                                    return h * 60 + m;
                                }
                                return 9999;
                            };
                            const minA = getFirstOrderMin(a.id);
                            const minB = getFirstOrderMin(b.id);
                            if (minA !== minB) return minA - minB;
                        }
                        return a.plate.localeCompare(b.plate);
                    });

                    const activeVehiclesList = sortedVehicles.filter(v => (assignments[v.id] || []).length > 0);
                    const idleVehiclesList = sortedVehicles.filter(v => (assignments[v.id] || []).length === 0);
                    const vehiclesToRenderMain = activeVehiclesList.length > 0 ? activeVehiclesList : sortedVehicles;

                    return (
                        <>
                            <div className="rp-fleet-grid">
                                {vehiclesToRenderMain.map(vehicle => {
                                    const load = getVehicleLoad(vehicle.id);
                                    const cratesNeeded = getVehicleCrates(vehicle.id);
                                    const kgProgress = vehicle.capacity_kg > 0 ? (load / vehicle.capacity_kg) * 100 : 0;
                                    const crateProgress = vehicle.max_crates_capacity > 0 ? (cratesNeeded / vehicle.max_crates_capacity) * 100 : 0;

                                    const assignedOrders = assignments[vehicle.id] || [];
                                    const priorityInTruck = assignedOrders.filter(oid => priorityOrderIds.includes(String(oid))).length;
                                    const isKgOverloaded = load > vehicle.capacity_kg;
                                    const isCrateOverloaded = vehicle.max_crates_capacity > 0 && cratesNeeded > vehicle.max_crates_capacity;
                                    const isOverloaded = isKgOverloaded || isCrateOverloaded;
                                    const isDragOver = dragOverVehicleId === vehicle.id;

                                    const displayOrders = routeViewMode === 'lifo' ? [...assignedOrders].reverse() : assignedOrders;

                                    return (
                                        <div 
                                            key={vehicle.id} 
                                            onDragOver={(e) => { e.preventDefault(); setDragOverVehicleId(vehicle.id); }}
                                            onDragLeave={() => setDragOverVehicleId(null)}
                                            onDrop={(e) => {
                                                handleDropOnVehicle(e, vehicle.id);
                                                setDragOverVehicleId(null);
                                            }}
                                            style={{ 
                                                backgroundColor: '#FFFFFF', 
                                                borderRadius: '16px', 
                                                border: isDragOver
                                                    ? '2px dashed #0D7A57'
                                                    : (isOverloaded ? '2px solid #EF4444' : '1px solid #E2E8F0'), 
                                                padding: '0.9rem',
                                                boxShadow: isDragOver 
                                                    ? '0 10px 15px -3px rgba(13,122,87,0.12)' 
                                                    : '0 2px 6px rgba(15,23,42,0.04)',
                                                transition: 'all 0.15s'
                                            }}
                                        >
                                            {/* Vehicle Card Header (2 clean rows) */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: '900', fontSize: '1.1rem', color: '#0F172A', letterSpacing: '-0.02em', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                                                {vehicle.plate}
                                                            </span>
                                                            <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#334155', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', padding: '1px 6px', borderRadius: '9999px' }}>
                                                                {assignedOrders.length} parada{assignedOrders.length === 1 ? '' : 's'}
                                                            </span>
                                                            {priorityInTruck > 0 && (
                                                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#B45309', backgroundColor: '#FEF3C7', border: '1px solid #F59E0B', padding: '1px 6px', borderRadius: '9999px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                    <Star size={10} fill="#F59E0B" stroke="#B45309" strokeWidth={2} /> {priorityInTruck}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: vehicle.driver_name !== 'Sin Asignar' ? '#475569' : '#94A3B8', fontWeight: '700', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={vehicle.driver_name}>
                                                            {vehicle.driver_name}
                                                        </div>
                                                    </div>
                                                    {assignedOrders.length > 0 && (() => {
                                                        const { loadStart, departure } = getEstimatedTimesForVehicle(vehicle.id, cratesNeeded);
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                                                                <span style={{ fontSize: '0.60rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#065F46', padding: '2px 6px', borderRadius: '6px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                                                                    Cargue {loadStart} → Salida {departure}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {/* Dual Capacity Progress Bars */}
                                                <div className="rp-dual-bars" style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.5rem' }}>
                                                    <div style={{ backgroundColor: isKgOverloaded ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${isKgOverloaded ? '#FECACA' : '#E2E8F0'}`, borderRadius: '8px', padding: '4px 7px' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: '800', color: isKgOverloaded ? '#DC2626' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: isKgOverloaded ? '#DC2626' : '#0D7A57' }}>
                                                                <Scale size={10} /> {formatNumber(load, 1)} / {formatNumber(vehicle.capacity_kg, 0)} kg
                                                            </span>
                                                            <span style={{ color: '#64748B' }}>{Math.round(kgProgress)}%</span>
                                                        </div>
                                                        <div style={{ height: '4px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginTop: '3px' }}>
                                                            <div style={{ width: `${Math.min(kgProgress, 100)}%`, height: '100%', backgroundColor: isKgOverloaded ? '#EF4444' : kgProgress > 85 ? '#F59E0B' : '#0D7A57' }} />
                                                        </div>
                                                    </div>
                                                    {vehicle.max_crates_capacity > 0 && (
                                                        <div style={{ backgroundColor: isCrateOverloaded ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${isCrateOverloaded ? '#FECACA' : '#E2E8F0'}`, borderRadius: '8px', padding: '4px 7px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', fontWeight: '800', color: isCrateOverloaded ? '#DC2626' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: isCrateOverloaded ? '#DC2626' : '#1E3A5F' }}>
                                                                    <Package size={10} /> {cratesNeeded} / {vehicle.max_crates_capacity} can.
                                                                </span>
                                                                <span style={{ color: '#64748B' }}>{Math.round(crateProgress)}%</span>
                                                            </div>
                                                            <div style={{ height: '4px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden', marginTop: '3px' }}>
                                                                <div style={{ width: `${Math.min(crateProgress, 100)}%`, height: '100%', backgroundColor: isCrateOverloaded ? '#EF4444' : crateProgress > 85 ? '#F59E0B' : '#1E3A5F' }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Stop List */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                                {assignedOrders.length === 0 ? (
                                                    <div style={{ 
                                                        padding: '1.25rem', 
                                                        border: '2px dashed #E2E8F0', 
                                                        borderRadius: '12px', 
                                                        textAlign: 'center', 
                                                        color: '#94A3B8', 
                                                        fontSize: '0.75rem',
                                                        backgroundColor: '#F8FAFC'
                                                    }}>
                                                        Arrastra pedidos aquí...
                                                    </div>
                                                ) : (
                                                    displayOrders.map((oid, visualIdx) => {
                                                        const order = orders.find(o => o.id === oid);
                                                        const realStopIndex = routeViewMode === 'lifo' ? (assignedOrders.length - 1 - visualIdx) : visualIdx;
                                                        const stopNumber = realStopIndex + 1;
                                                        const totalStops = assignedOrders.length;
                                                        const loadSequence = totalStops - realStopIndex;
                                                        const isPriority = priorityOrderIds.includes(String(oid));
                                                        const orderCrates = getOrderCrates(order);
                                                        const spaceLabel = order ? getOrderSpaceDisplayLabel(order) : '';
                                                        const etaStr = stopEtas[oid];

                                                        return (
                                                            <div 
                                                                key={oid} 
                                                                draggable={!readOnly && routeViewMode === 'delivery'}
                                                                onDragStart={(e) => handleDragStart(e, oid, vehicle.id, realStopIndex)}
                                                                onDragOver={handleDragOver}
                                                                onDrop={(e) => {
                                                                    e.stopPropagation();
                                                                    if (routeViewMode === 'delivery') {
                                                                        handleDropOnVehicle(e, vehicle.id, realStopIndex);
                                                                    }
                                                                }}
                                                                style={{ 
                                                                    padding: '0.55rem 0.65rem', 
                                                                    backgroundColor: isPriority ? '#FFFBEB' : '#FFFFFF', 
                                                                    borderRadius: '10px', 
                                                                    display: 'flex', 
                                                                    alignItems: 'flex-start',
                                                                    gap: '0.55rem',
                                                                    border: isPriority ? '1px solid #F59E0B' : '1px solid #E2E8F0',
                                                                    cursor: (!readOnly && routeViewMode === 'delivery') ? 'grab' : 'default'
                                                                }}
                                                            >
                                                                {/* Square Monospace Sequence Badge */}
                                                                <div style={{
                                                                    minWidth: '26px',
                                                                    height: '26px',
                                                                    borderRadius: '7px',
                                                                    backgroundColor: isPriority ? '#D97706' : '#1E3A5F',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    color: '#FFFFFF',
                                                                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                                                    fontWeight: '900',
                                                                    fontSize: '0.70rem',
                                                                    flexShrink: 0,
                                                                    marginTop: '1px'
                                                                }}>
                                                                    #{stopNumber}
                                                                </div>

                                                                {/* 2-Line Stop Content */}
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                                                        {isPriority && (
                                                                            <Star size={12} fill="#F59E0B" stroke="#B45309" strokeWidth={2} style={{ flexShrink: 0, marginTop: '2px' }} />
                                                                        )}
                                                                        <div className="line-clamp-2" style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0F172A', lineHeight: 1.25 }}>
                                                                            {order?.customer_name || 'Cliente'}
                                                                        </div>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {etaStr && (
                                                                            <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.58rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                ETA {etaStr}
                                                                            </span>
                                                                        )}
                                                                        {order?.display_slot && order.display_slot !== 'Flexible' && (
                                                                            <span style={{ fontSize: '0.58rem', fontWeight: '800', backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                {order.display_slot}
                                                                            </span>
                                                                        )}
                                                                        {spaceLabel && (
                                                                            <span style={{ fontSize: '0.58rem', fontWeight: '900', color: '#0369A1', backgroundColor: '#E0F2FE', border: '1px solid #BAE6FD', padding: '1px 5px', borderRadius: '4px' }}>
                                                                                ESP {spaceLabel}
                                                                            </span>
                                                                        )}
                                                                        <span style={{ fontSize: '0.60rem', color: '#475569', fontWeight: '700' }}>
                                                                            {formatNumber(order?.total_weight_kg || 0, 1)} kg · {orderCrates} can.
                                                                        </span>
                                                                        <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.56rem', fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', padding: '1px 4px', borderRadius: '4px' }}>
                                                                            {loadSequence === 1 ? 'Carga #1 (Fondo)' : `Carga #${loadSequence}`}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {!readOnly && (
                                                                    <button
                                                                        type="button"
                                                                        title="Quitar pedido del camión"
                                                                        aria-label="Quitar pedido del camión"
                                                                        style={{ 
                                                                            cursor: 'pointer', 
                                                                            color: '#EF4444',
                                                                            backgroundColor: '#FEF2F2',
                                                                            border: '1px solid #FECACA',
                                                                            padding: '3px',
                                                                            borderRadius: '6px',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            flexShrink: 0
                                                                        }} 
                                                                        onClick={() => toggleAssignment(oid, vehicle.id)}
                                                                    >
                                                                        <X size={12} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {activeVehiclesList.length > 0 && idleVehiclesList.length > 0 && (
                                <div style={{
                                    marginTop: '0.5rem',
                                    backgroundColor: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '14px',
                                    padding: '0.75rem 0.9rem'
                                }}>
                                    <div style={{ fontSize: '0.70rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                                        Flota Disponible Sin Asignar ({idleVehiclesList.length})
                                    </div>
                                    <div className="rp-idle-grid">
                                        {idleVehiclesList.map(vehicle => {
                                            const isDragOver = dragOverVehicleId === vehicle.id;
                                            return (
                                                <div
                                                    key={vehicle.id}
                                                    onDragOver={(e) => { e.preventDefault(); setDragOverVehicleId(vehicle.id); }}
                                                    onDragLeave={() => setDragOverVehicleId(null)}
                                                    onDrop={(e) => {
                                                        handleDropOnVehicle(e, vehicle.id);
                                                        setDragOverVehicleId(null);
                                                    }}
                                                    style={{
                                                        backgroundColor: '#FFFFFF',
                                                        border: isDragOver ? '2px dashed #0D7A57' : '1px dashed #CBD5E1',
                                                        borderRadius: '10px',
                                                        padding: '0.55rem 0.75rem',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: '8px'
                                                    }}
                                                >
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: '900', fontSize: '0.82rem', color: '#0F172A', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                                                            {vehicle.plate}
                                                        </div>
                                                        <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {vehicle.driver_name}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: '#475569', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                        <div>{formatNumber(vehicle.capacity_kg, 0)} kg</div>
                                                        {vehicle.max_crates_capacity > 0 && (
                                                            <div style={{ color: '#64748B' }}>{vehicle.max_crates_capacity} can.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </>
                    );
                })()}
            </div>
            {/* Inject keyframes dynamically */}
            <style>{`
                .rp-layout {
                    max-width: 1600px;
                    margin: 0 auto;
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1.25rem;
                    align-items: start;
                }
                @media (min-width: 1024px) {
                    .rp-layout {
                        grid-template-columns: 420px minmax(0, 1fr);
                    }
                    .rp-sidebar {
                        position: sticky;
                        top: 136px;
                        max-height: calc(100vh - 152px);
                    }
                }
                .rp-fleet-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 1rem;
                    align-items: start;
                }
                @media (min-width: 768px) {
                    .rp-fleet-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (min-width: 1520px) {
                    .rp-fleet-grid {
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                    }
                }
                .rp-dual-bars {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 0.5rem;
                }
                .rp-idle-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 0.65rem;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { transform: translate(-50%, -50%) scale(0.95); opacity: 0.8; }
                    50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            {optimizing && (
                <OptimizingModal />
            )}

            {showAiModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(6px)',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2rem',
                    fontFamily: 'Inter, system-ui, sans-serif'
                }} onClick={() => setShowAiModal(false)}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '24px',
                        width: '100%',
                        maxWidth: '600px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid #F1F5F9',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        maxHeight: '85vh',
                        animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} onClick={(e) => e.stopPropagation()}>
                        {/* Header */}
                        <div style={{
                            padding: '1.5rem 2rem',
                            borderBottom: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            background: 'linear-gradient(to right, #FAF5FF, #EEF2FF)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <Bot size={22} color="#4F46E5" />
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1E1B4B' }}>
                                    Justificación de Ruteo IA
                                </h3>
                            </div>
                            <button 
                                onClick={() => setShowAiModal(false)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    color: '#94A3B8',
                                    cursor: 'pointer',
                                    padding: '0.25rem',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'background-color 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Content */}
                        <div style={{
                            padding: '2rem',
                            overflowY: 'auto',
                            color: '#334155',
                            fontSize: '0.925rem',
                            lineHeight: '1.6'
                        }}>
                            {renderAiReport(aiReportText)}
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '1.25rem 2rem',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            backgroundColor: '#F8FAFC'
                        }}>
                            <button
                                onClick={() => setShowAiModal(false)}
                                style={{
                                    padding: '0.75rem 2rem',
                                    backgroundColor: '#4F46E5',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '12px',
                                    fontSize: '0.875rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#4338CA';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#4F46E5';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                Entendido, ver mapa
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showPreConfirm && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, padding: '2rem'
                }} onClick={() => setShowPreConfirm(false)}>
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '30px',
                        width: '95%', maxWidth: '700px', maxHeight: '90vh',
                        padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        display: 'flex', flexDirection: 'column', gap: '1.5rem',
                        position: 'relative', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6366F1' }}></div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>TOMA DE DECISIONES / LOGÍSTICA</span>
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1E293B', letterSpacing: '-0.02em' }}>
                                    Confirmar Lanzamiento de Despacho
                                </h2>
                            </div>
                            <button
                                onClick={() => setShowPreConfirm(false)}
                                style={{
                                    background: '#F1F5F9', border: 'none', width: '32px', height: '32px',
                                    borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontWeight: 'bold', color: '#64748B'
                                }}
                            ><X size={16} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingRight: '0.5rem' }}>
                            <div style={{
                                backgroundColor: '#EEF2F6', borderRadius: '16px', padding: '1.25rem',
                                borderLeft: '4px solid #6366F1', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                            }}>
                                <span style={{ fontWeight: '800', fontSize: '0.85rem', color: '#1E293B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <AlertTriangle size={16} color="#D97706" /> ¿Qué sucederá al confirmar?
                                </span>
                                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#475569', lineHeight: '1.6' }}>
                                    <li>Los pedidos asignados cambiarán su estado a <strong>Aprobado (approved)</strong>.</li>
                                    <li>Se consolidarán las cantidades netas y se iniciará la planeación en el portal de <strong>Compras / Abastecimiento</strong>.</li>
                                    <li>Se asignarán los espacios físicos y la secuencia de cargue de bodega para los camiones.</li>
                                    <li>Las rutas se publicarán y enviarán inmediatamente al equipo de operarios en <strong>Picking / Alistamiento</strong>.</li>
                                </ul>
                            </div>

                            {/* Indicadores en Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', marginBottom: '4px' }}>RUTAS A CREAR</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>
                                        {Object.keys(assignments).filter(k => assignments[k].length > 0).length}
                                    </div>
                                </div>
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', marginBottom: '4px' }}>PEDIDOS ASIGNADOS</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>
                                        {Object.values(assignments).reduce((sum, list) => sum + list.length, 0)}
                                    </div>
                                </div>
                                <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', marginBottom: '4px' }}>PESO TOTAL</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>
                                        {formatNumber(Object.keys(assignments).reduce((sum, vid) => {
                                            const oIds = assignments[vid] || [];
                                            const weight = orders.filter(o => oIds.includes(o.id)).reduce((wSum, o) => wSum + o.total_weight_kg, 0);
                                            return sum + weight;
                                        }, 0), 1)} kg
                                    </div>
                                </div>
                            </div>

                            {/* Resumen detallado por vehículo */}
                            <div>
                                <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: '800', color: '#0F172A' }}>Resumen de Carga por Vehículo</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {Object.keys(assignments).filter(vid => assignments[vid].length > 0).map((vid) => {
                                        const vehicle = vehicles.find(v => v.id === vid);
                                        const orderIds = assignments[vid] || [];
                                        const routeOrders = orders.filter(o => orderIds.includes(o.id));
                                        const totalWeight = routeOrders.reduce((wSum, o) => wSum + o.total_weight_kg, 0);
                                        const totalCrates = getVehicleCrates(vid);
                                        
                                        // Porcentaje de capacidad
                                        const capPct = vehicle?.capacity_kg ? Math.round((totalWeight / vehicle.capacity_kg) * 100) : 0;
                                        
                                        return (
                                            <div key={vid} style={{
                                                border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem',
                                                backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <span style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Truck size={14} /> {vehicle?.plate || 'Desconocido'}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '8px' }}>({vehicle?.driver_name || 'Sin Asignar'})</span>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.75rem', fontWeight: '800',
                                                        color: capPct > 95 ? '#EF4444' : capPct > 75 ? '#F59E0B' : '#10B981'
                                                    }}>
                                                        {capPct}% Capacidad ({formatNumber(totalWeight, 1)} kg / {formatNumber(vehicle?.capacity_kg || 0, 0)} kg)
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', gap: '1rem' }}>
                                                    <span><strong>Pedidos:</strong> {orderIds.length}</span>
                                                    <span><strong>Canastillas:</strong> {totalCrates}</span>
                                                </div>
                                                {(() => {
                                                    const { loadStart, departure, duration } = getEstimatedTimesForVehicle(vid, totalCrates);
                                                    return (
                                                        <div style={{
                                                            fontSize: '0.72rem', color: '#0F172A', backgroundColor: '#F0FDF4',
                                                            padding: '6px 12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between',
                                                            border: '1px solid #DCFCE7', marginTop: '0.25rem', fontWeight: '500'
                                                        }}>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> <strong>Inicio Cargue:</strong> {loadStart} <span style={{color: '#64748B', fontWeight: 'normal'}}>({duration} min)</span></span>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Truck size={12} /> <strong>Salida Ruta:</strong> {departure}</span>
                                                        </div>
                                                    );
                                                })()}
                                                <div style={{
                                                    fontSize: '0.7rem', color: '#64748B',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    backgroundColor: '#F8FAFC', padding: '4px 8px', borderRadius: '8px',
                                                    border: '1px dashed #E2E8F0'
                                                }}>
                                                    <strong>Clientes:</strong> {routeOrders.map(o => o.customer_name).join(', ')}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Botones de acción */}
                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', borderTop: '1px solid #F1F5F9', paddingTop: '1.25rem' }}>
                            <button
                                onClick={() => setShowPreConfirm(false)}
                                style={{
                                    padding: '0.6rem 1.25rem', borderRadius: '10px',
                                    backgroundColor: 'transparent', border: '1px solid #CBD5E1',
                                    color: '#475569', fontWeight: '800', fontSize: '0.8rem',
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                                Regresar al Planeador
                            </button>
                            <button
                                onClick={async () => {
                                    setShowPreConfirm(false);
                                    await handleConfirmRoutes();
                                }}
                                style={{
                                    padding: '0.6rem 1.5rem', borderRadius: '10px',
                                    backgroundColor: '#10B981', border: 'none',
                                    color: 'white', fontWeight: '800', fontSize: '0.8rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.25)',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#059669';
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#10B981';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                            >
                                <Check size={14} strokeWidth={2} /> Confirmar y Lanzar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {confirmedManifest && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(12px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 2000, padding: '2rem'
                }} onClick={() => setConfirmedManifest(null)}>
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '30px',
                        width: '95%', maxWidth: '750px', maxHeight: '90vh',
                        padding: '2.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
                        display: 'flex', flexDirection: 'column', gap: '1.5rem',
                        position: 'relative', overflow: 'hidden'
                    }} onClick={e => e.stopPropagation()}>
                        
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }}></div>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>DESPACHO / PLAN DE RUTAS</span>
                                </div>
                                <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: '900', color: '#1E293B', letterSpacing: '-0.02em' }}>
                                    Manifiesto de Despacho Confirmado
                                </h2>
                            </div>
                            <button
                                onClick={() => setConfirmedManifest(null)}
                                style={{
                                    background: '#F1F5F9', border: 'none', width: '32px', height: '32px',
                                    borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontWeight: 'bold', color: '#64748B'
                                }}
                            ><X size={16} /></button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }} className="print-area">
                            <div style={{ fontSize: '0.85rem', color: '#475569', lineHeight: '1.5' }}>
                                Las rutas han sido generadas y enviadas al equipo de alistamiento de bodega (Picking) con éxito. A continuación el resumen para el operador de transporte:
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {confirmedManifest.map((route: any, idx: number) => (
                                    <div key={idx} style={{
                                        border: '1px solid #E2E8F0', borderRadius: '16px',
                                        padding: '1.25rem', backgroundColor: '#F8FAFC',
                                        display: 'flex', flexDirection: 'column', gap: '1rem'
                                    }}>
                                        <div style={{
                                            display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '1rem',
                                            alignItems: 'center', borderBottom: route.stops && route.stops.length > 0 ? '1px solid #F1F5F9' : 'none',
                                            paddingBottom: route.stops && route.stops.length > 0 ? '0.75rem' : 0
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                    <Truck size={14} /> {route.vehicle_plate}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', marginTop: '2px' }}>Conductor: {route.driver_name}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '800' }}>ENTREGAS / PESO</div>
                                                <div style={{ fontWeight: '800', color: '#1E293B', fontSize: '0.85rem', marginTop: '2px' }}>{route.stops_count} entregas • {formatNumber(route.total_kilos || 0, 1)} kg</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '800' }}>ESPACIOS BODEGA</div>
                                                <div style={{ fontWeight: '900', color: '#0EA5E9', fontSize: '0.85rem', marginTop: '2px' }}>
                                                    {route.warehouse_spaces && route.warehouse_spaces.length > 0 
                                                        ? `[${route.warehouse_spaces.join(', ')}]` 
                                                        : 'Por asignar'}
                                                </div>
                                            </div>
                                        </div>

                                        {route.stops && route.stops.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: '0.25rem' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                                                    Secuencia de Carga y Entrega
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                                    {route.stops.map((stop: any, sIdx: number) => (
                                                        <div key={sIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#334155' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ 
                                                                    backgroundColor: '#E2E8F0', color: '#475569', 
                                                                    fontSize: '0.65rem', fontWeight: '800', 
                                                                    borderRadius: '50%', width: '18px', height: '18px', 
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                                                                }}>{sIdx + 1}</span>
                                                                <span style={{ fontWeight: '700', color: '#1E293B' }}>{stop.customer_name}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{formatNumber(stop.total_weight_kg || 0, 1)} kg ({stop.crates} can.)</span>
                                                                <span style={{ 
                                                                    fontSize: '0.7rem', fontWeight: '850', 
                                                                    backgroundColor: 'rgba(14, 165, 233, 0.08)', color: '#0284C7', 
                                                                    padding: '2px 6px', borderRadius: '4px' 
                                                                }}>
                                                                    {(() => {
                                                                        const label = getOrderSpaceDisplayLabel({ warehouse_spaces: stop.warehouse_spaces, logistics_data: stop.logistics_data });
                                                                        return label ? `ESP ${label}` : (stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? `ESP ${stop.warehouse_spaces.join(', ')}` : 'Sin Espacio');
                                                                    })()}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => {
                                    const dateStr = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
                                    let text = `*MANIFIESTO DE DESPACHO - FRUFRESCO*\n*Fecha:* ${dateStr}\n\n*Rutas Confirmadas:*\n`;
                                    confirmedManifest.forEach((r, i) => {
                                        text += `----------------------------------------\n*${i+1}. Placa:* ${r.vehicle_plate} | *Conductor:* ${r.driver_name}\n*Espacios Bodega:* ${r.warehouse_spaces && r.warehouse_spaces.length > 0 ? r.warehouse_spaces.join(', ') : 'N/A'}\n*Resumen:* ${r.stops_count} entregas • ${formatNumber(r.total_kilos || 0, 1)} kg • Salida: ${r.departure_time || '04:30'}\n\n*Secuencia de Entregas:*\n`;
                                        if (r.stops && r.stops.length > 0) {
                                            r.stops.forEach((stop: any, sIdx: number) => {
                                                const label = getOrderSpaceDisplayLabel({ warehouse_spaces: stop.warehouse_spaces, logistics_data: stop.logistics_data });
                                                text += `  *${sIdx+1}.* *${stop.customer_name}* (${formatNumber(stop.total_weight_kg || 0, 1)} kg) -> Espacios: ${label || (stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? stop.warehouse_spaces.join(', ') : 'N/A')}\n`;
                                            });
                                        } else {
                                            text += `  (No hay detalles de paradas)\n`;
                                        }
                                        text += `\n`;
                                    });
                                    text += `----------------------------------------\n\n_¡Listos para cargar! _`;
                                    
                                    navigator.clipboard.writeText(text);
                                    setCopiedWhatsApp(true);
                                    setTimeout(() => setCopiedWhatsApp(false), 4000);
                                }}
                                style={{
                                    flex: 1, padding: '1rem', borderRadius: '14px',
                                    border: `1px solid ${copiedWhatsApp ? '#A7F3D0' : '#CBD5E1'}`,
                                    backgroundColor: copiedWhatsApp ? '#ECFDF5' : 'white',
                                    color: copiedWhatsApp ? '#065F46' : '#334155',
                                    fontWeight: '800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {copiedWhatsApp ? <CheckCircle2 size={16} strokeWidth={2} color="#059669" /> : <MessageSquare size={16} strokeWidth={2} />}
                                {copiedWhatsApp ? '¡Copiado para WhatsApp!' : 'Copiar WhatsApp'}
                            </button>
                            <button
                                onClick={printManifestViaNewWindow}
                                style={{
                                    flex: 1, padding: '1rem', borderRadius: '14px', border: '1px solid #0EA5E9',
                                    backgroundColor: '#EFF6FF', color: '#0284C7', fontWeight: '800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Printer size={16} strokeWidth={2} /> Imprimir Plan
                            </button>
                            <button
                                onClick={() => setConfirmedManifest(null)}
                                style={{
                                    flex: 1.2, padding: '1rem', borderRadius: '14px', border: 'none',
                                    backgroundColor: '#10B981', color: 'white', fontWeight: '900', cursor: 'pointer',
                                    fontSize: '0.9rem', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                Finalizar
                            </button>
                        </div>
                        {popupBlockedWarning && (
                            <div style={{
                                marginTop: '0.5rem',
                                padding: '0.45rem 0.75rem',
                                borderRadius: '8px',
                                backgroundColor: '#FEE2E2',
                                border: '1px solid #FCA5A5',
                                color: '#991B1B',
                                fontSize: '0.74rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}>
                                <AlertTriangle size={14} />
                                Por favor habilita las ventanas emergentes (popups) en tu navegador para imprimir.
                            </div>
                        )}
                    </div>
                </div>
            )}
            </div>
            <style>{`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-area, .print-area * {
                        visibility: visible;
                    }
                    .print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                }
            `}</style>
        </>
    );
}

function OptimizingModal() {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setElapsed(prev => prev + 1), 1000);
        return () => clearInterval(timer);
    }, []);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontFamily: 'Inter, system-ui, sans-serif'
        }}>
            <div style={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '3rem',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                textAlign: 'center',
                maxWidth: '450px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem'
            }}>
                <div style={{ position: 'relative', width: '80px', height: '80px' }}>
                    <div style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        border: '4px solid rgba(99, 102, 241, 0.15)',
                        borderTop: '4px solid #6366F1',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        animation: 'pulse 1.5s ease-in-out infinite'
                    }}>
                        <Bot size={34} style={{ color: '#818CF8' }} />
                    </div>
                </div>
                <div>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800', background: 'linear-gradient(135deg, #A5B4FC, #818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        Inteligencia Artificial & Google Engine
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#94A3B8', lineHeight: '1.4' }}>
                        Calculando el plan de distribución óptimo...<br/>
                        <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>{mins}:{secs}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
