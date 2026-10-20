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
    Lock,
    ShieldAlert,
    ShieldCheck,
    FileText,
    ExternalLink,
    Truck,
    Info,
    Check,
    Tag,
    Scale
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { cleanHumanResolutionNotes, parseRcaFromRecord } from '@/lib/rcaTaxonomy';

interface BudgetRecord {
    id: string;
    amount: number;
    target_date: string;
    status: 'authorized' | 'pending' | 'closed';
    notes: string | null;
    created_at: string;
    authorized_by: string | null;
}

export interface ProviderClaimRecord {
    id: string;
    pqrId: string;
    subject: string;
    description: string;
    primaryPhotoUrl: string | null;
    createdAt: string;
    resolvedAt: string;
    orderSequence: number | string;
    clientName: string;
    productName: string;
    quantityReturned: number;
    unit: string;
    coqAmount: number;
    rcaCategoryL1: string;
    rcaSubtypeL2: string;
    auditorName: string;
    qcJustification: string;
    isSettled: boolean;
    settlementData?: {
        settledAt: string;
        settledBy: string;
        purchaseRef: string;
        notes: string;
    } | null;
}

export default function TreasuryPage() {
    const [mounted, setMounted] = useState(false);
    const [activeTab, setActiveTab] = useState<'budgets' | 'claims'>('budgets');

    // Budgets State
    const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Operational Metrics from Real DB
    const [todayExecuted, setTodayExecuted] = useState<number>(0);

    // Provider Claims State (Escenario 256)
    const [claims, setClaims] = useState<ProviderClaimRecord[]>([]);
    const [claimsSearchQuery, setClaimsSearchQuery] = useState('');
    const [claimsStatusFilter, setClaimsStatusFilter] = useState<'all' | 'pending' | 'settled'>('all');
    const [selectedClaimForSettlement, setSelectedClaimForSettlement] = useState<ProviderClaimRecord | null>(null);
    const [settlementPurchaseRef, setSettlementPurchaseRef] = useState('');
    const [settlementNotes, setSettlementNotes] = useState('');
    const [settlingClaim, setSettlingClaim] = useState(false);
    const [settlementSuccessMsg, setSettlementSuccessMsg] = useState<string | null>(null);

    // Form State for Budgets
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

            // 3. Fetch Provider Claims (Escenario 256)
            const { data: pqrData, error: pqrErr } = await supabase
                .from('customer_service_pqrs')
                .select(`
                    id, subject, description, primary_photo_url, status, created_at, resolved_at, resolution_notes,
                    orders(id, sequence_id, total, delivery_date, profiles(company_name, contact_name))
                `)
                .ilike('resolution_notes', '%proveedor%')
                .order('resolved_at', { ascending: false });

            if (!pqrErr && pqrData) {
                const parsedClaims: ProviderClaimRecord[] = [];

                pqrData.forEach((p: any) => {
                    const notes = p.resolution_notes || '';
                    const isProveedorImputed = notes.includes('proveedor') || notes.includes('Proveedor (Campo / Origen)');
                    if (!isProveedorImputed) return;

                    const rca = parseRcaFromRecord(p);
                    const qcJustification = cleanHumanResolutionNotes(notes);

                    // Extract Settlement Data
                    let isSettled = false;
                    let settlementData = null;
                    const settleMatch = notes.match(/\[TREASURY_SETTLED:\s*(\{[^\]]+\})\]/i);
                    if (settleMatch) {
                        try {
                            settlementData = JSON.parse(settleMatch[1]);
                            isSettled = true;
                        } catch (e) {
                            isSettled = true;
                        }
                    }

                    // Extract Quantity & Product Name
                    const prodMatch = p.subject?.match(/Reclamo en ([^-]+) -/i);
                    const prodName = prodMatch ? prodMatch[1].trim() : (p.subject || 'Producto agrícola');

                    const qtyMatch = p.description?.match(/Cantidad:\s*(\d+(?:[.,]\d+)?)\s*(?:Kg|kg|und|Und)?/i);
                    const qty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 0;

                    // Extract Amount
                    let coq = 0;
                    if (rca.imputedEntities && rca.imputedEntities.length > 0 && rca.imputedEntities[0].deductionAmount) {
                        coq = Number(rca.imputedEntities[0].deductionAmount) || 0;
                    } else {
                        const amountMatch = notes.match(/deductionAmount":\s*(\d+)/i) || notes.match(/-\s*\$([\d.]+)/);
                        if (amountMatch) {
                            coq = parseInt(amountMatch[1].replace(/\./g, ''), 10) || 0;
                        }
                    }

                    // If zero deduction because of Opción 1, ignore from recovery
                    if (notes.includes('Opción 1') || notes.includes('Cerrado conforme sin impacto económico')) {
                        coq = 0;
                    }

                    const ordObj = Array.isArray(p.orders) ? p.orders[0] : p.orders;
                    const clientProfile = ordObj?.profiles;
                    const clientName = clientProfile?.company_name || clientProfile?.contact_name || 'Cliente Institucional';

                    parsedClaims.push({
                        id: p.id,
                        pqrId: p.id.substring(0, 8).toUpperCase(),
                        subject: p.subject || 'Reclamación de Calidad',
                        description: p.description || '',
                        primaryPhotoUrl: p.primary_photo_url || null,
                        createdAt: p.created_at,
                        resolvedAt: p.resolved_at || p.created_at,
                        orderSequence: ordObj?.sequence_id || 'S/N',
                        clientName,
                        productName: prodName,
                        quantityReturned: qty,
                        unit: 'Kg',
                        coqAmount: coq,
                        rcaCategoryL1: rca.categoryL1 || 'defecto_campo',
                        rcaSubtypeL2: rca.subtypeL2 || 'calidad_origen',
                        auditorName: rca.auditedBy || 'Control de Calidad',
                        qcJustification: qcJustification || 'Dictaminado como defecto de cosecha o maduración de origen.',
                        isSettled,
                        settlementData
                    });
                });

                setClaims(parsedClaims);
            }

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
            const userMatch = (b.authorized_by || '').toLowerCase().includes(q);
            return dateMatch || notesMatch || userMatch;
        });
    }, [budgets, searchQuery]);

    // Filtered Provider Claims (Escenario 256)
    const filteredClaims = useMemo(() => {
        return claims.filter(c => {
            // Status filter
            if (claimsStatusFilter === 'pending' && c.isSettled) return false;
            if (claimsStatusFilter === 'settled' && !c.isSettled) return false;

            // Search filter
            if (!claimsSearchQuery.trim()) return true;
            const q = claimsSearchQuery.toLowerCase();
            return (
                c.productName.toLowerCase().includes(q) ||
                c.pqrId.toLowerCase().includes(q) ||
                String(c.orderSequence).includes(q) ||
                c.clientName.toLowerCase().includes(q) ||
                c.qcJustification.toLowerCase().includes(q)
            );
        });
    }, [claims, claimsSearchQuery, claimsStatusFilter]);

    // Handle Settlement of Provider Claim
    const handleConfirmSettlement = async () => {
        if (!selectedClaimForSettlement) return;
        setSettlingClaim(true);
        try {
            const { data: pqr } = await supabase
                .from('customer_service_pqrs')
                .select('resolution_notes')
                .eq('id', selectedClaimForSettlement.id)
                .single();

            const oldNotes = pqr?.resolution_notes || '';
            const settlementPayload = {
                settledAt: new Date().toISOString(),
                settledBy: 'Tesorería & Compras',
                purchaseRef: settlementPurchaseRef.trim() || 'Descuento en compra de plaza',
                notes: settlementNotes.trim() || 'Compensado / cruzado contra liquidación de proveedor.'
            };

            const updatedNotes = `${oldNotes}\\n\\n[TREASURY_SETTLED: ${JSON.stringify(settlementPayload)}]`;

            const { error: updErr } = await supabase
                .from('customer_service_pqrs')
                .update({ resolution_notes: updatedNotes })
                .eq('id', selectedClaimForSettlement.id);

            if (updErr) throw updErr;

            setSettlementSuccessMsg(`Reclamación ${selectedClaimForSettlement.pqrId} cruzada exitosamente.`);
            setSelectedClaimForSettlement(null);
            setSettlementPurchaseRef('');
            setSettlementNotes('');
            await fetchData();
            setTimeout(() => setSettlementSuccessMsg(null), 4000);
        } catch (err: any) {
            alert('Error al asentar compensación: ' + (err?.message || err));
        } finally {
            setSettlingClaim(false);
        }
    };

    const handleCreateBudget = async (e: React.FormEvent) => {
        e.preventDefault();
        setModalError(null);
        const amountNum = parseFloat(budgetAmount);
        if (isNaN(amountNum) || amountNum <= 0) {
            setModalError('Por favor ingrese un monto válido mayor a 0');
            return;
        }

        try {
            setSubmitting(true);
            const { error } = await supabase
                .from('cash_budgets')
                .insert([
                    {
                        amount: amountNum,
                        target_date: budgetDate,
                        status: budgetStatus,
                        notes: budgetNotes.trim() ? budgetNotes.trim() : null
                    }
                ]);

            if (error) throw error;

            setBudgetAmount('');
            setBudgetNotes('');
            setShowModal(false);
            await fetchData();
        } catch (err: any) {
            setModalError(err.message || 'Error al crear el presupuesto');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCloseBudget = async (id: string) => {
        if (!confirm('¿Desea cerrar formalmente este presupuesto diario?')) return;
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

    // Provider Claims Metrics (Escenario 256)
    const pendingClaims = claims.filter(c => !c.isSettled);
    const totalPendingClaimsCoQ = pendingClaims.reduce((sum, c) => sum + (Number(c.coqAmount) || 0), 0);
    const countPendingClaims = pendingClaims.length;

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
        },
        { 
            label: 'Por Cobrar Proveedor (CoQ)', 
            value: formatMoney(totalPendingClaimsCoQ), 
            icon: <ShieldAlert size={18} strokeWidth={1.5} style={{ color: totalPendingClaimsCoQ > 0 ? '#D97706' : THEME.colors.primary }} />, 
            color: totalPendingClaimsCoQ > 0 ? '#D97706' : THEME.colors.primary,
            helper: `${countPendingClaims} casos QC pendientes de cruce`
        }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1440px', margin: '0 auto' }}>
                
                {/* Header with Switcher Tabs */}
                <header style={{ marginBottom: '1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                            <Link href="/admin/procurement" style={{ color: THEME.colors.textSecondary, textDecoration: 'none' }}>Compras 360</Link>
                            <ChevronRight size={12} strokeWidth={1.5} />
                            <span style={{ color: THEME.colors.primary }}>Tesorería & Presupuestos</span>
                        </div>
                        <h1 style={{ fontSize: '2.1rem', fontWeight: '800', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Gestión de <span style={{ color: THEME.colors.primary }}>Tesorería</span>
                        </h1>
                    </div>

                    {/* Middle: Dedicated Navigation Switcher (Escenario 256) */}
                    <div style={{ display: 'flex', backgroundColor: '#E2E8F0', padding: '3px', borderRadius: '10px', gap: '3px' }}>
                        <button
                            type="button"
                            onClick={() => setActiveTab('budgets')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: activeTab === 'budgets' ? 'white' : 'transparent',
                                color: activeTab === 'budgets' ? '#0F172A' : '#64748B',
                                fontWeight: '800',
                                fontSize: '0.80rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'budgets' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <Wallet size={15} style={{ color: activeTab === 'budgets' ? THEME.colors.primary : '#64748B' }} />
                            <span>Presupuestos de Plaza</span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setActiveTab('claims')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: activeTab === 'claims' ? 'white' : 'transparent',
                                color: activeTab === 'claims' ? '#0F172A' : '#64748B',
                                fontWeight: '800',
                                fontSize: '0.80rem',
                                cursor: 'pointer',
                                boxShadow: activeTab === 'claims' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <ShieldAlert size={15} style={{ color: countPendingClaims > 0 ? '#D97706' : '#64748B' }} />
                            <span>Reclamaciones a Proveedores</span>
                            {countPendingClaims > 0 && (
                                <span style={{
                                    backgroundColor: '#FEF3C7',
                                    color: '#92400E',
                                    border: '1px solid #FDE68A',
                                    padding: '1px 6px',
                                    borderRadius: '99px',
                                    fontSize: '0.66rem',
                                    fontWeight: '900'
                                }}>
                                    {countPendingClaims}
                                </span>
                            )}
                        </button>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <Link 
                            href="/admin/procurement/cash"
                            style={{ 
                                padding: '0.65rem 1.15rem', borderRadius: THEME.radius.md, backgroundColor: 'white',
                                color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, fontWeight: '700',
                                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem',
                                boxShadow: THEME.shadow.sm
                            }}
                        >
                            <Coins size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Ver Caja Menor
                        </Link>
                        <button 
                            onClick={() => { setModalError(null); setShowModal(true); }}
                            style={{ 
                                padding: '0.65rem 1.25rem', borderRadius: THEME.radius.md, backgroundColor: THEME.colors.primary, 
                                color: 'white', border: 'none', fontWeight: '700', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'background-color 0.2s',
                                fontSize: '0.88rem', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.2)'
                            }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = THEME.colors.primaryHover}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = THEME.colors.primary}
                        >
                            <Plus size={16} strokeWidth={2} /> Asignar Presupuesto
                        </button>
                    </div>
                </header>

                {/* Feedback Toast */}
                {settlementSuccessMsg && (
                    <div style={{
                        marginBottom: '1.25rem',
                        padding: '0.75rem 1.25rem',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        borderRadius: '10px',
                        color: '#065F46',
                        fontSize: '0.84rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.1)'
                    }}>
                        <CheckCircle2 size={18} color="#059669" />
                        <span>{settlementSuccessMsg}</span>
                    </div>
                )}

                {/* Stats Dashboard (5 Cards) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    {stats.map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: THEME.colors.surface, padding: '1.1rem 1.25rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`,
                            display: 'flex', alignItems: 'center', gap: '0.85rem', boxShadow: THEME.shadow.sm
                        }}>
                            <div style={{ backgroundColor: THEME.colors.background, width: '42px', height: '42px', borderRadius: THEME.radius.sm, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {stat.icon}
                            </div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: stat.color, margin: '2px 0' }}>{stat.value}</div>
                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat.helper}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* TAB 1: Budgets & Plaza Cash Management */}
                {activeTab === 'budgets' && (
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
                                    <thead>
                                        <tr style={{ borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background }}>
                                            <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>FECHA DESTINO</th>
                                            <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>ESTADO</th>
                                            <th style={{ padding: '0.75rem 1.5rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>OBSERVACIONES</th>
                                            <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>MONTO ASIGNADO</th>
                                            <th style={{ padding: '0.75rem 1.5rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textSecondary }}>ACCIÓN</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBudgets.map((b) => (
                                            <tr key={b.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s' }}>
                                                <td style={{ padding: '1rem 1.5rem', fontSize: '0.88rem', fontWeight: '600', color: THEME.colors.textMain }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <Calendar size={14} strokeWidth={1.5} color={THEME.colors.textSecondary} />
                                                        {b.target_date}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem' }}>
                                                    {b.status === 'authorized' ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', backgroundColor: '#DCFCE7', color: '#15803D', fontSize: '0.72rem', fontWeight: '700' }}>
                                                            <CheckCircle2 size={12} strokeWidth={2} /> Autorizado
                                                        </span>
                                                    ) : b.status === 'closed' ? (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', backgroundColor: '#F1F5F9', color: '#64748B', fontSize: '0.72rem', fontWeight: '700' }}>
                                                            <Lock size={12} strokeWidth={2} /> Cerrado
                                                        </span>
                                                    ) : (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', backgroundColor: '#FEF3C7', color: '#B45309', fontSize: '0.72rem', fontWeight: '700' }}>
                                                            <Clock size={12} strokeWidth={2} /> Pendiente
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', fontSize: '0.8rem', color: THEME.colors.textSecondary, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {b.notes || <span style={{ color: '#CBD5E1' }}>Sin notas</span>}
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right', fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums' }}>
                                                    {formatMoney(b.amount)}
                                                </td>
                                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                                    {b.status === 'authorized' && (
                                                        <button
                                                            onClick={() => handleCloseBudget(b.id)}
                                                            style={{
                                                                padding: '0.35rem 0.75rem',
                                                                fontSize: '0.72rem',
                                                                fontWeight: '700',
                                                                backgroundColor: '#F8FAFC',
                                                                color: '#475569',
                                                                border: '1px solid #CBD5E1',
                                                                borderRadius: THEME.radius.sm,
                                                                cursor: 'pointer'
                                                            }}
                                                            title="Cerrar bolsa y liquidar"
                                                        >
                                                            Cerrar
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Operational Guidance Card */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ backgroundColor: THEME.colors.surface, padding: '1.5rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}`, boxShadow: THEME.shadow.sm }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                    <Banknote size={20} strokeWidth={1.5} style={{ color: THEME.colors.primary }} />
                                    <h3 style={{ fontSize: '1rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>Circuito de Efectivo</h3>
                                </div>
                                <p style={{ fontSize: '0.82rem', color: THEME.colors.textSecondary, lineHeight: '1.5', margin: 0 }}>
                                    Todo presupuesto autorizado se refleja automáticamente como fondo disponible en la terminal de compras de Corabastos.
                                </p>
                                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: `1px solid ${THEME.colors.border}` }}>
                                    <Link 
                                        href="/admin/procurement/cash"
                                        style={{ 
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.background,
                                            color: THEME.colors.textMain, textDecoration: 'none', fontWeight: '700', fontSize: '0.85rem'
                                        }}
                                    >
                                        <span>Ir a Caja Menor & Gastos</span>
                                        <ArrowRight size={14} />
                                    </Link>
                                </div>
                            </div>

                            <div style={{ backgroundColor: '#F0FDF4', padding: '1.25rem', borderRadius: THEME.radius.md, border: '1px solid #BBF7D0' }}>
                                <div style={{ display: 'flex', gap: '0.75rem' }}>
                                    <CheckCircle2 size={18} style={{ color: '#16A34A', flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#166534', marginBottom: '2px' }}>Regla de Liquidación D+0</div>
                                        <div style={{ fontSize: '0.78rem', color: '#15803D', lineHeight: '1.4' }}>
                                            Las cuadrillas deben conciliar las compras en plaza contra los recibos físicos al finalizar la jornada de descargue (05:00 AM).
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                )}

                {/* TAB 2: Reclamaciones a Proveedores / CoQ Campo (Escenario 256) */}
                {activeTab === 'claims' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        
                        {/* Control Bar: Omnibox & Filters */}
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: THEME.radius.md,
                            padding: '1rem 1.25rem',
                            border: `1px solid ${THEME.colors.border}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '1rem',
                            boxShadow: THEME.shadow.sm
                        }}>
                            {/* Filter Pills */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={() => setClaimsStatusFilter('all')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        fontWeight: '800',
                                        border: claimsStatusFilter === 'all' ? '2px solid #0D7A57' : '1px solid #E2E8F0',
                                        backgroundColor: claimsStatusFilter === 'all' ? '#ECFDF5' : 'white',
                                        color: claimsStatusFilter === 'all' ? '#065F46' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Todos ({claims.length})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClaimsStatusFilter('pending')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        fontWeight: '800',
                                        border: claimsStatusFilter === 'pending' ? '2px solid #D97706' : '1px solid #E2E8F0',
                                        backgroundColor: claimsStatusFilter === 'pending' ? '#FEF3C7' : 'white',
                                        color: claimsStatusFilter === 'pending' ? '#92400E' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ⚠️ Pendientes de Cruce ({countPendingClaims})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setClaimsStatusFilter('settled')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '8px',
                                        fontSize: '0.74rem',
                                        fontWeight: '800',
                                        border: claimsStatusFilter === 'settled' ? '2px solid #0D7A57' : '1px solid #E2E8F0',
                                        backgroundColor: claimsStatusFilter === 'settled' ? '#F0FDF4' : 'white',
                                        color: claimsStatusFilter === 'settled' ? '#047857' : '#64748B',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ✅ Compensados ({claims.length - countPendingClaims})
                                </button>
                            </div>

                            {/* Omnibox search */}
                            <div style={{ position: 'relative', minWidth: '320px', flex: '1', maxWidth: '450px' }}>
                                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
                                <input
                                    type="text"
                                    placeholder="Buscar por SKU, folio, pedido, cliente o dictamen..."
                                    value={claimsSearchQuery}
                                    onChange={(e) => setClaimsSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '6px 12px 6px 32px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.80rem',
                                        outline: 'none',
                                        backgroundColor: '#F8FAFC'
                                    }}
                                />
                                {claimsSearchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => setClaimsSearchQuery('')}
                                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 0 }}
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Claims Grid / Gallery */}
                        {loading ? (
                            <div style={{ padding: '4rem', textAlign: 'center', backgroundColor: 'white', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                                <Loader2 className="animate-spin" size={24} style={{ margin: '0 auto 0.5rem auto', color: THEME.colors.primary }} />
                                <p style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '600' }}>Cargando expediente de reclamaciones a proveedores...</p>
                            </div>
                        ) : filteredClaims.length === 0 ? (
                            <div style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: 'white', borderRadius: '12px', border: '1px dashed #CBD5E1' }}>
                                <ShieldCheck size={40} style={{ margin: '0 auto 0.75rem auto', color: '#10B981' }} />
                                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#1E293B', margin: '0 0 4px 0' }}>
                                    No hay reclamaciones de calidad pendientes
                                </h3>
                                <p style={{ fontSize: '0.78rem', color: '#64748B', maxWidth: '420px', margin: '0 auto' }}>
                                    Todas las no conformidades con proveedores agrícolas han sido cruzadas o no hay casos activos dictaminados en SAC.
                                </p>
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem' }}>
                                {filteredClaims.map((claim) => (
                                    <div
                                        key={claim.id}
                                        style={{
                                            backgroundColor: 'white',
                                            borderRadius: '12px',
                                            border: claim.isSettled ? '1px solid #E2E8F0' : '1.5px solid #FCD34D',
                                            boxShadow: claim.isSettled ? '0 1px 3px rgba(0,0,0,0.03)' : '0 4px 12px rgba(217, 119, 6, 0.08)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column'
                                        }}
                                    >
                                        {/* Card Header */}
                                        <div style={{
                                            padding: '10px 14px',
                                            backgroundColor: claim.isSettled ? '#F8FAFC' : '#FFFBEB',
                                            borderBottom: `1px solid ${claim.isSettled ? '#E2E8F0' : '#FDE68A'}`,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.70rem', fontWeight: '900', color: '#1E293B', backgroundColor: 'white', padding: '2px 6px', borderRadius: '4px', border: '1px solid #CBD5E1' }}>
                                                    RNC #{claim.pqrId}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#475569' }}>
                                                    Pedido #{claim.orderSequence}
                                                </span>
                                            </div>

                                            {claim.isSettled ? (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.66rem',
                                                    fontWeight: '800',
                                                    color: '#065F46',
                                                    backgroundColor: '#ECFDF5',
                                                    border: '1px solid #A7F3D0',
                                                    padding: '2px 8px',
                                                    borderRadius: '99px'
                                                }}>
                                                    <CheckCircle2 size={12} /> COMPENSADO
                                                </span>
                                            ) : (
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.66rem',
                                                    fontWeight: '900',
                                                    color: '#92400E',
                                                    backgroundColor: '#FEF3C7',
                                                    border: '1px solid #FDE68A',
                                                    padding: '2px 8px',
                                                    borderRadius: '99px'
                                                }}>
                                                    <Clock size={12} /> PENDIENTE DE CRUCE
                                                </span>
                                            )}
                                        </div>

                                        {/* Card Body */}
                                        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                                            
                                            {/* Product Info & Money Row */}
                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                {claim.primaryPhotoUrl && (
                                                    <a
                                                        href={claim.primaryPhotoUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'block', position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #CBD5E1', flexShrink: 0 }}
                                                        title="Ver evidencia fotográfica"
                                                    >
                                                        <img src={claim.primaryPhotoUrl} alt={claim.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                        <span style={{ position: 'absolute', bottom: 1, right: 1, backgroundColor: 'rgba(0,0,0,0.65)', color: 'white', fontSize: '0.50rem', padding: '1px 3px', borderRadius: '2px' }}>
                                                            Zoom
                                                        </span>
                                                    </a>
                                                )}

                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600' }}>
                                                        {claim.clientName}
                                                    </div>
                                                    <h4 style={{ margin: '2px 0', fontSize: '0.92rem', fontWeight: '800', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {claim.productName}
                                                    </h4>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#334155' }}>
                                                        <span style={{ fontWeight: '700' }}>{claim.quantityReturned} {claim.unit} afectados</span>
                                                        <span>•</span>
                                                        <span style={{ color: '#0D7A57', fontWeight: '700' }}>{claim.rcaSubtypeL2.replace(/_/g, ' ')}</span>
                                                    </div>
                                                </div>

                                                <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '8px' }}>
                                                    <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>
                                                        Monto CoQ
                                                    </div>
                                                    <div style={{ fontSize: '1.15rem', fontWeight: '900', color: claim.coqAmount > 0 ? '#BE123C' : '#059669' }}>
                                                        {claim.coqAmount > 0 ? formatMoney(claim.coqAmount) : '$0 COP (Exonerado)'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* QC Technical Justification Box */}
                                            <div style={{
                                                backgroundColor: '#F8FAFC',
                                                border: '1px solid #E2E8F0',
                                                borderLeft: '3px solid #0D7A57',
                                                borderRadius: '6px',
                                                padding: '6px 8px',
                                                fontSize: '0.70rem',
                                                color: '#334155',
                                                lineHeight: '1.35',
                                                maxHeight: '65px',
                                                overflowY: 'auto'
                                            }}>
                                                <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#0D7A57', textTransform: 'uppercase', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                                                    <span>Dictamen Técnico QC</span>
                                                    <span>Auditor: {claim.auditorName}</span>
                                                </div>
                                                {claim.qcJustification}
                                            </div>

                                            {/* Settlement Details if Settled */}
                                            {claim.isSettled && claim.settlementData && (
                                                <div style={{
                                                    backgroundColor: '#ECFDF5',
                                                    border: '1px solid #A7F3D0',
                                                    borderRadius: '6px',
                                                    padding: '6px 8px',
                                                    fontSize: '0.68rem',
                                                    color: '#065F46'
                                                }}>
                                                    <strong>Compensado:</strong> {claim.settlementData.purchaseRef} • {claim.settlementData.notes}
                                                </div>
                                            )}

                                        </div>

                                        {/* Card Footer Actions */}
                                        <div style={{
                                            padding: '8px 14px',
                                            backgroundColor: '#F8FAFC',
                                            borderTop: '1px solid #E2E8F0',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <Link
                                                href={`/admin/customer-service/rnc/${claim.id}/print`}
                                                target="_blank"
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    fontSize: '0.70rem',
                                                    fontWeight: '700',
                                                    color: '#475569',
                                                    textDecoration: 'none',
                                                    padding: '4px 8px',
                                                    borderRadius: '6px',
                                                    border: '1px solid #CBD5E1',
                                                    backgroundColor: 'white'
                                                }}
                                                title="Ver Reporte Oficial RNC con firmas"
                                            >
                                                <FileText size={12} />
                                                <span>Ver RNC (PDF)</span>
                                            </Link>

                                            {!claim.isSettled ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedClaimForSettlement(claim);
                                                        setSettlementPurchaseRef('');
                                                        setSettlementNotes('');
                                                    }}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800',
                                                        color: 'white',
                                                        backgroundColor: '#0D7A57',
                                                        border: 'none',
                                                        padding: '5px 12px',
                                                        borderRadius: '6px',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 1px 3px rgba(13, 122, 87, 0.25)'
                                                    }}
                                                >
                                                    <Check size={12} />
                                                    <span>Aplicar Cruce / Descuento</span>
                                                </button>
                                            ) : (
                                                <span style={{ fontSize: '0.68rem', color: '#059669', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                    <CheckCircle2 size={12} /> Liquidado en Tesorería
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                    </div>
                )}

                {/* MODAL: REGISTRAR COMPENSACIÓN / CRUCE DE TESORERÍA */}
                {selectedClaimForSettlement && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        zIndex: 9999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '1rem'
                    }} onClick={() => setSelectedClaimForSettlement(null)}>
                        <div style={{
                            backgroundColor: 'white',
                            borderRadius: '16px',
                            border: '1px solid #CBD5E1',
                            maxWidth: '520px',
                            width: '100%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                            overflow: 'hidden'
                        }} onClick={e => e.stopPropagation()}>
                            
                            {/* Modal Header */}
                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Coins size={16} color="#B45309" />
                                    </div>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: '900', color: '#0F172A' }}>
                                            Compensar Novedad con Proveedor
                                        </h3>
                                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                            RNC #{selectedClaimForSettlement.pqrId} • {selectedClaimForSettlement.productName}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedClaimForSettlement(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748B' }}
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                
                                {/* Recovery Highlight Card */}
                                <div style={{
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    borderRadius: '10px',
                                    padding: '0.75rem 1rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <div>
                                        <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#991B1B', textTransform: 'uppercase' }}>
                                            Valor a Descontar / Compensar
                                        </span>
                                        <div style={{ fontSize: '0.74rem', color: '#7F1D1D' }}>
                                            {selectedClaimForSettlement.quantityReturned} {selectedClaimForSettlement.unit} de {selectedClaimForSettlement.productName}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '1.35rem', fontWeight: '900', color: '#991B1B' }}>
                                        {formatMoney(selectedClaimForSettlement.coqAmount)}
                                    </div>
                                </div>

                                {/* Form Fields */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>
                                        Referencia de Compra / Pago en Plaza *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Compra Plaza #1042 / Camión Don Pedro / Planilla 20-Oct"
                                        value={settlementPurchaseRef}
                                        onChange={e => setSettlementPurchaseRef(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.80rem',
                                            outline: 'none',
                                            backgroundColor: '#F8FAFC'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.65rem', color: '#64748B', display: 'block', marginTop: '2px' }}>
                                        Indica en qué compra o liquidación de Corabastos se dedujo este saldo.
                                    </span>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: '800', color: '#334155', marginBottom: '4px' }}>
                                        Observaciones de Tesorería & Finanzas
                                    </label>
                                    <textarea
                                        rows={3}
                                        placeholder="Ej: Se descontaron $192.000 COP directamente de la pesada final de cebolla. Proveedor enterado y de acuerdo con el RNC."
                                        value={settlementNotes}
                                        onChange={e => setSettlementNotes(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '8px 10px',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.80rem',
                                            outline: 'none',
                                            resize: 'none',
                                            backgroundColor: '#F8FAFC'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setSelectedClaimForSettlement(null)}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        backgroundColor: 'white',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: '700',
                                        color: '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmSettlement}
                                    disabled={settlingClaim}
                                    style={{
                                        padding: '0.5rem 1.25rem',
                                        backgroundColor: '#0D7A57',
                                        border: 'none',
                                        borderRadius: '8px',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        color: 'white',
                                        cursor: settlingClaim ? 'not-allowed' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 4px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    {settlingClaim ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                    <span>Confirmar y Asentar Cruce</span>
                                </button>
                            </div>

                        </div>
                    </div>
                )}

                {/* MODAL: CREAR PRESUPUESTO */}
                {showModal && (
                    <div style={{ 
                        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, 
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' 
                    }}>
                        <div style={{ backgroundColor: THEME.colors.surface, width: '100%', maxWidth: '480px', borderRadius: THEME.radius.lg, padding: '2rem', boxShadow: THEME.shadow.lg, border: `1px solid ${THEME.colors.border}` }}>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ padding: '0.5rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.sm }}>
                                        <Wallet size={18} style={{ color: THEME.colors.primary }} />
                                    </div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>Asignar Presupuesto</h3>
                                </div>
                                <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: THEME.colors.textSecondary, cursor: 'pointer', padding: '0.25rem' }}>
                                    <X size={18} />
                                </button>
                            </div>

                            {modalError && (
                                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: THEME.radius.sm, color: '#DC2626', fontSize: '0.82rem', marginBottom: '1rem', fontWeight: '500' }}>
                                    {modalError}
                                </div>
                            )}

                            <form onSubmit={handleCreateBudget}>
                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                                        Monto Asignado (COP) *
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <span style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', fontWeight: '700', color: THEME.colors.textSecondary }}>$</span>
                                        <input 
                                            type="number" 
                                            step="1000"
                                            required
                                            placeholder="Ej: 5000000"
                                            value={budgetAmount}
                                            onChange={(e) => setBudgetAmount(e.target.value)}
                                            style={{ width: '100%', padding: '0.75rem 1rem 0.75rem 2.2rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '1rem', fontWeight: '700', color: THEME.colors.textMain, outline: 'none' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                                        Fecha Destino Operativo *
                                    </label>
                                    <input 
                                        type="date" 
                                        required
                                        value={budgetDate}
                                        onChange={(e) => setBudgetDate(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.88rem', color: THEME.colors.textMain, outline: 'none' }}
                                    />
                                </div>

                                <div style={{ marginBottom: '1.25rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                                        Estado de Autorización
                                    </label>
                                    <select 
                                        value={budgetStatus}
                                        onChange={(e) => setBudgetStatus(e.target.value as any)}
                                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.88rem', color: THEME.colors.textMain, outline: 'none', fontWeight: '600' }}
                                    >
                                        <option value="authorized">Autorizado Inmediato (Disponible en Plaza)</option>
                                        <option value="pending">Pendiente de Aprobación Gerencial</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, marginBottom: '0.4rem' }}>
                                        Observaciones de Asignación
                                    </label>
                                    <textarea 
                                        rows={2}
                                        placeholder="Ej: Bolsa compras pesadas madrugada cuadrilla 1"
                                        value={budgetNotes}
                                        onChange={(e) => setBudgetNotes(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: THEME.radius.sm, border: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background, fontSize: '0.88rem', color: THEME.colors.textMain, outline: 'none', resize: 'none' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                    <button 
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        style={{ padding: '0.65rem 1.25rem', borderRadius: THEME.radius.sm, backgroundColor: 'transparent', color: THEME.colors.textSecondary, border: `1px solid ${THEME.colors.border}`, fontWeight: '600', cursor: 'pointer', fontSize: '0.88rem' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        type="submit"
                                        disabled={submitting}
                                        style={{ padding: '0.65rem 1.5rem', borderRadius: THEME.radius.sm, backgroundColor: THEME.colors.primary, color: 'white', border: 'none', fontWeight: '700', cursor: submitting ? 'not-allowed' : 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                                    >
                                        {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                        Crear Presupuesto
                                    </button>
                                </div>
                            </form>

                        </div>
                    </div>
                )}

            </div>
        </main>
    );
}
