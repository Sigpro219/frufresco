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

    const expenseCategories = [
        { name: 'Transporte', icon: <Truck size={18} />, color: '#EF4444' },
        { name: 'Servicios', icon: <Zap size={18} />, color: '#0EA5E9' },
        { name: 'Alimentación', icon: <Utensils size={18} />, color: '#F59E0B' },
        { name: 'Viáticos', icon: <Briefcase size={18} />, color: '#8B5CF6' }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header - Matching HR/Commercial */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: '#64748B', textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={14} />
                            <span style={{ color: '#0891B2' }}>Gastos Operativos</span>
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: '#0891B2' }}>Gastos</span>
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
                            <Plus size={20} /> Legalizar Gasto
                        </button>
                    </div>
                </header>

                {/* Categories Grid - Matching HR/Commercial Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {expenseCategories.map((cat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', gap: '1.2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '1.5rem', backgroundColor: '#F8FAFC', width: '55px', height: '55px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: cat.color }}>
                                {cat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{cat.name}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A' }}>$0.00</div>
                            </div>
                        </div>
                    ))}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                    
                    {/* Activity List - Matching HR List Style */}
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ padding: '1.5rem', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0F172A', margin: 0 }}>Flujo de Caja Fija</h2>
                            <div style={{ position: 'relative' }}>
                                <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input placeholder="Buscar gasto..." style={{ padding: '0.6rem 1rem 0.6rem 2.5rem', borderRadius: '12px', border: '1px solid #F1F5F9', fontSize: '0.85rem' }} />
                            </div>
                        </div>

                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8', fontWeight: '600' }}>Cargando egresos...</div>
                        ) : expenses.length === 0 ? (
                            <div style={{ padding: '4rem', textAlign: 'center' }}>
                                <AlertCircle size={48} color="#CBD5E1" style={{ marginBottom: '1rem' }} />
                                <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#64748B' }}>No hay registros</div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                    <tr>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Descripción</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Categoría</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Monto</th>
                                        <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expenses.map((exp) => (
                                        <tr key={exp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <div style={{ fontWeight: '800', color: '#0F172A' }}>{exp.description || 'Gasto Operativo'}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700' }}>Ref: {exp.reference_doc || 'N/A'}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem' }}>
                                                <span style={{ fontSize: '0.7rem', fontWeight: '900', color: '#475569', backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px' }}>
                                                    {(exp.category || 'GENERAL').toUpperCase()}
                                                </span>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontWeight: '900', color: '#EF4444' }}>-${new Intl.NumberFormat().format(exp.amount)}</div>
                                            </td>
                                            <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748B' }}>{new Date(exp.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Summary Card - Matching HR Card Style */}
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '2rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: '900', color: '#0F172A', marginBottom: '2rem' }}>Estado de Caja Planta</h3>
                        
                        <div style={{ padding: '1.5rem', backgroundColor: '#F8FAFC', borderRadius: '18px', marginBottom: '2rem' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Saldo Disponible</div>
                            <div style={{ fontSize: '2rem', fontWeight: '900', color: '#0F172A' }}>$0.00</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#64748B' }}>Ingresos Hoy</span>
                                <span style={{ fontWeight: '800', color: '#10B981' }}>+$0.00</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#64748B' }}>Gastos Hoy</span>
                                <span style={{ fontWeight: '800', color: '#EF4444' }}>-$0.00</span>
                            </div>
                        </div>

                        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #F1F5F9' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
                                <AlertCircle size={18} color="#F59E0B" />
                                <span style={{ fontSize: '0.8rem', fontWeight: '900', color: '#F59E0B', textTransform: 'uppercase' }}>Aviso de Fondos</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '500', lineHeight: '1.6', margin: 0 }}>
                                El saldo de caja planta debe ser conciliado diariamente con el reporte de WorldOffice.
                            </p>
                        </div>
                    </div>

                </div>

            </div>
        </main>
    );
}
