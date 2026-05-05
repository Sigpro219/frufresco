'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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
    const [debugInfo, setDebugInfo] = useState({ targetDate: '', count: 0, cutoff: false, driversFound: '' });

    const [showSettings, setShowSettings] = useState(false);
    const [params, setParams] = useState<Record<string, number>>({
        b2b_kg_min: 10,
        b2c_kg_min: 5,
        base_setup_time: 5,
        avg_kg_per_crate: 17
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
            
            if (paramData && isMounted.current) {
                const pMap: Record<string, number> = {};
                paramData.forEach((p: any) => pMap[p.id] = parseFloat(p.value));
                setParams(prev => ({ ...prev, ...pMap }));
            }

            // 2. Fetch Orders (with conditional cutoff)
            const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'enable_cutoff_rules').single();
            const cutoffEnabled = settings?.value !== 'false';


            const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
            const targetDate = now.toISOString().split('T')[0];

            let apiUrl = '/api/transport/orders';
            if (cutoffEnabled) {
                apiUrl += `?date=${targetDate}`;
            }

            const response = await fetch(apiUrl);
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
            
            setOrders((orderData || []).map((o: any) => ({
                ...o,
                customer_name: o.customer_name || 'Sin Nombre',
                address: o.shipping_address || 'Sin Dirección',
                crates: o.crates || (o.total_weight_kg ? Math.ceil(o.total_weight_kg / 17) : 0),
                novedad: '', // Clear novelty extraction as requested (100% DB sync)
                total_weight_kg: o.total_weight_kg || 0,
                is_b2b: !!o.is_b2b || (o.type?.includes('b2b') ?? false),
                delivery_zone: o.delivery_zone || ''
            })));



        } catch (err: any) {
            console.error('Error fetching planner data:', err.message || err.details || err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    };

    const [isOptimized, setIsOptimized] = useState(false);
    const [theoreticalMetrics, setTheoreticalMetrics] = useState<{distance_km: number, duration_min: number} | null>(null);

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

            const result = await response.json();
            
            if (result.simulation) {
                const newAssignments: Record<string, string[]> = {};
                vehicles.forEach(v => newAssignments[v.id] = []);
                
                const sortedOrders = [...orders].sort((a, b) => b.total_weight_kg - a.total_weight_kg);
                sortedOrders.forEach((order, index) => {
                    const vehicleId = vehicles[index % vehicles.length]?.id;
                    if (vehicleId) newAssignments[vehicleId].push(order.id);
                });

                setAssignments(newAssignments);
                setIsOptimized(true);
                setTheoreticalMetrics({ distance_km: Object.keys(assignments).length * 2, duration_min: Object.keys(assignments).length * 15 }); // Mock metrics for simulation
            } else if (result.routes) {
                setAssignments(result.routes);
                setIsOptimized(true);
                if (result.theoretical_metrics) {
                    setTheoreticalMetrics(result.theoretical_metrics);
                }
            }

        } catch (err) {
            console.error('Optimization failed:', err);
        } finally {
            setOptimizing(false);
        }
    };

    const getInitials = (name: string) => {
        if (!name || name === 'Sin Asignar') return '👤';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const handleConfirmRoutes = async () => {
        try {
            setLoading(true);
            const routeConfirmations = [];

            for (const vehicleId of Object.keys(assignments)) {
                const orderIds = assignments[vehicleId];
                if (orderIds.length === 0) continue;

                const vehicle = vehicles.find(v => v.id === vehicleId);
                
                // 1. Create Route
                const { data: route, error: rErr } = await supabase
                    .from('routes')
                    .insert({
                        vehicle_plate: vehicle?.plate,
                        driver_id: vehicle?.driver_id,
                        status: 'loading',
                        is_optimized: isOptimized,
                        theoretical_distance_km: theoreticalMetrics?.distance_km || 0,
                        theoretical_duration_min: theoreticalMetrics?.duration_min || 0,
                        stops_count: orderIds.length,
                        logic_parameters_snapshot: params
                    })
                    .select()
                    .single();

                if (rErr) throw rErr;

                // 2. Create Route Stops & Update Orders
                for (let i = 0; i < orderIds.length; i++) {
                    const orderId = orderIds[i];
                    
                    await supabase.from('route_stops').insert({
                        route_id: route.id,
                        order_id: orderId,
                        sequence_number: i + 1,
                        status: 'pending'
                    });

                    await supabase.from('orders').update({
                        status: 'shipped'
                    }).eq('id', orderId);
                }
                
                routeConfirmations.push(route.id);
            }

            alert(`✅ ${routeConfirmations.length} Rutas confirmadas y despachadas exitosamente.`);
            setAssignments({});
            await fetchInitialData();

        } catch (err) {
            console.error('Error confirming routes:', err);
            alert('Error al confirmar las rutas.');
        } finally {
            setLoading(false);
        }
    };

    const getVehicleLoad = (vehicleId: string) => {
        const orderIds = assignments[vehicleId] || [];
        return orders.filter(o => orderIds.includes(o.id)).reduce((sum, o) => sum + o.total_weight_kg, 0);
    };

    const updateParameter = async (id: string, value: number) => {
        setParams({ ...params, [id]: value });
        await supabase.from('logistic_parameters').upsert({ id, value });
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
    const handleDragStart = (e: React.DragEvent, orderId: string) => {
        e.dataTransfer.setData('orderId', orderId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = (e: React.DragEvent, vehicleId: string) => {
        e.preventDefault();
        const orderId = e.dataTransfer.getData('orderId');
        if (orderId) {
            toggleAssignment(orderId, vehicleId);
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
            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: '16px', 
                border: '1px solid #E5E7EB', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden',
                minHeight: 0
            }}>
                <div style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#374151' }}>PEDIDOS PICKING</h3>
                        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div style={{ fontSize: '0.5rem', color: '#EF4444', fontWeight: 'bold', lineHeight: '1.2', textAlign: 'right' }}>
                                DB: {debugInfo.count} • DRIVERS: {debugInfo.driversFound || 'N/A'}<br/>
                                DATE: {debugInfo.targetDate}
                            </div>
                            <span style={{ fontSize: '0.65rem', backgroundColor: '#E5E7EB', color: '#4B5563', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: '800' }}>
                                {orders.length} DISP
                            </span>
                        </div>

                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#F3F4F6', color: '#6B7280', fontWeight: '800', textAlign: 'left', zIndex: 10 }}>
                            <tr>
                                <th style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #E5E7EB', width: '20px' }}>TIPO</th>
                                <th style={{ padding: '0.6rem 0.5rem', borderBottom: '1px solid #E5E7EB' }}>CLIENTE</th>
                                <th style={{ padding: '0.6rem 0.5rem', borderBottom: '1px solid #E5E7EB' }}>UBICACIÓN</th>
                                <th style={{ padding: '0.6rem 0.5rem', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>CANT.</th>
                                <th style={{ padding: '0.6rem 1rem', borderBottom: '1px solid #E5E7EB', textAlign: 'left' }}>RESTRICCIONES</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(order => {
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
                                        <td style={{ padding: '0.6rem 0.5rem', maxWidth: '140px' }}>
                                            <div style={{ fontWeight: '900', color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {order.customer_name}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem', maxWidth: '140px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '3px' }}>
                                                <span style={{ backgroundColor: '#F1F5F9', color: '#475569', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: '800', fontSize: '0.55rem' }}>
                                                    {order.delivery_zone || 'Central'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {order.address}
                                            </div>
                                        </td>
                                        <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '900', color: '#0F172A' }}>{order.total_weight_kg} <span style={{fontSize:'0.55rem', color:'#64748B'}}>kg</span></div>
                                            <div style={{ fontSize: '0.6rem', color: '#0D9488', fontWeight: '800', marginTop: '2px' }}>🧺 {order.crates} und</div>
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'left', maxWidth: '150px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: order.novedad ? '4px' : '0' }}>
                                                <div style={{ fontSize: '0.6rem', color: '#92400E', fontWeight: '800', backgroundColor: '#FEF3C7', padding: '0.15rem 0.4rem', borderRadius: '4px', display: 'inline-block' }}>
                                                    🕒 {order.delivery_slot || 'Abierta'}
                                                </div>
                                            </div>
                                            {order.novedad && order.novedad !== order.delivery_slot && (
                                                <div style={{ fontSize: '0.55rem', color: '#BE123C', backgroundColor: '#FFF1F2', padding: '0.2rem 0.4rem', borderRadius: '4px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', border: '1px solid #FECDD3' }}>
                                                    ⚠️ {order.novedad}
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
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button 
                            onClick={() => setShowSettings(true)}
                            title="Ajustar Parámetros"
                            style={{ 
                                backgroundColor: 'transparent', 
                                border: '1px solid #E5E7EB', 
                                borderRadius: '6px', 
                                padding: '0.25rem 0.4rem', 
                                fontSize: '0.7rem', 
                                color: '#6B7280', 
                                fontWeight: '700', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            ⚙️
                        </button>
                        <button 
                            onClick={handleAutoOptimize}
                            disabled={optimizing}
                            style={{ 
                                padding: '0.25rem 0.6rem', 
                                borderRadius: '6px', 
                                backgroundColor: optimizing ? '#94A3B8' : '#F3F4F6', 
                                color: optimizing ? 'white' : '#4B5563', 
                                border: '1px solid #E5E7EB', 
                                fontWeight: '800', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.3rem',
                                fontSize: '0.7rem'
                            }}
                        >
                            ✨ {optimizing ? 'Optimizando...' : 'Auto-Asignar'}
                        </button>
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button 
                                onClick={handleConfirmRoutes}
                                disabled={loading}
                                style={{ 
                                    padding: '0.25rem 0.6rem', 
                                    borderRadius: '6px', 
                                    backgroundColor: '#10B981', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    cursor: 'pointer',
                                    fontSize: '0.7rem'
                                }}
                            >
                                ✅ Confirmar
                            </button>
                        )}
                    </div>
                </div>

                {/* Settings Modal */}
                {showSettings && (
                    <div style={{ 
                        position: 'absolute', 
                        top: '5rem', 
                        right: '0', 
                        width: '320px', 
                        backgroundColor: 'white', 
                        borderRadius: '24px', 
                        border: '1px solid #E5E7EB', 
                        padding: '1.5rem', 
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)', 
                        zIndex: 50 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.2rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '900' }}>Parámetros del Optimizador</h4>
                            <button onClick={() => setShowSettings(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>B2B Eficiencia (kg/min)</label>
                                <input 
                                    type="number" 
                                    value={params.b2b_kg_min} 
                                    onChange={(e) => updateParameter('b2b_kg_min', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>B2C Eficiencia (kg/min)</label>
                                <input 
                                    type="number" 
                                    value={params.b2c_kg_min} 
                                    onChange={(e) => updateParameter('b2c_kg_min', parseFloat(e.target.value))}
                                    style={{ width: '100%', padding: '0.6rem', borderRadius: '12px', border: '1px solid #E5E7EB', fontWeight: '700' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.7rem', fontWeight: '800', color: '#6B7280', display: 'block', marginBottom: '0.4rem' }}>Tiempo Base (min/parada)</label>
                                <input 
                                    type="number" 
                                    value={params.base_setup_time} 
                                    onChange={(e) => updateParameter('base_setup_time', parseFloat(e.target.value))}
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
                                    <span>17 kg (Estándar)</span>
                                    <span>25 kg</span>
                                </div>
                            </div>
                        </div>
                        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', fontSize: '0.65rem', color: '#64748B', lineHeight: '1.4' }}>
                            💡 Estos valores afectan el cálculo de `service_duration` enviado a Google Maps.
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

                        return (
                            <div 
                                key={vehicle.id} 
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, vehicle.id)}
                                style={{ 
                                    backgroundColor: 'white', 
                                    borderRadius: '20px', 
                                    border: isOverloaded ? '2px solid #EF4444' : '1px solid #E5E7EB', 
                                    padding: '1rem',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    transition: 'border 0.3s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#111827' }}>🚛 {vehicle.plate}</div>
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
                                        assignedOrders.map(oid => {
                                            const order = orders.find(o => o.id === oid);
                                            const orderCrates = order ? Math.ceil(order.total_weight_kg / params.avg_kg_per_crate) : 0;
                                            return (
                                                <div 
                                                    key={oid} 
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, oid)}
                                                    style={{ 
                                                        padding: '0.8rem 1rem', 
                                                        backgroundColor: 'white', 
                                                        borderRadius: '16px', 
                                                        fontSize: '0.8rem', 
                                                        fontWeight: '700', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between',
                                                        border: '1px solid #E5E7EB',
                                                        color: '#374151',
                                                        cursor: 'grab',
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: '800' }}>📦 {order?.customer_name}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                                                            <span style={{ fontSize: '0.65rem', color: '#6B7280' }}>
                                                                {order?.delivery_zone} • {order?.total_weight_kg} kg
                                                            </span>
                                                            <span style={{ fontSize: '0.65rem', color: '#6366F1', fontWeight: '800' }}>
                                                                🧺 {orderCrates}
                                                            </span>
                                                        </div>
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
                                                            height: 'fit-content'
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
        </div>
    );
}
