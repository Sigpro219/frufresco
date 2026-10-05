'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Receipt, 
    Plus, 
    Search, 
    Calendar,
    Truck, 
    Zap, 
    Utensils, 
    Briefcase, 
    CheckCircle2, 
    AlertCircle, 
    ChevronRight, 
    ArrowDownRight, 
    Filter, 
    Fuel,
    Box,
    Coins,
    Loader2,
    X,
    Wallet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

interface ExpenseRecord {
    id: string;
    amount: number;
    category: string;
    description: string;
    reference_doc: string | null;
    created_at: string;
    type: string;
}

export default function ExpensesPage() {
    const [mounted, setMounted] = useState(false);
    const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
    const [dailyBudget, setDailyBudget] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('all');

    // Modal Form State
    const [category, setCategory] = useState('transporte');
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [referenceDoc, setReferenceDoc] = useState('');
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
            const todayDateStr = new Date().toISOString().split('T')[0];

            // 1. Fetch expenses for today
            const [expRes, budgetRes] = await Promise.all([
                supabase
                    .from('cash_movements')
                    .select('*')
                    .eq('type', 'expense')
                    .gte('created_at', todayIso)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('cash_budgets')
                    .select('amount')
                    .eq('target_date', todayDateStr)
                    .eq('status', 'authorized')
            ]);

            if (expRes.error) throw expRes.error;
            setExpenses(expRes.data || []);

            const totalBudget = (budgetRes.data || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            setDailyBudget(totalBudget);

        } catch (err: any) {
            console.error('Error fetching expenses:', err?.message || err);
        } finally {
            setLoading(false);
        }
    };

    // Filtered expenses
    const filteredExpenses = useMemo(() => {
        return expenses.filter(exp => {
            // Category filter
            if (selectedCategory !== 'all' && (exp.category || '').toLowerCase() !== selectedCategory.toLowerCase()) {
                return false;
            }

            // Search query
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            const desc = (exp.description || '').toLowerCase();
            const cat = (exp.category || '').toLowerCase();
            const ref = (exp.reference_doc || '').toLowerCase();
            return desc.includes(q) || cat.includes(q) || ref.includes(q);
        });
    }, [expenses, searchQuery, selectedCategory]);

    const handleCreateExpense = async () => {
        setModalError(null);
        setSubmitting(true);

        try {
            if (!description.trim()) {
                throw new Error('Debe ingresar el concepto o descripción del gasto.');
            }
            const amountNum = parseFloat(amount);
            if (isNaN(amountNum) || amountNum <= 0) {
                throw new Error('El monto del gasto debe ser mayor a $0.');
            }

            const payload = {
                type: 'expense',
                category: category.toLowerCase(),
                description: description.trim(),
                amount: amountNum,
                reference_doc: referenceDoc.trim() || null
            };

            const { error: insErr } = await supabase.from('cash_movements').insert([payload]);
            if (insErr) throw insErr;

            if ((window as any).showToast) {
                (window as any).showToast('Gasto operativo legalizado con éxito', 'success');
            }

            setShowModal(false);
            setDescription('');
            setAmount('');
            setReferenceDoc('');
            setCategory('transporte');

            await fetchData();
        } catch (err: any) {
            setModalError(err.message || 'Error al registrar el gasto');
        } finally {
            setSubmitting(false);
        }
    };

    if (!mounted) return null;

    // Real dynamic totals by category
    const sumByCategory = (catKey: string) => {
        return expenses
            .filter(exp => (exp.category || '').toLowerCase() === catKey.toLowerCase())
            .reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
    };

    const totalGastosHoy = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
    const saldoPresupuesto = dailyBudget > 0 ? dailyBudget - totalGastosHoy : 0;

    const expenseCategories = [
        { key: 'transporte', name: 'Transporte & Fletes', icon: <Truck size={18} strokeWidth={1.5} />, color: '#DC2626', value: sumByCategory('transporte') },
        { key: 'coteros', name: 'Coteros & Cargue', icon: <Box size={18} strokeWidth={1.5} />, color: '#D97706', value: sumByCategory('coteros') },
        { key: 'combustible', name: 'Combustible', icon: <Fuel size={18} strokeWidth={1.5} />, color: '#7C3AED', value: sumByCategory('combustible') },
        { key: 'alimentacion', name: 'Alimentación', icon: <Utensils size={18} strokeWidth={1.5} />, color: '#0EA5E9', value: sumByCategory('alimentacion') }
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
                            <span style={{ color: THEME.colors.primary }}>Gastos Operativos</span>
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: THEME.colors.primary }}>Gastos</span>
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
                            <Coins size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Caja Menor
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
                            <Plus size={16} strokeWidth={2} /> Legalizar Gasto
                        </button>
                    </div>
                </header>

                {/* Categories Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                    {expenseCategories.map((cat, i) => (
                        <div 
                            key={i} 
                            onClick={() => setSelectedCategory(selectedCategory === cat.key ? 'all' : cat.key)}
                            style={{ 
                                backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, 
                                border: selectedCategory === cat.key ? `2px solid ${cat.color}` : `1px solid ${THEME.colors.border}`,
                                display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: THEME.shadow.sm, cursor: 'pointer',
                                transition: 'all 0.15s'
                            }}
                        >
                            <div style={{ backgroundColor: THEME.colors.background, width: '48px', height: '48px', borderRadius: THEME.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.color }}>
                                {cat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.name}</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: THEME.colors.textMain, margin: '2px 0' }}>{formatMoney(cat.value)}</div>
                                <div style={{ fontSize: '0.7rem', color: selectedCategory === cat.key ? cat.color : THEME.colors.textSecondary, fontWeight: '600' }}>
                                    {selectedCategory === cat.key ? 'Filtrando categoría ✓' : 'Clic para filtrar'}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* Activity List */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>
                                    Egresos Legalizados Hoy ({filteredExpenses.length})
                                </h2>
                                <p style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, margin: '2px 0 0 0' }}>Comprobantes físicos radicados por la cuadrilla de plaza.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <div style={{ position: 'relative', minWidth: '220px' }}>
                                    <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                    <input 
                                        placeholder="Buscar por concepto o ref..." 
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{ width: '100%', padding: '0.45rem 0.75rem 0.45rem 2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.85rem', color: THEME.colors.textMain, outline: 'none' }} 
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                {selectedCategory !== 'all' && (
                                    <button 
                                        onClick={() => setSelectedCategory('all')}
                                        style={{ padding: '0.45rem 0.75rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: '#F3F4F6', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', color: THEME.colors.textSecondary }}
                                    >
                                        Limpiar Filtro
                                    </button>
                                )}
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem auto', color: THEME.colors.primary }} />
                                Sincronizando egresos...
                            </div>
                        ) : filteredExpenses.length === 0 ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <AlertCircle size={36} strokeWidth={1.5} color={THEME.colors.textSecondary} style={{ margin: '0 auto 1rem auto' }} />
                                <div style={{ fontSize: '1rem', fontWeight: '700', color: THEME.colors.textMain }}>No hay gastos registrados hoy</div>
                                <div style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, marginTop: '4px' }}>
                                    Haz clic en "Legalizar Gasto" para asentar comprobantes de transporte, coteros o viáticos.
                                </div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <tr>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Descripción / Soporte</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Categoría</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Monto Pagado</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Hora</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredExpenses.map((exp) => (
                                        <tr key={exp.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }}>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>{exp.description || 'Gasto Operativo'}</div>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.2rem' }}>
                                                    Soporte / Ref: {exp.reference_doc || 'Comprobante Interno'}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <span style={{ 
                                                    fontSize: '0.7rem', fontWeight: '800', padding: '0.25rem 0.6rem', borderRadius: '6px',
                                                    backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A'
                                                }}>
                                                    {(exp.category || 'GENERAL').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '800', color: '#DC2626', fontSize: '0.95rem' }}>
                                                    –{formatMoney(exp.amount)}
                                                </div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.82rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                    {new Date(exp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Summary Card */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '1.75rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, alignSelf: 'start' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '1.25rem', marginTop: 0 }}>
                            Consolidado de Egresos
                        </h3>
                        
                        <div style={{ padding: '1.25rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.sm, marginBottom: '1.5rem', border: `1px solid ${THEME.colors.border}` }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                                Total Gastos Legalizados Hoy
                            </div>
                            <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#DC2626' }}>
                                {formatMoney(totalGastosHoy)}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                                <span style={{ color: THEME.colors.textSecondary, fontWeight: '500' }}>Presupuesto Asignado:</span>
                                <span style={{ fontWeight: '700', color: THEME.colors.textMain }}>{dailyBudget > 0 ? formatMoney(dailyBudget) : 'Sin asignar'}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                                <span style={{ color: THEME.colors.textSecondary, fontWeight: '500' }}>Comprobantes Registrados:</span>
                                <span style={{ fontWeight: '700', color: THEME.colors.textMain }}>{expenses.length}</span>
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <AlertCircle size={15} color="#D97706" />
                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#D97706', textTransform: 'uppercase' }}>Regla de Soporte Físico</span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, lineHeight: '1.5', margin: 0 }}>
                                Todo recibo de cotero, peaje o flete de plaza debe coincidir con el campo de referencia para la auditoría de cierre en patio de bodega.
                            </p>
                        </div>
                    </div>

                </div>

                {/* Expense Modal */}
                {showModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '520px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.35rem' }}>
                                        Legalizar <span style={{ color: '#DC2626' }}>Gasto Operativo</span>
                                    </h2>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                        Registra fletes, coteros, empaques o viáticos pagados en efectivo en plaza.
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
                                        Categoría de Gasto *
                                    </label>
                                    <select 
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '700', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                    >
                                        <option value="transporte">TRANSPORTE / FLETES</option>
                                        <option value="coteros">COTEROS / CARGUE & DESCARGUE</option>
                                        <option value="combustible">COMBUSTIBLE / GASOLINA</option>
                                        <option value="alimentacion">ALIMENTACIÓN / REFRIGERIOS</option>
                                        <option value="empaques">EMPAQUES / BOLSAS / COSTALES</option>
                                        <option value="viaticos">VIÁTICOS / PEAJES</option>
                                        <option value="servicios">SERVICIOS / MANTENIMIENTO</option>
                                        <option value="otros">OTROS GASTOS</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                        Descripción / Concepto *
                                    </label>
                                    <input 
                                        placeholder="Ej: Flete camioneta plaza Corabastos a bodega central"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                            Monto Pagado ($ COP) *
                                        </label>
                                        <input 
                                            type="number"
                                            placeholder="$0"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '800', color: '#DC2626', outline: 'none', fontSize: '1rem' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                            No. Recibo / Soporte
                                        </label>
                                        <input 
                                            placeholder="Ej: Vale #104"
                                            value={referenceDoc}
                                            onChange={(e) => setReferenceDoc(e.target.value)}
                                            style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                        />
                                    </div>
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
                                        onClick={handleCreateExpense}
                                        disabled={submitting}
                                        style={{ 
                                            flex: 2, padding: '0.75rem', borderRadius: THEME.radius.sm, border: 'none', 
                                            backgroundColor: '#DC2626', color: 'white', fontWeight: '800', 
                                            cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.92rem',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="animate-spin" size={16} /> Legalizando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={16} /> Confirmar Gasto
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
