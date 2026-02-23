'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import Navbar from '@/components/Navbar';
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
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
    route_stops: {
        status: string;
        completion_time: string;
    }[];
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
        totalNovedades: 0
    });

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    const fetchTransportData = useCallback(async (signal?: AbortSignal) => {
        try {
            setLoading(true);
            
            // 1. Fetch main routes (only today's or recent for performance)
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
                    .select('route_id, status, completion_time')
                    .in('route_id', routeIds)
                    .abortSignal(signal as AbortSignal);
                
                if (sErr) {
                    if (isAbortError(sErr)) return;
                    console.warn('Note: Could not fetch stops:', sErr.message);
                }
                allStops = stopsData || [];
            }

            if (!isMounted.current) return;

            const formatted: ActiveRoute[] = routes?.map(r => ({
                ...r,
                route_stops: allStops.filter(s => s.route_id === r.id)
            })) || [];

            setActiveRoutes(formatted);

            const active = formatted.filter(r => r.status === 'in_transit' || r.status === 'loading').length;
            const completed = formatted.filter(r => r.status === 'completed').length;
            
            let novedadesCount = 0;
            try {
                // Only count events from today for performance and relevance
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
                    totalNovedades: novedadesCount
                });
            }
        } catch (err: unknown) {
            if (isAbortError(err)) return; // Silently handle aborts
            if (!isMounted.current) return;
            console.error('Error fetching transport data:', err);
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
        <main style={{ 
            minHeight: '100vh', 
            backgroundColor: '#F9FAFB', 
            color: '#111827',
            fontFamily: 'apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            <style jsx global>{`
                @keyframes pulse-cyan {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(8, 145, 178, 0.4); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(8, 145, 178, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(8, 145, 178, 0); }
                }
                .live-pulse {
                    width: 8px;
                    height: 8px;
                    background: #0891B2;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 8px;
                    animation: pulse-cyan 2s infinite;
                }
                .premium-card {
                    background: white;
                    border: 1px solid #E5E7EB;
                    border-radius: 24px;
                    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
                }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #D1D5DB; }
            `}</style>
            
            <Navbar />
            
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem' }}>
                <header style={{ 
                    marginBottom: '2rem', 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '1.5rem',
                    padding: '2rem',
                    background: 'white',
                    borderRadius: '32px',
                    border: '1px solid #E5E7EB',
                    boxShadow: '0 4px 20px -5px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
                                <span className="live-pulse"></span>
                                <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#0891B2', letterSpacing: '0.15rem' }}>DASHBOARD OPERATIVO</span>
                            </div>
                            <h1 style={{ fontSize: '2.8rem', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.07rem', lineHeight: 1 }}>
                                Torre de <span style={{ color: '#0891B2' }}>Control</span>
                            </h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.6rem' }}>
                                <p style={{ color: '#64748B', fontSize: '1.1rem', fontWeight: '500', margin: 0 }}>Gestión centralizada de rutas y flota <span style={{ color: '#111827', fontWeight: '700' }}>Logistics Pro</span>.</p>
                                <button 
                                    onClick={() => fetchTransportData()}
                                    disabled={loading}
                                    style={{ 
                                        padding: '0.4rem 0.8rem', borderRadius: '10px', 
                                        backgroundColor: 'white', color: '#0891B2', border: '1px solid #0891B2', 
                                        fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer',
                                        transition: 'all 0.2s', opacity: loading ? 0.5 : 1
                                    }}
                                >
                                    {loading ? 'Sincronizando...' : '🔃 Sincronizar Todo'}
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1.2rem' }}>
                            <StatBox label="ACTIVAS" value={stats.totalActive} color="#0891B2" icon="⚡" bg="rgba(8, 145, 178, 0.05)" />
                            <StatBox label="ENTREGAS" value={stats.completedToday} color="#10B981" icon="✅" bg="rgba(16, 185, 129, 0.05)" />
                            <StatBox label="NOVEDADES" value={stats.totalNovedades} color="#EF4444" icon="🚨" bg="rgba(239, 68, 68, 0.05)" />
                        </div>
                    </div>
                    
                    <div style={{ 
                        height: '1px', 
                        background: 'linear-gradient(to right, #F3F4F6, transparent)', 
                        width: '100%' 
                    }}></div>

                    <nav style={{ display: 'flex', gap: '0.8rem' }}>
                        {[
                            { id: 'map', label: 'Monitor de Google Maps', icon: '📍' },
                            { id: 'planner', label: 'Planeador Inteligente', icon: '📅' },
                            { id: 'fleet', label: 'Gestión de Flota', icon: '🚛' },
                            { id: 'drivers_panel', label: 'Panel de Conductores', icon: '🪪' },
                            { id: 'kpis', label: 'KPIs de Desempeño', icon: '📊' },
                            { id: 'maintenance', label: 'Estado de Taller', icon: '🛠️' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as 'map' | 'planner' | 'fleet' | 'maintenance' | 'drivers_panel' | 'kpis')}
                                style={{
                                    background: activeTab === tab.id ? '#111827' : 'transparent',
                                    border: '1px solid',
                                    borderColor: activeTab === tab.id ? '#111827' : '#E5E7EB',
                                    padding: '0.8rem 1.5rem',
                                    borderRadius: '16px',
                                    fontSize: '0.85rem',
                                    fontWeight: '700',
                                    color: activeTab === tab.id ? 'white' : '#64748B',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem'
                                }}
                            >
                                <span>{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </header>

                <div className="premium-card" style={{ padding: '1.5rem', minHeight: 'calc(100vh - 350px)', position: 'relative' }}>
                    {loading && (
                        <div style={{ 
                            position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.7)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            zIndex: 100, borderRadius: '24px', backdropFilter: 'blur(4px)'
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📡</div>
                                <div style={{ fontWeight: '800', color: '#0891B2' }}>Sincronizando Torre de Control...</div>
                            </div>
                        </div>
                    )}
                    {activeTab === 'map' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', height: '100%' }}>
                            {/* Feed Sidebar */}
                            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 380px)' }}>
                                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '900', color: '#374151' }}>FLUJO DE RUTAS</h3>
                                    <span style={{ fontSize: '0.7rem', color: '#6B7280' }}>{activeRoutes.length} TOTAL</span>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto' }}>
                                    {activeRoutes.map(route => {
                                        const total = route.route_stops.length;
                                        const done = route.route_stops.filter(s => s.status === 'delivered' || s.status === 'failed').length;
                                        const progress = total > 0 ? (done / total) * 100 : 0;
                                        const isInTransit = route.status === 'in_transit';

                                        return (
                                            <div key={route.id} style={{ 
                                                padding: '1.2rem', 
                                                borderRadius: '20px', 
                                                backgroundColor: isInTransit ? '#F0FDFA' : '#F9FAFB',
                                                border: isInTransit ? '1px solid #99F6E4' : '1px solid #F3F4F6',
                                                marginBottom: '1rem',
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '900', fontSize: '1rem', color: '#111827' }}>{route.vehicle_plate}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: '700' }}>ID-{route.id.slice(0, 5)}</div>
                                                    </div>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', fontWeight: '900', padding: '0.3rem 0.6rem', borderRadius: '20px',
                                                        backgroundColor: isInTransit ? '#0D9488' : '#6B7280',
                                                        color: 'white', letterSpacing: '0.05rem'
                                                    }}>{route.status.toUpperCase()}</span>
                                                </div>
                                                <div style={{ height: '4px', backgroundColor: '#E5E7EB', borderRadius: '10px', marginBottom: '0.8rem', overflow: 'hidden' }}>
                                                    <div style={{ width: `${progress}%`, height: '100%', backgroundColor: isInTransit ? '#0891B2' : '#10B981', transition: 'width 1s' }}></div>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                                    <span style={{ color: '#4B5563', fontWeight: '700' }}>{done}/{total} Pedidos</span>
                                                    <span style={{ color: isInTransit ? '#0891B2' : '#10B981', fontWeight: '900' }}>{Math.round(progress)}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Map Main */}
                            <div style={{ borderRadius: '24px', overflow: 'hidden', border: '1px solid #E5E7EB', position: 'relative' }}>
                                {apiKey ? (
                                    <APIProvider apiKey={apiKey}>
                                        <Map
                                            defaultCenter={{ lat: 4.6097, lng: -74.0817 }}
                                            defaultZoom={12}
                                            mapId={MAP_ID}
                                            style={{ width: '100%', height: '100%' }}
                                        >
                                            {activeRoutes.filter(r => r.status === 'in_transit').map((r, i) => {
                                                const total = r.route_stops.length;
                                                const done = r.route_stops.filter(s => s.status === 'delivered' || s.status === 'failed').length;
                                                const progress = total > 0 ? (done / total) : 0;
                                                const mockPos = { 
                                                    lat: 4.6097 + (i * 0.05) + (progress * 0.02), 
                                                    lng: -74.0817 + (i * 0.02) + (progress * 0.05) 
                                                };

                                                return (
                                                    <AdvancedMarker key={r.id} position={mockPos}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                            <div style={{ 
                                                                backgroundColor: 'white', 
                                                                color: '#0891B2', 
                                                                padding: '4px 10px', 
                                                                borderRadius: '12px', 
                                                                fontSize: '0.75rem', 
                                                                fontWeight: '900', 
                                                                marginBottom: '4px', 
                                                                border: '1px solid #E5E7EB',
                                                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                                            }}>
                                                                {r.vehicle_plate}
                                                            </div>
                                                            <Pin background={'#0891B2'} glyphColor={'white'} borderColor={'#0E7490'} scale={1.2} />
                                                        </div>
                                                    </AdvancedMarker>
                                                );
                                            })}
                                        </Map>
                                    </APIProvider>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', backgroundColor: '#F3F4F6' }}>
                                        <div style={{ fontSize: '4rem' }}>🛰️</div>
                                        <h3 style={{ color: '#111827' }}>Mapa no configurado</h3>
                                        <p style={{ color: '#6B7280' }}>Inyecta la API Key para activar satélites.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'planner' ? (
                        <div style={{ height: 'calc(100vh - 380px)', overflow: 'hidden' }}>
                           <RoutePlanner />
                        </div>
                    ) : activeTab === 'fleet' ? (
                        <FleetManagement />
                    ) : activeTab === 'drivers_panel' ? (
                        <ConductorPanel />
                    ) : activeTab === 'kpis' ? (
                        <div style={{ height: 'calc(100vh - 380px)', overflowY: 'auto' }}>
                            <ControlTowerKPIs />
                        </div>
                    ) : (
                        <MaintenanceManagement />
                    )}
                </div>
            </div>
        </main>
    );
}

function StatBox({ label, value, color, icon, bg }: { label: string, value: number, color: string, icon: string, bg: string }) {
    return (
        <div style={{ 
            padding: '1.5rem 2.5rem', 
            textAlign: 'left', 
            minWidth: '180px', 
            borderRadius: '24px',
            backgroundColor: bg,
            border: `1px solid ${color}20`,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
            boxShadow: '0 2px 10px -4px rgba(0,0,0,0.02)'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1rem' }}>{label}</span>
            </div>
            <div style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', lineHeight: '1', letterSpacing: '-0.05rem' }}>{value}</div>
        </div>
    );
}
