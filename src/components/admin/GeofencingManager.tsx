'use client';

import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, useCallback, useRef } from 'react';
import { Map, Marker, useMapsLibrary, MapMouseEvent, useMap } from '@vis.gl/react-google-maps';

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
    onSave: (key: string, poly: string) => void;
    saving: boolean;
    canEdit: boolean;
}

// --- Polygon Wrapper Component ---
interface PolygonProps extends google.maps.PolygonOptions {
    paths: Point[];
    onPathChange?: (newPath: Point[]) => void;
}

const Polygon = forwardRef((props: PolygonProps, ref) => {
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

    // Options update
    useEffect(() => {
        if (!polygon) return;
        polygon.setOptions(options);
    }, [polygon, options]);

    // Sync from Google Maps -> React state
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
            }, 150); // Debounce to allow smooth dragging
        };

        const path = polygon.getPath();
        const listeners = [
            path.addListener('set_at', syncPath),
            path.addListener('insert_at', syncPath),
            path.addListener('remove_at', syncPath),
            // Support deleting vertices with right click
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

    useEffect(() => {
        if (!polygon || !map) return;
        polygon.setMap(map);
        return () => polygon.setMap(null);
    }, [polygon, map]);

    return null;
});

Polygon.displayName = 'Polygon';

export default function GeofencingManager({ settings, onSave, saving, canEdit }: GeofencingManagerProps) {
    const [editMode, setEditMode] = useState<'b2c' | 'b2b' | null>(null);
    const [tempPoly, setTempPoly] = useState<Point[]>([]);
    const [visibleB2C, setVisibleB2C] = useState(true);
    const [visibleB2B, setVisibleB2B] = useState(true);

    const b2cPolyString = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
    const b2bPolyString = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
    
    const b2cPoly: Point[] = useMemo(() => {
        try { return b2cPolyString ? JSON.parse(b2cPolyString) : []; } catch { return []; }
    }, [b2cPolyString]);

    const b2bPoly: Point[] = useMemo(() => {
        try { return b2bPolyString ? JSON.parse(b2bPolyString) : []; } catch { return []; }
    }, [b2bPolyString]);

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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
            <div style={{ position: 'relative', height: '600px', borderRadius: '24px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                <Map
                    style={{ width: '100%', height: '100%' }}
                    defaultCenter={{ lat: 4.6097, lng: -74.0817 }}
                    defaultZoom={11}
                    gestureHandling={'greedy'}
                    disableDefaultUI={false}
                    onClick={handleMapClick}
                >
                    <Polygon 
                        paths={editMode === 'b2c' ? tempPoly : b2cPoly} 
                        onPathChange={editMode === 'b2c' ? handlePathChange : undefined}
                        visible={visibleB2C}
                        editable={editMode === 'b2c'}
                        draggable={editMode === 'b2c'}
                        fillColor="#EF4444"
                        fillOpacity={0.3}
                        strokeColor="#EF4444"
                        strokeWeight={2}
                    />

                    <Polygon 
                        paths={editMode === 'b2b' ? tempPoly : b2bPoly} 
                        onPathChange={editMode === 'b2b' ? handlePathChange : undefined}
                        visible={visibleB2B}
                        editable={editMode === 'b2b'}
                        draggable={editMode === 'b2b'}
                        fillColor="#7C3AED"
                        fillOpacity={0.3}
                        strokeColor="#7C3AED"
                        strokeWeight={2}
                    />

                    {/* Markers only for fresh drawing (less than 3 points) */}
                    {editMode && tempPoly.length < 3 && tempPoly.map((p, i) => (
                        <Marker key={`edit-${i}`} position={p} label={(i + 1).toString()} />
                    ))}
                </Map>

                {editMode && (
                    <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1, backgroundColor: 'rgba(255,255,255,0.9)', padding: '1rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)', width: '280px' }}>
                        <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: '900' }}>Modo Edición: <span style={{ color: '#0EA5E9' }}>{editMode === 'b2c' ? 'HOGARES' : 'HORECA'}</span></p>
                        <p style={{ margin: '0 0 15px 0', fontSize: '0.75rem', color: '#64748B' }}>Arrastra los puntos o haz clic en las líneas para ajustar la zona.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button 
                                onClick={async () => { 
                                    const success = await onSave(editMode === 'b2c' ? 'geofence_b2c_poly' : 'geofence_b2b_poly', JSON.stringify(tempPoly)); 
                                    if (success) setEditMode(null); 
                                }} 
                                disabled={saving} 
                                style={{ padding: '0.7rem', borderRadius: '8px', backgroundColor: '#0EA5E9', color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                            >
                                {saving ? 'Guardando...' : '💾 Guardar'}
                            </button>
                            <button onClick={clearVertices} style={{ padding: '0.7rem', borderRadius: '8px', backgroundColor: '#F1F5F9', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                🗑️ Limpiar
                            </button>
                            <button onClick={() => setEditMode(null)} style={{ gridColumn: 'span 2', padding: '0.7rem', borderRadius: '8px', backgroundColor: '#F1F5F9', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                Salir del Editor
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ fontWeight: '900', color: '#0F172A', margin: 0 }}>Control de Cobertura</h3>
                
                <div style={{ padding: '1.5rem', borderRadius: '16px', border: editMode === 'b2c' ? '2px solid #EF4444' : '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>🔴 B2C (Hogares)</span>
                        <button onClick={() => setVisibleB2C(!visibleB2C)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>{visibleB2C ? '👁️' : '👁️‍G'}</button>
                    </div>
                    {canEdit && !editMode && (
                        <button onClick={() => startEditing('b2c')} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #EF4444', backgroundColor: 'white', color: '#EF4444', fontWeight: '900', cursor: 'pointer' }}>
                            ✏️ Editar Polígono
                        </button>
                    )}
                </div>

                <div style={{ padding: '1.5rem', borderRadius: '16px', border: editMode === 'b2b' ? '2px solid #7C3AED' : '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                        <span style={{ fontWeight: '800', fontSize: '0.9rem' }}>🟣 B2B (HORECA)</span>
                        <button onClick={() => setVisibleB2B(!visibleB2B)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>{visibleB2B ? '👁️' : '👁️‍G'}</button>
                    </div>
                    {canEdit && !editMode && (
                        <button onClick={() => startEditing('b2b')} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #7C3AED', backgroundColor: 'white', color: '#7C3AED', fontWeight: '900', cursor: 'pointer' }}>
                            ✏️ Editar Polígono
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
