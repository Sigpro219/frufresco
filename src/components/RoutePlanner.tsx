'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
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
    Users
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

export default function RoutePlanner() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [showAiModal, setShowAiModal] = useState(false);
    const [aiReportText, setAiReportText] = useState('');
    const [debugInfo, setDebugInfo] = useState({ targetDate: '', count: 0, cutoff: false, driversFound: '' });

    const [showSettings, setShowSettings] = useState(false);
    const [params, setParams] = useState<Record<string, any>>({
        b2b_kg_min: 10,
        b2c_kg_min: 5,
        base_setup_time: 4,               // X: Tiempo base alistamiento
        time_per_10_crates_unload: 4,      // Y: Descarga física de 10 canastillas
        time_per_10_crates_delivery: 10,   // Z: Recepción/Revisión de 10 canastillas
        avg_kg_per_crate: 12.5,
        driver_break_mins: 45,
        fleet_start_time: '04:30',
        fleet_end_time: '19:00',
        optimization_strategy: 'balanced'
    });
    const [assignments, setAssignments] = useState<Record<string, string[]>>({}); 
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        fetchInitialData();
        return () => { isMounted.current = false; };
    }, []);

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

            // 2. Fetch Orders (with conditional cutoff)
            const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'enable_cutoff_rules').single();
            const cutoffEnabled = settings?.value !== 'false';


            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
            const targetDate = now.toISOString().split('T')[0];

            let apiUrl = '/api/transport/orders';
            if (cutoffEnabled) {
                apiUrl += `?date=${targetDate}&t=${Date.now()}`;
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
                    targetDate: cutoffEnabled ? targetDate : 'TODOS', 
                    count: (orderData || []).length,
                    cutoff: cutoffEnabled,
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

                // Extraer solo la restricción o comentario omitiendo corchetes de pago y datos básicos de hogar
                let notes = o.admin_notes || '';
                if (notes) {
                    notes = notes.replace(/\[PAGO:.*?\]/gi, '')
                                 .replace(/\[ORIGIN:.*?\]/gi, '')
                                 .replace(/\[CLIENTE HOGAR.*?\]/gi, '')
                                 .replace(/CLIENTE HOGAR.*?(\||\n|$)/gi, '')
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

                if (resolvedIsB2B) {
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
                    slot_type: slotType
                };
            });
            setOrders(mappedOrders);

            // Cargar asignaciones guardadas de localStorage si existen para el día de hoy
            try {
                const savedDataStr = localStorage.getItem('frufresco_route_planner_draft');
                if (savedDataStr) {
                    const savedData = JSON.parse(savedDataStr);
                    if (savedData.targetDate === targetDate) {
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
            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
            const targetDate = now.toISOString().split('T')[0];
            
            const draftData = {
                targetDate,
                assignments,
                isOptimized,
                theoreticalMetrics,
                aiReportText
            };
            localStorage.setItem('frufresco_route_planner_draft', JSON.stringify(draftData));
        } catch (e) {
            console.error("Error al guardar borrador en localStorage:", e);
        }
    }, [assignments, isOptimized, theoreticalMetrics, aiReportText, loading]);

    const handleAutoOptimize = async () => {
        try {
            setOptimizing(true);
            
            const response = await fetch('/api/transport/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orders,
                    vehicles,
                    parameters: params
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `Error en el servidor de optimización (código ${response.status})`);
            }

            const result = await response.json();
            
            if (result.routes) {
                setAssignments(result.routes);
                setIsOptimized(true);
                if (result.theoretical_metrics) {
                    setTheoreticalMetrics(result.theoretical_metrics);
                }
            }

            if (result.explanation) {
                setAiReportText(result.explanation);
                setShowAiModal(true);
            }

        } catch (err: any) {
            console.error('Optimization failed:', err);
            alert(`⚠️ Error de Optimización:\n\n${err.message || 'Ocurrió un error al procesar las rutas.'}`);
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
        try {
            setLoading(true);
            // Construir un mapeo de vehículo -> hora de salida
            const routeStartTimes: Record<string, string> = {};
            Object.keys(assignments).forEach(vehicleId => {
                routeStartTimes[vehicleId] = params.fleet_start_time || '04:30';
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
                    routeStartTimes // Pasar las horas de salida estimadas
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Error al confirmar las rutas en el servidor');
            }

            const result = await response.json();
            
            alert(`✅ ${result.routeConfirmations.length} Rutas confirmadas y enviadas a picking exitosamente.`);
            
            // Limpiar borrador del día al confirmar
            try { localStorage.removeItem('frufresco_route_planner_draft'); } catch (_) {}
            setAssignments({});
            await fetchInitialData();

        } catch (err: any) {
            console.error('Error confirming routes:', err);
            alert(`⚠️ Error al confirmar las rutas:\n${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const getVehicleLoad = (vehicleId: string) => {
        const orderIds = assignments[vehicleId] || [];
        return orders.filter(o => orderIds.includes(o.id)).reduce((sum, o) => sum + o.total_weight_kg, 0);
    };

    const updateParameter = async (id: string, value: any) => {
        setParams({ ...params, [id]: value });
        await supabase.from('logistic_parameters').upsert({ id, value: value.toString() });
    };

    const toggleAssignment = (orderId: string, vehicleId: string) => {
        setIsOptimized(false); // If manual change happens, reset optimized flag
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
    };

    const handleSidebarDrop = (e: React.DragEvent) => {
        e.preventDefault();
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
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>Iniciando motores...</div>;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '650px 1fr', gap: '2rem', height: '100%', minHeight: 0 }}>
            {/* Orders Sidebar */}
            <div 
                onDragOver={(e) => { e.preventDefault(); setDragOverSidebar(true); }}
                onDragLeave={() => setDragOverSidebar(false)}
                onDrop={(e) => { handleSidebarDrop(e); setDragOverSidebar(false); }}
                style={{ 
                    backgroundColor: dragOverSidebar ? '#F5F3FF' : 'white', 
                    borderRadius: '16px', 
                    border: dragOverSidebar ? '2px dashed #6366F1' : '1px solid #E5E7EB', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    overflow: 'hidden',
                    minHeight: 0,
                    transition: 'all 0.2s'
                }}
            >
                <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#1F2937', letterSpacing: '-0.02em' }}>PEDIDOS PICKING</h3>
                            <div style={{ fontSize: '0.62rem', color: '#6B7280', fontWeight: '800', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span><Calendar size={12} strokeWidth={1.5} style={{ marginRight: '4px', verticalAlign: 'middle' }} /> Despacho: {(() => {
                                    const dateStr = debugInfo.targetDate;
                                    if (!dateStr || dateStr === 'TODOS') return 'Todos';
                                    try {
                                        const parts = dateStr.split('-');
                                        const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                                        return date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
                                    } catch {
                                        return dateStr;
                                    }
                                })()}</span>
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
                                    🧺 Canastillas: {orders.reduce((acc, curr) => acc + curr.crates, 0)} und
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
                        <span style={{ fontSize: '0.62rem', backgroundColor: '#EDE9FE', color: '#6D28D9', padding: '0.25rem 0.6rem', borderRadius: '20px', fontWeight: '800', border: '1px solid #DDD6FE' }}>
                            {orders.length} pedidos disponibles
                        </span>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F3F4F6', color: '#6B7280', fontWeight: '800', textAlign: 'left', zIndex: 10 }}>
                            <tr>
                                <th style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #E5E7EB', width: '20px' }}>TIPO</th>
                                <th style={{ padding: '0.6rem 0.5rem', borderBottom: '1px solid #E5E7EB' }}>CLIENTE</th>
                                <th style={{ padding: '0.6rem 0.5rem', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>CANT.</th>
                                <th style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>RESTRICCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...orders]
                                .sort((a, b) => {
                                    const aAssigned = Object.values(assignments).some(ids => ids.includes(a.id));
                                    const bAssigned = Object.values(assignments).some(ids => ids.includes(b.id));
                                    if (aAssigned && !bAssigned) return 1;
                                    if (!aAssigned && bAssigned) return -1;
                                    return 0;
                                })
                                .map(order => {
                                    const isAssigned = Object.values(assignments).some(ids => ids.includes(order.id));
                                    return (
                                    <tr 
                                        key={order.id} 
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, order.id)}
                                        style={{ 
                                            backgroundColor: isAssigned ? '#F0FDFA' : 'white',
                                            borderBottom: '1px solid #F3F4F6',
                                            transition: 'all 0.2s',
                                            cursor: 'grab',
                                            opacity: isAssigned ? 0.6 : 1
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = isAssigned ? '#CCFBF1' : '#F9FAFB'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = isAssigned ? '#F0FDFA' : 'white'}
                                    >
                                        <td style={{ padding: '0.6rem 1rem' }}>
                                            <div style={{ 
                                                width: '24px', height: '24px', borderRadius: '6px', 
                                                backgroundColor: order.is_b2b ? '#E0F2FE' : '#EDE9FE', 
                                                color: order.is_b2b ? '#0369A1' : '#6D28D9', 
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: '900', fontSize: '0.6rem', border: `1px solid ${order.is_b2b ? '#BAE6FD' : '#DDD6FE'}` 
                                            }}>
                                                {order.is_b2b ? 'B2B' : 'B2C'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem', maxWidth: '200px' }}>
                                            <div style={{ fontWeight: '900', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {order.customer_name}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '3px' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={10} strokeWidth={1.5} /> {order.address}</span>
                                            </div>
                                            {order.address_complement && (
                                                <div style={{ fontSize: '0.55rem', color: '#0891B2', fontWeight: '800', marginTop: '1px' }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Building2 size={10} strokeWidth={1.5} /> {order.address_complement}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '900', color: '#0F172A' }}>{formatNumber(order.total_weight_kg, 1)} <span style={{fontSize:'0.55rem', color:'#64748B'}}>kg</span></div>
                                            <div style={{ fontSize: '0.6rem', color: '#0D9488', fontWeight: '800', marginTop: '2px' }}>🧺 {order.crates} und</div>
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'left', maxWidth: '150px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: order.novedad ? '4px' : '0' }}>
                                                <div style={{ 
                                                    fontSize: '0.55rem', 
                                                    fontWeight: '800', 
                                                    padding: '0.15rem 0.4rem', 
                                                    borderRadius: '4px', 
                                                    display: 'inline-block',
                                                    backgroundColor: order.slot_type === 'manual' ? '#FFE4E6' : 
                                                                     order.slot_type === 'profile' ? '#E0F2FE' : 
                                                                     order.slot_type === 'b2c_slot' ? '#FEF3C7' : '#F3F4F6',
                                                    color: order.slot_type === 'manual' ? '#9F1239' : 
                                                           order.slot_type === 'profile' ? '#0369A1' : 
                                                           order.slot_type === 'b2c_slot' ? '#92400E' : '#4B5563',
                                                    border: `1px solid ${
                                                        order.slot_type === 'manual' ? '#FDA4AF' : 
                                                        order.slot_type === 'profile' ? '#BAE6FD' : 
                                                        order.slot_type === 'b2c_slot' ? '#FDE68A' : '#E5E7EB'
                                                    }`
                                                }}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Clock size={10} strokeWidth={1.5} /> {order.display_slot}</span> {order.slot_type === 'manual' ? ' (Manual)' : order.slot_type === 'profile' ? ' (Ficha)' : ''}
                                                </div>
                                            </div>
                                            {order.novedad && (
                                                <div style={{ 
                                                    fontSize: '0.55rem', 
                                                    color: '#B45309', 
                                                    backgroundColor: '#FFFBEB', 
                                                    padding: '0.3rem', 
                                                    borderRadius: '4px', 
                                                    fontWeight: '700', 
                                                    display: '-webkit-box', 
                                                    WebkitLineClamp: 2, 
                                                    WebkitBoxOrient: 'vertical', 
                                                    overflow: 'hidden', 
                                                    border: '1px solid #FDE68A', 
                                                    lineHeight: '1.2',
                                                    marginTop: '4px'
                                                }} title={order.novedad}>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#EF4444' }}><AlertTriangle size={10} strokeWidth={1.5} /> {order.novedad}</span>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Planning Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', position: 'relative', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#374151' }}>FLOTA Y RUTAS</h3>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#E5E7EB', color: '#4B5563', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '800' }}>
                            {Object.values(assignments).reduce((acc, curr) => acc + curr.length, 0)} ASIGNADOS
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button 
                            onClick={() => setShowSettings(true)}
                            title="Ajustar Parámetros"
                            style={{ 
                                backgroundColor: '#F3F4F6', 
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
                            ⚙️
                        </button>
                        <button 
                            onClick={handleAutoOptimize}
                            disabled={optimizing}
                            style={{ 
                                padding: '0.4rem 1.1rem', 
                                borderRadius: '8px', 
                                backgroundImage: optimizing ? 'none' : 'linear-gradient(135deg, #6366F1, #4F46E5)', 
                                backgroundColor: optimizing ? '#94A3B8' : 'transparent', 
                                color: 'white', 
                                border: 'none', 
                                fontWeight: '800', 
                                cursor: optimizing ? 'not-allowed' : 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.35rem',
                                fontSize: '0.75rem',
                                boxShadow: optimizing ? 'none' : '0 4px 6px -1px rgba(99, 102, 241, 0.25), 0 2px 4px -1px rgba(99, 102, 241, 0.15)',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={(e) => {
                                if (!optimizing) {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(99, 102, 241, 0.35), 0 3px 6px -2px rgba(99, 102, 241, 0.25)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!optimizing) {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(99, 102, 241, 0.25), 0 2px 4px -1px rgba(99, 102, 241, 0.15)';
                                }
                            }}
                        >
                            {optimizing ? 'Optimizando...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Sparkles size={12} strokeWidth={1.5} /> Auto-Asignar</span>}
                        </button>
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button 
                                onClick={handleConfirmRoutes}
                                disabled={loading}
                                style={{ 
                                    padding: '0.4rem 1.1rem', 
                                    borderRadius: '8px', 
                                    backgroundColor: '#10B981', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    fontSize: '0.75rem',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.25), 0 2px 4px -1px rgba(16, 185, 129, 0.15)',
                                    transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = '0 6px 12px -2px rgba(16, 185, 129, 0.35), 0 3px 6px -2px rgba(16, 185, 129, 0.25)';
                                    e.currentTarget.style.backgroundColor = '#059669';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(16, 185, 129, 0.25), 0 2px 4px -1px rgba(16, 185, 129, 0.15)';
                                    e.currentTarget.style.backgroundColor = '#10B981';
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Check size={12} strokeWidth={1.5} /> Confirmar</span>
                            </button>
                        )}
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button
                                onClick={() => {
                                    if (confirm('¿Seguro que quieres limpiar todas las asignaciones? Los pedidos volverán al tablero sin asignar.')) {
                                        try { localStorage.removeItem('frufresco_route_planner_draft'); } catch (_) {}
                                        setAssignments({});
                                        setIsOptimized(false);
                                        setTheoreticalMetrics(null);
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
                </div>

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
                                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#111827', letterSpacing: '-0.02em' }}>
                                    ⚙️ Ajustes del Optimizador
                                </h4>
                                <button 
                                    onClick={() => setShowSettings(false)} 
                                    style={{ 
                                        border: 'none', 
                                        background: '#F3F4F6', 
                                        cursor: 'pointer', 
                                        fontSize: '0.85rem',
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#4B5563',
                                        fontWeight: 'bold',
                                        transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#E5E7EB'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = '#F3F4F6'}
                                >
                                    ✕
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', flex: 1 }}>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>B2B Eficiencia (kg/min)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(params.b2b_kg_min) ? '' : params.b2b_kg_min} 
                                        onChange={(e) => updateParameter('b2b_kg_min', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>B2C Eficiencia (kg/min)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(params.b2c_kg_min) ? '' : params.b2c_kg_min} 
                                        onChange={(e) => updateParameter('b2c_kg_min', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Tiempo base de alistamiento (min)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(params.base_setup_time) ? '' : params.base_setup_time} 
                                        onChange={(e) => updateParameter('base_setup_time', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descarga física de 10 canastillas (min)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(params.time_per_10_crates_unload) ? '' : params.time_per_10_crates_unload} 
                                        onChange={(e) => updateParameter('time_per_10_crates_unload', parseFloat(e.target.value) || 0)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Revisión/Firma de 10 canastillas (min)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(params.time_per_10_crates_delivery) ? '' : params.time_per_10_crates_delivery} 
                                        onChange={(e) => updateParameter('time_per_10_crates_delivery', parseFloat(e.target.value) || 0)}
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
                                        <option value="minimize_time">⚡ Terminar más rápido (Velocidad)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descanso de Conductor (minutos)</label>
                                    <input 
                                        type="number" 
                                        value={isNaN(params.driver_break_mins) ? '' : params.driver_break_mins} 
                                        onChange={(e) => updateParameter('driver_break_mins', parseFloat(e.target.value) || 0)}
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
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', fontSize: '0.65rem', color: '#64748B', lineHeight: '1.4' }}>
                                Estos valores afectan el cálculo de `service_duration` enviado a Google Maps.
                            </div>
                        </div>
                    </div>
                )}

                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
                    gap: '1.2rem', 
                    flex: 1, 
                    overflowY: 'auto',
                    paddingRight: '0.5rem',
                    alignContent: 'start'
                }}>
                    {vehicles.map(vehicle => {
                        const load = getVehicleLoad(vehicle.id);
                        const cratesNeeded = Math.ceil(load / params.avg_kg_per_crate);
                        
                        const kgProgress = (load / vehicle.capacity_kg) * 100;
                        const crateProgress = vehicle.max_crates_capacity > 0 ? (cratesNeeded / vehicle.max_crates_capacity) * 100 : 0;
                        const progress = Math.max(kgProgress, crateProgress);
                        
                        const assignedOrders = assignments[vehicle.id] || [];
                        const isKgOverloaded = load > vehicle.capacity_kg;
                        const isCrateOverloaded = vehicle.max_crates_capacity > 0 && cratesNeeded > vehicle.max_crates_capacity;
                        const isOverloaded = isKgOverloaded || isCrateOverloaded;

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
                                    backgroundColor: 'white', 
                                    borderRadius: '20px', 
                                    border: isDragOver
                                        ? '2px dashed #06B6D4'
                                        : (isOverloaded ? '2px solid #EF4444' : '1px solid #E5E7EB'), 
                                    padding: '1rem',
                                    boxShadow: isDragOver 
                                        ? '0 10px 15px -3px rgba(6,182,212,0.1), 0 4px 6px -4px rgba(6,182,212,0.1)' 
                                        : '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    transition: 'all 0.2s',
                                    transform: isDragOver ? 'scale(1.01)' : 'scale(1)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#111827' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Truck size={14} strokeWidth={1.5} /> {vehicle.plate}</span></div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: vehicle.driver_name !== 'Sin Asignar' ? '#0891B2' : '#94A3B8',
                                            fontWeight: '800',
                                            marginTop: '0.6rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.6rem'
                                        }}>
                                            <div style={{ 
                                                width: '28px', 
                                                height: '28px', 
                                                borderRadius: '8px', 
                                                background: vehicle.driver_name !== 'Sin Asignar' 
                                                    ? 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)' 
                                                    : '#F1F5F9', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                color: vehicle.driver_name !== 'Sin Asignar' ? 'white' : '#94A3B8', 
                                                fontWeight: '900', 
                                                fontSize: '0.65rem' 
                                            }}>
                                                {getInitials(vehicle.driver_name || '')}
                                            </div>
                                            Conductor: {vehicle.driver_name}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                        <div>
                                            <div style={{ fontSize: '0.9rem', fontWeight: '900', color: isKgOverloaded ? '#EF4444' : '#0D9488' }}>
                                                {load} / {vehicle.capacity_kg} kg
                                            </div>
                                            <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: '700' }}>CARGA UTIL</div>
                                        </div>
                                        {vehicle.max_crates_capacity > 0 && (
                                            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.4rem' }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: isCrateOverloaded ? '#EF4444' : '#6366F1' }}>
                                                    {cratesNeeded} / {vehicle.max_crates_capacity} und
                                                </div>
                                                <div style={{ fontSize: '0.6rem', color: '#6B7280', fontWeight: '700' }}>CANASTILLAS</div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div style={{ height: '8px', backgroundColor: '#F3F4F6', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ 
                                        width: `${Math.min(kgProgress, 100)}%`, 
                                        height: '4px', 
                                        backgroundColor: isKgOverloaded ? '#EF4444' : '#10B981', 
                                        transition: 'width 0.5s ease-out',
                                        borderRadius: '10px'
                                    }}></div>
                                    {vehicle.max_crates_capacity > 0 && (
                                        <div style={{ 
                                            width: `${Math.min(crateProgress, 100)}%`, 
                                            height: '2px', 
                                            backgroundColor: isCrateOverloaded ? '#EF4444' : '#6366F1', 
                                            transition: 'width 0.5s ease-out',
                                            borderRadius: '10px'
                                        }}></div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                    {assignedOrders.length === 0 ? (
                                        <div style={{ 
                                            padding: '2rem 1rem', 
                                            border: '2px dashed #F3F4F6', 
                                            borderRadius: '20px', 
                                            textAlign: 'center', 
                                            color: '#9CA3AF', 
                                            fontSize: '0.8rem',
                                            backgroundColor: '#F9FAFB'
                                        }}>
                                            Arrastra pedidos aquí...
                                        </div>
                                    ) : (
                                    assignedOrders.map((oid, stopIndex) => {
                                        const order = orders.find(o => o.id === oid);
                                        const orderCrates = order ? Math.ceil(order.total_weight_kg / params.avg_kg_per_crate) : 0;
                                        const stopNumber = stopIndex + 1;
                                        const totalStops = assignedOrders.length;
                                        // LIFO check: a stop in the 2nd half that is heavier than average
                                        // signals it was loaded first (bottom of truck) but delivered last
                                        const avgWeight = assignedOrders.reduce((sum, id) => {
                                            const o = orders.find(x => x.id === id);
                                            return sum + (o?.total_weight_kg || 0);
                                        }, 0) / totalStops;
                                        const isLifoConflict = stopIndex >= Math.floor(totalStops / 2)
                                            && (order?.total_weight_kg || 0) > avgWeight * 1.3;

                                        // Ordinal display: 1-9 use circled numbers, 10+ use plain badge
                                        const circledNumbers = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨'];
                                        const ordinalLabel = stopNumber <= 9 ? circledNumbers[stopNumber - 1] : `#${stopNumber}`;

                                        return (
                                            <div 
                                                key={oid} 
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, oid, vehicle.id, stopIndex)}
                                                onDragOver={handleDragOver}
                                                onDrop={(e) => {
                                                    e.stopPropagation();
                                                    handleDropOnVehicle(e, vehicle.id, stopIndex);
                                                }}
                                                style={{ 
                                                    padding: '0.7rem 0.8rem', 
                                                    backgroundColor: isLifoConflict ? '#FFFBEB' : 'white', 
                                                    borderRadius: '14px', 
                                                    fontSize: '0.8rem', 
                                                    fontWeight: '700', 
                                                    display: 'flex', 
                                                    alignItems: 'center',
                                                    gap: '0.6rem',
                                                    border: isLifoConflict ? '1px solid #FCD34D' : '1px solid #E5E7EB',
                                                    color: '#374151',
                                                    cursor: 'grab',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                }}
                                            >
                                                {/* Ordinal Badge */}
                                                <div style={{
                                                    minWidth: '28px',
                                                    height: '28px',
                                                    borderRadius: '8px',
                                                    background: isLifoConflict
                                                        ? 'linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)'
                                                        : 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: 'white',
                                                    fontWeight: '900',
                                                    fontSize: stopNumber <= 9 ? '0.9rem' : '0.65rem',
                                                    flexShrink: 0,
                                                    boxShadow: '0 2px 6px rgba(8,145,178,0.25)'
                                                }}>
                                                    {ordinalLabel}
                                                </div>

                                                {/* Order info */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: '800', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {order?.customer_name}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.6rem', color: '#6B7280' }}>
                                                            {order?.delivery_zone} • {order?.total_weight_kg} kg
                                                        </span>
                                                        <span style={{ fontSize: '0.6rem', color: '#6366F1', fontWeight: '800' }}>
                                                            🧺 {orderCrates}
                                                        </span>
                                                        {isLifoConflict && (
                                                            <span style={{ fontSize: '0.55rem', color: '#B45309', fontWeight: '900', backgroundColor: '#FEF3C7', padding: '1px 5px', borderRadius: '4px' }}>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#D97706' }}><AlertTriangle size={12} strokeWidth={1.5} /> Carga primero</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Stop counter */}
                                                <div style={{ fontSize: '0.55rem', color: '#94A3B8', fontWeight: '700', textAlign: 'right', flexShrink: 0 }}>
                                                    <div style={{ color: '#374151', fontWeight: '900', fontSize: '0.65rem' }}>{stopNumber}/{totalStops}</div>
                                                    <div>parada</div>
                                                </div>

                                                <span 
                                                    style={{ 
                                                        cursor: 'pointer', 
                                                        color: '#EF4444',
                                                        backgroundColor: '#FEF2F2',
                                                        padding: '0.3rem 0.5rem',
                                                        borderRadius: '8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        flexShrink: 0
                                                    }} 
                                                    onClick={() => toggleAssignment(oid, vehicle.id)}
                                                >✕</span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                        );
                    })}
                </div>
            </div>
            {/* Inject keyframes dynamically */}
            <style>{`
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
                            {/* Circular spinning border */}
                            <div style={{
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                border: '4px solid rgba(99, 102, 241, 0.15)',
                                borderTop: '4px solid #6366F1',
                                animation: 'spin 1s linear infinite'
                            }} />
                            {/* AI Pulse Dot inside */}
                            <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                fontSize: '2rem',
                                animation: 'pulse 1.5s ease-in-out infinite'
                            }}>
                                🤖
                            </div>
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', fontWeight: '800', background: 'linear-gradient(135deg, #A5B4FC, #818CF8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                Inteligencia Artificial & Google Engine
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: '#94A3B8', lineHeight: '1.4' }}>
                                Calculando el plan de distribución óptimo, consolidando capacidad de flota y respetando ventanas horarias...
                            </p>
                        </div>
                    </div>
                </div>
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
                                <span style={{ fontSize: '1.5rem' }}>🤖</span>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: '#1E1B4B' }}>
                                    Justificación de Ruteo IA
                                </h3>
                            </div>
                            <button 
                                onClick={() => setShowAiModal(false)}
                                style={{
                                    border: 'none',
                                    background: 'none',
                                    fontSize: '1.25rem',
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
                                ✕
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
        </div>
    );
}
