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
    const [appName, setAppName] = useState('Logistics Pro');

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

            // Fetch app name for dynamic branding
            const { data: nameData } = await supabase
                .from('app_settings')
                .select('value')
                .eq('key', 'app_short_name')
                .single();
            
            if (nameData?.value && isMounted.current) {
                setAppName(nameData.value);
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

    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <main style={{ 
            minHeight: '150vh', 
            backgroundColor: '#F9FAFB', 
            color: '#111827',
            fontFamily: 'apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
        }}>
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
                
                :root {
                    --accent: #0891B2;
                    --accent-glow: rgba(8, 145, 178, 0.15);
                    --glass-bg: rgba(255, 255, 255, 0.7);
                    --glass-border: rgba(255, 255, 255, 0.5);
                    --card-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.07);
                }

                @keyframes pulse-cyan {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(8, 145, 178, 0.4); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(8, 145, 178, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(8, 145, 178, 0); }
                }
                
                @keyframes slide-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .live-pulse {
                    width: 10px;
                    height: 10px;
                    background: #0891B2;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 8px;
                    animation: pulse-cyan 2s infinite;
                }
                
                .glass-card {
                    background: var(--glass-bg);
                    backdrop-filter: blur(12px);
                    -webkit-backdrop-filter: blur(12px);
                    border: 1px solid var(--glass-border);
                    border-radius: 24px;
                    box-shadow: var(--card-shadow);
                }

                .premium-nav-item {
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
                
                .premium-nav-item:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
                }

                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #E5E7EB; border-radius: 10px; }
                ::-webkit-scrollbar-thumb:hover { background: #D1D5DB; }
            `}</style>
            
            <Navbar />
            
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '1.5rem 2rem' }}>
                <div style={{ 
                    marginBottom: '1rem', 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '1rem',
                    padding: '1.5rem 2.5rem',
                    background: 'linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)',
                    borderRadius: '32px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 10px 30px -10px rgba(0,0,0,0.04)',
                    position: 'relative',
                    overflow: 'hidden'
                }}>
                    {/* Decorative Background Element */}
                    <div style={{ 
                        position: 'absolute', top: '-10%', right: '-5%', width: '300px', height: '300px', 
                        background: 'radial-gradient(circle, rgba(8, 145, 178, 0.03) 0%, transparent 70%)',
                        zIndex: 0
                    }}></div>
                    
                    {/* Header & Stats Section - Hidden on Scroll */}
                    <div style={{ 
                        maxHeight: scrolled ? '0px' : '400px', 
                        opacity: scrolled ? 0 : 1, 
                        overflow: 'hidden', 
                        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                        pointerEvents: scrolled ? 'none' : 'auto',
                        marginBottom: scrolled ? '0rem' : '1.5rem'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative', zIndex: 1, padding: '1rem 0' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
                                    <span className="live-pulse"></span>
                                    <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#0891B2', letterSpacing: '0.15rem', textTransform: 'uppercase' }}>CENTRO DE MANDO</span>
                                </div>
                                <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-0.1rem', lineHeight: 1 }}>
                                    Torre de <span style={{ color: '#0891B2' }}>Control</span>
                                </h1>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.6rem' }}>
                                    <p style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: '500', margin: 0 }}>Rutas estratégicas <span style={{ color: '#0F172A', fontWeight: '700' }}>{appName}</span>.</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <StatBox label="EN TRÁNSITO" value={stats.totalActive} color="#0891B2" icon="⚡" bg="linear-gradient(135deg, #E0F2FE 0%, #BAE6FD 100%)" />
                                    <StatBox label="ENTREGAS" value={stats.completedToday} color="#10B981" icon="✨" bg="linear-gradient(135deg, #DCFCE7 0%, #BBF7D0 100%)" />
                                    <StatBox label="ALERTAS" value={stats.totalNovedades} color="#EF4444" icon="🔥" bg="linear-gradient(135deg, #FEE2E2 0%, #FECACA 100%)" />
                                </div>
                                
                                <button 
                                    onClick={() => fetchTransportData()}
                                    disabled={loading}
                                    style={{ 
                                        padding: '0.7rem', borderRadius: '14px', 
                                        backgroundColor: 'white', color: '#64748B', border: '1px solid #E2E8F0', 
                                        fontSize: '0.7rem', fontWeight: '800', cursor: 'pointer',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: loading ? 0.5 : 1,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = '#F8FAFC';
                                        e.currentTarget.style.transform = 'scale(1.05)';
                                        e.currentTarget.style.color = '#0F172A';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = 'white';
                                        e.currentTarget.style.transform = 'scale(1)';
                                        e.currentTarget.style.color = '#64748B';
                                    }}
                                    title="Actualizar Datos"
                                >
                                    <span style={{ fontSize: '1.2rem', animation: loading ? 'spin 1s linear infinite' : 'none', display: 'inline-block' }}>{loading ? '⌛' : '🔄'}</span> 
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Sticky Navigation Area (Nested inside the header but with sticky behavior) */}
                    <nav style={{ 
                        position: 'sticky', 
                        top: '0px', 
                        zIndex: 10, 
                        display: 'flex', 
                        gap: '0.8rem', 
                        flexWrap: 'wrap',
                        backgroundColor: scrolled ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                        backdropFilter: scrolled ? 'blur(8px)' : 'none',
                        margin: '0 -1rem',
                        padding: '0.5rem 1rem',
                        borderRadius: scrolled ? '16px' : '0',
                        transition: 'all 0.3s ease'
                    }}>
                        {[
                            { id: 'map', label: 'Monitor Global', icon: '🌍' },
                            { id: 'planner', label: 'Planeación', icon: '🧭' },
                            { id: 'fleet', label: 'Flota', icon: '🚛' },
                            { id: 'drivers_panel', label: 'Conductores', icon: '👥' },
                            { id: 'maintenance', label: 'Mantenimiento', icon: '🛠️' },
                            { id: 'kpis', label: 'Insights / KPIs', icon: '📈' }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as 'map' | 'planner' | 'fleet' | 'maintenance' | 'drivers_panel' | 'kpis')}
                                className="premium-nav-item"
                                style={{
                                    background: activeTab === tab.id ? '#0F172A' : '#FFFFFF',
                                    border: '1px solid',
                                    borderColor: activeTab === tab.id ? '#0F172A' : '#E2E8F0',
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '14px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    color: activeTab === tab.id ? 'white' : '#64748B',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.6rem',
                                    boxShadow: activeTab === tab.id ? '0 8px 12px -3px rgba(15, 23, 42, 0.2)' : 'none',
                                    transform: activeTab === tab.id ? 'translateY(-1px)' : 'none',
                                    transition: 'all 0.2s ease'
                                }}
                            >
                                <span style={{ fontSize: '1rem', filter: activeTab === tab.id ? 'none' : 'grayscale(1)' }}>{tab.icon}</span>
                                <span style={{ letterSpacing: '0.01rem' }}>{tab.label.toUpperCase()}</span>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className="glass-card" style={{ 
                    padding: '1.5rem', 
                    minHeight: 'calc(100vh - 150px)', 
                    position: 'relative', 
                    overflow: 'visible', 
                    display: 'flex', 
                    flexDirection: 'column',
                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                    marginTop: '0.5rem'
                }}>
                    {/* Background Soft Glow */}
                    <div style={{ 
                        position: 'absolute', bottom: '-20%', left: '-10%', width: '600px', height: '600px', 
                        background: 'radial-gradient(circle, rgba(8, 145, 178, 0.05) 0%, transparent 70%)',
                        zIndex: 0
                    }}></div>
                    
                    <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
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
                        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '1.5rem', alignItems: 'start' }}>
                            {/* Feed Sidebar - Natural Scroll */}
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <div style={{ marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '900', color: '#374151' }}>ESTADO DE RUTAS</h3>
                                    <span style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: '600' }}>{activeRoutes.length} ACTIVAS</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {activeRoutes.map(route => {
                                        const total = route.route_stops.length;
                                        const done = route.route_stops.filter(s => s.status === 'delivered' || s.status === 'failed').length;
                                        const progress = total > 0 ? (done / total) * 100 : 0;
                                        const isInTransit = route.status === 'in_transit';

                                        return (
                                            <div key={route.id} style={{ 
                                                padding: '1.2rem', 
                                                borderRadius: '20px', 
                                                backgroundColor: isInTransit ? '#FFFFFF' : '#F9FAFB',
                                                border: isInTransit ? '1px solid #0891B2' : '1px solid #F3F4F6',
                                                marginBottom: '0.5rem',
                                                boxShadow: isInTransit ? '0 10px 15px -3px rgba(8, 145, 178, 0.1)' : 'none',
                                                transition: 'all 0.3s ease'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '900', fontSize: '1rem', color: '#111827' }}>{route.vehicle_plate}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: '700' }}>ID-{route.id.slice(0, 5)}</div>
                                                    </div>
                                                    <span style={{ 
                                                        fontSize: '0.6rem', fontWeight: '900', padding: '0.3rem 0.6rem', borderRadius: '20px',
                                                        backgroundColor: isInTransit ? '#0891B2' : '#6B7280',
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

                            {/* Sticky Map Main */}
                            <div style={{ 
                                borderRadius: '24px', 
                                overflow: 'hidden', 
                                border: '1px solid #E2E8F0', 
                                position: 'sticky', 
                                top: '100px', 
                                height: 'calc(100vh - 160px)',
                                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                                transition: 'all 0.3s ease'
                            }}>
                                {apiKey ? (
                                    <APIProvider apiKey={apiKey}>
                                        <Map
                                            defaultCenter={{ lat: 4.6300, lng: -74.1530 }}
                                            defaultZoom={13}
                                            mapId={MAP_ID}
                                            style={{ width: '100%', height: '100%' }}
                                        >
                                            {/* Fixed Warehouse Marker: Corabastos Puerta 2 */}
                                            <AdvancedMarker position={{ lat: 4.6300, lng: -74.1530 }} title="Bodega - Puerta 2 Corabastos">
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ 
                                                        backgroundColor: '#0F172A', 
                                                        color: 'white', 
                                                        padding: '4px 10px', 
                                                        borderRadius: '12px', 
                                                        fontSize: '0.7rem', 
                                                        fontWeight: '800', 
                                                        marginBottom: '4px',
                                                        boxShadow: '0 4px 10px rgba(0,0,0,0.2)',
                                                        border: '1px solid rgba(255,255,255,0.2)'
                                                    }}>
                                                        📦 BODEGA CORABASTOS
                                                    </div>
                                                    <Pin background={'#0F172A'} glyphColor={'white'} borderColor={'#000000'} scale={1.4} />
                                                </div>
                                            </AdvancedMarker>

                                            {activeRoutes.filter(r => r.status === 'in_transit' || r.status === 'loading').map((r, i) => {
                                                const total = r.route_stops.length;
                                                const doneStops = r.route_stops.filter(s => s.status === 'delivered' || s.status === 'failed');
                                                const currentStop = r.route_stops.find(s => s.status === 'pending') || r.route_stops[r.route_stops.length - 1];
                                                
                                                // Real position based on next pending stop, otherwise fallback to mock
                                                const realPos = currentStop?.order?.latitude && currentStop?.order?.longitude 
                                                    ? { lat: currentStop.order.latitude, lng: currentStop.order.longitude }
                                                    : null;

                                                const progress = total > 0 ? (doneStops.length / total) : 0;
                                                const mockPos = { 
                                                    lat: 4.6097 + (i * 0.05) + (progress * 0.02), 
                                                    lng: -74.0817 + (i * 0.02) + (progress * 0.05) 
                                                };
                                                
                                                const vehiclePos = realPos || mockPos;

                                                return (
                                                    <AdvancedMarker key={r.id} position={vehiclePos}>
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
                                                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                {r.vehicle_plate} • {Math.round(progress * 100)}%
                                                            </div>
                                                            <Pin background={r.status === 'loading' ? '#F59E0B' : '#0891B2'} glyphColor={'white'} borderColor={'#0E7490'} scale={1.2} />
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
                        <div style={{ height: '100%', overflow: 'hidden' }}>
                           <RoutePlanner />
                        </div>
                    ) : activeTab === 'fleet' ? (
                        <FleetManagement />
                    ) : activeTab === 'drivers_panel' ? (
                        <ConductorPanel />
                    ) : activeTab === 'kpis' ? (
                        <div style={{ height: '100%', overflowY: 'auto' }}>
                            <ControlTowerKPIs />
                        </div>
                    ) : (
                        <MaintenanceManagement />
                    )}
                </div>
            </div>
        </div>
    </main>
    );
}

function StatBox({ label, value, color, icon, bg }: { label: string, value: number, color: string, icon: string, bg: string }) {
    return (
        <div style={{ 
            padding: '0.8rem 1.5rem', 
            textAlign: 'left', 
            minWidth: '160px', 
            borderRadius: '24px',
            background: bg,
            border: `1px solid ${color}30`,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.2rem',
            boxShadow: `0 10px 20px -10px ${color}40`,
            position: 'relative',
            overflow: 'hidden',
            transition: 'transform 0.3s ease'
        }} onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
           onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
            
            {/* Subtle Inner Glow */}
            <div style={{ 
                position: 'absolute', top: '-20px', right: '-20px', width: '60px', height: '60px', 
                backgroundColor: 'rgba(255,255,255,0.4)', borderRadius: '50%', filter: 'blur(20px)'
            }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', position: 'relative', zIndex: 1 }}>
                <span style={{ 
                    fontSize: '1rem', 
                    backgroundColor: 'rgba(255,255,255,0.5)', 
                    width: '28px', height: '28px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', 
                    borderRadius: '8px' 
                }}>{icon}</span>
                <span style={{ fontSize: '0.6rem', fontWeight: '800', color: '#1E293B', letterSpacing: '0.08rem', textTransform: 'uppercase', opacity: 0.7 }}>{label}</span>
            </div>
            <div style={{ fontSize: '2.2rem', fontWeight: '900', color: '#0F172A', lineHeight: '1', letterSpacing: '-0.08rem', position: 'relative', zIndex: 1 }}>
                {value}
            </div>
        </div>
    );
}
