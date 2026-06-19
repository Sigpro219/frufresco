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

export default function RoutePlanner({ readOnly = false }: { readOnly?: boolean }) {
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
        optimization_strategy: 'balanced',
        warehouse_base_load_time: 15,
        warehouse_time_per_10_crates_load: 5
    });
    const [assignments, setAssignments] = useState<Record<string, string[]>>({}); 
    const [confirmedManifest, setConfirmedManifest] = useState<any[] | null>(null);
    const [showPreConfirm, setShowPreConfirm] = useState(false);
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
        if (readOnly) return;
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
        if (readOnly) return;
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
                            warehouse_spaces: route.order_spaces?.[oid] || []
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
        if (readOnly) return;
        setParams(prev => ({ ...prev, [id]: value }));
        await supabase.from('logistic_parameters').upsert({ id, value: value.toString() });
    };

    const toggleAssignment = (orderId: string, vehicleId: string) => {
        if (readOnly) return;
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
        if (readOnly) {
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
        // Departure time
        const departureTimeStr = params.fleet_start_time || '04:30';
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
        if (!printWindow) return alert('Por favor habilite las ventanas emergentes (popups) para poder imprimir.');

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
                                    <span style="font-size: 0.75rem; color: #64748B;">${stop.total_weight_kg} kg (${stop.crates} can.)</span>
                                    <span style="font-size: 0.7rem; font-weight: 850; background-color: rgba(14, 165, 233, 0.08); color: #0284C7; padding: 2px 6px; border-radius: 4px;">
                                        ${stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? `ESP ${stop.warehouse_spaces.join(', ')}` : 'Sin Espacio'}
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
                        <div style="font-weight: 900; color: #0F172A; font-size: 0.95rem;">🚚 ${route.vehicle_plate}</div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 700; margin-top: 2px;">Conductor: ${route.driver_name}</div>
                    </div>
                    <div>
                        <div style="font-size: 0.75rem; color: #64748B; font-weight: 800;">ENTREGAS / PESO</div>
                        <div style="font-weight: 800; color: #1E293B; font-size: 0.85rem; margin-top: 2px;">${route.stops_count} entregas • ${route.total_kilos.toLocaleString()} kg</div>
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
                <script src="https://cdn.tailwindcss.com"></script>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
                <style>
                    @page { margin: 15mm 15mm; size: letter; }
                    body { font-family: 'Inter', sans-serif; background: white !important; margin: 0; color: #1f2937; }
                    .page-break-inside-avoid { page-break-inside: avoid !important; break-inside: avoid !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                </style>
            </head>
            <body class="bg-white">
                <div class="max-w-[210mm] mx-auto min-h-[297mm] p-8 flex flex-col justify-between" style="box-sizing: border-box;">
                    <div>
                        <!-- Header -->
                        <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 0.5rem; margin-bottom: 1.5rem;">
                            <div>
                                <img src="${logoUrl}" alt="Investments Cortes Logo" style="height: 65px; width: auto; object-fit: contain;" />
                            </div>
                            <div style="text-align: right; font-size: 0.8rem; color: #4b5563; line-height: 1.4;">
                                <div style="font-weight: 800; color: #111827; font-size: 1.1rem; text-transform: uppercase; margin-bottom: 0.25rem;">Investments Cortes S.A.S</div>
                                <div>NIT: 901.393.217</div>
                                <div>CL 12 B # 71 D - 31 TO 4 AP 101</div>
                                <div>Bogotá D.C., Colombia</div>
                                <div>contacto@investmentscortes.com</div>
                            </div>
                        </header>

                        <!-- Meta -->
                        <div style="margin-bottom: 2rem; display: flex; justify-content: space-between; font-size: 0.9rem; color: #6b7280;">
                            <div>Fecha: <span class="font-bold text-gray-700">${dateStr}</span></div>
                            <div>Ref: <span class="font-bold text-gray-700">Manifiesto de Despacho</span></div>
                        </div>

                        <!-- Title -->
                        <h1 style="font-size: 1.5rem; font-weight: 900; color: #111827; margin-bottom: 1.5rem; text-align: center; text-transform: uppercase; tracking-tight: -0.025em;">
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
                    window.onload = function() {
                        setTimeout(function() { window.print(); }, 600);
                    }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    if (loading) return <div style={{ color: '#64748B', textAlign: 'center', padding: '2rem' }}>Iniciando motores...</div>;

    return (
        <>
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
                                        draggable={!readOnly}
                                        onDragStart={(e) => handleDragStart(e, order.id)}
                                        style={{ 
                                            backgroundColor: isAssigned ? '#F0FDFA' : 'white',
                                            borderBottom: '1px solid #F3F4F6',
                                            transition: 'all 0.2s',
                                            cursor: readOnly ? 'default' : 'grab',
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
                    {!readOnly && (
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
                                onClick={() => setShowPreConfirm(true)}
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
                    )}
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
                                        value={params.b2b_kg_min ?? ''} 
                                        onChange={(e) => updateParameter('b2b_kg_min', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>B2C Eficiencia (kg/min)</label>
                                    <input 
                                        type="number" 
                                        value={params.b2c_kg_min ?? ''} 
                                        onChange={(e) => updateParameter('b2c_kg_min', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Tiempo base de alistamiento (min)</label>
                                    <input 
                                        type="number" 
                                        value={params.base_setup_time ?? ''} 
                                        onChange={(e) => updateParameter('base_setup_time', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descarga física de 10 canastillas (min)</label>
                                    <input 
                                        type="number" 
                                        value={params.time_per_10_crates_unload ?? ''} 
                                        onChange={(e) => updateParameter('time_per_10_crates_unload', e.target.value)}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Revisión/Firma de 10 canastillas (min)</label>
                                    <input 
                                        type="number" 
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
                                        <option value="minimize_time">⚡ Terminar más rápido (Velocidad)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Descanso de Conductor (minutos)</label>
                                    <input 
                                        type="number" 
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
                                    <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#10B981', display: 'block', letterSpacing: '-0.01em' }}>
                                        📦 Cargue en Bodega (Tiempos)
                                    </span>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Alistamiento Fijo Bodega (min)</label>
                                        <input 
                                            type="number" 
                                            value={params.warehouse_base_load_time ?? ''} 
                                            onChange={(e) => updateParameter('warehouse_base_load_time', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Cargue de 10 canastillas (min)</label>
                                        <input 
                                            type="number" 
                                            value={params.warehouse_time_per_10_crates_load ?? ''} 
                                            onChange={(e) => updateParameter('warehouse_time_per_10_crates_load', e.target.value)}
                                            style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                        />
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
                    {[...vehicles]
                        .sort((a, b) => {
                            const aOrders = assignments[a.id] || [];
                            const bOrders = assignments[b.id] || [];
                            
                            // 1. Mostrar vehículos asignados primero
                            if (aOrders.length > 0 && bOrders.length === 0) return -1;
                            if (bOrders.length > 0 && aOrders.length === 0) return 1;
                            
                            // 2. Si ambos están asignados, ordenar por la ventana horaria del primer pedido (Parada 1)
                            if (aOrders.length > 0 && bOrders.length > 0) {
                                const getFirstOrderMin = (vId: string) => {
                                    const firstOrderId = assignments[vId][0];
                                    const order = orders.find(o => o.id === firstOrderId);
                                    if (order && order.display_slot && order.display_slot !== 'Flexible') {
                                        const startTimeStr = order.display_slot.split(' - ')[0];
                                        const [h, m] = startTimeStr.split(':').map(Number);
                                        return h * 60 + m;
                                    }
                                    return 9999; // Mandar flexibles al final
                                };
                                const minA = getFirstOrderMin(a.id);
                                const minB = getFirstOrderMin(b.id);
                                if (minA !== minB) return minA - minB;
                            }
                            
                            // 3. Fallback: Orden alfabético por placa
                            return a.plate.localeCompare(b.plate);
                        })
                        .map(vehicle => {
                        const load = getVehicleLoad(vehicle.id);
                        const cratesNeeded = Math.ceil(load / (parseFloat(params.avg_kg_per_crate) || 12.5));
                        
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
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.2rem' }}>
                                    {/* Row 1: Vehicle Plate & Timings */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '0.5rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <span style={{ fontSize: '0.55rem', color: '#6366F1', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '3px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                <Truck size={10} strokeWidth={2.5} style={{ color: '#6366F1' }} /> Camión
                                            </span>
                                            <div style={{ fontWeight: '900', fontSize: '1.2rem', color: '#0F172A', lineHeight: 1.1 }}>
                                                {vehicle.plate}
                                            </div>
                                        </div>
                                        {assignedOrders.length > 0 && (() => {
                                            const { loadStart, departure } = getEstimatedTimesForVehicle(vehicle.id, cratesNeeded);
                                            return (
                                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', marginBottom: '2px' }}>
                                                    <span style={{
                                                        fontSize: '0.62rem', fontWeight: '800',
                                                        backgroundColor: '#F0FDF4', color: '#16A34A',
                                                        padding: '2px 5px', borderRadius: '5px',
                                                        border: '1px solid #DCFCE7',
                                                        display: 'inline-flex', alignItems: 'center', gap: '2px'
                                                    }} title="Hora estimada de inicio de cargue en bodega">
                                                        ⏰ {loadStart}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.62rem', fontWeight: '800',
                                                        backgroundColor: '#EEF2FF', color: '#4F46E5',
                                                        padding: '2px 5px', borderRadius: '5px',
                                                        border: '1px solid #E0E7FF',
                                                        display: 'inline-flex', alignItems: 'center', gap: '2px'
                                                    }} title="Hora estimada de salida de bodega">
                                                        🚚 {departure}
                                                    </span>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Row 2: Driver Info */}
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: vehicle.driver_name !== 'Sin Asignar' ? '#334155' : '#94A3B8',
                                            fontWeight: '700',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.4rem',
                                            flex: 1,
                                            minWidth: 0
                                        }}>
                                            <div style={{ 
                                                width: '24px', 
                                                height: '24px', 
                                                borderRadius: '50%', 
                                                background: vehicle.driver_name !== 'Sin Asignar' 
                                                    ? 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)' 
                                                    : '#E2E8F0', 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                justifyContent: 'center', 
                                                color: 'white', 
                                                fontWeight: '900', 
                                                fontSize: '0.6rem',
                                                flexShrink: 0
                                            }}>
                                                {getInitials(vehicle.driver_name || '')}
                                            </div>
                                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }} title={vehicle.driver_name}>
                                                {vehicle.driver_name}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Row 3: Capacity Progress Pills (Full Width Stack with top separator) */}
                                    <div style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '0.35rem', 
                                        width: '100%',
                                        borderTop: '1px solid #F1F5F9',
                                        paddingTop: '0.6rem'
                                    }}>
                                        {/* Weight Capacity Progress Pill */}
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px', 
                                            backgroundColor: isKgOverloaded ? '#FEF2F2' : '#F0FDFA',
                                            border: isKgOverloaded ? '1px solid #FEE2E2' : '1px solid #CCFBF1',
                                            padding: '3px 8px',
                                            borderRadius: '8px',
                                            transition: 'all 0.2s',
                                            width: '100%'
                                        }}>
                                            <div style={{
                                                fontSize: '0.62rem', fontWeight: '800',
                                                color: isKgOverloaded ? '#EF4444' : '#0D9488',
                                                display: 'flex', alignItems: 'center', gap: '3px',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <span>⚖️</span>
                                                <span>{load}/{vehicle.capacity_kg} kg</span>
                                            </div>
                                            <div style={{ flex: 1, height: '4px', backgroundColor: isKgOverloaded ? '#FEE2E2' : '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${Math.min(kgProgress, 100)}%`,
                                                    height: '100%',
                                                    backgroundColor: isKgOverloaded ? '#EF4444' : '#10B981',
                                                    transition: 'width 0.5s ease-out'
                                                }} />
                                            </div>
                                        </div>

                                        {/* Crates Capacity Progress Pill */}
                                        {vehicle.max_crates_capacity > 0 && (
                                            <div style={{ 
                                                display: 'flex', 
                                                alignItems: 'center', 
                                                gap: '8px', 
                                                backgroundColor: isCrateOverloaded ? '#FEF2F2' : '#F5F3FF',
                                                border: isCrateOverloaded ? '1px solid #FEE2E2' : '1px solid #E9D5FF',
                                                padding: '3px 8px',
                                                borderRadius: '8px',
                                                transition: 'all 0.2s',
                                                width: '100%'
                                            }}>
                                                <div style={{
                                                    fontSize: '0.62rem', fontWeight: '800',
                                                    color: isCrateOverloaded ? '#EF4444' : '#6D28D9',
                                                    display: 'flex', alignItems: 'center', gap: '3px',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    <span>📦</span>
                                                    <span>{cratesNeeded}/{vehicle.max_crates_capacity} und</span>
                                                </div>
                                                <div style={{ flex: 1, height: '4px', backgroundColor: isCrateOverloaded ? '#FEE2E2' : '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <div style={{
                                                        width: `${Math.min(crateProgress, 100)}%`,
                                                        height: '100%',
                                                        backgroundColor: isCrateOverloaded ? '#EF4444' : '#6366F1',
                                                        transition: 'width 0.5s ease-out'
                                                    }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
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
                                        const orderCrates = order ? Math.ceil(order.total_weight_kg / (parseFloat(params.avg_kg_per_crate) || 12.5)) : 0;
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
                                                draggable={!readOnly}
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
                                                    cursor: readOnly ? 'default' : 'grab',
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
                            >✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingRight: '0.5rem' }}>
                            <div style={{
                                backgroundColor: '#EEF2F6', borderRadius: '16px', padding: '1.25rem',
                                borderLeft: '4px solid #6366F1', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                            }}>
                                <span style={{ fontWeight: '800', fontSize: '0.85rem', color: '#1E293B' }}>⚠️ ¿Qué sucederá al confirmar?</span>
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
                                        {Object.keys(assignments).reduce((sum, vid) => {
                                            const oIds = assignments[vid] || [];
                                            const weight = orders.filter(o => oIds.includes(o.id)).reduce((wSum, o) => wSum + o.total_weight_kg, 0);
                                            return sum + weight;
                                        }, 0).toLocaleString()} kg
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
                                        const totalCrates = routeOrders.reduce((cSum, o) => cSum + (o.crates || 0), 0);
                                        
                                        // Porcentaje de capacidad
                                        const capPct = vehicle?.capacity_kg ? Math.round((totalWeight / vehicle.capacity_kg) * 100) : 0;
                                        
                                        return (
                                            <div key={vid} style={{
                                                border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem',
                                                backgroundColor: '#FFFFFF', display: 'flex', flexDirection: 'column', gap: '0.5rem'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <span style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.85rem' }}>🚚 {vehicle?.plate || 'Desconocido'}</span>
                                                        <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '8px' }}>({vehicle?.driver_name || 'Sin Asignar'})</span>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.75rem', fontWeight: '800',
                                                        color: capPct > 95 ? '#EF4444' : capPct > 75 ? '#F59E0B' : '#10B981'
                                                    }}>
                                                        {capPct}% Capacidad ({totalWeight} kg / {vehicle?.capacity_kg} kg)
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
                                                            <span>⏰ <strong>Inicio Cargue:</strong> {loadStart} <span style={{color: '#64748B', fontWeight: 'normal'}}>({duration} min)</span></span>
                                                            <span>🚚 <strong>Salida Ruta:</strong> {departure}</span>
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
                            >✕</button>
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
                                                <div style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.95rem' }}>🚚 {route.vehicle_plate}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', marginTop: '2px' }}>Conductor: {route.driver_name}</div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '800' }}>ENTREGAS / PESO</div>
                                                <div style={{ fontWeight: '800', color: '#1E293B', fontSize: '0.85rem', marginTop: '2px' }}>{route.stops_count} entregas • {route.total_kilos.toLocaleString()} kg</div>
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
                                                                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>{stop.total_weight_kg} kg ({stop.crates} can.)</span>
                                                                <span style={{ 
                                                                    fontSize: '0.7rem', fontWeight: '850', 
                                                                    backgroundColor: 'rgba(14, 165, 233, 0.08)', color: '#0284C7', 
                                                                    padding: '2px 6px', borderRadius: '4px' 
                                                                }}>
                                                                    {stop.warehouse_spaces && stop.warehouse_spaces.length > 0 
                                                                        ? `ESP ${stop.warehouse_spaces.join(', ')}` 
                                                                        : 'Sin Espacio'}
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
                                    let text = `🚚 *MANIFIESTO DE DESPACHO - FRUFRESCO*\n*Fecha:* ${dateStr}\n\n*Rutas Confirmadas:*\n`;
                                    confirmedManifest.forEach((r, i) => {
                                        text += `----------------------------------------\n*${i+1}. Placa:* ${r.vehicle_plate} | *Conductor:* ${r.driver_name}\n*Espacios Bodega:* ${r.warehouse_spaces && r.warehouse_spaces.length > 0 ? r.warehouse_spaces.join(', ') : 'N/A'}\n*Resumen:* ${r.stops_count} entregas • ${r.total_kilos.toLocaleString()} kg • Salida: ${r.departure_time || '04:30'}\n\n*Secuencia de Entregas:*\n`;
                                        if (r.stops && r.stops.length > 0) {
                                            r.stops.forEach((stop: any, sIdx: number) => {
                                                text += `  ${sIdx+1}️⃣ *${stop.customer_name}* (${stop.total_weight_kg} kg) -> Espacios: ${stop.warehouse_spaces && stop.warehouse_spaces.length > 0 ? stop.warehouse_spaces.join(', ') : 'N/A'}\n`;
                                            });
                                        } else {
                                            text += `  (No hay detalles de paradas)\n`;
                                        }
                                        text += `\n`;
                                    });
                                    text += `----------------------------------------\n\n_¡Listos para cargar! 🚀_`;
                                    
                                    navigator.clipboard.writeText(text);
                                    alert('📋 Resumen copiado al portapapeles para WhatsApp.');
                                }}
                                style={{
                                    flex: 1, padding: '1rem', borderRadius: '14px', border: '1px solid #CBD5E1',
                                    backgroundColor: 'white', color: '#334155', fontWeight: '800', cursor: 'pointer',
                                    fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                💬 Copiar WhatsApp
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
                                🖨️ Imprimir Plan
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
                        Calculando el plan de distribución óptimo...<br/>
                        <span style={{ fontSize: '1.1rem', fontWeight: '700', color: '#fff' }}>{mins}:{secs}</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
