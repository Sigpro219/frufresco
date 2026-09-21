'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    X, Receipt, Scale, AlertTriangle, CheckCircle2, 
    ArrowRight, CornerDownRight, Sparkles, Building2, 
    PackageCheck, PackageMinus, Info, Check, RefreshCw, Loader2
} from 'lucide-react';
import { 
    RCA_CATEGORIES_L1, 
    RESPONSIBLE_PARTIES, 
    DefectCategoryL1, 
    buildRcaMetadataTag 
} from '@/lib/rcaTaxonomy';

export interface FinancialAdjustmentItem {
    id: string;
    product_id: string;
    product_name: string;
    unit_of_measure: string;
    original_quantity: number;
    unit_price: number;
    affected_quantity: number;
    novelty_type: 'averia' | 'faltante' | 'precio' | 'devolucion';
    selected: boolean;
    notes?: string;
}

interface FinancialAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'credit_note' | 'invoice_adjustment';
    pqr: any | null;
    orderItems: any[];
    defaultRcaCategory?: string;
    defaultRcaSubtype?: string;
    defaultRcaResponsible?: string;
    activeTaxonomy?: DefectCategoryL1[];
    onSuccess: (message: string, redirectUrl?: string) => void;
}

export default function FinancialAdjustmentModal({
    isOpen,
    onClose,
    mode,
    pqr,
    orderItems = [],
    defaultRcaCategory = 'dano_mecanico',
    defaultRcaSubtype = 'aplastamiento_sobreestiba',
    defaultRcaResponsible = 'transporte',
    activeTaxonomy = RCA_CATEGORIES_L1,
    onSuccess
}: FinancialAdjustmentModalProps) {
    const [items, setItems] = useState<FinancialAdjustmentItem[]>([]);
    const [customGlobalAmount, setCustomGlobalAmount] = useState<number | null>(null);
    const [useManualGlobal, setUseManualGlobal] = useState(false);
    const [notes, setNotes] = useState('');
    const [rcaCategoryL1, setRcaCategoryL1] = useState(defaultRcaCategory);
    const [rcaSubtypeL2, setRcaSubtypeL2] = useState(defaultRcaSubtype);
    const [rcaResponsible, setRcaResponsible] = useState<string>(defaultRcaResponsible);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Initialize or reset state when modal opens or pqr changes
    useEffect(() => {
        if (!isOpen || !pqr) return;

        setErrorMsg(null);
        setRcaCategoryL1(defaultRcaCategory);
        setRcaSubtypeL2(defaultRcaSubtype);
        setRcaResponsible(defaultRcaResponsible);

        // Pre-fill notes
        const defaultNote = mode === 'credit_note' 
            ? `Nota Crédito autorizada por Servicio al Cliente para PQR #${pqr.id.substring(0, 8)} (${pqr.subject}).`
            : `Ajuste de facturación y cantidades recibidas por PQR #${pqr.id.substring(0, 8)} (${pqr.subject}).`;
        setNotes(defaultNote);

        // Parse items from order
        if (orderItems && orderItems.length > 0) {
            // Try to extract quantity from PQR description / subject if possible
            const combined = `${pqr.subject || ''} ${pqr.description || ''}`;
            const qtyMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kls?|und|unidades?|libras?)/i);
            const extractedQty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 0;

            const mapped: FinancialAdjustmentItem[] = orderItems.map((item, idx) => {
                const origQty = Number(item.quantity) || 0;
                const price = Number(item.unit_price) || 0;
                const name = item.products?.name || item.nickname || `Producto #${idx + 1}`;
                const uom = item.products?.unit_of_measure || 'Kg';

                // Check if this item is mentioned in PQR subject or description
                const cleanSubject = (pqr.subject || '').toLowerCase();
                const cleanItemName = name.toLowerCase();
                const isMentioned = cleanItemName.split(' ').some((word) => word.length > 3 && cleanSubject.includes(word));

                // Default affected qty: if mentioned, use extracted or 1, else 0
                let initialAffQty = 0;
                let initialSelected = false;

                if (orderItems.length === 1 || isMentioned) {
                    initialSelected = true;
                    initialAffQty = extractedQty > 0 && extractedQty <= origQty ? extractedQty : Math.min(origQty, 1);
                }

                return {
                    id: item.id || `item-${idx}`,
                    product_id: item.product_id,
                    product_name: name,
                    unit_of_measure: uom,
                    original_quantity: origQty,
                    unit_price: price,
                    affected_quantity: initialAffQty,
                    novelty_type: 'averia',
                    selected: initialSelected,
                    notes: ''
                };
            });

            // If none was auto-selected, select the first one with 1 unit
            if (!mapped.some(m => m.selected) && mapped.length > 0) {
                mapped[0].selected = true;
                mapped[0].affected_quantity = Math.min(mapped[0].original_quantity, 1);
            }

            setItems(mapped);
        } else {
            // No order items: allow custom single item or global amount
            setItems([]);
            setUseManualGlobal(true);
            setCustomGlobalAmount(0);
        }
    }, [isOpen, pqr, orderItems, mode, defaultRcaCategory, defaultRcaSubtype, defaultRcaResponsible]);

    // Financial Calculations
    const originalOrderTotal = useMemo(() => {
        if (pqr?.orders?.total) return Number(pqr.orders.total);
        return items.reduce((acc, item) => acc + (item.original_quantity * item.unit_price), 0);
    }, [pqr, items]);

    const calculatedCreditAmount = useMemo(() => {
        if (useManualGlobal && customGlobalAmount !== null) {
            return Math.max(0, customGlobalAmount);
        }
        return items
            .filter(i => i.selected && i.affected_quantity > 0)
            .reduce((acc, i) => acc + (i.affected_quantity * i.unit_price), 0);
    }, [items, useManualGlobal, customGlobalAmount]);

    const resultingOrderTotal = useMemo(() => {
        return Math.max(0, originalOrderTotal - calculatedCreditAmount);
    }, [originalOrderTotal, calculatedCreditAmount]);

    const selectedCategoryL1Obj = useMemo(() => {
        return activeTaxonomy.find(c => c.code === rcaCategoryL1) || activeTaxonomy[0];
    }, [activeTaxonomy, rcaCategoryL1]);

    if (!isOpen || !pqr) return null;

    const handleItemToggle = (index: number) => {
        setItems(prev => {
            const next = [...prev];
            next[index].selected = !next[index].selected;
            if (next[index].selected && next[index].affected_quantity === 0) {
                next[index].affected_quantity = Math.min(next[index].original_quantity, 1);
            }
            return next;
        });
    };

    const handleItemQtyChange = (index: number, val: number) => {
        setItems(prev => {
            const next = [...prev];
            const clamped = Math.max(0, Math.min(next[index].original_quantity, val));
            next[index].affected_quantity = clamped;
            if (clamped > 0) next[index].selected = true;
            return next;
        });
    };

    const handleItemPriceChange = (index: number, val: number) => {
        setItems(prev => {
            const next = [...prev];
            next[index].unit_price = Math.max(0, val);
            return next;
        });
    };

    const handleItemNoveltyTypeChange = (index: number, type: 'averia' | 'faltante' | 'precio' | 'devolucion') => {
        setItems(prev => {
            const next = [...prev];
            next[index].novelty_type = type;
            return next;
        });
    };

    const handleQuickRatio = (index: number, ratio: number) => {
        setItems(prev => {
            const next = [...prev];
            const targetQty = Number((next[index].original_quantity * ratio).toFixed(2));
            next[index].affected_quantity = targetQty;
            next[index].selected = targetQty > 0;
            return next;
        });
    };

    const handleSubmit = async () => {
        setErrorMsg(null);

        if (calculatedCreditAmount <= 0) {
            setErrorMsg('El valor total a descontar o acreditar debe ser mayor a $0.');
            return;
        }

        const selectedItems = items.filter(i => i.selected && i.affected_quantity > 0);
        if (!useManualGlobal && selectedItems.length === 0) {
            setErrorMsg('Debes seleccionar al menos un producto con cantidad afectada mayor a cero.');
            return;
        }

        setIsSubmitting(true);
        try {
            const orderId = pqr.order_id;
            const shortPqrId = pqr.id.substring(0, 8);
            const nowIso = new Date().toISOString();

            // Build summary text of affected items
            const itemsSummary = selectedItems.map(i => 
                `• ${i.product_name}: ${i.affected_quantity} ${i.unit_of_measure} @ ${formatMoney(i.unit_price)} = ${formatMoney(i.affected_quantity * i.unit_price)} (${i.novelty_type.toUpperCase()})`
            ).join('\n');

            const rcaTag = buildRcaMetadataTag({
                categoryL1: rcaCategoryL1,
                subtypeL2: rcaSubtypeL2,
                responsible: rcaResponsible as any
            });

            if (mode === 'credit_note') {
                // =========================================================
                // OPCIÓN 3: NOTA CRÉDITO COMERCIAL
                // =========================================================
                if (orderId && selectedItems.length > 0) {
                    for (const item of selectedItems) {
                        await supabase
                            .from('billing_returns')
                            .insert([{
                                order_id: orderId,
                                product_id: item.product_id,
                                quantity_returned: item.affected_quantity,
                                reason: `[NOTA CRÉDITO PQR #${shortPqrId}] ${item.novelty_type.toUpperCase()}: ${notes || pqr.subject}`,
                                status: 'approved',
                                defect_category_l1: rcaCategoryL1,
                                defect_subtype_l2: rcaSubtypeL2,
                                imputed_responsible: rcaResponsible,
                                is_replacement_rejection: Boolean(pqr.is_replacement_rejection)
                            }]);
                    }
                }

                const finalNotes = `${notes}\n\n[CONCEPTO: Opción 3 - Nota Crédito Comercial Emitida]\n-> Valor Acreditado a Favor del Cliente: ${formatMoney(calculatedCreditAmount)}\n-> Desglose de Ítems:\n${itemsSummary || `• Ajuste comercial directo por ${formatMoney(calculatedCreditAmount)}`}\n${rcaTag}`;

                const { error: pqrUpdateErr } = await supabase
                    .from('customer_service_pqrs')
                    .update({
                        status: 'resolved',
                        resolved_at: nowIso,
                        resolution_notes: finalNotes,
                        defect_category_l1: rcaCategoryL1,
                        defect_subtype_l2: rcaSubtypeL2,
                        imputed_responsible: rcaResponsible
                    })
                    .eq('id', pqr.id);

                if (pqrUpdateErr) throw pqrUpdateErr;

                onSuccess(`✅ Nota Crédito de ${formatMoney(calculatedCreditAmount)} emitida y aprobada con éxito.`);
                onClose();

            } else {
                // =========================================================
                // OPCIÓN 4: AJUSTAR FACTURA & RECALCULAR PEDIDO
                // =========================================================
                if (!orderId) {
                    throw new Error('Esta PQR no tiene un pedido asociado en base de datos para recalcular.');
                }

                // 1. Update order_items quantities
                for (const item of selectedItems) {
                    const newQty = Math.max(0, Number(item.original_quantity) - Number(item.affected_quantity));
                    await supabase
                        .from('order_items')
                        .update({ quantity: newQty })
                        .eq('order_id', orderId)
                        .eq('product_id', item.product_id);

                    // Insert approved billing_returns record for traceability
                    await supabase
                        .from('billing_returns')
                        .insert([{
                            order_id: orderId,
                            product_id: item.product_id,
                            quantity_returned: item.affected_quantity,
                            reason: `[AJUSTE FACTURA PQR #${shortPqrId}] ${item.novelty_type.toUpperCase()}: ${notes || pqr.subject}`,
                            status: 'approved',
                            defect_category_l1: rcaCategoryL1,
                            defect_subtype_l2: rcaSubtypeL2,
                            imputed_responsible: rcaResponsible,
                            is_replacement_rejection: Boolean(pqr.is_replacement_rejection)
                        }]);
                }

                // 2. Update orders total
                const { data: currentOrder } = await supabase.from('orders').select('total, admin_notes').eq('id', orderId).single();
                const previousTotal = Number(currentOrder?.total) || originalOrderTotal;
                const newTotal = Math.max(0, previousTotal - calculatedCreditAmount);

                const updatedAdminNotes = `${currentOrder?.admin_notes || ''}\n[AJUSTE FACTURA PQR #${shortPqrId}]: Valor ajustado de ${formatMoney(previousTotal)} a ${formatMoney(newTotal)} (-${formatMoney(calculatedCreditAmount)}).`;

                await supabase
                    .from('orders')
                    .update({ 
                        total: newTotal,
                        subtotal: newTotal,
                        admin_notes: updatedAdminNotes 
                    })
                    .eq('id', orderId);

                // 3. Update billing_invoices if exists
                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', orderId).single();
                if (invoiceData) {
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles(iva_responsible)')
                        .eq('id', orderId)
                        .single();
                    const isIva = (orderProf as any)?.profiles?.iva_responsible || false;
                    const totalBase = isIva ? newTotal / 1.19 : newTotal;
                    const totalTax = isIva ? newTotal - totalBase : 0;

                    await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: totalBase,
                            total_tax: totalTax,
                            total_final: newTotal
                        })
                        .eq('id', invoiceData.id);
                }

                // 4. Update PQR status and notes
                const finalNotes = `${notes}\n\n[CONCEPTO: Opción 4 - Factura Ajustada con Cantidad Recibida]\n-> Total Anterior: ${formatMoney(previousTotal)} | Nuevo Total Final: ${formatMoney(newTotal)} (-${formatMoney(calculatedCreditAmount)})\n-> Ítems Ajustados en Pedido:\n${itemsSummary}\n${rcaTag}`;

                const { error: pqrUpdateErr } = await supabase
                    .from('customer_service_pqrs')
                    .update({
                        status: 'resolved',
                        resolved_at: nowIso,
                        resolution_notes: finalNotes,
                        defect_category_l1: rcaCategoryL1,
                        defect_subtype_l2: rcaSubtypeL2,
                        imputed_responsible: rcaResponsible
                    })
                    .eq('id', pqr.id);

                if (pqrUpdateErr) throw pqrUpdateErr;

                onSuccess(`✅ Factura y Pedido ajustados con éxito. Nuevo Total: ${formatMoney(newTotal)}.`);
                onClose();
            }

        } catch (err: any) {
            console.error('Error executing financial adjustment:', err);
            setErrorMsg(`Error al procesar: ${err.message || 'Error desconocido'}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const isCredit = mode === 'credit_note';
    const clientName = pqr.profiles?.company_name || pqr.profiles?.contact_name || 'Cliente';
    const orderSequence = pqr.orders?.sequence_id ? `#${pqr.orders.sequence_id}` : (pqr.order_id ? `#${pqr.order_id.substring(0, 8)}` : 'Sin Pedido Vinculado');

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1.25rem'
        }}>
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '20px',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid #E2E8F0',
                    backgroundColor: isCredit ? '#FAF5FF' : '#FFFBEB',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            backgroundColor: isCredit ? '#EDE9FE' : '#FEF3C7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            {isCredit ? <Receipt size={22} color="#7C3AED" /> : <Scale size={22} color="#D97706" />}
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: '900',
                                    textTransform: 'uppercase',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    backgroundColor: isCredit ? '#7C3AED' : '#D97706',
                                    color: '#FFFFFF'
                                }}>
                                    {isCredit ? 'Opción 3 • Nota Crédito' : 'Opción 4 • Ajuste de Factura'}
                                </span>
                                <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#64748B' }}>
                                    PQR #{pqr.id.substring(0, 8)}
                                </span>
                            </div>
                            <h3 style={{ margin: '2px 0 0 0', fontSize: '1.1rem', fontWeight: '900', color: '#1E293B' }}>
                                {isCredit ? 'Liquidador de Nota Crédito y Descuento Contable' : 'Ajustador de Factura y Recálculo de Cantidad Conforme'}
                            </h3>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        type="button"
                        style={{
                            background: '#FFFFFF',
                            cursor: 'pointer',
                            color: '#64748B',
                            padding: '8px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid #E2E8F0'
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Context Bar */}
                <div style={{
                    padding: '0.75rem 1.5rem',
                    backgroundColor: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    fontSize: '0.78rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '600' }}>Cliente: </span>
                            <strong style={{ color: '#1E293B' }}>{clientName}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748B', fontWeight: '600' }}>Pedido Ref: </span>
                            <strong style={{ color: '#0D7A57' }}>{orderSequence}</strong>
                        </div>
                    </div>
                    <div style={{ color: '#64748B', fontStyle: 'italic', maxWidth: '350px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        &ldquo;{pqr.subject}&rdquo;
                    </div>
                </div>

                {/* Body Content */}
                <div style={{
                    padding: '1.25rem 1.5rem',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.25rem'
                }}>
                    {/* Error Banner */}
                    {errorMsg && (
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            backgroundColor: '#FEF2F2',
                            border: '1px solid #FCA5A5',
                            color: '#B91C1C',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: '700'
                        }}>
                            <AlertTriangle size={16} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Financial Summary KPI Cards */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px'
                    }}>
                        {/* Original Total */}
                        <div style={{
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '10px 14px'
                        }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block' }}>
                                Total Factura / Pedido Original
                            </span>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#334155', marginTop: '2px' }}>
                                {formatMoney(originalOrderTotal)}
                            </div>
                        </div>

                        {/* Credit / Discount Amount */}
                        <div style={{
                            backgroundColor: isCredit ? '#F5F3FF' : '#FEF3C7',
                            border: `1.5px solid ${isCredit ? '#DDD6FE' : '#FDE68A'}`,
                            borderRadius: '12px',
                            padding: '10px 14px'
                        }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: isCredit ? '#6D28D9' : '#92400E', display: 'block' }}>
                                {isCredit ? 'Total Nota Crédito a Favor' : 'Descuento Total a Liquidar'}
                            </span>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: isCredit ? '#7C3AED' : '#D97706', marginTop: '2px' }}>
                                -{formatMoney(calculatedCreditAmount)}
                            </div>
                        </div>

                        {/* Resulting Balance / Total */}
                        <div style={{
                            backgroundColor: '#F0FDF4',
                            border: '1.5px solid #BBF7D0',
                            borderRadius: '12px',
                            padding: '10px 14px'
                        }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#15803D', display: 'block' }}>
                                {isCredit ? 'Saldo a Favor Generado' : 'Nuevo Total a Pagar / Facturar'}
                            </span>
                            <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0D7A57', marginTop: '2px' }}>
                                {isCredit ? `+${formatMoney(calculatedCreditAmount)}` : formatMoney(resultingOrderTotal)}
                            </div>
                        </div>
                    </div>

                    {/* Products & Items Breakdown Table */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <PackageCheck size={15} color="#0D7A57" />
                                Desglose de Productos & Cantidades Afectadas ({items.length})
                            </label>
                            {items.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setUseManualGlobal(!useManualGlobal)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#0D7A57',
                                        fontSize: '0.72rem',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    {useManualGlobal ? 'Usar desglose por producto' : 'Ajustar valor global manual'}
                                </button>
                            )}
                        </div>

                        {useManualGlobal ? (
                            <div style={{
                                backgroundColor: '#F8FAFC',
                                border: '1px dashed #CBD5E1',
                                borderRadius: '12px',
                                padding: '1rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px'
                            }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase' }}>
                                    Valor Global de la Nota Crédito / Ajuste ($ COP):
                                </label>
                                <input
                                    type="number"
                                    value={customGlobalAmount ?? 0}
                                    onChange={e => setCustomGlobalAmount(Number(e.target.value))}
                                    min={0}
                                    placeholder="Ingresa el valor total a descontar..."
                                    style={{
                                        padding: '10px 14px',
                                        borderRadius: '8px',
                                        border: '1.5px solid #0D7A57',
                                        fontSize: '1.1rem',
                                        fontWeight: '900',
                                        color: '#0D7A57',
                                        outline: 'none'
                                    }}
                                />
                                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                    Aplica un ajuste contable directo sin restar existencias físicas a productos individuales.
                                </span>
                            </div>
                        ) : (
                            <div style={{
                                border: '1px solid #E2E8F0',
                                borderRadius: '12px',
                                overflow: 'hidden'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#64748B' }}>
                                            <th style={{ padding: '8px 10px', width: '32px' }}>#</th>
                                            <th style={{ padding: '8px 10px' }}>Producto</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Cant. Despachada</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center', width: '180px' }}>Cant. Afectada</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Precio Unitario</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'center' }}>Tipo Novedad</th>
                                            <th style={{ padding: '8px 10px', textAlign: 'right' }}>Subtotal</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => {
                                            const subtotal = item.affected_quantity * item.unit_price;
                                            return (
                                                <tr 
                                                    key={item.id} 
                                                    style={{ 
                                                        borderBottom: idx < items.length - 1 ? '1px solid #F1F5F9' : 'none',
                                                        backgroundColor: item.selected && item.affected_quantity > 0 ? '#FAFDFB' : '#FFFFFF',
                                                        transition: 'background-color 0.12s'
                                                    }}
                                                >
                                                    {/* Checkbox */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                        <input 
                                                            type="checkbox"
                                                            checked={item.selected}
                                                            onChange={() => handleItemToggle(idx)}
                                                            style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                        />
                                                    </td>

                                                    {/* Product Name */}
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <div style={{ fontWeight: item.selected ? '900' : '600', color: item.selected ? '#0D7A57' : '#1E293B' }}>
                                                            {item.product_name}
                                                        </div>
                                                        <div style={{ fontSize: '0.66rem', color: '#94A3B8' }}>
                                                            Presentación: {item.unit_of_measure}
                                                        </div>
                                                    </td>

                                                    {/* Original Quantity */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: '700', color: '#475569' }}>
                                                        {item.original_quantity} {item.unit_of_measure}
                                                    </td>

                                                    {/* Affected Quantity with Quick Steppers */}
                                                    <td style={{ padding: '8px 10px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <input
                                                                    type="number"
                                                                    value={item.affected_quantity}
                                                                    onChange={e => handleItemQtyChange(idx, Number(e.target.value))}
                                                                    min={0}
                                                                    max={item.original_quantity}
                                                                    step={0.1}
                                                                    style={{
                                                                        width: '70px',
                                                                        padding: '4px 6px',
                                                                        borderRadius: '6px',
                                                                        border: `1.5px solid ${item.affected_quantity > 0 ? '#0D7A57' : '#CBD5E1'}`,
                                                                        fontWeight: '800',
                                                                        fontSize: '0.78rem',
                                                                        textAlign: 'center',
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                                <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700' }}>
                                                                    {item.unit_of_measure}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleQuickRatio(idx, 1)}
                                                                    style={{ padding: '1px 5px', fontSize: '0.62rem', fontWeight: '700', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                                                                >
                                                                    Todo
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleQuickRatio(idx, 0.5)}
                                                                    style={{ padding: '1px 5px', fontSize: '0.62rem', fontWeight: '700', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                                                                >
                                                                    50%
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleQuickRatio(idx, 0)}
                                                                    style={{ padding: '1px 5px', fontSize: '0.62rem', fontWeight: '700', borderRadius: '4px', border: '1px solid #CBD5E1', background: '#F8FAFC', cursor: 'pointer' }}
                                                                >
                                                                    0
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Unit Price */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                        <div style={{ fontWeight: '700', color: '#334155' }}>
                                                            {formatMoney(item.unit_price)}
                                                        </div>
                                                    </td>

                                                    {/* Novelty Type */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                        <select
                                                            value={item.novelty_type}
                                                            onChange={e => handleItemNoveltyTypeChange(idx, e.target.value as any)}
                                                            style={{
                                                                padding: '4px 6px',
                                                                borderRadius: '6px',
                                                                border: '1px solid #CBD5E1',
                                                                fontSize: '0.7rem',
                                                                fontWeight: '700',
                                                                color: '#334155',
                                                                backgroundColor: '#FFFFFF',
                                                                cursor: 'pointer'
                                                            }}
                                                        >
                                                            <option value="averia">Avería / Calidad</option>
                                                            <option value="faltante">Faltante</option>
                                                            <option value="precio">Ajuste Precio</option>
                                                            <option value="devolucion">Devolución</option>
                                                        </select>
                                                    </td>

                                                    {/* Subtotal */}
                                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '900', color: subtotal > 0 ? (isCredit ? '#7C3AED' : '#D97706') : '#94A3B8' }}>
                                                        {formatMoney(subtotal)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* RCA & Imputability Quick Pills */}
                    <div style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', color: '#0D7A57', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Sparkles size={14} color="#0D7A57" />
                                Causa Raíz & Área Imputable de la Merma
                            </span>
                        </div>

                        {/* Category and Subtype Selectors */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Familia de Defecto (L1)
                                </label>
                                <select
                                    value={rcaCategoryL1}
                                    onChange={e => {
                                        setRcaCategoryL1(e.target.value);
                                        const cat = activeTaxonomy.find(c => c.code === e.target.value);
                                        if (cat && cat.subtypes.length > 0) {
                                            setRcaSubtypeL2(cat.subtypes[0].code);
                                            setRcaResponsible(cat.subtypes[0].typicalResponsible);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '7px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.74rem',
                                        fontWeight: '700',
                                        color: '#334155',
                                        backgroundColor: '#FFFFFF'
                                    }}
                                >
                                    {activeTaxonomy.map(cat => (
                                        <option key={cat.code} value={cat.code}>{cat.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Subtipo Específico (L2)
                                </label>
                                <select
                                    value={rcaSubtypeL2}
                                    onChange={e => {
                                        setRcaSubtypeL2(e.target.value);
                                        const sub = selectedCategoryL1Obj?.subtypes.find(s => s.code === e.target.value);
                                        if (sub) setRcaResponsible(sub.typicalResponsible);
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '7px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.74rem',
                                        fontWeight: '700',
                                        color: '#334155',
                                        backgroundColor: '#FFFFFF'
                                    }}
                                >
                                    {selectedCategoryL1Obj?.subtypes.map(sub => (
                                        <option key={sub.code} value={sub.code}>{sub.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Responsible Department Pills */}
                        <div>
                            <label style={{ fontSize: '0.68rem', fontWeight: '800', color: '#64748B', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                                Área Responsable Imputable:
                            </label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {Object.values(RESPONSIBLE_PARTIES).map(resp => {
                                    const isSel = rcaResponsible === resp.code;
                                    return (
                                        <button
                                            key={resp.code}
                                            type="button"
                                            onClick={() => setRcaResponsible(resp.code)}
                                            style={{
                                                padding: '4px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.7rem',
                                                fontWeight: isSel ? '800' : '600',
                                                border: `1.5px solid ${isSel ? resp.border : '#E2E8F0'}`,
                                                backgroundColor: isSel ? resp.bgLight : '#FFFFFF',
                                                color: isSel ? resp.color : '#64748B',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            {resp.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Accounting Notes / Justification Textarea */}
                    <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                            Concepto Contable & Observación de Resolución
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={3}
                            placeholder="Describe los motivos contables y la justificación de calidad..."
                            style={{
                                width: '100%',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.78rem',
                                boxSizing: 'border-box',
                                outline: 'none'
                            }}
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div style={{
                    padding: '1rem 1.5rem',
                    borderTop: '1px solid #E2E8F0',
                    backgroundColor: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        style={{
                            padding: '9px 16px',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            backgroundColor: '#FFFFFF',
                            color: '#475569',
                            fontWeight: '700',
                            fontSize: '0.8rem',
                            cursor: 'pointer'
                        }}
                    >
                        Cancelar
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || calculatedCreditAmount <= 0}
                        style={{
                            padding: '10px 22px',
                            borderRadius: '10px',
                            border: 'none',
                            backgroundColor: isCredit ? '#7C3AED' : '#D97706',
                            color: '#FFFFFF',
                            fontWeight: '900',
                            fontSize: '0.82rem',
                            cursor: isSubmitting || calculatedCreditAmount <= 0 ? 'not-allowed' : 'pointer',
                            opacity: isSubmitting || calculatedCreditAmount <= 0 ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: `0 3px 10px ${isCredit ? 'rgba(124, 58, 237, 0.3)' : 'rgba(217, 119, 6, 0.3)'}`
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={16} className="animate-spin" /> Procesando...
                            </>
                        ) : isCredit ? (
                            <>
                                <Receipt size={16} /> Emitir y Aprobar Nota Crédito ({formatMoney(calculatedCreditAmount)})
                            </>
                        ) : (
                            <>
                                <Scale size={16} /> Aplicar Ajuste a Factura (Nuevo Total: {formatMoney(resultingOrderTotal)})
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
