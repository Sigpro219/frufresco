'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Navbar from '@/components/Navbar';
import Toast from '@/components/Toast';
import { useAuth } from '@/lib/authContext';
import GeofencingManager from '@/components/admin/GeofencingManager';
import { APIProvider } from '@vis.gl/react-google-maps';

type Tab = 'geofencing' | 'seo' | 'it' | 'hierarchy';


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


export default function AdminStrategyPage() {
    const [activeTab, setActiveTab] = useState<Tab>('geofencing');
    const { profile } = useAuth();
    const [settings, setSettings] = useState<AppSetting[]>([]);
    const [itRequests, setItRequests] = useState<ITRequest[]>([]);
    const [seoStrategies, setSeoStrategies] = useState<SEOStrategy[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [generatingSEO, setGeneratingSEO] = useState(false);
    const [itModal, setItModal] = useState<{ open: boolean, type: string }>({ open: false, type: '' });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [settingsRes, itRes, seoRes, productsRes] = await Promise.all([
                supabase.from('app_settings').select('*'),
                supabase.from('it_requests').select('*').order('created_at', { ascending: false }).limit(5),
                supabase.from('seo_strategies').select('*'),
                supabase.from('products').select('id, name, sku, parent_id, web_conversion_factor, web_unit')
            ]);
            
            if (settingsRes.data) setSettings(settingsRes.data as AppSetting[]);
            if (itRes.data) setItRequests(itRes.data as ITRequest[]);
            if (seoRes.data) setSeoStrategies(seoRes.data as SEOStrategy[]);
            if (productsRes.data) setProducts(productsRes.data);
        } catch (err) {
            console.error('Error fetching data:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSaveGeofence = async (key: string, poly: string) => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('app_settings')
                .upsert(
                    { key, value: poly, updated_at: new Date().toISOString() },
                    { onConflict: 'key' }
                );
            
            if (!error) {
                (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.('Geocerca guardada con éxito ✓', 'success');
                await fetchData();
                return true;
            }
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
            details: details
        }]);

        if (!error) {
            (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.(`Solicitud enviada ✓`, 'success');
            await fetchData();
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
                (window as Window & { showToast?: (m: string, s: 'success'|'error') => void }).showToast?.(`Estrategia SEO generada ✓`, 'success');
                await fetchData();
            }
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
                    </div>
                    <div style={{ backgroundColor: '#F1F5F9', padding: '0.5rem', borderRadius: '12px', display: 'flex', gap: '4px' }}>
                        {(['geofencing', 'seo', 'it', 'hierarchy'] as Tab[]).map(t => (
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
                                    cursor: 'pointer'
                                }}
                            >
                                {t === 'geofencing' ? '📍 Geocercas' : t === 'seo' ? '🚀 SEO' : t === 'it' ? '🛡️ IT' : '🧬 Jerarquía'}
                            </button>
                        ))}
                    </div>
                </header>

                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '2rem', minHeight: '600px' }}>
                    {activeTab === 'geofencing' && (
                        <APIProvider apiKey={MAPS_KEY}>
                            <GeofencingManager settings={settings} onSave={handleSaveGeofence} saving={saving} canEdit={profile?.role === 'sys_admin'} />
                        </APIProvider>
                    )}
                    {activeTab === 'seo' && <SEOView strategies={seoStrategies} onGenerate={handleGenerateSEO} loading={generatingSEO} settings={settings} />}
                    {activeTab === 'it' && <ITView requests={itRequests} onRequest={(type) => setItModal({ open: true, type })} />}
                    {activeTab === 'hierarchy' && <HierarchyView products={products} onFix={fetchData} />}
                </div>
            </div>
            {itModal.open && <ITRequestModal type={itModal.type} onClose={() => setItModal({ open: false, type: '' })} onSubmit={async (d) => { await handleITRequest(itModal.type, d); setItModal({ open: false, type: '' }); }} />}
        </main>
    );
}

function HierarchyView({ products, onFix }: { products: any[], onFix: () => void }) {
    const hijos = products.filter(p => p.parent_id);
    const criticalIssues = hijos.filter(p => p.web_conversion_factor === 1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                <div style={{ padding: '2rem', borderRadius: '24px', backgroundColor: 'white', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '900', color: '#64748B', letterSpacing: '0.05rem' }}>TOTAL HIJOS</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '2.5rem', fontWeight: '900', color: '#0F172A' }}>{hijos.length}</p>
                </div>
                <div style={{ padding: '2rem', borderRadius: '24px', backgroundColor: criticalIssues.length > 0 ? '#FEF2F2' : 'white', border: criticalIssues.length > 0 ? '#FECACA 1px solid' : '1px solid #E2E8F0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '900', color: criticalIssues.length > 0 ? '#DC2626' : '#64748B', letterSpacing: '0.05rem' }}>FACTORES CRÍTICOS (1.0)</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '2.5rem', fontWeight: '900', color: criticalIssues.length > 0 ? '#DC2626' : '#0F172A' }}>{criticalIssues.length}</p>
                </div>
                <div style={{ padding: '2rem', borderRadius: '24px', backgroundColor: 'white', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button 
                        onClick={() => window.open('/admin/master/products', '_blank')}
                        style={{ padding: '1rem 2rem', borderRadius: '12px', backgroundColor: '#0F172A', color: 'white', fontWeight: '800', border: 'none', cursor: 'pointer' }}
                    >
                        Gestionar Maestros ↗
                    </button>
                </div>
            </div>

            {criticalIssues.length > 0 && (
                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', padding: '2rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <h3 style={{ margin: 0, fontWeight: '900' }}>⚠️ Alerta de Inventario: Factores de Conversión Genéricos</h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B' }}>Estos productos restan 1:1 del padre, lo cual suele ser incorrecto para fraccionados.</p>
                    </div>
                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #F1F5F9', borderRadius: '16px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead style={{ backgroundColor: '#F8FAFC', position: 'sticky', top: 0 }}>
                                <tr>
                                    <th style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>SKU</th>
                                    <th style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>Nombre</th>
                                    <th style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>Unidad Web</th>
                                    <th style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0' }}>Factor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {criticalIssues.map(p => (
                                    <tr key={p.id}>
                                        <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9', fontWeight: '800', color: '#2563EB' }}>{p.sku}</td>
                                        <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9' }}>{p.name}</td>
                                        <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9' }}>
                                            <span style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '4px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700' }}>
                                                {p.web_unit || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9', fontWeight: '900', color: '#DC2626' }}>{p.web_conversion_factor}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function SEOView({ strategies, onGenerate, loading, settings }: { strategies: SEOStrategy[], onGenerate: (key: string) => void, loading: boolean, settings: AppSetting[] }) {
    const b2cPolyStr = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
    const b2bPolyStr = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
    const b2cCount = b2cPolyStr ? JSON.parse(b2cPolyStr).length : 0;
    const b2bCount = b2bPolyStr ? JSON.parse(b2bPolyStr).length : 0;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ margin: 0, fontWeight: '900' }}>Estrategias SEO Activas</h3>
                {strategies.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '20px', border: '1px dashed #CBD5E1' }}>
                        <p style={{ color: '#64748B' }}>No hay estrategias generadas.</p>
                    </div>
                ) : (
                    strategies.map(s => (
                        <div key={s.id} style={{ padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <span style={{ fontWeight: '900', color: '#2563EB' }}>{s.municipality_name}</span>
                                <span style={{ fontSize: '0.7rem', fontWeight: '800', backgroundColor: '#DCFCE7', color: '#166534', padding: '4px 8px', borderRadius: '6px' }}>ACTIVO</span>
                            </div>
                            <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: '700' }}>{s.meta_title}</p>
                            <p style={{ margin: '0 0 15px 0', fontSize: '0.8rem', color: '#64748B' }}>{s.meta_description}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {s.keywords.map(kw => <span key={kw} style={{ fontSize: '0.7rem', backgroundColor: 'white', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '6px' }}>{kw}</span>)}
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div style={{ backgroundColor: '#0F172A', color: 'white', borderRadius: '24px', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h4 style={{ margin: 0, fontWeight: '900', fontSize: '1.2rem' }}>Sugerente AI</h4>
                <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: '1.5' }}>Genera metadatos optimizados usando Gemini analizando el contexto geográfico de tus geocercas.</p>
                <button 
                    onClick={() => onGenerate('geofence_b2c_poly')} 
                    disabled={loading || b2cCount === 0}
                    style={{ padding: '1rem', borderRadius: '12px', backgroundColor: '#7C3AED', color: 'white', fontWeight: '800', border: 'none', cursor: 'pointer', opacity: (loading || b2cCount === 0) ? 0.6 : 1 }}
                >
                    {loading ? 'Generando...' : '⚡ Inyectar B2C'}
                </button>
                <button 
                    onClick={() => onGenerate('geofence_b2b_poly')} 
                    disabled={loading || b2bCount === 0}
                    style={{ padding: '1rem', borderRadius: '12px', backgroundColor: 'transparent', color: 'white', fontWeight: '800', border: '2px solid #7C3AED', cursor: 'pointer', opacity: (loading || b2bCount === 0) ? 0.6 : 1 }}
                >
                    {loading ? 'Generando...' : '🏢 Inyectar B2B'}
                </button>
            </div>
        </div>
    );
}

function ITView({ requests, onRequest }: { requests: ITRequest[], onRequest: (type: string) => void }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <h3 style={{ margin: 0, fontWeight: '900' }}>Auditoría de Solicitudes</h3>
                <div style={{ border: '1px solid #E2E8F0', borderRadius: '20px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#F8FAFC' }}>
                            <tr>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>Tipo</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>Estado</th>
                                <th style={{ padding: '1rem', textAlign: 'left' }}>Fecha</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(r => (
                                <tr key={r.id}>
                                    <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9', fontWeight: '700' }}>{r.type}</td>
                                    <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: '800', backgroundColor: r.status === 'pending' ? '#FEF3C7' : '#DCFCE7', color: r.status === 'pending' ? '#92400E' : '#166534', padding: '4px 8px', borderRadius: '6px' }}>{r.status.toUpperCase()}</span>
                                    </td>
                                    <td style={{ padding: '1rem', borderBottom: '1px solid #F1F5F9', fontSize: '0.8rem', color: '#64748B' }}>{new Date(r.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h4 style={{ margin: 0, fontWeight: '900' }}>Acciones Disponibles</h4>
                <button onClick={() => onRequest('Alta Colaborador')} style={{ padding: '1rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E2E8F0', fontWeight: '800', cursor: 'pointer', textAlign: 'left' }}>👥 Nuevo Colaborador</button>
                <button onClick={() => onRequest('Registro B2B Especial')} style={{ padding: '1rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E2E8F0', fontWeight: '800', cursor: 'pointer', textAlign: 'left' }}>🏢 Cliente B2B Especial</button>
                <button onClick={() => onRequest('Ticket Infraestructura')} style={{ padding: '1rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E2E8F0', fontWeight: '800', cursor: 'pointer', textAlign: 'left' }}>🔧 Soporte Técnico</button>
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
