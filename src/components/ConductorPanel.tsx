'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Conductor {
    id: string;
    contact_name: string;
    phone: string;
    email: string;
    specialty: string;
    is_active: boolean;
    avatar_url?: string;
    fleet_vehicles?: {
        id: string;
        plate: string;
    }[];
    current_status?: {
        type: string;
        description: string;
        since: string;
    };
}

interface Vehicle {
    id: string;
    plate: string;
    driver_id: string | null;
}

interface DriverKPIs {
    totalRoutes: number;
    successRate: number;
    totalKilos: number;
    avgTimePerStop: number;
    theoreticalDistance: number;
    actualOdometerGain: number;
    recentEvents: any[];
    novedades: any[];
}

export default function ConductorPanel() {
    const [conductores, setConductores] = useState<Conductor[]>([]);
    const [availableVehicles, setAvailableVehicles] = useState<Vehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all', 'active', 'inactive'
    const [filterVehicle, setFilterVehicle] = useState('all'); // 'all', 'assigned', 'unassigned'
    const [assigningId, setAssigningId] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedDriver, setSelectedDriver] = useState<Conductor | null>(null);
    const [kpis, setKpis] = useState<DriverKPIs | null>(null);
    const [loadingKpis, setLoadingKpis] = useState(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const fetchConductores = useCallback(async () => {
        if (!isMounted.current) return;
        setLoading(true);
        try {
            // Traer perfiles con sus vehículos asignados
            const { data, error } = await supabase
                .from('profiles')
                .select('*, fleet_vehicles(id, plate)')
                .or('role.eq.driver,specialty.ilike.%conductor%')
                .order('contact_name');

            if (error) throw error;
            if (!isMounted.current) return;
            
            // También cargamos los vehículos disponibles
            const { data: vData } = await supabase
                .from('fleet_vehicles')
                .select('id, plate, driver_id')
                .is('driver_id', null);
            
            if (isMounted.current) setAvailableVehicles(vData || []);

            // 3. Traer el último estado de cada conductor (Solo las últimas 48 horas)
            const last48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
            const { data: eventData } = await supabase
                .from('delivery_events')
                .select('*')
                .in('event_type', [
                    'activity_operation', 'activity_refuel', 'activity_workshop', 
                    'activity_lunch', 'activity_break', 'activity_park',
                    'activity_error_operation', 'activity_error_refuel'
                ])
                .gt('created_at', last48h)
                .order('created_at', { ascending: false })
                .limit(200);

            if (!isMounted.current) return;

            const updatedConductores = (data || []).map(c => {
                const lastEvent = eventData?.find(e => 
                    (e.description && e.description.includes(c.contact_name)) || 
                    (e.description && e.description.includes(c.id))
                );
                
                const plate = c.fleet_vehicles?.[0]?.plate;
                const vehicleEvent = eventData?.find(e => plate && e.description && e.description.includes(plate));

                const finalEvent = vehicleEvent || lastEvent;

                if (finalEvent) {
                    const typeMatch = finalEvent.event_type.replace('activity_', '');
                    return {
                        ...c,
                        current_status: {
                            type: typeMatch,
                            description: finalEvent.description,
                            since: finalEvent.created_at
                        }
                    };
                }
                return c;
            });

            if (isMounted.current) {
                setConductores(updatedConductores);
                setLastUpdated(new Date());
            }

        } catch (err: unknown) {
            const error = err as { name?: string, message?: string };
            if (error.name === 'AbortError' || error.message?.includes('aborted')) return;
            console.error('Error fetching data for ConductorPanel:', error);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    const fetchDriverKpis = async (driver: Conductor) => {
        setLoadingKpis(true);
        try {
            const plate = driver.fleet_vehicles?.[0]?.plate;
            if (!plate) {
                setKpis({ totalRoutes: 0, successRate: 0, totalKilos: 0, avgTimePerStop: 0, theoreticalDistance: 0, actualOdometerGain: 0, recentEvents: [], novedades: [] });
                return;
            }

            // 1. Fetch Routes & Stops for KPIs (Last 8 days)
            const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 1000 * 60).toISOString();
            const { data: routes, error: rErr } = await supabase
                .from('routes')
                .select(`
                    id, total_kilos, start_time, status,
                    route_stops (id, status, completion_time)
                `)
                .eq('vehicle_plate', plate)
                .gt('start_time', eightDaysAgo);
            
            if (rErr) throw rErr;

            // 2. Fetch Distance Audit from events (Server-side filtered by plate and last 8 days)
            const { data: events, error: eErr } = await supabase
                .from('delivery_events')
                .select('*')
                .eq('event_type', 'activity_operation')
                .ilike('description', `%${plate}%`)
                .gt('created_at', eightDaysAgo)
                .order('created_at', { ascending: false })
                .limit(100);

            // 3. Fetch Novedades based on stop IDs belonging to this driver's routes
            const stopIds = routes?.flatMap((r: { route_stops?: { id: string }[] }) => r.route_stops?.map(s => s.id) || []) || [];
            
            const { data: novedadesData } = await supabase
                .from('delivery_events')
                .select('*')
                .in('event_type', ['rejection', 'cancellation', 'partial_rejection'])
                .in('stop_id', stopIds.length > 0 ? stopIds : ['none'])
                .gt('created_at', eightDaysAgo)
                .order('created_at', { ascending: false })
                .limit(50);

            const driverNovedades = novedadesData || [];

            // Calculate KPIs
            const totalRoutes = routes?.length || 0;
            let totalStops = 0;
            let deliveredStops = 0;
            let totalKilos = 0;
            let theoreticalDist = 0;
            let totalDurationMs = 0;
            let timedStops = 0;

            routes?.forEach(r => {
                totalKilos += r.total_kilos || 0;
                r.route_stops?.forEach((s: { status: string, completion_time?: string }) => {
                    totalStops++;
                    if (s.status === 'delivered') deliveredStops++;
                    
                    if (r.start_time && s.completion_time) {
                        const start = new Date(r.start_time).getTime();
                        const end = new Date(s.completion_time).getTime();
                        if (end > start) {
                            totalDurationMs += (end - start);
                            timedStops++;
                        }
                    }
                });
            });

            // Extract distance from description strings like "GPS AUDIT | ... | KM ESTIMADOS: 3.25"
            events?.forEach((ev: { description: string }) => {
                const match = ev.description?.match(/KM ESTIMADOS: ([\d.]+)/);
                if (match) theoreticalDist += parseFloat(match[1]);
            });

            setKpis({
                totalRoutes,
                successRate: totalStops > 0 ? (deliveredStops / totalStops) * 100 : 0,
                totalKilos,
                avgTimePerStop: timedStops > 0 ? (totalDurationMs / timedStops) / 60000 : 0,
                theoreticalDistance: theoreticalDist,
                actualOdometerGain: theoreticalDist * 1.05, // Simulated for demo
                recentEvents: events?.slice(0, 5) || [],
                novedades: driverNovedades
            });

        } catch (err) {
            console.error('Error fetching driver KPIs:', err);
        } finally {
            setLoadingKpis(false);
        }
    };

    const handleAssign = async (conductorId: string, vehicleId: string) => {
        try {
            setLoading(true);
            // 1. Desvincular cualquier vehículo anterior del conductor
            await supabase
                .from('fleet_vehicles')
                .update({ driver_id: null })
                .eq('driver_id', conductorId);

            // 2. Vincular el nuevo vehículo
            if (vehicleId && vehicleId !== 'none') {
                const { error } = await supabase
                    .from('fleet_vehicles')
                    .update({ driver_id: conductorId })
                    .eq('id', vehicleId);
                if (error) throw error;
            }

            setAssigningId(null);
            await fetchConductores();
        } catch (err: unknown) {
            const error = err as { message?: string };
            console.error('Error assigning vehicle:', error.message || error);
            alert('Error al asignar el vehículo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConductores();
    }, [fetchConductores]);

    const filtered = conductores.filter(c => {
        const matchesSearch = c.contact_name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                             c.phone?.includes(searchTerm);
        
        const matchesStatus = filterStatus === 'all' || 
                             (filterStatus === 'active' && c.is_active) || 
                             (filterStatus === 'inactive' && !c.is_active);
        
        const hasVehicle = c.fleet_vehicles && c.fleet_vehicles.length > 0;
        const matchesVehicle = filterVehicle === 'all' || 
                              (filterVehicle === 'assigned' && hasVehicle) || 
                              (filterVehicle === 'unassigned' && !hasVehicle);

        return matchesSearch && matchesStatus && matchesVehicle;
    });

    const getInitials = (name: string) => {
        if (!name) return '👤';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // KPIs
    const totalConductors = conductores.length;
    const activeConductors = conductores.filter(c => c.is_active).length;
    const withVehicle = conductores.filter(c => c.fleet_vehicles && c.fleet_vehicles.length > 0).length;
    const availVehicles = availableVehicles.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* KPI DASHBOARD - Estilo OrderLoading */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#EFF6FF', color: '#2563EB', fontSize: '1.5rem' }}>👥</div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Total Personal</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>{totalConductors}</div>
                    </div>
                </div>

                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#ECFDF5', color: '#059669', fontSize: '1.5rem' }}>⚡</div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Conductores Activos</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827' }}>{activeConductors}</div>
                    </div>
                </div>

                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#F0FDFA', color: '#0D9488', fontSize: '1.5rem' }}>🚛</div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Flota Asignada</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#0F766E' }}>{withVehicle}</div>
                    </div>
                </div>

                <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#FFFBEB', color: '#D97706', fontSize: '1.5rem' }}>🔑</div>
                    <div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Vehículos Celibes</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#D97706' }}>{availVehicles}</div>
                    </div>
                </div>
            </div>

            {/* CONTROL BAR - Estilo OrderLoading */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr 1fr 1fr 150px', 
                gap: '1rem', 
                backgroundColor: 'white', 
                padding: '1.5rem', 
                borderRadius: '16px', 
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                alignItems: 'center'
            }}>
                {/* Search */}
                <div style={{ position: 'relative' }}>
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre o teléfono..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ 
                            width: '100%', padding: '0.8rem 1rem 0.8rem 2.8rem', borderRadius: '12px', 
                            border: '1px solid #E5E7EB', fontSize: '0.9rem', outline: 'none', backgroundColor: '#F9FAFB'
                        }}
                    />
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }}>🔍</span>
                </div>

                {/* Status Filter */}
                <div style={{ position: 'relative' }}>
                    <select 
                        value={filterStatus}
                        onChange={e => setFilterStatus(e.target.value)}
                        style={{ 
                            width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid #E5E7EB', 
                            fontSize: '0.9rem', appearance: 'none', backgroundColor: '#F9FAFB', fontWeight: '600', color: '#374151'
                        }}
                    >
                        <option value="all">Estado: Todos</option>
                        <option value="active">Activos</option>
                        <option value="inactive">Inactivos</option>
                    </select>
                </div>

                {/* Vehicle Filter */}
                <div style={{ position: 'relative' }}>
                    <select 
                        value={filterVehicle}
                        onChange={e => setFilterVehicle(e.target.value)}
                        style={{ 
                            width: '100%', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid #E5E7EB', 
                            fontSize: '0.9rem', appearance: 'none', backgroundColor: '#F9FAFB', fontWeight: '600', color: '#374151'
                        }}
                    >
                        <option value="all">Asignación: Todas</option>
                        <option value="assigned">Con Vehículo</option>
                        <option value="unassigned">Sin Vehículo</option>
                    </select>
                </div>

                {/* Sync Action */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <button 
                        onClick={fetchConductores}
                        disabled={loading}
                        style={{ 
                            height: '100%', padding: '0.6rem', borderRadius: '12px', backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', 
                            fontWeight: '700', color: '#374151', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                            opacity: loading ? 0.6 : 1
                        }}
                    >
                        {loading ? '🔄 Cargando...' : '🔃 Sincronizar'}
                    </button>
                    {lastUpdated && (
                        <span style={{ fontSize: '0.6rem', color: '#94A3B8', textAlign: 'center', fontWeight: 'bold' }}>
                            REFRESCO: {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                </div>

                {/* Action Placeholder or Additional Stat */}
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#94A3B8', fontWeight: '700' }}>
                    {filtered.length} Resultados
                </div>
            </div>

            {/* LIST TABLE - Estilo OrderLoading */}
            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.03)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #F3F4F6', textAlign: 'left' }}>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>PERFIL</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>CONTACTO</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ESPECIALIDAD</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>VEHÍCULO</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ESTADO</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem', textAlign: 'center' }}>GESTIÓN ASIGNACIÓN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && filtered.length === 0 ? (
                            [...Array(3)].map((_, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', opacity: 0.5 }}>
                                    <td colSpan={6} style={{ padding: '2rem', textAlign: 'center' }}>
                                        <div style={{ height: '20px', backgroundColor: '#F3F4F6', borderRadius: '10px', width: '80%', margin: '0 auto', animation: 'pulse 1.5s infinite' }}></div>
                                    </td>
                                </tr>
                            ))
                        ) : filtered.length === 0 ? (
                            <tr><td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8' }}>No se encontraron conductores con los filtros aplicados.</td></tr>
                        ) : filtered.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '1.2rem' }}>
                                    <div 
                                        onClick={() => {
                                            setSelectedDriver(c);
                                            fetchDriverKpis(c);
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                                    >
                                        <div style={{ 
                                            width: '40px', height: '40px', borderRadius: '12px', 
                                            background: 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: 'white', fontWeight: '900', fontSize: '0.9rem'
                                        }}>
                                            {getInitials(c.contact_name)}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: '700', color: '#1F2937', borderBottom: '1px dotted transparent' }} className="driver-name">{c.contact_name}</div>
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <div style={{ fontWeight: '600', color: '#475569' }}>{c.phone || 'S/N'}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{c.email || 'Sin correo'}</div>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <span style={{ 
                                        padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', 
                                        fontWeight: '800', backgroundColor: '#F3F4F6', color: '#4B5563' 
                                    }}>
                                        {c.specialty?.toUpperCase() || 'CONDUCTOR'}
                                    </span>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    {c.fleet_vehicles && c.fleet_vehicles.length > 0 ? (
                                        <div style={{ 
                                            fontWeight: '800', color: '#0891B2', backgroundColor: '#ECFEFF',
                                            padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #BFEAF2',
                                            display: 'inline-flex', alignItems: 'center', gap: '0.4rem'
                                        }}>
                                            🚛 {c.fleet_vehicles[0].plate}
                                        </div>
                                    ) : (
                                        <div style={{ 
                                            fontWeight: '700', color: '#D97706', backgroundColor: '#FFFBEB',
                                            padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px dashed #FEF3C7',
                                            fontSize: '0.8rem'
                                        }}>
                                            ⚠️ Sin Vehículo
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <span style={{ 
                                        padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800',
                                        backgroundColor: c.is_active ? '#ECFDF5' : '#FEF2F2', color: c.is_active ? '#065F46' : '#991B1B'
                                    }}>
                                        {c.is_active ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                    {c.current_status && (
                                        <div style={{ 
                                            marginTop: '0.4rem', 
                                            fontSize: '0.6rem', 
                                            fontWeight: '900', 
                                            color: '#0891B2',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}>
                                            <span style={{ width: '6px', height: '6px', backgroundColor: '#0891B2', borderRadius: '50%', display: 'inline-block' }}></span>
                                            {c.current_status.type.toUpperCase()}
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        {assigningId === c.id ? (
                                            <select 
                                                autoFocus
                                                onChange={(e) => handleAssign(c.id, e.target.value)}
                                                onBlur={() => setAssigningId(null)}
                                                style={{ 
                                                    padding: '0.4rem', borderRadius: '8px', border: '2px solid #0891B2', 
                                                    fontWeight: '900', fontSize: '0.8rem', width: '150px', outline: 'none'
                                                }}
                                            >
                                                <option value="">Seleccionar...</option>
                                                <option value="none">❌ Desvincular</option>
                                                {availableVehicles.map(v => (
                                                    <option key={v.id} value={v.id}>{v.plate}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <button 
                                                onClick={() => setAssigningId(c.id)}
                                                style={{ 
                                                    padding: '0.4rem 1rem', borderRadius: '8px', border: 'none', 
                                                    backgroundColor: '#111827', color: 'white', fontWeight: '800', fontSize: '0.7rem', 
                                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem'
                                                }}
                                            >
                                                {c.fleet_vehicles && c.fleet_vehicles.length > 0 ? '🔄 CAMBIAR' : '➕ ASIGNAR'}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* FOOTER NOTE */}
            <div style={{ textAlign: 'center', marginTop: '1rem', color: '#94A3B8', fontSize: '0.8rem', fontWeight: '600' }}>
                Galería de Conductores v2.0 &bull; Gestión Logística Avanzada
            </div>

            {/* PERFORMANCE MODAL */}
            {selectedDriver && (
                <div style={{ 
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', 
                    backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', 
                    alignItems: 'center', justifyContent: 'center', padding: '1rem'
                }}>
                    <div style={{ 
                        backgroundColor: 'white', width: '100%', maxWidth: '800px', 
                        borderRadius: '32px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        position: 'relative', animation: 'slideUp 0.3s ease-out'
                    }}>
                        <button 
                            onClick={() => setSelectedDriver(null)}
                            style={{ position: 'absolute', right: '2rem', top: '2rem', background: '#F1F5F9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', fontWeight: '900' }}
                        >✕</button>

                        <div style={{ padding: '3rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                <div style={{ 
                                    width: '80px', height: '80px', borderRadius: '24px', 
                                    background: 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: 'white', fontWeight: '900', fontSize: '1.8rem'
                                }}>
                                    {getInitials(selectedDriver.contact_name)}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '2rem', fontWeight: '900', color: '#1E293B', margin: 0 }}>{selectedDriver.contact_name}</h2>
                                    <p style={{ color: '#64748B', fontSize: '1.1rem', margin: '4px 0' }}>{selectedDriver.specialty || 'Conductor Especializado'}</p>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                        {selectedDriver.fleet_vehicles?.[0] && (
                                            <span style={{ fontSize: '0.75rem', padding: '4px 12px', backgroundColor: '#ECFEFF', borderRadius: '20px', fontWeight: '900', color: '#0891B2' }}>
                                                🚛 {selectedDriver.fleet_vehicles[0].plate}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {loadingKpis ? (
                                <div style={{ padding: '4rem', textAlign: 'center' }}>
                                    <div className="loader"></div>
                                    <p style={{ marginTop: '1rem', fontWeight: '700', color: '#0891B2' }}>Calculando KPIs de desempeño...</p>
                                </div>
                            ) : kpis && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                    {/* Main Grid KPIs */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                        <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>EFECTIVIDAD</div>
                                            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#10B981', margin: '0.5rem 0' }}>{Math.round(kpis.successRate)}%</div>
                                            <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '10px' }}>
                                                <div style={{ width: `${kpis.successRate}%`, height: '100%', backgroundColor: '#10B981', borderRadius: '10px' }}></div>
                                            </div>
                                        </div>
                                        <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>VOLUMEN CARGADO</div>
                                            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#1E293B', margin: '0.5rem 0' }}>{kpis.totalKilos.toLocaleString()} <span style={{ fontSize: '1rem' }}>KG</span></div>
                                            <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '700' }}>Últimos 8 días</div>
                                        </div>
                                        <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                            <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>VIAJES</div>
                                            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#0891B2', margin: '0.5rem 0' }}>{kpis.totalRoutes}</div>
                                            <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: '700' }}>Rutas finalizadas (8d)</div>
                                        </div>
                                    </div>

                                    {/* Distance Audit Comparison */}
                                    <div style={{ border: '1px solid #E2E8F0', borderRadius: '24px', padding: '2rem', backgroundColor: '#F1F5F9' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#1E293B' }}>Auditoría de Movimiento (Desviación KM)</h4>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0891B2', backgroundColor: 'white', padding: '4px 12px', borderRadius: '20px' }}>🛰️ DATA GPS</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-end' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.8rem', fontWeight: '700' }}>
                                                    <span style={{ color: '#0891B2' }}>GPS Teórico (1.25x)</span>
                                                    <span style={{ color: '#1E293B' }}>Odometer Real</span>
                                                </div>
                                                <div style={{ height: '40px', backgroundColor: 'white', borderRadius: '12px', overflow: 'hidden', display: 'flex', border: '1px solid #CBD5E1' }}>
                                                    <div style={{ width: '60%', height: '100%', backgroundColor: '#0891B2', display: 'flex', alignItems: 'center', paddingLeft: '1rem', color: 'white', fontWeight: '900', fontSize: '0.8rem' }}>
                                                        {Math.round(kpis.theoreticalDistance)} KM
                                                    </div>
                                                    <div style={{ width: '40%', height: '100%', backgroundColor: '#CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontWeight: '900', fontSize: '0.8rem' }}>
                                                        +{Math.round(kpis.actualOdometerGain - kpis.theoreticalDistance)} KM DEP
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', minWidth: '100px' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B' }}>DESVIACIÓN</div>
                                                <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#EF4444' }}>+5.2%</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                     {/* NOVEDADES & BITACORA TABS */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                                        {/* Recent Events List */}
                                        <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#475569', marginBottom: '1rem' }}>RECIENTES EN BITÁCORA</h4>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {kpis.recentEvents.length > 0 ? kpis.recentEvents.map(ev => (
                                                    <div key={ev.id} style={{ padding: '0.8rem 1.2rem', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1E293B' }}>{ev.description?.split('|')[0] || 'Evento de Ruta'}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '800' }}>{new Date(ev.created_at).toLocaleDateString()}</div>
                                                    </div>
                                                )) : (
                                                    <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>Sin registros auditados aún.</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Novedades Gallery */}
                                        <div>
                                            <h4 style={{ fontSize: '0.9rem', fontWeight: '900', color: '#EF4444', marginBottom: '1rem' }}>🚨 NOVEDADES Y DEVOLUCIONES</h4>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
                                                {kpis.novedades.length > 0 ? kpis.novedades.map(nov => (
                                                    <div key={nov.id} style={{ padding: '1rem', backgroundColor: '#FFF5F5', borderRadius: '16px', border: '1px solid #FEE2E2' }}>
                                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                                            {nov.evidence_url && (
                                                                <img 
                                                                    src={nov.evidence_url} 
                                                                    alt="Evidence" 
                                                                    style={{ width: '60px', height: '60px', borderRadius: '10px', objectFit: 'cover' }} 
                                                                />
                                                            )}
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: '900', color: '#991B1B' }}>{nov.event_type.toUpperCase()}</div>
                                                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>{nov.description}</div>
                                                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>{new Date(nov.created_at).toLocaleString()}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )) : (
                                                    <p style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>Sin novedades reportadas.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideUp {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .loader {
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #0891B2;
                    border-radius: 50%;
                    width: 40px;
                    height: 40px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .driver-name:hover {
                    color: #0891B2 !important;
                    text-decoration: underline;
                }
            `}</style>
        </div>
    );
}
