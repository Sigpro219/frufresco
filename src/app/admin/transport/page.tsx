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
    Layers,
    Building2,
    CornerDownRight,
    MessageCircle,
    Phone,
    Navigation,
    ExternalLink,
    Clock
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
    const [hoveredVehicleId, setHoveredVehicleId] = useState<string | null>(null);
    const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

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
                .select('id, contact_name, phone, specialty');

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
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <Loader2 size={36} className="animate-spin" style={{ color: THEME.colors.primary }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '700' }}>Cargando Torre de Control FruFresco...</span>
                </div>
            </main>
        );
    }

    if (!canView) {
        return (
            <main style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.background }}>
                <div style={{
                    textAlign: 'center',
                    padding: '3rem',
                    backgroundColor: THEME.colors.surface,
                    borderRadius: THEME.radius.xl,
                    boxShadow: THEME.shadow.md,
                    maxWidth: '480px',
                    border: `1px solid ${THEME.colors.border}`,
                }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: '#FEF2F2',
                        color: '#DC2626',
                        marginBottom: '1.5rem',
                    }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: '900', color: THEME.colors.textMain, marginBottom: '0.75rem', fontFamily: THEME.typography.fontFamilyMain }}>
                        Acceso Restringido
                    </h1>
                    <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', lineHeight: '1.5' }}>
                        No tienes los permisos requeridos para acceder a la Torre de Control de Logística y Transporte de FruFresco.
                    </p>
                </div>
            </main>
        );
    }

    // Quick Fleet Calculation for Sidebar Intelligence Widget
    const totalVehicles = fleetData.length;
    const vehiclesOnRoute = fleetData.filter(v => v.status === 'on_route').length;
    const vehiclesAvailable = fleetData.filter(v => v.status === 'available').length;
    const vehiclesMaintenance = fleetData.filter(v => v.status === 'maintenance').length;
    const avgKilosPerRoute = activeRoutes.length > 0 ? Math.round(stats.totalKilos / activeRoutes.length) : 0;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, color: THEME.colors.textMain, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0.85rem 1.5rem 1.5rem' }}>
                {!canEdit && (
                    <div style={{
                        padding: '10px 14px',
                        borderRadius: THEME.radius.md,
                        backgroundColor: '#FFFBEB',
                        border: '1px solid #FDE68A',
                        color: '#B45309',
                        fontSize: '0.82rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '0.8rem'
                    }}>
                        <ShieldAlert size={16} />
                        <span>Modo Auditoría / Solo Lectura: No tienes permisos de edición en la flota de transporte.</span>
                    </div>
                )}
                
                {/* ── TOP HEADER & INTEGRATED KPIS ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: THEME.colors.primary, boxShadow: `0 0 8px ${THEME.colors.primary}80` }}></div>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.primary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                CADENA DE SUMINISTRO &bull; TORRE DE CONTROL
                            </span>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.primaryLight, padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                                Bodega Central Corabastos
                            </span>
                        </div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
                            Transporte &amp; Despachos
                        </h1>
                    </div>

                    {/* 4 Brand Harmonized KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.75rem', flex: '1 1 680px', maxWidth: '850px' }}>
                        <KPICard title="EN TRÁNSITO" value={formatNumber(stats.totalActive)} icon={<Truck size={17} strokeWidth={2} />} color={THEME.colors.primary} subtitle="Rutas en movimiento hoy" />
                        <KPICard title="ENTREGAS" value={formatNumber(stats.completedToday)} icon={<CheckCircle2 size={17} strokeWidth={2} />} color="#059669" subtitle="Rutas finalizadas hoy" />
                        <KPICard title="VOLUMEN TOTAL" value={`${formatNumber(stats.totalKilos)} kg`} icon={<Scale size={17} strokeWidth={2} />} color="#D97706" subtitle="Carga total a bordo" />
                        <KPICard title="ALERTAS / NOVEDADES" value={formatNumber(stats.totalNovedades)} icon={<AlertTriangle size={17} strokeWidth={2} />} color="#DC2626" subtitle="Incidencias registradas" />
                    </div>
                </div>

                {/* ── SEGMENTED NAVIGATION CONTROL BAR ── */}
                <div style={{ 
                    position: 'sticky',
                    top: '80px',
                    zIndex: 30,
                    backgroundColor: THEME.colors.surface, 
                    padding: '0.35rem 0.6rem', 
                    borderRadius: THEME.radius.lg, 
                    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)', 
                    border: `1px solid ${THEME.colors.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.85rem',
                    gap: '0.75rem',
                    backdropFilter: 'blur(8px)'
                }}>
                    <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {[
                            { id: 'map', label: 'Monitor Global', icon: <Globe size={14} strokeWidth={2} /> },
                            { id: 'planner', label: 'Planeación', icon: <Compass size={14} strokeWidth={2} /> },
                            { id: 'fleet', label: 'Flota', icon: <Truck size={14} strokeWidth={2} /> },
                            { id: 'drivers_panel', label: 'Conductores', icon: <Users size={14} strokeWidth={2} /> },
                            { id: 'maintenance', label: 'Mantenimiento', icon: <Wrench size={14} strokeWidth={2} /> },
                            { id: 'kpis', label: 'Insights & KPIs', icon: <TrendingUp size={14} strokeWidth={2} /> },
                            { id: 'crates', label: 'Canastillas', icon: <Package size={14} strokeWidth={2} /> }
                        ].map((tab) => {
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.45rem 0.85rem', borderRadius: '8px', border: 'none',
                                        backgroundColor: isActive ? THEME.colors.primary : 'transparent',
                                        color: isActive ? '#FFFFFF' : THEME.colors.textSecondary,
                                        fontSize: '0.76rem', fontWeight: '800', cursor: 'pointer', transition: 'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                                        boxShadow: isActive ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                            e.currentTarget.style.color = THEME.colors.textMain;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                            e.currentTarget.style.color = THEME.colors.textSecondary;
                                        }
                                    }}
                                >
                                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    <button 
                        onClick={() => fetchTransportData()}
                        disabled={loading}
                        style={{ 
                            padding: '0.45rem 0.9rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white',
                            color: THEME.colors.textMain, fontWeight: '800', fontSize: '0.74rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                            transition: 'all 0.15s', flexShrink: 0
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = THEME.colors.primary;
                            e.currentTarget.style.color = THEME.colors.primary;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = THEME.colors.border;
                            e.currentTarget.style.color = THEME.colors.textMain;
                        }}
                    >
                        {loading ? 'Sincronizando...' : <><RefreshCw size={12} strokeWidth={2} /> Actualizar</>}
                    </button>
                </div>

                {/* ── MAIN CONTENT AREA ── */}
                <div style={{ position: 'relative', minHeight: 'calc(100vh - 220px)' }}>
                    {activeTab === 'map' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '390px 1fr', gap: '1.25rem', height: 'calc(100vh - 210px)' }}>
                            {/* Route Feed & Operational Intelligence Sidebar */}
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, padding: '1.1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                
                                {/* 1. Sidebar Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '0.82rem', fontWeight: '900', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Estado de Rutas en Vivo
                                        </h3>
                                        <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                            Despachos asignados para hoy
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '900', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '0.2rem 0.55rem', borderRadius: '6px' }}>
                                        {activeRoutes.length} RUTAS
                                    </span>
                                </div>

                                {/* 2. Fleet Overview Mini-Bar (Fills empty space with actionable data) */}
                                <div style={{ backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, padding: '0.65rem 0.8rem', border: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
                                        Resumen Operativo de Flota
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', textAlign: 'center' }}>
                                        <div style={{ backgroundColor: 'white', padding: '0.4rem 0.2rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '1rem', fontWeight: '900', color: THEME.colors.primary }}>{vehiclesOnRoute}</div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '700', color: THEME.colors.textSecondary }}>En Ruta</div>
                                        </div>
                                        <div style={{ backgroundColor: 'white', padding: '0.4rem 0.2rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#059669' }}>{vehiclesAvailable}</div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '700', color: THEME.colors.textSecondary }}>En Patio</div>
                                        </div>
                                        <div style={{ backgroundColor: 'white', padding: '0.4rem 0.2rem', borderRadius: '6px', border: `1px solid ${THEME.colors.border}` }}>
                                            <div style={{ fontSize: '1rem', fontWeight: '900', color: '#D97706' }}>{avgKilosPerRoute}</div>
                                            <div style={{ fontSize: '0.62rem', fontWeight: '700', color: THEME.colors.textSecondary }}>kg/Ruta Prom</div>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* 3. Active Routes List or Rich Empty State */}
                                {activeRoutes.length === 0 && !loading ? (
                                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', backgroundColor: '#F9FBFA', borderRadius: THEME.radius.lg, border: `1px dashed ${THEME.colors.borderActive}`, margin: 'auto 0' }}>
                                        <div style={{ color: THEME.colors.primary, marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                                            <Truck size={42} strokeWidth={1.5} />
                                        </div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.3rem' }}>
                                            No hay rutas activas en este momento
                                        </div>
                                        <p style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, margin: '0 0 1.25rem', lineHeight: 1.4 }}>
                                            {vehiclesAvailable > 0 
                                                ? `Tienes ${vehiclesAvailable} vehículo(s) disponible(s) en patio listos para asignar.` 
                                                : 'La flota se encuentra disponible para programar despachos del día.'}
                                        </p>
                                        <button
                                            onClick={() => setActiveTab('planner')}
                                            style={{
                                                backgroundColor: THEME.colors.primary,
                                                color: 'white',
                                                padding: '0.55rem 1.1rem',
                                                borderRadius: '8px',
                                                fontSize: '0.78rem',
                                                fontWeight: '800',
                                                border: 'none',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)'
                                            }}
                                        >
                                            <Compass size={14} /> Ir a Planeador de Rutas
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                        {activeRoutes.map(route => {
                                            const done = route.route_stops.filter(s => s.status === 'delivered' || s.status === 'failed').length;
                                            const total = route.route_stops.length;
                                            const progress = total > 0 ? (done / total) * 100 : 0;
                                            const isInTransit = route.status === 'in_transit';

                                            return (
                                                <div key={route.id} style={{ 
                                                    padding: '0.9rem', borderRadius: THEME.radius.lg, border: '1px solid',
                                                    borderColor: isInTransit ? THEME.colors.primary : THEME.colors.border,
                                                    backgroundColor: isInTransit ? '#F4F9F6' : 'white',
                                                    boxShadow: isInTransit ? '0 2px 8px rgba(13, 122, 87, 0.08)' : THEME.shadow.sm,
                                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.4rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div style={{ 
                                                                width: '32px', height: '32px', borderRadius: '8px', 
                                                                backgroundColor: isInTransit ? THEME.colors.primaryLight : '#F1F5F9',
                                                                color: isInTransit ? THEME.colors.primary : THEME.colors.textSecondary,
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '0.75rem'
                                                            }}>
                                                                {getInitials(route.driver?.contact_name || route.vehicle_plate)}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: '900', fontSize: '0.92rem', color: THEME.colors.textMain }}>{route.vehicle_plate}</div>
                                                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>
                                                                    {route.driver?.contact_name ? route.driver.contact_name : `Ruta ID-${route.id.slice(0, 5)}`}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span style={{ 
                                                            fontSize: '0.62rem', fontWeight: '800', padding: '3px 7px', borderRadius: '6px',
                                                            backgroundColor: isInTransit ? '#ECFDF5' : '#F1F5F9', 
                                                            color: isInTransit ? '#065F46' : THEME.colors.textSecondary,
                                                            border: isInTransit ? '1px solid #A7F3D0' : '1px solid #E2E8F0'
                                                        }}>
                                                            {route.status === 'in_transit' ? 'EN TRÁNSITO' : route.status.toUpperCase()}
                                                        </span>
                                                    </div>

                                                    {/* Proportional Progress Track */}
                                                    <div style={{ height: '5px', backgroundColor: '#E5E7EB', borderRadius: '4px', margin: '8px 0 6px', overflow: 'hidden' }}>
                                                        <div style={{ 
                                                            width: `${progress}%`, height: '100%', 
                                                            background: isInTransit ? 'linear-gradient(90deg, #0D7A57 0%, #10B981 100%)' : '#059669', 
                                                            transition: 'width 0.4s ease' 
                                                        }}></div>
                                                    </div>

                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', alignItems: 'center' }}>
                                                        <span style={{ color: THEME.colors.textSecondary, fontWeight: '700' }}>
                                                            {done}/{total} paradas completadas
                                                        </span>
                                                        <span style={{ fontWeight: '900', color: THEME.colors.primary }}>
                                                            {Math.round(progress)}% &bull; {formatNumber(route.total_kilos || 0)} kg
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Map Container with Floating HUD */}
                            <div style={{ borderRadius: THEME.radius.xl, overflow: 'hidden', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.md, position: 'relative' }}>
                                {apiKey ? (
                                    <>
                                        <Map defaultCenter={{ lat: 4.633653, lng: -74.160647 }} defaultZoom={13} mapId={MAP_ID} style={{ width: '100%', height: '100%' }}>
                                            {/* Bodega Central Marker */}
                                            <AdvancedMarker position={{ lat: 4.633653, lng: -74.160647 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ backgroundColor: THEME.colors.primary, color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.62rem', fontWeight: '900', marginBottom: '2px', boxShadow: '0 2px 6px rgba(13,122,87,0.35)' }}>
                                                        BODEGA CENTRAL
                                                    </div>
                                                    <Pin background={THEME.colors.primary} glyphColor={'white'} scale={1.2} />
                                                </div>
                                            </AdvancedMarker>

                                            {/* Fleet Vehicles on Live Map with Rich Operational Tooltips */}
                                            {fleetData.map((v: any, i: number) => {
                                                const driver = driversData.find((d: any) => d.id === v.driver_id);
                                                const initials = getInitials(driver?.contact_name || '');
                                                const activeRoute = activeRoutes.find((r: any) => r.vehicle_plate === v.plate || (v.driver_id && r.driver_id === v.driver_id));
                                                
                                                const pos = v.last_latitude && v.last_longitude 
                                                    ? { lat: v.last_latitude, lng: v.last_longitude }
                                                    : { lat: 4.633653 + (Math.sin(i) * 0.01), lng: -74.160647 + (Math.cos(i) * 0.01) };

                                                const isAvailable = v.status === 'available' || (!activeRoute && v.status !== 'maintenance');
                                                const isInRoute = activeRoute && (activeRoute.status === 'in_transit' || activeRoute.status === 'loading');
                                                const isHovered = hoveredVehicleId === v.id;
                                                const isSelected = selectedVehicleId === v.id;
                                                const isPopoverOpen = isHovered || isSelected;

                                                const doneStops = activeRoute ? activeRoute.route_stops.filter((s: any) => s.status === 'delivered' || s.status === 'failed').length : 0;
                                                const totalStops = activeRoute ? activeRoute.route_stops.length : 0;
                                                const routeProgress = totalStops > 0 ? Math.round((doneStops / totalStops) * 100) : 0;
                                                const nextStop = activeRoute?.route_stops.find((s: any) => s.status === 'pending');
                                                const nextClient = (nextStop as any)?.order?.profiles?.company_name || (nextStop as any)?.order?.customer_name || 'En camino a entrega';
                                                const nextAddress = (nextStop as any)?.order?.shipping_address || '';

                                                const totalKilos = activeRoute ? (activeRoute.total_kilos || 0) : 0;
                                                const capacityKg = v.capacity_kg || 3500;
                                                const loadPercent = capacityKg > 0 ? Math.min(100, Math.round((totalKilos / capacityKg) * 100)) : 0;
                                                const cleanPhone = driver?.phone ? driver.phone.replace(/\D/g, '') : '';
                                                const waUrl = cleanPhone ? `https://wa.me/57${cleanPhone}?text=${encodeURIComponent(`Hola ${driver?.contact_name || ''}, mensaje desde Torre de Control FruFresco (Vehículo ${v.plate}):`)}` : null;

                                                return (
                                                    <AdvancedMarker key={v.id} position={pos}>
                                                        <div 
                                                            style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}
                                                            onMouseEnter={() => setHoveredVehicleId(v.id)}
                                                            onMouseLeave={() => setHoveredVehicleId(null)}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedVehicleId(prev => prev === v.id ? null : v.id);
                                                            }}
                                                        >
                                                            {/* VEHICLE PIN AVATAR */}
                                                            <div style={{ 
                                                                width: isPopoverOpen ? '38px' : '32px', 
                                                                height: isPopoverOpen ? '38px' : '32px', 
                                                                borderRadius: '10px', 
                                                                background: isInRoute 
                                                                    ? 'linear-gradient(135deg, #0284C7 0%, #0D7A57 100%)' 
                                                                    : isAvailable 
                                                                        ? 'linear-gradient(135deg, #0D7A57 0%, #10B981 100%)' 
                                                                        : 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)', 
                                                                display: 'flex', 
                                                                alignItems: 'center', 
                                                                justifyContent: 'center', 
                                                                color: 'white', 
                                                                fontWeight: '900', 
                                                                fontSize: isPopoverOpen ? '0.85rem' : '0.75rem',
                                                                boxShadow: isPopoverOpen ? '0 8px 18px rgba(13, 122, 87, 0.4)' : '0 4px 10px rgba(0,0,0,0.18)',
                                                                border: isPopoverOpen ? '3px solid white' : '2px solid white',
                                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                transform: isPopoverOpen ? 'scale(1.1)' : 'scale(1)'
                                                            }}>
                                                                {initials || <Truck size={14} />}
                                                            </div>

                                                            {/* VEHICLE PLATE BADGE */}
                                                            <div style={{ 
                                                                backgroundColor: isPopoverOpen ? THEME.colors.primary : 'white', 
                                                                color: isPopoverOpen ? 'white' : THEME.colors.textMain, 
                                                                padding: '1px 6px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '0.55rem', 
                                                                fontWeight: '900', 
                                                                marginTop: '2px',
                                                                border: `1px solid ${isPopoverOpen ? THEME.colors.primary : THEME.colors.border}`,
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
                                                                transition: 'all 0.15s ease'
                                                            }}>
                                                                {v.plate}
                                                            </div>

                                                            {/* ── RICH OPERATIONAL TOOLTIP / POPOVER ── */}
                                                            {isPopoverOpen && (
                                                                <div 
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{
                                                                        position: 'absolute',
                                                                        bottom: '100%',
                                                                        left: '50%',
                                                                        transform: 'translateX(-50%) translateY(-10px)',
                                                                        width: '300px',
                                                                        backgroundColor: 'rgba(255, 255, 255, 0.98)',
                                                                        backdropFilter: 'blur(12px)',
                                                                        borderRadius: THEME.radius.lg,
                                                                        boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.22), 0 4px 12px rgba(13, 122, 87, 0.12)',
                                                                        border: `1px solid ${isInRoute ? '#BAE6FD' : isAvailable ? '#A7F3D0' : '#FED7AA'}`,
                                                                        padding: '0.85rem',
                                                                        zIndex: 99999,
                                                                        pointerEvents: 'auto',
                                                                        cursor: 'default',
                                                                        textAlign: 'left'
                                                                    }}
                                                                >
                                                                    {/* Popover Header */}
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', paddingBottom: '0.45rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <span style={{ fontSize: '0.95rem', fontWeight: '900', color: THEME.colors.textMain }}>
                                                                                {v.plate}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.62rem', fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.background, padding: '1px 5px', borderRadius: '4px' }}>
                                                                                {v.vehicle_type || 'Furgón'}
                                                                            </span>
                                                                        </div>
                                                                        <span style={{
                                                                            fontSize: '0.62rem',
                                                                            fontWeight: '900',
                                                                            padding: '2px 7px',
                                                                            borderRadius: '6px',
                                                                            backgroundColor: isInRoute ? '#EFF6FF' : isAvailable ? '#ECFDF5' : '#FEF3C7',
                                                                            color: isInRoute ? '#1D4ED8' : isAvailable ? '#065F46' : '#B45309',
                                                                            border: isInRoute ? '1px solid #BFDBFE' : isAvailable ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            {isInRoute ? (
                                                                                <>
                                                                                    <Navigation size={10} strokeWidth={2.5} style={{ color: '#1D4ED8' }} />
                                                                                    <span>EN RUTA</span>
                                                                                </>
                                                                            ) : isAvailable ? (
                                                                                <>
                                                                                    <Package size={10} strokeWidth={2.5} style={{ color: '#059669' }} />
                                                                                    <span>EN PATIO</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <AlertTriangle size={10} strokeWidth={2.5} style={{ color: '#D97706' }} />
                                                                                    <span>EN TALLER</span>
                                                                                </>
                                                                            )}
                                                                        </span>
                                                                    </div>

                                                                    {/* Driver & Contact Block */}
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <div style={{ width: '28px', height: '28px', borderRadius: '6px', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '900', fontSize: '0.72rem' }}>
                                                                                {initials || <Users size={12} />}
                                                                            </div>
                                                                            <div>
                                                                                <div style={{ fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, lineHeight: 1.1 }}>
                                                                                    {driver?.contact_name || 'Sin Conductor Asignado'}
                                                                                </div>
                                                                                <div style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                                                                    {driver?.specialty || 'Conductor Logística'}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    </div>


                                                                    {/* Cargo & Capacity Metrics */}
                                                                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '0.5rem 0.65rem', marginBottom: '0.6rem', border: `1px solid ${THEME.colors.border}` }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '3px' }}>
                                                                            <span>Carga a Bordo</span>
                                                                            <span style={{ color: THEME.colors.textMain }}>{formatNumber(totalKilos)} / {formatNumber(capacityKg)} kg ({loadPercent}%)</span>
                                                                        </div>
                                                                        <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                                                            <div style={{ width: `${loadPercent}%`, height: '100%', background: 'linear-gradient(90deg, #0D7A57 0%, #10B981 100%)', borderRadius: '3px' }}></div>
                                                                        </div>

                                                                        {isInRoute && (
                                                                            <div style={{ marginTop: '0.5rem', paddingTop: '0.45rem', borderTop: '1px dashed #E2E8F0' }}>
                                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '3px' }}>
                                                                                    <span>Avance de Entregas</span>
                                                                                    <span style={{ color: '#0284C7' }}>{doneStops}/{totalStops} paradas ({routeProgress}%)</span>
                                                                                </div>
                                                                                <div style={{ height: '5px', backgroundColor: '#E2E8F0', borderRadius: '3px', overflow: 'hidden' }}>
                                                                                    <div style={{ width: `${routeProgress}%`, height: '100%', background: 'linear-gradient(90deg, #0284C7 0%, #38BDF8 100%)', borderRadius: '3px' }}></div>
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* Next Active Stop (If In Route) */}
                                                                    {isInRoute && nextStop && (
                                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.7rem', color: THEME.colors.textMain, backgroundColor: '#F0F9FF', padding: '0.45rem 0.6rem', borderRadius: '6px', marginBottom: '0.65rem', border: '1px solid #BAE6FD' }}>
                                                                            <Navigation size={12} color="#0284C7" style={{ marginTop: '2px', flexShrink: 0 }} />
                                                                            <div style={{ minWidth: 0 }}>
                                                                                <div style={{ fontWeight: '800', color: '#0369A1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                    Próx: {nextClient}
                                                                                </div>
                                                                                {nextAddress && (
                                                                                    <div style={{ fontSize: '0.62rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                        {nextAddress}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Quick Operational Actions Bar */}
                                                                    <div style={{ display: 'flex', gap: '6px', marginTop: '0.2rem' }}>
                                                                        {waUrl ? (
                                                                            <a 
                                                                                href={waUrl} 
                                                                                target="_blank" 
                                                                                rel="noreferrer"
                                                                                style={{ 
                                                                                    flex: 1, 
                                                                                    padding: '0.4rem', 
                                                                                    borderRadius: '6px', 
                                                                                    backgroundColor: '#0D7A57', 
                                                                                    color: 'white', 
                                                                                    fontSize: '0.7rem', 
                                                                                    fontWeight: '800', 
                                                                                    textDecoration: 'none', 
                                                                                    display: 'flex', 
                                                                                    alignItems: 'center', 
                                                                                    justifyContent: 'center', 
                                                                                    gap: '4px',
                                                                                    boxShadow: '0 2px 4px rgba(13, 122, 87, 0.25)'
                                                                                }}
                                                                            >
                                                                                <MessageCircle size={12} /> WhatsApp
                                                                            </a>
                                                                        ) : (
                                                                            <button 
                                                                                onClick={() => setActiveTab('drivers_panel')}
                                                                                style={{ 
                                                                                    flex: 1, 
                                                                                    padding: '0.4rem', 
                                                                                    borderRadius: '6px', 
                                                                                    backgroundColor: THEME.colors.background, 
                                                                                    color: THEME.colors.textSecondary, 
                                                                                    border: `1px solid ${THEME.colors.border}`, 
                                                                                    fontSize: '0.68rem', 
                                                                                    fontWeight: '800', 
                                                                                    cursor: 'pointer' 
                                                                                }}
                                                                            >
                                                                                Asignar Conductor
                                                                            </button>
                                                                        )}

                                                                        {activeRoute && (
                                                                            <button 
                                                                                onClick={() => {
                                                                                    setSelectedVehicleId(null);
                                                                                }}
                                                                                style={{ 
                                                                                    padding: '0.4rem 0.6rem', 
                                                                                    borderRadius: '6px', 
                                                                                    backgroundColor: 'white', 
                                                                                    color: THEME.colors.textMain, 
                                                                                    border: `1px solid ${THEME.colors.borderActive}`, 
                                                                                    fontSize: '0.7rem', 
                                                                                    fontWeight: '800', 
                                                                                    cursor: 'pointer' 
                                                                                }}
                                                                            >
                                                                                Cerrar
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </AdvancedMarker>
                                                );
                                            })}
                                        </Map>

                                        {/* Floating Map Legend HUD */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '16px',
                                            left: '16px',
                                            backgroundColor: 'rgba(255, 255, 255, 0.94)',
                                            backdropFilter: 'blur(8px)',
                                            padding: '8px 14px',
                                            borderRadius: THEME.radius.md,
                                            border: `1px solid ${THEME.colors.border}`,
                                            boxShadow: THEME.shadow.md,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            fontSize: '0.68rem',
                                            fontWeight: '700',
                                            color: THEME.colors.textMain
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: THEME.colors.primary }}></div>
                                                <span>Bodega Central</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#0D7A57' }}></div>
                                                <span>Flota en Patio ({vehiclesAvailable})</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#2563EB' }}></div>
                                                <span>En Ruta ({vehiclesOnRoute})</span>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', backgroundColor: '#F8FAFC' }}>
                                        <div style={{ color: THEME.colors.textSecondary, display: 'flex', justifyContent: 'center', marginBottom: '0.5rem' }}>
                                            <MapPin size={48} strokeWidth={1.5} />
                                        </div>
                                        <div style={{ fontWeight: '800', color: THEME.colors.textSecondary }}>Google Maps no configurado</div>
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
                        /* ── CRATES CONTROL TOWER TAB ── */
                        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, padding: '1.25rem', overflowY: 'auto', maxHeight: 'calc(100vh - 180px)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Package size={20} color={THEME.colors.primary} /> Torre de Control de Canastillas &bull; FruFresco
                                    </h2>
                                    <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                        Inventario maestro en calle, stock en patio y trazabilidad Kardex en tiempo real.
                                    </p>
                                </div>

                                <button
                                    onClick={() => {
                                        setPatioModalQty(patioStock);
                                        setPatioModalReason('');
                                        setIsPatioModalOpen(true);
                                    }}
                                    style={{ 
                                        padding: '0.55rem 1.1rem', borderRadius: '8px', backgroundColor: THEME.colors.primary, color: 'white', 
                                        fontWeight: '800', fontSize: '0.78rem', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', 
                                        gap: '6px', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)', transition: 'background-color 0.15s' 
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                >
                                    <Sliders size={14} strokeWidth={2} /> Ajustar Inventario Patio / Kardex
                                </button>
                            </div>

                            {/* Dynamic Global KPI Cards & 100% Proportional Segmented Bar */}
                            {(() => {
                                const activeCrateProfiles = crateProfiles.filter(p => p.needs_crates || (p.crate_balance || 0) > 0);
                                const totalInCalle = activeCrateProfiles.reduce((acc, p) => acc + Number(p.crate_balance || 0), 0);
                                const alertCount = activeCrateProfiles.filter(p => Number(p.crate_balance || 0) > 40).length;
                                const totalSystemCrates = totalInCalle + patioStock;
                                const callePct = totalSystemCrates > 0 ? ((totalInCalle / totalSystemCrates) * 100).toFixed(1) : '0';
                                const patioPct = totalSystemCrates > 0 ? ((patioStock / totalSystemCrates) * 100).toFixed(1) : '0';

                                return (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
                                            <div style={{ backgroundColor: '#F4F9F6', padding: '1rem', borderRadius: THEME.radius.lg, border: '1px solid #E0EFE7' }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.primary, textTransform: 'uppercase' }}>CANASTILLAS EN CALLE</div>
                                                <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#065F46', marginTop: '2px' }}>{totalInCalle} <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>und ({callePct}%)</span></div>
                                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '600' }}>Prestadas a clientes activos</div>
                                            </div>

                                            <div style={{ backgroundColor: '#F0F9FF', padding: '1rem', borderRadius: THEME.radius.lg, border: '1px solid #BAE6FD' }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: '800', color: '#0284C7', textTransform: 'uppercase' }}>EN TRÁNSITO HOY</div>
                                                <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0369A1', marginTop: '2px' }}>0 <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>und</span></div>
                                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '600' }}>A bordo de rutas despachadas</div>
                                            </div>

                                            <div style={{ backgroundColor: '#F9FAFB', padding: '1rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}` }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase' }}>DISPONIBLES EN PATIO</div>
                                                <div style={{ fontSize: '1.75rem', fontWeight: '900', color: THEME.colors.textMain, marginTop: '2px' }}>{patioStock} <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>und ({patioPct}%)</span></div>
                                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '2px', fontWeight: '600' }}>Físicas en Bodega Central</div>
                                            </div>

                                            <div style={{ backgroundColor: alertCount > 0 ? '#FEF2F2' : '#F9FAFB', padding: '1rem', borderRadius: THEME.radius.lg, border: alertCount > 0 ? '1px solid #FCA5A5' : `1px solid ${THEME.colors.border}` }}>
                                                <div style={{ fontSize: '0.68rem', fontWeight: '800', color: alertCount > 0 ? '#DC2626' : THEME.colors.textSecondary, textTransform: 'uppercase' }}>SUCURSALES EN ALERTA</div>
                                                <div style={{ fontSize: '1.75rem', fontWeight: '900', color: alertCount > 0 ? '#991B1B' : THEME.colors.textMain, marginTop: '2px' }}>{alertCount} <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>cuentas</span></div>
                                                <div style={{ fontSize: '0.68rem', color: alertCount > 0 ? '#DC2626' : THEME.colors.textSecondary, marginTop: '2px', fontWeight: '600' }}>Retención &gt; 40 canastillas</div>
                                            </div>
                                        </div>

                                        {/* Visual 100% Distribution Bar */}
                                        <div style={{ backgroundColor: THEME.colors.background, padding: '0.75rem 1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, marginBottom: '1.25rem' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '6px' }}>
                                                <span>DISTRIBUCIÓN DEL INVENTARIO TOTAL ({totalSystemCrates} CANASTILLAS)</span>
                                                <span style={{ color: THEME.colors.primary }}>{callePct}% en Clientes &bull; {patioPct}% en Patio</span>
                                            </div>
                                            <div style={{ height: '8px', backgroundColor: '#E5E7EB', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                                                <div style={{ width: `${callePct}%`, backgroundColor: THEME.colors.primary, transition: 'width 0.5s' }} title={`En Calle: ${totalInCalle} und`}></div>
                                                <div style={{ width: `${patioPct}%`, backgroundColor: '#64748B', transition: 'width 0.5s' }} title={`En Patio: ${patioStock} und`}></div>
                                            </div>
                                        </div>

                                        {/* Main Matrix Breakdown Table */}
                                        <div style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.lg, overflow: 'hidden' }}>
                                            <div style={{ padding: '0.75rem 1.1rem', backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}`, fontSize: '0.78rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <Package size={15} color={THEME.colors.primary} /> Consolidado de Canastillas por Casa Matriz y Sucursales
                                            </div>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                <thead>
                                                    <tr style={{ backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.68rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                        <th style={{ padding: '0.65rem 1rem' }}>Cliente / Sucursal</th>
                                                        <th style={{ padding: '0.65rem 1rem' }}>NIT / Documento</th>
                                                        <th style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>Préstamo Autorizado</th>
                                                        <th style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>Canastillas Retenidas</th>
                                                        <th style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>Estado</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activeCrateProfiles.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                                                No hay clientes con saldo de canastillas registradas
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        activeCrateProfiles.map((p) => {
                                                            const isHighAlert = (p.crate_balance || 0) > 40;
                                                            return (
                                                                <tr key={p.id} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                                    <td style={{ padding: '0.65rem 1rem', fontWeight: p.is_corporate_parent ? '900' : '700', color: THEME.colors.textMain }}>
                                                                        {p.is_corporate_parent ? (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                                <Building2 size={14} style={{ color: THEME.colors.primary }} /> {p.company_name || p.contact_name} (MATRIZ)
                                                                            </span>
                                                                        ) : (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', paddingLeft: '1.2rem' }}>
                                                                                <CornerDownRight size={13} style={{ color: THEME.colors.textSecondary }} /> {p.company_name || p.contact_name}
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td style={{ padding: '0.65rem 1rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>{p.identification || 'N/A'}</td>
                                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                                                        <span style={{ color: p.needs_crates ? THEME.colors.primary : '#D97706', fontWeight: '800' }}>
                                                                            {p.needs_crates ? (p.is_corporate_parent ? 'SI (Matriz)' : 'Heredado') : 'No Autorizado'}
                                                                        </span>
                                                                    </td>
                                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '900', color: isHighAlert ? '#DC2626' : THEME.colors.textMain, fontSize: '0.88rem' }}>
                                                                        {p.crate_balance || 0} und
                                                                    </td>
                                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                                                        <span style={{ 
                                                                            backgroundColor: isHighAlert ? '#FEF2F2' : '#ECFDF5', 
                                                                            color: isHighAlert ? '#991B1B' : '#065F46', 
                                                                            border: isHighAlert ? '1px solid #FECACA' : '1px solid #A7F3D0',
                                                                            padding: '3px 7px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' 
                                                                        }}>
                                                                            {isHighAlert ? <><AlertTriangle size={11} /> Retención Alta</> : <><CheckCircle2 size={11} /> Normal</>}
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

            {/* MODAL: AJUSTE DE INVENTARIO EN PATIO / CARGA INICIAL (PALETA FRUFRESCO) */}
            {isPatioModalOpen && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(26, 35, 30, 0.65)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, maxWidth: '500px', width: '100%', padding: '1.5rem', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.1rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Sliders size={18} style={{ color: THEME.colors.primary }} /> Ajuste de Inventario de Patio / Kardex
                            </h3>
                            <button onClick={() => setIsPatioModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, padding: '4px' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Tipo de Movimiento Kardex
                                </label>
                                <select 
                                    value={patioModalType}
                                    onChange={(e) => setPatioModalType(e.target.value as any)}
                                    style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', fontWeight: '700', fontSize: '0.82rem', color: THEME.colors.textMain, backgroundColor: 'white' }}
                                >
                                    <option value="initial">Auditoría / Conteo Físico en Patio</option>
                                    <option value="purchase">Compra de Canastillas Nuevas (+)</option>
                                    <option value="damage">Baja por Daño / Pérdida en Planta (-)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {patioModalType === 'initial' ? 'Inventario Total en Patio (unidades)' : 'Cantidad de Canastillas'}
                                </label>
                                <input 
                                    type="number"
                                    value={patioModalQty}
                                    onChange={(e) => setPatioModalQty(parseInt(e.target.value) || 0)}
                                    style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', fontWeight: '900', fontSize: '1.1rem', color: THEME.colors.textMain, backgroundColor: 'white', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Motivo del Ajuste (Trazabilidad Obligatoria)
                                </label>
                                <textarea 
                                    placeholder="Ej: Conteo físico semanal en patio realizado por Jefe de Bodega..."
                                    value={patioModalReason}
                                    onChange={(e) => setPatioModalReason(e.target.value)}
                                    style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, outline: 'none', minHeight: '75px', fontSize: '0.82rem', fontFamily: 'inherit', color: THEME.colors.textMain, backgroundColor: 'white', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.3rem', paddingTop: '0.85rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                                <button
                                    onClick={() => setIsPatioModalOpen(false)}
                                    style={{ padding: '0.55rem 1.1rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: THEME.colors.textSecondary, fontWeight: '800', fontSize: '0.8rem', cursor: 'pointer' }}
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

                                            await supabase
                                                .from('app_settings')
                                                .upsert({ key: 'warehouse_crate_stock', value: String(newStock) }, { onConflict: 'key' });

                                            await supabase
                                                .from('crates_ledger')
                                                .insert([{
                                                    movement_type: patioModalType === 'initial' ? 'initial_count' : patioModalType === 'purchase' ? 'new_purchase' : 'damage_writeoff',
                                                    quantity: patioModalQty,
                                                    notes: patioModalReason
                                                }]);

                                            setPatioStock(newStock);
                                            setIsPatioModalOpen(false);
                                            alert('Inventario de patio actualizado correctamente a ' + newStock + ' und.');
                                        } catch (e: any) {
                                            console.error('Error guardando ajuste:', e);
                                            setPatioStock(patioModalQty);
                                            setIsPatioModalOpen(false);
                                        }
                                    }}
                                    style={{ padding: '0.55rem 1.25rem', borderRadius: THEME.radius.md, border: 'none', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '900', fontSize: '0.82rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)' }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                >
                                    <Save size={15} strokeWidth={2} /> Guardar Ajuste Kardex
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
            padding: '0.75rem 0.9rem',
            borderRadius: THEME.radius.lg,
            border: `1px solid ${THEME.colors.border}`,
            boxShadow: THEME.shadow.sm,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        }} onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.md;
            e.currentTarget.style.borderColor = `${color}40`;
        }} onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
            e.currentTarget.style.borderColor = THEME.colors.border;
        }}>
            <div style={{ backgroundColor: `${color}14`, width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: color, flexShrink: 0 }}>
                {icon}
            </div>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: THEME.colors.textMain, lineHeight: 1.1, margin: '1px 0' }}>{value}</div>
                <div style={{ fontSize: '0.62rem', color: THEME.colors.textSecondary, fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
            </div>
        </div>
    );
}
