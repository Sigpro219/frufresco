'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Scale, X, CheckCircle2, RefreshCw, Info } from 'lucide-react';

interface OverweightItemRow {
    orderItemId: string;
    orderId: string;
    sequenceId: number | null;
    deliveryDate: string;
    clientName: string;
    productId: string;
    productName: string;
    accountingId: string;
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
    accounting_id?: string | number | null;
    unit_of_measure?: string | null;
    iva_rate?: number | null;
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
    const [thresholdCop, setThresholdCop] = useState<number>(2000);
    const [autoAbsorbedCount, setAutoAbsorbedCount] = useState<number>(0);
    const [dateFilter, setDateFilter] = useState<string>(
        selectedDate || new Date().toISOString().split('T')[0]
    );

    const isSandbox = process.env.NEXT_PUBLIC_SANDBOX_MODE === 'true';
    const wasteRefType = isSandbox ? 'sandbox_waste_weighing' : 'waste_weighing';
    const additionalRefType = isSandbox ? 'sandbox_additional_sale' : 'additional_sale';

    useEffect(() => {
        if (selectedDate) setDateFilter(selectedDate);
    }, [selectedDate]);

    const fetchOverweightItems = useCallback(async () => {
        if (!isOpen) return;
        setLoading(true);
        setAutoAbsorbedCount(0);
        try {
            const [{ data: thresholdSetting, error: thresholdErr }, { data: ordersData, error }] = await Promise.all([
                supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'overweight_billing_threshold_cop')
                    .maybeSingle(),
                supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, delivery_date, status,
                        profiles:profile_id (company_name, contact_name, razon_social),
                        order_items (
                            id, product_id, quantity, picked_quantity, unit_price, selected_options,
                            products (name, accounting_id, unit_of_measure)
                        )
                    `)
                    .eq('delivery_date', dateFilter)
                    .neq('status', 'cancelled')
                    .order('sequence_id', { ascending: false })
            ]);

            if (thresholdErr) {
                console.warn('No se pudo leer overweight_billing_threshold_cop, usando fallback 2000:', thresholdErr.message);
            }
            const rawThreshold = thresholdSetting?.value;
            const parsedThreshold = Number(rawThreshold);
            const activeThreshold = (
                rawThreshold !== null &&
                rawThreshold !== undefined &&
                String(rawThreshold).trim() !== '' &&
                Number.isFinite(parsedThreshold) &&
                parsedThreshold >= 0
            ) ? parsedThreshold : 2000;
            setThresholdCop(activeThreshold);

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
                            accountingId: prod?.accounting_id !== null && prod?.accounting_id !== undefined ? String(prod.accounting_id) : '',
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

            let blockingItems: OverweightItemRow[] = candidateItems;
            let absorbedCount = 0;

            if (itemIds.length > 0) {
                const { data: movs, error: movsErr } = await supabase
                    .from('inventory_movements')
                    .select('reference_id, reference_type')
                    .in('reference_id', itemIds)
                    .in('reference_type', [additionalRefType, wasteRefType]);

                if (movsErr) throw movsErr;

                const movMap = new Map<string, string>();
                const typedMovs = (movs || []) as RawMovementRecord[];
                typedMovs.forEach((m) => {
                    if (m.reference_id && m.reference_type) movMap.set(m.reference_id, m.reference_type);
                });

                const autoAbsorbCandidates: OverweightItemRow[] = [];
                const remainingItems: OverweightItemRow[] = [];

                candidateItems.forEach(item => {
                    const movType = movMap.get(item.orderItemId);
                    if (movType === additionalRefType) item.chargeOverweight = true;
                    else if (movType === wasteRefType && item.selectedOptions._charge_overweight === undefined) {
                        item.chargeOverweight = false;
                    }

                    const deltaCop = item.overweightDelta * item.unitPrice;
                    if (!movMap.has(item.orderItemId) && item.unitPrice > 0 && deltaCop < activeThreshold) {
                        autoAbsorbCandidates.push(item);
                    } else {
                        remainingItems.push(item);
                    }
                });

                if (autoAbsorbCandidates.length > 0) {
                    const { data: warehouseData, error: whErr } = await supabase
                        .from('warehouses')
                        .select('id')
                        .limit(1)
                        .maybeSingle();
                    if (whErr) throw whErr;

                    const warehouseId = warehouseData?.id;
                    if (warehouseId) {
                        const autoMovements = autoAbsorbCandidates.map(item => {
                            const movementDate = (item.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(item.deliveryDate))
                                ? item.deliveryDate
                                : dateFilter;
                            const idLabel = item.accountingId ? `#${item.accountingId}` : item.productName;
                            return {
                                product_id: item.productId,
                                warehouse_id: warehouseId,
                                quantity: -item.overweightDelta,
                                type: 'exit',
                                status_to: 'available',
                                notes: `[MERMA POR PESADA - AUTO-ABSORBIDO < UMBRAL $${activeThreshold.toLocaleString('es-CO')} COP] ${idLabel} (+${item.overweightDelta} ${item.unitOfMeasure}) | Pedido #${item.sequenceId || item.orderId}`,
                                reference_type: wasteRefType,
                                reference_id: item.orderItemId,
                                created_at: `${movementDate}T12:00:00.000Z`
                            };
                        });

                        const { error: autoInsertErr } = await supabase
                            .from('inventory_movements')
                            .insert(autoMovements);

                        if (autoInsertErr) {
                            throw autoInsertErr;
                        }
                        absorbedCount = autoAbsorbCandidates.length;
                        blockingItems = remainingItems;
                    } else {
                        blockingItems = candidateItems;
                    }
                } else {
                    blockingItems = remainingItems;
                }
            }

            setAutoAbsorbedCount(absorbedCount);
            setRows(blockingItems);
        } catch (err) {
            console.error('Error cargando excedentes de báscula para facturación:', err);
        } finally {
            setLoading(false);
        }
    }, [isOpen, dateFilter, additionalRefType, wasteRefType]);

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

            const targetRefType = charge ? additionalRefType : wasteRefType;
            const idLabel = row.accountingId ? `#${row.accountingId}` : row.productName;
            const noteTag = charge
                ? `[VENTA ADICIONAL POR EXCEDENTE DE BÁSCULA - FACTURADO] ${idLabel} (+${row.overweightDelta} ${row.unitOfMeasure}) | Pedido #${row.sequenceId || row.orderId}`
                : `[MERMA POR PESADA - TOLERANCIA NO FACTURADA] ${idLabel} (+${row.overweightDelta} ${row.unitOfMeasure}) | Pedido #${row.sequenceId || row.orderId}`;

            const { error: delMovErr } = await supabase
                .from('inventory_movements')
                .delete()
                .eq('reference_id', row.orderItemId)
                .in('reference_type', [wasteRefType, additionalRefType]);
            if (delMovErr) throw delMovErr;

            if (warehouseId) {
                const movementDate = (row.deliveryDate && /^\d{4}-\d{2}-\d{2}$/.test(row.deliveryDate))
                    ? row.deliveryDate
                    : (selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) ? selectedDate : new Date().toISOString().slice(0, 10));
                const { error: insMovErr } = await supabase.from('inventory_movements').insert([{
                    product_id: row.productId,
                    warehouse_id: warehouseId,
                    quantity: -row.overweightDelta,
                    type: 'exit',
                    status_to: 'available',
                    notes: noteTag,
                    reference_type: targetRefType,
                    reference_id: row.orderItemId,
                    created_at: `${movementDate}T12:00:00.000Z`
                }]);
                if (insMovErr) throw insMovErr;
            }

            // SDD DT-17: Recalcular liquidación financiera del pedido (orders.total / subtotal / tax) según arbitraje Col M vs Col P
            const [{ data: orderMeta }, { data: allOrderItems }] = await Promise.all([
                supabase
                    .from('orders')
                    .select('id, profiles:profile_id ( iva_responsible )')
                    .eq('id', row.orderId)
                    .maybeSingle(),
                supabase
                    .from('order_items')
                    .select('id, quantity, picked_quantity, unit_price, selected_options, products:product_id ( iva_rate )')
                    .eq('order_id', row.orderId)
            ]);

            if (allOrderItems && allOrderItems.length > 0) {
                const profRaw = (orderMeta as { profiles?: { iva_responsible?: boolean } | Array<{ iva_responsible?: boolean }> | null } | null)?.profiles;
                const profObj = Array.isArray(profRaw) ? profRaw[0] : profRaw;
                const isIvaResponsible = Boolean(profObj?.iva_responsible);

                let recalculatedTotal = 0;
                let recalculatedBase = 0;
                let recalculatedTax = 0;

                (allOrderItems as Array<RawOrderItemRecord & { products?: { iva_rate?: number | null } | Array<{ iva_rate?: number | null }> | null }>).forEach((oi) => {
                    const opts = (oi.id === row.orderItemId)
                        ? updatedOptions
                        : ((oi.selected_options && typeof oi.selected_options === 'object') ? oi.selected_options : {});
                    const orderedQ = Number(oi.quantity) || 0;
                    const pickedQ = Number(oi.picked_quantity) || 0;
                    const billableQ = (opts._charge_overweight === true && pickedQ > orderedQ) ? pickedQ : orderedQ;
                    const price = Number(oi.unit_price) || 0;
                    const lineGross = billableQ * price;

                    const prodRaw = Array.isArray(oi.products) ? oi.products[0] : oi.products;
                    const ivaRate = isIvaResponsible ? (Number(prodRaw?.iva_rate) || 0) : 0;
                    const lineBase = ivaRate > 0 ? (lineGross / (1 + ivaRate / 100)) : lineGross;
                    const lineTax = lineGross - lineBase;

                    recalculatedTotal += lineGross;
                    recalculatedBase += lineBase;
                    recalculatedTax += lineTax;
                });

                const roundedTotal = Math.round(recalculatedTotal * 100) / 100;
                const roundedBase = Math.round(recalculatedBase * 100) / 100;
                const roundedTax = Math.round(recalculatedTax * 100) / 100;

                await supabase
                    .from('orders')
                    .update({
                        subtotal: roundedBase,
                        tax: roundedTax,
                        total: roundedTotal
                    })
                    .eq('id', row.orderId);

                const { data: existingInv } = await supabase
                    .from('billing_invoices')
                    .select('id, worldoffice_sync_status')
                    .eq('order_id', row.orderId)
                    .or('is_credit_note.is.null,is_credit_note.eq.false')
                    .limit(1)
                    .maybeSingle();

                if (existingInv?.id && existingInv.worldoffice_sync_status !== 'synced') {
                    await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: roundedBase,
                            total_tax: roundedTax,
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
                    {!loading && autoAbsorbedCount > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '0.65rem 0.9rem',
                            marginBottom: '1rem',
                            borderRadius: '10px',
                            backgroundColor: '#ECFDF5',
                            border: '1px solid #A7F3D0',
                            color: '#065F46',
                            fontSize: '0.78rem',
                            fontWeight: 700
                        }}>
                            <Info size={16} color="#059669" style={{ flexShrink: 0 }} />
                            <span>
                                {autoAbsorbedCount} {autoAbsorbedCount === 1 ? 'ítem auto-absorbido' : 'ítems auto-absorbidos'} en Col P (Pesada) por estar debajo del umbral (${thresholdCop.toLocaleString('es-CO')} COP).
                            </span>
                        </div>
                    )}
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
                                                <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                    {r.accountingId ? `#${r.accountingId} • ` : ''}{r.unitOfMeasure}
                                                </div>
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 700 }}>
                                                {r.orderedQty.toFixed(2)} {r.unitOfMeasure}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                                {r.pickedQty.toFixed(2)} {r.unitOfMeasure}
                                            </td>
                                            <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 900, color: '#D97706' }}>
                                                <div>+{r.overweightDelta.toFixed(2)} {r.unitOfMeasure}</div>
                                                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: r.unitPrice <= 0 ? '#DC2626' : '#64748B' }}>
                                                    {r.unitPrice <= 0
                                                        ? 'Remisión $0'
                                                        : `$${Math.round(r.overweightDelta * r.unitPrice).toLocaleString('es-CO')} COP`}
                                                </div>
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
