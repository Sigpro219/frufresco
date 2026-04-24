'use client';

import { useState, useEffect } from 'react';
import { 
    ShoppingCart, 
    Plus, 
    Search, 
    Calendar,
    Scale,
    FileText,
    CheckCircle2,
    Clock,
    AlertCircle,
    ChevronRight,
    MapPin,
    Banknote,
    ArrowRight,
    Filter,
    Building2,
    Truck,
    Zap,
    Utensils,
    Briefcase,
    Coins,
    Package,
    ArrowDownRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function CashOperationsPage() {
    const [mounted, setMounted] = useState(false);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [entryType, setEntryType] = useState<'product' | 'expense'>('product');

    useEffect(() => {
        setMounted(true);
        fetchOperations();
    }, []);

    const fetchOperations = async () => {
        try {
            setLoading(true);
            // Fetch both purchases and expenses
            const [purchasesRes, expensesRes] = await Promise.all([
                supabase.from('purchases').select('*, product:products(name, sku), provider:providers(name)').eq('payment_method', 'cash').order('created_at', { ascending: false }),
                supabase.from('cash_movements').select('*').eq('type', 'expense').order('created_at', { ascending: false })
            ]);
            
            // Combine and sort by date
            const combined = [
                ...(purchasesRes.data || []).map(p => ({ ...p, op_type: 'product' })),
                ...(expensesRes.data || []).map(e => ({ ...e, op_type: 'expense' }))
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setPurchases(combined);
        } catch (err) {
            console.error('Error fetching operations:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!mounted) return null;

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748B', fontSize: '0.9rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: '#64748B', textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={14} />
                            <span style={{ color: '#0891B2' }}>Caja & Gastos</span>
                        </div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
                            Operación de <span style={{ color: '#0891B2' }}>Contado</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={() => setShowAddModal(true)}
                            style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: '18px', backgroundColor: '#0891B2', 
                                color: 'white', border: 'none', fontWeight: '800', cursor: 'pointer', 
                                boxShadow: '0 10px 20px -5px rgba(8, 145, 178, 0.4)',
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'transform 0.2s'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            <Plus size={20} /> Nuevo Registro
                        </button>
                    </div>
                </header>

                {/* Unified Stats Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {[
                        { label: 'Saldo en Caja', value: '$0.00', icon: '💰', color: '#0F172A' },
                        { label: 'Materia Prima (Hoy)', value: '$0.00', icon: '🍎', color: '#0891B2' },
                        { label: 'Gastos Ops (Hoy)', value: '$0.00', icon: '⛽', color: '#F59E0B' },
                        { label: 'Total Egresos', value: '$0.00', icon: '📉', color: '#EF4444' }
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

                {/* Filter Bar */}
                <div style={{ 
                    backgroundColor: 'white', padding: '1rem 1.5rem', borderRadius: '24px', 
                    border: '1px solid #E2E8F0', marginBottom: '2.5rem', display: 'flex', gap: '1rem', 
                    alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                        <input 
                            placeholder="Buscar en la operación..." 
                            style={{ 
                                width: '100%', padding: '0.8rem 2.8rem', borderRadius: '14px', 
                                border: '1.5px solid #F1F5F9', backgroundColor: '#F8FAFC', fontSize: '0.95rem',
                                fontWeight: '600', color: '#1E293B', outline: 'none'
                            }}
                        />
                    </div>
                    <select style={{ padding: '0.8rem 1.2rem', borderRadius: '14px', border: '1.5px solid #F1F5F9', backgroundColor: 'white', fontWeight: '700', color: '#475569' }}>
                        <option>Todos los Movimientos</option>
                        <option>Materia Prima (SKU)</option>
                        <option>Gastos Operativos</option>
                    </select>
                </div>

                {/* Operations Table */}
                <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                            <tr>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Concepto / Detalle</th>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'left', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Categoría</th>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Cantidad / Peso</th>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Total</th>
                                <th style={{ padding: '1rem 1.5rem', textAlign: 'right', color: '#64748B', fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase' }}>Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8', fontWeight: '600' }}>Sincronizando caja...</td></tr>
                            ) : purchases.length === 0 ? (
                                <tr><td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: '#94A3B8', fontWeight: '600' }}>No hay movimientos registrados hoy</td></tr>
                            ) : (
                                purchases.map((op, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '1.2rem 1.5rem' }}>
                                            <div style={{ fontWeight: '800', color: '#0F172A' }}>
                                                {op.op_type === 'product' ? op.product?.name : op.description}
                                            </div>
                                            <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '700' }}>
                                                {op.op_type === 'product' ? `SKU: ${op.product?.sku} • Prov: ${op.provider?.name}` : `Ref: ${op.reference_doc || 'Interno'}`}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', fontWeight: '900', padding: '0.3rem 0.6rem', borderRadius: '8px',
                                                backgroundColor: op.op_type === 'product' ? '#F0F9FF' : '#F1F5F9',
                                                color: op.op_type === 'product' ? '#0891B2' : '#64748B'
                                            }}>
                                                {op.op_type === 'product' ? '📦 PRODUCTO' : (op.category || 'GASTO').toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '700', color: '#1E293B' }}>
                                                {op.op_type === 'product' ? `${op.quantity} ${op.purchase_unit}` : '---'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '900', color: op.op_type === 'product' ? '#0F172A' : '#EF4444' }}>
                                                {op.op_type === 'expense' && '-'}${new Intl.NumberFormat().format(op.op_type === 'product' ? op.total_cost : op.amount)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1.2rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#64748B' }}>
                                                {new Date(op.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Registration Modal */}
                {showAddModal && (
                    <div style={{ position: 'fixed', top:0, left:0, right:0, bottom:0, backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 }}>
                        <div style={{ backgroundColor: 'white', padding: '2.5rem', borderRadius: '32px', width: '100%', maxWidth: '600px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                                <h2 style={{ margin: 0, fontWeight: '900', color: '#0F172A', fontSize: '1.5rem' }}>📝 Registro de <span style={{ color: '#0891B2' }}>Contado</span></h2>
                                <button onClick={() => setShowAddModal(false)} style={{ background: '#F1F5F9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                            </div>

                            {/* Type Selector */}
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', backgroundColor: '#F8FAFC', padding: '0.5rem', borderRadius: '20px' }}>
                                <button 
                                    onClick={() => setEntryType('product')}
                                    style={{ 
                                        flex: 1, padding: '1rem', borderRadius: '16px', border: 'none',
                                        backgroundColor: entryType === 'product' ? 'white' : 'transparent',
                                        color: entryType === 'product' ? '#0891B2' : '#64748B',
                                        fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                                        boxShadow: entryType === 'product' ? '0 4px 6px -1px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    <Package size={20} /> Producto SKU
                                </button>
                                <button 
                                    onClick={() => setEntryType('expense')}
                                    style={{ 
                                        flex: 1, padding: '1rem', borderRadius: '16px', border: 'none',
                                        backgroundColor: entryType === 'expense' ? 'white' : 'transparent',
                                        color: entryType === 'expense' ? '#0891B2' : '#64748B',
                                        fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
                                        boxShadow: entryType === 'expense' ? '0 4px 6px -1px rgba(0,0,0,0.05)' : 'none'
                                    }}
                                >
                                    <ArrowDownRight size={20} /> Gasto / Servicio
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                                {entryType === 'product' ? (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Seleccionar Producto SKU</label>
                                            <select style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '700', backgroundColor: 'white' }}>
                                                <option>Cargando productos...</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Cantidad / Peso</label>
                                                <input type="number" placeholder="0.00" style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Precio Unitario</label>
                                                <input type="number" placeholder="$0" style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600' }} />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Categoría de Gasto</label>
                                            <select style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '700', backgroundColor: 'white' }}>
                                                <option>TRANSPORTE</option>
                                                <option>ALIMENTACION</option>
                                                <option>COMBUSTIBLE</option>
                                                <option>SERVICIOS</option>
                                                <option>VIATICOS</option>
                                                <option>OTROS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Descripción / Referencia</label>
                                            <input placeholder="Ej: Peaje Andes Ref 123" style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '900', color: '#64748B', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Monto Total</label>
                                            <input type="number" placeholder="$0" style={{ width: '100%', padding: '1rem', borderRadius: '14px', border: '1.5px solid #E2E8F0', fontWeight: '600' }} />
                                        </div>
                                    </>
                                )}

                                <button style={{ 
                                    marginTop: '1rem', padding:'1.1rem', borderRadius:'18px', border: 'none', 
                                    backgroundColor:'#0891B2', color:'white', fontWeight:'900', cursor: 'pointer',
                                    boxShadow: '0 10px 15px -3px rgba(8, 145, 178, 0.3)', fontSize: '1rem'
                                }}>
                                    🚀 COMPLETAR REGISTRO
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
