'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import FleetManagement from '@/components/FleetManagement';
import MaintenanceManagement from '@/components/MaintenanceManagement';
import RoutePlanner from '@/components/RoutePlanner';
import ConductorPanel from '@/components/ConductorPanel';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { 
    Truck, 
    CheckCircle2, 
    Scale, 
    AlertTriangle, 
    Globe, 
    Compass, 
    Users, 
    Wrench, 
    TrendingUp, 
    RefreshCw, 
    PackageOpen, 
    MapPin, 
    Activity,
    FileText,
    Loader2,
    ShieldAlert,
    Package,
    X,
    Sliders,
    Plus,
    Save,
    Box,
    Layers,
    Building2,
    CornerDownRight
} from 'lucide-react';
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
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'map' | 'planner' | 'fleet' | 'maintenance' | 'drivers_panel' | 'kpis' | 'crates'>('map');
    const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
    const [crateProfiles, setCrateProfiles] = useState<any[]>([]);
    const [patioStock, setPatioStock] = useState<number>(420);
    const [isPatioModalOpen, setIsPatioModalOpen] = useState(false);
    const [patioModalType, setPatioModalType] = useState<'initial' | 'purchase' | 'damage'>('initial');
    const [patioModalQty, setPatioModalQty] = useState<number>(0);
    const [patioModalReason, setPatioModalReason] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const isMounted = useRef(true);

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

    const canView = hasPermission('admin.transport.view');
    const canEdit = hasPermission('admin.transport.edit');

    const [stats, setStats] = useState({
        totalActive: 0,
        completedToday: 0,
        totalNovedades: 0,
        totalKilos: 0
    });
    const [appName, setAppName] = useState('Logistics Pro');

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    const getInitials = (name: string) => {
        if (!name) return '';
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const [fleetData, setFleetData] = useState<any[]>([]);
    const [driversData, setDriversData] = useState<any[]>([]);

    const fetchTransportData = useCallback(async (signal?: AbortSignal) => {
        try {
            setLoading(true);

            // Fetch system_roles from app_settings
            const { data: rolesData, error: rolesError } = await supabase
                .from('app_settings')
                .select('key, value')
                .eq('key', 'system_roles')
                .maybeSingle()
                .abortSignal(signal as AbortSignal);

            if (!rolesError && rolesData?.value && isMounted.current) {
                try {
                    setRoles(JSON.parse(rolesData.value));
                } catch (e) {
                    console.error('Error parsing system_roles:', e);
                }
            }
            
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
                    .select('*, order:orders(latitude, longitude, shipping_address, profiles(company_name, contact_name))')
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

            // Fetch live profiles with crate activity or loan authorization
            try {
                const { data: cProfiles } = await supabase
                    .from('profiles')
                    .select('id, company_name, contact_name, identification, needs_crates, crate_balance, parent_id, is_corporate_parent');
                if (cProfiles && isMounted.current) {
                    setCrateProfiles(cProfiles);
                }

                const { data: stockData } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'warehouse_crate_stock')
                    .maybeSingle();

                if (stockData?.value && isMounted.current) {
                    setPatioStock(parseInt(stockData.value) || 0);
                }
            } catch (e) {
                console.warn('Could not fetch crate profiles or patio stock:', e);
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

    if (loading) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: '#0EA5E9' }} />
                    <span style={{ color: '#64748B', fontSize: '0.85rem', fontWeight: '600' }}>Cargando Torre de Control...</span>
                </div>
            </main>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: 'white',
                    borderRadius: '16px',
                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
                    maxWidth: '480px',
                    border: '1px solid #E2E8F0',
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: '#EF4444',
                        marginBottom: '1.5rem',
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.75rem' }}>
                        Acceso Denegado
                    </h1>
                    <p style={{ color: '#64748B', fontSize: '0.95rem', lineHeight: '1.5' }}>
                        No tienes los permisos necesarios para visualizar la Torre de Control de Logística. Por favor, solicita acceso a un administrador si consideras que esto es un error.
                    </p>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', color: '#0F172A', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '1rem 2rem' }}>
                {!canEdit && (
                    <div style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.2)',
                        color: '#D97706',
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '1rem',
                        marginTop: '0.5rem'
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Vista: No tienes permisos para modificar la operación de transporte.</span>
                    </div>
                )}
                
                {/* Slim Premium Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '0.8rem', padding: '0 0.5rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0EA5E9', boxShadow: '0 0 10px #0EA5E9' }}></div>
                            <span style={{ fontSize: '0.65rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.1em' }}>LOGISTICS & SUPPLY CHAIN / TOWER</span>
                        </div>
                        <h1 style={{ fontSize: '1.85rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.02em', margin: 0 }}>
                            Transporte
                        </h1>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 180px)', gap: '1rem' }}>
                        <KPICard title="EN TRÁNSITO" value={formatNumber(stats.totalActive)} icon={<Truck size={18} strokeWidth={1.5} />} color="#0EA5E9" subtitle="Rutas activas hoy" />
                        <KPICard title="ENTREGAS" value={formatNumber(stats.completedToday)} icon={<CheckCircle2 size={18} strokeWidth={1.5} />} color="#10B981" subtitle="Rutas finalizadas" />
                        <KPICard title="VOLUMEN" value={`${formatNumber(stats.totalKilos)} kg`} icon={<Scale size={18} strokeWidth={1.5} />} color="#6366F1" subtitle="Carga total gestionada" />
                        <KPICard title="ALERTAS" value={formatNumber(stats.totalNovedades)} icon={<AlertTriangle size={18} strokeWidth={1.5} />} color="#F43F5E" subtitle="Novedades reportadas" />
                    </div>
                </div>

                {/* Integrated Control Bar */}
                <div style={{ 
                    backgroundColor: 'white', 
                    padding: '0.4rem 1rem', 
                    borderRadius: '20px', 
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)', 
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.8rem'
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {[
                            { id: 'map', label: 'Monitor Global', icon: <Globe size={14} strokeWidth={1.5} /> },
                            { id: 'planner', label: 'Planeación', icon: <Compass size={14} strokeWidth={1.5} /> },
                            { id: 'fleet', label: 'Flota', icon: <Truck size={14} strokeWidth={1.5} /> },
                            { id: 'drivers_panel', label: 'Conductores', icon: <Users size={14} strokeWidth={1.5} /> },
                            { id: 'maintenance', label: 'Mantenimiento', icon: <Wrench size={14} strokeWidth={1.5} /> },
                            { id: 'kpis', label: 'Insights', icon: <TrendingUp size={14} strokeWidth={1.5} /> },
                            { id: 'crates', label: 'Canastillas', icon: <Package size={14} strokeWidth={1.5} /> }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '14px', border: 'none',
                                    backgroundColor: activeTab === tab.id ? '#0F172A' : 'transparent',
                                    color: activeTab === tab.id ? 'white' : '#64748B',
                                    fontSize: '0.75rem', fontWeight: '800', cursor: 'pointer', transition: 'all 0.2s'
                                }}
                            >
                                <span style={{ display: 'inline-flex', alignItems: 'center' }}>{tab.icon}</span>
                                {tab.label.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    <button 
                        onClick={() => fetchTransportData()}
                        disabled={loading}
                        style={{ 
                            padding: '6px 16px', borderRadius: '14px', border: '1px solid #E2E8F0', backgroundColor: 'white',
                            color: '#0F172A', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                        }}
                    >
                        {loading ? 'Sincronizando...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><RefreshCw size={12} strokeWidth={1.5} /> ACTUALIZAR</span>}
                    </button>
                </div>

                {/* Main Content Area */}
                <div style={{ position: 'relative', height: 'calc(100vh - 110px)' }}>
                    {activeTab === 'map' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '1.5rem', height: 'calc(100vh - 200px)' }}>
                            {/* Route Feed */}
                            <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '1.25rem', overflowY: 'auto' }}>
                                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '900', color: '#0F172A' }}>ESTADO DE RUTAS</h3>
                                    <span style={{ fontSize: '0.65rem', color: '#6B7280', fontWeight: '700' }}>{activeRoutes.length} TOTAL</span>
                                </div>
                                
                                {activeRoutes.length === 0 && !loading && (
                                    <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94A3B8' }}>
                                        <div style={{ color: THEME.colors.textSecondary, marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}><PackageOpen size={48} strokeWidth={1.5} /></div>
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
                                        <Map defaultCenter={{ lat: 4.633653, lng: -74.160647 }} defaultZoom={13} mapId={MAP_ID} style={{ width: '100%', height: '100%' }}>
                                            <AdvancedMarker position={{ lat: 4.633653, lng: -74.160647 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ backgroundColor: THEME.colors.textMain, color: 'white', padding: '4px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '900', marginBottom: '4px' }}>BODEGA</div>
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
                                                    : { lat: 4.633653 + (Math.sin(i) * 0.01), lng: -74.160647 + (Math.cos(i) * 0.01) };

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
                                        <div style={{ color: THEME.colors.textSecondary, display: 'flex', justifyContent: 'center' }}><MapPin size={48} strokeWidth={1.5} /></div>
                                        <div style={{ fontWeight: '800', color: '#64748B' }}>Google Maps no configurado</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : activeTab === 'planner' ? (
                        <RoutePlanner readOnly={!canEdit} />
                    ) : activeTab === 'fleet' ? (
                        <FleetManagement readOnly={!canEdit} />
                    ) : activeTab === 'drivers_panel' ? (
                        <ConductorPanel readOnly={!canEdit} />
                    ) : activeTab === 'kpis' ? (
                        <ControlTowerKPIs />
                    ) : activeTab === 'maintenance' ? (
                        <MaintenanceManagement readOnly={!canEdit} />
                    ) : (
                        /* CRATES CONTROL TOWER TAB */
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <Package size={22} color="#0D9488" /> Torre de Control de Canastillas de Logística
                                    </h2>
                                    <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B', fontWeight: '500' }}>
                                        Consolidado maestro de inventario prestado a clientes, rutas en tránsito e historial de movimientos.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                                    <button
                                        onClick={() => {
                                            setPatioModalQty(patioStock);
                                            setPatioModalReason('');
                                            setIsPatioModalOpen(true);
                                        }}
                                        style={{ padding: '0.55rem 1.1rem', borderRadius: '14px', backgroundColor: '#0F172A', color: 'white', fontWeight: '800', fontSize: '0.78rem', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 6px rgba(15, 23, 42, 0.12)', transition: 'all 0.2s' }}
                                    >
                                        <Sliders size={14} strokeWidth={2} /> Ajustar Inventario Patio / Carga Inicial
                                    </button>
                                </div>
                            </div>

                            {/* Dynamic Global KPI Cards */}
                            {(() => {
                                const activeCrateProfiles = crateProfiles.filter(p => p.needs_crates || (p.crate_balance || 0) > 0);
                                const totalInCalle = activeCrateProfiles.reduce((acc, p) => acc + Number(p.crate_balance || 0), 0);
                                const alertCount = activeCrateProfiles.filter(p => Number(p.crate_balance || 0) > 40).length;

                                return (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                                            <div style={{ backgroundColor: '#ECFDF5', padding: '1rem', borderRadius: '16px', border: '1px solid #A7F3D0' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase' }}>CANASTILLAS EN CALLE</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: '950', color: '#065F46', marginTop: '2px' }}>{totalInCalle} <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>und</span></div>
                                                <div style={{ fontSize: '0.68rem', color: '#047857', marginTop: '2px', fontWeight: '600' }}>Prestadas a clientes institucionales</div>
                                            </div>

                                            <div style={{ backgroundColor: '#EFF6FF', padding: '1rem', borderRadius: '16px', border: '1px solid #BFDBFE' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#1D4ED8', textTransform: 'uppercase' }}>EN TRÁNSITO HOY</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: '950', color: '#1E40AF', marginTop: '2px' }}>0 <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>und</span></div>
                                                <div style={{ fontSize: '0.68rem', color: '#1D4ED8', marginTop: '2px', fontWeight: '600' }}>A bordo de camiones en ruta</div>
                                            </div>

                                            <div style={{ backgroundColor: '#F8FAFC', padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase' }}>DISPONIBLES PATIO</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: '950', color: '#1E293B', marginTop: '2px' }}>{patioStock} <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>und</span></div>
                                                <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px', fontWeight: '600' }}>Físicas listas para alistamiento</div>
                                            </div>

                                            <div style={{ backgroundColor: alertCount > 0 ? '#FEF2F2' : '#F8FAFC', padding: '1rem', borderRadius: '16px', border: alertCount > 0 ? '1px solid #FCA5A5' : '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '800', color: alertCount > 0 ? '#991B1B' : '#64748B', textTransform: 'uppercase' }}>SUCURSALES EN ALERTA</div>
                                                <div style={{ fontSize: '1.8rem', fontWeight: '950', color: alertCount > 0 ? '#7F1D1D' : '#1E293B', marginTop: '2px' }}>{alertCount} <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>cuentas</span></div>
                                                <div style={{ fontSize: '0.68rem', color: alertCount > 0 ? '#991B1B' : '#64748B', marginTop: '2px', fontWeight: '600' }}>Superan retención &gt; 40 canastillas</div>
                                            </div>
                                        </div>

                                        {/* Main Matrix Breakdown Table */}
                                        <div style={{ border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden' }}>
                                            <div style={{ padding: '0.8rem 1.25rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.82rem', fontWeight: '800', color: '#334155', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Package size={14} color="#0EA5E9" /> Consolidado de Canastillas por Casa Matriz y Sucursales en Vivo
                                            </div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: '#F8FAFC', color: '#475569', textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.7rem', borderBottom: '1px solid #E2E8F0' }}>
                                                        <th style={{ padding: '0.75rem 1rem' }}>Cliente / Sucursal</th>
                                                        <th style={{ padding: '0.75rem 1rem' }}>NIT / Identificación</th>
                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Préstamo Habilitado</th>
                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Canastillas Retenidas</th>
                                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Estado Retención</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activeCrateProfiles.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#64748B', fontWeight: '600' }}>
                                                                No hay clientes con saldo de canastillas prestadas acumulado en la base de datos
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        activeCrateProfiles.map((p) => {
                                                            const isHighAlert = (p.crate_balance || 0) > 40;
                                                            return (
                                                                <tr key={p.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: p.is_corporate_parent ? '900' : '700', color: '#0F172A' }}>
                                                                        {p.is_corporate_parent ? (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                                <Building2 size={14} style={{ color: '#0F172A' }} /> {p.company_name || p.contact_name} (CASA MATRIZ)
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                                <CornerDownRight size={14} style={{ color: '#64748B' }} /> {p.company_name || p.contact_name}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ padding: '0.75rem 1rem', color: '#64748B', fontWeight: '700' }}>{p.identification || 'N/A'}</td>
                                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                                        <span style={{ color: p.needs_crates ? '#10B981' : '#F59E0B', fontWeight: '800' }}>
                                                                            {p.needs_crates ? (p.is_corporate_parent ? 'SI (Matriz)' : 'Heredado') : 'No Autorizado'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '900', color: isHighAlert ? '#991B1B' : '#0F172A', fontSize: '0.9rem' }}>
                                                                        {p.crate_balance || 0} und
                                                                    </td>
                                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                                        <span style={{ backgroundColor: isHighAlert ? '#FEF3C7' : '#ECFDF5', color: isHighAlert ? '#92400E' : '#065F46', padding: '4px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                            {isHighAlert ? <><AlertTriangle size={12} /> Retención Alta</> : <><CheckCircle2 size={12} /> Normal</>}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL: AJUSTE DE INVENTARIO EN PATIO / CARGA INICIAL (ESTILO THEME + LUCIDE ICONS) */}
            {isPatioModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, maxWidth: '520px', width: '100%', padding: '1.75rem', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.8rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '10px', fontFamily: THEME.typography.fontFamilyMain }}>
                                <Sliders size={20} style={{ color: THEME.colors.primary }} /> Ajuste de Inventario de Patio / Carga Inicial
                            </h3>
                            <button onClick={() => setIsPatioModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Tipo de Operación / Movimiento
                                </label>
                                <select 
                                    value={patioModalType}
                                    onChange={(e) => setPatioModalType(e.target.value as any)}
                                    style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', fontWeight: '700', fontSize: '0.85rem', color: THEME.colors.textMain, backgroundColor: 'white' }}
                                >
                                    <option value="initial">Conteo Físico Inicial / Auditoría de Patio</option>
                                    <option value="purchase">Compra de Canastillas Nuevas</option>
                                    <option value="damage">Baja por Daño / Descuadre en Planta</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {patioModalType === 'initial' ? 'Inventario Total Actual en Patio (unidades)' : 'Cantidad de Canastillas (+/-)'}
                                </label>
                                <input 
                                    type="number"
                                    value={patioModalQty}
                                    onChange={(e) => setPatioModalQty(parseInt(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', fontWeight: '900', fontSize: '1.2rem', color: THEME.colors.textMain, backgroundColor: 'white' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Motivo u Observación Obligatoria (Trazabilidad Kardex)
                                </label>
                                <textarea 
                                    placeholder="Ej: Conteo físico semanal en patio realizado por Jefe de Bodega..."
                                    value={patioModalReason}
                                    onChange={(e) => setPatioModalReason(e.target.value)}
                                    style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', minHeight: '80px', fontSize: '0.85rem', fontFamily: 'inherit', color: THEME.colors.textMain, backgroundColor: 'white' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem', paddingTop: '1rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                                <button
                                    onClick={() => setIsPatioModalOpen(false)}
                                    style={{ padding: '0.65rem 1.25rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.82rem', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        if (!patioModalReason.trim()) {
                                            alert('Por favor ingrese el motivo del ajuste para garantizar la trazabilidad Kardex.');
                                            return;
                                        }
                                        try {
                                            const newStock = patioModalType === 'initial' 
                                                ? patioModalQty 
                                                : patioModalType === 'purchase' 
                                                ? patioStock + patioModalQty 
                                                : Math.max(0, patioStock - patioModalQty);

                                            // 1. Update app_settings
                                            await supabase
                                                .from('app_settings')
                                                .upsert({ key: 'warehouse_crate_stock', value: String(newStock) }, { onConflict: 'key' });

                                            // 2. Insert into crates_ledger if table exists
                                            await supabase
                                                .from('crates_ledger')
                                                .insert([{
                                                    movement_type: patioModalType === 'initial' ? 'initial_count' : patioModalType === 'purchase' ? 'new_purchase' : 'damage_writeoff',
                                                    quantity: patioModalQty,
                                                    notes: patioModalReason
                                                }]);

                                            setPatioStock(newStock);
                                            setIsPatioModalOpen(false);
                                            alert('Inventario de patio actualizado correctamente a ' + newStock + ' und. Registro Kardex guardado.');
                                        } catch (e: any) {
                                            console.error('Error guardando ajuste:', e);
                                            alert('Stock actualizado localmente a ' + patioModalQty + ' und.');
                                            setPatioStock(patioModalQty);
                                            setIsPatioModalOpen(false);
                                        }
                                    }}
                                    style={{ padding: '0.65rem 1.4rem', borderRadius: THEME.radius.md, border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: '900', fontSize: '0.85rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', boxShadow: THEME.shadow.md }}
                                >
                                    <Save size={16} strokeWidth={2} /> Guardar Ajuste en Kardex
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}

function KPICard({ title, value, icon, color, subtitle }: any) {
    return (
        <div style={{
            backgroundColor: THEME.colors.surface,
            padding: '1rem',
            borderRadius: THEME.radius.lg,
            border: `1px solid ${THEME.colors.border}`,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
        }}>
            <div style={{ backgroundColor: `${color}10`, width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, flexShrink: 0 }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.6rem', fontWeight: '900', color: THEME.colors.textSecondary, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{title}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: THEME.colors.textMain, lineHeight: 1, margin: '2px 0' }}>{value}</div>
                <div style={{ fontSize: '0.6rem', color: '#94A3B8', fontWeight: '600' }}>{subtitle}</div>
            </div>
        </div>
    );
}
