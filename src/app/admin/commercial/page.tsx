'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { THEME } from '@/lib/adminTheme';
import ClientsModule from '@/components/ClientsModule';
import CommercialInboxModule from '@/components/CommercialInboxModule';
import CommercialUnifiedDashboard from '@/components/CommercialUnifiedDashboard';
import { 
    LayoutDashboard, 
    Users, 
    FileText, 
    Sliders, 
    Sparkles, 
    BarChart2,
    Mail,
    Layers,
    Loader2
} from 'lucide-react';

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
            minHeight: '400px'
        }}>
            <Loader2 className="animate-spin" size={36} color={THEME.colors.primary} />
            <span style={{ fontSize: '0.9rem', color: THEME.colors.textSecondary, fontWeight: '600' }}>
                Cargando {title}...
            </span>
        </div>
    );
}

// Dynamic Imports with SSR disabled for optimal loading & zero hydration mismatches
const CostMatrixView = dynamic(() => import('./cost-matrix/page'), {
    loading: () => <SubtabSkeleton title="Matriz Comercial" />,
    ssr: false
});

const QuotesListView = dynamic(() => import('./quotes/page'), {
    loading: () => <SubtabSkeleton title="Historial de Cotizaciones" />,
    ssr: false
});

const PricingSettingsView = dynamic(() => import('./settings/page'), {
    loading: () => <SubtabSkeleton title="Modelos de Precios" />,
    ssr: false
});

const CampaignsView = dynamic(() => import('./campaigns/page'), {
    loading: () => <SubtabSkeleton title="Campañas Temporales" />,
    ssr: false
});

export default function CommercialPage() {
    const [activeMainTab, setActiveMainTab] = useState('dashboard');
    const [activeOpSubtab, setActiveOpSubtab] = useState('cost-matrix');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const tab = params.get('tab');
            const subtab = params.get('subtab');
            if (tab) setActiveMainTab(tab);
            if (subtab) setActiveOpSubtab(subtab);
        }
    }, []);

    const handleSelectMainTab = (tab: string) => {
        setActiveMainTab(tab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tab);
            if (tab === 'operations') {
                url.searchParams.set('subtab', activeOpSubtab);
            } else {
                url.searchParams.delete('subtab');
            }
            window.history.replaceState({}, '', url.toString());
        }
    };

    const handleSelectOpSubtab = (subtab: string) => {
        setActiveOpSubtab(subtab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', 'operations');
            url.searchParams.set('subtab', subtab);
            window.history.replaceState({}, '', url.toString());
        }
    };

    const operationsSubtabs = [
        {
            id: 'cost-matrix',
            label: 'Matriz de Costos',
            icon: <BarChart2 size={16} strokeWidth={2} />,
            description: 'Inteligencia de costos de compra vs matriz autorizada'
        },
        {
            id: 'quotes',
            label: 'Cotizaciones',
            icon: <FileText size={16} strokeWidth={2} />,
            description: 'Historial de ofertas, acuerdos y cotizaciones vigentes'
        },
        {
            id: 'settings',
            label: 'Modelos de Precios',
            icon: <Sliders size={16} strokeWidth={2} />,
            description: 'Configuración de márgenes por segmento y listas'
        },
        {
            id: 'campaigns',
            label: 'Campañas Temporales',
            icon: <Sparkles size={16} strokeWidth={2} />,
            description: 'Programación de alzas o bajas por tiempo limitado'
        }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
            
            {/* MAIN TABS */}
            <div style={{ backgroundColor: 'white', borderBottom: `1px solid ${THEME.colors.border}`, padding: '0 2rem' }}>
                <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '2rem' }}>
                    <button 
                        onClick={() => handleSelectMainTab('dashboard')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'dashboard' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'dashboard' ? '700' : '500',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'dashboard' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif'
                        }}
                    >
                        <LayoutDashboard size={18} strokeWidth={1.5} style={{ color: activeMainTab === 'dashboard' ? THEME.colors.primary : THEME.colors.textSecondary }} /> Dashboard Comercial (BI)
                    </button>

                    <button 
                        onClick={() => handleSelectMainTab('operations')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'operations' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'operations' ? '700' : '500',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'operations' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif'
                        }}
                    >
                        <Layers size={18} strokeWidth={1.5} style={{ color: activeMainTab === 'operations' ? THEME.colors.primary : THEME.colors.textSecondary }} /> Operaciones & Gestión
                    </button>

                    <button 
                        onClick={() => handleSelectMainTab('clients')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'clients' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'clients' ? '700' : '500',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'clients' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif'
                        }}
                    >
                        <Users size={18} strokeWidth={1.5} style={{ color: activeMainTab === 'clients' ? THEME.colors.primary : THEME.colors.textSecondary }} /> Gestión de Clientes (CRM)
                    </button>

                    <button 
                        onClick={() => handleSelectMainTab('inbox')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'inbox' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'inbox' ? '700' : '500',
                            fontSize: '0.95rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'inbox' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif'
                        }}
                    >
                        <Mail size={18} strokeWidth={1.5} style={{ color: activeMainTab === 'inbox' ? THEME.colors.primary : THEME.colors.textSecondary }} /> Buzón Comercial (CRM)
                    </button>
                </div>
            </div>

            {/* OPERATIONS SUBTABS BAR */}
            {activeMainTab === 'operations' && (
                <div style={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.95)', 
                    backdropFilter: 'blur(12px)',
                    borderBottom: `1px solid ${THEME.colors.border}`, 
                    padding: '0.65rem 2rem',
                    position: 'sticky',
                    top: '85px',
                    zIndex: 80,
                    transition: 'all 0.2s ease-in-out'
                }}>
                    <div style={{ 
                        maxWidth: '1600px', 
                        margin: '0 auto', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        flexWrap: 'wrap', 
                        gap: '1rem' 
                    }}>
                        <div style={{
                            display: 'inline-flex',
                            backgroundColor: '#F1F5F9',
                            padding: '4px',
                            borderRadius: THEME.radius.lg,
                            gap: '4px'
                        }}>
                            {operationsSubtabs.map(sub => {
                                const isActive = activeOpSubtab === sub.id;
                                return (
                                    <button
                                        key={sub.id}
                                        onClick={() => handleSelectOpSubtab(sub.id)}
                                        style={{
                                            padding: '0.5rem 1.15rem',
                                            border: 'none',
                                            borderRadius: THEME.radius.md,
                                            background: isActive ? THEME.colors.primary : 'transparent',
                                            color: isActive ? 'white' : THEME.colors.textSecondary,
                                            fontWeight: isActive ? '700' : '600',
                                            fontSize: '0.86rem',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '7px',
                                            boxShadow: isActive ? '0 2px 8px rgba(13, 122, 87, 0.25)' : 'none',
                                            transition: 'all 0.2s ease',
                                            fontFamily: THEME.typography?.fontFamilySecondary || 'inherit'
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
                                        {sub.icon}
                                        {sub.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: THEME.colors.textSecondary }}>
                            <span>Módulo activo:</span>
                            <span style={{ 
                                backgroundColor: THEME.colors.primaryLight, 
                                color: THEME.colors.primary, 
                                padding: '2px 8px', 
                                borderRadius: '6px', 
                                fontWeight: '700' 
                            }}>
                                {operationsSubtabs.find(s => s.id === activeOpSubtab)?.label}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT */}
            {activeMainTab === 'dashboard' && (
                <CommercialUnifiedDashboard />
            )}

            {activeMainTab === 'operations' && (
                <div>
                    {activeOpSubtab === 'cost-matrix' && (
                        <CostMatrixView embedded={true} />
                    )}

                    {activeOpSubtab === 'quotes' && (
                        <QuotesListView embedded={true} />
                    )}

                    {activeOpSubtab === 'settings' && (
                        <PricingSettingsView embedded={true} />
                    )}

                    {activeOpSubtab === 'campaigns' && (
                        <CampaignsView embedded={true} />
                    )}
                </div>
            )}

            {activeMainTab === 'clients' && (
                <div style={{ minHeight: 'calc(100vh - 140px)' }}>
                    <ClientsModule />
                </div>
            )}

            {activeMainTab === 'inbox' && (
                <div style={{ height: 'calc(100vh - 140px)' }}>
                    <CommercialInboxModule />
                </div>
            )}
        </main>
    );
}
