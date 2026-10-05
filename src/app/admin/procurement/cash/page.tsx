'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
    Search, 
    ChevronRight, 
    Coins, 
    Package, 
    Truck, 
    ArrowDownRight, 
    Plus, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    X,
    Filter,
    ArrowUpRight,
    Tag,
    UserCheck,
    Wallet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

interface ProductOption {
    id: string;
    name: string;
    sku: string;
}

interface ProviderOption {
    id: string;
    name: string;
}

export default function CashOperationsPage() {
    const [mounted, setMounted] = useState(false);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [providers, setProviders] = useState<ProviderOption[]>([]);
    const [dailyBudget, setDailyBudget] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [entryType, setEntryType] = useState<'product' | 'expense'>('product');

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [filterCategory, setFilterCategory] = useState<'all' | 'product' | 'expense'>('all');

    // Product Form State
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selectedProviderId, setSelectedProviderId] = useState('');
    const [productQty, setProductQty] = useState('');
    const [productPrice, setProductPrice] = useState('');
    const [productUnit, setProductUnit] = useState('Kg');

    // Expense Form State
    const [expenseCategory, setExpenseCategory] = useState('TRANSPORTE');
    const [expenseDesc, setExpenseDesc] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseRef, setExpenseRef] = useState('');

    // Error & Success Feedback
    const [modalError, setModalError] = useState<string | null>(null);

    useEffect(() => {
        setMounted(true);
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            setLoading(true);
            const todayDateStr = new Date().toISOString().split('T')[0];

            // 1. Fetch products & providers for select dropdowns
            const [prodsRes, provsRes, budgetRes] = await Promise.all([
                supabase.from('products').select('id, name, sku').eq('is_active', true).order('name', { ascending: true }),
                supabase.from('providers').select('id, name').order('name', { ascending: true }),
                supabase.from('cash_budgets').select('amount').eq('target_date', todayDateStr).eq('status', 'authorized')
            ]);

            setProducts(prodsRes.data || []);
            setProviders(provsRes.data || []);

            const totalBudget = (budgetRes.data || []).reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0);
            setDailyBudget(totalBudget);

            // 2. Fetch operations
            await fetchOperations();
        } catch (err: any) {
            console.error('Error fetching initial data:', err?.message || err);
        } finally {
            setLoading(false);
        }
    };

    const fetchOperations = async () => {
        try {
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const todayIso = todayStart.toISOString();

            const [purchasesRes, expensesRes] = await Promise.all([
                supabase
                    .from('purchases')
                    .select('*, product:products(name, sku), provider:providers(name)')
                    .eq('payment_method', 'cash')
                    .gte('created_at', todayIso)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('cash_movements')
                    .select('*')
                    .eq('type', 'expense')
                    .gte('created_at', todayIso)
                    .order('created_at', { ascending: false })
            ]);
            
            const combined = [
                ...(purchasesRes.data || []).map(p => ({ ...p, op_type: 'product' })),
                ...(expensesRes.data || []).map(e => ({ ...e, op_type: 'expense' }))
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setPurchases(combined);
        } catch (err) {
            console.error('Error fetching operations:', err);
        }
    };

    // Filtered list
    const filteredOperations = useMemo(() => {
        return purchases.filter(op => {
            // Category filter
            if (filterCategory !== 'all' && op.op_type !== filterCategory) {
                return false;
            }

            // Search query filter
            if (!searchQuery.trim()) return true;
            const query = searchQuery.toLowerCase();

            if (op.op_type === 'product') {
                const pName = (op.product?.name || '').toLowerCase();
                const pSku = (op.product?.sku || '').toLowerCase();
                const provName = (op.provider?.name || '').toLowerCase();
                return pName.includes(query) || pSku.includes(query) || provName.includes(query);
            } else {
                const desc = (op.description || '').toLowerCase();
                const cat = (op.category || '').toLowerCase();
                const ref = (op.reference_doc || '').toLowerCase();
                return desc.includes(query) || cat.includes(query) || ref.includes(query);
            }
        });
    }, [purchases, searchQuery, filterCategory]);

    // Handle Form Submit
    const handleCreateEntry = async () => {
        setModalError(null);
        setSubmitting(true);

        try {
            if (entryType === 'product') {
                if (!selectedProductId) {
                    throw new Error('Debe seleccionar un producto SKU.');
                }
                const qtyNum = parseFloat(productQty);
                if (isNaN(qtyNum) || qtyNum <= 0) {
                    throw new Error('La cantidad o peso debe ser mayor a 0.');
                }
                const priceNum = parseFloat(productPrice);
                if (isNaN(priceNum) || priceNum <= 0) {
                    throw new Error('El precio unitario debe ser mayor a $0.');
                }

                const totalCost = qtyNum * priceNum;

                const payload = {
                    product_id: selectedProductId,
                    provider_id: selectedProviderId || null,
                    quantity: qtyNum,
                    unit_price: priceNum,
                    total_cost: totalCost,
                    purchase_unit: productUnit,
                    payment_method: 'cash',
                    status: 'completed'
                };

                const { error: insErr } = await supabase.from('purchases').insert([payload]);
                if (insErr) throw insErr;

            } else {
                if (!expenseDesc.trim()) {
                    throw new Error('Debe ingresar la descripción o concepto del gasto.');
                }
                const amountNum = parseFloat(expenseAmount);
                if (isNaN(amountNum) || amountNum <= 0) {
                    throw new Error('El monto del gasto debe ser mayor a $0.');
                }

                const payload = {
                    type: 'expense',
                    category: expenseCategory.toLowerCase(),
                    description: expenseDesc.trim(),
                    amount: amountNum,
                    reference_doc: expenseRef.trim() || null
                };

                const { error: insErr } = await supabase.from('cash_movements').insert([payload]);
                if (insErr) throw insErr;
            }

            // Success feedback
            if ((window as any).showToast) {
                (window as any).showToast('Registro de contado guardado con éxito', 'success');
            }

            // Reset modal & refresh
            setShowAddModal(false);
            setSelectedProductId('');
            setSelectedProviderId('');
            setProductQty('');
            setProductPrice('');
            setExpenseDesc('');
            setExpenseAmount('');
            setExpenseRef('');

            await fetchOperations();
        } catch (err: any) {
            setModalError(err.message || 'Error al guardar el registro');
        } finally {
            setSubmitting(false);
        }
    };

    if (!mounted) return null;

    // Financial Metrics
    const matPrimaHoy = purchases
        .filter(op => op.op_type === 'product')
        .reduce((sum, op) => sum + (Number(op.total_cost) || 0), 0);
        
    const gastosHoy = purchases
        .filter(op => op.op_type === 'expense')
        .reduce((sum, op) => sum + (Number(op.amount) || 0), 0);

    const totalEgresos = matPrimaHoy + gastosHoy;
    const saldoCaja = dailyBudget - totalEgresos;

    const stats = [
        { 
            label: dailyBudget > 0 ? 'Saldo en Caja' : 'Presupuesto Pendiente', 
            value: dailyBudget > 0 ? formatMoney(saldoCaja) : 'Sin Asignar', 
            icon: <Coins size={18} strokeWidth={1.5} style={{ color: saldoCaja < 300000 && dailyBudget > 0 ? '#DC2626' : THEME.colors.primary }} />, 
            color: saldoCaja < 300000 && dailyBudget > 0 ? '#DC2626' : THEME.colors.textMain,
            helper: dailyBudget > 0 ? `Presupuesto Base: ${formatMoney(dailyBudget)}` : 'Asignar en Tesorería'
        },
        { 
            label: 'Materia Prima (Hoy)', 
            value: formatMoney(matPrimaHoy), 
            icon: <Package size={18} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />, 
            color: THEME.colors.primary,
            helper: `${purchases.filter(op => op.op_type === 'product').length} compras de plaza`
        },
        { 
            label: 'Gastos Ops (Hoy)', 
            value: formatMoney(gastosHoy), 
            icon: <Truck size={18} strokeWidth={1.5} style={{ color: '#D97706' }} />, 
            color: '#D97706',
            helper: `${purchases.filter(op => op.op_type === 'expense').length} legalizaciones`
        },
        { 
            label: 'Total Egresos (Hoy)', 
            value: formatMoney(totalEgresos), 
            icon: <ArrowDownRight size={18} strokeWidth={1.5} style={{ color: '#DC2626' }} />, 
            color: '#DC2626',
            helper: 'Flujo efectivo descargado'
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
                            <span style={{ color: THEME.colors.primary }}>Caja & Gastos</span>
                        </div>
                        <h1 style={{ fontSize: '2.2rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Operación de <span style={{ color: THEME.colors.primary }}>Contado</span>
                        </h1>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Link 
                            href="/admin/procurement/treasury"
                            style={{ 
                                padding: '0.75rem 1.25rem', borderRadius: THEME.radius.md, backgroundColor: 'white',
                                color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, fontWeight: '700',
                                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.88rem',
                                boxShadow: THEME.shadow.sm
                            }}
                        >
                            <Wallet size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Presupuestos
                        </Link>
                        <button 
                            onClick={() => { setModalError(null); setShowAddModal(true); }}
                            style={{ 
                                padding: '0.75rem 1.5rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primary, 
                                color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background-color 0.2s',
                                fontSize: '0.9rem', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={2} /> Nuevo Registro
                        </button>
                    </div>
                </header>

                {/* Unified Stats Dashboard */}
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

                {/* Filter Bar */}
                <div style={{ 
                    backgroundColor: THEME.colors.surface, padding: '0.85rem 1.25rem', borderRadius: THEME.radius.md, 
                    border: `1px solid ${THEME.colors.border}`, marginBottom: '1.5rem', display: 'flex', gap: '1rem', 
                    alignItems: 'center', boxShadow: THEME.shadow.sm, flexWrap: 'wrap'
                }}>
                    <div style={{ flex: 1, minWidth: '260px', position: 'relative' }}>
                        <Search size={16} strokeWidth={1.5} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: THEME.colors.textSecondary }} />
                        <input 
                            placeholder="Buscar por producto, SKU, proveedor o concepto..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ 
                                width: '100%', padding: '0.65rem 1rem 0.65rem 2.5rem', borderRadius: THEME.radius.sm, 
                                border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.88rem',
                                fontWeight: '500', color: THEME.colors.textMain, outline: 'none'
                            }}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Filter size={15} style={{ color: THEME.colors.textSecondary }} />
                        <select 
                            value={filterCategory}
                            onChange={(e) => setFilterCategory(e.target.value as any)}
                            style={{ 
                                padding: '0.65rem 1.2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, 
                                backgroundColor: 'white', fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.88rem', outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="all">Todos los Movimientos ({purchases.length})</option>
                            <option value="product">Materia Prima ({purchases.filter(p => p.op_type === 'product').length})</option>
                            <option value="expense">Gastos Operativos ({purchases.filter(p => p.op_type === 'expense').length})</option>
                        </select>
                    </div>
                </div>

                {/* Operations Table */}
                <div style={{ backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, overflow: 'hidden', boxShadow: THEME.shadow.sm }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead style={{ backgroundColor: THEME.colors.background, borderBottom: `1px solid ${THEME.colors.border}` }}>
                            <tr>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Concepto / Detalle</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'left' }}>Categoría</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Cantidad / Unidad</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Precio Unitario</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Total Pagado</th>
                                <th style={{ ...THEME.typography?.tableHeader, padding: '0.85rem 1.5rem', textAlign: 'right' }}>Hora</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                        <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem auto', color: THEME.colors.primary }} />
                                        Sincronizando operaciones de caja...
                                    </td>
                                </tr>
                            ) : filteredOperations.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ padding: '4rem', textAlign: 'center', color: THEME.colors.textSecondary }}>
                                        <AlertCircle size={32} style={{ margin: '0 auto 0.5rem auto', color: '#9CA3AF' }} />
                                        <div style={{ fontWeight: '700', color: THEME.colors.textMain, fontSize: '0.95rem' }}>
                                            {searchQuery ? 'No se encontraron movimientos con esa búsqueda' : 'No hay movimientos de contado registrados hoy'}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', marginTop: '4px' }}>
                                            {searchQuery ? 'Intenta limpiar el buscador' : 'Usa el botón "Nuevo Registro" para cargar compras de plaza o egresos'}
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredOperations.map((op, i) => (
                                    <tr key={op.id || i} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }}>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>
                                                {op.op_type === 'product' ? (op.product?.name || 'Producto') : op.description}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {op.op_type === 'product' ? (
                                                    <>
                                                        <span>SKU: {op.product?.sku || 'N/A'}</span>
                                                        <span>•</span>
                                                        <span>Prov: {op.provider?.name || 'Plaza Corabastos'}</span>
                                                    </>
                                                ) : (
                                                    <span>Soporte / Ref: {op.reference_doc || 'Comprobante Interno'}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem' }}>
                                            <span style={{ 
                                                fontSize: '0.7rem', fontWeight: '800', padding: '0.25rem 0.6rem', borderRadius: '6px',
                                                backgroundColor: op.op_type === 'product' ? '#ECFDF5' : '#FEF3C7',
                                                color: op.op_type === 'product' ? '#047857' : '#92400E',
                                                border: `1px solid ${op.op_type === 'product' ? '#A7F3D0' : '#FDE68A'}`
                                            }}>
                                                {op.op_type === 'product' ? 'PRODUCTO SKU' : (op.category || 'GASTO').toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '700', color: THEME.colors.textMain }}>
                                                {op.op_type === 'product' ? `${formatNumber(op.quantity)} ${op.purchase_unit || 'Kg'}` : '—'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '600', color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>
                                                {op.op_type === 'product' && op.unit_price ? formatMoney(op.unit_price) : '—'}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontWeight: '800', fontSize: '0.95rem', color: op.op_type === 'product' ? THEME.colors.textMain : '#DC2626' }}>
                                                {op.op_type === 'expense' && '–'}{formatMoney(op.op_type === 'product' ? op.total_cost : op.amount)}
                                            </div>
                                        </td>
                                        <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.82rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
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
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', padding: '2rem', borderRadius: THEME.radius.lg, width: '100%', maxWidth: '560px', border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.lg, maxHeight: '90vh', overflowY: 'auto' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                <div>
                                    <h2 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.35rem' }}>
                                        Nuevo Registro de <span style={{ color: THEME.colors.primary }}>Contado</span>
                                    </h2>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: THEME.colors.textSecondary }}>
                                        Ingresa compras de materia prima en plaza o legalización de gastos operativos.
                                    </p>
                                </div>
                                <button 
                                    onClick={() => setShowAddModal(false)} 
                                    style={{ background: THEME.colors.background, border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Error Message */}
                            {modalError && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FEE2E2', borderRadius: THEME.radius.sm, marginBottom: '1rem', color: '#B91C1C', fontSize: '0.82rem', fontWeight: '600' }}>
                                    <AlertCircle size={16} style={{ flexShrink: 0 }} />
                                    <span>{modalError}</span>
                                </div>
                            )}

                            {/* Type Selector Tabs */}
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', backgroundColor: THEME.colors.background, padding: '0.3rem', borderRadius: THEME.radius.md }}>
                                <button 
                                    type="button"
                                    onClick={() => { setEntryType('product'); setModalError(null); }}
                                    style={{ 
                                        flex: 1, padding: '0.65rem', borderRadius: THEME.radius.sm, border: 'none',
                                        backgroundColor: entryType === 'product' ? 'white' : 'transparent',
                                        color: entryType === 'product' ? THEME.colors.primary : THEME.colors.textSecondary,
                                        fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        boxShadow: entryType === 'product' ? THEME.shadow.sm : 'none',
                                        fontSize: '0.88rem'
                                    }}
                                >
                                    <Package size={16} strokeWidth={2} /> Producto / Materia Prima
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => { setEntryType('expense'); setModalError(null); }}
                                    style={{ 
                                        flex: 1, padding: '0.65rem', borderRadius: THEME.radius.sm, border: 'none',
                                        backgroundColor: entryType === 'expense' ? 'white' : 'transparent',
                                        color: entryType === 'expense' ? '#DC2626' : THEME.colors.textSecondary,
                                        fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                        boxShadow: entryType === 'expense' ? THEME.shadow.sm : 'none',
                                        fontSize: '0.88rem'
                                    }}
                                >
                                    <ArrowDownRight size={16} strokeWidth={2} /> Gasto / Operación
                                </button>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
                                {entryType === 'product' ? (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                                Producto SKU *
                                            </label>
                                            <select 
                                                value={selectedProductId}
                                                onChange={(e) => setSelectedProductId(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                            >
                                                <option value="">-- Seleccionar Producto --</option>
                                                {products.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                                Proveedor en Plaza (Opcional)
                                            </label>
                                            <select 
                                                value={selectedProviderId}
                                                onChange={(e) => setSelectedProviderId(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                            >
                                                <option value="">-- Compra libre de plaza (Sin proveedor formal) --</option>
                                                {providers.map(prov => (
                                                    <option key={prov.id} value={prov.id}>{prov.name}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '0.8rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Cantidad / Peso *</label>
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    placeholder="0.00" 
                                                    value={productQty}
                                                    onChange={(e) => setProductQty(e.target.value)}
                                                    style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }} 
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Unidad</label>
                                                <select 
                                                    value={productUnit}
                                                    onChange={(e) => setProductUnit(e.target.value)}
                                                    style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                                >
                                                    <option value="Kg">Kg</option>
                                                    <option value="Bulto">Bulto</option>
                                                    <option value="Caja">Caja</option>
                                                    <option value="Canastilla">Canastilla</option>
                                                    <option value="Unidad">Unidad</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Precio Unit ($) *</label>
                                                <input 
                                                    type="number" 
                                                    placeholder="$0" 
                                                    value={productPrice}
                                                    onChange={(e) => setProductPrice(e.target.value)}
                                                    style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }} 
                                                />
                                            </div>
                                        </div>

                                        {productQty && productPrice && !isNaN(parseFloat(productQty)) && !isNaN(parseFloat(productPrice)) && (
                                            <div style={{ padding: '0.8rem 1rem', backgroundColor: '#ECFDF5', borderRadius: THEME.radius.sm, border: '1px solid #A7F3D0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#065F46' }}>Total de la Compra:</span>
                                                <span style={{ fontSize: '1.15rem', fontWeight: '800', color: '#047857' }}>
                                                    {formatMoney(parseFloat(productQty) * parseFloat(productPrice))}
                                                </span>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Categoría de Gasto</label>
                                            <select 
                                                value={expenseCategory}
                                                onChange={(e) => setExpenseCategory(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '700', backgroundColor: 'white', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }}
                                            >
                                                <option value="TRANSPORTE">TRANSPORTE / FLETES</option>
                                                <option value="COTEROS">COTEROS / CARGUE & DESCARGUE</option>
                                                <option value="ALIMENTACION">ALIMENTACIÓN / REFRIGERIOS</option>
                                                <option value="COMBUSTIBLE">COMBUSTIBLE / GASOLINA</option>
                                                <option value="EMPAQUES">EMPAQUES / BOLSAS / COSTALES</option>
                                                <option value="VIATICOS">VIÁTICOS / PEAJES</option>
                                                <option value="OTROS">OTROS GASTOS DE PLAZA</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Descripción / Concepto *</label>
                                            <input 
                                                placeholder="Ej: Pago de flete camión plaza a bodega" 
                                                value={expenseDesc}
                                                onChange={(e) => setExpenseDesc(e.target.value)}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }} 
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1rem' }}>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>Monto Pagado ($) *</label>
                                                <input 
                                                    type="number" 
                                                    placeholder="$0" 
                                                    value={expenseAmount}
                                                    onChange={(e) => setExpenseAmount(e.target.value)}
                                                    style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '700', color: '#DC2626', outline: 'none', fontSize: '0.9rem' }} 
                                                />
                                            </div>
                                            <div>
                                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '0.4rem', textTransform: 'uppercase' }}>No. Recibo / Ref</label>
                                                <input 
                                                    placeholder="Ej: Recibo #409" 
                                                    value={expenseRef}
                                                    onChange={(e) => setExpenseRef(e.target.value)}
                                                    style={{ width: '100%', padding: '0.7rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', color: THEME.colors.textMain, outline: 'none', fontSize: '0.9rem' }} 
                                                />
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
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
                                        onClick={handleCreateEntry}
                                        disabled={submitting}
                                        style={{ 
                                            flex: 2, padding: '0.75rem', borderRadius: THEME.radius.sm, border: 'none', 
                                            backgroundColor: entryType === 'product' ? THEME.colors.primary : '#DC2626', 
                                            color: 'white', fontWeight: '800', cursor: submitting ? 'not-allowed' : 'pointer',
                                            fontSize: '0.92rem', transition: 'background-color 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                        }}
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 className="animate-spin" size={16} /> Guardando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={16} /> Registrar Operación
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
