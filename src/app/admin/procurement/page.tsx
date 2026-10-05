'use client';

import { useState, useEffect } from 'react';
import { 
    Wallet, 
    Coins, 
    ArrowRight, 
    TrendingDown, 
    Handshake, 
    Receipt,
    UserSquare2,
    FileSpreadsheet,
    ShieldCheck,
    Printer,
    DollarSign,
    RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';

export default function ProcurementHub() {
    const [mounted, setMounted] = useState(false);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        budgetToday: 0,
        spentToday: 0,
        remainingToday: 0,
        activeProviders: 0
    });

    const loadLiveStats = async () => {
        try {
            setLoading(true);
            const today = new Date().toISOString().split('T')[0];
            const startIso = `${today}T00:00:00`;
            const endIso = `${today}T23:59:59.999`;

            // 1. Presupuesto autorizado de hoy
            const { data: budgets } = await supabase
                .from('cash_budgets')
                .select('amount')
                .eq('target_date', today)
                .eq('status', 'authorized');
            
            const totalBudget = (budgets || []).reduce((acc, b) => acc + (Number(b.amount) || 0), 0);

            // 2. Compras en efectivo de hoy
            const { data: purchases } = await supabase
                .from('purchases')
                .select('total_cost')
                .eq('payment_method', 'cash')
                .gte('created_at', startIso)
                .lte('created_at', endIso);

            const totalPurchases = (purchases || []).reduce((acc, p) => acc + (Number(p.total_cost) || 0), 0);

            // 3. Gastos operativos de hoy
            const { data: movements } = await supabase
                .from('cash_movements')
                .select('amount')
                .eq('type', 'expense')
                .gte('created_at', startIso)
                .lte('created_at', endIso);

            const totalExpenses = (movements || []).reduce((acc, m) => acc + (Number(m.amount) || 0), 0);

            const totalSpent = totalPurchases + totalExpenses;

            // 4. Proveedores activos
            const { count: providersCount } = await supabase
                .from('providers')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true);

            setStats({
                budgetToday: totalBudget,
                spentToday: totalSpent,
                remainingToday: totalBudget - totalSpent,
                activeProviders: providersCount || 0
            });
        } catch (err) {
            console.error('Error cargando telemetría de compras:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setMounted(true);
        loadLiveStats();
    }, []);

    if (!mounted) return null;

    const modules = [
        {
            id: 'cash-ops',
            title: 'Caja Menor & Compras Gemba',
            description: 'Operación táctica en Corabastos y campo: Compra de materia prima SKU, registro ágil de egresos y arqueo en vivo.',
            icon: <Coins size={26} strokeWidth={1.5} />,
            color: '#10B981',
            link: '/admin/procurement/cash',
            features: ['Compra de Producto (SKU)', 'Alerta Andon de Liquidez', 'Arqueo de Efectivo']
        },
        {
            id: 'treasury',
            title: 'Tesorería & Presupuestos',
            description: 'Aprobación y desembolso de fondos diarios, gobernanza de techos de gasto y conciliación de saldos de plaza.',
            icon: <Wallet size={26} strokeWidth={1.5} />,
            color: THEME.colors.primary,
            link: '/admin/procurement/treasury',
            features: ['Autorización Diaria', 'Control de Techos', 'Auditoría de Remanentes']
        },
        {
            id: 'expenses',
            title: 'Legalización de Gastos',
            description: 'Clasificación contable y legalización de fletes, coteros, peajes, empaques y viáticos con soporte documental.',
            icon: <Receipt size={26} strokeWidth={1.5} />,
            color: '#F59E0B',
            link: '/admin/procurement/expenses',
            features: ['8 Categorías de Plaza', 'Control de Vales & Soportes', 'Imputación Atómica']
        },
        {
            id: 'providers',
            title: 'Directorio de Proveedores',
            description: 'Maestro de productores y aliados comerciales: condiciones de crédito, homologación contable y bóveda documental.',
            icon: <UserSquare2 size={26} strokeWidth={1.5} />,
            color: '#6366F1',
            link: '/admin/procurement/providers',
            features: ['Bóveda RUT & Bancaria', 'Importación Masiva Excel', 'Acuerdos de Crédito']
        }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', color: THEME.colors.textMain, padding: '2rem 1.5rem' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <h1 style={{ fontSize: '1.9rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.025em' }}>
                            Consola Central de <span style={{ color: THEME.colors.primary }}>Compras 360</span>
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '0.9rem', marginTop: '0.3rem' }}>
                            Gobernanza financiera integral, abastecimiento en Corabastos y liquidación de egresos.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button 
                            onClick={loadLiveStats}
                            style={{ 
                                padding: '0.6rem 0.9rem', borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.surface, 
                                color: THEME.colors.textSecondary, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}
                            title="Recargar telemetría"
                        >
                            <RefreshCw size={15} strokeWidth={1.5} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <Link href="/admin/procurement/receiving-print" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.6rem 1.1rem', borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.surface, 
                                color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}>
                                <Printer size={16} strokeWidth={1.5} color={THEME.colors.primary} /> Formato Recepción
                            </button>
                        </Link>
                        <Link href="/admin/procurement/export" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.6rem 1.1rem', borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.surface, 
                                color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}>
                                <FileSpreadsheet size={16} strokeWidth={1.5} color={THEME.colors.primary} /> Exportar WorldOffice
                            </button>
                        </Link>
                    </div>
                </header>

                {/* Stats Dashboard - Live Telemetry */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {[
                        { 
                            label: 'Presupuesto Hoy', 
                            value: formatMoney(stats.budgetToday), 
                            icon: <Coins size={20} strokeWidth={1.5} />, 
                            color: THEME.colors.primary, 
                            badge: 'Autorizado' 
                        },
                        { 
                            label: 'Ejecutado en Plaza', 
                            value: formatMoney(stats.spentToday), 
                            icon: <TrendingDown size={20} strokeWidth={1.5} />, 
                            color: '#EF4444', 
                            badge: 'Compras + Gastos' 
                        },
                        { 
                            label: 'Remanente en Caja', 
                            value: formatMoney(stats.remainingToday), 
                            icon: <DollarSign size={20} strokeWidth={1.5} />, 
                            color: stats.remainingToday < 300000 && stats.budgetToday > 0 ? '#DC2626' : '#10B981', 
                            badge: 'Disponible Gemba' 
                        },
                        { 
                            label: 'Proveedores Activos', 
                            value: formatNumber(stats.activeProviders), 
                            icon: <Handshake size={20} strokeWidth={1.5} />, 
                            color: '#6366F1', 
                            badge: 'Directorio' 
                        }
                    ].map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: THEME.colors.surface, padding: '1.25rem', borderRadius: '18px', border: `1px solid ${THEME.colors.border}`,
                            display: 'flex', flexDirection: 'column', gap: '0.6rem', boxShadow: THEME.shadow.sm,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = THEME.shadow.md;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = THEME.shadow.sm;
                        }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ backgroundColor: `${stat.color}15`, width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color, flexShrink: 0 }}>
                                    {stat.icon}
                                </div>
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', backgroundColor: THEME.colors.background, color: THEME.colors.textSecondary }}>
                                    {stat.badge}
                                </span>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, marginTop: '2px' }}>
                                    {loading ? '...' : stat.value}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Modules Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
                    {modules.map((module) => (
                        <Link key={module.id} href={module.link} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div 
                                style={{ 
                                    backgroundColor: THEME.colors.surface, borderRadius: '20px', padding: '1.75rem', border: `1px solid ${THEME.colors.border}`,
                                    boxShadow: THEME.shadow.sm, 
                                    display: 'flex', flexDirection: 'column', height: '100%',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative', overflow: 'hidden', cursor: 'pointer'
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.lg;
                                    e.currentTarget.style.borderColor = module.color;
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.2rem' }}>
                                    <div style={{ 
                                        width: '48px', height: '48px', borderRadius: '14px', 
                                        backgroundColor: `${module.color}15`, color: module.color, 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {module.icon}
                                    </div>
                                    <div style={{ 
                                        width: '32px', height: '32px', borderRadius: '50%', backgroundColor: THEME.colors.background,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <ArrowRight size={16} strokeWidth={1.5} color={THEME.colors.textSecondary} />
                                    </div>
                                </div>
                                
                                <h2 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.2rem', marginBottom: '0.4rem', letterSpacing: '-0.02em' }}>
                                    {module.title}
                                </h2>
                                <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', lineHeight: '1.5', fontWeight: '400', marginBottom: '1.25rem', flex: 1 }}>
                                    {module.description}
                                </p>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', padding: '0.75rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md }}>
                                    {module.features.map((f, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                            <ShieldCheck size={13} strokeWidth={1.5} color={module.color} />
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary }}>{f}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

            </div>
        </main>
    );
}
