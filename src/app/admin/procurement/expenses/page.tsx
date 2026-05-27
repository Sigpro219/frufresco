'use client';

import { useState, useEffect } from 'react';
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
    Clock,
    AlertCircle,
    ChevronRight,
    TrendingDown,
    ArrowDownRight,
    Filter,
    ArrowRight,
    Building2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

export default function ExpensesPage() {
    const [mounted, setMounted] = useState(false);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        try {
            const { data, error } = await supabase
                .from('cash_movements')
                .select('*')
                .eq('type', 'expense')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setExpenses(data || []);
        } catch (err) {
            console.error('Error fetching expenses:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    // Dynamically calculate expenses by category
    const sumByCategory = (categoryName: string) => {
        const catNorm = categoryName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        return expenses
            .filter(exp => {
                const expCat = (exp.category || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                return expCat === catNorm;
            })
            .reduce((sum, exp) => sum + (exp.amount || 0), 0);
    };

    const totalTransporte = sumByCategory('transporte');
    const totalServicios = sumByCategory('servicios');
    const totalAlimentacion = sumByCategory('alimentacion');
    const totalViaticos = sumByCategory('viaticos');

    const todayStr = new Date().toDateString();
    const todayExpenses = expenses.filter(exp => new Date(exp.created_at).toDateString() === todayStr);
    const totalGastosHoy = todayExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const saldoDisponible = 5000000 - totalGastosHoy; // baseline limit minus today's expenses

    const expenseCategories = [
        { name: 'Transporte', icon: <Truck size={18} strokeWidth={1.5} />, color: '#DC2626', value: totalTransporte },
        { name: 'Servicios', icon: <Zap size={18} strokeWidth={1.5} />, color: '#0EA5E9', value: totalServicios },
        { name: 'Alimentación', icon: <Utensils size={18} strokeWidth={1.5} />, color: '#D97706', value: totalAlimentacion },
        { name: 'Viáticos', icon: <Briefcase size={18} strokeWidth={1.5} />, color: '#7C3AED', value: totalViaticos }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                            <Plus size={16} strokeWidth={1.5} /> Legalizar Gasto
                        </button>
                    </div>
                </header>

                {/* Categories Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                    {expenseCategories.map((cat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: THEME.colors.surface, padding: '1.25rem 1.5rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`,
                            display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ backgroundColor: THEME.colors.background, width: '48px', height: '48px', borderRadius: THEME.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.color }}>
                                {cat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{cat.name}</div>
                                <div style={{ fontSize: '1.35rem', fontWeight: '700', color: THEME.colors.textMain }}>{formatMoney(cat.value)}</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* Activity List */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, margin: 0 }}>Flujo de Caja Fija</h2>
                            <div style={{ position: 'relative' }}>
                                <Search size={14} strokeWidth={1.5} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                                <input placeholder="Buscar gasto..." style={{ padding: '0.4rem 0.75rem 0.4rem 2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.85rem', color: THEME.colors.textMain, outline: 'none' }} />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>Cargando egresos...</div>
                        ) : expenses.length === 0 ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <AlertCircle size={40} strokeWidth={1.5} color={THEME.colors.textSecondary} style={{ marginBottom: '1rem' }} />
                                <div style={{ fontSize: '1rem', fontWeight: '600', color: THEME.colors.textSecondary }}>No hay registros</div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <tr>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Descripción</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Categoría</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Monto</th>
                                        <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((exp) => (
                                        <tr key={exp.id} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>{exp.description || 'Gasto Operativo'}</div>
                                                <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.2rem' }}>Ref: {exp.reference_doc || 'N/A'}</div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: '600', color: THEME.colors.textSecondary, backgroundColor: THEME.colors.background, padding: '3px 8px', borderRadius: '4px' }}>
                                                    {(exp.category || 'GENERAL').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '600', color: '#DC2626' }}>–{formatMoney(exp.amount)}</div>
                                            </td>
                                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary }}>{new Date(exp.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Summary Card */}
                    <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, padding: '2rem', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm, alignSelf: 'start' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '1.5rem', marginTop: 0 }}>Estado de Caja Planta</h3>
                        
                        <div style={{ padding: '1.25rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.sm, marginBottom: '1.5rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Saldo Disponible</div>
                            <div style={{ fontSize: '1.8rem', fontWeight: '700', color: THEME.colors.textMain }}>{formatMoney(saldoDisponible)}</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', color: THEME.colors.textSecondary }}>Ingresos Hoy</span>
                                <span style={{ fontWeight: '600', color: '#16A34A' }}>+{formatMoney(0)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', color: THEME.colors.textSecondary }}>Gastos Hoy</span>
                                <span style={{ fontWeight: '600', color: '#DC2626' }}>–{formatMoney(totalGastosHoy)}</span>
                            </div>
                        </div>

                        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <AlertCircle size={16} strokeWidth={1.5} color="#D97706" />
                                <span style={{ fontSize: '0.8rem', fontWeight: '600', color: '#D97706', textTransform: 'uppercase' }}>Aviso de Fondos</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary, fontWeight: '400', lineHeight: '1.5', margin: 0 }}>
                                El saldo de caja planta debe ser conciliado diariamente con el reporte de WorldOffice.
                            </p>
                        </div>
                    </div>

                </div>

            </div>
        </main>
    );
}

