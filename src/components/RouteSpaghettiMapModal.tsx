'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Map as GoogleMap, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import {
    X,
    Truck,
    MapPin,
    Navigation,
    ExternalLink,
    AlertTriangle,
    Clock,
    Route as RouteIcon,
    Warehouse,
    Info,
} from 'lucide-react';
import { GOOGLE_MAPS_MAP_ID } from '@/lib/constants';
import {
    decodeGooglePolyline,
    buildGoogleMapsDirectionChunks,
    classifyOrderGps,
    BODEGA_CENTRAL,
} from '@/lib/transport/gpsHygiene';

export interface RouteSpaghettiMapModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehicles: any[];
    orders: any[];
    assignments: Record<string, string[]>;
    routePolylines: Record<string, string>;
    routeMetrics: Record<
        string,
        {
            distance_km: number;
            travel_min: number;
            total_min: number;
            wait_min: number;
            break_min: number;
            service_min?: number;
            return_eta?: string;
        }
    >;
    stopLegMetrics: Record<
        string,
        {
            distance_km: number;
            travel_min: number;
            is_same_site_followup?: boolean;
            service_min?: number;
            cluster_size?: number;
        }
    >;
    stopEtas: Record<string, string>;
    trafficMode: 'live_predictive' | 'weekday_projected' | null;
    initialVehicleId?: string | null;
    isSealedView?: boolean;
}

const ROUTE_COLORS = [
    '#2563EB', // Blue
    '#DC2626', // Red
    '#059669', // Emerald
    '#D97706', // Amber
    '#7C3AED', // Violet
    '#DB2777', // Pink
    '#0891B2', // Cyan
    '#4F46E5', // Indigo
    '#EA580C', // Orange
    '#65A30D', // Lime
];

interface PolylineRenderItem {
    vehicleId: string;
    color: string;
    path: Array<{ lat: number; lng: number }>;
    isFocused: boolean;
}

function getOrderCoordinates(order: any): { lat: number | null; lng: number | null } {
    const rawLat = order?.latitude ?? order?.profiles?.latitude ?? null;
    const rawLng = order?.longitude ?? order?.profiles?.longitude ?? null;
    const lat = rawLat !== null && rawLat !== undefined && rawLat !== '' ? Number(rawLat) : null;
    const lng = rawLng !== null && rawLng !== undefined && rawLng !== '' ? Number(rawLng) : null;
    return {
        lat: lat !== null && Number.isFinite(lat) ? lat : null,
        lng: lng !== null && Number.isFinite(lng) ? lng : null,
    };
}

function SpaghettiPolylinesLayer({
    items,
    markerPoints,
}: {
    items: PolylineRenderItem[];
    markerPoints: Array<{ lat: number; lng: number }>;
}) {
    const map = useMap();

    useEffect(() => {
        if (!map || typeof google === 'undefined' || !google.maps?.Polyline) return;

        const polylines: google.maps.Polyline[] = [];
        for (const item of items) {
            if (!item.path || item.path.length < 2) continue;
            const polyline = new google.maps.Polyline({
                path: item.path,
                strokeColor: item.color,
                strokeOpacity: item.isFocused ? 0.95 : 0.8,
                strokeWeight: item.isFocused ? 5 : 4,
                zIndex: item.isFocused ? 20 : 10,
                map,
            });
            polylines.push(polyline);
        }

        return () => {
            polylines.forEach((p) => p.setMap(null));
        };
    }, [map, items]);

    useEffect(() => {
        if (!map || typeof google === 'undefined' || !google.maps?.LatLngBounds) return;

        const bounds = new google.maps.LatLngBounds();
        bounds.extend({ lat: BODEGA_CENTRAL.lat, lng: BODEGA_CENTRAL.lng });

        let hasExtraPoints = false;
        for (const item of items) {
            for (const pt of item.path) {
                bounds.extend(pt);
                hasExtraPoints = true;
            }
        }
        for (const pt of markerPoints) {
            bounds.extend(pt);
            hasExtraPoints = true;
        }

        if (hasExtraPoints && !bounds.isEmpty()) {
            map.fitBounds(bounds, 48);
        } else {
            map.setCenter({ lat: BODEGA_CENTRAL.lat, lng: BODEGA_CENTRAL.lng });
            map.setZoom(12);
        }
    }, [map, items, markerPoints]);

    return null;
}

export function RouteSpaghettiMapModal({
    isOpen,
    onClose,
    vehicles,
    orders,
    assignments,
    routePolylines,
    routeMetrics,
    stopLegMetrics,
    stopEtas,
    trafficMode,
    initialVehicleId = null,
    isSealedView = false,
}: RouteSpaghettiMapModalProps) {
    const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialVehicleId || 'ALL');
    const [activeStopKey, setActiveStopKey] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedVehicleId(initialVehicleId || 'ALL');
            setActiveStopKey(null);
        }
    }, [isOpen, initialVehicleId]);

    const orderById = useMemo(() => {
        const map = new Map<string, any>();
        for (const o of orders || []) {
            if (o?.id !== undefined && o?.id !== null) {
                map.set(String(o.id), o);
            }
        }
        return map;
    }, [orders]);

    const activeVehicles = useMemo(() => {
        const list: Array<{
            id: string;
            plate: string;
            driverName: string;
            color: string;
            orderIds: string[];
        }> = [];

        (vehicles || []).forEach((v, idx) => {
            const vid = String(v.id);
            const assignedIds = (assignments?.[vid] || []).map(String);
            if (assignedIds.length > 0 || (initialVehicleId && String(initialVehicleId) === vid)) {
                list.push({
                    id: vid,
                    plate: String(v.plate || v.vehicle_plate || `Vehículo ${idx + 1}`),
                    driverName: String(v.driver?.contact_name || v.driver_name || ''),
                    color: ROUTE_COLORS[list.length % ROUTE_COLORS.length],
                    orderIds: assignedIds,
                });
            }
        });
        return list;
    }, [vehicles, assignments, initialVehicleId]);

    const visibleVehicles = useMemo(() => {
        if (selectedVehicleId === 'ALL') return activeVehicles;
        return activeVehicles.filter((v) => v.id === String(selectedVehicleId));
    }, [activeVehicles, selectedVehicleId]);

    const polylineItems = useMemo<PolylineRenderItem[]>(() => {
        const items: PolylineRenderItem[] = [];
        for (const v of visibleVehicles) {
            const encoded = routePolylines?.[v.id];
            if (!encoded || typeof encoded !== 'string' || encoded.trim().length === 0) {
                continue;
            }
            const decoded = decodeGooglePolyline(encoded);
            if (decoded.length >= 2) {
                items.push({
                    vehicleId: v.id,
                    color: v.color,
                    path: decoded,
                    isFocused: selectedVehicleId !== 'ALL',
                });
            }
        }
        return items;
    }, [visibleVehicles, routePolylines, selectedVehicleId]);

    const visibleStops = useMemo(() => {
        const stops: Array<{
            key: string;
            vehicleId: string;
            plate: string;
            color: string;
            stopNumber: number;
            orderId: string;
            order: any;
            lat: number | null;
            lng: number | null;
            gpsStatus: ReturnType<typeof classifyOrderGps>['status'];
        }> = [];

        for (const v of visibleVehicles) {
            v.orderIds.forEach((oid, idx) => {
                const order = orderById.get(String(oid));
                if (!order) return;
                const { lat, lng } = getOrderCoordinates(order);
                const gpsResult = classifyOrderGps(lat, lng);
                stops.push({
                    key: `${v.id}:${oid}`,
                    vehicleId: v.id,
                    plate: v.plate,
                    color: v.color,
                    stopNumber: idx + 1,
                    orderId: String(oid),
                    order,
                    lat: gpsResult.lat ?? lat,
                    lng: gpsResult.lng ?? lng,
                    gpsStatus: gpsResult.status,
                });
            });
        }
        return stops;
    }, [visibleVehicles, orderById]);

    const validMarkerPoints = useMemo(() => {
        return visibleStops
            .filter((s) => s.gpsStatus === 'valid' && s.lat !== null && s.lng !== null)
            .map((s) => ({ lat: s.lat as number, lng: s.lng as number }));
    }, [visibleStops]);

    const vehiclesWithoutPolyline = useMemo(() => {
        return visibleVehicles.filter(
            (v) => v.orderIds.length > 0 && (!routePolylines?.[v.id] || !routePolylines[v.id].trim())
        );
    }, [visibleVehicles, routePolylines]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(15, 23, 42, 0.72)',
                backdropFilter: 'blur(4px)',
                padding: '16px',
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Mapa Espagueti de Rutas"
        >
            <div
                style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                    border: '1px solid #E2E8F0',
                    width: '100%',
                    maxWidth: '1440px',
                    height: '90vh',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                }}
            >
                {/* Header */}
                <div
                    style={{
                        padding: '14px 20px',
                        borderBottom: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexShrink: 0,
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                backgroundColor: '#0F172A',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                            }}
                        >
                            <RouteIcon size={18} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
                                Mapa Espagueti de Rutas
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
                                {trafficMode === 'live_predictive' && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#ECFDF5', color: '#047857', border: '1px solid #A7F3D0' }}>
                                        <Navigation size={11} />
                                        Tráfico Predictivo en Vivo (Google)
                                    </span>
                                )}
                                {trafficMode === 'weekday_projected' && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#FFFBEB', color: '#92400E', border: '1px solid #FDE68A' }}>
                                        <Clock size={11} />
                                        Tráfico Proyectado (Mismo Día Semana)
                                    </span>
                                )}
                                {!trafficMode && (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '9999px', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                        <Info size={11} />
                                        Sin telemetría de tráfico de Google
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Truck size={16} color="#64748B" />
                            <select
                                value={selectedVehicleId}
                                onChange={(e) => setSelectedVehicleId(e.target.value)}
                                aria-label="Filtrar por camión"
                                style={{
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    padding: '6px 12px',
                                    outline: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                <option value="ALL">
                                    Todos los camiones ({activeVehicles.length})
                                </option>
                                {activeVehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.plate} ({v.orderIds.length} paradas)
                                    </option>
                                ))}
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Cerrar mapa espagueti"
                            style={{
                                padding: '6px',
                                borderRadius: '8px',
                                border: '1px solid #E2E8F0',
                                backgroundColor: '#FFFFFF',
                                color: '#475569',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body: Map + Lateral Panel */}
                <div
                    style={{
                        flex: 1,
                        minHeight: 0,
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1.85fr) minmax(340px, 1fr)',
                    }}
                >
                    {/* Map Canvas */}
                    <div
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            minHeight: '420px',
                            backgroundColor: '#F1F5F9',
                        }}
                    >
                        <GoogleMap
                            mapId={GOOGLE_MAPS_MAP_ID}
                            defaultCenter={{ lat: BODEGA_CENTRAL.lat, lng: BODEGA_CENTRAL.lng }}
                            defaultZoom={12}
                            gestureHandling="greedy"
                            disableDefaultUI={false}
                            style={{ width: '100%', height: '100%' }}
                        >
                            <SpaghettiPolylinesLayer
                                items={polylineItems}
                                markerPoints={validMarkerPoints}
                            />

                            {/* Bodega Central Pin */}
                            <AdvancedMarker
                                position={{ lat: BODEGA_CENTRAL.lat, lng: BODEGA_CENTRAL.lng }}
                                title="Bodega Central (Corabastos)"
                                zIndex={30}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <div style={{ padding: '4px 8px', borderRadius: '8px', backgroundColor: '#0F172A', color: '#FFFFFF', boxShadow: '0 4px 10px rgba(0,0,0,0.25)', border: '1px solid #FFFFFF', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                        <Warehouse size={13} color="#FBBF24" />
                                        <span>Bodega Central (Corabastos)</span>
                                    </div>
                                    <div style={{ width: '10px', height: '10px', backgroundColor: '#0F172A', transform: 'rotate(45deg)', marginTop: '-5px', borderRight: '1px solid #FFFFFF', borderBottom: '1px solid #FFFFFF' }} />
                                </div>
                            </AdvancedMarker>

                            {/* Numbered Stop Pins */}
                            {visibleStops.map((stop) => {
                                if (stop.gpsStatus !== 'valid' || stop.lat === null || stop.lng === null) {
                                    return null;
                                }
                                const isActive = activeStopKey === stop.key;
                                return (
                                    <AdvancedMarker
                                        key={stop.key}
                                        position={{ lat: stop.lat, lng: stop.lng }}
                                        title={`#${stop.stopNumber} · ${stop.order.customer_name || 'Cliente'} (${stop.plate})`}
                                        zIndex={isActive ? 40 : 25}
                                        onClick={() => setActiveStopKey(stop.key)}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer' }}>
                                            <div
                                                style={{
                                                    backgroundColor: stop.color,
                                                    padding: '2px 8px',
                                                    borderRadius: '9999px',
                                                    color: '#FFFFFF',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    boxShadow: isActive ? '0 0 0 2px #0F172A, 0 4px 10px rgba(0,0,0,0.3)' : '0 2px 6px rgba(0,0,0,0.25)',
                                                    border: '2px solid #FFFFFF',
                                                    transform: isActive ? 'scale(1.22)' : 'scale(1)',
                                                    transition: 'transform 0.15s',
                                                }}
                                            >
                                                #{stop.stopNumber}
                                            </div>
                                        </div>
                                    </AdvancedMarker>
                                );
                            })}
                        </GoogleMap>
                    </div>

                    {/* Lateral Summary & Stop Table */}
                    <div
                        style={{
                            borderLeft: '1px solid #E2E8F0',
                            backgroundColor: '#FFFFFF',
                            display: 'flex',
                            flexDirection: 'column',
                            minHeight: 0,
                        }}
                    >
                        <div style={{ flex: 1, minHeight: 0, overflowY: visibleVehicles.length === 1 ? 'hidden' : 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {visibleVehicles.length === 0 && (
                                <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', textAlign: 'center', fontSize: '12px', color: '#475569' }}>
                                    No hay camiones con paradas asignadas para mostrar.
                                </div>
                            )}

                            {/* Zero-Mock Notice when polyline is missing */}
                            {vehiclesWithoutPolyline.length > 0 && (
                                <div style={{
                                    padding: '12px',
                                    borderRadius: '12px',
                                    border: isSealedView ? '1px solid #BFDBFE' : '1px solid #FCD34D',
                                    backgroundColor: isSealedView ? '#EFF6FF' : '#FFFBEB',
                                    color: isSealedView ? '#1E40AF' : '#78350F',
                                    fontSize: '12px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px'
                                }}>
                                    {isSealedView
                                        ? <Info size={16} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        : <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    }
                                    <div>
                                        <p style={{ margin: 0, fontWeight: 800 }}>
                                            {isSealedView
                                                ? 'Ruta confirmada sin polilínea guardada'
                                                : 'Modo Manual — sin polilínea ni métricas de tráfico de Google'}
                                        </p>
                                        <p style={{ margin: '3px 0 0', fontSize: '11px', color: isSealedView ? '#1E3A8A' : '#92400E' }}>
                                            {isSealedView
                                                ? `${vehiclesWithoutPolyline.map((v) => v.plate).join(', ')}: se muestran las paradas numeradas en secuencia y los enlaces directos a Google Maps. Las nuevas confirmaciones guardarán el trazo optimizado automáticamente.`
                                                : `${vehiclesWithoutPolyline.map((v) => v.plate).join(', ')} sin trazo optimizado vigente. No se generan distancias, tiempos ni líneas rectas sintéticas.`}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {visibleVehicles.map((v) => {
                                const metrics = routeMetrics?.[v.id];
                                const hasPolyline = Boolean(routePolylines?.[v.id]?.trim());
                                const vehicleStops = visibleStops.filter((s) => s.vehicleId === v.id);
                                const validOrdersForChunks = vehicleStops
                                    .filter((s) => s.gpsStatus === 'valid' && s.lat !== null && s.lng !== null)
                                    .map((s) => ({
                                        lat: s.lat as number,
                                        lng: s.lng as number,
                                        label: String(s.order?.customer_name || `Parada #${s.stopNumber}`),
                                    }));
                                const directionChunks = buildGoogleMapsDirectionChunks(validOrdersForChunks);

                                return (
                                    <div
                                        key={v.id}
                                        style={{
                                            borderRadius: '12px',
                                            border: '1px solid #E2E8F0',
                                            overflow: 'hidden',
                                            backgroundColor: '#FFFFFF',
                                            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            ...(visibleVehicles.length === 1 ? { flex: 1, minHeight: 0 } : { flexShrink: 0 }),
                                        }}
                                    >
                                        {/* Vehicle Card Header */}
                                        <div style={{ padding: '10px 14px', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                <span
                                                    style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '9999px',
                                                        backgroundColor: v.color,
                                                        border: '1px solid #FFFFFF',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                                                        flexShrink: 0,
                                                    }}
                                                />
                                                <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {v.plate}
                                                </span>
                                                {v.driverName && (
                                                    <span style={{ fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        · {v.driverName}
                                                    </span>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', flexShrink: 0 }}>
                                                {vehicleStops.length} paradas
                                            </span>
                                        </div>

                                        {/* Real Metrics Row or Manual Notice */}
                                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #F1F5F9', backgroundColor: '#FFFFFF' }}>
                                            {hasPolyline && metrics ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', textAlign: 'center' }}>
                                                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '6px', border: '1px solid #F1F5F9' }}>
                                                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                                                            Distancia
                                                        </div>
                                                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                                                            {metrics.distance_km} km
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '6px', border: '1px solid #F1F5F9' }}>
                                                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                                                            Conducción
                                                        </div>
                                                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                                                            {metrics.travel_min} min
                                                        </div>
                                                    </div>
                                                    <div style={{ backgroundColor: '#F8FAFC', borderRadius: '8px', padding: '6px', border: '1px solid #F1F5F9' }}>
                                                        <div style={{ fontSize: '10px', color: '#64748B', fontWeight: 600 }}>
                                                            Total Ruta
                                                        </div>
                                                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A' }}>
                                                            {metrics.total_min} min
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <AlertTriangle size={13} color="#D97706" style={{ flexShrink: 0 }} />
                                                    <span>Modo Manual — sin polilínea ni métricas de tráfico de Google</span>
                                                </div>
                                            )}

                                            {/* Google Maps Direction Chunks */}
                                            <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {directionChunks.length === 0 ? (
                                                    <span style={{ fontSize: '11px', color: '#94A3B8', fontStyle: 'italic' }}>
                                                        Sin paradas con GPS válido para navegación
                                                    </span>
                                                ) : directionChunks.length === 1 ? (
                                                    <a
                                                        href={directionChunks[0].url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', backgroundColor: '#0F172A', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}
                                                    >
                                                        <ExternalLink size={12} />
                                                        Abrir en Google Maps
                                                    </a>
                                                ) : (
                                                    directionChunks.map((chunk, cIdx) => (
                                                        <a
                                                            key={cIdx}
                                                            href={chunk.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 10px', borderRadius: '8px', backgroundColor: '#0F172A', color: '#FFFFFF', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}
                                                        >
                                                            <ExternalLink size={12} />
                                                            Abrir en Google Maps · Tramo {cIdx + 1}
                                                        </a>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Stops Breakdown */}
                                        <div style={visibleVehicles.length === 1 ? { flex: 1, minHeight: 0, overflowY: 'auto' } : { maxHeight: '360px', overflowY: 'auto' }}>
                                            {vehicleStops.map((stop, sIdx) => {
                                                const leg = stopLegMetrics?.[stop.orderId];
                                                const eta = stopEtas?.[stop.orderId];
                                                const isActive = activeStopKey === stop.key;

                                                return (
                                                    <div
                                                        key={stop.key}
                                                        onClick={() => setActiveStopKey(stop.key)}
                                                        style={{
                                                            padding: '8px 14px',
                                                            fontSize: '12px',
                                                            cursor: 'pointer',
                                                            backgroundColor: isActive ? '#EFF6FF' : '#FFFFFF',
                                                            borderTop: sIdx > 0 ? '1px solid #F1F5F9' : 'none',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                                                                <span
                                                                    style={{
                                                                        backgroundColor: v.color,
                                                                        padding: '2px 6px',
                                                                        borderRadius: '6px',
                                                                        color: '#FFFFFF',
                                                                        fontWeight: 800,
                                                                        fontSize: '10px',
                                                                        flexShrink: 0,
                                                                        marginTop: '2px',
                                                                    }}
                                                                >
                                                                    #{stop.stopNumber}
                                                                </span>
                                                                <div style={{ minWidth: 0 }}>
                                                                    <p style={{ margin: 0, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                        {stop.order.customer_name || 'Cliente'}
                                                                    </p>
                                                                    {stop.order.address && (
                                                                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                            {stop.order.address}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                {eta && (
                                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#0F172A' }}>
                                                                        {eta}
                                                                    </div>
                                                                )}
                                                                {stop.gpsStatus !== 'valid' ? (
                                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: '#B91C1C', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '1px 6px', borderRadius: '6px' }}>
                                                                        <MapPin size={10} />
                                                                        Sin GPS válido
                                                                    </span>
                                                                ) : leg?.is_same_site_followup ? (
                                                                    <span style={{ fontSize: '10px', fontWeight: 700, color: '#4338CA', backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE', padding: '1px 6px', borderRadius: '6px' }}>
                                                                        Mismo punto (0 km · 0 min)
                                                                    </span>
                                                                ) : leg ? (
                                                                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#475569' }}>
                                                                        {leg.distance_km} km · {leg.travel_min} min
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '10px', color: '#94A3B8' }}>
                                                                        Sin métrica
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default RouteSpaghettiMapModal;
