'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import ClientsModule from '@/components/ClientsModule';

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
            const { data: products } = await supabase.from('products').select('id, name, sku, base_price');
            const { data: purchases } = await supabase
                .from('purchases')
                .select('product_id, unit_price, created_at')
                .order('created_at', { ascending: false });

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
            icon: '📝',
            href: '/admin/commercial/quotes',
            color: '#EFF6FF',
            textColor: '#1D4ED8'
        },
        {
            title: 'Modelos de Precios',
            description: 'Configurar márgenes por segmento (Hoteles, Bares, Colegios).',
            icon: '⚙️',
            href: '/admin/commercial/settings',
            color: '#FDF2F8',
            textColor: '#BE185D'
        },
        {
            title: 'Matriz de Costos/Precios',
            description: 'Historial de precios ofrecidos por producto en las últimas cotizaciones.',
            icon: '📊',
            href: '/admin/commercial/cost-matrix',
            color: '#ECFDF5',
            textColor: '#047857'
        }
    ];

    const displayTrends = stats.topTrends
        .filter(t => trendView === 'alzas' ? t.trend > 0 : t.trend < 0)
        .sort((a, b) => trendView === 'alzas' ? b.trend - a.trend : a.trend - b.trend)
        .slice(0, 10);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            
            {/* MAIN TABS */}
            <div style={{ backgroundColor: 'white', borderBottom: '1px solid #E2E8F0', padding: '0 2rem' }}>
                <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', gap: '2rem' }}>
                    <button 
                        onClick={() => setActiveMainTab('dashboard')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'dashboard' ? '#0F172A' : '#64748B',
                            fontWeight: activeMainTab === 'dashboard' ? '800' : '600',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'dashboard' ? '3px solid #0891B2' : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>📊</span> Dashboard Comercial
                    </button>
                    <button 
                        onClick={() => setActiveMainTab('clients')}
                        style={{
                            padding: '1rem 0',
                            border: 'none',
                            background: 'transparent',
                            color: activeMainTab === 'clients' ? '#0F172A' : '#64748B',
                            fontWeight: activeMainTab === 'clients' ? '800' : '600',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            borderBottom: activeMainTab === 'clients' ? '3px solid #0891B2' : '3px solid transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>👥</span> Gestión de Clientes (CRM)
                    </button>
                </div>
            </div>

            {activeMainTab === 'dashboard' ? (
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1rem' }}>

                <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-1px' }}>
                            Gestión Comercial
                        </h1>
                        <p style={{ fontSize: '1.1rem', color: '#64748B', marginTop: '0.2rem' }}>
                            Monitorización de precios y eficiencia de ventas.
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '2px' }}>Cotizaciones (30 días)</div>
                        <div style={{ fontSize: '2rem', fontWeight: '950', color: '#2563EB' }}>{stats.quotesLast30}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
                    {/* Trend Card */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontWeight: '800', color: '#1E293B', fontSize: '1.1rem' }}>
                                {trendView === 'alzas' ? '📈 Alzas de Costo' : '📉 Bajas de Costo'}
                            </h3>
                            <div style={{ display: 'flex', backgroundColor: '#F1F5F9', padding: '4px', borderRadius: '8px' }}>
                                <button 
                                    onClick={() => setTrendView('alzas')}
                                    style={{ 
                                        padding: '4px 10px', 
                                        border: 'none', 
                                        borderRadius: '6px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: '800', 
                                        cursor: 'pointer',
                                        backgroundColor: trendView === 'alzas' ? 'white' : 'transparent',
                                        color: trendView === 'alzas' ? '#EF4444' : '#64748B',
                                        boxShadow: trendView === 'alzas' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >ALZAS</button>
                                <button 
                                    onClick={() => setTrendView('bajas')}
                                    style={{ 
                                        padding: '4px 10px', 
                                        border: 'none', 
                                        borderRadius: '6px', 
                                        fontSize: '0.7rem', 
                                        fontWeight: '800', 
                                        cursor: 'pointer',
                                        backgroundColor: trendView === 'bajas' ? 'white' : 'transparent',
                                        color: trendView === 'bajas' ? '#10B981' : '#64748B',
                                        boxShadow: trendView === 'bajas' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none'
                                    }}
                                >BAJAS</button>
                            </div>
                        </div>
                        {stats.loading ? (
                            <div style={{ color: '#94A3B8' }}>...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                                {displayTrends.length === 0 ? (
                                    <div style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: '0.85rem' }}>Sin {trendView} registradas.</div>
                                ) : displayTrends.map((t: TrendItem) => (
                                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', backgroundColor: '#F8FAFC', borderRadius: '10px' }}>
                                        <div style={{ maxWidth: '60%' }}>
                                            <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                        </div>
                                        <div style={{ color: trendView === 'alzas' ? '#EF4444' : '#10B981', fontWeight: '900', fontSize: '0.9rem' }}>
                                            {trendView === 'alzas' ? '▲' : '▼'}{Math.abs(t.trend).toFixed(1)}%
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Inventory Resumen - NEW */}
                    <div style={{ backgroundColor: '#F0F9FF', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontWeight: '800', color: '#0369A1', fontSize: '1.1rem' }}>📦 Inventario Store</h3>
                            <Link href="/admin/commercial/inventory" style={{ fontSize: '0.7rem', color: '#0369A1', fontWeight: '700' }}>Gestionar →</Link>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
                            <div style={{ backgroundColor: 'white', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E0F2FE' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#0369A1', textTransform: 'uppercase' }}>Valor Stock</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0C4A6E' }}>${Math.round(stats.inventory.totalValue).toLocaleString()}</div>
                            </div>
                            <div style={{ backgroundColor: stats.inventory.lowStockItems > 0 ? '#FEF2F2' : 'white', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E0F2FE' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: stats.inventory.lowStockItems > 0 ? '#B91C1C' : '#0369A1', textTransform: 'uppercase' }}>Alertas</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '900', color: stats.inventory.lowStockItems > 0 ? '#B91C1C' : '#0C4A6E' }}>{stats.inventory.lowStockItems}</div>
                            </div>
                        </div>
                        <div style={{ backgroundColor: 'white', padding: '0.8rem', borderRadius: '12px', border: '1px solid #E0F2FE', flex: 1, display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                            <div style={{ fontSize: '1.5rem' }}>🎲</div>
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#6366F1', textTransform: 'uppercase' }}>Auditoría a Ciegas</div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800' }}>
                                    {stats.inventory.activeAudits > 0 ? (
                                        <span style={{ color: '#F59E0B' }}>{stats.inventory.activeAudits} Pendientes</span>
                                    ) : (
                                        <span style={{ color: '#10B981' }}>Completado</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Models Pareto Card */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #E2E8F0' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', color: '#1E293B', fontSize: '1.1rem' }}>📊 Mix de Modelos</h3>
                        {stats.loading ? (
                            <div style={{ color: '#94A3B8' }}>...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {stats.topModels.slice(0, 5).map((m: ModelItem, i: number) => {
                                    const total = stats.topModels.reduce((acc: number, curr: ModelItem) => acc + curr.count, 0);
                                    const percent = total > 0 ? (m.count / total) * 100 : 0;
                                    return (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem' }}>
                                                <span style={{ fontWeight: '700', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>{m.name}</span>
                                                <span style={{ color: '#64748B', fontWeight: '600' }}>{m.count}</span>
                                            </div>
                                            <div style={{ height: '6px', backgroundColor: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ width: `${percent}%`, height: '100%', backgroundColor: i === 0 ? '#6366F1' : '#CBD5E1', borderRadius: '3px' }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '1.5rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', color: '#1E293B', fontSize: '1.25rem' }}>Módulos de Gestión</h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '2rem'
                    }}>
                        {modules.map((mod) => (
                            <Link href={mod.href} key={mod.title} style={{ textDecoration: 'none' }}>
                                <div style={{
                                    backgroundColor: 'white',
                                    padding: '1.2rem',
                                    borderRadius: '16px',
                                    height: '100%',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.6rem',
                                    border: '1px solid #F1F5F9'
                                }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = 'translateY(-5px)';
                                        e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = 'translateY(0)';
                                        e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
                                    }}
                                >
                                    <div style={{
                                        width: '40px', height: '40px',
                                        borderRadius: '10px',
                                        backgroundColor: mod.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.2rem'
                                    }}>
                                        {mod.icon}
                                    </div>

                                    <div>
                                        <h2 style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#1E293B', marginBottom: '0.3rem' }}>
                                            {mod.title}
                                        </h2>
                                        <p style={{ color: '#64748B', lineHeight: '1.4', fontSize: '0.85rem' }}>
                                            {mod.description}
                                        </p>
                                    </div>

                                    <div style={{ marginTop: 'auto', paddingTop: '0.5rem', fontWeight: '700', color: mod.textColor, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
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
