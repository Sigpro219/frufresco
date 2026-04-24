'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import FleetManagement from '@/components/FleetManagement';
import MaintenanceManagement from '@/components/MaintenanceManagement';
import RoutePlanner from '@/components/RoutePlanner';
import ConductorPanel from '@/components/ConductorPanel';
import ControlTowerKPIs from '@/components/ControlTowerKPIs';

interface ActiveRoute {
    id: string;
    vehicle_plate: string;
    status: string;
    total_orders: number;
    total_kilos: number;
    start_time: string;
    created_at: string;
    route_stops: {
        id: string;
        order_id: string;
        status: string;
        completion_time: string | null;
        sequence_number: number;
        order?: {
            latitude: number;
            longitude: number;
            customer_name: string;
        };
    }[];
    driver?: {
        contact_name: string;
    };
}

const MAP_ID = 'bf725916f72f2fd';

export default function TransportControlTower() {
    const [activeTab, setActiveTab] = useState<'map' | 'planner' | 'fleet' | 'maintenance' | 'drivers_panel' | 'kpis'>('map');
    const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
    const [loading, setLoading] = useState(true);
    const isMounted = useRef(true);
    const [stats, setStats] = useState({
        totalActive: 0,
        completedToday: 0,
        totalNovedades: 0,
        totalKilos: 0
    });
    const [appName, setAppName] = useState('Logistics Pro');

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    const getInitials = (name: string) => {
        if (!name) return '👤';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const [fleetData, setFleetData] = useState<any[]>([]);
    const [driversData, setDriversData] = useState<any[]>([]);

    const fetchTransportData = useCallback(async (signal?: AbortSignal) => {
        try {
            setLoading(true);
            
            const { data: routes, error: rErr } = await supabase
                .from('routes')
                .select('*')
                .order('created_at', { ascending: false })
                .abortSignal(signal as AbortSignal); 

            if (rErr) throw rErr;
            if (!isMounted.current) return;
            
            const routeIds = routes?.map(r => r.id) || [];
            
            let allStops: (ActiveRoute['route_stops'][number] & { route_id: string })[] = [];
            if (routeIds.length > 0) {
                const { data: stopsData, error: sErr } = await supabase
                    .from('route_stops')
                    .select('*, order:orders(latitude, longitude, customer_name)')
                    .in('route_id', routeIds)
                    .order('sequence_number', { ascending: true })
                    .abortSignal(signal as AbortSignal);
                
                if (sErr) {
                    if (isAbortError(sErr)) return;
                    console.warn('Note: Could not fetch stops:', sErr.message);
                }
                allStops = stopsData || [];
            }

            if (!isMounted.current) return;

            // Fetch collaborators separately to avoid relationship errors
            const { data: dData } = await supabase
                .from('collaborators')
                .select('id, contact_name');

            const formatted: ActiveRoute[] = routes?.map(r => {
                const driver = dData?.find(d => d.id === r.driver_id);
                return {
                    ...r,
                    route_stops: allStops.filter(s => s.route_id === r.id),
                    driver: driver ? { contact_name: driver.contact_name } : undefined
                };
            }) || [];

            setActiveRoutes(formatted);

            const active = formatted.filter(r => r.status === 'in_transit' || r.status === 'loading').length;
            const completed = formatted.filter(r => r.status === 'completed').length;
            const weight = formatted.reduce((acc, r) => acc + (Number(r.total_kilos) || 0), 0);
            
            let novedadesCount = 0;
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const { count } = await supabase
                    .from('delivery_events')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', today.toISOString())
                    .abortSignal(signal as AbortSignal);
                novedadesCount = count || 0;
            } catch (e) {
                if (!isAbortError(e)) console.warn('Could not fetch novedades count');
            }

            if (isMounted.current) {
                setStats({
                    totalActive: active,
                    completedToday: completed,
                    totalNovedades: novedadesCount,
                    totalKilos: weight
                });
            }

            // Fetch ALL fleet vehicles to show on map even without routes
            const { data: fData } = await supabase
                .from('fleet_vehicles')
                .select('*');

            const { data: nameData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'app_short_name')
                .single();
            
            if (nameData?.value && isMounted.current) {
                setAppName(nameData.value);
            }

            // Final state update with all data
            if (isMounted.current) {
                setFleetData(fData || []);
                setDriversData(dData || []);
                setActiveRoutes(formatted);
            }
        } catch (err: any) {
            if (isAbortError(err)) return;
            if (!isMounted.current) return;
            console.error('Error fetching transport data:', err.message || err.details || err.code || err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        isMounted.current = true;
        const controller = new AbortController();
        fetchTransportData(controller.signal);
        return () => { 
            isMounted.current = false;
            controller.abort();
        };
    }, [fetchTransportData]);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', color: '#0F172A', fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.25rem' }}>
                
                {/* Slim Premium Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem', padding: '0 0.5rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0EA5E9', boxShadow: '0 0 10px #0EA5E9' }}></div>
                            <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>LOGISTICS & SUPPLY CHAIN / TOWER</span>
                        </div>
                        <h1 style={{ fontSize: '1.85rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
                            Torre de <span style={{ color: '#0EA5E9' }}>Control</span>
                        </h1>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 180px)', gap: '1rem' }}>
                        <KPICard title="EN TRÁNSITO" value={stats.totalActive} icon="🚛" color="#0EA5E9" subtitle="Rutas activas hoy" />
                        <KPICard title="ENTREGAS" value={stats.completedToday} icon="✅" color="#10B981" subtitle="Rutas finalizadas" />
                        <KPICard title="VOLUMEN" value={`${stats.totalKilos.toFixed(0)} kg`} icon="⚖️" color="#6366F1" subtitle="Carga total gestionada" />
                        <KPICard title="ALERTAS" value={stats.totalNovedades} icon="⚠️" color="#F43F5E" subtitle="Novedades reportadas" />
                    </div>
                </div>

                {/* Integrated Control Bar */}
                <div style={{ 
                    backgroundColor: 'white', 
                    padding: '0.75rem 1rem', 
                    borderRadius: '20px', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.5rem'
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {[
                            { id: 'map', label: 'Monitor Global', icon: '🌍' },
                            { id: 'planner', label: 'Planeación', icon: '🧭' },
                            { id: 'fleet', label: 'Flota', icon: '🚛' },
                            { id: 'drivers_panel', label: 'Conductores', icon: '👥' },
                            { id: 'maintenance', label: 'Mantenimiento', icon: '🛠️' },
                            { id: 'kpis', label: 'Insights', icon: '📈' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '14px', border: 'none',
                                    backgroundColor: activeTab === tab.id ? '#0F172A' : 'transparent',
                                    color: activeTab === tab.id ? 'white' : '#64748B',
                                    fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                <span>{tab.icon}</span>
                                {tab.label.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={() => fetchTransportData()}
                        disabled={loading}
                        style={{ 
                            padding: '10px 20px', borderRadius: '14px', border: '1px solid #E2E8F0', backgroundColor: 'white',
                            color: '#0F172A', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        {loading ? 'Sincronizando...' : '🔄 ACTUALIZAR'}
                    </button>
                </div>

                {/* Main Content Area */}
                <div style={{ position: 'relative', minHeight: 'calc(100vh - 280px)' }}>
                    {activeTab === 'map' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', height: 'calc(100vh - 280px)' }}>
                            {/* Route Feed */}
                            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '1.25rem', overflowY: 'auto' }}>
                                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '900', color: '#0F172A' }}>ESTADO DE RUTAS</h3>
                                    <span style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: '700' }}>{activeRoutes.length} TOTAL</span>
                                </div>
                                
                                {activeRoutes.length === 0 && !loading && (
                                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8' }}>
                                        <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📭</div>
                                        <div style={{ fontSize: '0.8rem', fontWeight: '700' }}>No hay rutas activas en este momento</div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {activeRoutes.map(route => {
                                        const done = route.route_stops.filter(s => s.status === 'delivered' || s.status === 'failed').length;
                                        const progress = route.route_stops.length > 0 ? (done / route.route_stops.length) * 100 : 0;
                                        const isInTransit = route.status === 'in_transit';

                                        return (
                                            <div key={route.id} style={{ 
                                                padding: '1rem', borderRadius: '16px', border: '1px solid',
                                                borderColor: isInTransit ? '#0EA5E9' : '#E2E8F0',
                                                backgroundColor: isInTransit ? '#F0F9FF' : 'white',
                                                transition: 'all 0.2s'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '900', fontSize: '0.95rem', color: '#0F172A' }}>{route.vehicle_plate}</div>
                                                        <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: '700' }}>ID-{route.id.slice(0, 5)}</div>
                                                    </div>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', fontWeight: '900', padding: '4px 8px', borderRadius: '8px',
                                                        backgroundColor: isInTransit ? '#0EA5E9' : '#F1F5F9', color: isInTransit ? 'white' : '#64748B'
                                                    }}>{route.status.toUpperCase()}</span>
                                                </div>
                                                <div style={{ height: '4px', backgroundColor: '#E2E8F0', borderRadius: '10px', margin: '12px 0 8px 0', overflow: 'hidden' }}>
                                                    <div style={{ width: `${progress}%`, height: '100%', backgroundColor: isInTransit ? '#0EA5E9' : '#10B981', transition: 'width 0.5s' }}></div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem' }}>
                                                    <span style={{ color: '#64748B', fontWeight: '700' }}>{done}/{route.route_stops.length} pedidos</span>
                                                    <span style={{ color: '#0F172A', fontWeight: '900' }}>{Math.round(progress)}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Map Container */}
                            <div style={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px rgba(0,0,0,0.02)' }}>
                                    {apiKey ? (
                                        <Map defaultCenter={{ lat: 4.6300, lng: -74.1530 }} defaultZoom={13} mapId={MAP_ID} style={{ width: '100%', height: '100%' }}>
                                            <AdvancedMarker position={{ lat: 4.6300, lng: -74.1530 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ backgroundColor: '#0F172A', color: 'white', padding: '4px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '900', marginBottom: '4px' }}>🏠 BODEGA</div>
                                                    <Pin background={'#0F172A'} glyphColor={'white'} scale={1.2} />
                                                </div>
                                            </AdvancedMarker>

                                            {/* Show ALL fleet vehicles for testing/monitoring */}
                                            {fleetData.map((v: any, i: number) => {
                                                const driver = driversData.find((d: any) => d.id === v.driver_id);
                                                const initials = getInitials(driver?.contact_name || '');
                                                
                                                // If no position, spread them around the warehouse for visibility
                                                const pos = v.last_latitude && v.last_longitude 
                                                    ? { lat: v.last_latitude, lng: v.last_longitude }
                                                    : { lat: 4.6300 + (Math.sin(i) * 0.01), lng: -74.1530 + (Math.cos(i) * 0.01) };

                                                return (
                                                    <AdvancedMarker key={v.id} position={pos}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                            <div style={{ 
                                                                width: '32px', 
                                                                height: '32px', 
                                                                borderRadius: '8px', 
                                                                background: v.status === 'available' ? 'linear-gradient(135deg, #10B981 0%, #34D399 100%)' : 'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)', 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center', 
                                                                color: 'white', 
                                                                fontWeight: '900', 
                                                                fontSize: '0.75rem',
                                                                boxShadow: '0 4px 10px rgba(0,0,0,0.15)',
                                                                border: '2px solid white'
                                                            }}>
                                                                {initials}
                                                            </div>
                                                            <div style={{ 
                                                                backgroundColor: 'white', 
                                                                color: '#1E293B', 
                                                                padding: '1px 6px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '0.5rem', 
                                                                fontWeight: '900', 
                                                                marginTop: '2px',
                                                                border: '1px solid #E2E8F0',
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                            }}>
                                                                {v.plate}
                                                            </div>
                                                        </div>
                                                    </AdvancedMarker>
                                                );
                                            })}
                                        </Map>
                                    ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', backgroundColor: '#F1F5F9' }}>
                                        <div style={{ fontSize: '3rem' }}>🛰️</div>
                                        <div style={{ fontWeight: '800', color: '#64748B' }}>Google Maps no configurado</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'planner' ? (
                        <RoutePlanner />
                    ) : activeTab === 'fleet' ? (
                        <FleetManagement />
                    ) : activeTab === 'drivers_panel' ? (
                        <ConductorPanel />
                    ) : activeTab === 'kpis' ? (
                        <ControlTowerKPIs />
                    ) : (
                        <MaintenanceManagement />
                    )}
                </div>
            </div>
        </main>
    );
}

function KPICard({ title, value, icon, color, subtitle }: any) {
    return (
        <div style={{
            backgroundColor: 'white', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0',
            borderTop: `3px solid ${color}`, display: 'flex', alignItems: 'center', gap: '12px'
        }}>
            <div style={{ backgroundColor: `${color}10`, width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', color: color }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.6rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.05em' }}>{title}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', lineHeight: 1, margin: '2px 0' }}>{value}</div>
                <div style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: '600' }}>{subtitle}</div>
            </div>
        </div>
    );
}
