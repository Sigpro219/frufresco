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

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header - Matching HR/Commercial */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: '#64748B', textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={14} />
                            <span style={{ color: '#0891B2' }}>Tesorería & Crédito</span>
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: '#0891B2' }}>Tesorería</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button style={{ 
                            padding: '0.9rem 1.8rem', borderRadius: '18px', backgroundColor: '#0891B2', 
                            color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', 
                            boxShadow: '0 10px 20px -5px rgba(8, 145, 178, 0.4)',
                            display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'transform 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            <Plus size={20} /> Registrar Presupuesto
                        </button>
                    </div>
                </header>

                {/* Stats Dashboard - Matching HR/Commercial */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {[
                        { label: 'Disponible Bancos', value: '$0.00', icon: '🏦', color: '#0F172A' },
                        { label: 'Caja Planta', value: '$0.00', icon: '🏪', color: '#10B981' },
                        { label: 'Cuentas por Pagar', value: '$0.00', icon: '💳', color: '#F59E0B' },
                        { label: 'Ejecutado Hoy', value: '$0.00', icon: '✅', color: '#0891B2' }
                    ].map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', gap: '1.2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '1.8rem', backgroundColor: '#F8FAFC', width: '55px', height: '55px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: stat.color }}>{stat.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content Area */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* Activity List - Matching HR List Style */}
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Historial de Presupuestos</h2>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input placeholder="Buscar..." style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '0.85rem' }} />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8', fontWeight: '600' }}>Cargando presupuestos...</div>
                        ) : budgets.length === 0 ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <AlertCircle size={48} color="#CBD5E1" style={{ marginBottom: '1rem' }} />
                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#64748B' }}>No hay registros</div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                    <tr>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Fecha</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Autorizador</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Monto</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {budgets.map((b) => (
                                        <tr key={b.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ fontWeight: '800', color: '#0F172A' }}>{new Date(b.target_date).toLocaleDateString()}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748B' }}>{b.authorized_by || 'Administrador'}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '900', color: '#0F172A' }}>${new Intl.NumberFormat().format(b.amount)}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                                <span style={{ 
                                                    fontSize: '0.65rem', fontWeight: '900', padding: '0.3rem 0.6rem', borderRadius: '8px',
                                                    backgroundColor: b.status === 'authorized' ? '#DCFCE7' : '#FFFBEB',
                                                    color: b.status === 'authorized' ? '#15803D' : '#B45309'
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
                        <div style={{ backgroundColor: '#1E293B', borderRadius: '24px', padding: '2rem', color: 'white', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '900', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <Banknote size={20} color="#0891B2" /> Operaciones Rápidas
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                {[
                                    { label: 'Retiro de Banco', icon: <ArrowUpRight size={16} /> },
                                    { label: 'Entrega a Comprador', icon: <ArrowDownLeft size={16} /> },
                                    { label: 'Pago Gasto Operativo', icon: <Receipt size={16} /> }
                                ].map((act, i) => (
                                    <button key={i} style={{ 
                                        width: '100%', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', 
                                        backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: '700', 
                                        textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' 
                                    }}>
                                        {act.label} {act.icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0F172A', marginBottom: '1.2rem' }}>Avisos de Cartera</h3>
                            <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#F8FAFC', borderRadius: '18px', border: '1px dashed #E2E8F0' }}>
                                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#94A3B8' }}>Sin facturas críticas hoy.</div>
                            </div>
                        </div>
                    </div>

                </div>

            </div>
        </main>
    );
}
