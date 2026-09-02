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
    Cpu,
    Home
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

    const handleITModalSubmit = async (data: any) => {
        await handleITRequest(itModal.type, data);
        setItModal({ open: false, type: '' });
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', color: THEME.colors.textMain }}>
            <Toast />
            <div style={{ maxWidth: '100%', margin: '0 auto', padding: '0.85rem 1.5rem 1.5rem' }}>
                
                {/* ── TOP HEADER & STRATEGY KPIS ── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: THEME.colors.primary, boxShadow: `0 0 8px ${THEME.colors.primary}80` }}></div>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.primary, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                EXPANSIÓN COMERCIAL &bull; INTELIGENCIA DE DATOS
                            </span>
                            <span style={{ fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.primaryLight, padding: '0.15rem 0.45rem', borderRadius: '6px' }}>
                                Cobertura &amp; Algoritmos
                            </span>
                        </div>
                        <h1 style={{ fontSize: '1.75rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }}>
                            Centro Estratégico
                        </h1>
                    </div>

                    {/* 4 Strategy KPI Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.75rem', flex: '1 1 680px', maxWidth: '850px' }}>
                        {(() => {
                            const b2cPolyStr = settings.find(s => s.key === 'geofence_b2c_poly')?.value;
                            const b2bPolyStr = settings.find(s => s.key === 'geofence_b2b_poly')?.value;
                            const activePolys = (b2cPolyStr ? 1 : 0) + (b2bPolyStr ? 1 : 0);
                            const hijos = products.filter(p => p.parent_id);
                            const criticalIssues = hijos.filter(p => p.web_conversion_factor === 1);

                            return (
                                <>
                                    <StrategyKPICard 
                                        title="ZONAS ACTIVAS" 
                                        value={`${activePolys} Geocercas`} 
                                        icon={<MapPin size={17} strokeWidth={2} />} 
                                        color={THEME.colors.primary} 
                                        subtitle="B2B &amp; B2C Cobertura" 
                                    />
                                    <StrategyKPICard 
                                        title="ESTRATEGIAS SEO" 
                                        value={formatNumber(seoStrategies.length)} 
                                        icon={<TrendingUp size={17} strokeWidth={2} />} 
                                        color="#0284C7" 
                                        subtitle="Zonas indexadas con IA" 
                                    />
                                    <StrategyKPICard 
                                        title="SOLICITUDES IT" 
                                        value={formatNumber(itRequests.length)} 
                                        icon={<ShieldCheck size={17} strokeWidth={2} />} 
                                        color="#D97706" 
                                        subtitle="Tickets &amp; Altas B2B" 
                                    />
                                    <StrategyKPICard 
                                        title="FACTORES 1:1" 
                                        value={formatNumber(criticalIssues.length)} 
                                        icon={<Layers size={17} strokeWidth={2} />} 
                                        color={criticalIssues.length > 0 ? '#DC2626' : '#059669'} 
                                        subtitle={criticalIssues.length > 0 ? 'Requieren corrección' : 'Catálogo balanceado'} 
                                    />
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* ── SEGMENTED NAVIGATION CONTROL BAR ── */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, 
                    padding: '0.35rem 0.6rem', 
                    borderRadius: THEME.radius.lg, 
                    boxShadow: THEME.shadow.sm, 
                    border: `1px solid ${THEME.colors.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.85rem',
                    gap: '0.75rem'
                }}>
                    <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
                        {[
                            { id: 'geofencing', label: 'Geocercas & Cobertura', icon: <MapPin size={14} strokeWidth={2} /> },
                            { id: 'seo', label: 'Estrategia SEO Local', icon: <TrendingUp size={14} strokeWidth={2} /> },
                            { id: 'hierarchy', label: 'Jerarquía & Conversiones', icon: <Layers size={14} strokeWidth={2} /> },
                            { id: 'it', label: 'Soporte & Solicitudes IT', icon: <ShieldCheck size={14} strokeWidth={2} /> }
                        ].map((t) => {
                            const isActive = activeTab === t.id;
                            return (
                                <button 
                                    key={t.id}
                                    onClick={() => setActiveTab(t.id as any)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '0.45rem 0.9rem', borderRadius: '8px', border: 'none',
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
                                    <span style={{ display: 'inline-flex', alignItems: 'center' }}>{t.icon}</span>
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, paddingRight: '0.5rem' }}>
                        FruFresco Intelligence Engine
                    </span>
                </div>

                {/* ── MAIN CONTENT WORKSPACE ── */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, padding: '1.25rem', minHeight: '620px', boxShadow: THEME.shadow.sm }}>
                    {activeTab === 'geofencing' && (
                        <APIProvider apiKey={MAPS_KEY}>
                            <GeofencingManager settings={settings} onSave={handleSaveGeofence} saving={saving} canEdit={profile?.role === 'sys_admin'} />
                        </APIProvider>
                    )}
                    {activeTab === 'seo' && <SEOView strategies={seoStrategies} onGenerate={handleGenerateSEO} loading={generatingSEO} settings={settings} />}
                    {activeTab === 'hierarchy' && <HierarchyView products={products} onFix={fetchData} />}
                    {activeTab === 'it' && <ITView requests={itRequests} onRequest={(type) => setItModal({ open: true, type })} />}
                </div>
            </div>

            {itModal.open && (
                <ITRequestModal 
                    type={itModal.type} 
                    onClose={() => setItModal({ open: false, type: '' })} 
                    onSubmit={handleITModalSubmit} 
                />
            )}
        </main>
    );
}

function StrategyKPICard({ title, value, icon, color, subtitle }: any) {
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
                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: THEME.colors.textMain, lineHeight: 1.1, margin: '1px 0' }}>{value}</div>
                <div style={{ fontSize: '0.62rem', color: THEME.colors.textSecondary, fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>
            </div>
        </div>
    );
}

function HierarchyView({ products, onFix }: { products: any[], onFix: () => void }) {
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);
    const hijos = products.filter(p => p.parent_id);
    const criticalIssues = hijos.filter(p => p.web_conversion_factor === 1);
    const healthyProducts = hijos.filter(p => p.web_conversion_factor !== 1);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Hierarchy Sub-Dashboard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                <div style={{ padding: '1rem 1.25rem', borderRadius: THEME.radius.lg, backgroundColor: '#F4F9F6', border: '1px solid #E0EFE7' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.primary, letterSpacing: '0.04em', textTransform: 'uppercase' }}>PRODUCTOS DERIVADOS (HIJOS)</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '1.75rem', fontWeight: '900', color: '#065F46' }}>{formatNumber(hijos.length)} <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>SKUs</span></p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: THEME.colors.textSecondary }}>Fraccionados y presentaciones web</p>
                </div>
                
                <div style={{ padding: '1rem 1.25rem', borderRadius: THEME.radius.lg, backgroundColor: criticalIssues.length > 0 ? '#FEF2F2' : '#ECFDF5', border: criticalIssues.length > 0 ? '1px solid #FECACA' : '1px solid #A7F3D0' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: '800', color: criticalIssues.length > 0 ? '#DC2626' : '#059669', letterSpacing: '0.04em', textTransform: 'uppercase' }}>FACTORES GENÉRICOS (1.0)</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '1.75rem', fontWeight: '900', color: criticalIssues.length > 0 ? '#991B1B' : '#065F46' }}>{formatNumber(criticalIssues.length)} <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>alertas</span></p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: criticalIssues.length > 0 ? '#DC2626' : '#059669' }}>{criticalIssues.length > 0 ? 'Restan 1:1 del bulto principal' : 'Todos los factores calibrados'}</p>
                </div>

                <div style={{ padding: '1rem 1.25rem', borderRadius: THEME.radius.lg, backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.68rem', fontWeight: '800', color: '#0284C7', textTransform: 'uppercase' }}>FACTORES VERIFICADOS</p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '1.75rem', fontWeight: '900', color: '#0369A1' }}>{formatNumber(healthyProducts.length)} <span style={{ fontSize: '0.8rem', fontWeight: '700' }}>SKUs</span></p>
                    <p style={{ margin: '2px 0 0', fontSize: '0.68rem', color: THEME.colors.textSecondary }}>Conversión matemática activa</p>
                </div>

                <div style={{ padding: '1rem', borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.background, border: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <button 
                        onClick={() => window.open('/admin/master/products', '_blank')}
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '800', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontSize: '0.82rem', transition: 'background-color 0.15s', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)' }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                    >
                        Gestionar Catálogo Maestro <ArrowRight size={14} strokeWidth={2} />
                    </button>
                </div>
            </div>

            {/* Critical Issues Table */}
            {criticalIssues.length > 0 ? (
                <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, padding: '1.1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626', fontSize: '0.92rem' }}>
                            <AlertCircle size={17} strokeWidth={2} /> Alerta de Inventario: Factores de Conversión Genéricos
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: THEME.colors.textSecondary }}>
                            Estos productos restan 1:1 del padre. Requieren calibración en Maestro de Productos.
                        </p>
                    </div>
                    <div style={{ maxHeight: '380px', overflowY: 'auto', border: `1px solid ${THEME.colors.border}`, borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
                            <thead style={{ backgroundColor: THEME.colors.background, position: 'sticky', top: 0, zIndex: 2 }}>
                                <tr style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>SKU</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Nombre del Producto</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Unidad Web</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Factor Actual</th>
                                    <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {criticalIssues.map(p => (
                                    <tr 
                                        key={p.id} 
                                        style={{ 
                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                            backgroundColor: hoveredRow === p.id ? '#F4F9F6' : 'transparent',
                                            transition: 'background-color 0.15s ease'
                                        }}
                                        onMouseEnter={() => setHoveredRow(p.id)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                    >
                                        <td style={{ padding: '0.6rem 1rem', fontWeight: '800', color: THEME.colors.primary }}>{p.sku}</td>
                                        <td style={{ padding: '0.6rem 1rem', color: THEME.colors.textMain, fontWeight: '700' }}>{p.name}</td>
                                        <td style={{ padding: '0.6rem 1rem' }}>
                                            <span style={{ backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, padding: '3px 7px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '800' }}>
                                                {p.web_unit || 'N/A'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', fontWeight: '900', color: '#DC2626', textAlign: 'right' }}>
                                            {formatNumber(p.web_conversion_factor, 2)}
                                        </td>
                                        <td style={{ padding: '0.6rem 1rem', textAlign: 'center' }}>
                                            <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800' }}>
                                                Sin Calibrar
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '3rem 1.5rem', textAlign: 'center', backgroundColor: '#F4F9F6', borderRadius: THEME.radius.lg, border: '1px solid #E0EFE7' }}>
                    <p style={{ fontSize: '1rem', fontWeight: '900', color: '#065F46', margin: '0 0 4px' }}>
                        ✓ Catálogo de Jerarquía 100% Calibrado
                    </p>
                    <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, margin: 0 }}>
                        Todos los productos derivados tienen factores de conversión calculados correctamente frente a sus unidades maestras.
                    </p>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Estrategias SEO Georreferenciadas
                    </h3>
                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.primary, backgroundColor: THEME.colors.primaryLight, padding: '0.2rem 0.5rem', borderRadius: '6px' }}>
                        {strategies.length} ZONAS ACTIVAS
                    </span>
                </div>

                {strategies.length === 0 ? (
                    <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', backgroundColor: '#F9FBFA', borderRadius: THEME.radius.lg, border: `1px dashed ${THEME.colors.borderActive}` }}>
                        <div style={{ color: THEME.colors.primary, marginBottom: '0.5rem', display: 'flex', justifyContent: 'center' }}>
                            <TrendingUp size={36} strokeWidth={1.5} />
                        </div>
                        <p style={{ color: THEME.colors.textMain, fontWeight: '800', margin: '0 0 4px', fontSize: '0.9rem' }}>No hay estrategias SEO generadas aún</p>
                        <p style={{ color: THEME.colors.textSecondary, margin: 0, fontSize: '0.78rem' }}>Usa el asistente IA de la derecha para generar palabras clave y meta-tags basados en tus geocercas.</p>
                    </div>
                ) : (
                    strategies.map(s => (
                        <div key={s.id} style={{ padding: '1.1rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`, backgroundColor: '#F9FBFA' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontWeight: '900', fontSize: '0.92rem', color: THEME.colors.primary }}>{s.municipality_name}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '3px 7px', borderRadius: '4px' }}>ACTIVO</span>
                            </div>
                            <p style={{ margin: '0 0 6px 0', fontSize: '0.86rem', fontWeight: '800', color: THEME.colors.textMain }}>{s.meta_title}</p>
                            <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', color: THEME.colors.textSecondary, lineHeight: 1.4 }}>{s.meta_description}</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                                {s.keywords.map(kw => (
                                    <span key={kw} style={{ fontSize: '0.7rem', backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, padding: '2px 7px', borderRadius: '4px', color: THEME.colors.textMain, fontWeight: '600' }}>
                                        #{kw}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* AI Generator Box with FruFresco Botanical Gradient */}
            <div style={{ backgroundColor: '#F4F9F6', border: '1px solid #E0EFE7', borderRadius: THEME.radius.lg, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', alignSelf: 'start', boxShadow: THEME.shadow.sm }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: THEME.colors.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary }}>
                        <Cpu size={18} strokeWidth={2} />
                    </div>
                    <div>
                        <h4 style={{ margin: 0, fontWeight: '900', fontSize: '0.95rem', color: THEME.colors.textMain }}>Asistente IA SEO</h4>
                        <span style={{ fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.primary }}>Gemini Expansion Engine</span>
                    </div>
                </div>
                
                <p style={{ fontSize: '0.78rem', color: THEME.colors.textSecondary, lineHeight: '1.45', margin: 0 }}>
                    Genera metadatos y palabras clave hiperlocales analizando las coordenadas de tus geocercas B2B y B2C.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button 
                        onClick={() => onGenerate('geofence_b2c_poly')} 
                        disabled={loading || b2cCount === 0}
                        style={{ 
                            padding: '0.65rem', borderRadius: '8px', backgroundColor: THEME.colors.primary, color: 'white', 
                            fontWeight: '800', border: 'none', cursor: 'pointer', opacity: (loading || b2cCount === 0) ? 0.6 : 1, 
                            transition: 'background-color 0.15s', fontSize: '0.82rem', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)' 
                        }}
                        onMouseOver={e => { if (!loading && b2cCount > 0) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                        onMouseOut={e => { if (!loading && b2cCount > 0) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                    >
                        {loading ? 'Generando...' : 'Optimizar SEO Hogar (B2C)'}
                    </button>
                    <button 
                        onClick={() => onGenerate('geofence_b2b_poly')} 
                        disabled={loading || b2bCount === 0}
                        style={{ 
                            padding: '0.65rem', borderRadius: '8px', backgroundColor: 'white', color: THEME.colors.primary, 
                            fontWeight: '800', border: `1px solid ${THEME.colors.primary}`, cursor: 'pointer', 
                            opacity: (loading || b2bCount === 0) ? 0.6 : 1, fontSize: '0.82rem', transition: 'background-color 0.15s' 
                        }}
                        onMouseOver={e => { if (!loading && b2bCount > 0) e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                        onMouseOut={e => { if (!loading && b2bCount > 0) e.currentTarget.style.backgroundColor = 'white'; }}
                    >
                        {loading ? 'Generando...' : 'Optimizar SEO HORECA (B2B)'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ITView({ requests, onRequest }: { requests: ITRequest[], onRequest: (type: string) => void }) {
    const [hoveredRow, setHoveredRow] = useState<string | null>(null);

    return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontWeight: '900', color: THEME.colors.textMain, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Historial de Solicitudes &amp; Altas
                    </h3>
                    <span style={{ fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary }}>
                        {requests.length} REGISTROS
                    </span>
                </div>

                <div style={{ border: `1px solid ${THEME.colors.border}`, borderRadius: THEME.radius.lg, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead style={{ backgroundColor: THEME.colors.background }}>
                            <tr style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                <th style={{ padding: '0.65rem 1rem', textAlign: 'left', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Tipo de Solicitud</th>
                                <th style={{ padding: '0.65rem 1rem', textAlign: 'center', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Estado</th>
                                <th style={{ padding: '0.65rem 1rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textSecondary, fontSize: '0.68rem', textTransform: 'uppercase' }}>Fecha de Envío</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{ textAlign: 'center', padding: '2.5rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                                        No hay solicitudes registradas recientemente
                                    </td>
                                </tr>
                            ) : (
                                requests.map(r => (
                                    <tr 
                                        key={r.id} 
                                        style={{ 
                                            borderBottom: `1px solid ${THEME.colors.border}`,
                                            backgroundColor: hoveredRow === r.id ? '#F4F9F6' : 'transparent',
                                            transition: 'background-color 0.15s ease'
                                        }}
                                        onMouseEnter={() => setHoveredRow(r.id)}
                                        onMouseLeave={() => setHoveredRow(null)}
                                    >
                                        <td style={{ padding: '0.65rem 1rem', fontWeight: '800', color: THEME.colors.textMain }}>{r.type}</td>
                                        <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                                            <span style={{ 
                                                fontSize: '0.68rem', fontWeight: '800', 
                                                backgroundColor: r.status === 'pending' ? '#FEF3C7' : '#ECFDF5', 
                                                color: r.status === 'pending' ? '#92400E' : '#065F46', 
                                                border: r.status === 'pending' ? '1px solid #FDE68A' : '1px solid #A7F3D0',
                                                padding: '3px 8px', borderRadius: '6px' 
                                            }}>
                                                {r.status === 'pending' ? 'PENDIENTE' : r.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 1rem', fontSize: '0.78rem', color: THEME.colors.textSecondary, textAlign: 'right', fontWeight: '700' }}>
                                            {new Date(r.created_at).toLocaleDateString('es-CO')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Quick Actions Panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ margin: 0, fontWeight: '900', fontSize: '0.95rem', color: THEME.colors.textMain, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Acciones de Sistema
                </h4>
                
                <button 
                    onClick={() => onRequest('Alta Colaborador')} 
                    style={{ padding: '0.75rem 1rem', borderRadius: THEME.radius.md, backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.primary; e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.border; e.currentTarget.style.backgroundColor = 'white'; }}
                >
                    <Users size={16} strokeWidth={2} style={{ color: THEME.colors.primary }} /> Alta Nuevo Colaborador
                </button>
                
                <button 
                    onClick={() => onRequest('Registro B2B Especial')} 
                    style={{ padding: '0.75rem 1rem', borderRadius: THEME.radius.md, backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.primary; e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.border; e.currentTarget.style.backgroundColor = 'white'; }}
                >
                    <Building2 size={16} strokeWidth={2} style={{ color: THEME.colors.primary }} /> Registro Cliente B2B Especial
                </button>
                
                <button 
                    onClick={() => onRequest('Ticket Infraestructura')} 
                    style={{ padding: '0.75rem 1rem', borderRadius: THEME.radius.md, backgroundColor: 'white', border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.primary; e.currentTarget.style.backgroundColor = THEME.colors.primaryLight; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.border; e.currentTarget.style.backgroundColor = 'white'; }}
                >
                    <Wrench size={16} strokeWidth={2} style={{ color: THEME.colors.primary }} /> Reporte / Soporte Técnico IT
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
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(26, 35, 30, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
            <div style={{ backgroundColor: 'white', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '480px', padding: '1.75rem', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: THEME.colors.textMain }}>{type}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: THEME.colors.textSecondary, padding: '2px' }}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {isColaborador && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Nombre Completo</label>
                                <input required onChange={e => setFormData({...formData, name: e.target.value})} type="text" placeholder="Ej: Juan Pérez" style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '600', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Correo Electrónico Corporativo</label>
                                <input required onChange={e => setFormData({...formData, email: e.target.value})} type="email" placeholder="usuario@frufresco.com" style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '600', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Rol en Plataforma</label>
                                <select required onChange={e => setFormData({...formData, role: e.target.value})} style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '700', outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }}>
                                    <option value="">Seleccionar rol...</option>
                                    <option value="admin">Administrador</option>
                                    <option value="operario">Operario de Bodega / Picking</option>
                                    <option value="comercial">Asesor Comercial</option>
                                    <option value="driver">Conductor / Repartidor</option>
                                </select>
                            </div>
                        </>
                    )}

                    {isB2B && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Razón Social / Empresa</label>
                                <input required onChange={e => setFormData({...formData, company: e.target.value})} type="text" placeholder="Ej: Restaurante El Gourmet S.A.S." style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '600', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Modelo de Precios Asociado</label>
                                <select required onChange={e => setFormData({...formData, catalogType: e.target.value})} style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '700', outline: 'none', backgroundColor: 'white', boxSizing: 'border-box' }}>
                                    <option value="standard">Mediano (Estándar HORECA)</option>
                                    <option value="premium">Grande (Corporativo Enterprise)</option>
                                    <option value="contract">Pequeño (Boutique)</option>
                                </select>
                            </div>
                        </>
                    )}

                    {!isColaborador && !isB2B && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Asunto</label>
                                <input required onChange={e => setFormData({...formData, subject: e.target.value})} type="text" placeholder="Ej: Solicitud de acceso o soporte técnico..." style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '600', outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>Detalle de la Solicitud</label>
                                <textarea required onChange={e => setFormData({...formData, description: e.target.value})} rows={3} placeholder="Describe detalladamente el requerimiento..." style={{ width: '100%', padding: '0.65rem 0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.borderActive}`, color: THEME.colors.textMain, fontWeight: '500', outline: 'none', resize: 'none', boxSizing: 'border-box' }} />
                            </div>
                        </>
                    )}

                    <div style={{ display: 'flex', gap: '8px', marginTop: '0.5rem', paddingTop: '0.75rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.65rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', fontWeight: '700', color: THEME.colors.textSecondary, cursor: 'pointer', fontSize: '0.82rem' }}>Cancelar</button>
                        <button type="submit" disabled={loading} style={{ flex: 1, padding: '0.65rem', borderRadius: THEME.radius.md, border: 'none', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '800', cursor: 'pointer', opacity: loading ? 0.7 : 1, transition: 'background-color 0.15s', fontSize: '0.82rem', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)' }}
                        onMouseOver={e => { if (!loading) e.currentTarget.style.backgroundColor = THEME.colors.primaryHover; }}
                        onMouseOut={e => { if (!loading) e.currentTarget.style.backgroundColor = THEME.colors.primary; }}
                        >
                            {loading ? 'Enviando...' : 'Enviar Requerimiento'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
