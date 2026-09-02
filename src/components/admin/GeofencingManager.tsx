'use client';

import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { Map, Marker, InfoWindow, useMapsLibrary, MapMouseEvent, useMap } from '@vis.gl/react-google-maps';
import { Save, Trash2, Eye, EyeOff, Edit2, AlertCircle, ListFilter, Search, X, MapPin, Building2, Phone, User, Calendar, ExternalLink, Layers, ArrowUpRight, Home, Download } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import * as XLSX from 'xlsx';

function MapController({ center, zoom }: { center: { lat: number; lng: number } | null; zoom: number }) {
    const map = useMap();
    useEffect(() => {
        if (!map || !center) return;
        map.panTo(center);
        map.setZoom(zoom);
    }, [map, center, zoom]);
    return null;
}


interface Point {
    lat: number;
    lng: number;
}

interface AppSetting {
    key: string;
    value: string;
}

interface GeofencingManagerProps {
    settings: AppSetting[];
    onSave: (key: string, poly: string) => Promise<boolean> | boolean;
    saving: boolean;
    canEdit: boolean;
}

// --- Polygon Wrapper Component ---
interface PolygonProps extends google.maps.PolygonOptions {
    paths: Point[];
    onPathChange?: (newPath: Point[]) => void;
}

export const Polygon = forwardRef((props: PolygonProps, ref) => {
    const { paths, onPathChange, ...options } = props;
    const map = useMap();
    const maps = useMapsLibrary('maps');
    const polygonRef = useRef<google.maps.Polygon | null>(null);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastPathRef = useRef<string>('');

    const polygon = useMemo(() => {
        if (!maps) return null;
        const p = new maps.Polygon();
        polygonRef.current = p;
        return p;
    }, [maps]);

    useImperativeHandle(ref, () => polygon, [polygon]);

    // Update from props -> Google Maps
    useEffect(() => {
        if (!polygon || !paths) return;
        const pathJson = JSON.stringify(paths);
        
        // Only update if external path changed significantly
        // or if not in editable mode (initial load)
        if (pathJson !== lastPathRef.current) {
            polygon.setPath(paths);
            lastPathRef.current = pathJson;
        }
    }, [polygon, paths]);

    // Ensure polygon is properly attached to map on mount and detached on unmount
    useEffect(() => {
        if (!polygon || !map) return;
        polygon.setMap(map);
        polygon.setVisible(true);
        return () => {
            polygon.setVisible(false);
            polygon.setMap(null);
        };
    }, [polygon, map]);

    // Options & Visibility update
    useEffect(() => {
        if (!polygon) return;
        polygon.setOptions(options);
    }, [polygon, options.fillColor, options.strokeColor, options.editable, options.draggable]);

    // Sync from Google Maps -> React state during editing
    useEffect(() => {
        if (!polygon || !onPathChange) return;

        const syncPath = () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            
            syncTimeoutRef.current = setTimeout(() => {
                const path = polygon.getPath();
                if (!path) return;
                const newPath = path.getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
                const pathJson = JSON.stringify(newPath);
                
                if (pathJson !== lastPathRef.current) {
                    lastPathRef.current = pathJson;
                    onPathChange(newPath);
                }
            }, 150);
        };

        const path = polygon.getPath();
        const listeners = [
            path.addListener('set_at', syncPath),
            path.addListener('insert_at', syncPath),
            path.addListener('remove_at', syncPath),
            polygon.addListener('rightclick', (e: any) => {
                if (e.vertex !== undefined && options.editable) {
                    path.removeAt(e.vertex);
                }
            })
        ];

        return () => {
            listeners.forEach(l => google.maps.event.removeListener(l));
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [polygon, onPathChange, options.editable]);

    return null;
});

Polygon.displayName = 'Polygon';

// Ray-casting algorithm to ensure points inside active geofences are excluded
function isPointInPolygon(point: Point, vs: Point[]) {
    if (!vs || vs.length < 3) return false;
    const x = point.lat, y = point.lng;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const xi = vs[i].lat, yi = vs[i].lng;
        const xj = vs[j].lat, yj = vs[j].lng;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export default function GeofencingManager({ settings, onSave, saving, canEdit }: GeofencingManagerProps) {
    const [editMode, setEditMode] = useState<'b2c' | 'b2b' | null>(null);
    const [tempPoly, setTempPoly] = useState<Point[]>([]);
    const [visibleB2C, setVisibleB2C] = useState(true);
    const [visibleB2B, setVisibleB2B] = useState(true);
    const [visibleOutOfBounds, setVisibleOutOfBounds] = useState(true);
    const [outOfBoundsPoints, setOutOfBoundsPoints] = useState<any[]>([]);
    const [selectedPoint, setSelectedPoint] = useState<any | null>(null);

    // Modal Auditoría de Rechazos
    const [isTableModalOpen, setIsTableModalOpen] = useState(false);
    const [modalFilter, setModalFilter] = useState<'all' | 'b2c' | 'b2b'>('all');
    const [modalSearch, setModalSearch] = useState('');
    const [mapTargetCenter, setMapTargetCenter] = useState<{ lat: number; lng: number } | null>(null);
    const [mapTargetZoom, setMapTargetZoom] = useState<number>(11);

    useEffect(() => {
        fetch('/api/coverage/out-of-bounds')
            .then(res => res.json())
            .then(data => {
                if (data.requests) setOutOfBoundsPoints(data.requests);
            })
            .catch(err => console.warn('Error cargando mapa de calor de rechazos:', err));
    }, []);

    const focusPointOnMap = (pt: any) => {
        setSelectedPoint(pt);
        setVisibleOutOfBounds(true);
        setMapTargetCenter({ lat: Number(pt.latitude), lng: Number(pt.longitude) });
        setMapTargetZoom(14);
        setIsTableModalOpen(false);
    };

    const b2cPolyString = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
    const b2bPolyString = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
    
    const b2cPoly: Point[] = useMemo(() => {
        try { return b2cPolyString ? JSON.parse(b2cPolyString) : []; } catch { return []; }
    }, [b2cPolyString]);

    const b2bPoly: Point[] = useMemo(() => {
        try { return b2bPolyString ? JSON.parse(b2bPolyString) : []; } catch { return []; }
    }, [b2bPolyString]);

    // Filtrar estrictamente solo puntos que estén FUERA de los polígonos activos
    const validOutOfBoundsPoints = useMemo(() => {
        return outOfBoundsPoints.filter(pt => {
            const p = { lat: Number(pt.latitude), lng: Number(pt.longitude) };
            const insideB2C = b2cPoly.length >= 3 && isPointInPolygon(p, b2cPoly);
            const insideB2B = b2bPoly.length >= 3 && isPointInPolygon(p, b2bPoly);
            return !insideB2C && !insideB2B;
        });
    }, [outOfBoundsPoints, b2cPoly, b2bPoly]);

    const exportToExcel = () => {
        const filteredPoints = validOutOfBoundsPoints.filter(pt => {
            if (modalFilter === 'b2c' && pt.channel === 'b2b') return false;
            if (modalFilter === 'b2b' && pt.channel !== 'b2b') return false;
            if (modalSearch.trim()) {
                const q = modalSearch.toLowerCase();
                const text = `${pt.customer_name} ${pt.municipality} ${pt.address} ${pt.customer_phone}`.toLowerCase();
                return text.includes(q);
            }
            return true;
        });

        if (filteredPoints.length === 0) {
            alert('No hay registros para exportar con los filtros actuales.');
            return;
        }

        const excelRows = filteredPoints.map(pt => ({
            'Fecha y Hora': pt.created_at ? new Date(pt.created_at).toLocaleString('es-CO') : 'Hoy',
            'Canal': pt.channel === 'b2b' ? 'HORECA B2B' : 'Hogar B2C',
            'Cliente / Empresa': pt.customer_name || 'Anónimo',
            'Teléfono': pt.customer_phone || '',
            'Correo Electrónico': pt.customer_email || '',
            'Municipio / Detalle': pt.municipality || 'Fuera de zona',
            'Dirección Solicitada': pt.address || '',
            'Latitud': pt.latitude || '',
            'Longitud': pt.longitude || ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelRows);

        // Configurar anchos óptimos de columna
        worksheet['!cols'] = [
            { wch: 18 }, // Fecha
            { wch: 14 }, // Canal
            { wch: 32 }, // Cliente
            { wch: 14 }, // Telefono
            { wch: 25 }, // Correo
            { wch: 28 }, // Municipio
            { wch: 35 }, // Direccion
            { wch: 12 }, // Latitud
            { wch: 12 }  // Longitud
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Demandas Rechazadas');

        XLSX.writeFile(workbook, `frufresco_rechazos_${modalFilter}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const startEditing = (mode: 'b2c' | 'b2b') => {
        const initialPoints = mode === 'b2c' ? b2cPoly : b2bPoly;
        setTempPoly([...initialPoints]);
        setEditMode(mode);
        if (mode === 'b2c') setVisibleB2C(true);
        if (mode === 'b2b') setVisibleB2B(true);
    };

    const handleMapClick = (e: MapMouseEvent) => {
        if (!editMode || !e.detail.latLng) return;
        setTempPoly(prev => [...prev, e.detail.latLng!]);
    };

    const handlePathChange = useCallback((newPath: Point[]) => {
        setTempPoly(newPath);
    }, []);

    const clearVertices = () => {
        if (window.confirm('¿Estás seguro de que deseas eliminar todos los puntos dibujados?')) {
            setTempPoly([]);
        }
    };

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 230px', gap: '1.25rem', fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
            <div style={{ position: 'relative', height: '700px', borderRadius: THEME.radius.lg, overflow: 'hidden', border: `1px solid ${THEME.colors.border}` }}>
                <Map
                    style={{ width: '100%', height: '100%' }}
                    defaultCenter={{ lat: 4.6097, lng: -74.0817 }}
                    defaultZoom={11}
                    gestureHandling={'greedy'}
                    disableDefaultUI={false}
                    onClick={handleMapClick}
                >
                    <MapController center={mapTargetCenter} zoom={mapTargetZoom} />
                    {visibleB2C && (
                        <Polygon 
                            paths={editMode === 'b2c' ? tempPoly : b2cPoly} 
                            onPathChange={editMode === 'b2c' ? handlePathChange : undefined}
                            editable={editMode === 'b2c'}
                            draggable={editMode === 'b2c'}
                            fillColor="#EF4444"
                            fillOpacity={0.2}
                            strokeColor="#EF4444"
                            strokeWeight={2}
                        />
                    )}

                    {visibleB2B && (
                        <Polygon 
                            paths={editMode === 'b2b' ? tempPoly : b2bPoly} 
                            onPathChange={editMode === 'b2b' ? handlePathChange : undefined}
                            editable={editMode === 'b2b'}
                            draggable={editMode === 'b2b'}
                            fillColor="#0D7A57"
                            fillOpacity={0.25}
                            strokeColor="#0D7A57"
                            strokeWeight={2.5}
                        />
                    )}

                    {/* Markers only for fresh drawing (less than 3 points) */}
                    {editMode && tempPoly.length < 3 && tempPoly.map((p, i) => (
                        <Marker key={`edit-${i}`} position={p} label={(i + 1).toString()} />
                    ))}

                    {/* RED/BLUE DOT HEATMAP MARKERS: Rejected Demand Out of Bounds (B2C & B2B) - Strict point in polygon filtering */}
                    {visibleOutOfBounds && validOutOfBoundsPoints.map((pt, idx) => {
                        const isB2B = pt.channel === 'b2b';
                        return (
                            <Marker 
                                key={`oob-${pt.id || idx}`} 
                                position={{ lat: Number(pt.latitude), lng: Number(pt.longitude) }}
                                title={`Demanda Rechazada [${isB2B ? 'B2B HORECA' : 'B2C Hogares'}]: ${pt.municipality || pt.address}`}
                                onClick={() => setSelectedPoint(pt)}
                                icon={{
                                    path: google.maps.SymbolPath.CIRCLE,
                                    scale: isB2B ? 9 : 7,
                                    fillColor: isB2B ? '#0D7A57' : '#DC2626',
                                    fillOpacity: 0.95,
                                    strokeColor: '#FFFFFF',
                                    strokeWeight: 2
                                }}
                            />
                        );
                    })}

                    {selectedPoint && (
                        <InfoWindow
                            position={{ lat: Number(selectedPoint.latitude), lng: Number(selectedPoint.longitude) }}
                            onCloseClick={() => setSelectedPoint(null)}
                        >
                            <div style={{ padding: '4px', maxWidth: '250px' }}>
                                <div style={{ 
                                    fontSize: '0.7rem', 
                                    fontWeight: '900', 
                                    color: selectedPoint.channel === 'b2b' ? '#065F46' : '#991B1B', 
                                    backgroundColor: selectedPoint.channel === 'b2b' ? '#D1FAE5' : '#FEE2E2',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.05em', 
                                    marginBottom: '6px', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px' 
                                }}>
                                    <AlertCircle size={11} /> 
                                    {selectedPoint.channel === 'b2b' ? '🟢 Rechazo B2B HORECA' : '🔴 Rechazo B2C Hogares'}
                                </div>
                                <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0F172A' }}>
                                    {selectedPoint.municipality || 'Fuera de Cobertura'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>
                                    📍 {selectedPoint.address}
                                </div>
                                {selectedPoint.customer_name && (
                                    <div style={{ fontSize: '0.72rem', color: '#1E293B', marginTop: '6px', fontWeight: '700', borderTop: '1px solid #E2E8F0', paddingTop: '4px' }}>
                                        👤 {selectedPoint.customer_name}
                                        {selectedPoint.customer_phone && <div style={{ color: '#0D7A57', fontWeight: '600' }}>📱 WA: {selectedPoint.customer_phone}</div>}
                                    </div>
                                )}
                            </div>
                        </InfoWindow>
                    )}
                </Map>

                {editMode && (
                    <div style={{ 
                        position: 'absolute', 
                        top: '20px', 
                        left: '20px', 
                        zIndex: 1, 
                        backgroundColor: 'rgba(255,255,255,0.96)', 
                        padding: '1.25rem', 
                        borderRadius: THEME.radius.lg, 
                        boxShadow: THEME.shadow.lg, 
                        backdropFilter: 'blur(6px)', 
                        width: '280px',
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', fontWeight: '800', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Modo Edición: <span style={{ color: editMode === 'b2c' ? '#EF4444' : THEME.colors.primary }}>{editMode === 'b2c' ? 'Hogares (B2C)' : 'HORECA (B2B)'}</span>
                        </p>
                        <p style={{ margin: '0 0 15px 0', fontSize: '0.75rem', color: THEME.colors.textSecondary, lineHeight: '1.4' }}>Arrastra los puntos o haz clic en las líneas para ajustar la zona de cobertura.</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <button 
                                onClick={async () => { 
                                    const success = await onSave(editMode === 'b2c' ? 'geofence_b2c_poly' : 'geofence_b2b_poly', JSON.stringify(tempPoly)); 
                                    if (success) setEditMode(null); 
                                }} 
                                disabled={saving} 
                                style={{ 
                                    padding: '0.65rem', 
                                    borderRadius: THEME.radius.sm, 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '700', 
                                    cursor: 'pointer', 
                                    opacity: saving ? 0.7 : 1,
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    transition: 'background-color 0.2s',
                                    boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)'
                                }}
                                onMouseOver={e => { if (!saving) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                                onMouseOut={e => { if (!saving) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                            >
                                <Save size={14} strokeWidth={1.5} />
                                <span>{saving ? 'Guardando...' : 'Guardar Zona'}</span>
                            </button>
                            <button 
                                onClick={clearVertices} 
                                style={{ 
                                    padding: '0.65rem', 
                                    borderRadius: THEME.radius.sm, 
                                    backgroundColor: THEME.colors.primaryLight, 
                                    color: THEME.colors.primary, 
                                    border: 'none', 
                                    fontWeight: '700', 
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px'
                                }}
                            >
                                <Trash2 size={14} strokeWidth={1.5} />
                                <span>Limpiar Puntos</span>
                            </button>
                            <button 
                                onClick={() => setEditMode(null)} 
                                style={{ 
                                    padding: '0.65rem', 
                                    borderRadius: THEME.radius.sm, 
                                    backgroundColor: 'white', 
                                    border: `1px solid ${THEME.colors.borderActive}`, 
                                    color: THEME.colors.textSecondary, 
                                    fontWeight: '700', 
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.textMain; e.currentTarget.style.color = THEME.colors.textMain; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.borderActive; e.currentTarget.style.color = THEME.colors.textSecondary; }}
                            >
                                Cancelar Edición
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontWeight: '900', color: THEME.colors.textMain, margin: 0, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Control de Cobertura</h3>
                
                {/* B2C Coverage Card */}
                <div style={{ 
                    padding: '1rem', 
                    borderRadius: THEME.radius.lg, 
                    border: editMode === 'b2c' ? '2px solid #EF4444' : `1px solid ${THEME.colors.border}`, 
                    backgroundColor: THEME.colors.surface,
                    boxShadow: THEME.shadow.sm 
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', fontSize: '0.88rem', color: THEME.colors.textMain }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#EF4444' }} />
                            <span>B2C (Hogares)</span>
                        </span>
                        <button 
                            onClick={() => setVisibleB2C(!visibleB2C)} 
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px', transition: 'background-color 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryLight}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            {visibleB2C ? <Eye size={16} strokeWidth={1.5} /> : <EyeOff size={16} strokeWidth={1.5} />}
                        </button>
                    </div>
                    {canEdit && !editMode && (
                        <button 
                            onClick={() => startEditing('b2c')} 
                            style={{ 
                                width: '100%', 
                                padding: '0.55rem', 
                                borderRadius: THEME.radius.sm, 
                                border: '1px solid #EF4444', 
                                backgroundColor: 'white', 
                                color: '#EF4444', 
                                fontWeight: '700', 
                                cursor: 'pointer', 
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#FEF2F2'; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}
                        >
                            <Edit2 size={14} strokeWidth={1.5} />
                            <span>Editar Polígono</span>
                        </button>
                    )}
                </div>

                {/* B2B Coverage Card */}
                <div style={{ 
                    padding: '1rem', 
                    borderRadius: THEME.radius.lg, 
                    border: editMode === 'b2b' ? `2px solid ${THEME.colors.primary}` : `1px solid ${THEME.colors.border}`, 
                    backgroundColor: THEME.colors.surface,
                    boxShadow: THEME.shadow.sm
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', fontSize: '0.88rem', color: THEME.colors.textMain }}>
                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                            <span>B2B (HORECA)</span>
                        </span>
                        <button 
                            onClick={() => setVisibleB2B(!visibleB2B)} 
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px', transition: 'background-color 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryLight}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            {visibleB2B ? <Eye size={16} strokeWidth={1.5} /> : <EyeOff size={16} strokeWidth={1.5} />}
                        </button>
                    </div>
                    {canEdit && !editMode && (
                        <button 
                            onClick={() => startEditing('b2b')} 
                            style={{ 
                                width: '100%', 
                                padding: '0.55rem', 
                                borderRadius: THEME.radius.sm, 
                                border: `1px solid ${THEME.colors.primary}`, 
                                backgroundColor: 'white', 
                                color: THEME.colors.primary, 
                                fontWeight: '700', 
                                cursor: 'pointer', 
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}
                        >
                            <Edit2 size={14} strokeWidth={1.5} />
                            <span>Editar Polígono</span>
                        </button>
                    )}
                </div>

                {/* Demandas Rechazadas Card (Sleek & Minimal) */}
                <div style={{ 
                    padding: '1rem', 
                    borderRadius: THEME.radius.lg, 
                    border: `1px solid ${THEME.colors.border}`, 
                    backgroundColor: THEME.colors.surface,
                    boxShadow: THEME.shadow.sm
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '800', fontSize: '0.88rem', color: THEME.colors.textMain }}>
                            <MapPin size={16} color={THEME.colors.primary} />
                            <span>Mapa de Demandas (Rechazos)</span>
                        </span>
                        <button 
                            onClick={() => setVisibleOutOfBounds(!visibleOutOfBounds)} 
                            style={{ border: 'none', background: 'none', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '4px', transition: 'background-color 0.2s' }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            title={visibleOutOfBounds ? 'Ocultar mapa de calor' : 'Mostrar mapa de calor'}
                        >
                            {visibleOutOfBounds ? <Eye size={16} strokeWidth={1.5} /> : <EyeOff size={16} strokeWidth={1.5} />}
                        </button>
                    </div>

                    <div style={{ fontSize: '0.76rem', color: THEME.colors.textSecondary, lineHeight: '1.4', marginTop: '2px' }}>
                        Ubicaciones fuera de la geocerca capturadas en B2C (Hogares) y B2B (HORECA).
                    </div>

                    <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {/* Card B2C Rechazos */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: '0.6rem 0.85rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Home size={14} color="#DC2626" />
                                <span>Hogares (B2C)</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#DC2626', backgroundColor: '#FEE2E2', padding: '2px 9px', borderRadius: '10px', border: '1px solid #FECACA' }}>
                                <span>{validOutOfBoundsPoints.filter(p => p.channel !== 'b2b').length} Rechazos</span>
                            </div>
                        </div>

                        {/* Card B2B Rechazos */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'white', padding: '0.6rem 0.85rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Building2 size={14} color="#2563EB" />
                                <span>HORECA (B2B)</span>
                            </div>
                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#2563EB', backgroundColor: '#DBEAFE', padding: '2px 9px', borderRadius: '10px', border: '1px solid #BFDBFE' }}>
                                <span>{validOutOfBoundsPoints.filter(p => p.channel === 'b2b').length} Rechazos</span>
                            </div>
                        </div>

                        <button 
                            onClick={() => setIsTableModalOpen(true)}
                            style={{ 
                                marginTop: '6px',
                                width: '100%',
                                padding: '0.65rem',
                                borderRadius: THEME.radius.sm,
                                backgroundColor: THEME.colors.primary,
                                color: 'white',
                                border: 'none',
                                fontWeight: '700',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                boxShadow: THEME.shadow.sm,
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <ListFilter size={15} />
                            <span>Ver Tabla de Rechazos ({validOutOfBoundsPoints.length})</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* MODAL AUDITORÍA Y TABLA DE DEMANDAS RECHAZADAS (Frufresco Theme) */}
            {isTableModalOpen && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 30, 0.75)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1.5rem'
                }}>
                    <div style={{
                        backgroundColor: THEME.colors.surface,
                        borderRadius: THEME.radius.xl,
                        width: '100%',
                        maxWidth: '1080px',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                        border: `1px solid ${THEME.colors.border}`
                    }}>
                        {/* Modal Header */}
                        <div style={{
                            padding: '1.1rem 1.5rem',
                            borderBottom: `1px solid ${THEME.colors.border}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: '#FAFAFA'
                        }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '10px', fontFamily: THEME.typography?.fontFamilyMain }}>
                                    <div style={{ width: '30px', height: '30px', borderRadius: '8px', backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ListFilter size={17} color={THEME.colors.primary} />
                                    </div>
                                    Auditoría de Demandas Rechazadas fuera de Cobertura
                                </h3>
                                <p style={{ margin: '3px 0 0 40px', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                                    Registro de clientes e instituciones que cotizaron o pidieron fuera de las geocercas activas
                                </p>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <button 
                                    onClick={exportToExcel}
                                    style={{
                                        padding: '0.45rem 0.9rem',
                                        borderRadius: THEME.radius.sm,
                                        border: `1px solid ${THEME.colors.primary}`,
                                        backgroundColor: THEME.colors.primaryLight,
                                        color: THEME.colors.primary,
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#D1E0D9'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryLight}
                                    title="Exportar datos filtrados a libro de Microsoft Excel (.xlsx)"
                                >
                                    <Download size={14} />
                                    <span>Exportar a Excel</span>
                                </button>
                                <button 
                                    onClick={() => setIsTableModalOpen(false)}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%', color: THEME.colors.textSecondary, transition: 'all 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Controls: Search & Tabs */}
                        <div style={{ padding: '0.85rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', gap: '1rem', alignItems: 'center', backgroundColor: 'white' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <Search size={15} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                <input 
                                    type="text" 
                                    placeholder="Buscar cliente, municipio o dirección..." 
                                    value={modalSearch}
                                    onChange={e => setModalSearch(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.55rem 0.75rem 0.55rem 2.3rem',
                                        borderRadius: THEME.radius.md,
                                        border: `1px solid ${THEME.colors.border}`,
                                        fontSize: '0.84rem',
                                        outline: 'none',
                                        fontFamily: THEME.typography?.fontFamilySecondary
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '4px', backgroundColor: THEME.colors.background, padding: '4px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <button 
                                    onClick={() => setModalFilter('all')}
                                    style={{
                                        padding: '0.4rem 0.85rem',
                                        borderRadius: THEME.radius.sm,
                                        border: 'none',
                                        backgroundColor: modalFilter === 'all' ? 'white' : 'transparent',
                                        color: modalFilter === 'all' ? THEME.colors.textMain : THEME.colors.textSecondary,
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        boxShadow: modalFilter === 'all' ? THEME.shadow.sm : 'none'
                                    }}
                                >
                                    Todos ({validOutOfBoundsPoints.length})
                                </button>
                                <button 
                                    onClick={() => setModalFilter('b2c')}
                                    style={{
                                        padding: '0.4rem 0.85rem',
                                        borderRadius: THEME.radius.sm,
                                        border: 'none',
                                        backgroundColor: modalFilter === 'b2c' ? '#FEF2F2' : 'transparent',
                                        color: modalFilter === 'b2c' ? '#DC2626' : THEME.colors.textSecondary,
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <Home size={13} color="#DC2626" />
                                    <span>Hogares ({validOutOfBoundsPoints.filter(p => p.channel !== 'b2b').length})</span>
                                </button>
                                <button 
                                    onClick={() => setModalFilter('b2b')}
                                    style={{
                                        padding: '0.4rem 0.85rem',
                                        borderRadius: THEME.radius.sm,
                                        border: 'none',
                                        backgroundColor: modalFilter === 'b2b' ? '#EFF6FF' : 'transparent',
                                        color: modalFilter === 'b2b' ? '#2563EB' : THEME.colors.textSecondary,
                                        fontWeight: '700',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <Building2 size={13} color="#2563EB" />
                                    <span>HORECA ({validOutOfBoundsPoints.filter(p => p.channel === 'b2b').length})</span>
                                </button>
                            </div>
                        </div>

                        {/* Modal Table Content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem 1.5rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: `2px solid ${THEME.colors.border}` }}>
                                        <th style={{ padding: '0.65rem 0.75rem', width: '115px', whiteSpace: 'nowrap', ...THEME.typography.tableHeader }}>Fecha</th>
                                        <th style={{ padding: '0.65rem 0.75rem', width: '110px', whiteSpace: 'nowrap', ...THEME.typography.tableHeader }}>Canal</th>
                                        <th style={{ padding: '0.65rem 0.75rem', ...THEME.typography.tableHeader }}>Cliente / Establecimiento</th>
                                        <th style={{ padding: '0.65rem 0.75rem', ...THEME.typography.tableHeader }}>Municipio / Detalle</th>
                                        <th style={{ padding: '0.65rem 0.75rem', ...THEME.typography.tableHeader }}>Dirección Solicitada</th>
                                        <th style={{ padding: '0.65rem 0.75rem', width: '100px', textAlign: 'right', ...THEME.typography.tableHeader }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {validOutOfBoundsPoints
                                        .filter(pt => {
                                            if (modalFilter === 'b2c' && pt.channel === 'b2b') return false;
                                            if (modalFilter === 'b2b' && pt.channel !== 'b2b') return false;
                                            if (modalSearch.trim()) {
                                                const q = modalSearch.toLowerCase();
                                                const text = `${pt.customer_name} ${pt.municipality} ${pt.address} ${pt.customer_phone}`.toLowerCase();
                                                return text.includes(q);
                                            }
                                            return true;
                                        })
                                        .map((pt, idx) => {
                                            const isB2B = pt.channel === 'b2b';
                                            const d = pt.created_at ? new Date(pt.created_at) : null;
                                            const compactDate = d 
                                                ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
                                                : 'Hoy';
                                            return (
                                                <tr key={pt.id || idx} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }}>
                                                    <td style={{ padding: '0.75rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', fontSize: '0.76rem', fontWeight: '600' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            <Calendar size={12} color="#64748B" />
                                                            {compactDate}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            padding: '3px 8px',
                                                            borderRadius: '10px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: '800',
                                                            backgroundColor: isB2B ? '#EFF6FF' : '#FEF2F2',
                                                            color: isB2B ? '#2563EB' : '#DC2626',
                                                            border: isB2B ? '1px solid #BFDBFE' : '1px solid #FECACA',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}>
                                                            {isB2B ? <Building2 size={11} /> : <Home size={11} />}
                                                            {isB2B ? 'HORECA B2B' : 'Hogar B2C'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                        {pt.customer_name || 'Anónimo'}
                                                        {pt.customer_phone && <div style={{ fontSize: '0.73rem', color: THEME.colors.primary, fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}><Phone size={10} /> {pt.customer_phone}</div>}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', color: THEME.colors.textMain, fontWeight: '600', fontSize: '0.8rem' }}>
                                                        {pt.municipality || 'Fuera de zona'}
                                                    </td>
                                                    <td style={{ padding: '0.75rem', color: THEME.colors.textSecondary, fontSize: '0.78rem' }}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><MapPin size={11} /> {pt.address}</span>
                                                    </td>
                                                    <td style={{ padding: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        <button 
                                                            onClick={() => focusPointOnMap(pt)}
                                                            style={{
                                                                padding: '0.35rem 0.75rem',
                                                                borderRadius: THEME.radius.sm,
                                                                border: `1px solid ${THEME.colors.primary}`,
                                                                backgroundColor: 'white',
                                                                color: THEME.colors.primary,
                                                                fontWeight: '700',
                                                                fontSize: '0.76rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                whiteSpace: 'nowrap',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                                                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'white'; }}
                                                        >
                                                            <MapPin size={12} />
                                                            <span>Centrar</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
