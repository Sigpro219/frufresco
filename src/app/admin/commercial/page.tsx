'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import ClientsModule from '@/components/ClientsModule';
import { 
    LayoutDashboard, 
    Users, 
    FileText, 
    Sliders, 
    TrendingUp, 
    TrendingDown, 
    Sparkles, 
    Package, 
    Shuffle, 
    BarChart2,
    Mail
} from 'lucide-react';

interface TrendItem {
    id: string;
    name: string;
    sku: string;
    trend: number;
    lastPrice: number;
}

interface ModelItem {
    name: string;
    count: number;
}

interface DashboardStats {
    topTrends: TrendItem[];
    topModels: ModelItem[];
    quotesLast30: number;
    inventory: {
        lowStockItems: number;
        totalValue: number;
        activeAudits: number;
    };
    loading: boolean;
}

export default function CommercialDashboard() {
    const [activeMainTab, setActiveMainTab] = useState('dashboard');
    const [trendView, setTrendView] = useState<'alzas' | 'bajas'>('alzas');
    const [stats, setStats] = useState<DashboardStats>({
        topTrends: [],
        topModels: [],
        quotesLast30: 0,
        inventory: {
            lowStockItems: 0,
            totalValue: 0,
            activeAudits: 0
        },
        loading: true
    });

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const tab = params.get('tab');
            if (tab) {
                setActiveMainTab(tab);
            }
        }
    }, []);

    const fetchDashboardData = useCallback(async () => {
        try {
            // 1. Quotes Last 30 Days
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const { count: quoteCount } = await supabase
                .from('quotes')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', thirtyDaysAgo.toISOString());

            // 2. Models Pareto (Top used models)
            const { data: quotesData } = await supabase
                .from('quotes')
                .select('model_snapshot_name')
                .not('model_snapshot_name', 'is', null);

            const modelCounts: Record<string, number> = {};
            quotesData?.forEach((q: { model_snapshot_name: string | null }) => {
                const name = q.model_snapshot_name || 'Desconocido';
                modelCounts[name] = (modelCounts[name] || 0) + 1;
            });
            const sortedModels = Object.entries(modelCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            // 3. Price Trends (purchases)
            const { data: products } = await supabase
                .from('products')
                .select('id, name, sku, base_price')
                .eq('show_on_web', true)
                .eq('is_active', true)
                .limit(2000);

            const { data: purchases } = await supabase
                .from('purchases')
                .select('product_id, unit_price, created_at')
                .gt('unit_price', 0)
                .order('created_at', { ascending: false })
                .limit(20000);

            const historyMap: Record<string, any[]> = {};
            purchases?.forEach((p: { product_id: string; unit_price: number; created_at: string }) => {
                if (!historyMap[p.product_id]) historyMap[p.product_id] = [];
                if (historyMap[p.product_id].length < 5) historyMap[p.product_id].push(p);
            });

            const trends: TrendItem[] = (products?.map((p: { id: string, name: string, sku: string }) => {
                const history = historyMap[p.id];
                if (!history || history.length < 2) return null;
                const last = history[0].unit_price;
                const first = history[history.length - 1].unit_price;
                const trend = ((last - first) / first) * 100;
                return { id: p.id, name: p.name, sku: p.sku, trend, lastPrice: last };
            }) || [])
            .filter((t): t is TrendItem => t !== null && Math.abs(t.trend) > 0.1);

            // 4. Inventory Insights (Connected to Store/Ops)
            const inventoryStats = { lowStockItems: 0, totalValue: 0, activeAudits: 0 };
            try {
                const { data: stocks } = await supabase
                    .from('inventory_stocks')
                    .select('quantity, min_stock_level, product_id');
                
                if (stocks) {
                    inventoryStats.lowStockItems = stocks.filter(s => s.quantity <= (s.min_stock_level || 0)).length;
                    
                    // Simple value calculation
                    inventoryStats.totalValue = stocks.reduce((acc, s) => {
                        const product = products?.find(p => p.id === s.product_id);
                        return acc + (s.quantity * (product?.base_price || 0));
                    }, 0);
                }

                const { count: auditCount } = await supabase
                    .from('inventory_random_tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'pending');
                
                inventoryStats.activeAudits = auditCount || 0;
            } catch (invErr) {
                console.warn('Inventory tables might not be ready yet:', invErr);
            }

            setStats({
                topTrends: trends || [],
                topModels: sortedModels,
                quotesLast30: quoteCount || 0,
                inventory: inventoryStats,
                loading: false
            });
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
            setStats(prev => ({ ...prev, loading: false }));
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        
        const load = async () => {
            if (mounted) {
                await fetchDashboardData();
            }
        };
        
        load();
        
        return () => { mounted = false; };
    }, [fetchDashboardData]);

    const modules = [
        {
            title: 'Cotizaciones',
            description: 'Gestionar historial de ofertas, crear nuevas y convertir a pedidos.',
            icon: <FileText size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />,
            href: '/admin/commercial/quotes',
            color: THEME.colors.primaryLight,
            textColor: THEME.colors.primary
        },
        {
            title: 'Modelos de Precios',
            description: 'Configurar márgenes por segmento (Hoteles, Bares, Colegios).',
            icon: <Sliders size={20} strokeWidth={1.5} style={{ color: '#475569' }} />,
            href: '/admin/commercial/settings',
            color: '#F1F5F9',
            textColor: '#475569'
        },
        {
            title: 'Matriz de Costos/Precios',
            description: 'Historial de precios ofrecidos por producto en las últimas cotizaciones.',
            icon: <BarChart2 size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />,
            href: '/admin/commercial/cost-matrix',
            color: THEME.colors.primaryLight,
            textColor: THEME.colors.primary
        },
        {
            title: 'Campañas Temporales',
            description: 'Programar alzas o bajas de precio para grupos de clientes por tiempo limitado.',
            icon: <Sparkles size={20} strokeWidth={1.5} style={{ color: '#C2410C' }} />,
            href: '/admin/commercial/campaigns',
            color: '#FFF7ED',
            textColor: '#C2410C'
        }
    ];

    const displayTrends = stats.topTrends
        .filter(t => trendView === 'alzas' ? t.trend > 0 : t.trend < 0)
        .sort((a, b) => trendView === 'alzas' ? b.trend - a.trend : a.trend - b.trend)
        .slice(0, 10);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilySecondary || 'var(--font-inter), sans-serif' }}>
            
            {/* MAIN TABS */}
            <div style={{ backgroundColor: 'white', borderBottom: `1px solid ${THEME.colors.border}`, padding: '0 2rem' }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '2rem' }}>
                    <button 
                        onClick={() => setActiveMainTab('dashboard')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'dashboard' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'dashboard' ? '600' : '400',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'dashboard' ? `3px solid ${THEME.colors.primary}` : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif'
                        }}
                    >
                        <LayoutDashboard size={18} strokeWidth={1.5} style={{ color: activeMainTab === 'dashboard' ? THEME.colors.primary : THEME.colors.textSecondary }} /> Dashboard Comercial
                    </button>
                    <button 
                        onClick={() => setActiveMainTab('clients')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'clients' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'clients' ? '600' : '400',
                            fontSize: '1rem',
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
                </div>
            </div>

            {activeMainTab === 'dashboard' ? (
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1rem' }}>
 
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{ fontSize: '2.25rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
                            Gestión Comercial
                        </h1>
                        <p style={{ fontSize: '1.1rem', color: THEME.colors.textSecondary, marginTop: '0.2rem' }}>
                            Monitorización de precios y eficiencia de ventas.
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '2px', letterSpacing: '0.05em' }}>Cotizaciones (30 días)</div>
                        <div style={{ fontSize: '2rem', fontWeight: '700', color: THEME.colors.primary, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>{stats.quotesLast30}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
                    {/* Trend Card */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, padding: '1.5rem', boxShadow: THEME.shadow.md, border: `1px solid ${THEME.colors.border}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontWeight: '600', color: THEME.colors.textMain, fontSize: '1.1rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {trendView === 'alzas' ? (
                                    <>
                                        <TrendingUp size={18} strokeWidth={1.5} style={{ color: '#EF4444' }} />
                                        <span>Alzas de Costo</span>
                                    </>
                                ) : (
                                    <>
                                        <TrendingDown size={18} strokeWidth={1.5} style={{ color: '#10B981' }} />
                                        <span>Bajas de Costo</span>
                                    </>
                                )}
                            </h3>
                            <div style={{ display: 'flex', backgroundColor: THEME.colors.background, padding: '4px', borderRadius: THEME.radius.sm }}>
                                <button 
                                    onClick={() => setTrendView('alzas')}
                                    style={{ 
                                        padding: '4px 10px', 
                                        border: 'none', 
                                        borderRadius: '4px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: '600', 
                                        cursor: 'pointer',
                                        backgroundColor: trendView === 'alzas' ? 'white' : 'transparent',
                                        color: trendView === 'alzas' ? '#EF4444' : THEME.colors.textSecondary,
                                        boxShadow: trendView === 'alzas' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >ALZAS</button>
                                <button 
                                    onClick={() => setTrendView('bajas')}
                                    style={{ 
                                        padding: '4px 10px', 
                                        border: 'none', 
                                        borderRadius: '4px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: '600', 
                                        cursor: 'pointer',
                                        backgroundColor: trendView === 'bajas' ? 'white' : 'transparent',
                                        color: trendView === 'bajas' ? '#10B981' : THEME.colors.textSecondary,
                                        boxShadow: trendView === 'bajas' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >BAJAS</button>
                            </div>
                        </div>
                        {stats.loading ? (
                            <div style={{ color: THEME.colors.textSecondary }}>...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                                {displayTrends.length === 0 ? (
                                    <div style={{ color: THEME.colors.textSecondary, fontStyle: 'italic', fontSize: '0.85rem' }}>Sin {trendView} registradas.</div>
                                ) : displayTrends.map((t: TrendItem) => (
                                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', backgroundColor: '#F8FAF9', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}` }}>
                                        <div style={{ maxWidth: '60%' }}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textMain, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                        </div>
                                        <div style={{ color: trendView === 'alzas' ? '#EF4444' : '#10B981', fontWeight: '700', fontSize: '0.9rem' }}>
                                            {trendView === 'alzas' ? '▲' : '▼'}{Math.abs(t.trend).toFixed(1)}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Inventory Resumen - NEW */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, padding: '1.5rem', boxShadow: THEME.shadow.md, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontWeight: '600', color: THEME.colors.textMain, fontSize: '1.1rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Package size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                <span>Inventario Store</span>
                            </h3>
                            <Link href="/admin/commercial/inventory" style={{ fontSize: '0.75rem', color: THEME.colors.primary, fontWeight: '600', textDecoration: 'none' }}>Gestionar →</Link>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                            <div style={{ backgroundColor: THEME.colors.background, padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Valor Stock</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain }}>{formatMoney(stats.inventory.totalValue)}</div>
                            </div>
                            <div style={{ backgroundColor: stats.inventory.lowStockItems > 0 ? '#FEF2F2' : THEME.colors.background, padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${stats.inventory.lowStockItems > 0 ? '#FCA5A5' : THEME.colors.border}` }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: stats.inventory.lowStockItems > 0 ? '#B91C1C' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alertas</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '700', color: stats.inventory.lowStockItems > 0 ? '#B91C1C' : THEME.colors.textMain }}>{stats.inventory.lowStockItems}</div>
                            </div>
                        </div>
                        <div style={{ backgroundColor: THEME.colors.background, padding: '0.8rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, flex: 1, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <Shuffle size={18} strokeWidth={1.5} style={{ color: '#6366F1' }} />
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Auditoría a Ciegas</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '600' }}>
                                    {stats.inventory.activeAudits > 0 ? (
                                        <span style={{ color: '#D97706' }}>{stats.inventory.activeAudits} Pendientes</span>
                                    ) : (
                                        <span style={{ color: THEME.colors.primary }}>Completado</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Models Pareto Card */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, padding: '1.5rem', boxShadow: THEME.shadow.md, border: `1px solid ${THEME.colors.border}` }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontWeight: '600', color: THEME.colors.textMain, fontSize: '1.1rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BarChart2 size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                            <span>Mix de Modelos</span>
                        </h3>
                        {stats.loading ? (
                            <div style={{ color: THEME.colors.textSecondary }}>...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {stats.topModels.slice(0, 5).map((m: ModelItem, i: number) => {
                                    const total = stats.topModels.reduce((acc: number, curr: ModelItem) => acc + curr.count, 0);
                                    const percent = total > 0 ? (m.count / total) * 100 : 0;
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem' }}>
                                                <span style={{ fontWeight: '600', color: THEME.colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{m.name}</span>
                                                <span style={{ color: THEME.colors.textSecondary, fontWeight: '600' }}>{m.count}</span>
                                            </div>
                                            <div style={{ height: '6px', backgroundColor: THEME.colors.background, borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${percent}%`, height: '100%', backgroundColor: i === 0 ? THEME.colors.primary : THEME.colors.borderActive, borderRadius: '3px' }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontWeight: '600', color: THEME.colors.textMain, fontSize: '1.25rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>Módulos de Gestión</h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, 1fr)',
                        gap: '1.2rem'
                    }}>
                        {modules.map((mod) => (
                            <Link href={mod.href} key={mod.title} style={{ textDecoration: 'none' }}>
                                <div style={{
                                    backgroundColor: THEME.colors.surface,
                                    padding: '1.25rem',
                                    borderRadius: THEME.radius.lg,
                                    height: '100%',
                                    boxShadow: THEME.shadow.md,
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    border: `1px solid ${THEME.colors.border}`
                                }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-2px)';
                                        e.currentTarget.style.boxShadow = THEME.shadow.lg;
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = THEME.shadow.md;
                                    }}
                                >
                                    <div style={{
                                        width: '40px', height: '40px',
                                        borderRadius: THEME.radius.md,
                                        backgroundColor: mod.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {mod.icon}
                                    </div>

                                    <div>
                                        <h2 style={{ fontSize: '1.1rem', fontWeight: '600', color: THEME.colors.textMain, marginBottom: '0.3rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
                                            {mod.title}
                                        </h2>
                                        <p style={{ color: THEME.colors.textSecondary, lineHeight: '1.4', fontSize: '0.85rem' }}>
                                            {mod.description}
                                        </p>
                                    </div>

                                    <div style={{ marginTop: 'auto', paddingTop: '0.5rem', fontWeight: '600', color: mod.textColor, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                                        Acceder <span>→</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                    </div>
                </div>
            ) : (
                <div style={{ height: 'calc(100vh - 140px)' }}>
                    <ClientsModule />
                </div>
            )}
        </main>
    );
}
