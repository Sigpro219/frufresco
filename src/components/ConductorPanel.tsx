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
    is_temporary?: boolean;
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
            const { data, error } = await supabase
                .from('collaborators')
                .select('*')
                .eq('role', 'CONDUCTOR')
                .order('contact_name');

            if (error) throw error;
            if (!isMounted.current) return;
            
            const { data: vData } = await supabase
                .from('fleet_vehicles')
                .select('id, plate, driver_id')
                .is('driver_id', null);
            
            if (isMounted.current) setAvailableVehicles(vData || []);

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

            const { data: allFleet } = await supabase
                .from('fleet_vehicles')
                .select('id, plate, driver_id');

            const updatedConductores = (data || []).map(c => {
                const driverVehicles = (allFleet || []).filter(v => v.driver_id === c.id);
                
                const lastEvent = eventData?.find(e => 
                    (e.description && e.description.includes(c.contact_name)) || 
                    (e.description && e.description.includes(c.id))
                );
                
                const plate = driverVehicles?.[0]?.plate;
                const vehicleEvent = eventData?.find(e => plate && e.description && e.description.includes(plate));
                const finalEvent = vehicleEvent || lastEvent;

                const baseConductor = {
                    ...c,
                    fleet_vehicles: driverVehicles
                };

                if (finalEvent) {
                    const typeMatch = finalEvent.event_type.replace('activity_', '');
                    return {
                        ...baseConductor,
                        current_status: {
                            type: typeMatch,
                            description: finalEvent.description,
                            since: finalEvent.created_at
                        }
                    };
                }
                return baseConductor;
            });

            if (isMounted.current) {
                setConductores(updatedConductores);
                setLastUpdated(new Date());
            }

        } catch (err: any) {
            console.error('Error fetching data for ConductorPanel:', err.message || err);
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

            const { data: events, error: eErr } = await supabase
                .from('delivery_events')
                .select('*')
                .eq('event_type', 'activity_operation')
                .ilike('description', `%${plate}%`)
                .gt('created_at', eightDaysAgo)
                .order('created_at', { ascending: false })
                .limit(100);

            const stopIds = routes?.flatMap((r: any) => r.route_stops?.map((s: any) => s.id) || []) || [];
            
            const { data: novedadesData } = await supabase
                .from('delivery_events')
                .select('*')
                .in('event_type', ['rejection', 'cancellation', 'partial_rejection'])
                .in('stop_id', stopIds.length > 0 ? stopIds : ['none'])
                .gt('created_at', eightDaysAgo)
                .order('created_at', { ascending: false })
                .limit(50);

            const driverNovedades = novedadesData || [];

            let totalStops = 0;
            let deliveredStops = 0;
            let totalKilos = 0;
            let theoreticalDist = 0;
            let totalDurationMs = 0;
            let timedStops = 0;

            routes?.forEach(r => {
                totalKilos += r.total_kilos || 0;
                r.route_stops?.forEach((s: any) => {
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

            events?.forEach((ev: any) => {
                const match = ev.description?.match(/KM ESTIMADOS: ([\d.]+)/);
                if (match) theoreticalDist += parseFloat(match[1]);
            });

            setKpis({
                totalRoutes: routes?.length || 0,
                successRate: totalStops > 0 ? (deliveredStops / totalStops) * 100 : 0,
                totalKilos,
                avgTimePerStop: timedStops > 0 ? (totalDurationMs / timedStops) / 60000 : 0,
                theoreticalDistance: theoreticalDist,
                actualOdometerGain: theoreticalDist * 1.05,
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
            await supabase
                .from('fleet_vehicles')
                .update({ driver_id: null })
                .eq('driver_id', conductorId);

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
            console.error('Error assigning vehicle:', err);
            alert('Error al asignar el vehículo.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConductores();
    }, [fetchConductores]);

    const filtered = conductores.filter(c => {
        const searchTerms = searchTerm.toLowerCase().split(' ').filter(t => t.length > 0);
        const driverData = [
            c.contact_name,
            c.phone,
            c.email,
            c.specialty,
            ...(c.fleet_vehicles?.map(v => v.plate) || []),
            c.is_active ? 'activo' : 'inactivo'
        ].map(s => (s || '').toLowerCase());

        return searchTerms.length === 0 || searchTerms.every(term => 
            driverData.some(data => data.includes(term))
        );
    });

    const getInitials = (name: string) => {
        if (!name) return '👤';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const totalConductors = conductores.length;
    const activeConductors = conductores.filter(c => c.is_active).length;
    const withVehicle = conductores.filter(c => c.fleet_vehicles && c.fleet_vehicles.length > 0).length;
    const availVehicles = availableVehicles.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* CABECERA ULTRA-COMPACTA 50/50: KPIs | BUSCADOR */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1.5rem', 
                alignItems: 'center',
                backgroundColor: 'white',
                padding: '0.8rem 1.5rem',
                borderRadius: '24px',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                border: '1px solid #E2E8F0'
            }}>
                {/* Lado Izquierdo: 4 KPIs (50% del ancho) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Stat 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: '1px solid #F1F5F9' }}>
                        <div style={{ fontSize: '1.1rem' }}>👥</div>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Total</div>
                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#111827' }}>{totalConductors}</div>
                        </div>
                    </div>

                    {/* Stat 2 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: '1px solid #F1F5F9' }}>
                        <div style={{ color: '#059669', fontSize: '1.1rem' }}>⚡</div>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Activos</div>
                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#111827' }}>{activeConductors}</div>
                        </div>
                    </div>

                    {/* Stat 3 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: '1px solid #F1F5F9' }}>
                        <div style={{ color: '#0D9488', fontSize: '1.1rem' }}>🚛</div>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Asignados</div>
                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#0F766E' }}>{withVehicle}</div>
                        </div>
                    </div>

                    {/* Stat 4 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ color: '#D97706', fontSize: '1.1rem' }}>🔑</div>
                        <div>
                            <div style={{ fontSize: '0.55rem', color: '#64748B', fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Célibes</div>
                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#D97706' }}>{availVehicles}</div>
                        </div>
                    </div>
                </div>

                {/* Lado Derecho: Buscador (50% del ancho) */}
                <div style={{ position: 'relative' }}>
                    <input 
                        type="text" 
                        placeholder="Filtrar flota, nombres o contactos..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ 
                            width: '100%', padding: '0.6rem 1rem 0.6rem 2.8rem', borderRadius: '15px', 
                            border: '1px solid #CBD5E1', fontSize: '0.9rem', outline: 'none', 
                            backgroundColor: '#F8FAFC', fontWeight: '600', color: '#1E293B',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
                        }}
                    />
                    <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem' }}>🔍</span>
                    <div style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: '#94A3B8', fontWeight: '800' }}>
                        {filtered.length} RESULTADOS
                    </div>
                </div>
            </div>

            {/* LIST TABLE */}
            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.03)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '2px solid #F3F4F6', textAlign: 'left' }}>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>PERFIL</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>CONTACTO</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ESPECIALIDAD</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>VEHÍCULO</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem' }}>ESTADO</th>
                            <th style={{ padding: '1.2rem', color: '#64748B', fontWeight: '900', fontSize: '0.7rem', textAlign: 'center' }}>GESTIÓN</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(c => (
                            <tr key={c.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                <td style={{ padding: '1.2rem' }}>
                                    <div 
                                        onClick={() => {
                                            setSelectedDriver(c);
                                            fetchDriverKpis(c);
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '1rem', cursor: 'pointer' }}
                                    >
                                        <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '900', fontSize: '0.8rem' }}>
                                            {getInitials(c.contact_name)}
                                        </div>
                                        <div style={{ fontWeight: '800', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            {c.contact_name}
                                            {c.is_temporary && (
                                                <span style={{ 
                                                    fontSize: '0.55rem', fontWeight: '900', backgroundColor: '#FEE2E2', color: '#B91C1C', 
                                                    padding: '2px 6px', borderRadius: '4px', border: '1px solid #FECACA'
                                                }}>
                                                    TEMPORAL
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <div style={{ fontWeight: '600', color: '#475569' }}>{c.phone || 'S/N'}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{c.email || 'Sin correo'}</div>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <span style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#F3F4F6', color: '#4B5563' }}>
                                        {c.specialty?.toUpperCase() || 'CONDUCTOR'}
                                    </span>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    {c.fleet_vehicles && c.fleet_vehicles.length > 0 ? (
                                        <div style={{ fontWeight: '800', color: '#0891B2', backgroundColor: '#ECFEFF', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid #BFEAF2' }}>
                                            🚛 {c.fleet_vehicles[0].plate}
                                        </div>
                                    ) : (
                                        <div style={{ fontWeight: '700', color: '#D97706', backgroundColor: '#FFFBEB', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px dashed #FEF3C7', fontSize: '0.8rem' }}>
                                            ⚠️ Sin Vehículo
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <span style={{ padding: '0.3rem 0.8rem', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '800', backgroundColor: c.is_active ? '#ECFDF5' : '#FEF2F2', color: c.is_active ? '#065F46' : '#991B1B' }}>
                                        {c.is_active ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                </td>
                                <td style={{ padding: '1.2rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        {assigningId === c.id ? (
                                            <select 
                                                autoFocus
                                                onChange={(e) => handleAssign(c.id, e.target.value)}
                                                onBlur={() => setAssigningId(null)}
                                                style={{ padding: '0.4rem', borderRadius: '8px', border: '2px solid #0891B2', fontWeight: '900', fontSize: '0.8rem' }}
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
                                                style={{ padding: '0.4rem 1rem', borderRadius: '8px', border: 'none', backgroundColor: '#111827', color: 'white', fontWeight: '800', fontSize: '0.7rem', cursor: 'pointer' }}
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

            {/* PERFORMANCE MODAL */}
            {selectedDriver && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '800px', borderRadius: '32px', overflow: 'hidden', position: 'relative', animation: 'slideUp 0.3s ease-out' }}>
                        <button onClick={() => setSelectedDriver(null)} style={{ position: 'absolute', right: '2rem', top: '2rem', background: '#F1F5F9', border: 'none', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer' }}>✕</button>
                        <div style={{ padding: '3rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '24px', background: 'linear-gradient(135deg, #0891B2 0%, #22D3EE 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '900', fontSize: '1.8rem' }}>
                                    {getInitials(selectedDriver.contact_name)}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '2rem', fontWeight: '900', margin: 0 }}>{selectedDriver.contact_name}</h2>
                                    <p style={{ color: '#64748B' }}>{selectedDriver.specialty || 'Conductor Especializado'}</p>
                                </div>
                            </div>

                            {loadingKpis ? (
                                <div style={{ padding: '4rem', textAlign: 'center' }}>
                                    <div className="loader"></div>
                                    <p style={{ marginTop: '1rem', fontWeight: '700', color: '#0891B2' }}>Calculando KPIs...</p>
                                </div>
                            ) : kpis && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B' }}>EFECTIVIDAD</div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#10B981', margin: '0.5rem 0' }}>{Math.round(kpis.successRate)}%</div>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B' }}>CARGA</div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#1E293B', margin: '0.5rem 0' }}>{kpis.totalKilos.toLocaleString()} KG</div>
                                    </div>
                                    <div style={{ backgroundColor: '#F8FAFC', padding: '1.5rem', borderRadius: '24px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.7rem', fontWeight: '900', color: '#64748B' }}>VIAJES</div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#0891B2', margin: '0.5rem 0' }}>{kpis.totalRoutes}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                .loader { border: 4px solid #f3f3f3; border-top: 4px solid #0891B2; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                .driver-name:hover { color: #0891B2 !important; text-decoration: underline; }
            `}</style>
        </div>
    );
}
