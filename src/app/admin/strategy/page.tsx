'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Toast from '@/components/Toast';
import { useAuth } from '@/lib/authContext';
import GeofencingManager from '@/components/admin/GeofencingManager';
import { APIProvider } from '@vis.gl/react-google-maps';
import { 
    MapPin, 
    TrendingUp, 
    ShieldCheck, 
    Layers, 
    AlertCircle, 
    Users, 
    Building2, 
    Wrench, 
    ArrowRight,
    Cpu
} from 'lucide-react';
import { THEME, formatNumber } from '@/lib/adminTheme';

type Tab = 'geofencing' | 'seo' | 'it' | 'hierarchy';

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
    const [hoveredTab, setHoveredTab] = useState<Tab | null>(null);
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
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <Toast />
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>Inteligencia & Estrategia</h1>
                    </div>
                    {/* Segmented Control (Tabs) per design_manual.md */}
                    <div style={{ backgroundColor: '#E5E7EB', padding: '0.25rem', borderRadius: THEME.radius.md, display: 'flex', gap: '4px' }}>
                        {(['geofencing', 'seo', 'it', 'hierarchy'] as Tab[]).map(t => {
                            const isActive = activeTab === t;
                            const isHovered = hoveredTab === t;
                            return (
                                <button 
                                    key={t}
                                    onClick={() => setActiveTab(t)}
                                    onMouseEnter={() => setHoveredTab(t)}
                                    onMouseLeave={() => setHoveredTab(null)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderRadius: THEME.radius.sm,
                                        border: 'none',
                                        backgroundColor: isActive 
                                            ? THEME.colors.primary 
                                            : (isHovered ? THEME.colors.primaryLight : 'transparent'),
                                        boxShadow: isActive ? THEME.shadow.sm : 'none',
                                        color: isActive 
                                            ? '#FFFFFF' 
                                            : (isHovered ? THEME.colors.textMain : THEME.colors.textSecondary),
                                        fontWeight: '600',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        fontSize: '0.85rem',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {t === 'geofencing' && <MapPin size={14} strokeWidth={1.5} />}
                                    {t === 'seo' && <TrendingUp size={14} strokeWidth={1.5} />}
                                    {t === 'it' && <ShieldCheck size={14} strokeWidth={1.5} />}
                                    {t === 'hierarchy' && <Layers size={14} strokeWidth={1.5} />}
                                    {t === 'geofencing' ? 'Geocercas' : t === 'seo' ? 'SEO' : t === 'it' ? 'IT' : 'Jerarquía'}
                                </button>
                            );
                        })}
                    </div>
                </header>

                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, padding: '2rem', minHeight: '600px', boxShadow: THEME.shadow.sm }}>
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
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const hijos = products.filter(p => p.parent_id);
    const criticalIssues = hijos.filter(p => p.web_conversion_factor === 1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
                <div style={{ padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.surface, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, letterSpacing: '0.05rem', textTransform: 'uppercase' }}>Total Hijos</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '2rem', fontWeight: '750', color: THEME.colors.textMain, fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>{formatNumber(hijos.length)}</p>
                </div>
                <div style={{ padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: criticalIssues.length > 0 ? '#FEF2F2' : THEME.colors.surface, border: criticalIssues.length > 0 ? '#FECACA 1px solid' : `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: '600', color: criticalIssues.length > 0 ? '#DC2626' : THEME.colors.textSecondary, letterSpacing: '0.05rem', textTransform: 'uppercase' }}>Factores Críticos (1.0)</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '2rem', fontWeight: '750', color: criticalIssues.length > 0 ? '#DC2626' : THEME.colors.textMain, fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>{formatNumber(criticalIssues.length)}</p>
                </div>
                <div style={{ padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.surface, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button 
                        onClick={() => window.open('/admin/master/products', '_blank')}
                        style={{ padding: '0.65rem 1.25rem', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '600', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem', transition: 'background-color 0.2s' }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                    >
                        Gestionar Maestros <ArrowRight size={14} strokeWidth={1.5} />
                    </button>
                </div>
            </div>

            {criticalIssues.length > 0 && (
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                        <h3 style={{ margin: 0, fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#DC2626', fontSize: '1.1rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
                            <AlertCircle size={18} strokeWidth={1.5} /> Alerta de Inventario: Factores de Conversión Genéricos
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: THEME.colors.textSecondary }}>Estos productos restan 1:1 del padre, lo cual suele ser incorrecto para fraccionados.</p>
                    </div>
                    <div style={{ maxHeight: '400px', overflowY: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.sm }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
                            <thead style={{ backgroundColor: THEME.colors.background, position: 'sticky', top: 0 }}>
                                <tr>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1.25rem', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>SKU</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1.25rem', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>Nombre</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1.25rem', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>Unidad Web</th>
                                    <th style={{ ...THEME.typography?.tableHeader, padding: '0.75rem 1.25rem', borderBottom: `1px solid ${THEME.colors.border}`, textAlign: 'left' }}>Factor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {criticalIssues.map(p => (
                                    <tr 
                                        key={p.id} 
                                        style={{ 
                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                            backgroundColor: hoveredRow === p.id ? '#F8FAF9' : 'transparent',
                                            transition: 'background-color 0.2s ease'
                                        }}
                                        onMouseEnter={() => setHoveredRow(p.id)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                    >
                                        <td style={{ padding: '0.65rem 1.25rem', fontWeight: '600', color: THEME.colors.primary }}>{p.sku}</td>
                                        <td style={{ padding: '0.65rem 1.25rem', color: THEME.colors.textMain }}>{p.name}</td>
                                        <td style={{ padding: '0.65rem 1.25rem' }}>
                                            <span style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: '600' }}>
                                                {p.web_unit || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 1.25rem', fontWeight: '600', color: '#DC2626' }}>{formatNumber(p.web_conversion_factor, 2)}</td>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.1rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>Estrategias SEO Activas</h3>
                {strategies.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md, border: `1px dashed ${THEME.colors.border}` }}>
                        <p style={{ color: THEME.colors.textSecondary, margin: 0, fontSize: '0.9rem' }}>No hay estrategias generadas.</p>
                    </div>
                ) : (
                    strategies.map(s => (
                        <div key={s.id} style={{ padding: '1.25rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', alignItems: 'center' }}>
                                <span style={{ fontWeight: '600', color: THEME.colors.primary }}>{s.municipality_name}</span>
                                <span style={{ fontSize: '0.7rem', fontWeight: '600', backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '4px 8px', borderRadius: '4px' }}>ACTIVO</span>
                            </div>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: '600', color: THEME.colors.textMain }}>{s.meta_title}</p>
                            <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: THEME.colors.textSecondary }}>{s.meta_description}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {s.keywords.map(kw => <span key={kw} style={{ fontSize: '0.75rem', backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, padding: '2px 8px', borderRadius: '4px', color: THEME.colors.textSecondary }}>{kw}</span>)}
                            </div>
                        </div>
                    ))
                )}
            </div>
            <div style={{ backgroundColor: '#1E293B', color: 'white', borderRadius: THEME.radius.md, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', alignSelf: 'start' }}>
                <h4 style={{ margin: 0, fontWeight: '750', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
                    <Cpu size={18} strokeWidth={1.5} style={{ color: THEME.colors.primaryLight }} /> Sugerente AI
                </h4>
                <p style={{ fontSize: '0.85rem', opacity: 0.8, lineHeight: '1.5', margin: 0 }}>Genera metadatos optimizados usando Gemini analizando el contexto geográfico de tus geocercas.</p>
                <button 
                    onClick={() => onGenerate('geofence_b2c_poly')} 
                    disabled={loading || b2cCount === 0}
                    style={{ padding: '0.75rem', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '600', border: 'none', cursor: 'pointer', opacity: (loading || b2cCount === 0) ? 0.6 : 1, transition: 'background-color 0.2s', fontSize: '0.9rem' }}
                    onMouseOver={e => { if (!loading && b2cCount > 0) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                    onMouseOut={e => { if (!loading && b2cCount > 0) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                >
                    {loading ? 'Generando...' : 'Inyectar B2C'}
                </button>
                <button 
                    onClick={() => onGenerate('geofence_b2b_poly')} 
                    disabled={loading || b2bCount === 0}
                    style={{ padding: '0.75rem', borderRadius: THEME.radius.sm, backgroundColor: 'transparent', color: 'white', fontWeight: '600', border: `1.5px solid ${THEME.colors.primary}`, cursor: 'pointer', opacity: (loading || b2bCount === 0) ? 0.6 : 1, fontSize: '0.9rem' }}
                >
                    {loading ? 'Generando...' : 'Inyectar B2B'}
                </button>
            </div>
        </div>
    );
}

function ITView({ requests, onRequest }: { requests: ITRequest[], onRequest: (type: string) => void }) {
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '2rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <h3 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.1rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>Auditoría de Solicitudes</h3>
                <div style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.sm, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
                        <thead style={{ backgroundColor: THEME.colors.background }}>
                            <tr>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Tipo</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Estado</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.65rem 1.25rem', textAlign: 'left' }}>Fecha</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(r => (
                                <tr 
                                    key={r.id} 
                                    style={{ 
                                        borderBottom: `1px solid ${THEME.colors.border}`,
                                        backgroundColor: hoveredRow === r.id ? '#F8FAF9' : 'transparent',
                                        transition: 'background-color 0.2s ease'
                                    }}
                                    onMouseEnter={() => setHoveredRow(r.id)}
                                    onMouseLeave={() => setHoveredRow(null)}
                                >
                                    <td style={{ padding: '0.65rem 1.25rem', fontWeight: '600', color: THEME.colors.textMain }}>{r.type}</td>
                                    <td style={{ padding: '0.65rem 1.25rem' }}>
                                        <span style={{ fontSize: '0.7rem', fontWeight: '600', backgroundColor: r.status === 'pending' ? '#FEF3C7' : THEME.colors.primaryLight, color: r.status === 'pending' ? '#92400E' : THEME.colors.primary, padding: '4px 8px', borderRadius: '4px' }}>{r.status.toUpperCase()}</span>
                                    </td>
                                    <td style={{ padding: '0.65rem 1.25rem', fontSize: '0.85rem', color: THEME.colors.textSecondary }}>{new Date(r.created_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <h4 style={{ margin: 0, fontWeight: '750', fontSize: '1.1rem', color: THEME.colors.textMain, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>Acciones Disponibles</h4>
                
                <button onClick={() => onRequest('Alta Colaborador')} style={{ padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textSecondary, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.textMain; e.currentTarget.style.color = THEME.colors.textMain; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.borderActive; e.currentTarget.style.color = THEME.colors.textSecondary; }}
                >
                    <Users size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Nuevo Colaborador
                </button>
                
                <button onClick={() => onRequest('Registro B2B Especial')} style={{ padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textSecondary, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.textMain; e.currentTarget.style.color = THEME.colors.textMain; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.borderActive; e.currentTarget.style.color = THEME.colors.textSecondary; }}
                >
                    <Building2 size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Cliente B2B Especial
                </button>
                
                <button onClick={() => onRequest('Ticket Infraestructura')} style={{ padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, backgroundColor: 'white', border: `1px solid ${THEME.colors.borderActive}`, fontWeight: '600', color: THEME.colors.textSecondary, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.textMain; e.currentTarget.style.color = THEME.colors.textMain; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.borderActive; e.currentTarget.style.color = THEME.colors.textSecondary; }}
                >
                    <Wrench size={14} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Soporte Técnico
                </button>
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

    return (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.md, width: '100%', maxWidth: '480px', padding: '2rem', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}`, fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: THEME.colors.textMain, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>{type}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: THEME.colors.textSecondary }}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {isColaborador && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Nombre Completo</label>
                                <input required onChange={e => setFormData({...formData, name: e.target.value})} type="text" placeholder="Ej: Juan Pérez" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Correo Electrónico</label>
                                <input required onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="usuario@frufresco.com" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Cargo / Rol</label>
                                <select required onChange={e => setFormData({...formData, role: e.target.value})} style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none', backgroundColor: 'white' }}>
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
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Nombre de la Empresa</label>
                                <input required onChange={e => setFormData({...formData, company: e.target.value})} type="text" placeholder="Ej: Restaurante El Gourmet" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Tipo de Lista de Precios</label>
                                <select required onChange={e => setFormData({...formData, catalogType: e.target.value})} style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none', backgroundColor: 'white' }}>
                                    <option value="standard">Estándar HORECA</option>
                                    <option value="premium">Premium / Especial</option>
                                    <option value="contract">Contrato a largo plazo</option>
                                </select>
                            </div>
                        </>
                    )}

                    {!isColaborador && !isB2B && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Asunto</label>
                                <input required onChange={e => setFormData({...formData, subject: e.target.value})} type="text" placeholder="Ej: Error en envío de correos" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '6px' }}>Descripción del Problema</label>
                                <textarea required onChange={e => setFormData({...formData, description: e.target.value})} rows={4} placeholder="Describe detalladamente lo que sucede..." style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none', resize: 'none' }} />
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', fontWeight: '600', color: THEME.colors.textMain, cursor: 'pointer', fontSize: '0.9rem' }}>Cancelar</button>
                        <button type="submit" disabled={loading} style={{ flex: 1, padding: '0.75rem', borderRadius: THEME.radius.sm, border: 'none', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '600', cursor: 'pointer', opacity: loading ? 0.7 : 1, transition: 'background-color 0.2s', fontSize: '0.9rem' }}
                        onMouseOver={e => { if (!loading) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                        onMouseOut={e => { if (!loading) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                        >
                            {loading ? 'Enviando...' : 'Enviar Solicitud'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
