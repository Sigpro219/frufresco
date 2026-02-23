'use client';

import { useState, useEffect, useCallback } from 'react';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

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
            .filter((t): t is TrendItem => t !== null && t.trend > 0)
            .sort((a, b) => b.trend - a.trend)
            .slice(0, 10);

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

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Inter, sans-serif' }}>
            <Navbar />
            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '3rem 1rem' }}>

                <div style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', margin: 0, letterSpacing: '-1px' }}>
                            Gestión Comercial
                        </h1>
                        <p style={{ fontSize: '1.1rem', color: '#64748B', marginTop: '0.5rem' }}>
                            Monitorización de precios y eficiencia de ventas.
                        </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', marginBottom: '4px' }}>Cotizaciones (30 días)</div>
                        <div style={{ fontSize: '2rem', fontWeight: '950', color: '#2563EB' }}>{stats.quotesLast30}</div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem', marginBottom: '3rem' }}>
                    {/* Trend Card */}
                    <div style={{ backgroundColor: 'white', borderRadius: '20px', padding: '1.5rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', border: '1px solid #E2E8F0' }}>
                        <h3 style={{ margin: '0 0 1rem 0', fontWeight: '800', color: '#1E293B', fontSize: '1.1rem' }}>📈 Alzas de Costo (Top 10)</h3>
                        {stats.loading ? (
                            <div style={{ color: '#94A3B8' }}>...</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
                                {stats.topTrends.length === 0 ? (
                                    <div style={{ color: '#94A3B8', fontStyle: 'italic', fontSize: '0.85rem' }}>Sin alzas significativas.</div>
                                ) : stats.topTrends.map((t: TrendItem) => (
                                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem', backgroundColor: '#F8FAFC', borderRadius: '10px' }}>
                                        <div style={{ maxWidth: '60%' }}>
                                            <div style={{ fontWeight: '700', color: '#334155', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                                        </div>
                                        <div style={{ color: '#EF4444', fontWeight: '900', fontSize: '0.9rem' }}>▲{t.trend.toFixed(1)}%</div>
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

                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '3rem' }}>
                    <h3 style={{ margin: '0 0 1.5rem 0', fontWeight: '800', color: '#1E293B', fontSize: '1.25rem' }}>Módulos de Gestión</h3>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                        gap: '2rem'
                    }}>
                        {modules.map((mod) => (
                            <Link href={mod.href} key={mod.title} style={{ textDecoration: 'none' }}>
                                <div style={{
                                    backgroundColor: 'white',
                                    padding: '2rem',
                                    borderRadius: '16px',
                                    height: '100%',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '1rem',
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
                                        width: '50px', height: '50px',
                                        borderRadius: '12px',
                                        backgroundColor: mod.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '1.5rem'
                                    }}>
                                        {mod.icon}
                                    </div>

                                    <div>
                                        <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold', color: '#1E293B', marginBottom: '0.5rem' }}>
                                            {mod.title}
                                        </h2>
                                        <p style={{ color: '#64748B', lineHeight: '1.5', fontSize: '0.95rem' }}>
                                            {mod.description}
                                        </p>
                                    </div>

                                    <div style={{ marginTop: 'auto', paddingTop: '1rem', fontWeight: '700', color: mod.textColor, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                                        Acceder <span>→</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </main>
    );
}
