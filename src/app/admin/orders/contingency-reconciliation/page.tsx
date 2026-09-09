'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { 
    FileCheck2, 
    Search, 
    Calendar, 
    CheckCircle2, 
    AlertTriangle, 
    Save, 
    ArrowLeft, 
    Building2, 
    Package, 
    DollarSign, 
    Layers, 
    Clock, 
    Sparkles,
    ShieldCheck,
    Check
} from 'lucide-react';
import Link from 'next/link';

interface OrderItemRow {
    id: string;
    product_id: string;
    product_name: string;
    sku?: string;
    unit: string;
    quantity: number;
    unit_price: number;
    total: number;
    // Reconciliation state
    received_quantity: number;
    difference_qty: number;
    difference_val: number;
    difference_reason: string;
}

interface OrderRecord {
    id: string;
    sequence_id?: number;
    created_at: string;
    delivery_date: string;
    total: number;
    subtotal?: number;
    status: string;
    admin_notes?: string;
    warehouse_spaces?: number[];
    shipping_address?: string;
    client_id?: string;
    client_name: string;
    client_phone?: string;
    client_nit?: string;
    space_label: string;
    items_count: number;
    is_reconciled: boolean;
    order_items: any[];
}

export default function ContingencyReconciliationPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const paramDate = searchParams.get('date');

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [orders, setOrders] = useState<OrderRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'RECONCILED'>('ALL');

    // Currently active order for reconciliation
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [activeItems, setActiveItems] = useState<OrderItemRow[]>([]);
    const [cratesDelivered, setCratesDelivered] = useState<number>(0);
    const [cratesReturned, setCratesReturned] = useState<number>(0);
    const [saving, setSaving] = useState(false);
    const [saveToast, setSaveToast] = useState<string | null>(null);

    // References for input focusing
    const firstInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        fetchOrders();
    }, [selectedDate]);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
                    id, sequence_id, created_at, delivery_date, total, subtotal, status, admin_notes, warehouse_spaces, shipping_address, profile_id,
                    profiles:profile_id(id, company_name, contact_name, phone, contact_phone, nit),
                    order_items(
                        id, product_id, quantity, unit, unit_price, nickname, variant_label,
                        products(id, name, sku, unit_of_measure)
                    )
                `)
                .eq('delivery_date', selectedDate)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Error cargando pedidos para conciliación:', error.message || error.details || error);
                throw error;
            }

            const parsed: OrderRecord[] = (data || []).map((o: any, idx: number) => {
                const cName = o.profiles?.company_name || o.profiles?.contact_name || 'Cliente';
                const spaceLabel = (o.warehouse_spaces && o.warehouse_spaces.length > 0)
                    ? formatSpaceLabel(o.warehouse_spaces)
                    : (o.sequence_id ? `${o.sequence_id}` : `${idx + 1}`);

                const isReconciled = (o.admin_notes || '').includes('[CONCILIADO_MANUAL]') || 
                                     ['delivered', 'recibido', 'reconciled'].includes(o.status);

                return {
                    id: o.id,
                    sequence_id: o.sequence_id,
                    created_at: o.created_at || new Date().toISOString(),
                    delivery_date: o.delivery_date,
                    total: Number(o.total) || 0,
                    subtotal: Number(o.subtotal) || Number(o.total) || 0,
                    status: o.status,
                    admin_notes: o.admin_notes,
                    warehouse_spaces: o.warehouse_spaces,
                    shipping_address: o.shipping_address,
                    client_id: o.profile_id || o.profiles?.id,
                    client_name: cName,
                    client_phone: o.profiles?.contact_phone || o.profiles?.phone,
                    client_nit: o.profiles?.nit,
                    space_label: spaceLabel,
                    items_count: (o.order_items || []).length,
                    is_reconciled: isReconciled,
                    order_items: o.order_items || []
                };
            });

            setOrders(parsed);

            // Select first pending order by default if available
            if (parsed.length > 0) {
                const pending = parsed.find(o => !o.is_reconciled) || parsed[0];
                selectOrder(pending);
            } else {
                setSelectedOrderId(null);
                setActiveItems([]);
            }

        } catch (err) {
            console.error('Error cargando pedidos para conciliación:', err);
        } finally {
            setLoading(false);
        }
    };

    const selectOrder = (order: OrderRecord) => {
        setSelectedOrderId(order.id);
        const rows: OrderItemRow[] = (order.order_items || []).map((it: any) => {
            const pName = it.nickname || it.products?.name || 'Producto';
            const sku = it.products?.sku || '';
            const unit = it.unit || it.products?.unit_of_measure || 'KG';
            const qty = Number(it.quantity) || 0;
            const price = Number(it.unit_price) || 0;

            return {
                id: it.id,
                product_id: it.product_id || it.products?.id,
                product_name: pName + (it.variant_label ? ` (${it.variant_label})` : ''),
                sku,
                unit,
                quantity: qty,
                unit_price: price,
                total: qty * price,
                received_quantity: qty, // Default to 100% received
                difference_qty: 0,
                difference_val: 0,
                difference_reason: 'Faltante en entrega'
            };
        });

        setActiveItems(rows);
        setCratesDelivered(Math.ceil((order.total / 150000)) || 2); // Approximate standard
        setCratesReturned(Math.ceil((order.total / 150000)) || 2);

        setTimeout(() => {
            if (firstInputRef.current) firstInputRef.current.focus();
        }, 100);
    };

    const handleReceivedQtyChange = (itemId: string, valStr: string) => {
        const val = parseFloat(valStr) || 0;
        setActiveItems(prev => prev.map(it => {
            if (it.id !== itemId) return it;
            const diffQty = Math.round((it.quantity - val) * 100) / 100;
            const diffVal = Math.round(diffQty * it.unit_price);
            return {
                ...it,
                received_quantity: val,
                difference_qty: diffQty,
                difference_val: diffVal
            };
        }));
    };

    const handleReasonChange = (itemId: string, reason: string) => {
        setActiveItems(prev => prev.map(it => it.id === itemId ? { ...it, difference_reason: reason } : it));
    };

    // Calculate Totals for active reconciliation
    const activeOrder = useMemo(() => orders.find(o => o.id === selectedOrderId), [orders, selectedOrderId]);

    const reconciliationSummary = useMemo(() => {
        const dispatchedTotal = activeItems.reduce((s, it) => s + it.total, 0);
        const receivedTotal = activeItems.reduce((s, it) => s + (it.received_quantity * it.unit_price), 0);
        const totalDifference = Math.round(dispatchedTotal - receivedTotal);
        const itemsWithDiff = activeItems.filter(it => it.difference_qty > 0);

        return {
            dispatchedTotal,
            receivedTotal,
            totalDifference,
            itemsWithDiffCount: itemsWithDiff.length,
            hasDifferences: totalDifference > 0
        };
    }, [activeItems]);

    // Save Reconciliation
    const handleSaveReconciliation = async (forceExact: boolean = false) => {
        if (!activeOrder) return;
        setSaving(true);
        try {
            const itemsToProcess = forceExact 
                ? activeItems.map(it => ({ ...it, received_quantity: it.quantity, difference_qty: 0, difference_val: 0 }))
                : activeItems;

            const differences = itemsToProcess.filter(it => it.difference_qty > 0);

            // 1. If differences exist, register them in billing_returns
            if (differences.length > 0) {
                const returnInserts = differences.map(diff => ({
                    order_id: activeOrder.id,
                    product_id: diff.product_id,
                    quantity_returned: diff.difference_qty,
                    reason: diff.difference_reason,
                    status: 'approved',
                    notes: `Conciliación manual en remisión física. Despachado: ${diff.quantity} ${diff.unit}, Recibido: ${diff.received_quantity} ${diff.unit}. Impacto: -$${diff.difference_val.toLocaleString('es-CO')}`
                }));

                const { error: rErr } = await supabase.from('billing_returns').insert(returnInserts);
                if (rErr) console.warn('Aviso al insertar en billing_returns:', rErr);
            }

            // 2. Update order status to delivered/reconciled with note
            const updatedNotes = (activeOrder.admin_notes ? activeOrder.admin_notes + ' ' : '') + 
                `[CONCILIADO_MANUAL ${new Date().toISOString().slice(0,16)}] Canastillas: ${cratesDelivered} entregadas / ${cratesReturned} devueltas.`;

            const { error: oErr } = await supabase
                .from('orders')
                .update({
                    status: 'delivered',
                    admin_notes: updatedNotes
                })
                .eq('id', activeOrder.id);

            if (oErr) throw oErr;

            // 3. Update local state
            setOrders(prev => prev.map(o => {
                if (o.id === activeOrder.id) {
                    return { ...o, is_reconciled: true, status: 'delivered', admin_notes: updatedNotes };
                }
                return o;
            }));

            setSaveToast(differences.length > 0 
                ? `Conciliación guardada. Se generó ajuste por -$${reconciliationSummary.totalDifference.toLocaleString('es-CO')} en ${differences.length} productos.`
                : 'Conciliación conforme guardada al 100% sin novedades.'
            );

            setTimeout(() => setSaveToast(null), 4000);

            // Auto-advance to next pending order
            const currentIndex = orders.findIndex(o => o.id === activeOrder.id);
            const nextPending = orders.slice(currentIndex + 1).find(o => !o.is_reconciled);
            if (nextPending) {
                selectOrder(nextPending);
            }

        } catch (err: any) {
            console.error('Error guardando conciliación:', err);
            alert('Error al guardar: ' + err.message);
        } finally {
            setSaving(false);
        }
    };

    // Filter orders for left column
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            const matchesSearch = o.client_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                 (o.sequence_id && o.sequence_id.toString().includes(searchQuery)) ||
                                 o.space_label.includes(searchQuery);

            const matchesStatus = statusFilter === 'ALL' ||
                                 (statusFilter === 'PENDING' && !o.is_reconciled) ||
                                 (statusFilter === 'RECONCILED' && o.is_reconciled);

            return matchesSearch && matchesStatus;
        });
    }, [orders, searchQuery, statusFilter]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
            
            {/* Top Navigation Bar */}
            <header style={{
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                padding: '0.85rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid #1E293B'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            backgroundColor: '#1E293B',
                            border: '1px solid #334155',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            color: '#F8FAFC'
                        }}
                    >
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileCheck2 size={22} color="#10B981" />
                            Mesa de Conciliación y Cierre Post-Despacho
                        </h1>
                        <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                            Digitación rápida de remisiones manuscritas firmadas &bull; Cierre de bucle y ajuste automático
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {/* Date Selector */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: '8px', padding: '4px 10px' }}>
                        <Calendar size={14} color="#94A3B8" />
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#CBD5E1' }}>Fecha de Ruta:</span>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#FFFFFF', outline: 'none' }}
                        />
                    </div>

                    <Link
                        href="/admin/commercial/billing"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            borderRadius: '8px',
                            textDecoration: 'none',
                            fontSize: '0.8rem',
                            fontWeight: '700'
                        }}
                    >
                        Ir a Facturación Oficial &rarr;
                    </Link>
                </div>
            </header>

            {/* Toast Notification */}
            {saveToast && (
                <div style={{
                    backgroundColor: '#065F46',
                    color: '#FFFFFF',
                    padding: '8px 16px',
                    textAlign: 'center',
                    fontSize: '0.82rem',
                    fontWeight: '800',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                }}>
                    <CheckCircle2 size={16} />
                    {saveToast}
                </div>
            )}

            {/* Main Content Layout: Two Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', flex: 1, overflow: 'hidden' }}>
                
                {/* Left Column: Orders List */}
                <div style={{
                    borderRight: '1px solid #E2E8F0',
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    height: 'calc(100vh - 65px)'
                }}>
                    {/* Search and Filters */}
                    <div style={{ padding: '12px', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                            <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '9px' }} />
                            <input
                                type="text"
                                placeholder="Buscar cliente, orden o bahía..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '6px 10px 6px 30px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '4px' }}>
                            {(['ALL', 'PENDING', 'RECONCILED'] as const).map(st => (
                                <button
                                    key={st}
                                    onClick={() => setStatusFilter(st)}
                                    style={{
                                        flex: 1,
                                        padding: '4px 6px',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        borderRadius: '6px',
                                        border: '1px solid',
                                        cursor: 'pointer',
                                        backgroundColor: statusFilter === st ? '#0F172A' : '#FFFFFF',
                                        color: statusFilter === st ? '#FFFFFF' : '#64748B',
                                        borderColor: statusFilter === st ? '#0F172A' : '#CBD5E1'
                                    }}
                                >
                                    {st === 'ALL' ? 'Todos' : st === 'PENDING' ? 'Pendientes' : 'Listos'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Orders Scrollable List */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748B', fontSize: '0.82rem' }}>
                                Cargando remisiones...
                            </div>
                        ) : filteredOrders.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8', fontSize: '0.82rem' }}>
                                No se encontraron pedidos para esta fecha.
                            </div>
                        ) : (
                            filteredOrders.map(ord => {
                                const isSelected = ord.id === selectedOrderId;
                                return (
                                    <div
                                        key={ord.id}
                                        onClick={() => selectOrder(ord)}
                                        style={{
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            marginBottom: '6px',
                                            cursor: 'pointer',
                                            border: isSelected ? '2px solid #0D7A57' : '1px solid #E2E8F0',
                                            backgroundColor: isSelected ? '#F0FDF4' : '#FFFFFF',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: '900',
                                                    padding: '2px 6px',
                                                    borderRadius: '4px',
                                                    backgroundColor: '#0F172A',
                                                    color: '#FFFFFF'
                                                }}>
                                                    BAHÍA [{ord.space_label}]
                                                </span>
                                                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0F172A' }}>
                                                    #{getFriendlyOrderId(ord)}
                                                </span>
                                            </div>

                                            {ord.is_reconciled ? (
                                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#059669', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                    <Check size={12} /> Conciliado
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#D97706', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                    <Clock size={12} /> Pendiente
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1E293B', marginBottom: '2px' }}>
                                            {ord.client_name}
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#64748B' }}>
                                            <span>{ord.items_count} ítems</span>
                                            <span style={{ fontWeight: '800', color: '#0F172A' }}>${ord.total.toLocaleString('es-CO')}</span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Column: Active Order Reconciliation Desk */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    display: 'flex',
                    flexDirection: 'column',
                    height: 'calc(100vh - 65px)',
                    overflowY: 'auto'
                }}>
                    {activeOrder ? (
                        <div style={{ padding: '1.5rem', maxWidth: '1050px' }}>
                            
                            {/* Header Card */}
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                padding: '1.2rem',
                                marginBottom: '1.2rem',
                                display: 'grid',
                                gridTemplateColumns: '1.5fr 1fr',
                                gap: '16px'
                            }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <span style={{ backgroundColor: '#0D7A57', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: '900', padding: '2px 8px', borderRadius: '4px' }}>
                                            ESPACIO MUELLE [{activeOrder.space_label}]
                                        </span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748B' }}>
                                            ORDEN #{getFriendlyOrderId(activeOrder)}
                                        </span>
                                    </div>
                                    <h2 style={{ margin: '4px 0', fontSize: '1.25rem', fontWeight: '900', color: '#0F172A' }}>
                                        {activeOrder.client_name}
                                    </h2>
                                    <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                                        <strong>NIT / CC:</strong> {activeOrder.client_nit || 'N/A'} &bull; <strong>Dir:</strong> {activeOrder.shipping_address || 'Bogotá'}
                                    </div>
                                </div>

                                {/* Financial Pulse Box */}
                                <div style={{
                                    backgroundColor: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    borderRadius: '8px',
                                    padding: '10px 14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'center'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                                        <span style={{ color: '#64748B' }}>Despachado Original:</span>
                                        <span style={{ fontWeight: '800' }}>${reconciliationSummary.dispatchedTotal.toLocaleString('es-CO')}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                                        <span style={{ color: '#64748B' }}>Recibido en Firme:</span>
                                        <span style={{ fontWeight: '800', color: '#0D7A57' }}>${reconciliationSummary.receivedTotal.toLocaleString('es-CO')}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '900', borderTop: '1px solid #E2E8F0', paddingTop: '4px' }}>
                                        <span style={{ color: reconciliationSummary.hasDifferences ? '#DC2626' : '#64748B' }}>
                                            {reconciliationSummary.hasDifferences ? 'Ajuste / Nota Crédito:' : 'Diferencia:'}
                                        </span>
                                        <span style={{ color: reconciliationSummary.hasDifferences ? '#DC2626' : '#059669' }}>
                                            {reconciliationSummary.hasDifferences ? `-$${reconciliationSummary.totalDifference.toLocaleString('es-CO')}` : '$0 (Exacto)'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Crate Control Mini-Banner */}
                            <div style={{
                                backgroundColor: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                marginBottom: '1.2rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: '800', color: '#1E40AF' }}>
                                    <Package size={16} /> Control de Canastillas Retornables:
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#1E3A8A' }}>
                                        Entregadas:
                                        <input
                                            type="number"
                                            value={cratesDelivered}
                                            onChange={(e) => setCratesDelivered(parseInt(e.target.value) || 0)}
                                            style={{ width: '55px', padding: '3px 6px', borderRadius: '4px', border: '1px solid #93C5FD', fontWeight: '800', textAlign: 'center' }}
                                        />
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#1E3A8A' }}>
                                        Devueltas:
                                        <input
                                            type="number"
                                            value={cratesReturned}
                                            onChange={(e) => setCratesReturned(parseInt(e.target.value) || 0)}
                                            style={{ width: '55px', padding: '3px 6px', borderRadius: '4px', border: '1px solid #93C5FD', fontWeight: '800', textAlign: 'center' }}
                                        />
                                    </label>
                                    <span style={{ fontSize: '0.78rem', fontWeight: '900', color: cratesDelivered === cratesReturned ? '#059669' : '#D97706' }}>
                                        Balance: {cratesReturned - cratesDelivered}
                                    </span>
                                </div>
                            </div>

                            {/* Reconciliation Table */}
                            <div style={{ border: '1px solid #E2E8F0', borderRadius: '8px', overflow: 'hidden', marginBottom: '1.5rem' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                                            <th style={{ textAlign: 'center', width: '30px', padding: '8px 4px' }}>#</th>
                                            <th style={{ textAlign: 'left', padding: '8px 10px' }}>Producto / Descripción</th>
                                            <th style={{ textAlign: 'center', width: '45px', padding: '8px 4px' }}>UM</th>
                                            <th style={{ textAlign: 'right', width: '85px', padding: '8px 6px' }}>Despachado</th>
                                            <th style={{ textAlign: 'right', width: '85px', padding: '8px 6px' }}>Precio/UM</th>
                                            <th style={{ textAlign: 'center', width: '110px', padding: '8px 6px', backgroundColor: '#0D7A57' }}>
                                                KG-UN RECIBE
                                            </th>
                                            <th style={{ textAlign: 'right', width: '85px', padding: '8px 6px' }}>Diferencia</th>
                                            <th style={{ textAlign: 'left', width: '160px', padding: '8px 8px' }}>Motivo de Ajuste</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {activeItems.map((it, idx) => {
                                            const hasDiff = it.difference_qty > 0;
                                            return (
                                                <tr key={it.id} style={{ backgroundColor: hasDiff ? '#FEF2F2' : idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                                                    <td style={{ textAlign: 'center', color: '#64748B', fontWeight: '700' }}>
                                                        {idx + 1}
                                                    </td>
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <strong style={{ color: '#0F172A' }}>{it.product_name}</strong>
                                                        {it.sku && <span style={{ fontSize: '0.68rem', color: '#94A3B8', marginLeft: '6px' }}>({it.sku})</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'center', color: '#475569' }}>
                                                        {it.unit}
                                                    </td>
                                                    <td style={{ textAlign: 'right', fontWeight: '700', color: '#0F172A', padding: '8px 6px' }}>
                                                        {it.quantity.toLocaleString('es-CO')}
                                                    </td>
                                                    <td style={{ textAlign: 'right', color: '#64748B', padding: '8px 6px' }}>
                                                        ${it.unit_price.toLocaleString('es-CO')}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '4px 6px', backgroundColor: hasDiff ? '#FEE2E2' : '#F0FDF4' }}>
                                                        <input
                                                            ref={idx === 0 ? firstInputRef : undefined}
                                                            type="number"
                                                            step="0.1"
                                                            value={it.received_quantity}
                                                            onChange={(e) => handleReceivedQtyChange(it.id, e.target.value)}
                                                            style={{
                                                                width: '80px',
                                                                padding: '5px 8px',
                                                                borderRadius: '6px',
                                                                border: hasDiff ? '2px solid #EF4444' : '1px solid #10B981',
                                                                fontSize: '0.85rem',
                                                                fontWeight: '900',
                                                                textAlign: 'center',
                                                                color: hasDiff ? '#991B1B' : '#0F172A',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '8px 6px', fontWeight: '800', color: hasDiff ? '#DC2626' : '#059669' }}>
                                                        {hasDiff ? `-${it.difference_qty} ${it.unit}` : '0'}
                                                    </td>
                                                    <td style={{ padding: '4px 8px' }}>
                                                        {hasDiff ? (
                                                            <select
                                                                value={it.difference_reason}
                                                                onChange={(e) => handleReasonChange(it.id, e.target.value)}
                                                                style={{
                                                                    width: '100%',
                                                                    padding: '4px 6px',
                                                                    fontSize: '0.72rem',
                                                                    borderRadius: '4px',
                                                                    border: '1px solid #FCA5A5',
                                                                    backgroundColor: '#FFFFFF',
                                                                    color: '#991B1B',
                                                                    fontWeight: '700'
                                                                }}
                                                            >
                                                                <option value="Faltante en entrega">Faltante en entrega</option>
                                                                <option value="Rechazo por no conformidad / merma">Rechazo por merma</option>
                                                                <option value="Avería durante transporte">Avería transporte</option>
                                                                <option value="Error de pesaje en muelle">Error pesaje</option>
                                                            </select>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Conforme</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Action Buttons Desk */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                                        * Al guardar, las diferencias se reportan a Facturación y se ajusta el saldo para Word Office.
                                    </span>
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleSaveReconciliation(true)}
                                        disabled={saving}
                                        style={{
                                            padding: '10px 18px',
                                            backgroundColor: '#F1F5F9',
                                            color: '#334155',
                                            border: '1px solid #CBD5E1',
                                            borderRadius: '8px',
                                            fontWeight: '800',
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        <Check size={16} color="#059669" />
                                        Aprobar 100% Exacto (Sin Novedad)
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleSaveReconciliation(false)}
                                        disabled={saving}
                                        style={{
                                            padding: '10px 22px',
                                            backgroundColor: reconciliationSummary.hasDifferences ? '#DC2626' : '#0D7A57',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            borderRadius: '8px',
                                            fontWeight: '900',
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                                        }}
                                    >
                                        <Save size={16} />
                                        {saving ? 'Guardando...' : reconciliationSummary.hasDifferences ? 'Guardar y Generar Ajuste' : 'Guardar Conciliación'}
                                    </button>
                                </div>
                            </div>

                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '5rem', color: '#94A3B8' }}>
                            <FileCheck2 size={48} color="#CBD5E1" style={{ margin: '0 auto 1rem' }} />
                            <p style={{ fontSize: '1rem', fontWeight: '800' }}>Selecciona una remisión de la lista izquierda para conciliar.</p>
                        </div>
                    )}
                </div>

            </div>

        </div>
    );
}
