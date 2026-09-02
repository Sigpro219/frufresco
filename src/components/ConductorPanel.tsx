'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
    Users, 
    Zap, 
    Truck, 
    Key, 
    Search, 
    AlertTriangle, 
    XCircle, 
    RefreshCw, 
    Plus, 
    X, 
    User
} from 'lucide-react';
import { THEME } from '@/lib/adminTheme';

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

export default function ConductorPanel({ readOnly = false }: { readOnly?: boolean }) {
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
        if (readOnly) return;
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
        if (!name) return 'CD';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const totalConductors = conductores.length;
    const activeConductors = conductores.filter(c => c.is_active).length;
    const withVehicle = conductores.filter(c => c.fleet_vehicles && c.fleet_vehicles.length > 0).length;
    const availVehicles = availableVehicles.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            {/* CABECERA ULTRA-COMPACTA 50/50: KPIs | BUSCADOR */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '1.25rem', 
                alignItems: 'center',
                backgroundColor: 'white',
                padding: '0.75rem 1.25rem',
                borderRadius: THEME.radius.lg,
                boxShadow: THEME.shadow.sm,
                border: `1px solid ${THEME.colors.border}`
            }}>
                {/* Lado Izquierdo: 4 KPIs (50% del ancho) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Stat 1 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: `1px solid ${THEME.colors.border}` }}>
                        <Users size={16} color={THEME.colors.textSecondary} />
                        <div>
                            <div style={{ fontSize: '0.55rem', color: THEME.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Total</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain }}>{totalConductors}</div>
                        </div>
                    </div>

                    {/* Stat 2 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: `1px solid ${THEME.colors.border}` }}>
                        <Zap size={16} color={THEME.colors.primary} />
                        <div>
                            <div style={{ fontSize: '0.55rem', color: THEME.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Activos</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.primary }}>{activeConductors}</div>
                        </div>
                    </div>

                    {/* Stat 3 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRight: `1px solid ${THEME.colors.border}` }}>
                        <Truck size={16} color="#059669" />
                        <div>
                            <div style={{ fontSize: '0.55rem', color: THEME.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Asignados</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#065F46' }}>{withVehicle}</div>
                        </div>
                    </div>

                    {/* Stat 4 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Key size={16} color="#D97706" />
                        <div>
                            <div style={{ fontSize: '0.55rem', color: THEME.colors.textSecondary, fontWeight: '800', textTransform: 'uppercase', lineHeight: '1' }}>Célibes</div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#D97706' }}>{availVehicles}</div>
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
                            width: '100%', padding: '0.55rem 1rem 0.55rem 2.5rem', borderRadius: '10px', 
                            border: `1px solid ${THEME.colors.borderActive}`, fontSize: '0.85rem', outline: 'none', 
                            backgroundColor: '#F8FAFC', fontWeight: '600', color: THEME.colors.textMain,
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)', boxSizing: 'border-box'
                        }}
                    />
                    <Search size={15} style={{ position: 'absolute', left: '0.85rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                    <div style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '800' }}>
                        {filtered.length} RESULTADOS
                    </div>
                </div>
            </div>

            {/* LIST TABLE */}
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>
                            <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>PERFIL</th>
                            <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>CONTACTO</th>
                            <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>ESPECIALIDAD</th>
                            <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>VEHÍCULO</th>
                            <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.68rem', textTransform: 'uppercase' }}>ESTADO</th>
                            {!readOnly && <th style={{ padding: '0.75rem 1rem', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.68rem', textAlign: 'center', textTransform: 'uppercase' }}>GESTIÓN</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map(c => (
                            <tr key={c.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s ease' }}>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div 
                                        onClick={() => {
                                            setSelectedDriver(c);
                                            fetchDriverKpis(c);
                                        }}
                                        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                                    >
                                        <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'linear-gradient(135deg, #0D7A57 0%, #10B981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '900', fontSize: '0.78rem', boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)' }}>
                                            {getInitials(c.contact_name)}
                                        </div>
                                        <div style={{ fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.84rem' }}>
                                            {c.contact_name}
                                            {c.is_temporary && (
                                                <span style={{ 
                                                    fontSize: '0.55rem', fontWeight: '800', backgroundColor: '#FEF2F2', color: '#B91C1C', 
                                                    padding: '2px 5px', borderRadius: '4px', border: '1px solid #FECACA'
                                                }}>
                                                    TEMPORAL
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.8rem' }}>{c.phone || 'S/N'}</div>
                                    <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary }}>{c.email || 'Sin correo'}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '800', backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, border: `1px solid ${THEME.colors.border}` }}>
                                        {c.specialty?.toUpperCase() || 'CONDUCTOR'}
                                    </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    {c.fleet_vehicles && c.fleet_vehicles.length > 0 ? (
                                        <div style={{ fontWeight: '800', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px solid #D1E0D9', display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}>
                                            <Truck size={13} strokeWidth={2} /> {c.fleet_vehicles[0].plate}
                                        </div>
                                    ) : (
                                        <div style={{ fontWeight: '700', color: '#D97706', backgroundColor: '#FFFBEB', padding: '0.3rem 0.65rem', borderRadius: '6px', border: '1px dashed #FEF3C7', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <AlertTriangle size={13} /> Sin Vehículo
                                        </div>
                                    )}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                    <span style={{ padding: '0.25rem 0.65rem', borderRadius: '12px', fontSize: '0.68rem', fontWeight: '800', backgroundColor: c.is_active ? '#ECFDF5' : '#FEF2F2', color: c.is_active ? '#065F46' : '#991B1B', border: c.is_active ? '1px solid #A7F3D0' : '1px solid #FECACA' }}>
                                        {c.is_active ? 'ACTIVO' : 'INACTIVO'}
                                    </span>
                                </td>
                                {!readOnly && (
                                    <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            {assigningId === c.id ? (
                                                <select 
                                                    autoFocus
                                                    onChange={(e) => handleAssign(c.id, e.target.value)}
                                                    onBlur={() => setAssigningId(null)}
                                                    style={{ padding: '0.35rem 0.6rem', borderRadius: '6px', border: `2px solid ${THEME.colors.primary}`, fontWeight: '800', fontSize: '0.76rem', color: THEME.colors.textMain, outline: 'none' }}
                                                >
                                                    <option value="">Seleccionar vehículo...</option>
                                                    <option value="none">Desvincular</option>
                                                    {availableVehicles.map(v => (
                                                        <option key={v.id} value={v.id}>{v.plate}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <button 
                                                    onClick={() => setAssigningId(c.id)}
                                                    style={{ 
                                                        padding: '0.35rem 0.8rem', borderRadius: '6px', border: 'none', 
                                                        backgroundColor: THEME.colors.primary, color: 'white', 
                                                        fontWeight: '800', fontSize: '0.68rem', cursor: 'pointer', 
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)',
                                                        transition: 'background-color 0.15s ease'
                                                    }}
                                                    onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                                    onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                                >
                                                    {c.fleet_vehicles && c.fleet_vehicles.length > 0 ? <><RefreshCw size={11} strokeWidth={2} /> CAMBIAR</> : <><Plus size={11} strokeWidth={2} /> ASIGNAR</>}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* PERFORMANCE MODAL */}
            {selectedDriver && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(26, 35, 30, 0.7)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div style={{ backgroundColor: 'white', width: '100%', maxWidth: '750px', borderRadius: THEME.radius.xl, overflow: 'hidden', position: 'relative', animation: 'slideUp 0.25s ease-out', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}` }}>
                        <button onClick={() => setSelectedDriver(null)} style={{ position: 'absolute', right: '1.25rem', top: '1.25rem', background: THEME.colors.background, border: 'none', width: '36px', height: '36px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.textSecondary }}>
                            <X size={18} />
                        </button>
                        <div style={{ padding: '2rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '2rem' }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #0D7A57 0%, #10B981 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '900', fontSize: '1.5rem', boxShadow: '0 4px 10px rgba(13, 122, 87, 0.25)' }}>
                                    {getInitials(selectedDriver.contact_name)}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: '900', margin: 0, color: THEME.colors.textMain }}>{selectedDriver.contact_name}</h2>
                                    <p style={{ color: THEME.colors.textSecondary, margin: '2px 0 0', fontSize: '0.85rem' }}>{selectedDriver.specialty || 'Conductor Especializado'} &bull; FruFresco Logística</p>
                                </div>
                            </div>

                            {loadingKpis ? (
                                <div style={{ padding: '3rem', textAlign: 'center' }}>
                                    <div className="loader"></div>
                                    <p style={{ marginTop: '1rem', fontWeight: '800', color: THEME.colors.primary, fontSize: '0.85rem' }}>Calculando KPIs de rendimiento...</p>
                                </div>
                            ) : kpis && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.85rem' }}>
                                    <div style={{ backgroundColor: '#F4F9F6', padding: '1.25rem', borderRadius: THEME.radius.lg, border: '1px solid #E0EFE7' }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.primary, textTransform: 'uppercase' }}>EFECTIVIDAD DE ENTREGA</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#065F46', margin: '0.3rem 0 0' }}>{Math.round(kpis.successRate)}%</div>
                                    </div>
                                    <div style={{ backgroundColor: '#F4F9F6', padding: '1.25rem', borderRadius: THEME.radius.lg, border: '1px solid #E0EFE7' }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>CARGA TRANSPORTADA</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: THEME.colors.textMain, margin: '0.3rem 0 0' }}>{kpis.totalKilos.toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: '700' }}>KG</span></div>
                                    </div>
                                    <div style={{ backgroundColor: '#F4F9F6', padding: '1.25rem', borderRadius: THEME.radius.lg, border: '1px solid #E0EFE7' }}>
                                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>RUTAS COMPLETADAS</div>
                                        <div style={{ fontSize: '1.8rem', fontWeight: '900', color: THEME.colors.primary, margin: '0.3rem 0 0' }}>{kpis.totalRoutes}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .loader { border: 3px solid #EAEFEA; border-top: 3px solid #0D7A57; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite; margin: 0 auto; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
