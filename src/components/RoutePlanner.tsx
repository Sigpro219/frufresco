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
        base_setup_time: 5
    });
    const [assignments, setAssignments] = useState<Record<string, string[]>>({}); 
    const isMounted = useRef(true);

    const [drivers, setDrivers] = useState<{id: string, contact_name: string}[]>([]);

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
                paramData.forEach(p => pMap[p.id] = parseFloat(p.value));
                setParams(pMap);
            }

            const { data: orderData, error: oErr } = await supabase
                .from('orders')
                .select('*')
                .eq('status', 'approved'); 

            if (!isMounted.current) return;
            if (oErr) throw oErr;

            const { data: fleetData, error: fErr } = await supabase
                .from('fleet_vehicles')
                .select('*, driver:profiles(contact_name)')
                .eq('status', 'available');

            if (!isMounted.current) return;
            if (fErr) throw fErr;

            const { data: driverData, error: dErr } = await supabase
                .from('profiles')
                .select('id, contact_name')
                .or('role.eq.driver,specialty.ilike.%conductor%')
                .order('contact_name');

            if (!isMounted.current) return;
            if (dErr) throw dErr;

            setDrivers(driverData || []);

            // Use actual total_weight_kg if available, otherwise mock for UI dev
            setOrders((orderData || []).map(o => ({
                ...o,
                total_weight_kg: o.total_weight_kg || Math.floor(Math.random() * 200) + 50
            })));

            setVehicles((fleetData || []).map(v => ({
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
                setTheoreticalMetrics({ distance_km: assignments.length * 2, duration_min: assignments.length * 15 }); // Mock metrics for simulation
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

    const assignDriverToVehicle = async (vehicleId: string, driverId: string) => {
        try {
            if (driverId) {
                await supabase
                    .from('fleet_vehicles')
                    .update({ driver_id: null })
                    .eq('driver_id', driverId);
            }

            const { error } = await supabase
                .from('fleet_vehicles')
                .update({ driver_id: driverId || null })
                .eq('id', vehicleId);
            
            if (error) throw error;
            await fetchInitialData();
            
        } catch (err) {
            console.error('Error in planner driver assignment:', err);
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
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '2rem', height: '100%' }}>
            {/* Orders Sidebar */}
            <div style={{ 
                backgroundColor: 'white', 
                borderRadius: '24px', 
                border: '1px solid #E5E7EB', 
                display: 'flex', 
                flexDirection: 'column', 
                overflow: 'hidden' 
            }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #F3F4F6', backgroundColor: '#F9FAFB' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '900', color: '#374151' }}>PEDIDOS PICKING</h3>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#E5E7EB', color: '#4B5563', padding: '0.3rem 0.6rem', borderRadius: '8px', fontWeight: '800' }}>
                            {orders.length} DISPONIBLES
                        </span>
                    </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem' }}>
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
                                    border: isAssigned ? '1px solid #0D9488' : '1px solid #F3F4F6', 
                                    marginBottom: '1rem',
                                    backgroundColor: isAssigned ? '#F0FDFA' : 'white',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                    cursor: 'grab'
                                }}
                            >
                                <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111827' }}>{order.customer_name}</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.6rem', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', gap: '0.8rem' }}>
                                        <span style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: '700' }}>📦 {order.total_weight_kg}kg</span>
                                        <span style={{ fontSize: '0.7rem', color: '#0891B2', fontWeight: '900' }}>🕒 {order.delivery_slot}</span>
                                    </div>
                                    {isAssigned && <span style={{ color: '#10B981', fontSize: '0.8rem' }}>✅</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Planning Area */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', position: 'relative' }}>
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
                        </div>
                        <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', fontSize: '0.65rem', color: '#64748B', lineHeight: '1.4' }}>
                            💡 Estos valores afectan el cálculo de `service_duration` enviado a Google Maps.
                        </div>
                    </div>
                )}

                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                    gap: '1.5rem', 
                    flex: 1, 
                    overflowY: 'auto'
                }}>
                    {vehicles.map(vehicle => {
                        const load = getVehicleLoad(vehicle.id);
                        const progress = (load / vehicle.capacity_kg) * 100;
                        const assignedOrders = assignments[vehicle.id] || [];
                        const isOverloaded = load > vehicle.capacity_kg;

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
                                        <select 
                                            value={vehicle.driver_id || ''}
                                            onChange={(e) => assignDriverToVehicle(vehicle.id, e.target.value)}
                                            style={{ 
                                                fontSize: '0.75rem', 
                                                color: '#0891B2', 
                                                fontWeight: '800', 
                                                marginTop: '0.4rem',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '8px',
                                                padding: '0.2rem 0.4rem',
                                                backgroundColor: '#F8FAFC',
                                                width: '100%',
                                                cursor: 'pointer',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="">👤 Sin Piloto</option>
                                            {drivers.map(d => {
                                                const isAssignedToOther = vehicles.some(v => v.driver_id === d.id && v.id !== vehicle.id);
                                                return (
                                                    <option key={d.id} value={d.id} disabled={isAssignedToOther}>
                                                        {d.contact_name} {isAssignedToOther ? '(Ocupado)' : ''}
                                                    </option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '900', color: isOverloaded ? '#EF4444' : '#0D9488' }}>
                                            {load} / {vehicle.capacity_kg} kg
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: '700' }}>CARGA UTIL</div>
                                    </div>
                                </div>

                                <div style={{ height: '6px', backgroundColor: '#F3F4F6', borderRadius: '10px', marginBottom: '1.5rem', overflow: 'hidden' }}>
                                    <div style={{ 
                                        width: `${Math.min(progress, 100)}%`, 
                                        height: '100%', 
                                        backgroundColor: isOverloaded ? '#EF4444' : '#10B981', 
                                        transition: 'width 0.5s ease-out'
                                    }}></div>
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
                                            return (
                                                <div 
                                                    key={oid} 
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, oid)}
                                                    style={{ 
                                                        padding: '0.8rem 1rem', 
                                                        backgroundColor: '#F9FAFB', 
                                                        borderRadius: '16px', 
                                                        fontSize: '0.8rem', 
                                                        fontWeight: '700', 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between',
                                                        border: '1px solid #F3F4F6',
                                                        color: '#374151',
                                                        cursor: 'grab'
                                                    }}
                                                >
                                                    <span>📦 {order?.customer_name}</span>
                                                    <span 
                                                        style={{ cursor: 'pointer', color: '#EF4444' }} 
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
