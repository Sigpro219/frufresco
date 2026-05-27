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
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

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

    // Calculate dynamic stats
    const todayStr = new Date().toDateString();
    const todayOps = purchases.filter(op => new Date(op.created_at).toDateString() === todayStr);
    
    const matPrimaHoy = todayOps
        .filter(op => op.op_type === 'product')
        .reduce((sum, op) => sum + (op.total_cost || 0), 0);
        
    const gastosHoy = todayOps
        .filter(op => op.op_type === 'expense')
        .reduce((sum, op) => sum + (op.amount || 0), 0);

    const totalEgresos = matPrimaHoy + gastosHoy;
    const saldoCaja = 2500000 - totalEgresos; // Mock baseline starting cash minus egresos

    const stats = [
        { 
            label: 'Saldo en Caja', 
            value: formatMoney(saldoCaja), 
            icon: <Coins size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />, 
            color: THEME.colors.textMain 
        },
        { 
            label: 'Materia Prima (Hoy)', 
            value: formatMoney(matPrimaHoy), 
            icon: <Package size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />, 
            color: THEME.colors.primary 
        },
        { 
            label: 'Gastos Ops (Hoy)', 
            value: formatMoney(gastosHoy), 
            icon: <Truck size={18} strokeWidth={1.5} style={{ color: '#D97706' }} />, 
            color: '#D97706' 
        },
        { 
            label: 'Total Egresos (Hoy)', 
            value: formatMoney(totalEgresos), 
            icon: <ArrowDownRight size={18} strokeWidth={1.5} style={{ color: '#DC2626' }} />, 
            color: '#DC2626' 
        }
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
                            <span style={{ color: THEME.colors.primary }}>Caja & Gastos</span>
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Operación de <span style={{ color: THEME.colors.primary }}>Contado</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button 
                            onClick={() => setShowAddModal(true)}
                            style={{ 
                                padding: '0.75rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primary, 
                                color: 'white', border: 'none', fontWeight: '600', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background-color 0.2s',
                                fontSize: '0.9rem'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={1.5} /> Nuevo Registro
                        </button>
                    </div>
                </header>

                {/* Unified Stats Dashboard */}
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

                {/* Filter Bar */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, padding: '1rem 1.5rem', borderRadius: THEME.radius.md, 
                    border: `1px solid ${THEME.colors.border}`, marginBottom: '2rem', display: 'flex', gap: '1rem', 
                    alignItems: 'center', boxShadow: THEME.shadow.sm
                }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                        <input 
                            placeholder="Buscar en la operación..." 
                            style={{ 
                                width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', borderRadius: THEME.radius.sm, 
                                border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.9rem',
                                fontWeight: '500', color: THEME.colors.textMain, outline: 'none'
                            }}
                        />
                    </div>
                    <select style={{ padding: '0.65rem 1.2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', fontWeight: '600', color: THEME.colors.textSecondary, fontSize: '0.9rem', outline: 'none' }}>
                        <option>Todos los Movimientos</option>
                        <option>Materia Prima (SKU)</option>
                        <option>Gastos Operativos</option>
                    </select>
                </div>

                {/* Operations Table */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <tr>
                                <th style={{ padding: '0.85rem 1.5rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Concepto / Detalle</th>
                                <th style={{ padding: '0.85rem 1.5rem', textAlign: 'left', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Categoría</th>
                                <th style={{ padding: '0.85rem 1.5rem', textAlign: 'right', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Cantidad / Peso</th>
                                <th style={{ padding: '0.85rem 1.5rem', textAlign: 'right', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Total</th>
                                <th style={{ padding: '0.85rem 1.5rem', textAlign: 'right', color: THEME.colors.textSecondary, fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>Sincronizando caja...</td></tr>
                            ) : purchases.length === 0 ? (
                                <tr><td colSpan={5} style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>No hay movimientos registrados hoy</td></tr>
                            ) : (
                                purchases.map((op, i) => (
                                    <tr key={i} style={{ borderBottom: `1px solid ${THEME.colors.border}` }}>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textMain }}>
                                                {op.op_type === 'product' ? op.product?.name : op.description}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.2rem' }}>
                                                {op.op_type === 'product' ? `SKU: ${op.product?.sku} • Prov: ${op.provider?.name}` : `Ref: ${op.reference_doc || 'Interno'}`}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ 
                                                fontSize: '0.7rem', fontWeight: '600', padding: '0.25rem 0.5rem', borderRadius: '4px',
                                                backgroundColor: op.op_type === 'product' ? THEME.colors.primaryLight : THEME.colors.background,
                                                color: op.op_type === 'product' ? THEME.colors.primary : THEME.colors.textSecondary
                                            }}>
                                                {op.op_type === 'product' ? 'PRODUCTO' : (op.category || 'GASTO').toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '500', color: THEME.colors.textMain }}>
                                                {op.op_type === 'product' ? `${formatNumber(op.quantity)} ${op.purchase_unit}` : '—'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '600', color: op.op_type === 'product' ? THEME.colors.textMain : '#DC2626' }}>
                                                {op.op_type === 'expense' && '–'}{formatMoney(op.op_type === 'product' ? op.total_cost : op.amount)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.85rem', color: THEME.colors.textSecondary }}>
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
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '550px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <h2 style={{ margin: 0, fontWeight: '700', color: THEME.colors.textMain, fontSize: '1.35rem' }}>Registro de <span style={{ color: THEME.colors.primary }}>Contado</span></h2>
                                <button onClick={() => setShowAddModal(false)} style={{ background: THEME.colors.background, border: 'none', width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer', fontWeight: '500', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                            </div>

                            {/* Type Selector */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', backgroundColor: THEME.colors.background, padding: '0.25rem', borderRadius: THEME.radius.md }}>
                                <button 
                                    onClick={() => setEntryType('product')}
                                    style={{ 
                                        flex: 1, padding: '0.65rem', borderRadius: THEME.radius.sm, border: 'none',
                                        backgroundColor: entryType === 'product' ? 'white' : 'transparent',
                                        color: entryType === 'product' ? THEME.colors.primary : THEME.colors.textSecondary,
                                        fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        boxShadow: entryType === 'product' ? THEME.shadow.sm : 'none',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    <Package size={16} strokeWidth={1.5} /> Producto SKU
                                </button>
                                <button 
                                    onClick={() => setEntryType('expense')}
                                    style={{ 
                                        flex: 1, padding: '0.65rem', borderRadius: THEME.radius.sm, border: 'none',
                                        backgroundColor: entryType === 'expense' ? 'white' : 'transparent',
                                        color: entryType === 'expense' ? THEME.colors.primary : THEME.colors.textSecondary,
                                        fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        boxShadow: entryType === 'expense' ? THEME.shadow.sm : 'none',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    <ArrowDownRight size={16} strokeWidth={1.5} /> Gasto / Servicio
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {entryType === 'product' ? (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Seleccionar Producto SKU</label>
                                            <select style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none' }}>
                                                <option>Cargando productos...</option>
                                            </select>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Cantidad / Peso</label>
                                                <input type="number" placeholder="0,00" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', color: THEME.colors.textMain, outline: 'none' }} />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Precio Unitario</label>
                                                <input type="number" placeholder="$0" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', color: THEME.colors.textMain, outline: 'none' }} />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Categoría de Gasto</label>
                                            <select style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none' }}>
                                                <option>TRANSPORTE</option>
                                                <option>ALIMENTACION</option>
                                                <option>COMBUSTIBLE</option>
                                                <option>SERVICIOS</option>
                                                <option>VIATICOS</option>
                                                <option>OTROS</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Descripción / Referencia</label>
                                            <input placeholder="Ej: Peaje Andes Ref 123" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', color: THEME.colors.textMain, outline: 'none' }} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '600', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Monto Total</label>
                                            <input type="number" placeholder="$0" style={{ width: '100%', padding: '0.65rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '500', color: THEME.colors.textMain, outline: 'none' }} />
                                        </div>
                                    </>
                                )}

                                <button style={{ 
                                    marginTop: '0.5rem', padding: '0.75rem', borderRadius: THEME.radius.sm, border: 'none', 
                                    backgroundColor: THEME.colors.primary, color: 'white', fontWeight: '600', cursor: 'pointer',
                                    fontSize: '0.95rem', transition: 'background-color 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                                onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                                >
                                    Completar Registro
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

