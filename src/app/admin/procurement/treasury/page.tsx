'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Wallet, 
    Plus, 
    ArrowUpRight, 
    ArrowDownLeft, 
    Search, 
    Calendar,
    Banknote,
    CheckCircle2, 
    Clock, 
    AlertCircle, 
    ChevronRight, 
    TrendingUp, 
    Building2, 
    Receipt,
    Coins,
    Loader2,
    X,
    ArrowRight,
    Lock
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

interface BudgetRecord {
    id: string;
    amount: number;
    target_date: string;
    status: 'authorized' | 'pending' | 'closed';
    notes: string | null;
    created_at: string;
    authorized_by: string | null;
}

export default function TreasuryPage() {
    const [mounted, setMounted] = useState(false);
    const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Operational Metrics from Real DB
    const [todayExecuted, setTodayExecuted] = useState<number>(0);

    // Form State
    const [budgetAmount, setBudgetAmount] = useState('');
    const [budgetDate, setBudgetDate] = useState(new Date().toISOString().split('T')[0]);
    const [budgetNotes, setBudgetNotes] = useState('');
    const [budgetStatus, setBudgetStatus] = useState<'authorized' | 'pending'>('authorized');
    const [modalError, setModalError] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayIso = todayStart.toISOString();

            // 1. Fetch budgets
            const { data: bData, error: bErr } = await supabase
                .from('cash_budgets')
                .select('*')
                .order('target_date', { ascending: false });

            if (bErr) throw bErr;
            setBudgets(bData || []);

            // 2. Fetch today's executed purchases & expenses to calculate real execution
            const [purchasesRes, expensesRes] = await Promise.all([
                supabase.from('purchases').select('total_cost').eq('payment_method', 'cash').gte('created_at', todayIso),
                supabase.from('cash_movements').select('amount').eq('type', 'expense').gte('created_at', todayIso)
            ]);

            const sumPurchases = (purchasesRes.data || []).reduce((acc: number, curr: any) => acc + (Number(curr.total_cost) || 0), 0);
            const sumExpenses = (expensesRes.data || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            setTodayExecuted(sumPurchases + sumExpenses);

        } catch (err: any) {
            console.error('Error fetching treasury data:', err?.message || err);
        } finally {
            setLoading(false);
        }
    };

    // Filtered budgets
    const filteredBudgets = useMemo(() => {
        if (!searchQuery.trim()) return budgets;
        const q = searchQuery.toLowerCase();
        return budgets.filter(b => {
            const dateMatch = (b.target_date || '').includes(q);
            const notesMatch = (b.notes || '').toLowerCase().includes(q);
            const statusMatch = (b.status || '').toLowerCase().includes(q);
            return dateMatch || notesMatch || statusMatch;
        });
    }, [budgets, searchQuery]);

    const handleCreateBudget = async () => {
        setModalError(null);
        setSubmitting(true);

        try {
            const amountNum = parseFloat(budgetAmount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error('El monto del presupuesto debe ser mayor a $0.');
            }
            if (!budgetDate) {
                throw new Error('Debe especificar la fecha de aplicación.');
            }

            const payload = {
                amount: amountNum,
                target_date: budgetDate,
                status: budgetStatus,
                notes: budgetNotes.trim() || null
            };

            const { error: insErr } = await supabase.from('cash_budgets').insert([payload]);
            if (insErr) throw insErr;

            if ((window as any).showToast) {
                (window as any).showToast('Presupuesto de plaza asignado con éxito', 'success');
            }

            setShowModal(false);
            setBudgetAmount('');
            setBudgetNotes('');
            setBudgetStatus('authorized');

            await fetchData();
        } catch (err: any) {
            setModalError(err.message || 'Error al guardar presupuesto');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseBudget = async (id: string) => {
        if (!confirm('¿Deseas cerrar este presupuesto diario? Esto congelará la asignación de la jornada.')) return;
        try {
            const { error } = await supabase.from('cash_budgets').update({ status: 'closed' }).eq('id', id);
            if (error) throw error;
            await fetchData();
        } catch (err: any) {
            alert('Error al cerrar presupuesto: ' + err.message);
        }
    };

    if (!mounted) return null;

    // Real dynamic calculations
    const todayStr = new Date().toISOString().split('T')[0];
    const todayBudgets = budgets.filter(b => b.target_date === todayStr && b.status === 'authorized');
    const presupuestoHoy = todayBudgets.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
    const remanentePlaza = presupuestoHoy - todayExecuted;

    const pendientesAutorizar = budgets
        .filter(b => b.status === 'pending')
        .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

    const stats = [
        { 
            label: 'Presupuesto Hoy', 
            value: presupuestoHoy > 0 ? formatMoney(presupuestoHoy) : 'Sin Asignar', 
            icon: <Wallet size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />, 
            color: presupuestoHoy > 0 ? THEME.colors.primary : '#D97706',
            helper: `${todayBudgets.length} asignaciones autorizadas`
        },
        { 
            label: 'Ejecutado en Plaza', 
            value: formatMoney(todayExecuted), 
            icon: <Banknote size={18} strokeWidth={1.5} style={{ color: THEME.colors.textMain }} />, 
            color: THEME.colors.textMain,
            helper: 'Compras SKU + Gastos Ops'
        },
        { 
            label: 'Saldo Remanente', 
            value: formatMoney(remanentePlaza), 
            icon: <Coins size={18} strokeWidth={1.5} style={{ color: remanentePlaza < 300000 && presupuestoHoy > 0 ? '#DC2626' : '#16A34A' }} />, 
            color: remanentePlaza < 300000 && presupuestoHoy > 0 ? '#DC2626' : '#16A34A',
            helper: remanentePlaza < 300000 && presupuestoHoy > 0 ? 'Liquidez crítica' : 'Fondo disponible'
        },
        { 
            label: 'Bolsas Pendientes', 
            value: formatMoney(pendientesAutorizar), 
            icon: <Clock size={18} strokeWidth={1.5} style={{ color: '#D97706' }} />, 
            color: '#D97706',
            helper: `${budgets.filter(b => b.status === 'pending').length} solicitudes por aprobar`
        }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: THEME.colors.textSecondary, textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={12} strokeWidth={1.5} />
                            <span style={{ color: THEME.colors.primary }}>Tesorería & Presupuestos</span>
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: THEME.colors.primary }}>Tesorería</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Link 
                            href="/admin/procurement/cash"
                            style={{ 
                                padding: '0.75rem 1.25rem', borderRadius: THEME.radius.md, backgroundColor: 'white',
                                color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, fontWeight: '700',
                                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem',
                                boxShadow: THEME.shadow.sm
                            }}
                        >
                            <Coins size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Ver Caja Menor
                        </Link>
                        <button 
                            onClick={() => { setModalError(null); setShowModal(true); }}
                            style={{ 
                                padding: '0.75rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primary, 
                                color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background-color 0.2s',
                                fontSize: '0.9rem', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={2} /> Asignar Presupuesto
                        </button>
                    </div>
                </header>

                {/* Stats Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                    {stats.map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`,
                            display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ backgroundColor: THEME.colors.background, width: '48px', height: '48px', borderRadius: THEME.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: stat.color, margin: '2px 0' }}>{stat.value}</div>
                                <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>{stat.helper}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Main Content Area */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* Activity List */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>Historial de Presupuestos de Plaza</h2>
                                <p style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, margin: '2px 0 0 0' }}>Bolsas de efectivo asignadas a cuadrillas operativas.</p>
                            </div>
                            <div style={{ position: 'relative', minWidth: '220px' }}>
                                <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                <input 
                                    placeholder="Buscar por fecha o notas..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.85rem', color: THEME.colors.textMain, outline: 'none' }} 
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem auto', color: THEME.colors.primary }} />
                                Cargando presupuestos de tesorería...
                            </div>
                        ) : filteredBudgets.length === 0 ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <AlertCircle size={36} strokeWidth={1.5} color={THEME.colors.textSecondary} style={{ margin: '0 auto 1rem auto' }} />
                                <div style={{ fontSize: '1rem', fontWeight: '700', color: THEME.colors.textMain }}>No hay presupuestos registrados</div>
                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                                    Haz clic en "Asignar Presupuesto" para habilitar efectivo a las cuadrillas de plaza.
                                </div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <tr>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Fecha Operación</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Notas / Destino</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Monto Asignado</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'center' }}>Estado</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredBudgets.map((b) => (
                                        <tr key={b.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }}>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>
                                                    {new Date(b.target_date + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, marginTop: '2px' }}>
                                                    Radicado: {new Date(b.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontSize: '0.88rem', color: THEME.colors.textMain, fontWeight: '600' }}>
                                                    {b.notes || 'Asignación general para cuadrilla de compras'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '1rem' }}>
                                                    {formatMoney(b.amount)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'center' }}>
                                                <span style={{ 
                                                    fontSize: '0.7rem', fontWeight: '800', padding: '0.25rem 0.6rem', borderRadius: '6px',
                                                    backgroundColor: b.status === 'authorized' ? '#ECFDF5' : b.status === 'closed' ? '#F3F4F6' : '#FEF3C7',
                                                    color: b.status === 'authorized' ? '#047857' : b.status === 'closed' ? '#4B5563' : '#92400E',
                                                    border: `1px solid ${b.status === 'authorized' ? '#A7F3D0' : b.status === 'closed' ? '#E5E7EB' : '#FDE68A'}`
                                                }}>
                                                    {b.status === 'authorized' ? 'AUTORIZADO' : b.status === 'closed' ? 'CERRADO' : 'PENDIENTE'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                {b.status === 'authorized' && (
                                                    <button 
                                                        onClick={() => handleCloseBudget(b.id)}
                                                        title="Cerrar presupuesto del día"
                                                        style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}
                                                    >
                                                        <Lock size={15} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Side Panel Actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ backgroundColor: '#111827', borderRadius: THEME.radius.md, padding: '1.5rem', color: 'white', boxShadow: THEME.shadow.sm }}>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 0 }}>
                                <Banknote size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Circuito de Efectivo
                            </h3>
                            <p style={{ fontSize: '0.78rem', color: '#9CA3AF', lineHeight: '1.5', margin: '0 0 1.25rem 0' }}>
                                Todo presupuesto autorizado se refleja automáticamente como fondo disponible en la terminal de compras de Corabastos.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <Link 
                                    href="/admin/procurement/cash"
                                    style={{ 
                                        width: '100%', padding: '0.85rem 1rem', borderRadius: THEME.radius.sm, border: '1px solid rgba(255,255,255,0.1)', 
                                        backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: '700', fontSize: '0.88rem',
                                        textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    <span>Ir a Caja Menor & Gastos</span>
                                    <ArrowRight size={16} />
                                </Link>
                                <Link 
                                    href="/admin/procurement/expenses"
                                    style={{ 
                                        width: '100%', padding: '0.85rem 1rem', borderRadius: THEME.radius.sm, border: '1px solid rgba(255,255,255,0.1)', 
                                        backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', fontWeight: '700', fontSize: '0.88rem',
                                        textDecoration: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    <span>Legalizar Fletes & Coteros</span>
                                    <Receipt size={16} />
                                </Link>
                            </div>
                        </div>

                        <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1.5rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.75rem', marginTop: 0 }}>
                                Regla de Auditoría Poka-Yoke
                            </h3>
                            <div style={{ padding: '1rem', backgroundColor: '#F8FAFC', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontSize: '0.78rem', color: THEME.colors.textSecondary, lineHeight: '1.5' }}>
                                <p style={{ margin: '0 0 6px 0', fontWeight: '700', color: THEME.colors.textMain }}>Cierre de Jornada Obligatorio:</p>
                                Al finalizar la mañana de plaza (08:00 AM), el saldo físico sobrante en furgón debe reintegrarse en patio y el presupuesto debe cerrarse para conciliar el balance diario.
                            </div>
                        </div>
                    </div>

                </div>

                {/* Budget Creation Modal */}
                {showModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '520px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.35rem' }}>
                                        Asignar <span style={{ color: THEME.colors.primary }}>Presupuesto</span>
                                    </h2>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                        Habilita fondos en efectivo para las compras de la jornada.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setShowModal(false)} 
                                    style={{ background: THEME.colors.background, border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {modalError && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: THEME.radius.sm, marginBottom: '1rem', color: '#B91C1C', fontSize: '0.82rem', fontWeight: '600' }}>
                                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                    <span>{modalError}</span>
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                        Monto Asignado ($ COP) *
                                    </label>
                                    <input 
                                        type="number"
                                        placeholder="Ej: 5000000"
                                        value={budgetAmount}
                                        onChange={(e) => setBudgetAmount(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '800', color: THEME.colors.primary, fontSize: '1.1rem', outline: 'none' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                            Fecha de Operación *
                                        </label>
                                        <input 
                                            type="date"
                                            value={budgetDate}
                                            onChange={(e) => setBudgetDate(e.target.value)}
                                            style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                            Estado Inicial
                                        </label>
                                        <select 
                                            value={budgetStatus}
                                            onChange={(e) => setBudgetStatus(e.target.value as any)}
                                            style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, backgroundColor: 'white', outline: 'none', fontSize: '0.9rem' }}
                                        >
                                            <option value="authorized">AUTORIZADO</option>
                                            <option value="pending">PENDIENTE</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                        Notas / Cuadrilla de Destino
                                    </label>
                                    <input 
                                        placeholder="Ej: Cuadrilla Corabastos madrugada (Camilo y Wilson)"
                                        value={budgetNotes}
                                        onChange={(e) => setBudgetNotes(e.target.value)}
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', color: THEME.colors.textMain, outline: 'none', fontSize: '0.88rem' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        disabled={submitting}
                                        style={{ 
                                            flex: 1, padding: '0.75rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, 
                                            backgroundColor: '#F3F4F6', color: THEME.colors.textSecondary, fontWeight: '700', cursor: 'pointer',
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={handleCreateBudget}
                                        disabled={submitting}
                                        style={{ 
                                            flex: 2, padding: '0.75rem', borderRadius: THEME.radius.sm, border: 'none', 
                                            backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '800', 
                                            cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.92rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="animate-spin" size={16} /> Asignando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={16} /> Confirmar Asignación
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes spin { to { transform: rotate(360deg); } }
                .animate-spin { animation: spin 1s linear infinite; }
            ` }} />
        </main>
    );
}
