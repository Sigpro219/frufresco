'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Scale, X, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';

interface OverweightItemRow {
    orderItemId: string;
    orderId: string;
    sequenceId: number | null;
    deliveryDate: string;
    clientName: string;
    productId: string;
    productName: string;
    productSku: string;
    unitOfMeasure: string;
    orderedQty: number;
    pickedQty: number;
    overweightDelta: number;
    unitPrice: number;
    chargeOverweight: boolean; // true => Col M (additional_sale), false => Col P (waste_weighing)
    selectedOptions: Record<string, unknown>;
}

interface RawOrderProfile {
    company_name?: string | null;
    contact_name?: string | null;
    razon_social?: string | null;
}

interface RawOrderItemProduct {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
}

interface RawOrderItemRecord {
    id: string;
    product_id: string;
    quantity: number | string | null;
    picked_quantity: number | string | null;
    unit_price: number | string | null;
    selected_options?: Record<string, unknown> | null;
    products?: RawOrderItemProduct | RawOrderItemProduct[] | null;
}

interface RawOrderRecord {
    id: string;
    sequence_id?: number | null;
    delivery_date?: string | null;
    status?: string | null;
    profiles?: RawOrderProfile | RawOrderProfile[] | null;
    order_items?: RawOrderItemRecord[] | null;
}

interface RawMovementRecord {
    reference_id?: string | null;
    reference_type?: string | null;
}

interface OverweightBillingArbitrationModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate?: string;
    onUpdated?: () => void;
}

export default function OverweightBillingArbitrationModal({
    isOpen,
    onClose,
    selectedDate,
    onUpdated
}: OverweightBillingArbitrationModalProps) {
    const [loading, setLoading] = useState(false);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [rows, setRows] = useState<OverweightItemRow[]>([]);
    const [dateFilter, setDateFilter] = useState<string>(
        selectedDate || new Date().toISOString().split('T')[0]
    );

    useEffect(() => {
        if (selectedDate) setDateFilter(selectedDate);
    }, [selectedDate]);

    const fetchOverweightItems = useCallback(async () => {
        if (!isOpen) return;
        setLoading(true);
        try {
            const { data: ordersData, error } = await supabase
                .from('orders')
                .select(`
                    id, sequence_id, delivery_date, status,
                    profiles:profile_id (company_name, contact_name, razon_social),
                    order_items (
                        id, product_id, quantity, picked_quantity, unit_price, selected_options,
                        products (name, sku, unit_of_measure)
                    )
                `)
                .eq('delivery_date', dateFilter)
                .neq('status', 'cancelled')
                .order('sequence_id', { ascending: false });

            if (error) throw error;

            const candidateItems: OverweightItemRow[] = [];
            const itemIds: string[] = [];

            const typedOrders = (ordersData || []) as unknown as RawOrderRecord[];
            typedOrders.forEach((ord) => {
                const prof = Array.isArray(ord.profiles) ? ord.profiles[0] : ord.profiles;
                const clientName = prof?.company_name || prof?.razon_social || prof?.contact_name || 'Cliente';
                (ord.order_items || []).forEach((oi) => {
                    const ordered = Number(oi.quantity) || 0;
                    const picked = Number(oi.picked_quantity) || 0;
                    const delta = Number((picked - ordered).toFixed(2));
                    if (delta > 0.001) {
                        const prod = Array.isArray(oi.products) ? oi.products[0] : oi.products;
                        const opts: Record<string, unknown> = (oi.selected_options && typeof oi.selected_options === 'object') ? oi.selected_options : {};
                        itemIds.push(oi.id);
                        candidateItems.push({
                            orderItemId: oi.id,
                            orderId: ord.id,
                            sequenceId: ord.sequence_id || null,
                            deliveryDate: ord.delivery_date || dateFilter,
                            clientName,
                            productId: oi.product_id,
                            productName: prod?.name || 'Producto',
                            productSku: prod?.sku || '',
                            unitOfMeasure: prod?.unit_of_measure || 'Kg',
                            orderedQty: ordered,
                            pickedQty: picked,
                            overweightDelta: delta,
                            unitPrice: Number(oi.unit_price) || 0,
                            chargeOverweight: Boolean(opts._charge_overweight === true),
                            selectedOptions: opts
                        });
                    }
                });
            });

            if (itemIds.length > 0) {
                const { data: movs } = await supabase
                    .from('inventory_movements')
                    .select('reference_id, reference_type')
                    .in('reference_id', itemIds)
                    .in('reference_type', ['additional_sale', 'waste_weighing']);

                const movMap = new Map<string, string>();
                const typedMovs = (movs || []) as RawMovementRecord[];
                typedMovs.forEach((m) => {
                    if (m.reference_id && m.reference_type) movMap.set(m.reference_id, m.reference_type);
                });

                candidateItems.forEach(item => {
                    const movType = movMap.get(item.orderItemId);
                    if (movType === 'additional_sale') item.chargeOverweight = true;
                    else if (movType === 'waste_weighing' && item.selectedOptions._charge_overweight === undefined) {
                        item.chargeOverweight = false;
                    }
                });
            }

            setRows(candidateItems);
        } catch (err) {
            console.error('Error cargando excedentes de báscula para facturación:', err);
        } finally {
            setLoading(false);
        }
    }, [isOpen, dateFilter]);

    useEffect(() => {
        if (isOpen) fetchOverweightItems();
    }, [isOpen, fetchOverweightItems]);

    const handleToggleDecision = async (row: OverweightItemRow, charge: boolean) => {
        setSavingId(row.orderItemId);
        try {
            const updatedOptions = {
                ...row.selectedOptions,
                _charge_overweight: charge,
                _overweight_arbitrated_at: new Date().toISOString()
            };

            const { error: itemErr } = await supabase
                .from('order_items')
                .update({ selected_options: updatedOptions })
                .eq('id', row.orderItemId);

            if (itemErr) throw itemErr;

            const { data: warehouseData } = await supabase.from('warehouses').select('id').limit(1).maybeSingle();
            const warehouseId = warehouseData?.id;

            const targetRefType = charge ? 'additional_sale' : 'waste_weighing';
            const noteTag = charge
                ? `[VENTA ADICIONAL POR EXCEDENTE DE BÁSCULA - FACTURADO] SKU: ${row.productSku || row.productName} (+${row.overweightDelta} ${row.unitOfMeasure}) | Pedido #${row.sequenceId || row.orderId}`
                : `[MERMA POR PESADA - TOLERANCIA NO FACTURADA] SKU: ${row.productSku || row.productName} (+${row.overweightDelta} ${row.unitOfMeasure}) | Pedido #${row.sequenceId || row.orderId}`;

            await supabase
                .from('inventory_movements')
                .delete()
                .eq('reference_id', row.orderItemId)
                .in('reference_type', ['waste_weighing', 'additional_sale']);

            if (warehouseId) {
                await supabase.from('inventory_movements').insert([{
                    product_id: row.productId,
                    warehouse_id: warehouseId,
                    quantity: -row.overweightDelta,
                    type: 'exit',
                    status_to: 'available',
                    notes: noteTag,
                    reference_type: targetRefType,
                    reference_id: row.orderItemId
                }]);
            }

            // SDD DT-17: Recalcular liquidación financiera del pedido (orders.total / subtotal / tax) según arbitraje Col M vs Col P
            const { data: allOrderItems } = await supabase
                .from('order_items')
                .select('id, quantity, picked_quantity, unit_price, selected_options')
                .eq('order_id', row.orderId);

            if (allOrderItems && allOrderItems.length > 0) {
                let recalculatedTotal = 0;
                (allOrderItems as RawOrderItemRecord[]).forEach((oi) => {
                    const opts = (oi.id === row.orderItemId)
                        ? updatedOptions
                        : ((oi.selected_options && typeof oi.selected_options === 'object') ? oi.selected_options : {});
                    const orderedQ = Number(oi.quantity) || 0;
                    const pickedQ = Number(oi.picked_quantity) || 0;
                    const billableQ = (opts._charge_overweight === true && pickedQ > orderedQ) ? pickedQ : orderedQ;
                    const price = Number(oi.unit_price) || 0;
                    recalculatedTotal += billableQ * price;
                });
                const roundedTotal = Math.round(recalculatedTotal * 100) / 100;
                await supabase
                    .from('orders')
                    .update({
                        total: roundedTotal,
                        subtotal: roundedTotal
                    })
                    .eq('id', row.orderId);

                const { data: existingInv } = await supabase
                    .from('billing_invoices')
                    .select('id')
                    .eq('order_id', row.orderId)
                    .maybeSingle();

                if (existingInv?.id) {
                    await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: roundedTotal,
                            total_final: roundedTotal
                        })
                        .eq('id', existingInv.id);
                }
            }

            setRows(prev => prev.map(r => r.orderItemId === row.orderItemId ? {
                ...r,
                chargeOverweight: charge,
                selectedOptions: updatedOptions
            } : r));

            if (onUpdated) onUpdated();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            alert('Error al guardar decisión de excedente: ' + msg);
        } finally {
            setSavingId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.72)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '18px',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.15rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F8FAFC'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            backgroundColor: '#FEF3C7',
                            color: '#D97706',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <Scale size={20} strokeWidth={2.4} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#0F172A' }}>
                                Arbitraje de Excedentes de Báscula (Col P vs Col M)
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                                Decide por <strong>Pedido + Producto</strong> si el sobrepeso en alistamiento se cobra al cliente (<strong>Col M: Venta Adicional</strong>) o se asume como tolerancia (<strong>Col P: Pesada</strong>).
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                            type="date"
                            value={dateFilter}
                            onChange={e => setDateFilter(e.target.value)}
                            style={{
                                padding: '0.45rem 0.7rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#0F172A'
                            }}
                        />
                        <button
                            type="button"
                            onClick={fetchOverweightItems}
                            style={{
                                padding: '0.45rem 0.65rem',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                backgroundColor: '#FFFFFF',
                                cursor: 'pointer'
                            }}
                            title="Actualizar"
                        >
                            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                border: 'none',
                                backgroundColor: '#F1F5F9',
                                borderRadius: '8px',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#475569'
                            }}
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: '#64748B', fontWeight: 700 }}>
                            Consultando excedentes de báscula en alistamiento...
                        </div>
                    ) : rows.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '3rem 1.5rem',
                            backgroundColor: '#F8FAFC',
                            borderRadius: '12px',
                            border: '1px dashed #CBD5E1',
                            color: '#64748B'
                        }}>
                            <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto 0.5rem' }} />
                            <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.92rem' }}>
                                Sin excedentes de báscula para la fecha {dateFilter}
                            </div>
                            <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>
                                Cuando Alistamiento (/ops/picking) registre un peso mayor al solicitado, aparecerá aquí para decidir si se cobra.
                            </div>
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#F1F5F9', color: '#475569', textAlign: 'left', fontWeight: 800 }}>
                                    <th style={{ padding: '0.65rem 0.75rem', borderRadius: '8px 0 0 8px' }}>Pedido / Cliente</th>
                                    <th style={{ padding: '0.65rem 0.75rem' }}>Producto</th>
                                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Pedido</th>
                                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Pesado</th>
                                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Excedente</th>
                                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center', borderRadius: '0 8px 8px 0' }}>¿Cobrar Excedente? (Destino Sábana)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(r => {
                                    const isSaving = savingId === r.orderItemId;
                                    return (
                                        <tr key={r.orderItemId} style={{ borderBottom: '1px solid #E2E8F0' }}>
                                            <td style={{ padding: '0.75rem' }}>
                                                <div style={{ fontWeight: 800, color: '#0F172A' }}>
                                                    #{r.sequenceId || r.orderId.slice(0, 6)}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{r.clientName}</div>
                                            </td>
                                            <td style={{ padding: '0.75rem' }}>
                                                <div style={{ fontWeight: 800, color: '#0F172A' }}>{r.productName}</div>
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{r.productSku} • {r.unitOfMeasure}</div>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                                                {r.orderedQty.toFixed(2)} {r.unitOfMeasure}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                                {r.pickedQty.toFixed(2)} {r.unitOfMeasure}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900, color: '#D97706' }}>
                                                +{r.overweightDelta.toFixed(2)} {r.unitOfMeasure}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                                                <div style={{ display: 'inline-flex', gap: '6px' }}>
                                                    <button
                                                        type="button"
                                                        disabled={isSaving}
                                                        onClick={() => handleToggleDecision(r, true)}
                                                        style={{
                                                            padding: '0.4rem 0.75rem',
                                                            borderRadius: '8px',
                                                            border: r.chargeOverweight ? '1.5px solid #7E22CE' : '1px solid #CBD5E1',
                                                            backgroundColor: r.chargeOverweight ? '#F3E8FF' : '#FFFFFF',
                                                            color: r.chargeOverweight ? '#6B21A8' : '#64748B',
                                                            fontWeight: 800,
                                                            fontSize: '0.74rem',
                                                            cursor: isSaving ? 'wait' : 'pointer'
                                                        }}
                                                    >
                                                        SÍ COBRAR → Col M
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={isSaving}
                                                        onClick={() => handleToggleDecision(r, false)}
                                                        style={{
                                                            padding: '0.4rem 0.75rem',
                                                            borderRadius: '8px',
                                                            border: !r.chargeOverweight ? '1.5px solid #D97706' : '1px solid #CBD5E1',
                                                            backgroundColor: !r.chargeOverweight ? '#FEF3C7' : '#FFFFFF',
                                                            color: !r.chargeOverweight ? '#92400E' : '#64748B',
                                                            fontWeight: 800,
                                                            fontSize: '0.74rem',
                                                            cursor: isSaving ? 'wait' : 'pointer'
                                                        }}
                                                    >
                                                        NO COBRAR → Col P
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
