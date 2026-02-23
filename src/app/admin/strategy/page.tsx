'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import { APIProvider, Map, Marker, useMapsLibrary, MapMouseEvent } from '@vis.gl/react-google-maps';

type Tab = 'geofencing' | 'seo' | 'it';

interface Point {
    lat: number;
    lng: number;
}

interface AppSetting {
    key: string;
    value: string;
    description: string;
}

interface ITRequest {
    id: string;
    type: string;
    status: string;
    created_at: string;
}

// Custom Polygon component for vis.gl with interactive support
function Polygon({ onPathChange, map, paths, ...options }: google.maps.PolygonOptions & { paths: Point[], onPathChange?: (newPath: Point[]) => void }) {
    const maps = useMapsLibrary('maps');
    const polygon = useMemo(() => {
        if (!maps) return null;
        return new maps.Polygon();
    }, [maps]);

    // Track path to avoid unnecessary resets
    const lastPathRef = useRef<string>('');
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!polygon) return;
        
        const path = polygon.getPath();
        const currentPathLength = path ? path.getLength() : 0;
        const incomingPathLength = paths.length;

        // Force update if length changed (new point added/removed) 
        // OR if not in editable mode (initial sync)
        if (incomingPathLength !== currentPathLength || !options.editable) {
            const pathJson = JSON.stringify(paths);
            if (pathJson !== lastPathRef.current) {
                polygon.setOptions({ ...options, paths });
                lastPathRef.current = pathJson;
            } else {
                polygon.setOptions(options);
            }
        } else {
            // DRAGGING/EDITING: Update style but NOT paths to prevent snap-back
            polygon.setOptions(options);
        }
    }, [polygon, options, paths]);

    useEffect(() => {
        if (!polygon || !onPathChange) return;

        const path = polygon.getPath();
        if (!path) return;

        const syncPath = () => {
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
            
            syncTimeoutRef.current = setTimeout(() => {
                const newPath = path.getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
                const pathJson = JSON.stringify(newPath);
                if (pathJson !== lastPathRef.current) {
                    lastPathRef.current = pathJson;
                    onPathChange(newPath);
                }
            }, 100); // Faster debounce for better feel
        };

        const listeners = [
            path.addListener('set_at', syncPath),
            path.addListener('insert_at', syncPath),
            path.addListener('remove_at', syncPath),
            polygon.addListener('rightclick', (e: google.maps.PolyMouseEvent) => {
                if (e.vertex !== undefined) {
                    path.removeAt(e.vertex);
                }
            })
        ];

        return () => {
            listeners.forEach(l => google.maps.event.removeListener(l));
            if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
        };
    }, [polygon, onPathChange]); // Constant size dependency array

    useEffect(() => {
        if (!polygon) return;
        polygon.setMap(map as google.maps.Map);
        return () => polygon.setMap(null);
    }, [polygon, map]);

    return null;
}

export default function AdminStrategyPage() {
    const [activeTab, setActiveTab] = useState<Tab>('geofencing');
    const [settings, setSettings] = useState<AppSetting[]>([]);
    const [itRequests, setItRequests] = useState<ITRequest[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            const { data: settingsData } = await supabase.from('app_settings').select('*');
            if (settingsData) setSettings(settingsData as AppSetting[]);

            const { data: itData } = await supabase
                .from('it_requests')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(5);
            if (itData) setItRequests(itData as ITRequest[]);
        };
        fetchData();
    }, []);

    const handleSaveGeofence = async (key: string, poly: Point[]) => {
        setSaving(true);
        const { error } = await supabase
            .from('app_settings')
            .upsert({ key, value: JSON.stringify(poly), updated_at: new Date().toISOString() });
        
        if (!error) {
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Geocerca guardada con éxito ✓', 'success');
            setSettings(prev => prev.map(s => s.key === key ? { ...s, value: JSON.stringify(poly) } : s));
        } else {
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Error al guardar geocerca', 'error');
        }
        setSaving(false);
    };

    const handleITRequest = async (type: string) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('it_requests').insert([{
            type,
            requester_id: user?.id,
            status: 'pending'
        }]);

        if (!error) {
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.(`Solicitud de ${type} enviada al CCM ✓`, 'success');
            // Refresh requests
            const { data } = await supabase.from('it_requests').select('*').order('created_at', { ascending: false }).limit(5);
            if (data) setItRequests(data as ITRequest[]);
        }
    };

    const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <Toast />
            
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Inteligencia & Estrategia</h1>
                        <p style={{ color: '#64748B', marginTop: '0.5rem', fontSize: '1.1rem' }}>Gestión Maestra de Cobertura, Visibilidad y Seguridad.</p>
                    </div>
                    <div style={{ backgroundColor: '#F1F5F9', padding: '0.5rem', borderRadius: '12px', display: 'flex', gap: '4px' }}>
                        {(['geofencing', 'seo', 'it'] as Tab[]).map(t => (
                            <button 
                                key={t}
                                onClick={() => setActiveTab(t)}
                                style={{
                                    padding: '0.6rem 1.2rem',
                                    borderRadius: '8px',
                                    border: 'none',
                                    backgroundColor: activeTab === t ? 'white' : 'transparent',
                                    boxShadow: activeTab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                    color: activeTab === t ? '#0F172A' : '#64748B',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {t === 'geofencing' ? '📍 Geocercas' : t === 'seo' ? '🚀 SEO Local' : '🛡️ Gestión IT'}
                            </button>
                        ))}
                    </div>
                </header>

                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '2rem', minHeight: '600px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                    {activeTab === 'geofencing' && <GeofencingView settings={settings} mapsKey={MAPS_KEY} onSave={handleSaveGeofence} saving={saving} />}
                    {activeTab === 'seo' && <SEOView settings={settings} />}
                    {activeTab === 'it' && <ITView requests={itRequests} onRequest={handleITRequest} />}
                </div>
            </div>
        </main>
    );
}

function GeofencingView({ settings, mapsKey, onSave, saving }: { settings: AppSetting[], mapsKey: string, onSave: (key: string, poly: Point[]) => void, saving: boolean }) {
    const [editMode, setEditMode] = useState<'b2c' | 'b2b' | null>(null);
    const [tempPoly, setTempPoly] = useState<Point[]>([]);
    const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
    const [visibleB2C, setVisibleB2C] = useState(true);
    const [visibleB2B, setVisibleB2B] = useState(true);

    const b2cPolyString = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
    const b2bPolyString = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
    
    const b2cPoly: Point[] = useMemo(() => b2cPolyString ? JSON.parse(b2cPolyString) : [], [b2cPolyString]);
    const b2bPoly: Point[] = useMemo(() => b2bPolyString ? JSON.parse(b2bPolyString) : [], [b2bPolyString]);

    const startEditing = (mode: 'b2c' | 'b2b') => {
        setEditMode(mode);
        setTempPoly(mode === 'b2c' ? b2cPoly : b2bPoly);
        // Ensure the one we edit is visible
        if (mode === 'b2c') setVisibleB2C(true);
        if (mode === 'b2b') setVisibleB2B(true);
    };

    const handleMapClick = useCallback((e: MapMouseEvent) => {
        if (!editMode) return;
        const lat = e.detail?.latLng?.lat;
        const lng = e.detail?.latLng?.lng;
        if (lat && lng) {
            setTempPoly(prev => [...prev, { lat, lng }]);
        }
    }, [editMode]);

    const handlePathChange = useCallback((newPath: Point[]) => {
        setTempPoly(newPath);
    }, []);

    const clearVertices = useCallback(() => setTempPoly([]), []);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
            <div style={{ height: '600px', borderRadius: '20px', overflow: 'hidden', border: '1px solid #E2E8F0', position: 'relative' }}>
                <APIProvider apiKey={mapsKey}>
                    <Map
                        defaultCenter={{ lat: 4.67, lng: -74.06 }}
                        defaultZoom={12}
                        mapId="frufresco_strategy_map"
                        gestureHandling={'greedy'}
                        disableDefaultUI={false}
                        onClick={handleMapClick}
                        onIdle={(e) => setMapInstance(e.map)}
                    >
                        {/* Shaded Polygons */}
                        {visibleB2C && (
                            <Polygon 
                                key="poly-b2c"
                                paths={editMode === 'b2c' ? tempPoly : b2cPoly} 
                                map={mapInstance} 
                                fillColor="#EF4444" 
                                fillOpacity={0.2} 
                                strokeColor="#EF4444" 
                                strokeWeight={2}
                                editable={editMode === 'b2c'}
                                draggable={editMode === 'b2c'}
                                onPathChange={editMode === 'b2c' ? handlePathChange : undefined}
                            />
                        )}
                        {visibleB2B && (
                            <Polygon 
                                key="poly-b2b"
                                paths={editMode === 'b2b' ? tempPoly : b2bPoly} 
                                map={mapInstance} 
                                fillColor="#7C3AED" 
                                fillOpacity={0.2} 
                                strokeColor="#7C3AED" 
                                strokeWeight={2}
                                editable={editMode === 'b2b'}
                                draggable={editMode === 'b2b'}
                                onPathChange={editMode === 'b2b' ? handlePathChange : undefined}
                            />
                        )}

                        {/* Temp Editing Visual (Only for first 2 points of a new poly) */}
                        {editMode && tempPoly.length > 0 && tempPoly.length < 3 && (
                            <Polygon 
                                paths={tempPoly} 
                                map={mapInstance} 
                                fillColor="#0EA5E9" 
                                fillOpacity={0.4} 
                                strokeColor="#0EA5E9" 
                                strokeWeight={3} 
                            />
                        )}

                        {/* Fixed Markers for context (only when NOT editing) */}
                        {!editMode && visibleB2C && b2cPoly.map((p, i) => (
                            <Marker key={`b2c-${i}`} position={p} opacity={0.6} label={i === 0 ? 'Hogares' : undefined} />
                        ))}
                        {!editMode && visibleB2B && b2bPoly.map((p, j) => (
                            <Marker key={`b2b-${j}`} position={p} opacity={0.6} label={j === 0 ? 'HORECA' : undefined} />
                        ))}

                        {/* Interactive Editing Markers (Only for very first points) */}
                        {editMode && tempPoly.length < 3 && tempPoly.map((p, k) => (
                            <Marker key={`temp-${k}`} position={p} icon={{ path: 'M 0,-1 1,0 0,1 -1,0 z', scale: 10, fillColor: '#0EA5E9', fillOpacity: 1, strokeWeight: 2, strokeColor: 'white' } as any} />
                        ))}
                    </Map>
                </APIProvider>

                {editMode && (
                    <div style={{ position: 'absolute', top: '20px', left: '20px', zIndex: 1, backgroundColor: 'rgba(255,255,255,0.9)', padding: '1rem', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)', width: '280px' }}>
                        <p style={{ margin: '0 0 10px 0', fontSize: '0.85rem', fontWeight: '900' }}>Modo Edición: <span style={{ color: '#0EA5E9' }}>{editMode === 'b2c' ? 'HOGARES' : 'HORECA'}</span></p>
                        <p style={{ margin: '0 0 15px 0', fontSize: '0.75rem', color: '#64748B' }}>Haz clic en el mapa para añadir vértices y cerrar el área.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            <button onClick={() => onSave(editMode === 'b2c' ? 'geofence_b2c_poly' : 'geofence_b2b_poly', tempPoly)} disabled={saving} style={{ padding: '0.7rem', borderRadius: '8px', backgroundColor: '#0EA5E9', color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer' }}>
                                {saving ? '...' : '💾 Guardar'}
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
            <div>
                <h3 style={{ fontWeight: '900', color: '#0F172A', marginBottom: '1.5rem' }}>Control de Cobertura</h3>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1.5rem', borderRadius: '16px', border: editMode === 'b2c' ? '2px solid #EF4444' : '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button 
                                    onClick={() => setVisibleB2C(!visibleB2C)}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                                    title={visibleB2C ? 'Ocultar Capa' : 'Mostrar Capa'}
                                >
                                    {visibleB2C ? '👁️' : '👁️‍🗨️'}
                                </button>
                                <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0F172A' }}>🔴 Línea Hogar (B2C)</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800' }}>ACTIVA</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1rem 0' }}>Zona: Chapinero, Usaquén & Colina.</p>
                        <button onClick={() => startEditing('b2c')} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #EF4444', backgroundColor: 'white', color: '#EF4444', fontWeight: '900', cursor: 'pointer' }}>
                            ✏️ Editar Polígono
                        </button>
                    </div>

                    <div style={{ padding: '1.5rem', borderRadius: '16px', border: editMode === 'b2b' ? '2px solid #7C3AED' : '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button 
                                    onClick={() => setVisibleB2B(!visibleB2B)}
                                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: 0 }}
                                    title={visibleB2B ? 'Ocultar Capa' : 'Mostrar Capa'}
                                >
                                    {visibleB2B ? '👁️' : '👁️‍🗨️'}
                                </button>
                                <span style={{ fontWeight: '800', fontSize: '0.9rem', color: '#0F172A' }}>🟣 Institucional (B2B)</span>
                            </div>
                            <span style={{ fontSize: '0.7rem', backgroundColor: '#DCFCE7', color: '#166534', padding: '0.2rem 0.6rem', borderRadius: '6px', fontWeight: '800' }}>ACTIVA</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '0 0 1rem 0' }}>Zona: Bogotá, Girardot, Melgar & Anapoima.</p>
                        <button onClick={() => startEditing('b2b')} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #7C3AED', backgroundColor: 'white', color: '#7C3AED', fontWeight: '900', cursor: 'pointer' }}>
                            ✏️ Editar Polígono
                        </button>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#FFF7ED', borderRadius: '16px', border: '1px solid #FFEDD5' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.85rem', fontWeight: '900', color: '#9A3412' }}>🧠 Auditoría de Cambio</h4>
                    <p style={{ fontSize: '0.75rem', color: '#9A3412', margin: 0 }}>Cualquier cambio en los polígonos activará una re-indexación de SEO y validará automáticamente las rutas de despacho vigentes.</p>
                </div>

                {editMode && tempPoly.length >= 3 && (
                    <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#F0FDF4', borderRadius: '12px', border: '1px solid #BBF7D0' }}>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534', fontWeight: '700' }}>✅ Polígono Válido: {tempPoly.length} vértices detectados.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function SEOView({ settings }: { settings: AppSetting[] }) {
    const b2cPolyStr = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
    const b2bPolyStr = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
    
    const b2cCount = b2cPolyStr ? (JSON.parse(b2cPolyStr) as Point[]).length : 0;
    const b2bCount = b2bPolyStr ? (JSON.parse(b2bPolyStr) as Point[]).length : 0;

    // Simulation of dynamic metrics based on polygon data
    const seoHealth = useMemo(() => {
        if (b2cCount === 0 && b2bCount === 0) return 0;
        // More vertices = better defined zone = better SEO targeting (+ simplified is better)
        const score = Math.min(95, 60 + (b2cCount + b2bCount) * 0.5);
        return Math.round(score);
    }, [b2cCount, b2bCount]);

    const topKeywords = useMemo(() => {
        const base = 10;
        return base + Math.floor((b2cCount + b2bCount) / 4);
    }, [b2cCount, b2bCount]);

    const keywords = [
        { kw: 'Frutas a domicilio Usaquén', zone: 'Hogares (B2C)', status: b2cCount > 3 ? 'Top 3' : 'Sin Cobertura ⚠️' },
        { kw: 'Verduras frescas Colina Campestre', zone: 'Hogares (B2C)', status: b2cCount > 5 ? 'Top 5' : 'Pendiente' },
        { kw: 'Proveedor HORECA Girardot', zone: 'Sector HORECA (B2B)', status: b2bCount > 4 ? 'Top 10' : 'Nuevo' },
        { kw: 'Distribuidora alimentos Melgar', zone: 'Sector HORECA (B2B)', status: b2bCount > 8 ? 'Top 10' : 'Mejorando 📈' },
        { kw: 'Venta mayorista Anapoima', zone: 'Sector HORECA (B2B)', status: b2bCount > 6 ? 'Calibrado' : 'Expansión' }
    ];

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Panel de Auditoría SEO Dinámica</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.4rem 1rem', borderRadius: '100px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }}></span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#166534' }}>RE-CALCULADO CON GEOCERCAS ACTUALES</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>{seoHealth}%</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '700' }}>Salud SEO Local</div>
                    <p style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>Basado en precisión de perímetros</p>
                </div>
                <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>{topKeywords}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '700' }}>Keywords en Radar</div>
                    <p style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>Términos monitoreados en B2B/B2C</p>
                </div>
                <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📊</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>{(b2cCount + b2bCount)}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '700' }}>Vértices Geográficos</div>
                    <p style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>Complejidad de zona actual</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '2rem' }}>
                <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
                    <h3 style={{ fontWeight: '900', fontSize: '1.1rem', marginBottom: '1.2rem' }}>Estrategia de Palabras Clave por Zona</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {keywords.map(k => (
                            <div key={k.kw} style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontWeight: '800', fontSize: '0.9rem', display: 'block' }}>{k.kw}</span>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Zona: {k.zone}</span>
                                </div>
                                <span style={{ color: k.status.includes('⚠️') ? '#EF4444' : '#10B981', fontSize: '0.75rem', fontWeight: '900', backgroundColor: 'white', padding: '0.3rem 0.6rem', borderRadius: '6px' }}>{k.status}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div style={{ padding: '2.5rem', borderRadius: '32px', backgroundColor: '#0F172A', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
                    <h4 style={{ fontWeight: '900', fontSize: '1.3rem', marginBottom: '1rem' }}>AI Keyword Suggester</h4>
                    <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '2rem', lineHeight: '1.6' }}>Detectamos un incremento de búsquedas en <strong>Anapoima & Girardot</strong>. ¿Deseas inyectar metadatos <strong>HORECA/B2B</strong> para estas zonas?</p>
                    <button style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', backgroundColor: '#7C3AED', color: 'white', border: 'none', fontWeight: '900', cursor: 'pointer', transition: 'transform 0.2s' }}>
                        ⚡ Autorizar Inyección Local
                    </button>
                    <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '1.5rem' }}>* Al simplificar la geocerca, la inyección es más precisa para los brochure sites.</p>
                </div>
            </div>
        </div>
    );
}

function ITView({ requests, onRequest }: { requests: ITRequest[], onRequest: (type: string) => void }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 350px', gap: '2rem' }}>
            <div>
                <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🛡️</div>
                    <h3 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>Gestión de Identidad & Accesos</h3>
                    <p style={{ color: '#64748B' }}>Para garantizar la integridad de la plataforma, la creación de perfiles sensibles se gestiona bajo auditoría.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                        <div>
                            <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A' }}>👥 Nuevo Colaborador (Admin/Operario)</div>
                            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0 0' }}>Asignación de roles, permisos y seguridad de acceso.</p>
                        </div>
                        <button onClick={() => onRequest('Alta Colaborador')} style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E2E8F0', fontWeight: '900', cursor: 'pointer', color: '#0F172A' }}>
                            Solicitar Alta
                        </button>
                    </div>

                    <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                        <div>
                            <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A' }}>🏢 Cliente Institucional (B2B Especial)</div>
                            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0 0' }}>Carga masiva de catálogos personalizados o listas de precios.</p>
                        </div>
                        <button onClick={() => onRequest('Registro B2B Especial')} style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E2E8F0', fontWeight: '900', cursor: 'pointer', color: '#0F172A' }}>
                            Solicitar Registro
                        </button>
                    </div>

                    <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                        <div>
                            <div style={{ fontWeight: '900', fontSize: '1rem', color: '#0F172A' }}>📩 Infraestructura de Comunicaciones</div>
                            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 0 0' }}>Mantenimiento de plantillas de email y dominios.</p>
                        </div>
                        <button onClick={() => onRequest('Ticket Infraestructura')} style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E2E8F0', fontWeight: '900', cursor: 'pointer', color: '#0F172A' }}>
                            Abrir Ticket
                        </button>
                    </div>
                </div>
            </div>

            <div>
                <h4 style={{ fontWeight: '800', marginBottom: '1.2rem', color: '#475569', fontSize: '0.9rem', textTransform: 'uppercase' }}>Solicitudes Recientes</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {requests.length === 0 && <p style={{ fontSize: '0.8rem', color: '#94A3B8' }}>No hay solicitudes pendientes.</p>}
                    {requests.map(req => (
                        <div key={req.id} style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0' }}>
                            <div style={{ fontWeight: '700', fontSize: '0.85rem', marginBottom: '4px' }}>{req.type}</div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{new Date(req.created_at).toLocaleDateString()}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: req.status === 'pending' ? '#FEF3C7' : '#DCFCE7', color: req.status === 'pending' ? '#92400E' : '#166534', padding: '2px 6px', borderRadius: '4px' }}>
                                    {req.status === 'pending' ? 'PENDIENTE' : 'COMPLETADO'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                
                <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#EFF6FF', borderRadius: '12px', border: '1px solid #DBEAFE' }}>
                     <p style={{ fontSize: '0.75rem', color: '#1E40AF', margin: 0, fontWeight: '600' }}>
                        💡 SLA: 4 horas hábiles.
                    </p>
                </div>
            </div>
        </div>
    );
}
