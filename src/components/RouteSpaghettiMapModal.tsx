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
        }
    >;
    stopLegMetrics: Record<
        string,
        {
            distance_km: number;
            travel_min: number;
            is_same_site_followup?: boolean;
        }
    >;
    stopEtas: Record<string, string>;
    trafficMode: 'live_predictive' | 'weekday_projected' | null;
    initialVehicleId?: string | null;
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-label="Mapa Espagueti de Rutas"
        >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-[1440px] h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                            <RouteIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 leading-tight">
                                Mapa Espagueti de Rutas
                            </h2>
                            <div className="flex items-center gap-2 mt-0.5">
                                {trafficMode === 'live_predictive' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <Navigation className="w-3 h-3" />
                                        Tráfico Predictivo en Vivo (Google)
                                    </span>
                                )}
                                {trafficMode === 'weekday_projected' && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                                        <Clock className="w-3 h-3" />
                                        Tráfico Proyectado (Mismo Día Semana)
                                    </span>
                                )}
                                {!trafficMode && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                        <Info className="w-3 h-3" />
                                        Sin telemetría de tráfico de Google
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Truck className="w-4 h-4 text-slate-500" />
                            <select
                                value={selectedVehicleId}
                                onChange={(e) => setSelectedVehicleId(e.target.value)}
                                aria-label="Filtrar por camión"
                                className="text-xs font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body: Map + Lateral Panel */}
                <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
                    {/* Map Canvas */}
                    <div className="lg:col-span-8 relative min-h-[340px] bg-slate-100">
                        <GoogleMap
                            mapId={GOOGLE_MAPS_MAP_ID}
                            defaultCenter={{ lat: BODEGA_CENTRAL.lat, lng: BODEGA_CENTRAL.lng }}
                            defaultZoom={12}
                            gestureHandling="greedy"
                            disableDefaultUI={false}
                            className="w-full h-full"
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
                                <div className="flex flex-col items-center">
                                    <div className="px-2 py-1 rounded-lg bg-slate-900 text-white shadow-lg border border-white flex items-center gap-1.5 text-[11px] font-bold whitespace-nowrap">
                                        <Warehouse className="w-3.5 h-3.5 text-amber-400" />
                                        <span>Bodega Central (Corabastos)</span>
                                    </div>
                                    <div className="w-2.5 h-2.5 bg-slate-900 rotate-45 -mt-1.5 border-r border-b border-white" />
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
                                        <div className="flex flex-col items-center cursor-pointer group">
                                            <div
                                                style={{ backgroundColor: stop.color }}
                                                className={`px-2 py-0.5 rounded-full text-white font-extrabold text-[11px] shadow-md border-2 border-white transition-transform ${
                                                    isActive ? 'scale-125 ring-2 ring-slate-900' : 'group-hover:scale-110'
                                                }`}
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
                    <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-200 bg-white flex flex-col min-h-0">
                        <div className="flex-1 overflow-y-auto p-4 space-y-4">
                            {visibleVehicles.length === 0 && (
                                <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-center text-xs text-slate-600">
                                    No hay camiones con paradas asignadas para mostrar.
                                </div>
                            )}

                            {/* Zero-Mock Notice when polyline is missing */}
                            {vehiclesWithoutPolyline.length > 0 && (
                                <div className="p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-xs flex items-start gap-2.5">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold">
                                            Modo Manual — sin polilínea ni métricas de tráfico de Google
                                        </p>
                                        <p className="text-[11px] text-amber-800 mt-0.5">
                                            {vehiclesWithoutPolyline.map((v) => v.plate).join(', ')} sin trazo optimizado vigente. No se generan distancias, tiempos ni líneas rectas sintéticas.
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
                                        className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm"
                                    >
                                        {/* Vehicle Card Header */}
                                        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span
                                                    className="w-3 h-3 rounded-full shrink-0 border border-white shadow-sm"
                                                    style={{ backgroundColor: v.color }}
                                                />
                                                <span className="text-xs font-extrabold text-slate-900 truncate">
                                                    {v.plate}
                                                </span>
                                                {v.driverName && (
                                                    <span className="text-[11px] text-slate-500 truncate">
                                                        · {v.driverName}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[11px] font-semibold text-slate-600 shrink-0">
                                                {vehicleStops.length} paradas
                                            </span>
                                        </div>

                                        {/* Real Metrics Row or Manual Notice */}
                                        <div className="px-3.5 py-2.5 border-b border-slate-100 bg-white">
                                            {hasPolyline && metrics ? (
                                                <div className="grid grid-cols-3 gap-2 text-center">
                                                    <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                                                        <div className="text-[10px] text-slate-500 font-medium">
                                                            Distancia
                                                        </div>
                                                        <div className="text-xs font-bold text-slate-900">
                                                            {metrics.distance_km} km
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                                                        <div className="text-[10px] text-slate-500 font-medium">
                                                            Conducción
                                                        </div>
                                                        <div className="text-xs font-bold text-slate-900">
                                                            {metrics.travel_min} min
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-50 rounded-lg p-1.5 border border-slate-100">
                                                        <div className="text-[10px] text-slate-500 font-medium">
                                                            Total Ruta
                                                        </div>
                                                        <div className="text-xs font-bold text-slate-900">
                                                            {metrics.total_min} min
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[11px] font-medium text-amber-800 bg-amber-50/80 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                                    <span>Modo Manual — sin polilínea ni métricas de tráfico de Google</span>
                                                </div>
                                            )}

                                            {/* Google Maps Direction Chunks */}
                                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                                {directionChunks.length === 0 ? (
                                                    <span className="text-[11px] text-slate-400 italic">
                                                        Sin paradas con GPS válido para navegación
                                                    </span>
                                                ) : directionChunks.length === 1 ? (
                                                    <a
                                                        href={directionChunks[0].url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold transition-colors"
                                                    >
                                                        <ExternalLink className="w-3 h-3" />
                                                        Abrir en Google Maps
                                                    </a>
                                                ) : (
                                                    directionChunks.map((chunk, cIdx) => (
                                                        <a
                                                            key={cIdx}
                                                            href={chunk.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold transition-colors"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                            Abrir en Google Maps · Tramo {cIdx + 1}
                                                        </a>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* Stops Breakdown */}
                                        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                                            {vehicleStops.map((stop) => {
                                                const leg = stopLegMetrics?.[stop.orderId];
                                                const eta = stopEtas?.[stop.orderId];
                                                const isActive = activeStopKey === stop.key;

                                                return (
                                                    <div
                                                        key={stop.key}
                                                        onClick={() => setActiveStopKey(stop.key)}
                                                        className={`px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                                                            isActive ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="flex items-start gap-2 min-w-0">
                                                                <span
                                                                    style={{ backgroundColor: v.color }}
                                                                    className="px-1.5 py-0.5 rounded text-white font-bold text-[10px] shrink-0 mt-0.5"
                                                                >
                                                                    #{stop.stopNumber}
                                                                </span>
                                                                <div className="min-w-0">
                                                                    <p className="font-semibold text-slate-900 truncate">
                                                                        {stop.order.customer_name || 'Cliente'}
                                                                    </p>
                                                                    {stop.order.address && (
                                                                        <p className="text-[11px] text-slate-500 truncate">
                                                                            {stop.order.address}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="text-right shrink-0">
                                                                {eta && (
                                                                    <div className="text-[11px] font-bold text-slate-800">
                                                                        {eta}
                                                                    </div>
                                                                )}
                                                                {stop.gpsStatus !== 'valid' ? (
                                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                                                        <MapPin className="w-2.5 h-2.5" />
                                                                        Sin GPS válido
                                                                    </span>
                                                                ) : leg?.is_same_site_followup ? (
                                                                    <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                                                                        Mismo punto (0 km · 0 min)
                                                                    </span>
                                                                ) : leg ? (
                                                                    <span className="text-[11px] font-medium text-slate-600">
                                                                        {leg.distance_km} km · {leg.travel_min} min
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400">
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
