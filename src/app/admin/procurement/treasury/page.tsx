'use client';

import { useState, useEffect } from 'react';
import { 
    Wallet, 
    Plus, 
    ArrowUpRight, 
    ArrowDownLeft, 
    Search, 
    Filter, 
    Calendar,
    Banknote,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronRight,
    TrendingUp,
    ShieldCheck,
    CreditCard,
    ArrowRight,
    Building2,
    FileSpreadsheet,
    Receipt
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

export default function TreasuryPage() {
    const [mounted, setMounted] = useState(false);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
        fetchBudgets();
    }, []);

    const fetchBudgets = async () => {
        try {
            const { data, error } = await supabase
                .from('cash_budgets')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            setBudgets(data || []);
        } catch (err) {
            console.error('Error fetching budgets:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    // Dynamic stats calculations
    const todayStr = new Date().toDateString();
    const todayBudgets = budgets.filter(b => new Date(b.created_at).toDateString() === todayStr);
    
    const ejecutadoHoy = todayBudgets
        .filter(b => b.status === 'authorized')
        .reduce((sum, b) => sum + (b.amount || 0), 0);
        
    const cuentasPorPagar = budgets
        .filter(b => b.status === 'pending')
        .reduce((sum, b) => sum + (b.amount || 0), 0);

    const stats = [
        { label: 'Disponible Bancos', value: formatMoney(120000000), icon: <Building2 size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />, color: THEME.colors.textMain },
        { label: 'Caja Planta', value: formatMoney(5000000), icon: <Wallet size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />, color: THEME.colors.primary },
        { label: 'Cuentas por Pagar', value: formatMoney(cuentasPorPagar), icon: <CreditCard size={18} strokeWidth={1.5} style={{ color: '#D97706' }} />, color: '#D97706' },
        { label: 'Ejecutado Hoy', value: formatMoney(ejecutadoHoy), icon: <CheckCircle2 size={18} strokeWidth={1.5} style={{ color: '#16A34A' }} />, color: '#16A34A' }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: THEME.colors.textSecondary, textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={12} strokeWidth={1.5} />
                            <span style={{ color: THEME.colors.primary }}>Tesorería & Crédito</span>
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: THEME.colors.primary }}>Tesorería</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button style={{ 
                            padding: '0.75rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primary, 
                            color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer', 
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background-color 0.2s',
                            fontSize: '0.9rem'
                        }}
                        onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                        onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={1.5} /> Registrar Presupuesto
                        </button>
                    </div>
                </header>

                {/* Stats Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    {stats.map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`,
                            display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ backgroundColor: THEME.colors.background, width: '48px', height: '48px', borderRadius: THEME.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '700', color: stat.color }}>{stat.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content Area */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* Activity List */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Historial de Presupuestos</h2>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                <input placeholder="Buscar..." style={{ padding: '0.4rem 0.75rem 0.4rem 2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.85rem', color: THEME.colors.textMain, outline: 'none' }} />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>Cargando presupuestos...</div>
                        ) : budgets.length === 0 ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <AlertCircle size={40} strokeWidth={1.5} color={THEME.colors.textSecondary} style={{ marginBottom: '1rem' }} />
                                <div style={{ fontSize: '1rem', fontWeight: '600', color: THEME.colors.textSecondary }}>No hay registros</div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <tr>
                                        <th style={{ padding: '0.85rem 1.5rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Fecha</th>
                                        <th style={{ padding: '0.85rem 1.5rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Autorizador</th>
                                        <th style={{ padding: '0.85rem 1.5rem', textAlign: 'right', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Monto</th>
                                        <th style={{ padding: '0.85rem 1.5rem', textAlign: 'right', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {budgets.map((b) => (
                                        <tr key={b.id} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{new Date(b.target_date).toLocaleDateString()}</div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary }}>{b.authorized_by || 'Administrador'}</div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{formatMoney(b.amount)}</div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <span style={{ 
                                                    fontSize: '0.75rem', fontWeight: '600', padding: '0.25rem 0.5rem', borderRadius: '4px',
                                                    backgroundColor: b.status === 'authorized' ? THEME.colors.primaryLight : THEME.colors.background,
                                                    color: b.status === 'authorized' ? THEME.colors.primary : THEME.colors.textSecondary
                                                }}>
                                                    {b.status.toUpperCase()}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Side Panel Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ backgroundColor: '#1E293B', borderRadius: THEME.radius.md, padding: '1.5rem', color: 'white', boxShadow: THEME.shadow.sm }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                                <Banknote size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Operaciones Rápidas
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {[
                                    { label: 'Retiro de Banco', icon: <ArrowUpRight size={16} strokeWidth={1.5} /> },
                                    { label: 'Entrega a Comprador', icon: <ArrowDownLeft size={16} strokeWidth={1.5} /> },
                                    { label: 'Pago Gasto Operativo', icon: <Receipt size={16} strokeWidth={1.5} /> }
                                ].map((act, i) => (
                                    <button key={i} style={{ 
                                        width: '100%', padding: '0.85rem 1rem', borderRadius: THEME.radius.sm, border: '1px solid rgba(255,255,255,0.1)', 
                                        backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: '600', fontSize: '0.9rem',
                                        textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
                                    onMouseOut={e => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                                    >
                                        {act.label} {act.icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1.5rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '1rem', marginTop: 0 }}>Avisos de Cartera</h3>
                            <div style={{ padding: '1.25rem', textAlign: 'center', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.sm, border: `1px dashed ${THEME.colors.border}` }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: '500', color: THEME.colors.textSecondary }}>Sin facturas críticas hoy.</div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </main>
    );
}

