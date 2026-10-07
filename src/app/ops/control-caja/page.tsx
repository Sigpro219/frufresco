'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/authContext';
import Link from 'next/link';
import { 
    Coins, 
    ArrowLeft, 
    Plus, 
    CheckCircle2, 
    Clock, 
    FileText, 
    Search, 
    X, 
    ExternalLink, 
    Calendar, 
    TrendingDown, 
    DollarSign, 
    User, 
    Check, 
    RefreshCw, 
    AlertCircle,
    Eye,
    ShieldCheck,
    Store
} from 'lucide-react';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';

interface BuyerSummary {
    budgetId: string;
    buyerId: string;
    buyerName: string;
    zone: string;
    assignedAmount: number;
    cashPurchasesTotal: number;
    creditPurchasesTotal: number;
    cashPurchasesCount: number;
    vouchers: Array<{
        id: string;
        product_name: string;
        provider_name: string;
        total_cost: number;
        voucher_image_url?: string;
        payment_method: string;
        created_at: string;
    }>;
    status: 'authorized' | 'closed' | 'pending';
    closedAt?: string;
}

export default function OpsControlCajaPage() {
    const { profile, user } = useAuth();
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [buyersData, setBuyersData] = useState<BuyerSummary[]>([]);
    const [collaborators, setCollaborators] = useState<any[]>([]);
    
    // Modal states
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState('');
    const [assignAmount, setAssignAmount] = useState('');
    const [assignZone, setAssignZone] = useState('Corabastos General');
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    // Vouchers modal
    const [activeReceiptsBuyer, setActiveReceiptsBuyer] = useState<BuyerSummary | null>(null);
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    // Reconcile action
    const [reconcilingId, setReconcilingId] = useState<string | null>(null);

    const loadData = async () => {
        try {
            setLoading(true);
            const startIso = `${selectedDate}T00:00:00`;
            const endIso = `${selectedDate}T23:59:59.999`;

            // 1. Cargar presupuestos asignados del día
            const { data: budgets, error: bErr } = await supabase
                .from('cash_budgets')
                .select('*')
                .eq('target_date', selectedDate)
                .order('created_at', { ascending: false });

            if (bErr) throw bErr;

            // 2. Cargar compras del día
            const { data: purchases, error: pErr } = await supabase
                .from('purchases')
                .select(`
                    id, product_id, provider_id, quantity, unit_price, total_cost,
                    voucher_image_url, payment_method, budget_id, created_at, notes,
                    products(name),
                    providers(name)
                `)
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            if (pErr) throw pErr;

            // 3. Cargar colaboradores internos
            const { data: profs } = await supabase
                .from('profiles')
                .select('id, contact_name, company_name, email, role');
            
            const internalProfs = (profs || []).filter(p => p.role !== 'b2b_client' && p.role !== 'b2c_client');
            setCollaborators(internalProfs);

            // Mapear presupuestos y cruzar con compras
            const parsedBuyers: BuyerSummary[] = (budgets || []).map((b: any) => {
                let buyerId = '';
                let buyerName = 'Comprador Asignado';
                let zone = 'Corabastos';

                try {
                    if (b.notes && (b.notes.startsWith('{') || b.notes.startsWith('['))) {
                        const parsed = JSON.parse(b.notes);
                        buyerId = parsed.buyer_id || '';
                        buyerName = parsed.buyer_name || buyerName;
                        zone = parsed.zone || zone;
                    } else if (b.notes) {
                        buyerName = b.notes;
                    }
                } catch {
                    buyerName = b.notes || 'Comprador';
                }

                // Filtrar compras asociadas a este presupuesto o a este comprador
                const relatedPurchases = (purchases || []).filter((p: any) => {
                    if (p.budget_id && p.budget_id === b.id) return true;
                    
                    // Buscar coincidencia por JSON o texto
                    let pBuyerId = '';
                    let pBuyerName = '';
                    try {
                        if (p.notes && (p.notes.startsWith('{') || p.notes.startsWith('['))) {
                            const parsed = JSON.parse(p.notes);
                            pBuyerId = parsed.buyer_id || '';
                            pBuyerName = parsed.buyer_name || '';
                        }
                    } catch {
                        // ignore json parse error
                    }

                    if (buyerId && pBuyerId && buyerId === pBuyerId) return true;
                    if (buyerId && p.notes && p.notes.includes(buyerId)) return true;
                    if (buyerName && pBuyerName && buyerName.toLowerCase() === pBuyerName.toLowerCase()) return true;
                    if (buyerName && p.notes && p.notes.toLowerCase().includes(buyerName.toLowerCase())) return true;
                    return false;
                });

                const cashPurchases = relatedPurchases.filter((p: any) => p.payment_method === 'cash' || !p.payment_method);
                const creditPurchases = relatedPurchases.filter((p: any) => p.payment_method === 'credit');

                const cashTotal = cashPurchases.reduce((acc, it) => acc + (Number(it.total_cost) || 0), 0);
                const creditTotal = creditPurchases.reduce((acc, it) => acc + (Number(it.total_cost) || 0), 0);

                const formattedVouchers = relatedPurchases.map((p: any) => ({
                    id: p.id,
                    product_name: p.products?.name || 'Producto Agrícola',
                    provider_name: p.providers?.name || 'Proveedor de Plaza',
                    total_cost: Number(p.total_cost) || 0,
                    voucher_image_url: p.voucher_image_url,
                    payment_method: p.payment_method || 'cash',
                    created_at: p.created_at
                }));

                return {
                    budgetId: b.id,
                    buyerId,
                    buyerName,
                    zone,
                    assignedAmount: Number(b.amount) || 0,
                    cashPurchasesTotal: cashTotal,
                    creditPurchasesTotal: creditTotal,
                    cashPurchasesCount: cashPurchases.length,
                    vouchers: formattedVouchers,
                    status: b.status || 'authorized'
                };
            });

            // Poka-Yoke: Encontrar compras huérfanas (no asociadas a ningún presupuesto activo del día)
            const matchedPurchaseIds = new Set<string>();
            parsedBuyers.forEach(b => {
                b.vouchers.forEach(v => matchedPurchaseIds.add(v.id));
            });

            const orphanPurchases = (purchases || []).filter(p => !matchedPurchaseIds.has(p.id));
            if (orphanPurchases.length > 0) {
                const orphanMap: Record<string, { buyerId: string; buyerName: string; purchases: any[] }> = {};
                orphanPurchases.forEach(p => {
                    let bId = '';
                    let bName = 'Comprador';
                    try {
                        if (p.notes && (p.notes.startsWith('{') || p.notes.startsWith('['))) {
                            const parsed = JSON.parse(p.notes);
                            bId = parsed.buyer_id || '';
                            bName = parsed.buyer_name || bName;
                        } else if (p.notes && p.notes.includes('Comprador:')) {
                            bName = p.notes.replace('Comprador:', '').trim();
                        }
                    } catch {
                        bName = p.notes || 'Comprador';
                    }

                    const key = bId || bName;
                    if (!orphanMap[key]) {
                        orphanMap[key] = { buyerId: bId, buyerName: bName, purchases: [] };
                    }
                    orphanMap[key].purchases.push(p);
                });

                Object.values(orphanMap).forEach(orph => {
                    const cashP = orph.purchases.filter(p => p.payment_method === 'cash' || !p.payment_method);
                    const creditP = orph.purchases.filter(p => p.payment_method === 'credit');
                    const cashTotal = cashP.reduce((acc, it) => acc + (Number(it.total_cost) || 0), 0);
                    const creditTotal = creditP.reduce((acc, it) => acc + (Number(it.total_cost) || 0), 0);

                    parsedBuyers.push({
                        budgetId: `orphan-${orph.buyerId || orph.buyerName}`,
                        buyerId: orph.buyerId,
                        buyerName: orph.buyerName,
                        zone: '⚠️ Sin Fondo Asignado Previo',
                        assignedAmount: 0,
                        cashPurchasesTotal: cashTotal,
                        creditPurchasesTotal: creditTotal,
                        cashPurchasesCount: cashP.length,
                        vouchers: orph.purchases.map(p => ({
                            id: p.id,
                            product_name: p.products?.name || 'Producto Agrícola',
                            provider_name: p.providers?.name || 'Proveedor de Plaza',
                            total_cost: Number(p.total_cost) || 0,
                            voucher_image_url: p.voucher_image_url,
                            payment_method: p.payment_method || 'cash',
                            created_at: p.created_at
                        })),
                        status: 'pending'
                    });
                });
            }

            setBuyersData(parsedBuyers);
        } catch (err: any) {
            console.error('Error cargando control de caja:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [selectedDate]);

    // Totales de cuadrilla
    const totals = useMemo(() => {
        const totalAssigned = buyersData.reduce((acc, b) => acc + b.assignedAmount, 0);
        const totalCashSpent = buyersData.reduce((acc, b) => acc + b.cashPurchasesTotal, 0);
        const totalReturns = totalAssigned - totalCashSpent;
        const totalReceipts = buyersData.reduce((acc, b) => acc + b.cashPurchasesCount, 0);
        const totalClosed = buyersData.filter(b => b.status === 'closed').length;
        const orphanCount = buyersData.filter(b => b.assignedAmount === 0 || b.budgetId.startsWith('orphan-')).length;

        return {
            totalAssigned,
            totalCashSpent,
            totalReturns,
            totalReceipts,
            totalClosed,
            totalBuyers: buyersData.length,
            orphanCount
        };
    }, [buyersData]);

    const handleQuickAssignOrphan = (b: BuyerSummary) => {
        if (b.buyerId) {
            setSelectedCollaboratorId(b.buyerId);
        }
        setShowAssignModal(true);
    };

    // Filtrado por buscador
    const filteredBuyers = useMemo(() => {
        if (!searchTerm.trim()) return buyersData;
        const term = searchTerm.toLowerCase();
        return buyersData.filter(b => 
            b.buyerName.toLowerCase().includes(term) ||
            b.zone.toLowerCase().includes(term)
        );
    }, [buyersData, searchTerm]);

    // Asignar fondo a comprador
    const handleAssignFunds = async (e: React.FormEvent) => {
        e.preventDefault();
        setAssignError(null);

        const numAmount = parseFloat(assignAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            setAssignError('Ingresa un monto válido en efectivo');
            return;
        }

        const collab = collaborators.find(c => c.id === selectedCollaboratorId);
        const buyerName = collab?.contact_name || collab?.company_name || collab?.email || 'Comprador';

        setAssigning(true);
        try {
            const notesPayload = JSON.stringify({
                buyer_id: selectedCollaboratorId,
                buyer_name: buyerName,
                zone: assignZone
            });

            const { error: insErr } = await supabase
                .from('cash_budgets')
                .insert({
                    amount: numAmount,
                    target_date: selectedDate,
                    status: 'authorized',
                    notes: notesPayload,
                    authorized_by: profile?.id || user?.id || null
                });

            if (insErr) throw insErr;

            setShowAssignModal(false);
            setAssignAmount('');
            setSelectedCollaboratorId('');
            loadData();
        } catch (err: any) {
            console.error('Error asignando efectivo:', err);
            setAssignError(err.message || 'Error al guardar asignación');
        } finally {
            setAssigning(false);
        }
    };

    // Conciliar vueltas de un comprador
    const handleReconcileBuyer = async (b: BuyerSummary) => {
        const expectedReturn = b.assignedAmount - b.cashPurchasesTotal;
        const confirmed = window.confirm(`¿Confirmas la recepción física de $${expectedReturn.toLocaleString('es-CO')} COP en billetes entregados por ${b.buyerName}?`);
        if (!confirmed) return;

        setReconcilingId(b.budgetId);
        try {
            const { error } = await supabase
                .from('cash_budgets')
                .update({ 
                    status: 'closed',
                    notes: JSON.stringify({
                        buyer_id: b.buyerId,
                        buyer_name: b.buyerName,
                        zone: b.zone,
                        reconciled_at: new Date().toISOString(),
                        reconciled_by: profile?.contact_name || user?.email || 'Jefe de Compras',
                        expected_return: expectedReturn,
                        actual_return: expectedReturn
                    })
                })
                .eq('id', b.budgetId);

            if (error) throw error;
            loadData();
        } catch (err: any) {
            alert('Error al conciliar caja: ' + err.message);
        } finally {
            setReconcilingId(null);
        }
    };

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#0B132B', color: '#FFFFFF', fontFamily: 'system-ui, -apple-system, sans-serif', paddingBottom: '5rem' }}>
            {/* Cabecera Superior Operativa */}
            <div style={{ backgroundColor: '#1C2541', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '1rem', position: 'sticky', top: 0, zIndex: 30, backdropFilter: 'blur(8px)' }}>
                <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Link href="/ops/compras" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', textDecoration: 'none' }}>
                            <ArrowLeft size={18} strokeWidth={2} />
                        </Link>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                Control de Caja <span style={{ color: '#10B981' }}>Gemba</span>
                            </h1>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>
                                Cuadre de cuadrilla en muelle • Módulo Jefe de Compras
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '10px', padding: '4px 8px' }}>
                            <Calendar size={14} color="#94A3B8" />
                            <input 
                                type="date"
                                value={selectedDate}
                                onChange={e => setSelectedDate(e.target.value)}
                                style={{ background: 'transparent', border: 'none', color: '#FFFFFF', fontSize: '0.8rem', fontWeight: '700', outline: 'none', cursor: 'pointer' }}
                            />
                        </div>
                        <button 
                            onClick={loadData}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.08)', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                            title="Recargar"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button 
                            onClick={() => setShowAssignModal(true)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '0.5rem 0.9rem', borderRadius: '10px',
                                backgroundColor: '#10B981', color: '#FFFFFF',
                                border: 'none', fontWeight: '800', fontSize: '0.85rem',
                                cursor: 'pointer', boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                            }}
                        >
                            <Plus size={16} strokeWidth={2.5} /> Asignar Efectivo
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
                {/* 3 Tarjetas KPI Principales */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ backgroundColor: '#1C2541', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' }}>Total Asignado</span>
                            <Coins size={16} color="#38BDF8" />
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#FFFFFF' }}>
                            {formatMoney(totals.totalAssigned)}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{totals.totalBuyers} compradores con fondo</span>
                    </div>

                    <div style={{ backgroundColor: '#1C2541', borderRadius: '16px', padding: '1rem', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase' }}>Compras Efectivo</span>
                            <TrendingDown size={16} color="#F87171" />
                        </div>
                        <div style={{ fontSize: '1.4rem', fontWeight: '900', color: '#F87171' }}>
                            {formatMoney(totals.totalCashSpent)}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{totals.totalReceipts} recibos a mano</span>
                    </div>

                    <div style={{ backgroundColor: '#1C2541', borderRadius: '16px', padding: '1rem', border: '1px solid #10B981', boxShadow: '0 0 16px rgba(16, 185, 129, 0.15)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#10B981', textTransform: 'uppercase' }}>Vueltas por Recibir</span>
                            <DollarSign size={16} color="#10B981" />
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#10B981' }}>
                            {formatMoney(totals.totalReturns)}
                        </div>
                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{totals.totalClosed} de {totals.totalBuyers} conciliados</span>
                    </div>
                </div>

                {/* Alerta Andon: Compras Huérfanas / Sin Fondo Asignado */}
                {totals.orphanCount > 0 && (
                    <div style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: '14px',
                        padding: '0.85rem 1rem',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(245, 158, 11, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <AlertCircle size={20} color="#F59E0B" />
                            </div>
                            <div>
                                <div style={{ fontWeight: '800', fontSize: '0.88rem', color: '#FCD34D' }}>
                                    Alerta Andon: {totals.orphanCount} {totals.orphanCount === 1 ? 'comprador registró compras sin fondo previo' : 'compradores registraron compras sin fondo previo'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                                    Hay gastos de contado en plaza antes de la asignación matutina. Asígnales presupuesto para cuadrar caja.
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setShowAssignModal(true)}
                            style={{
                                padding: '0.45rem 0.85rem',
                                borderRadius: '8px',
                                backgroundColor: '#F59E0B',
                                color: '#0B132B',
                                border: 'none',
                                fontWeight: '800',
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <Plus size={14} strokeWidth={3} /> Asignar Fondos Faltantes
                        </button>
                    </div>
                )}

                {/* Barra de Filtro */}
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <Search size={16} color="#64748B" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input 
                            type="text"
                            placeholder="Buscar comprador o zona..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%', padding: '0.65rem 0.75rem 0.65rem 2.4rem',
                                borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)',
                                backgroundColor: '#1C2541', color: '#FFFFFF', fontSize: '0.85rem',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* TABLA PRINCIPAL RESPONSIVE (Fila Densa en Móvil + Tabla en Desktop) */}
                <div style={{ backgroundColor: '#1C2541', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
                            <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
                            <p style={{ margin: 0, fontSize: '0.85rem' }}>Cargando arqueo de cuadrilla...</p>
                        </div>
                    ) : filteredBuyers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>
                            <Coins size={32} color="#64748B" style={{ margin: '0 auto 0.75rem auto' }} />
                            <h3 style={{ margin: '0 0 0.4rem 0', color: '#FFFFFF', fontSize: '1rem' }}>No hay fondos asignados para esta fecha</h3>
                            <p style={{ margin: 0, fontSize: '0.8rem', maxWidth: '320px', marginInline: 'auto' }}>
                                Toca el botón <strong>&quot;Asignar Efectivo&quot;</strong> para entregar presupuesto a tus compradores en la mañana.
                            </p>
                        </div>
                    ) : (
                        <div>
                            {/* Encabezado visible en Tablet y Desktop */}
                            <div className="table-header-desktop" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr 1fr 1.2fr', padding: '0.8rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <span>Comprador / Zona</span>
                                <span style={{ textAlign: 'right' }}>Asignado</span>
                                <span style={{ textAlign: 'right' }}>Compras Efec.</span>
                                <span style={{ textAlign: 'right' }}>Vueltas a Devolver</span>
                                <span style={{ textAlign: 'center' }}>Soportes</span>
                                <span style={{ textAlign: 'right' }}>Acción</span>
                            </div>

                            {/* Filas */}
                            {filteredBuyers.map((b) => {
                                const isOrphan = b.assignedAmount === 0 || b.budgetId.startsWith('orphan-');
                                const expectedReturn = b.assignedAmount - b.cashPurchasesTotal;
                                const isClosed = b.status === 'closed';

                                return (
                                    <div 
                                        key={b.budgetId}
                                        style={{ 
                                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                                            padding: '0.85rem 1rem',
                                            backgroundColor: isOrphan ? 'rgba(245, 158, 11, 0.05)' : isClosed ? 'rgba(16, 185, 129, 0.03)' : 'transparent',
                                            transition: 'background-color 0.2s'
                                        }}
                                    >
                                        {/* Versión Desktop Grid */}
                                        <div className="row-desktop" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr 1fr 1.2fr', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: '800', fontSize: '0.9rem', color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {b.buyerName}
                                                    {isOrphan && (
                                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#FCD34D', padding: '2px 6px', borderRadius: '4px' }}>
                                                            Sin Asignar
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: isOrphan ? '#F59E0B' : '#94A3B8' }}>{b.zone}</div>
                                            </div>

                                            <div style={{ textAlign: 'right', fontWeight: '700', fontSize: '0.85rem', color: '#E2E8F0' }}>
                                                {formatMoney(b.assignedAmount)}
                                            </div>

                                            <div style={{ textAlign: 'right', fontWeight: '700', fontSize: '0.85rem', color: '#F87171' }}>
                                                - {formatMoney(b.cashPurchasesTotal)}
                                            </div>

                                            <div style={{ textAlign: 'right', fontWeight: '900', fontSize: '1rem', color: isOrphan ? '#F87171' : isClosed ? '#94A3B8' : '#10B981' }}>
                                                {isOrphan ? `- ${formatMoney(b.cashPurchasesTotal)}` : formatMoney(expectedReturn)}
                                            </div>

                                            <div style={{ textAlign: 'center' }}>
                                                <button 
                                                    onClick={() => setActiveReceiptsBuyer(b)}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '3px 8px', borderRadius: '8px',
                                                        backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8',
                                                        border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.75rem', fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <FileText size={12} /> {b.cashPurchasesCount} {b.cashPurchasesCount === 1 ? 'Recibo' : 'Recibos'}
                                                </button>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                {isOrphan ? (
                                                    <button 
                                                        onClick={() => handleQuickAssignOrphan(b)}
                                                        style={{
                                                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                                                            backgroundColor: '#F59E0B', color: '#0B132B',
                                                            border: 'none', fontWeight: '800', fontSize: '0.75rem',
                                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                                                        }}
                                                    >
                                                        <AlertCircle size={13} /> Asignar Fondo
                                                    </button>
                                                ) : isClosed ? (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: '800', color: '#10B981', padding: '4px 8px', borderRadius: '8px', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                                                        <Check size={14} strokeWidth={3} /> Conciliado
                                                    </span>
                                                ) : (
                                                    <button 
                                                        disabled={reconcilingId === b.budgetId}
                                                        onClick={() => handleReconcileBuyer(b)}
                                                        style={{
                                                            padding: '0.4rem 0.75rem', borderRadius: '8px',
                                                            backgroundColor: '#10B981', color: '#FFFFFF',
                                                            border: 'none', fontWeight: '800', fontSize: '0.75rem',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Recibir {formatMoney(expectedReturn)}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Versión Mobile Fila Densa Multi-Línea (< 768px) */}
                                        <div className="row-mobile">
                                            {/* Línea 1: Nombre + Vueltas Grande */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                                <div>
                                                    <span style={{ fontWeight: '800', fontSize: '0.95rem', color: '#FFFFFF' }}>{b.buyerName}</span>
                                                    <span style={{ display: 'block', fontSize: '0.7rem', color: isOrphan ? '#F59E0B' : '#94A3B8' }}>{b.zone}</span>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <span style={{ fontSize: '0.65rem', fontWeight: '700', color: isOrphan ? '#F87171' : '#94A3B8', textTransform: 'uppercase' }}>
                                                        {isOrphan ? 'Déficit: ' : 'Vueltas: '}
                                                    </span>
                                                    <span style={{ fontSize: '1.1rem', fontWeight: '900', color: isOrphan ? '#F87171' : isClosed ? '#94A3B8' : '#10B981' }}>
                                                        {isOrphan ? `-${formatMoney(b.cashPurchasesTotal)}` : formatMoney(expectedReturn)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Línea 2: Desglose y Acciones */}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', paddingTop: '4px', borderTop: '1px dashed rgba(255,255,255,0.06)' }}>
                                                <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                                    Asignado: <strong style={{ color: '#FFFFFF' }}>{formatMoney(b.assignedAmount)}</strong> • Gastado: <strong style={{ color: '#F87171' }}>{formatMoney(b.cashPurchasesTotal)}</strong>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <button 
                                                        onClick={() => setActiveReceiptsBuyer(b)}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                            padding: '4px 7px', borderRadius: '6px',
                                                            backgroundColor: 'rgba(56, 189, 248, 0.1)', color: '#38BDF8',
                                                            border: '1px solid rgba(56, 189, 248, 0.2)', fontSize: '0.7rem', fontWeight: '700'
                                                        }}
                                                    >
                                                        📷 {b.cashPurchasesCount}
                                                    </button>

                                                    {isOrphan ? (
                                                        <button 
                                                            onClick={() => handleQuickAssignOrphan(b)}
                                                            style={{
                                                                padding: '4px 8px', borderRadius: '6px',
                                                                backgroundColor: '#F59E0B', color: '#0B132B',
                                                                border: 'none', fontWeight: '800', fontSize: '0.72rem',
                                                                display: 'inline-flex', alignItems: 'center', gap: '3px'
                                                            }}
                                                        >
                                                            ⚠️ Asignar
                                                        </button>
                                                    ) : isClosed ? (
                                                        <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#10B981', padding: '3px 6px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.1)' }}>
                                                            ✓ Recibido
                                                        </span>
                                                    ) : (
                                                        <button 
                                                            disabled={reconcilingId === b.budgetId}
                                                            onClick={() => handleReconcileBuyer(b)}
                                                            style={{
                                                                padding: '4px 8px', borderRadius: '6px',
                                                                backgroundColor: '#10B981', color: '#FFFFFF',
                                                                border: 'none', fontWeight: '800', fontSize: '0.72rem'
                                                            }}
                                                        >
                                                            Recibir
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Footer de Totales Consolidado */}
                            <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <div className="footer-desktop" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.2fr 1fr 1.2fr', alignItems: 'center', fontSize: '0.85rem' }}>
                                    <div style={{ fontWeight: '900', color: '#FFFFFF', textTransform: 'uppercase' }}>
                                        TOTALES CUADRILLA ({totals.totalBuyers})
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: '900', color: '#FFFFFF' }}>
                                        {formatMoney(totals.totalAssigned)}
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: '900', color: '#F87171' }}>
                                        - {formatMoney(totals.totalCashSpent)}
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: '900', color: '#10B981', fontSize: '1.1rem' }}>
                                        {formatMoney(totals.totalReturns)}
                                    </div>
                                    <div style={{ textAlign: 'center', fontWeight: '700', color: '#38BDF8' }}>
                                        {totals.totalReceipts} Recibos
                                    </div>
                                    <div style={{ textAlign: 'right', fontWeight: '700', color: '#94A3B8' }}>
                                        {totals.totalClosed} / {totals.totalBuyers} Cerrados
                                    </div>
                                </div>

                                <div className="footer-mobile" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '700', color: '#94A3B8' }}>
                                        <span>Total Asignado: {formatMoney(totals.totalAssigned)}</span>
                                        <span>Gastado: {formatMoney(totals.totalCashSpent)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                                        <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#FFFFFF' }}>VUELTAS TOTALES:</span>
                                        <span style={{ fontSize: '1.25rem', fontWeight: '900', color: '#10B981' }}>{formatMoney(totals.totalReturns)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL: ASIGNAR EFECTIVO A COMPRADOR */}
            {showAssignModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
                    <div style={{ backgroundColor: '#1C2541', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '440px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10B981' }}>
                                    <Coins size={20} />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#FFFFFF' }}>Asignar Efectivo</h3>
                            </div>
                            <button onClick={() => setShowAssignModal(false)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {assignError && (
                            <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid #EF4444', borderRadius: '10px', padding: '0.6rem 0.8rem', color: '#FCA5A5', fontSize: '0.8rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <AlertCircle size={14} /> {assignError}
                            </div>
                        )}

                        <form onSubmit={handleAssignFunds}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#94A3B8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                    Comprador de Cuadrilla
                                </label>
                                <select 
                                    required
                                    value={selectedCollaboratorId}
                                    onChange={e => setSelectedCollaboratorId(e.target.value)}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0B132B', color: '#FFFFFF', fontSize: '0.9rem', outline: 'none' }}
                                >
                                    <option value="">Selecciona un colaborador...</option>
                                    {collaborators.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.contact_name || c.company_name || c.email} ({c.role})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#94A3B8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                    Monto en Efectivo a Entregar (COP)
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontWeight: '800', color: '#10B981' }}>$</span>
                                    <input 
                                        type="number"
                                        required
                                        min="1000"
                                        step="1000"
                                        placeholder="Ej: 3000000"
                                        value={assignAmount}
                                        onChange={e => setAssignAmount(e.target.value)}
                                        style={{ width: '100%', padding: '0.75rem 0.75rem 0.75rem 2rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0B132B', color: '#FFFFFF', fontSize: '1.1rem', fontWeight: '800', outline: 'none' }}
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#94A3B8', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
                                    Sector / Zona de Compra
                                </label>
                                <input 
                                    type="text"
                                    placeholder="Ej: Corabastos Sector Papa / Hortalizas"
                                    value={assignZone}
                                    onChange={e => setAssignZone(e.target.value)}
                                    style={{ width: '100%', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: '#0B132B', color: '#FFFFFF', fontSize: '0.85rem', outline: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setShowAssignModal(false)}
                                    style={{ flex: 1, padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'transparent', color: '#94A3B8', fontWeight: '700', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button 
                                    type="submit"
                                    disabled={assigning}
                                    style={{ flex: 1.5, padding: '0.75rem', borderRadius: '10px', border: 'none', backgroundColor: '#10B981', color: '#FFFFFF', fontWeight: '800', cursor: assigning ? 'not-allowed' : 'pointer' }}
                                >
                                    {assigning ? 'Asignando...' : 'Confirmar Entrega'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* MODAL: AUDITORÍA DE RECIBOS Y FOTOS DE UN COMPRADOR */}
            {activeReceiptsBuyer && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
                    <div style={{ backgroundColor: '#1C2541', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px rgba(0,0,0,0.6)' }}>
                        {/* Cabecera Modal */}
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '800', color: '#FFFFFF' }}>
                                    Recibos de {activeReceiptsBuyer.buyerName}
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94A3B8' }}>
                                    {activeReceiptsBuyer.vouchers.length} compras auditadas • Total: {formatMoney(activeReceiptsBuyer.cashPurchasesTotal)}
                                </p>
                            </div>
                            <button onClick={() => setActiveReceiptsBuyer(null)} style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Lista de Recibos */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {activeReceiptsBuyer.vouchers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>
                                    No hay compras registradas con recibo aún.
                                </div>
                            ) : (
                                activeReceiptsBuyer.vouchers.map((v, i) => (
                                    <div key={v.id || i} style={{ backgroundColor: '#0B132B', borderRadius: '14px', padding: '0.85rem', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#FFFFFF' }}>{v.product_name}</span>
                                                <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', backgroundColor: v.payment_method === 'cash' ? 'rgba(16,185,129,0.15)' : 'rgba(56,189,248,0.15)', color: v.payment_method === 'cash' ? '#10B981' : '#38BDF8' }}>
                                                    {v.payment_method === 'cash' ? 'EFECTIVO' : 'CRÉDITO'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                                Proveedor: {v.provider_name}
                                            </div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#F87171', marginTop: '2px' }}>
                                                {formatMoney(v.total_cost)}
                                            </div>
                                        </div>

                                        {/* Foto del Vale */}
                                        {v.voucher_image_url ? (
                                            <div 
                                                onClick={() => setZoomedImage(v.voucher_image_url || null)}
                                                style={{ width: '64px', height: '64px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, cursor: 'pointer', position: 'relative' }}
                                                title="Tocar para ampliar foto"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img 
                                                    src={v.voucher_image_url} 
                                                    alt="Recibo" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                />
                                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Eye size={16} color="#FFFFFF" />
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{ width: '64px', height: '64px', borderRadius: '10px', backgroundColor: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.65rem', textAlign: 'center', padding: '4px' }}>
                                                Sin Foto
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Pie Modal */}
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#94A3B8' }}>Vueltas calculadas:</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#10B981' }}>
                                {formatMoney(activeReceiptsBuyer.assignedAmount - activeReceiptsBuyer.cashPurchasesTotal)}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: FOTO AMPLIADA EN PANTALLA COMPLETA */}
            {zoomedImage && (
                <div 
                    onClick={() => setZoomedImage(null)}
                    style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.92)', zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'pointer' }}
                >
                    <button 
                        onClick={() => setZoomedImage(null)}
                        style={{ position: 'absolute', top: '16px', right: '16px', backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: '#FFFFFF', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                    >
                        <X size={22} />
                    </button>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        src={zoomedImage} 
                        alt="Recibo Ampliado" 
                        style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' }} 
                    />
                </div>
            )}

            {/* ESTILOS RESPONSIVE PARA EL TOGGLE DE TABLA VS FILA DENSA */}
            <style jsx>{`
                @media (max-width: 767px) {
                    .table-header-desktop {
                        display: none !important;
                    }
                    .row-desktop {
                        display: none !important;
                    }
                    .row-mobile {
                        display: block !important;
                    }
                    .footer-desktop {
                        display: none !important;
                    }
                    .footer-mobile {
                        display: flex !important;
                    }
                }
                @media (min-width: 768px) {
                    .table-header-desktop {
                        display: grid !important;
                    }
                    .row-desktop {
                        display: grid !important;
                    }
                    .row-mobile {
                        display: none !important;
                    }
                    .footer-desktop {
                        display: grid !important;
                    }
                    .footer-mobile {
                        display: none !important;
                    }
                }
            `}</style>
        </main>
    );
}
