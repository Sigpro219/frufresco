'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface Vehicle {
    id: string;
    plate: string;
    brand: string;
    model: string;
    vehicle_type: string;
    capacity_kg: number;
    status: 'available' | 'on_route' | 'maintenance' | 'inactive';
    driver_id?: string;
    current_odometer: number;
    avg_daily_km: number;
    driver?: {
        contact_name: string;
    };
    maintenance_schedules?: {
        id: string;
        task_name: string;
        next_due_km: number;
        next_due_date: string;
        task_type: 'km' | 'date';
    }[];
    active_route?: {
        id: string;
        total_orders: number;
        route_stops: { status: string; }[];
    } | null;
}

export default function FleetManagement() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [showAdd, setShowAdd] = useState(false);
    const isMounted = useRef(true);
    const [drivers, setDrivers] = useState<{id: string, contact_name: string}[]>([]);
    const [editingKm, setEditingKm] = useState<{id: string, value: number} | null>(null);
    const [newVehicle, setNewVehicle] = useState({
        plate: '',
        brand: '',
        model: '',
        vehicle_type: 'Furgón',
        capacity_kg: 1000,
        current_odometer: 0
    });
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [vehicleIssues, setVehicleIssues] = useState<any[]>([]);

    const fetchDrivers = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, contact_name')
                .or('role.eq.driver,specialty.ilike.%conductor%')
                .order('contact_name');
            
            if (!isMounted.current) return;
            if (error) throw error;
            setDrivers(data || []);
        } catch (err: unknown) {
            if (!isMounted.current) return;
            const error = err as { message?: string, code?: string, name?: string };
            if (error.message?.includes('aborted') || error.code === 'ABORTED' || error.name === 'AbortError') {
                return;
            }
            console.error('Error fetching drivers:', error.message || error);
        }
    }, []);

    const fetchVehicles = useCallback(async () => {
        try {
            // 1. Fetch main vehicle info
            const { data: vehiclesData, error } = await supabase
                .from('fleet_vehicles')
                .select('*, driver:profiles(contact_name), maintenance_schedules(*)')
                .order('plate', { ascending: true });

            if (!isMounted.current) return;
            if (error) throw error;

            // 2. Fetch active routes for these vehicles to calculate progress and dynamic avg
            const plates = vehiclesData?.map(v => v.plate) || [];
            const { data: routesData } = await supabase
                .from('routes')
                .select('id, vehicle_plate, status, total_orders, start_time, route_stops(status)')
                .in('vehicle_plate', plates)
                .order('start_time', { ascending: false });

            // 3. Enrich vehicles with route data and calculate dynamic avg_daily_km
            const enrichedVehicles = vehiclesData?.map(v => {
                const vRoutes = (routesData as any[])?.filter(r => r.vehicle_plate === v.plate) || [];
                const activeRoute = vRoutes.find(r => r.status === 'in_transit' || r.status === 'loading');
                
                // Check for dynamic avg_daily_km (last 30 days) - Future implementation
                const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const recentRoutes = vRoutes.filter(r => r.start_time > thirtyDaysAgo && r.status === 'completed');
                
                if (recentRoutes.length > 0) {
                    console.debug(`Found ${recentRoutes.length} recent routes for ${v.plate}`);
                }

                return {
                    ...v,
                    maintenance_schedules: v.maintenance_schedules?.sort((a: any, b: any) => 
                        (a.next_due_km || 999999) - (b.next_due_km || 999999)
                    ),
                    active_route: activeRoute ? {
                        id: activeRoute.id,
                        total_orders: activeRoute.total_orders || 0,
                        route_stops: activeRoute.route_stops || []
                    } : null
                };
            });

            setVehicles(enrichedVehicles || []);
        } catch (err: unknown) {
            if (!isMounted.current) return;
            const error = err as { message?: string, code?: string, name?: string };
            console.error('Error fetching vehicles:', error.message || error);
        }
    }, []);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            await Promise.all([fetchVehicles(), fetchDrivers()]);
            if (isMounted.current) setLastUpdated(new Date());
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [fetchVehicles, fetchDrivers]);

    useEffect(() => {
        isMounted.current = true;
        loadData();
        return () => { isMounted.current = false; };
    }, [loadData]);

    const updateOdometer = async (id: string, newValue: number) => {
        try {
            const { error } = await supabase
                .from('fleet_vehicles')
                .update({ current_odometer: newValue, last_odometer_update: new Date().toISOString() })
                .eq('id', id);
            
            if (error) throw error;
            setEditingKm(null);
            fetchVehicles();
        } catch {
            alert('Error al actualizar kilometraje.');
        }
    };

    const assignDriver = async (vehicleId: string, driverId: string) => {
        try {
            const { error } = await supabase
                .from('fleet_vehicles')
                .update({ driver_id: driverId || null })
                .eq('id', vehicleId);
            
            if (error) throw error;
            fetchVehicles();
        } catch (err) {
            console.error('Error assigning driver:', err);
            alert('Error al asignar conductor.');
        }
    };

    const updateStatus = async (vehicleId: string, newStatus: string) => {
        try {
            const { error } = await supabase
                .from('fleet_vehicles')
                .update({ status: newStatus })
                .eq('id', vehicleId);
            
            if (error) throw error;
            fetchVehicles();
        } catch (err) {
            console.error('Error updating status:', err);
            alert('Error al actualizar el estado del vehículo.');
        }
    };

    const handleAddVehicle = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const { error } = await supabase
                .from('fleet_vehicles')
                .insert([newVehicle]);

            if (error) throw error;
            setShowAdd(false);
            fetchVehicles();
            setNewVehicle({ plate: '', brand: '', model: '', vehicle_type: 'Furgón', capacity_kg: 1000, current_odometer: 0 });
        } catch (err) {
            console.error('Error adding vehicle:', err);
            alert('Error al agregar vehículo.');
        }
    };

    const fetchVehicleDetails = async (vehicle: Vehicle) => {
        setSelectedVehicle(vehicle);
        setLoadingDetails(true);
        try {
            // Fetch issues/events for this vehicle
            const { data: issues } = await supabase
                .from('delivery_events')
                .select('*')
                .ilike('description', `%${vehicle.plate}%`)
                .in('event_type', ['rejection', 'cancellation', 'partial_rejection', 'activity_operation'])
                .order('created_at', { ascending: false })
                .limit(20);
            
            setVehicleIssues(issues || []);
        } catch (err) {
            console.error('Error fetching vehicle issues:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    return (
        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '1.5rem', border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900' }}>Control de <span style={{ color: '#0891B2' }}>Activos Logísticos</span></h2>
                    {lastUpdated && (
                        <p style={{ margin: 0, fontSize: '0.7rem', color: '#9CA3AF', fontWeight: '600' }}>
                            ÚLTIMA ACTUALIZACIÓN: {lastUpdated.toLocaleTimeString()}
                        </p>
                    )}
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                        onClick={loadData}
                        disabled={loading}
                        style={{ 
                            padding: '0.6rem 1.2rem', borderRadius: '12px', 
                            backgroundColor: '#F3F4F6', color: '#4B5563', border: '1px solid #E5E7EB', 
                            fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        {loading ? '🔄 Cargando...' : '🔃 Sincronizar'}
                    </button>
                    <button 
                        onClick={() => setShowAdd(!showAdd)}
                        style={{ 
                            padding: '0.6rem 1.2rem', borderRadius: '12px', 
                            backgroundColor: '#0891B2', color: 'white', border: 'none', 
                            fontWeight: '700', cursor: 'pointer' 
                        }}
                    >
                        {showAdd ? 'Cancelar' : '+ Registrar Vehículo'}
                    </button>
                </div>
            </div>

            {showAdd && (
                <form onSubmit={handleAddVehicle} style={{ 
                    backgroundColor: '#F9FAFB', padding: '2rem', borderRadius: '32px', 
                    marginBottom: '2rem', border: '1px solid #E5E7EB',
                    boxShadow: 'inset 0 2px 4px 0 rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#374151', display: 'block', marginBottom: '0.6rem', letterSpacing: '0.05rem' }}>PLACA</label>
                            <input required placeholder="Ej: ABC-123" value={newVehicle.plate} onChange={e => setNewVehicle({...newVehicle, plate: e.target.value.toUpperCase()})} style={{ width: '100%', padding: '0.9rem 1.2rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#374151', display: 'block', marginBottom: '0.6rem', letterSpacing: '0.05rem' }}>MARCA</label>
                            <input required placeholder="Ej: Chevrolet" value={newVehicle.brand} onChange={e => setNewVehicle({...newVehicle, brand: e.target.value})} style={{ width: '100%', padding: '0.9rem 1.2rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#374151', display: 'block', marginBottom: '0.6rem', letterSpacing: '0.05rem' }}>MODELO (AÑO / LÍNEA)</label>
                            <input required placeholder="Ej: 2024 NHR" value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} style={{ width: '100%', padding: '0.9rem 1.2rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#374151', display: 'block', marginBottom: '0.6rem', letterSpacing: '0.05rem' }}>TIPO DE CARROCERÍA</label>
                            <select value={newVehicle.vehicle_type} onChange={e => setNewVehicle({...newVehicle, vehicle_type: e.target.value})} style={{ width: '100%', padding: '0.9rem 1.2rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontWeight: '600', backgroundColor: 'white' }}>
                                <option value="Furgón">Furgón</option>
                                <option value="Camión">Camión</option>
                                <option value="Turbo">Turbo</option>
                                <option value="Refrigerado">Refrigerado</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#374151', display: 'block', marginBottom: '0.6rem', letterSpacing: '0.05rem' }}>CAPACIDAD (KG)</label>
                            <input type="number" required placeholder="Ej: 1500" value={newVehicle.capacity_kg} onChange={e => setNewVehicle({...newVehicle, capacity_kg: parseInt(e.target.value) || 0})} style={{ width: '100%', padding: '0.9rem 1.2rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', color: '#374151', display: 'block', marginBottom: '0.6rem', letterSpacing: '0.05rem' }}>ODÓMETRO INICIAL (KM)</label>
                            <input type="number" value={newVehicle.current_odometer} onChange={e => setNewVehicle({...newVehicle, current_odometer: parseInt(e.target.value) || 0})} style={{ width: '100%', padding: '0.9rem 1.2rem', borderRadius: '14px', border: '1px solid #D1D5DB', fontWeight: '600' }} />
                        </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" style={{ 
                            padding: '1rem 3rem', borderRadius: '16px', 
                            backgroundColor: '#10B981', color: 'white', border: 'none', 
                            fontWeight: '900', cursor: 'pointer', fontSize: '1rem',
                            boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)'
                        }}>
                            CONFIRMAR REGISTRO
                        </button>
                    </div>
                </form>
            )}

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '2px solid #F3F4F6' }}>
                            <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280', letterSpacing: '0.05rem' }}>VEHÍCULO</th>
                            <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280', letterSpacing: '0.05rem' }}>INFO TÉCNICA</th>
                            <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280', letterSpacing: '0.05rem' }}>MANTENIMIENTO</th>
                            <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280', letterSpacing: '0.05rem' }}>OPERACIÓN</th>
                            <th style={{ padding: '1rem', fontSize: '0.75rem', color: '#6B7280', letterSpacing: '0.05rem' }}>ESTADO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && vehicles.length === 0 ? (
                             [...Array(3)].map((_, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', opacity: 0.5 }}>
                                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}>
                                        <div style={{ height: '20px', backgroundColor: '#F3F4F6', borderRadius: '10px', width: '80%', margin: '0 auto', animation: 'pulse 1.5s infinite' }}></div>
                                    </td>
                                </tr>
                            ))
                        ) : vehicles.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '4rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚛</div>
                                    <h3 style={{ color: '#6B7280', margin: 0 }}>No hay vehículos registrados</h3>
                                    <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>Da clic en &quot;Registrar Vehículo&quot; para iniciar la flota.</p>
                                </td>
                            </tr>
                        ) : (
                            vehicles.map(v => {
                                const nextMaint = v.maintenance_schedules?.[0];
                                const isUrgent = nextMaint && (
                                    (nextMaint.task_type === 'km' && (nextMaint.next_due_km - v.current_odometer <= 500)) ||
                                    (nextMaint.task_type === 'date' && new Date(nextMaint.next_due_date) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
                                );

                                return (
                                    <tr key={v.id} style={{ borderBottom: '1px solid #F3F4F6', cursor: 'pointer' }} onClick={() => fetchVehicleDetails(v)}>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: '900', color: '#111827', fontSize: '1rem' }}>{v.plate}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700' }}>
                                                {v.brand} {v.model}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ fontWeight: '800', fontSize: '0.85rem' }}>{v.capacity_kg?.toLocaleString()} <span style={{ color: '#94A3B8' }}>KG</span></div>
                                            <div style={{ fontSize: '0.7rem', color: '#0891B2', fontWeight: '900' }}>{v.vehicle_type.toUpperCase()}</div>
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {nextMaint ? (
                                                <div>
                                                    <div style={{ fontSize: '0.8rem', fontWeight: '800', color: isUrgent ? '#EF4444' : '#1E293B' }}>
                                                        {isUrgent ? '🚨' : '🔧'} {nextMaint.task_name}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700' }}>
                                                        {nextMaint.task_type === 'km' ? `En ${(nextMaint.next_due_km - v.current_odometer).toLocaleString()} km` : `Vence ${nextMaint.next_due_date}`}
                                                    </div>
                                                </div>
                                            ) : (
                                                <span style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700' }}>Sin programar</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            {v.active_route ? (
                                                <div style={{ width: '120px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', marginBottom: '4px' }}>
                                                        <span style={{ color: '#0891B2', fontWeight: '900' }}>EN RUTA</span>
                                                        <span style={{ color: '#64748B', fontWeight: '700' }}>{Math.round((v.active_route.route_stops.filter(s => s.status === 'delivered').length / v.active_route.route_stops.length) * 100)}%</span>
                                                    </div>
                                                    <div style={{ height: '4px', backgroundColor: '#E5E7EB', borderRadius: '10px', overflow: 'hidden' }}>
                                                        <div style={{ 
                                                            width: `${(v.active_route.route_stops.filter(s => s.status === 'delivered').length / v.active_route.route_stops.length) * 100}%`, 
                                                            height: '100%', backgroundColor: '#0891B2' 
                                                        }}></div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700' }}>
                                                    {v.driver?.contact_name ? `👨🏻‍✈️ ${v.driver.contact_name}` : '❌ Sin conductor'}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '1rem' }}>
                                            <div style={{ 
                                                padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: '900', textAlign: 'center', width: 'fit-content',
                                                backgroundColor: v.status === 'available' ? '#DCFCE7' : v.status === 'on_route' ? '#DBEAFE' : v.status === 'maintenance' ? '#FEF9C3' : '#F3F4F6',
                                                color: v.status === 'available' ? '#166534' : v.status === 'on_route' ? '#1E40AF' : v.status === 'maintenance' ? '#854D0E' : '#4B5563',
                                            }}>
                                                {v.status === 'available' ? 'DISPONIBLE' : v.status === 'on_route' ? 'EN RUTA' : v.status === 'maintenance' ? 'TALLER' : 'INACTIVO'}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Vehicle Details Modal */}
            {selectedVehicle && (
                <div style={{ 
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '2rem'
                }}>
                    <div style={{ 
                        backgroundColor: 'white', borderRadius: '32px', width: '100%', maxWidth: '900px', 
                        maxHeight: '90vh', overflowY: 'auto', position: 'relative', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' 
                    }}>
                        <button 
                            onClick={() => setSelectedVehicle(null)}
                            style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', background: '#F1F5F9', border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}
                        >✕</button>

                        <div style={{ padding: '2.5rem' }}>
                            <div style={{ display: 'flex', gap: '2rem', marginBottom: '2.5rem', alignItems: 'center' }}>
                                <div style={{ 
                                    width: '100px', height: '100px', borderRadius: '24px', 
                                    background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '2.5rem'
                                }}>🚛</div>
                                <div>
                                    <h2 style={{ fontSize: '2.2rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>{selectedVehicle.plate}</h2>
                                    <p style={{ color: '#64748B', fontSize: '1.1rem', margin: '4px 0', fontWeight: '700' }}>{selectedVehicle.brand} {selectedVehicle.model} • {selectedVehicle.vehicle_type}</p>
                                </div>
                            </div>

                            {/* Actions Group */}
                            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', flexWrap: 'wrap', marginBottom: '2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#F8FAFC', padding: '0.4rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B' }}>ODO:</span>
                                    {editingKm?.id === selectedVehicle.id ? (
                                        <input 
                                            type="number" 
                                            autoFocus
                                            value={editingKm.value} 
                                            onChange={e => setEditingKm({...editingKm, value: parseInt(e.target.value) || 0})}
                                            onBlur={() => updateOdometer(selectedVehicle.id, editingKm.value)}
                                            onKeyDown={e => e.key === 'Enter' && updateOdometer(selectedVehicle.id, editingKm.value)}
                                            style={{ width: '80px', padding: '0.2rem', borderRadius: '4px', border: '1px solid #0891B2' }}
                                        />
                                    ) : (
                                        <span onClick={() => setEditingKm({id: selectedVehicle.id, value: selectedVehicle.current_odometer})} style={{ cursor: 'pointer', fontWeight: '900', color: '#1E293B', fontSize: '0.85rem' }}>
                                            {selectedVehicle.current_odometer.toLocaleString()} km 📝
                                        </span>
                                    )}
                                </div>
                                
                                <select 
                                    value={selectedVehicle.driver_id || ''}
                                    onChange={(e) => assignDriver(selectedVehicle.id, e.target.value)}
                                    style={{ padding: '0.4rem 1rem', borderRadius: '12px', border: '1px solid #E2E8F0', fontSize: '0.8rem', fontWeight: '700', backgroundColor: '#F8FAFC' }}
                                >
                                    <option value="">-- Sin Piloto --</option>
                                    {drivers.map(d => (
                                        <option key={d.id} value={d.id}>{d.contact_name}</option>
                                    ))}
                                </select>

                                <select 
                                    value={selectedVehicle.status}
                                    onChange={(e) => updateStatus(selectedVehicle.id, e.target.value)}
                                    style={{ 
                                        padding: '0.4rem 1rem', borderRadius: '12px', border: 'none', fontSize: '0.75rem', fontWeight: '900',
                                        backgroundColor: selectedVehicle.status === 'available' ? '#DCFCE7' : selectedVehicle.status === 'on_route' ? '#DBEAFE' : '#FEF9C3',
                                        color: selectedVehicle.status === 'available' ? '#166534' : selectedVehicle.status === 'on_route' ? '#1E40AF' : '#854D0E',
                                    }}
                                >
                                    <option value="available">DISPONIBLE</option>
                                    <option value="on_route" disabled>EN RUTA</option>
                                    <option value="maintenance">TALLER</option>
                                    <option value="inactive">INACTIVO</option>
                                </select>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                                {/* Left Column: Maintenance & Events */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <section>
                                        <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            🛠️ MANTENIMIENTOS PROGRAMADOS
                                        </h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                            {selectedVehicle.maintenance_schedules?.map(s => (
                                                <div key={s.id} style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: '800', color: '#1E293B' }}>{s.task_name}</span>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: '900', color: '#0891B2' }}>{s.task_type.toUpperCase()}</span>
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: '700' }}>
                                                        {s.task_type === 'km' ? `Próximo: ${s.next_due_km.toLocaleString()} km` : `Vence: ${s.next_due_date}`}
                                                    </div>
                                                </div>
                                            ))}
                                            {(!selectedVehicle.maintenance_schedules || selectedVehicle.maintenance_schedules.length === 0) && (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem', fontWeight: '600', backgroundColor: '#F8FAFC', borderRadius: '16px' }}>
                                                    No hay mantenimientos activos.
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>

                                {/* Right Column: Issues Gallery */}
                                <div>
                                    <h3 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#1E293B', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        🚨 BITÁCORA DE NOVEDADES Y DAÑOS
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {loadingDetails ? (
                                            <div style={{ textAlign: 'center', padding: '2rem' }}><div className="loader" style={{ margin: '0 auto' }}></div></div>
                                        ) : vehicleIssues.length > 0 ? (
                                            vehicleIssues.map((issue, idx) => (
                                                <div key={idx} style={{ padding: '1rem', backgroundColor: '#FFF7ED', borderRadius: '16px', border: '1px solid #FFEDD5' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '0.7rem', fontWeight: '900', color: '#C2410C' }}>{issue.event_type.toUpperCase()}</span>
                                                        <span style={{ fontSize: '0.65rem', color: '#9A3412', fontWeight: '700' }}>{new Date(issue.created_at).toLocaleDateString()}</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.8rem', margin: 0, fontWeight: '600', color: '#431407' }}>{issue.description}</p>
                                                    {issue.evidence_url && (
                                                        <div style={{ marginTop: '0.8rem' }}>
                                                            <img 
                                                                src={issue.evidence_url} 
                                                                alt="Evidencia" 
                                                                style={{ width: '100%', height: '120px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #FED7AA' }} 
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem', fontWeight: '600', backgroundColor: '#F8FAFC', borderRadius: '16px' }}>
                                                Sin novedades registradas.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes pulse {
                    0% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.98); }
                    100% { opacity: 1; transform: scale(1); }
                }
            `}</style>
        </div>
    );
}
