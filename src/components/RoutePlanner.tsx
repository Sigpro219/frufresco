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
}

interface Vehicle {
    id: string;
    plate: string;
    vehicle_type: string;
    capacity_kg: number;
    driver_id?: string;
    driver_name?: string;
    driver?: {
        contact_name: string;
    } | null;
    max_crates_capacity: number;
}

export default function RoutePlanner() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [optimizing, setOptimizing] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [params, setParams] = useState<Record<string, number>>({
        b2b_kg_min: 10,
        b2c_kg_min: 5,
        base_setup_time: 5,
        avg_kg_per_crate: 12.24
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
            
            // Fetch Logistic Parameters
            const { data: paramData } = await supabase.from('logistic_parameters').select('*');
            if (paramData && isMounted.current) {
                const pMap: Record<string, number> = {};
                paramData.forEach((p: any) => pMap[p.id] = parseFloat(p.value));
                setParams(pMap);
            }

            // 2. Fetch Orders (with conditional cutoff)
            const { data: settings } = await supabase.from('app_settings').select('value').eq('key', 'enable_cutoff_rules').single();
            const cutoffEnabled = settings?.value !== 'false';

            let query = supabase.from('orders').select('*').eq('status', 'approved');

            if (cutoffEnabled) {
                const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
                const targetDate = now.toISOString().split('T')[0];
                query = query.eq('delivery_date', targetDate);
                console.log(`🔍 Route Planner filtered for operational date: ${targetDate}`);
            }

            const { data: orderData, error: oErr } = await query;

            if (!isMounted.current) return;
            if (oErr) throw oErr;

            const { data: fleetData, error: fErr } = await supabase
                .from('fleet_vehicles')
                .select('*, driver:profiles(contact_name)')
                .eq('status', 'available');

            if (!isMounted.current) return;
            if (fErr) throw fErr;

            // Use actual total_weight_kg if available, otherwise mock for UI dev
            setOrders((orderData || []).map((o: any) => ({
                ...o,
                total_weight_kg: o.total_weight_kg || Math.floor(Math.random() * 200) + 50,
                is_b2b: o.is_b2b !== undefined ? o.is_b2b : Math.random() > 0.4,
                delivery_zone: o.delivery_zone || (['Chapinero', 'Usaquén', 'Suba', 'Teusaquillo', 'Kennedy'][Math.floor(Math.random() * 5)])
            })));

            setVehicles((fleetData || []).map((v: any) => ({
                ...v,
                driver_name: v.driver?.contact_name
            })));

        } catch (err: unknown) {
            console.error('Error fetching planner data:', err);
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
        <div style={{ display: 'grid', gridTemplateColumns: '450px 1fr', gap: '2rem', height: '100%', minHeight: 0 }}>
            {/* Orders Sidebar */}
            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: '24px', 
                border: '1px solid #E5E7EB', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden',
                minHeight: 0
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '900', color: '#374151' }}>PEDIDOS PICKING</h3>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#E5E7EB', color: '#4B5563', padding: '0.3rem 0.6rem', borderRadius: '8px', fontWeight: '800' }}>
                            {orders.length} DISPONIBLES
                        </span>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem', paddingRight: '0.5rem' }}>
                    {orders.map(order => {
                        const isAssigned = Object.values(assignments).some(ids => ids.includes(order.id));
                        return (
                            <div 
                                key={order.id} 
                                draggable
                                onDragStart={(e) => handleDragStart(e, order.id)}
                                style={{ 
                                    padding: '1.2rem', 
                                    borderRadius: '20px', 
                                    border: isAssigned ? '1px solid #99F6E4' : '1px solid #E5E7EB', 
                                    marginBottom: '1.2rem',
                                    backgroundColor: isAssigned ? '#F0FDFA' : 'white',
                                    transition: 'all 0.2s',
                                    boxShadow: isAssigned ? 'none' : '0 4px 10px rgba(0,0,0,0.03)',
                                    cursor: 'grab'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '900', color: order.is_b2b ? '#0369A1' : '#6D28D9', backgroundColor: order.is_b2b ? '#E0F2FE' : '#EDE9FE', padding: '0.3rem 0.6rem', borderRadius: '8px', letterSpacing: '0.05rem' }}>
                                        {order.is_b2b ? 'B2B (Institucional)' : 'B2C (Consumidor)'}
                                    </span>
                                    <span style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '800', backgroundColor: '#F3F4F6', padding: '0.3rem 0.6rem', borderRadius: '8px' }}>
                                        ID-{order.id.slice(0, 6)}
                                    </span>
                                </div>
                                
                                <div style={{ fontWeight: '900', fontSize: '1.05rem', color: '#111827', marginBottom: '1rem', lineHeight: '1.2' }}>{order.customer_name}</div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: isAssigned ? '#CCFBF1' : '#F8FAFC', padding: '0.6rem', borderRadius: '12px', border: isAssigned ? '1px solid #99F6E4' : '1px solid #E2E8F0' }}>
                                        <span style={{ fontSize: '0.6rem', color: isAssigned ? '#0D9488' : '#64748B', fontWeight: '900', marginBottom: '0.2rem' }}>ZONA DE ENTREGA</span>
                                        <span style={{ fontSize: '0.75rem', color: '#1E293B', fontWeight: '800' }}>📍 {order.delivery_zone || 'Por asignar'}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: isAssigned ? '#CCFBF1' : '#F8FAFC', padding: '0.6rem', borderRadius: '12px', border: isAssigned ? '1px solid #99F6E4' : '1px solid #E2E8F0' }}>
                                        <span style={{ fontSize: '0.6rem', color: isAssigned ? '#0D9488' : '#64748B', fontWeight: '900', marginBottom: '0.2rem' }}>PESO TOTAL</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#1E293B', fontWeight: '800' }}>📦 {order.total_weight_kg} kg</span>
                                            <span style={{ fontSize: '0.6rem', color: '#64748B', fontWeight: '700', backgroundColor: '#F1F5F9', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                                                🧺 {Math.ceil(order.total_weight_kg / params.avg_kg_per_crate)}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: isAssigned ? 'rgba(255, 255, 255, 0.5)' : '#FEF3C7', padding: '0.5rem 0.8rem', borderRadius: '12px', border: isAssigned ? 'none' : '1px solid #FDE68A' }}>
                                        <span style={{ fontSize: '0.7rem', color: isAssigned ? '#0F766E' : '#B45309', fontWeight: '900' }}>🕒 Franja:</span>
                                        <span style={{ fontSize: '0.7rem', color: isAssigned ? '#115E59' : '#92400E', fontWeight: '800' }}>{order.delivery_slot || 'Abierta'}</span>
                                    </div>
                                    {isAssigned && (
                                        <div style={{ backgroundColor: '#10B981', color: 'white', fontSize: '0.65rem', fontWeight: '900', letterSpacing: '0.05rem', padding: '0.4rem 0.8rem', borderRadius: '12px', boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)' }}>
                                            ASIGNADO
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Planning Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', position: 'relative', minHeight: 0 }}>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    backgroundColor: '#F0FDFA', 
                    padding: '1.5rem', 
                    borderRadius: '24px', 
                    border: '1px solid #CCFBF1' 
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <div style={{ fontWeight: '900', color: '#0D9488', fontSize: '1.1rem' }}>✨ Google Magic Optimizer</div>
                            <button 
                                onClick={() => setShowSettings(true)}
                                style={{ 
                                    backgroundColor: 'white', 
                                    border: '1px solid #CCFBF1', 
                                    borderRadius: '8px', 
                                    padding: '0.3rem 0.6rem', 
                                    fontSize: '0.7rem', 
                                    color: '#0D9488', 
                                    fontWeight: '800', 
                                    cursor: 'pointer' 
                                }}
                            >
                                ⚙️ Parámetros
                            </button>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#0D9488', marginTop: '0.2rem' }}>
                            {params.b2b_kg_min} kg/min (B2B) • {params.b2c_kg_min} kg/min (B2C)
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        {Object.keys(assignments).some(k => assignments[k].length > 0) && (
                            <button 
                                onClick={handleConfirmRoutes}
                                disabled={loading}
                                style={{ 
                                    padding: '1rem 1.5rem', 
                                    borderRadius: '16px', 
                                    backgroundColor: '#10B981', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '900', 
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)',
                                    transition: 'all 0.2s'
                                }}
                            >
                                ✅ Confirmar y Despachar
                            </button>
                        )}
                        <button 
                            onClick={handleAutoOptimize}
                            disabled={optimizing}
                            style={{ 
                                padding: '1rem 2rem', 
                                borderRadius: '16px', 
                                backgroundColor: optimizing ? '#94A3B8' : '#0891B2', 
                                color: 'white', 
                                border: 'none', 
                                fontWeight: '900', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.7rem',
                                fontSize: '0.9rem',
                                boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.2)',
                                transition: 'all 0.2s'
                            }}
                        >
                            {optimizing ? 'Simulando Motores...' : '🚀 Ejecutar Optimización'}
                        </button>
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
                                    min="8" 
                                    max="18" 
                                    step="0.01"
                                    value={params.avg_kg_per_crate} 
                                    onChange={(e) => updateParameter('avg_kg_per_crate', parseFloat(e.target.value))}
                                    style={{ width: '100%', accentColor: '#0891B2', cursor: 'grab' }}
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.3rem', fontSize: '0.55rem', color: '#94A3B8', fontWeight: '700' }}>
                                    <span>8 kg</span>
                                    <span>12.24 kg (Estándar)</span>
                                    <span>18 kg</span>
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
                    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', 
                    gap: '1.5rem', 
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
                                    borderRadius: '24px', 
                                    border: isOverloaded ? '2px solid #EF4444' : '1px solid #E5E7EB', 
                                    padding: '1.5rem',
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                                    transition: 'border 0.3s'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.2rem', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '900', fontSize: '1.1rem', color: '#111827' }}>🚛 {vehicle.plate}</div>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            color: vehicle.driver?.contact_name ? '#0891B2' : '#94A3B8',
                                            fontWeight: '700',
                                            marginTop: '0.4rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.3rem'
                                        }}>
                                            👤 {vehicle.driver?.contact_name || 'Sin conductor asignado'}
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
