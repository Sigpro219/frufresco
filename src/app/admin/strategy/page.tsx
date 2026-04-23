'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import { useAuth } from '@/lib/authContext';
import GeofencingManager from '@/components/admin/GeofencingManager';
import { APIProvider } from '@vis.gl/react-google-maps';

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

interface SEOStrategy {
    id: string;
    zone_key: string;
    municipality_name: string;
    keywords: string[];
    meta_title: string;
    meta_description: string;
    last_generated_at: string;
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
    const { profile } = useAuth();
    const [settings, setSettings] = useState<AppSetting[]>([]);
    const [itRequests, setItRequests] = useState<ITRequest[]>([]);
    const [seoStrategies, setSeoStrategies] = useState<SEOStrategy[]>([]);
    const [saving, setSaving] = useState(false);
    const [generatingSEO, setGeneratingSEO] = useState(false);
    const [itModal, setItModal] = useState<{ open: boolean, type: string }>({ open: false, type: '' });

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

            const { data: seoData } = await supabase.from('seo_strategies').select('*');
            if (seoData) setSeoStrategies(seoData as SEOStrategy[]);
        };
        fetchData();
    }, []);

    const handleSaveGeofence = async (key: string, poly: string) => {
        setSaving(true);
        console.info(`💾 Intentando guardar geocerca [${key}]...`);
        
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert(
                    { key, value: poly, updated_at: new Date().toISOString() },
                    { onConflict: 'key' }
                );
            
            if (!error) {
                console.info(`✅ Geocerca [${key}] guardada correctamente.`);
                (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Geocerca guardada con éxito ✓', 'success');
                
                // Pequeño delay artificial para que el usuario sienta la persistencia y la DB procese
                await new Promise(resolve => setTimeout(resolve, 800));

                setSettings(prev => {
                    const exists = prev.find(s => s.key === key);
                    if (exists) {
                        return prev.map(s => s.key === key ? { ...s, value: poly } : s);
                    }
                    return [...prev, { key, value: poly, description: 'Configuración de Geocerca' }];
                });
                return true;
            } else {
                console.error(`❌ Error de Supabase al guardar [${key}]:`, error);
                (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Error al guardar geocerca', 'error');
                return false;
            }
        } catch (err) {
            console.error(`❌ Excepción al guardar [${key}]:`, err);
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Error crítico al guardar', 'error');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleITRequest = async (type: string, details: any) => {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from('it_requests').insert([{
            type,
            requester_id: user?.id,
            status: 'pending',
            details: details // Assuming JSONB or Text column exists/supports it
        }]);

        if (!error) {
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.(`Solicitud de ${type} enviada al CCM ✓`, 'success');
            // Refresh requests
            const { data } = await supabase.from('it_requests').select('*').order('created_at', { ascending: false }).limit(5);
            if (data) setItRequests(data as ITRequest[]);
        }
    };

    const handleGenerateSEO = async (zone_key: string) => {
        const polyStr = settings.find(s => s.key === zone_key)?.value;
        if (!polyStr) return;

        setGeneratingSEO(true);
        try {
            const res = await fetch('/api/seo/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ zone_key, poly: JSON.parse(polyStr) })
            });
            const data = await res.json();

            if (data.success) {
                (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.(`Estrategia SEO para ${data.municipality} generada con IA ✓`, 'success');
                // Refresh local state
                setSeoStrategies(prev => {
                    const exists = prev.find(s => s.zone_key === zone_key);
                    if (exists) return prev.map(s => s.zone_key === zone_key ? data.strategy : s);
                    return [...prev, data.strategy];
                });
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            console.error('SEO Error:', err);
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Error al generar SEO con IA', 'error');
        } finally {
            setGeneratingSEO(false);
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
                    {activeTab === 'geofencing' && (
                        <APIProvider apiKey={MAPS_KEY}>
                            <GeofencingManager 
                                settings={settings} 
                                onSave={handleSaveGeofence} 
                                saving={saving} 
                                canEdit={profile?.role === 'sys_admin'}
                            />
                        </APIProvider>
                    )}
                    {activeTab === 'seo' && (
                        <SEOView 
                            settings={settings} 
                            strategies={seoStrategies} 
                            onGenerate={handleGenerateSEO}
                            loading={generatingSEO}
                        />
                    )}
                    {activeTab === 'it' && (
                        <ITView 
                            requests={itRequests} 
                            onRequest={(type) => setItModal({ open: true, type })} 
                        />
                    )}
                </div>
            </div>

            {itModal.open && (
                <ITRequestModal 
                    type={itModal.type} 
                    onClose={() => setItModal({ open: false, type: '' })} 
                    onSubmit={async (details) => {
                        await handleITRequest(itModal.type, details);
                        setItModal({ open: false, type: '' });
                    }}
                />
            )}
        </main>
    );
}


function SEOView({ settings, strategies, onGenerate, loading }: { 
    settings: AppSetting[], 
    strategies: SEOStrategy[],
    onGenerate: (key: string) => void,
    loading: boolean
}) {
    const b2cPolyStr = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
    const b2bPolyStr = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
    
    const b2cCount = b2cPolyStr ? (JSON.parse(b2cPolyStr) as Point[]).length : 0;
    const b2bCount = b2bPolyStr ? (JSON.parse(b2bPolyStr) as Point[]).length : 0;

    const b2cStrategy = strategies.find(s => s.zone_key === 'geofence_b2c_poly');
    const b2bStrategy = strategies.find(s => s.zone_key === 'geofence_b2b_poly');

    // Health Score: Real based on existence of active strategies
    const seoHealth = useMemo(() => {
        let score = 0;
        if (b2cStrategy) score += 47;
        if (b2bStrategy) score += 48;
        return score;
    }, [b2cStrategy, b2bStrategy]);

    const activeKeywords = useMemo(() => {
        return (b2cStrategy?.keywords?.length || 0) + (b2bStrategy?.keywords?.length || 0);
    }, [b2cStrategy, b2bStrategy]);

    const currentZoneNames = [b2cStrategy?.municipality_name, b2bStrategy?.municipality_name]
        .filter(Boolean)
        .join(' & ') || 'Sin Identificar';

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Panel de Auditoría SEO Dinámica</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.4rem 1rem', borderRadius: '100px', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16A34A' }}></span>
                    <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#166534' }}>SISTEMA ACTIVO</span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🛡️</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>{seoHealth}%</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '700' }}>Salud SEO Local</div>
                    <p style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>Inyección de metadatos activa</p>
                </div>
                <div style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎯</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0F172A' }}>{activeKeywords}</div>
                    <div style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '700' }}>Keywords en Radar</div>
                    <p style={{ fontSize: '0.65rem', color: '#94A3B8', marginTop: '4px' }}>Términos generados por Gemini</p>
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
                    <h3 style={{ fontWeight: '900', fontSize: '1.1rem', marginBottom: '1.2rem' }}>Estrategias Activas por Zona</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {strategies.length === 0 ? (
                            <p style={{ fontSize: '0.85rem', color: '#64748B', textAlign: 'center', padding: '2rem' }}>No hay estrategias generadas aún. Usa el Sugerente AI para empezar.</p>
                        ) : (
                            strategies.map(s => (
                                <div key={s.id} style={{ padding: '1.25rem', borderRadius: '16px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                        <div>
                                            <span style={{ fontWeight: '900', fontSize: '1rem', display: 'block', color: '#0F172A' }}>{s.municipality_name}</span>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700' }}>ZONA: {s.zone_key.includes('b2c') ? 'HOGARES' : 'INSTITUCIONAL'}</span>
                                        </div>
                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#10B981', backgroundColor: '#DCFCE7', padding: '4px 8px', borderRadius: '6px' }}>ACTIVO</span>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: '#334155', margin: '0 0 10px 0', fontStyle: 'italic' }}>"{s.meta_title}"</p>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {s.keywords.map(kw => (
                                            <span key={kw} style={{ fontSize: '0.65rem', backgroundColor: 'white', border: '1px solid #CBD5E1', padding: '2px 8px', borderRadius: '4px', color: '#475569' }}>{kw}</span>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
                <div style={{ padding: '2.5rem', borderRadius: '32px', backgroundColor: '#0F172A', color: 'white', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{loading ? '⏳' : '🤖'}</div>
                    <h4 style={{ fontWeight: '900', fontSize: '1.3rem', marginBottom: '1rem' }}>AI Keyword Suggester</h4>
                    <p style={{ fontSize: '0.9rem', opacity: 0.8, marginBottom: '2rem', lineHeight: '1.6' }}>
                        {currentZoneNames !== 'Sin Identificar' 
                            ? `Detectamos presencia en ${currentZoneNames}. ¿Deseas actualizar los metadatos dinámicos?`
                            : "Dibuja una geocerca primero para que la IA analice la zona geográfica."}
                    </p>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <button 
                            onClick={() => onGenerate('geofence_b2c_poly')}
                            disabled={loading || b2cCount === 0}
                            style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', backgroundColor: '#7C3AED', color: 'white', border: 'none', fontWeight: '900', cursor: (loading || b2cCount === 0) ? 'not-allowed' : 'pointer', opacity: (loading || b2cCount === 0) ? 0.5 : 1 }}
                        >
                            {loading ? 'Generando...' : '⚡ Inyección B2C (Hogares)'}
                        </button>
                        <button 
                            onClick={() => onGenerate('geofence_b2b_poly')}
                            disabled={loading || b2bCount === 0}
                            style={{ width: '100%', padding: '1.2rem', borderRadius: '16px', backgroundColor: 'transparent', color: 'white', border: '2px solid #7C3AED', fontWeight: '900', cursor: (loading || b2bCount === 0) ? 'not-allowed' : 'pointer', opacity: (loading || b2bCount === 0) ? 0.5 : 1 }}
                        >
                            {loading ? 'Generando...' : '🏢 Inyección B2B (Empresas)'}
                        </button>
                    </div>
                    <p style={{ fontSize: '0.7rem', opacity: 0.5, marginTop: '1.5rem' }}>* Los metadatos se generan usando Gemini 2.5 Flash analizando el contexto local.</p>
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
function ITRequestModal({ type, onClose, onSubmit }: { type: string, onClose: () => void, onSubmit: (details: any) => void }) {
    const [formData, setFormData] = useState<any>({});
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        await onSubmit(formData);
        setLoading(false);
    };

    const isColaborador = type === 'Alta Colaborador';
    const isB2B = type === 'Registro B2B Especial';
    const isTicket = type === 'Ticket Infraestructura';

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '2rem', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '900', color: '#0F172A' }}>{type}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748B' }}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {isColaborador && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Nombre Completo</label>
                                <input required onChange={e => setFormData({...formData, name: e.target.value})} type="text" placeholder="Ej: Juan Pérez" style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Correo Electrónico</label>
                                <input required onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="usuario@frufresco.com" style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Cargo / Rol</label>
                                <select required onChange={e => setFormData({...formData, role: e.target.value})} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                    <option value="">Seleccionar...</option>
                                    <option value="admin">Administrador</option>
                                    <option value="operario">Operario de Planta</option>
                                    <option value="comercial">Asesor Comercial</option>
                                </select>
                            </div>
                        </>
                    )}

                    {isB2B && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Nombre de la Empresa</label>
                                <input required onChange={e => setFormData({...formData, company: e.target.value})} type="text" placeholder="Ej: Restaurante El Gourmet" style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Tipo de Lista de Precios</label>
                                <select required onChange={e => setFormData({...formData, catalogType: e.target.value})} style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                    <option value="standard">Estándar HORECA</option>
                                    <option value="premium">Premium / Especial</option>
                                    <option value="contract">Contrato a largo plazo</option>
                                </select>
                            </div>
                        </>
                    )}

                    {isTicket && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Asunto</label>
                                <input required onChange={e => setFormData({...formData, subject: e.target.value})} type="text" placeholder="Ej: Error en envío de correos" style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '6px' }}>Descripción del Problema</label>
                                <textarea required onChange={e => setFormData({...formData, description: e.target.value})} rows={4} placeholder="Describe detalladamente lo que sucede..." style={{ width: '100%', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E2E8F0', resize: 'none' }} />
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '1rem', borderRadius: '16px', border: '1px solid #E2E8F0', backgroundColor: 'white', fontWeight: '800', cursor: 'pointer' }}>Cancelar</button>
                        <button type="submit" disabled={loading} style={{ flex: 1, padding: '1rem', borderRadius: '16px', border: 'none', backgroundColor: '#0F172A', color: 'white', fontWeight: '800', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                            {loading ? 'Enviando...' : 'Enviar Solicitud'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
