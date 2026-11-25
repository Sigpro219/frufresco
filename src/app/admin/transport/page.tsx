'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { GOOGLE_MAPS_MAP_ID } from '@/lib/constants';
import { 
    Truck, 
    CheckCircle2, 
    Scale, 
    AlertTriangle, 
    Globe, 
    Compass, 
    Grid,
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
    Clock,
    Radio,
    Smartphone,
    QrCode,
    Copy,
    LocateFixed,
    PanelLeftClose,
    PanelLeftOpen,
    History
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

function SubtabSkeleton({ title }: { title: string }) {
    return (
        <div style={{
            padding: '3rem 2rem',
            maxWidth: '1600px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            minHeight: '420px',
            backgroundColor: THEME.colors.surface,
            borderRadius: THEME.radius.xl,
            border: `1px solid ${THEME.colors.border}`,
            boxShadow: THEME.shadow.sm
        }}>
            <Loader2 className="animate-spin" size={36} color={THEME.colors.primary} />
            <span style={{ fontSize: '0.88rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>
                Cargando consola de {title}...
            </span>
        </div>
    );
}

const RoutePlanner = dynamic(() => import('@/components/RoutePlanner'), {
    loading: () => <SubtabSkeleton title="Planeador de Rutas" />,
    ssr: false
});

const StagingSpacesManagement = dynamic(() => import('@/components/StagingSpacesManagement'), {
    loading: () => <SubtabSkeleton title="Espacios / Bahías 1-150" />,
    ssr: false
});

const FleetManagement = dynamic(() => import('@/components/FleetManagement'), {
    loading: () => <SubtabSkeleton title="Gestión de Flota" />,
    ssr: false
});

const ConductorPanel = dynamic(() => import('@/components/ConductorPanel'), {
    loading: () => <SubtabSkeleton title="Panel de Conductores" />,
    ssr: false
});

const MaintenanceManagement = dynamic(() => import('@/components/MaintenanceManagement'), {
    loading: () => <SubtabSkeleton title="Mantenimiento de Flota" />,
    ssr: false
});

const ControlTowerKPIs = dynamic(() => import('@/components/ControlTowerKPIs'), {
    loading: () => <SubtabSkeleton title="Insights & KPIs" />,
    ssr: false
});

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
            crates_count?: number | null;
        };
    }[];
    total_crates?: number;
    driver?: {
        contact_name: string;
        phone?: string;
    };
}

const BODEGA_COORDS = { lat: 4.633653, lng: -74.160647 };

function LiveFleetMapControls({
    showTraffic,
    fitTrigger,
    points,
    focusPoint,
}: {
    showTraffic: boolean;
    fitTrigger: number;
    points: Array<{ lat: number; lng: number }>;
    focusPoint?: { lat: number; lng: number; seq: number } | null;
}) {
    const map = useMap();

    useEffect(() => {
        if (!map || !showTraffic || typeof window === 'undefined' || !(window as any).google?.maps) return;
        const layer = new (window as any).google.maps.TrafficLayer();
        layer.setMap(map);
        return () => {
            layer.setMap(null);
        };
    }, [map, showTraffic]);

    useEffect(() => {
        if (!map || fitTrigger === 0 || typeof window === 'undefined' || !(window as any).google?.maps) return;
        if (points.length === 0) {
            map.panTo(BODEGA_COORDS);
            map.setZoom(13);
            return;
        }
        const bounds = new (window as any).google.maps.LatLngBounds();
        bounds.extend(BODEGA_COORDS);
        points.forEach(p => bounds.extend(p));
        map.fitBounds(bounds, 60);
    }, [map, fitTrigger, points]);

    useEffect(() => {
        if (!map || !focusPoint) return;
        map.panTo({ lat: focusPoint.lat, lng: focusPoint.lng });
        map.setZoom(15);
    }, [map, focusPoint]);

    return null;
}

type TransportTab = 'map' | 'planner' | 'staging' | 'fleet' | 'maintenance' | 'drivers_panel' | 'kpis' | 'crates';
const VALID_TABS: TransportTab[] = ['map', 'planner', 'staging', 'fleet', 'maintenance', 'drivers_panel', 'kpis', 'crates'];

export default function TransportControlTower() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<TransportTab>('map');

    useEffect(() => {
        const syncParams = () => {
            if (typeof window !== 'undefined') {
                const params = new URLSearchParams(window.location.search);
                const tab = params.get('tab') as TransportTab;
                if (tab && VALID_TABS.includes(tab)) {
                    setActiveTab(tab);
                } else if (params.get('date')) {
                    setActiveTab('planner');
                }
            }
        };

        syncParams();
        window.addEventListener('popstate', syncParams);
        return () => window.removeEventListener('popstate', syncParams);
    }, []);

    const handleSelectTab = (tab: TransportTab) => {
        setActiveTab(tab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            if (tab === 'map') {
                url.searchParams.delete('tab');
            } else {
                url.searchParams.set('tab', tab);
            }
            window.history.replaceState({}, '', url.toString());
        }
    };
    const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
    const [crateProfiles, setCrateProfiles] = useState<any[]>([]);
    const [patioStock, setPatioStock] = useState<number>(0);
    const [isPatioModalOpen, setIsPatioModalOpen] = useState(false);
    const [patioModalType, setPatioModalType] = useState<'initial' | 'purchase' | 'damage'>('initial');
    const [patioModalQty, setPatioModalQty] = useState<number>(0);
    const [patioModalReason, setPatioModalReason] = useState<string>('');
    const [selectedClientForKardex, setSelectedClientForKardex] = useState<any | null>(null);
    const [clientKardexMovements, setClientKardexMovements] = useState<any[]>([]);
    const [isLoadingClientKardex, setIsLoadingClientKardex] = useState(false);
    const [qrBeaconModal, setQrBeaconModal] = useState<{ plate: string; url: string; expiresAt: string; driverName?: string; driverPhone?: string } | null>(null);
    const [qrLoadingRouteId, setQrLoadingRouteId] = useState<string | null>(null);
    const [qrCopied, setQrCopied] = useState(false);
    const [showTrafficLayer, setShowTrafficLayer] = useState<boolean>(false);
    const [fitTrigger, setFitTrigger] = useState<number>(0);
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
    const [sidebarMode, setSidebarMode] = useState<'routes' | 'fleet'>('routes');
    const [showHistoryRoutes, setShowHistoryRoutes] = useState<boolean>(false);
    const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number; seq: number } | null>(null);

    const handleOpenQrBeacon = async (route: ActiveRoute) => {
        setQrLoadingRouteId(route.id);
        setQrCopied(false);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (session?.access_token) headers['Authorization'] = `Bearer ${session.access_token}`;
            const res = await fetch('/api/transport/beacon/token', {
                method: 'POST',
                headers,
                body: JSON.stringify({ route_id: route.id })
            });
            const data = await res.json().catch(() => null);
            if (!res.ok || !data?.track_path) {
                throw new Error(data?.error || 'No se pudo generar la baliza QR');
            }
            const fullUrl = `${window.location.origin}${data.track_path}`;
            setQrBeaconModal({
                plate: data.plate,
                url: fullUrl,
                expiresAt: data.expires_at,
                driverName: route.driver?.contact_name,
                driverPhone: route.driver?.phone
            });
        } catch (err: any) {
            (window as any).showToast?.(err?.message || 'Error generando QR', 'error');
        } finally {
            setQrLoadingRouteId(null);
        }
    };

    const handleOpenClientKardex = async (client: any) => {
        setSelectedClientForKardex(client);
        setIsLoadingClientKardex(true);
        try {
            let profileIds = [client.id];
            if (client.is_corporate_parent) {
                const { data: branches } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('parent_id', client.id);
                if (branches && branches.length > 0) {
                    profileIds = [...profileIds, ...branches.map((b: any) => b.id)];
                }
            }
            const { data, error } = await supabase
                .from('asset_movements')
                .select(`
                    id, route_id, order_id, profile_id, type, movement_type,
                    quantity, delivered_qty, received_qty, balance_after,
                    notes, evidence_url, created_at,
                    orders:order_id (id, sequence_id)
                `)
                .in('profile_id', profileIds)
                .order('created_at', { ascending: false });
            if (!error && data) {
                setClientKardexMovements(data);
            }
        } catch (e) {
            console.error('Error fetching client kardex in transport:', e);
        } finally {
            setIsLoadingClientKardex(false);
        }
    };
    const [loading, setLoading] = useState(true);
    const isMounted = useRef(true);
    const hasInitialLoaded = useRef(false);

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
    const [isSyncingGps, setIsSyncingGps] = useState(false);
    const [gpsSyncMessage, setGpsSyncMessage] = useState<string | null>(null);

    const handleSyncGps = async () => {
        try {
            setIsSyncingGps(true);
            setGpsSyncMessage('Sincronizando...');
            const res = await fetch('/api/transport/sync-gps');
            const data = await res.json();
            if (data.success) {
                setGpsSyncMessage(`${data.synced_count || 0} vehículos sincronizados`);
                await fetchTransportData(undefined, true);
            } else {
                setGpsSyncMessage(data.message || 'Error GPS');
            }
        } catch {
            setGpsSyncMessage('Error de red al sincronizar');
        } finally {
            setIsSyncingGps(false);
            setTimeout(() => setGpsSyncMessage(null), 4000);
        }
    };

    const fetchTransportData = useCallback(async (signal?: AbortSignal, isSilent = false) => {
        try {
            if (!isSilent && !hasInitialLoaded.current) {
                setLoading(true);
            }

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
                    .select('*, order:orders(latitude, longitude, shipping_address, crates_count, profiles(company_name, contact_name))')
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
                    driver: driver ? { contact_name: driver.contact_name, phone: driver.phone } : undefined
                };
            }) || [];

            setActiveRoutes(formatted);

            const active = formatted.filter(r => r.status === 'in_transit' || r.status === 'loading' || r.status === 'rectified').length;
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
            hasInitialLoaded.current = true;
            if (isMounted.current) setLoading(false);
        }
    }, []);

    // Carga inicial al montar la página + primera sincronización satelital en caliente
    useEffect(() => {
        isMounted.current = true;
        const controller = new AbortController();
        
        // 1. Carga inmediata de estado local
        fetchTransportData(controller.signal);

        // 2. Sincronización satelital en caliente desde Apps-360 al segundo 1
        fetch('/api/transport/sync-gps')
            .then(res => res.json())
            .then(data => {
                if (data.success && isMounted.current) {
                    fetchTransportData(undefined, true);
                }
            })
            .catch(() => {});

        return () => { 
            isMounted.current = false;
            controller.abort();
        };
    }, [fetchTransportData]);

    // Polling telemático satelital en segundo plano (cada 25s, 100% silencioso sin pantalla blanca)
    useEffect(() => {
        if (activeTab !== 'map') return;
        const interval = setInterval(async () => {
            if (!isMounted.current) return;
            try {
                const res = await fetch('/api/transport/sync-gps');
                const data = await res.json();
                if (data.success && isMounted.current) {
                    await fetchTransportData(undefined, true);
                }
            } catch (_) {}
        }, 25000);

        return () => clearInterval(interval);
    }, [activeTab, fetchTransportData]);

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

    const hasRealGps = (v: any): boolean => {
        if (v?.last_latitude == null || v?.last_longitude == null || !v?.last_gps_sync) return false;
        const lat = Number(v.last_latitude);
        const lng = Number(v.last_longitude);
        const syncMs = new Date(v.last_gps_sync).getTime();
        return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !Number.isNaN(syncMs);
    };
    const isGpsFresh = (v: any): boolean =>
        hasRealGps(v) && (Date.now() - new Date(v.last_gps_sync).getTime() <= 15 * 60 * 1000);

    const activeFleet = fleetData.filter(v => v.status !== 'inactive');
    const vehiclesWithRealGps = activeFleet.filter(hasRealGps);
    const vehiclesMovingGps = vehiclesWithRealGps.filter(v => isGpsFresh(v) && (v.speed || 0) > 0);
    const vehiclesStoppedGps = vehiclesWithRealGps.filter(v => !isGpsFresh(v) || (v.speed || 0) === 0);
    const vehiclesWithoutGps = activeFleet.filter(v => !hasRealGps(v));

    const totalVehicles = activeFleet.length;
    const vehiclesOnRoute = vehiclesMovingGps.length;
    const vehiclesMaintenance = activeFleet.filter(v => v.status === 'maintenance').length;
    const vehiclesAvailable = Math.max(0, totalVehicles - vehiclesOnRoute - vehiclesMaintenance);
    const liveRoutes = activeRoutes.filter(r => ['planning', 'planned', 'loading', 'rectified', 'in_transit', 'assigned'].includes(r.status));
    const completedHistoryRoutes = activeRoutes.filter(r => !['planning', 'planned', 'loading', 'rectified', 'in_transit', 'assigned'].includes(r.status));
    const displayedRoutes = showHistoryRoutes ? activeRoutes : liveRoutes;
    const sortedFleetForSidebar = [...activeFleet].sort((a, b) => {
        const aMov = isGpsFresh(a) && (a.speed || 0) > 0 ? 2 : hasRealGps(a) ? 1 : 0;
        const bMov = isGpsFresh(b) && (b.speed || 0) > 0 ? 2 : hasRealGps(b) ? 1 : 0;
        if (bMov !== aMov) return bMov - aMov;
        return String(a.plate).localeCompare(String(b.plate));
    });

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, color: THEME.colors.textMain, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0 1.25rem 1.5rem' }}>
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
                
                {/* ── LÍNEA 1: STICKY TABS BAR (85px + 48px = 133px exactos, sólido anti-bleed) ── */}
                <div style={{ 
                    position: 'sticky',
                    top: '85px',
                    height: '48px',
                    boxSizing: 'border-box',
                    zIndex: 45,
                    backgroundColor: '#FFFFFF', 
                    padding: '0 0.65rem', 
                    borderRadius: '0 0 12px 12px', 
                    boxShadow: '0 4px 12px -4px rgba(15, 23, 42, 0.08)', 
                    borderLeft: `1px solid ${THEME.colors.border}`,
                    borderRight: `1px solid ${THEME.colors.border}`,
                    borderBottom: `1px solid ${THEME.colors.border}`,
                    display: 'flex',
                    flexWrap: 'nowrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.65rem',
                    gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', gap: '0.2rem', overflowX: 'auto', scrollbarWidth: 'none', flex: '1 1 auto', minWidth: 0 }}>
                        {[
                            { id: 'map', label: 'Monitor Global', icon: <Globe size={14} strokeWidth={2} /> },
                            { id: 'planner', label: 'Planeación', icon: <Compass size={14} strokeWidth={2} /> },
                            { id: 'staging', label: 'Espacios / Bahías', icon: <Grid size={14} strokeWidth={2} /> },
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
                                    onClick={() => handleSelectTab(tab.id as TransportTab)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '0.38rem 0.68rem', borderRadius: '8px', border: 'none',
                                        backgroundColor: isActive ? THEME.colors.primary : 'transparent',
                                        color: isActive ? '#FFFFFF' : THEME.colors.textSecondary,
                                        fontSize: '0.74rem', fontWeight: '800', cursor: 'pointer', transition: 'all 0.16s ease',
                                        boxShadow: isActive ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none',
                                        whiteSpace: 'nowrap',
                                        flexShrink: 0
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'nowrap' }}>
                        {activeTab === 'map' && (
                            <>
                                {/* Compact Live Telemetry Pills (Monitor Global only) */}
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '0.25rem 0.5rem', borderRadius: '8px', backgroundColor: '#F8FAFC', border: `1px solid ${THEME.colors.border}`, fontSize: '0.7rem', fontWeight: '800', fontVariantNumeric: 'tabular-nums', color: THEME.colors.textMain, whiteSpace: 'nowrap' }}>
                                    <Truck size={12} color={THEME.colors.primary} />
                                    <span>{formatNumber(stats.totalActive)} activas</span>
                                </div>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '0.25rem 0.5rem', borderRadius: '8px', backgroundColor: '#F8FAFC', border: `1px solid ${THEME.colors.border}`, fontSize: '0.7rem', fontWeight: '800', fontVariantNumeric: 'tabular-nums', color: THEME.colors.textMain, whiteSpace: 'nowrap' }}>
                                    <Scale size={12} color="#D97706" />
                                    <span>{formatNumber(stats.totalKilos)} kg</span>
                                </div>
                                {stats.totalNovedades > 0 && (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '0.25rem 0.5rem', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', fontSize: '0.7rem', fontWeight: '800', fontVariantNumeric: 'tabular-nums', color: '#B91C1C', whiteSpace: 'nowrap' }}>
                                        <AlertTriangle size={12} />
                                        <span>{formatNumber(stats.totalNovedades)}</span>
                                    </div>
                                )}
                                {gpsSyncMessage && (
                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '0.22rem 0.5rem', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                                        {gpsSyncMessage}
                                    </span>
                                )}

                                <button 
                                    onClick={handleSyncGps}
                                    disabled={isSyncingGps || loading}
                                    title="Sincronizar telemetría con apps-360.online"
                                    style={{ 
                                        padding: '0.36rem 0.72rem', borderRadius: '8px', border: `1px solid ${THEME.colors.primary}`, backgroundColor: isSyncingGps ? THEME.colors.primaryLight : '#0D7A57',
                                        color: isSyncingGps ? THEME.colors.primary : 'white', fontWeight: '800', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                        transition: 'all 0.15s', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.22)', whiteSpace: 'nowrap'
                                    }}
                                >
                                    {isSyncingGps ? (
                                        <><Loader2 size={12} className="animate-spin" /> Sync...</>
                                    ) : (
                                        <><Navigation size={12} strokeWidth={2.5} /> Sync GPS</>
                                    )}
                                </button>
                            </>
                        )}

                        <button 
                            onClick={() => fetchTransportData()}
                            disabled={loading}
                            title="Actualizar datos"
                            style={{ 
                                padding: '0.36rem 0.62rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white',
                                color: THEME.colors.textMain, fontWeight: '800', fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                transition: 'all 0.15s', whiteSpace: 'nowrap'
                            }}
                        >
                            <RefreshCw size={12} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
                            <span>Actualizar</span>
                        </button>
                    </div>
                </div>

                {/* ── MAIN CONTENT AREA ── */}
                <div style={{ position: 'relative', minHeight: 'calc(100vh - 220px)' }}>
                    {activeTab === 'map' ? (
                        <div
                            className={`transport-monitor-grid ${sidebarOpen ? 'with-sidebar' : 'map-only'}`}
                            style={{
                                display: 'grid',
                                gap: '0.85rem',
                            }}
                        >
                            <style jsx>{`
                                .transport-monitor-grid {
                                    grid-template-columns: minmax(0, 1fr);
                                }
                                @media (min-width: 960px) {
                                    .transport-monitor-grid.with-sidebar {
                                        grid-template-columns: 325px minmax(0, 1fr);
                                        height: calc(100vh - 154px);
                                        min-height: 580px;
                                    }
                                    .transport-monitor-grid.map-only {
                                        grid-template-columns: minmax(0, 1fr);
                                        height: calc(100vh - 154px);
                                        min-height: 580px;
                                    }
                                }
                            `}</style>
                            {/* Collapsible Route & Live Fleet Sidebar */}
                            {sidebarOpen && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, padding: '0.85rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.7rem', minHeight: '320px' }}>
                                {/* Segmented Sidebar Header (Rutas | Flota) + Collapse */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', paddingBottom: '0.55rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '9px', flex: 1 }}>
                                        <button
                                            type="button"
                                            onClick={() => setSidebarMode('routes')}
                                            style={{
                                                flex: 1, padding: '5px 8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                                                fontSize: '0.72rem', fontWeight: '800',
                                                backgroundColor: sidebarMode === 'routes' ? '#FFFFFF' : 'transparent',
                                                color: sidebarMode === 'routes' ? THEME.colors.textMain : THEME.colors.textSecondary,
                                                boxShadow: sidebarMode === 'routes' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none'
                                            }}
                                        >
                                            Rutas ({liveRoutes.length})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSidebarMode('fleet')}
                                            style={{
                                                flex: 1, padding: '5px 8px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                                                fontSize: '0.72rem', fontWeight: '800',
                                                backgroundColor: sidebarMode === 'fleet' ? '#FFFFFF' : 'transparent',
                                                color: sidebarMode === 'fleet' ? THEME.colors.textMain : THEME.colors.textSecondary,
                                                boxShadow: sidebarMode === 'fleet' ? '0 1px 3px rgba(15,23,42,0.08)' : 'none'
                                            }}
                                        >
                                            Flota ({activeFleet.length})
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSidebarOpen(false)}
                                        title="Ocultar panel lateral para ampliar mapa"
                                        style={{ padding: '6px', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, backgroundColor: '#FFFFFF', color: THEME.colors.textSecondary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                                    >
                                        <PanelLeftClose size={14} />
                                    </button>
                                </div>

                                {sidebarMode === 'fleet' ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                                        {sortedFleetForSidebar.map((v: any) => {
                                            const real = hasRealGps(v);
                                            const fresh = isGpsFresh(v);
                                            const moving = fresh && (v.speed || 0) > 0;
                                            const drv = driversData.find((d: any) => d.id === v.driver_id);
                                            const isSel = selectedVehicleId === v.id;
                                            return (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => {
                                                        if (real) {
                                                            setSelectedVehicleId(v.id);
                                                            setFocusPoint({ lat: Number(v.last_latitude), lng: Number(v.last_longitude), seq: Date.now() });
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%', textAlign: 'left', padding: '0.6rem 0.7rem', borderRadius: '10px',
                                                        border: isSel ? `1.5px solid ${THEME.colors.primary}` : `1px solid ${THEME.colors.border}`,
                                                        backgroundColor: isSel ? '#ECFDF5' : real ? '#FFFFFF' : '#F8FAFC',
                                                        cursor: real ? 'pointer' : 'default',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                        <div style={{
                                                            width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0,
                                                            backgroundColor: moving ? '#FF6B00' : real ? (fresh ? '#0D7A57' : '#DC2626') : '#94A3B8',
                                                            boxShadow: moving ? '0 0 6px rgba(255,107,0,0.8)' : 'none'
                                                        }} />
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontWeight: '900', fontSize: '0.84rem', color: THEME.colors.textMain }}>{v.plate}</div>
                                                            <div style={{ fontSize: '0.66rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {drv?.contact_name || (v.vehicle_type || 'Furgón')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                        <div style={{ fontSize: '0.68rem', fontWeight: '800', color: moving ? '#EA580C' : real ? (fresh ? '#0D7A57' : '#B91C1C') : '#64748B' }}>
                                                            {moving ? `${Math.round(v.speed)} km/h` : real ? (fresh ? 'Detenido' : 'Vencido') : 'Sin GPS'}
                                                        </div>
                                                        {real && v.last_gps_sync && (
                                                            <div style={{ fontSize: '0.6rem', color: '#94A3B8' }}>
                                                                {new Date(v.last_gps_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </div>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                <>
                                {completedHistoryRoutes.length > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.68rem', color: THEME.colors.textSecondary }}>
                                        <span>{showHistoryRoutes ? 'Mostrando activas + historial' : 'Solo rutas activas de hoy'}</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowHistoryRoutes(prev => !prev)}
                                            style={{
                                                border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                                                color: THEME.colors.primary, fontWeight: '800', fontSize: '0.68rem',
                                                display: 'inline-flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <History size={12} />
                                            {showHistoryRoutes ? 'Ocultar historial' : `Historial (${completedHistoryRoutes.length})`}
                                        </button>
                                    </div>
                                )}
                                {/* Active Routes List or Rich Empty State */}
                                {displayedRoutes.length === 0 && !loading ? (
                                    <div style={{ textAlign: 'center', padding: '2rem 1rem', backgroundColor: '#F9FBFA', borderRadius: THEME.radius.lg, border: `1px dashed ${THEME.colors.borderActive}`, margin: 'auto 0' }}>
                                        <div style={{ color: THEME.colors.primary, marginBottom: '0.65rem', display: 'flex', justifyContent: 'center' }}>
                                            <Truck size={36} strokeWidth={1.5} />
                                        </div>
                                        <div style={{ fontSize: '0.86rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.25rem' }}>
                                            Sin rutas activas en curso
                                        </div>
                                        <p style={{ fontSize: '0.73rem', color: THEME.colors.textSecondary, margin: '0 0 1rem', lineHeight: 1.4 }}>
                                            {vehiclesAvailable > 0 
                                                ? `${vehiclesAvailable} vehículo(s) listos para asignar en Planeación.` 
                                                : 'Programa los despachos del día desde Planeación.'}
                                        </p>
                                        <button
                                            onClick={() => handleSelectTab('planner')}
                                            style={{
                                                backgroundColor: THEME.colors.primary, color: 'white', padding: '0.5rem 1rem',
                                                borderRadius: '8px', fontSize: '0.75rem', fontWeight: '800', border: 'none',
                                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            <Compass size={14} /> Ir a Planeador de Rutas
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                                        {displayedRoutes.map(route => {
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
                                                    {canEdit && ['planning', 'planned', 'loading', 'rectified', 'in_transit', 'assigned'].includes(route.status) && !fleetData.find((v: any) => v.plate === route.vehicle_plate)?.gps_imei && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenQrBeacon(route)}
                                                            disabled={qrLoadingRouteId === route.id}
                                                            style={{
                                                                marginTop: '8px',
                                                                width: '100%',
                                                                padding: '6px 10px',
                                                                borderRadius: '8px',
                                                                border: '1px solid #CBD5E1',
                                                                backgroundColor: '#F8FAFC',
                                                                color: '#0F172A',
                                                                fontSize: '0.72rem',
                                                                fontWeight: '800',
                                                                cursor: qrLoadingRouteId === route.id ? 'wait' : 'pointer',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                gap: '6px'
                                                            }}
                                                        >
                                                            <QrCode size={13} color={THEME.colors.primary} />
                                                            <span>{qrLoadingRouteId === route.id ? 'Generando QR...' : 'QR / WhatsApp GPS'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                </>
                                )}
                            </div>
                            )}

                            {/* Map Container with Floating HUD */}
                            <div style={{ borderRadius: THEME.radius.xl, overflow: 'hidden', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.md, position: 'relative', minHeight: '520px', height: '100%' }}>
                                {apiKey ? (
                                    <>
                                        <Map defaultCenter={BODEGA_COORDS} defaultZoom={13} mapId={GOOGLE_MAPS_MAP_ID} style={{ width: '100%', height: '100%' }}>
                                            <LiveFleetMapControls
                                                showTraffic={showTrafficLayer}
                                                fitTrigger={fitTrigger}
                                                points={vehiclesWithRealGps.map((v: any) => ({ lat: Number(v.last_latitude), lng: Number(v.last_longitude) }))}
                                                focusPoint={focusPoint}
                                            />
                                            {/* Bodega Central Marker */}
                                            <AdvancedMarker position={BODEGA_COORDS}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <div style={{ backgroundColor: THEME.colors.primary, color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.62rem', fontWeight: '900', marginBottom: '2px', boxShadow: '0 2px 6px rgba(13,122,87,0.35)' }}>
                                                        BODEGA CENTRAL
                                                    </div>
                                                    <Pin background={THEME.colors.primary} glyphColor={'white'} scale={1.2} />
                                                </div>
                                            </AdvancedMarker>

                                            {/* Fleet Vehicles on Live Map (Zero-Mock: solo vehículos activos con telemetría GPS real) */}
                                            {vehiclesWithRealGps.map((v: any) => {
                                                const driver = driversData.find((d: any) => d.id === v.driver_id);
                                                const initials = getInitials(driver?.contact_name || '');
                                                const activeRoute = activeRoutes.find((r: any) => r.vehicle_plate === v.plate || (v.driver_id && r.driver_id === v.driver_id));
                                                
                                                const pos = { lat: Number(v.last_latitude), lng: Number(v.last_longitude) };

                                                const fresh = isGpsFresh(v);
                                                const isMoving = fresh && (v.speed || 0) > 0;
                                                const isInRoute = isMoving || (activeRoute && (activeRoute.status === 'in_transit' || activeRoute.status === 'loading'));
                                                const isAvailable = !isMoving && (v.status === 'available' || (!activeRoute && v.status !== 'maintenance'));
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
                                                                background: isMoving
                                                                    ? 'linear-gradient(135deg, #FF6B00 0%, #EA580C 100%)' // Naranja Fuego en Movimiento
                                                                    : isInRoute 
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
                                                                boxShadow: isMoving
                                                                    ? '0 0 18px rgba(255, 107, 0, 0.9), 0 4px 10px rgba(0,0,0,0.22)'
                                                                    : isPopoverOpen 
                                                                        ? '0 8px 18px rgba(13, 122, 87, 0.4)' 
                                                                        : '0 4px 10px rgba(0,0,0,0.18)',
                                                                border: isMoving
                                                                    ? '2px solid #FED7AA'
                                                                    : isPopoverOpen ? '3px solid white' : '2px solid white',
                                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                transform: isPopoverOpen ? 'scale(1.1)' : 'scale(1)',
                                                                position: 'relative'
                                                            }}>
                                                                {isMoving && (
                                                                    <span 
                                                                        style={{
                                                                            position: 'absolute',
                                                                            top: -3,
                                                                            left: -3,
                                                                            right: -3,
                                                                            bottom: -3,
                                                                            borderRadius: '12px',
                                                                            border: '2px solid rgba(255, 107, 0, 0.8)',
                                                                            animation: 'pulse 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                                                                            pointerEvents: 'none'
                                                                        }}
                                                                    />
                                                                )}
                                                                {isMoving && v.heading != null ? (
                                                                    <Navigation size={14} style={{ transform: `rotate(${v.heading}deg)`, transition: 'transform 0.4s ease' }} />
                                                                ) : (
                                                                    initials || <Truck size={14} />
                                                                )}
                                                            </div>

                                                            {/* VEHICLE PLATE BADGE */}
                                                            <div style={{ 
                                                                backgroundColor: isMoving ? '#EA580C' : isPopoverOpen ? THEME.colors.primary : 'white', 
                                                                color: isMoving || isPopoverOpen ? 'white' : THEME.colors.textMain, 
                                                                padding: '1px 6px', 
                                                                borderRadius: '4px', 
                                                                fontSize: '0.55rem', 
                                                                fontWeight: '900', 
                                                                marginTop: '2px',
                                                                border: `1px solid ${isMoving ? '#C2410C' : isPopoverOpen ? THEME.colors.primary : THEME.colors.border}`,
                                                                boxShadow: isMoving ? '0 2px 8px rgba(234, 88, 12, 0.45)' : '0 2px 4px rgba(0,0,0,0.08)',
                                                                transition: 'all 0.15s ease',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '3px',
                                                                whiteSpace: 'nowrap'
                                                            }}>
                                                                <span>{v.plate}</span>
                                                                {isMoving && (
                                                                    <span style={{ 
                                                                        fontSize: '0.5rem', 
                                                                        backgroundColor: 'rgba(0,0,0,0.3)', 
                                                                        padding: '0 3px', 
                                                                        borderRadius: '3px',
                                                                        fontWeight: '900'
                                                                    }}>
                                                                        {Math.round(v.speed)} km/h
                                                                    </span>
                                                                )}
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
                                                                            backgroundColor: isMoving ? '#FFF7ED' : isInRoute ? '#EFF6FF' : isAvailable ? '#ECFDF5' : '#FEF3C7',
                                                                            color: isMoving ? '#EA580C' : isInRoute ? '#1D4ED8' : isAvailable ? '#065F46' : '#B45309',
                                                                            border: isMoving ? '1px solid #FDBA74' : isInRoute ? '1px solid #BFDBFE' : isAvailable ? '1px solid #A7F3D0' : '1px solid #FDE68A',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}>
                                                                            {isMoving ? (
                                                                                <>
                                                                                    <Navigation size={10} strokeWidth={2.5} style={{ color: '#EA580C' }} />
                                                                                    <span>EN MOVIMIENTO ({Math.round(v.speed)} km/h)</span>
                                                                                </>
                                                                            ) : isInRoute ? (
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

                                                                    {/* Telemetry & GPS Hardware Status Block */}
                                                                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '0.45rem 0.6rem', marginBottom: '0.6rem', border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.65rem' }}>
                                                                            <span style={{ fontWeight: '800', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                                {v.tracking_source === 'mobile_app' ? (
                                                                                    <>
                                                                                        <Smartphone size={11} color={THEME.colors.textSecondary} />
                                                                                        <span>Tracker Móvil (60s)</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Radio size={11} color={THEME.colors.textSecondary} />
                                                                                        <span>GPS Satelital (Apps-360)</span>
                                                                                    </>
                                                                                )}
                                                                            </span>
                                                                            <span style={{ fontWeight: '900', display: 'flex', alignItems: 'center', gap: '4px', color: !fresh ? '#B91C1C' : (v.speed || 0) > 0 ? '#EA580C' : (v.ignition_status ? '#D97706' : '#64748B') }}>
                                                                                {!fresh ? (
                                                                                    <>
                                                                                        <AlertTriangle size={11} style={{ color: '#B91C1C' }} />
                                                                                        <span>Señal vencida</span>
                                                                                    </>
                                                                                ) : (v.speed || 0) > 0 ? (
                                                                                    <>
                                                                                        <Navigation size={11} style={{ color: '#EA580C' }} />
                                                                                        <span>{Math.round(v.speed)} km/h</span>
                                                                                    </>
                                                                                ) : v.ignition_status ? (
                                                                                    <>
                                                                                        <Activity size={11} style={{ color: '#D97706' }} />
                                                                                        <span>Ralentí</span>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <Clock size={11} style={{ color: '#64748B' }} />
                                                                                        <span>Motor OFF</span>
                                                                                    </>
                                                                                )}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.62rem', color: THEME.colors.textSecondary }}>
                                                                            <span>{v.heading != null ? `Rumbo: ${v.heading}°` : 'Rumbo: --'}</span>
                                                                            <span>{v.last_gps_sync ? `Sync: ${new Date(v.last_gps_sync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Sin datos'}</span>
                                                                        </div>
                                                                        {/* Watchdog Signal Loss Warning (> 15 mins) */}
                                                                        {isInRoute && v.last_gps_sync && (Date.now() - new Date(v.last_gps_sync).getTime() > 15 * 60 * 1000) && (
                                                                            <div style={{ backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', color: '#B91C1C', borderRadius: '4px', padding: '3px 6px', fontSize: '0.62rem', fontWeight: '800', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                                <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                                                                <span>Sin reporte telemático reciente (&gt; 15 min)</span>
                                                                            </div>
                                                                        )}
                                                                    </div>

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
                                                                                onClick={() => handleSelectTab('drivers_panel')}
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

                                        {/* Top-Right Map Quick Controls (offset left of Google Maps native Fullscreen at right:10px) */}
                                        <div style={{
                                            position: 'absolute',
                                            top: '10px',
                                            right: '60px',
                                            display: 'flex',
                                            gap: '8px',
                                            zIndex: 10
                                        }}>
                                            {!sidebarOpen && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSidebarOpen(true)}
                                                    style={{
                                                        padding: '7px 11px',
                                                        borderRadius: THEME.radius.md,
                                                        border: `1px solid ${THEME.colors.border}`,
                                                        backgroundColor: 'rgba(255,255,255,0.95)',
                                                        color: THEME.colors.textMain,
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        boxShadow: THEME.shadow.sm,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px'
                                                    }}
                                                >
                                                    <PanelLeftOpen size={13} color={THEME.colors.primary} />
                                                    <span>Panel</span>
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setShowTrafficLayer(prev => !prev)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: THEME.radius.md,
                                                    border: showTrafficLayer ? `1.5px solid ${THEME.colors.primary}` : `1px solid ${THEME.colors.border}`,
                                                    backgroundColor: showTrafficLayer ? '#ECFDF5' : 'rgba(255,255,255,0.95)',
                                                    color: showTrafficLayer ? '#065F46' : THEME.colors.textMain,
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    boxShadow: THEME.shadow.sm,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <Activity size={13} />
                                                <span>{showTrafficLayer ? 'Tráfico: ON' : 'Tráfico'}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setFitTrigger(n => n + 1)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: THEME.radius.md,
                                                    border: `1px solid ${THEME.colors.border}`,
                                                    backgroundColor: 'rgba(255,255,255,0.95)',
                                                    color: THEME.colors.textMain,
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    boxShadow: THEME.shadow.sm,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <LocateFixed size={13} color={THEME.colors.primary} />
                                                <span>Centrar Flota</span>
                                            </button>
                                        </div>

                                        {/* Floating Map Legend HUD */}
                                        <div style={{
                                            position: 'absolute',
                                            bottom: '16px',
                                            left: '16px',
                                            maxWidth: 'calc(100% - 32px)',
                                            backgroundColor: 'rgba(255, 255, 255, 0.94)',
                                            backdropFilter: 'blur(8px)',
                                            padding: '8px 14px',
                                            borderRadius: THEME.radius.md,
                                            border: `1px solid ${THEME.colors.border}`,
                                            boxShadow: THEME.shadow.md,
                                            display: 'flex',
                                            flexWrap: 'wrap',
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
                                                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#FF6B00', boxShadow: '0 0 6px rgba(255,107,0,0.85)' }}></div>
                                                <span>En Movimiento ({vehiclesMovingGps.length})</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#0D7A57' }}></div>
                                                <span>Detenidos con GPS ({vehiclesStoppedGps.length})</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748B' }}>
                                                <div style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#94A3B8' }}></div>
                                                <span>
                                                    Sin Señal GPS ({vehiclesWithoutGps.length})
                                                    {vehiclesWithoutGps.length > 0 ? `: ${vehiclesWithoutGps.map((v: any) => v.plate).join(' · ')}` : ''}
                                                </span>
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
                    ) : activeTab === 'staging' ? (
                        <StagingSpacesManagement readOnly={!canEdit} />
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
                                const inTransitCrates = activeRoutes
                                    .filter(r => r.status === 'in_transit' || r.status === 'loading' || r.status === 'rectified')
                                    .reduce((acc, r) => {
                                        const explicitCrates = Number((r as { total_crates?: number }).total_crates || 0);
                                        if (explicitCrates > 0) return acc + explicitCrates;
                                        const stopCrates = (r.route_stops || []).reduce(
                                            (sAcc, st) => sAcc + Number(st?.order?.crates_count || 0),
                                            0
                                        );
                                        return acc + stopCrates;
                                    }, 0);
                                const alertCount = activeCrateProfiles.filter(p => Number(p.crate_balance || 0) > 40).length;
                                const totalSystemCrates = totalInCalle + patioStock + inTransitCrates;
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
                                                <div style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0369A1', marginTop: '2px' }}>{inTransitCrates} <span style={{ fontSize: '0.75rem', fontWeight: '700' }}>und</span></div>
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
                                                        <th style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>Kardex</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {activeCrateProfiles.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
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
                                                                    <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                                                        <button
                                                                            onClick={() => handleOpenClientKardex(p)}
                                                                            style={{
                                                                                padding: '3px 8px',
                                                                                borderRadius: '6px',
                                                                                backgroundColor: '#F1F5F9',
                                                                                border: '1px solid #CBD5E1',
                                                                                color: '#334155',
                                                                                fontSize: '0.72rem',
                                                                                fontWeight: '800',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}
                                                                            title="Ver extracto Kardex del cliente"
                                                                        >
                                                                            <FileText size={12} style={{ color: THEME.colors.primary }} /> Kardex
                                                                        </button>
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
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    value={patioModalQty === 0 ? '' : String(patioModalQty)}
                                    onChange={(e) => {
                                        const clean = e.target.value.replace(/[^0-9]/g, '');
                                        setPatioModalQty(clean ? parseInt(clean, 10) : 0);
                                    }}
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

            {/* MODAL: KARDEX DETALLADO DEL CLIENTE */}
            {selectedClientForKardex && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(26, 35, 30, 0.65)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1.5rem' }}>
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, maxWidth: '780px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <FileText size={18} style={{ color: THEME.colors.primary }} /> Extracto Kardex de Canastillas
                                </h3>
                                <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '700' }}>
                                    {selectedClientForKardex.company_name || selectedClientForKardex.contact_name} &bull; Saldo Actual: <span style={{ color: THEME.colors.primary, fontWeight: '900' }}>{selectedClientForKardex.crate_balance || 0} und</span>
                                </p>
                            </div>
                            <button onClick={() => setSelectedClientForKardex(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', padding: '1rem 1.5rem', flex: 1 }}>
                            {isLoadingClientKardex ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                    Cargando movimientos de Kardex...
                                </div>
                            ) : clientKardexMovements.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: THEME.colors.textSecondary }}>
                                    <Package size={36} style={{ color: '#CBD5E1', margin: '0 auto 8px', display: 'block' }} />
                                    <div style={{ fontWeight: '800', color: THEME.colors.textMain }}>Sin movimientos registrados</div>
                                    <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>No hay registros de despachos o devoluciones para este cliente.</div>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary, textAlign: 'left', fontWeight: '800', textTransform: 'uppercase', fontSize: '0.68rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            <th style={{ padding: '0.6rem 0.8rem' }}>Fecha</th>
                                            <th style={{ padding: '0.6rem 0.8rem' }}>Operación</th>
                                            <th style={{ padding: '0.6rem 0.8rem' }}>Referencia</th>
                                            <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Entregadas</th>
                                            <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Recogidas</th>
                                            <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Saldo</th>
                                            <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Soporte</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clientKardexMovements.map(mov => (
                                            <tr key={mov.id} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <td style={{ padding: '0.65rem 0.8rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                                    {mov.created_at ? new Date(mov.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.8rem' }}>
                                                    {(mov.delivered_qty || 0) > 0 && (mov.received_qty || 0) > 0 ? (
                                                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#EFF6FF', color: '#1E40AF', fontWeight: '800' }}>Canje</span>
                                                    ) : mov.movement_type === 'yard_direct_return' ? (
                                                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#F0FDF4', color: '#166534', fontWeight: '800' }}>Patio</span>
                                                    ) : (mov.delivered_qty || 0) > 0 || mov.type === 'delivery' ? (
                                                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#FEF2F2', color: '#991B1B', fontWeight: '800' }}>Entrega</span>
                                                    ) : (
                                                        <span style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#ECFDF5', color: '#065F46', fontWeight: '800' }}>Recogida</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.8rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                    {mov.orders?.sequence_id ? `Remisión #${mov.orders.sequence_id}` : (mov.notes || `ID #${mov.id.substring(0, 6)}`)}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: '800', color: (mov.delivered_qty || 0) > 0 ? '#DC2626' : '#94A3B8' }}>
                                                    {(mov.delivered_qty || 0) > 0 ? `+${mov.delivered_qty}` : '-'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: '800', color: (mov.received_qty || 0) > 0 ? '#10B981' : '#94A3B8' }}>
                                                    {(mov.received_qty || 0) > 0 ? `-${mov.received_qty}` : '-'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.8rem', textAlign: 'right', fontWeight: '900', color: THEME.colors.textMain }}>
                                                    {mov.balance_after != null ? `${mov.balance_after} und` : '-'}
                                                </td>
                                                <td style={{ padding: '0.65rem 0.8rem', textAlign: 'center' }}>
                                                    {mov.evidence_url ? (
                                                        <a href={mov.evidence_url} target="_blank" rel="noopener noreferrer" style={{ color: THEME.colors.primary, display: 'inline-flex', alignItems: 'center', gap: '3px', fontWeight: '700', fontSize: '0.7rem' }}>
                                                            <ExternalLink size={11} /> Ver
                                                        </a>
                                                    ) : (
                                                        <span style={{ color: '#94A3B8', fontSize: '0.68rem' }}>-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div style={{ padding: '0.85rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedClientForKardex(null)}
                                style={{ padding: '0.45rem 1.1rem', borderRadius: '8px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: THEME.colors.textMain, fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer' }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {qrBeaconModal && (
                <div style={{
                    position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.72)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2400, padding: '1rem'
                }} onClick={() => setQrBeaconModal(null)}>
                    <div style={{
                        backgroundColor: '#FFFFFF', borderRadius: '20px', maxWidth: '400px', width: '100%',
                        padding: '1.5rem', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', textAlign: 'center',
                        color: THEME.colors.textMain
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '900', fontSize: '0.98rem' }}>
                                <QrCode size={18} color={THEME.colors.primary} />
                                <span>Baliza GPS · {qrBeaconModal.plate}</span>
                            </div>
                            <button type="button" onClick={() => setQrBeaconModal(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748B' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <p style={{ margin: '0 0 1rem', fontSize: '0.76rem', color: THEME.colors.textSecondary, lineHeight: 1.4 }}>
                            Escanea con el celular del conductor{qrBeaconModal.driverName ? ` (${qrBeaconModal.driverName})` : ''} o envíale el enlace por WhatsApp. Expira en 16h o al cerrar la ruta.
                        </p>
                        <div style={{ display: 'inline-flex', padding: '14px', backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', marginBottom: '1rem' }}>
                            <QRCodeSVG value={qrBeaconModal.url} size={200} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={async () => {
                                    await navigator.clipboard?.writeText(qrBeaconModal.url);
                                    setQrCopied(true);
                                }}
                                style={{
                                    flex: 1, padding: '9px 12px', borderRadius: '10px', border: '1px solid #CBD5E1',
                                    backgroundColor: '#F8FAFC', color: '#0F172A', fontWeight: '800', fontSize: '0.76rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                <Copy size={14} />
                                {qrCopied ? 'Copiado' : 'Copiar Link'}
                            </button>
                            <a
                                href={(() => {
                                    const cleanPhone = (qrBeaconModal.driverPhone || '').replace(/\D/g, '');
                                    const text = encodeURIComponent(`Hola${qrBeaconModal.driverName ? ` ${qrBeaconModal.driverName}` : ''}, abre este enlace en tu celular para activar el GPS en ruta del vehículo ${qrBeaconModal.plate}: ${qrBeaconModal.url}`);
                                    return cleanPhone ? `https://wa.me/57${cleanPhone}?text=${text}` : `https://wa.me/?text=${text}`;
                                })()}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                    flex: 1, padding: '9px 12px', borderRadius: '10px', border: 'none',
                                    backgroundColor: '#16A34A', color: '#FFFFFF', fontWeight: '800', fontSize: '0.76rem',
                                    textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                }}
                            >
                                <MessageCircle size={14} />
                                WhatsApp
                            </a>
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
                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1.2 }}>{title}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: '900', color: THEME.colors.textMain, lineHeight: 1.1, margin: '2px 0' }}>{value}</div>
                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, fontWeight: '600', lineHeight: 1.25 }}>{subtitle}</div>
            </div>
        </div>
    );
}
