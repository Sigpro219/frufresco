'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import ClientsModule from '@/components/ClientsModule';
import CommercialInboxModule from '@/components/CommercialInboxModule';
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
    id?: string;
    name: string;
    count: number;
    totalAmount: number;
    avgTicket: number;
    color: string;
    description?: string;
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
    const [modelMetricView, setModelMetricView] = useState<'value' | 'count'>('value');
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

            // 2. Models Pareto (Top used current pricing models + financial metrics)
            const { data: currentPricingModels } = await supabase
                .from('pricing_models')
                .select('id, name, description, color_tag');

            const { data: quotesData } = await supabase
                .from('quotes')
                .select('id, model_id, model_snapshot_name, total_amount, subtotal_amount, status');

            const getColorForModel = (name: string, tag?: string | null) => {
                const n = name.toLowerCase();
                // FruFresco Brand Manual Palette
                if (tag === 'verde' || n.includes('grande')) return '#0D7A57'; // Verde Bosque FruFresco Oficial
                if (tag === 'amarillo' || n.includes('mediano')) return '#D97706'; // Ámbar Dorado Orgánico
                if (tag === 'rojo' || n.includes('pequeño') || n.includes('pequeno')) return '#EA580C'; // Terracota Mandarina Cítrico
                if (n.includes('hogar') || n.includes('b2c')) return '#2563EB'; // Azul Arándano Fresco
                return '#64748B'; // Gris Pizarra Institucional
            };

            const modelMap: Record<string, ModelItem> = {};
            currentPricingModels?.forEach(m => {
                modelMap[m.name] = {
                    id: m.id,
                    name: m.name,
                    description: m.description,
                    count: 0,
                    totalAmount: 0,
                    avgTicket: 0,
                    color: getColorForModel(m.name, m.color_tag)
                };
            });

            quotesData?.forEach((q: { id: string; model_id?: string | null; model_snapshot_name?: string | null; total_amount?: number | null; subtotal_amount?: number | null }) => {
                const amount = Number(q.total_amount || q.subtotal_amount || 0);
                let targetName: string | null = null;

                const matchedById = currentPricingModels?.find(m => m.id === q.model_id);
                if (matchedById) {
                    targetName = matchedById.name;
                } else {
                    const rawName = (q.model_snapshot_name || '').toLowerCase();
                    if (rawName.includes('pequeño') || rawName.includes('pequeno')) targetName = 'Pequeño';
                    else if (rawName.includes('mediano')) targetName = 'Mediano';
                    else if (rawName.includes('grande')) targetName = 'Grande';
                    else if (rawName.includes('hogar') || rawName.includes('b2c')) targetName = 'Clientes Hogar';
                    else if (rawName.includes('institucional') || rawName.includes('general')) targetName = 'General Institucional';
                }

                if (targetName && modelMap[targetName]) {
                    modelMap[targetName].count += 1;
                    modelMap[targetName].totalAmount += amount;
                }
            });

            const sortedModels: ModelItem[] = Object.values(modelMap).map(m => ({
                ...m,
                avgTicket: m.count > 0 ? Math.round(m.totalAmount / m.count) : 0
            })).sort((a, b) => b.totalAmount - a.totalAmount || b.count - a.count);

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
                    // Only alert if safety stock is explicitly configured (> 0) and current quantity is <= min_stock_level
                    inventoryStats.lowStockItems = stocks.filter(s => (s.min_stock_level || 0) > 0 && (s.quantity || 0) <= s.min_stock_level).length;
                    
                    // Simple value calculation
                    inventoryStats.totalValue = stocks.reduce((acc, s) => {
                        const product = products?.find(p => p.id === s.product_id);
                        return acc + (Math.max(0, s.quantity || 0) * (product?.base_price || 0));
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
                <div style={{ maxWidth: '1600px', margin: '0 auto', display: 'flex', gap: '2rem' }}>
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
                    <button 
                        onClick={() => setActiveMainTab('inbox')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'inbox' ? THEME.colors.textMain : THEME.colors.textSecondary,
                            fontWeight: activeMainTab === 'inbox' ? '600' : '400',
                            fontSize: '1rem',
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

            {activeMainTab === 'dashboard' ? (
                <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1rem' }}>
 
                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{ fontSize: '2.25rem', fontWeight: '600', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
                            Comercial
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

                    {/* Models Pareto Card (High Impact Strategic Insight) */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.lg, padding: '1.25rem 1.5rem', boxShadow: THEME.shadow.md, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <div>
                            {/* Header with Title & Metric Toggle */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                                <h3 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.05rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <BarChart2 size={18} strokeWidth={2} style={{ color: THEME.colors.primary }} />
                                    <span>Mix de Modelos</span>
                                </h3>
                                <div style={{ display: 'flex', backgroundColor: THEME.colors.primaryLight || '#EAEFEA', borderRadius: '8px', padding: '2px' }}>
                                    <button 
                                        onClick={() => setModelMetricView('value')}
                                        style={{
                                            padding: '4px 9px',
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            backgroundColor: modelMetricView === 'value' ? '#FFFFFF' : 'transparent',
                                            color: modelMetricView === 'value' ? THEME.colors.primary : THEME.colors.textSecondary,
                                            boxShadow: modelMetricView === 'value' ? '0 1px 3px rgba(13,122,87,0.12)' : 'none',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    >
                                        $ Valor
                                    </button>
                                    <button 
                                        onClick={() => setModelMetricView('count')}
                                        style={{
                                            padding: '4px 9px',
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            border: 'none',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            backgroundColor: modelMetricView === 'count' ? '#FFFFFF' : 'transparent',
                                            color: modelMetricView === 'count' ? THEME.colors.primary : THEME.colors.textSecondary,
                                            boxShadow: modelMetricView === 'count' ? '0 1px 3px rgba(13,122,87,0.12)' : 'none',
                                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                        }}
                                    >
                                        # Cant.
                                    </button>
                                </div>
                            </div>

                            {stats.loading ? (
                                <div style={{ color: THEME.colors.textSecondary, padding: '1rem 0', fontSize: '0.85rem' }}>Cargando métricas...</div>
                            ) : (
                                <div>
                                    {/* 100% Multi-Segment Proportional Distribution Bar */}
                                    {(() => {
                                        const totalValue = stats.topModels.reduce((acc, curr) => acc + curr.totalAmount, 0);
                                        const totalCount = stats.topModels.reduce((acc, curr) => acc + curr.count, 0);
                                        const totalBasis = modelMetricView === 'value' ? totalValue : totalCount;

                                        return (
                                            <div style={{ marginBottom: '0.85rem' }}>
                                                <div style={{ height: '7px', width: '100%', backgroundColor: THEME.colors.primaryLight || '#EAEFEA', borderRadius: '4px', display: 'flex', overflow: 'hidden' }}>
                                                    {stats.topModels.map((m, idx) => {
                                                        const val = modelMetricView === 'value' ? m.totalAmount : m.count;
                                                        const pct = totalBasis > 0 ? (val / totalBasis) * 100 : 0;
                                                        if (pct <= 0) return null;
                                                        return (
                                                            <div 
                                                                key={idx} 
                                                                title={`${m.name}: ${modelMetricView === 'value' ? formatMoney(m.totalAmount) : m.count} (${pct.toFixed(1)}%)`}
                                                                style={{ width: `${pct}%`, height: '100%', backgroundColor: m.color, transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} 
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Model Breakdown Rows */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                        {stats.topModels.map((m: ModelItem, i: number) => {
                                            const totalValue = stats.topModels.reduce((acc, curr) => acc + curr.totalAmount, 0);
                                            const totalCount = stats.topModels.reduce((acc, curr) => acc + curr.count, 0);
                                            const totalBasis = modelMetricView === 'value' ? totalValue : totalCount;
                                            const currVal = modelMetricView === 'value' ? m.totalAmount : m.count;
                                            const percent = totalBasis > 0 ? (currVal / totalBasis) * 100 : 0;

                                            return (
                                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', maxWidth: '55%' }}>
                                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: m.color, flexShrink: 0, boxShadow: `0 0 0 2px ${m.color}20` }} />
                                                            <span style={{ fontWeight: '700', color: THEME.colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {m.name}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {modelMetricView === 'value' ? (
                                                                <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.78rem' }}>
                                                                    {formatMoney(m.totalAmount)}
                                                                </span>
                                                            ) : (
                                                                <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.78rem' }}>
                                                                    {m.count} <span style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>ctz</span>
                                                                </span>
                                                            )}
                                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: percent > 0 ? m.color : THEME.colors.textSecondary, minWidth: '32px', textAlign: 'right' }}>
                                                                {percent.toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div style={{ height: '5px', backgroundColor: THEME.colors.background || '#F4F7F6', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ width: `${percent}%`, height: '100%', backgroundColor: m.color, borderRadius: '3px', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }} />
                                                    </div>
                                                    {modelMetricView === 'value' && m.count > 0 && (
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: THEME.colors.textSecondary, paddingLeft: '15px' }}>
                                                            <span>{m.count} cotizaciones</span>
                                                            <span>Ticket prom: {formatMoney(m.avgTicket)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Bottom Insight Callout */}
                        {!stats.loading && stats.topModels.length > 0 && (
                            <div style={{ marginTop: '0.85rem', padding: '0.6rem 0.8rem', backgroundColor: '#F4F9F6', borderRadius: THEME.radius.md, border: '1px solid #E0EFE7', fontSize: '0.7rem', color: '#1A4D38', display: 'flex', alignItems: 'center', gap: '7px', lineHeight: '1.3' }}>
                                <Sparkles size={14} style={{ color: THEME.colors.primary, flexShrink: 0 }} />
                                <span>
                                    {(() => {
                                        const topModelByValue = [...stats.topModels].sort((a, b) => b.totalAmount - a.totalAmount)[0];
                                        const totalVal = stats.topModels.reduce((acc, curr) => acc + curr.totalAmount, 0);
                                        const pctVal = totalVal > 0 ? ((topModelByValue.totalAmount / totalVal) * 100).toFixed(0) : '0';
                                        return `El modelo ${topModelByValue.name} lidera con el ${pctVal}% del valor total cotizado (${formatMoney(topModelByValue.totalAmount)}).`;
                                    })()}
                                </span>
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
            ) : activeMainTab === 'inbox' ? (
                <div style={{ height: 'calc(100vh - 140px)' }}>
                    <CommercialInboxModule />
                </div>
            ) : (
                <div style={{ minHeight: 'calc(100vh - 140px)' }}>
                    <ClientsModule />
                </div>
            )}
        </main>
    );
}
