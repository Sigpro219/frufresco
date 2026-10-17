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
    defaultImputedEntities?: any[];
    defaultImputedTargetType?: string;
    defaultImputedEntityId?: string;
    defaultImputedEntityName?: string;
    defaultImputedEvidenceNotes?: string;
    providersList?: any[];
    collaboratorsList?: any[];
    activeTaxonomy?: DefectCategoryL1[];
    onSuccess: (message: string, redirectUrl?: string) => void;
}

const EMPTY_ARRAY: any[] = [];

export default function FinancialAdjustmentModal({
    isOpen,
    onClose,
    mode,
    pqr,
    orderItems = EMPTY_ARRAY,
    defaultRcaCategory = 'dano_mecanico',
    defaultRcaSubtype = 'aplastamiento_sobreestiba',
    defaultRcaResponsible = 'transporte',
    defaultImputedEntities = EMPTY_ARRAY,
    defaultImputedTargetType = 'none',
    defaultImputedEntityId = '',
    defaultImputedEntityName = '',
    defaultImputedEvidenceNotes = '',
    providersList = EMPTY_ARRAY,
    collaboratorsList = EMPTY_ARRAY,
    activeTaxonomy = RCA_CATEGORIES_L1,
    onSuccess
}: FinancialAdjustmentModalProps) {
    const [items, setItems] = useState<FinancialAdjustmentItem[]>([]);
    const [showAllOrderItems, setShowAllOrderItems] = useState(false);
    const [customGlobalAmount, setCustomGlobalAmount] = useState<number | null>(null);
    const [useManualGlobal, setUseManualGlobal] = useState(false);
    const [notes, setNotes] = useState('');
    const [priorCapAndSanitaryNotes, setPriorCapAndSanitaryNotes] = useState('');
    const [technicalInspectionNotes, setTechnicalInspectionNotes] = useState('');
    const [referenceInvoiceNumber, setReferenceInvoiceNumber] = useState('');
    const [creditNoteNumber, setCreditNoteNumber] = useState('');
    const [isIvaResponsible, setIsIvaResponsible] = useState(false);
    const [rcaCategoryL1, setRcaCategoryL1] = useState(defaultRcaCategory);
    const [rcaSubtypeL2, setRcaSubtypeL2] = useState(defaultRcaSubtype);
    const [rcaResponsible, setRcaResponsible] = useState<string>(defaultRcaResponsible);
    const [imputedEntities, setImputedEntities] = useState<any[]>(defaultImputedEntities);
    const [imputedTargetType, setImputedTargetType] = useState<string>(defaultImputedTargetType);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Initialize or reset state once when modal opens or pqr.id / mode changes
    useEffect(() => {
        if (!isOpen || !pqr) return;

        let cancelled = false;
        setErrorMsg(null);
        setShowAllOrderItems(false);
        setRcaCategoryL1(defaultRcaCategory);
        setRcaSubtypeL2(defaultRcaSubtype);
        setRcaResponsible(defaultRcaResponsible);
        setImputedEntities(defaultImputedEntities || EMPTY_ARRAY);
        setImputedTargetType(defaultImputedTargetType || 'none');

        const stripAutoTags = (raw: string) =>
            (raw || '')
                .replace(/\[RCA_METADATA:\s*\{[\s\S]*?\}\]/g, '')
                .replace(/\[CONCEPTO:[\s\S]*?(?=\n\n\[|$)/g, '')
                .replace(/\[RESPONSABLE IMPUTADO:[\s\S]*?(?=\n\n\[|$)/g, '')
                .trim();

        let preservedSanitaryAndCapa = stripAutoTags(pqr.resolution_notes || '');
        let preservedTechNotes = defaultImputedEvidenceNotes || '';

        try {
            const rawDraft = localStorage.getItem(`pqr_audit_draft_${pqr.id}`);
            if (rawDraft) {
                const draft = JSON.parse(rawDraft);
                if (draft.rcaCategoryL1) setRcaCategoryL1(draft.rcaCategoryL1);
                if (draft.rcaSubtypeL2) setRcaSubtypeL2(draft.rcaSubtypeL2);
                if (draft.rcaResponsible) setRcaResponsible(draft.rcaResponsible);
                if (draft.imputedTargetType) setImputedTargetType(draft.imputedTargetType);
                if (Array.isArray(draft.imputedEntities) && draft.imputedEntities.length > 0) {
                    setImputedEntities(draft.imputedEntities);
                }
                if (draft.resolutionNotes) {
                    const cleanedDraftNotes = stripAutoTags(draft.resolutionNotes);
                    if (cleanedDraftNotes) preservedSanitaryAndCapa = cleanedDraftNotes;
                }
                if (draft.rcaEvidenceNotes) {
                    preservedTechNotes = draft.rcaEvidenceNotes;
                }
            }
        } catch (e) {
            console.error('Error hydrating draft in FinancialAdjustmentModal:', e);
        }

        setPriorCapAndSanitaryNotes(preservedSanitaryAndCapa);
        setTechnicalInspectionNotes(preservedTechNotes);

        const shortId = pqr.id.substring(0, 8);
        const seqPart = pqr.orders?.sequence_id || shortId.toUpperCase();
        const now = new Date();
        const ddmm = `${String(now.getDate()).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`;
        setCreditNoteNumber(`NC-${seqPart}-${ddmm}`);
        setReferenceInvoiceNumber(pqr.orders?.sequence_id ? `FV-${pqr.orders.sequence_id}` : `FV-${shortId.toUpperCase()}`);

        // Pre-fill accounting observation note
        const defaultNote = mode === 'credit_note' 
            ? `Nota Crédito autorizada por Servicio al Cliente para PQR #${shortId} (${pqr.subject}).`
            : `Ajuste de facturación y cantidades recibidas por PQR #${shortId} (${pqr.subject}).`;
        setNotes(defaultNote);

        const loadItemsAndReturns = async () => {
            try {
                let effectiveOrderItems = orderItems && orderItems.length > 0 ? orderItems : [];
                let existingReturns: any[] = [];

                if (pqr.order_id) {
                    const [itemsRes, returnsRes, invoiceRes, orderProfRes] = await Promise.all([
                        effectiveOrderItems.length === 0
                            ? supabase
                                .from('order_items')
                                .select('*, products(name, sku, unit_of_measure)')
                                .eq('order_id', pqr.order_id)
                            : Promise.resolve({ data: effectiveOrderItems }),
                        supabase
                            .from('billing_returns')
                            .select('id, product_id, quantity_returned, status, reason, notes')
                            .eq('order_id', pqr.order_id),
                        supabase
                            .from('billing_invoices')
                            .select('id, invoice_number, total_base, total_tax, total_final')
                            .eq('order_id', pqr.order_id)
                            .maybeSingle(),
                        supabase
                            .from('orders')
                            .select('sequence_id, profiles:profile_id(iva_responsible)')
                            .eq('id', pqr.order_id)
                            .maybeSingle()
                    ]);

                    effectiveOrderItems = itemsRes.data || [];
                    existingReturns = returnsRes.data || [];

                    if (!cancelled) {
                        if (invoiceRes.data?.invoice_number) {
                            setReferenceInvoiceNumber(invoiceRes.data.invoice_number);
                        } else if (orderProfRes.data?.sequence_id) {
                            setReferenceInvoiceNumber(`FV-${orderProfRes.data.sequence_id}`);
                        }
                        if (orderProfRes.data?.sequence_id) {
                            setCreditNoteNumber(`NC-${orderProfRes.data.sequence_id}-${ddmm}`);
                        }
                        const profIva = Boolean((orderProfRes.data as any)?.profiles?.iva_responsible);
                        setIsIvaResponsible(profIva);
                    }
                }

                if (cancelled) return;

                if (effectiveOrderItems.length > 0) {
                    setUseManualGlobal(false);
                    setCustomGlobalAmount(null);

                    const combined = `${pqr.subject || ''} ${pqr.description || ''}`;
                    const qtyMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kls?|und|unidades?|libras?)/i);
                    const extractedQty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 0;

                    const mapped: FinancialAdjustmentItem[] = effectiveOrderItems.map((item, idx) => {
                        const origQty = Number(item.quantity) || 0;
                        const price = Number(item.unit_price) || 0;
                        const name = item.products?.name || item.nickname || `Producto #${idx + 1}`;
                        const uom = item.products?.unit_of_measure || 'Kg';

                        // 1. Priority: Match against existing billing_returns for this order_id + product_id
                        const matchedReturn = existingReturns.find(r => r.product_id === item.product_id);

                        // 2. Fallback: Check if this item is mentioned in PQR subject or description
                        const cleanSubject = (pqr.subject || '').toLowerCase();
                        const cleanItemName = name.toLowerCase();
                        const isMentioned = cleanItemName.split(' ').some((word: string) => word.length > 3 && cleanSubject.includes(word));

                        let initialAffQty = 0;
                        let initialSelected = false;

                        if (matchedReturn && Number(matchedReturn.quantity_returned) > 0) {
                            initialSelected = true;
                            initialAffQty = Math.min(origQty, Number(matchedReturn.quantity_returned));
                        } else if (existingReturns.length === 0 && (effectiveOrderItems.length === 1 || isMentioned)) {
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
                            notes: matchedReturn?.reason || ''
                        };
                    });

                    // Sort so selected (returned) items appear at the very top of the breakdown list
                    mapped.sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0));

                    if (!mapped.some(m => m.selected) && mapped.length > 0) {
                        mapped[0].selected = true;
                        mapped[0].affected_quantity = Math.min(mapped[0].original_quantity, 1);
                    }

                    setItems(mapped);
                } else {
                    setItems([]);
                    setUseManualGlobal(true);
                    setCustomGlobalAmount(0);
                }
            } catch (err) {
                console.error('Error loading order items/returns in FinancialAdjustmentModal:', err);
            }
        };

        loadItemsAndReturns();
        return () => {
            cancelled = true;
        };
    }, [isOpen, pqr?.id, mode]);

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

            const primaryEntity = imputedEntities && imputedEntities.length > 0 ? imputedEntities[0] : null;
            const primaryEntityId = primaryEntity?.id || defaultImputedEntityId || null;
            const primaryEntityName = primaryEntity?.name || defaultImputedEntityName || null;

            const finalizedEntities = (imputedEntities || []).map(e => ({
                ...e,
                deductionAmount: Math.round((calculatedCreditAmount * (Number(e.sharePercent) || 100)) / 100)
            }));

            const entitiesFormatted = finalizedEntities.length > 0 
                ? finalizedEntities.map(e => `${e.name} (${e.role || 'Responsable'} - ${e.sharePercent}% = ${formatMoney(e.deductionAmount || 0)})`).join(', ')
                : primaryEntityName;

            const rcaTag = buildRcaMetadataTag({
                categoryL1: rcaCategoryL1,
                subtypeL2: rcaSubtypeL2,
                responsible: rcaResponsible as any,
                notes: technicalInspectionNotes || defaultImputedEvidenceNotes || notes,
                imputedTargetType: imputedTargetType,
                imputedEntities: finalizedEntities,
                imputedEntityId: primaryEntityId || undefined,
                imputedEntityName: primaryEntityName || undefined,
                imputedEvidenceNotes: technicalInspectionNotes || defaultImputedEvidenceNotes || notes,
                deductionAmount: calculatedCreditAmount
            });

            const upsertApprovedReturn = async (item: FinancialAdjustmentItem, prefixTag: string) => {
                const { data: existingRow } = await supabase
                    .from('billing_returns')
                    .select('id, notes')
                    .eq('order_id', orderId)
                    .eq('product_id', item.product_id)
                    .maybeSingle();

                const custodyMatch = String(existingRow?.notes || '').match(/\[RETORNO_FISICO:\s*(SI|NO)\]/i);
                const custodyTag = custodyMatch ? `[RETORNO_FISICO: ${custodyMatch[1].toUpperCase()}]` : '[RETORNO_FISICO: NO]';
                const reasonText = `[${prefixTag} PQR #${shortPqrId}] ${item.novelty_type.toUpperCase()}: ${notes || pqr.subject}`;
                const notesText = `${custodyTag} | RCA: ${rcaCategoryL1} / ${rcaSubtypeL2} - Responsable: ${rcaResponsible}${mode === 'credit_note' && creditNoteNumber ? ` | NC: ${creditNoteNumber} (Ref: ${referenceInvoiceNumber})` : ''}`;

                if (existingRow?.id) {
                    const { error: updErr } = await supabase
                        .from('billing_returns')
                        .update({
                            quantity_returned: item.affected_quantity,
                            reason: reasonText,
                            status: 'approved',
                            notes: notesText,
                            resolved_at: nowIso,
                            credit_note_number: mode === 'credit_note' ? creditNoteNumber : null,
                            reference_invoice_number: referenceInvoiceNumber || null
                        })
                        .eq('id', existingRow.id);
                    if (updErr) throw updErr;
                } else {
                    const { error: insErr } = await supabase
                        .from('billing_returns')
                        .insert([{
                            order_id: orderId,
                            product_id: item.product_id,
                            quantity_returned: item.affected_quantity,
                            reason: reasonText,
                            status: 'approved',
                            notes: notesText,
                            resolved_at: nowIso,
                            credit_note_number: mode === 'credit_note' ? creditNoteNumber : null,
                            reference_invoice_number: referenceInvoiceNumber || null
                        }]);
                    if (insErr) throw insErr;
                }
            };

            const combinedHeaderNotes = priorCapAndSanitaryNotes
                ? `${priorCapAndSanitaryNotes}\n\n[OBSERVACIÓN CONTABLE]: ${notes}`
                : notes;
            const respLabel = RESPONSIBLE_PARTIES[rcaResponsible as keyof typeof RESPONSIBLE_PARTIES]?.label || rcaResponsible;

            if (mode === 'credit_note') {
                // =========================================================
                // OPCIÓN 3: NOTA CRÉDITO COMERCIAL
                // =========================================================
                if (orderId && selectedItems.length > 0) {
                    for (const item of selectedItems) {
                        await upsertApprovedReturn(item, 'NOTA CRÉDITO');
                    }
                }

                // Stamp Credit Note traceability in orders.admin_notes
                if (orderId) {
                    const { data: currentOrder } = await supabase
                        .from('orders')
                        .select('admin_notes')
                        .eq('id', orderId)
                        .maybeSingle();
                    const prevAdminNotes = currentOrder?.admin_notes || '';
                    const cnTag = `[NOTA_CREDITO_PQR #${shortPqrId} | NC: ${creditNoteNumber} | FACTURA_REF: ${referenceInvoiceNumber} | VALOR: -${formatMoney(calculatedCreditAmount)}]: Nota Crédito comercial emitida por Calidad (SAC).`;
                    if (!prevAdminNotes.includes(`NOTA_CREDITO_PQR #${shortPqrId}`)) {
                        await supabase
                            .from('orders')
                            .update({
                                admin_notes: `${prevAdminNotes}\n${cnTag}`.trim()
                            })
                            .eq('id', orderId);
                    }
                }

                const baseVal = isIvaResponsible ? Math.round(calculatedCreditAmount / 1.19) : calculatedCreditAmount;
                const taxVal = isIvaResponsible ? calculatedCreditAmount - baseVal : 0;

                const finalNotes = `${combinedHeaderNotes}\n\n[CONCEPTO: Opción 3 - Nota Crédito Comercial Emitida]\n-> Consecutivo Nota Crédito: ${creditNoteNumber} (Factura Ref: ${referenceInvoiceNumber})\n-> Valor Acreditado a Favor del Cliente: ${formatMoney(calculatedCreditAmount)} (Base: ${formatMoney(baseVal)} + IVA: ${formatMoney(taxVal)})\n-> Desglose de Ítems:\n${itemsSummary || `• Ajuste comercial directo por ${formatMoney(calculatedCreditAmount)}`}\n${entitiesFormatted ? `-> Responsabilidad Imputada: ${entitiesFormatted}\n` : ''}${rcaTag}\n[RESPONSABLE IMPUTADO: ${respLabel}]`;

                const { error: pqrUpdateErr } = await supabase
                    .from('customer_service_pqrs')
                    .update({
                        status: 'resolved',
                        resolved_at: nowIso,
                        resolution_notes: finalNotes
                    })
                    .eq('id', pqr.id);

                if (pqrUpdateErr) throw pqrUpdateErr;

                try {
                    localStorage.removeItem(`pqr_audit_draft_${pqr.id}`);
                } catch {}

                onSuccess(`Nota Crédito ${creditNoteNumber} de ${formatMoney(calculatedCreditAmount)} emitida y aprobada con éxito.`);
                onClose();

            } else {
                // =========================================================
                // OPCIÓN 4: AJUSTAR FACTURA & RECALCULAR PEDIDO
                // =========================================================
                if (!orderId) {
                    throw new Error('Esta PQR no tiene un pedido asociado en base de datos para recalcular.');
                }

                // 1. Update order_items quantities and approve billing_returns
                for (const item of selectedItems) {
                    const newQty = Math.max(0, Number(item.original_quantity) - Number(item.affected_quantity));
                    await supabase
                        .from('order_items')
                        .update({ quantity: newQty })
                        .eq('order_id', orderId)
                        .eq('product_id', item.product_id);

                    await upsertApprovedReturn(item, 'AJUSTE FACTURA');
                }

                // 2. Update orders total
                const { data: currentOrder } = await supabase.from('orders').select('total, admin_notes').eq('id', orderId).single();
                const previousTotal = Number(currentOrder?.total) || originalOrderTotal;
                const newTotal = Math.max(0, previousTotal - calculatedCreditAmount);

                const updatedAdminNotes = `${currentOrder?.admin_notes || ''}\n[AJUSTE FACTURA PQR #${shortPqrId}]: Valor ajustado de ${formatMoney(previousTotal)} a ${formatMoney(newTotal)} (-${formatMoney(calculatedCreditAmount)}).`.trim();

                await supabase
                    .from('orders')
                    .update({ 
                        total: newTotal,
                        subtotal: newTotal,
                        admin_notes: updatedAdminNotes 
                    })
                    .eq('id', orderId);

                // 3. Update billing_invoices if exists
                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', orderId).maybeSingle();
                if (invoiceData) {
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles:profile_id(iva_responsible)')
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

                // 4. Update PQR status and notes preserving Invima and CAPA notes
                const finalNotes = `${combinedHeaderNotes}\n\n[CONCEPTO: Opción 4 - Factura Ajustada con Cantidad Recibida]\n-> Total Anterior: ${formatMoney(previousTotal)} | Nuevo Total Final: ${formatMoney(newTotal)} (-${formatMoney(calculatedCreditAmount)})\n-> Ítems Ajustados en Pedido:\n${itemsSummary}\n${entitiesFormatted ? `-> Responsabilidad Imputada: ${entitiesFormatted}\n` : ''}${rcaTag}\n[RESPONSABLE IMPUTADO: ${respLabel}]`;

                const { error: pqrUpdateErr } = await supabase
                    .from('customer_service_pqrs')
                    .update({
                        status: 'resolved',
                        resolved_at: nowIso,
                        resolution_notes: finalNotes
                    })
                    .eq('id', pqr.id);

                if (pqrUpdateErr) throw pqrUpdateErr;

                try {
                    localStorage.removeItem(`pqr_audit_draft_${pqr.id}`);
                } catch {}

                onSuccess(`Factura y Pedido ajustados con éxito. Nuevo Total: ${formatMoney(newTotal)}.`);
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

                    {/* World Office Fiscal Reference & IVA Breakdown (Credit Note Mode) */}
                    {isCredit && (
                        <div style={{
                            backgroundColor: '#FAF5FF',
                            border: '1px solid #DDD6FE',
                            borderRadius: '12px',
                            padding: '10px 14px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                            gap: '10px',
                            alignItems: 'center'
                        }}>
                            <div>
                                <label style={{ fontSize: '0.64rem', fontWeight: '800', color: '#6D28D9', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>
                                    Consecutivo Nota Crédito (World Office)
                                </label>
                                <input
                                    type="text"
                                    value={creditNoteNumber}
                                    onChange={e => setCreditNoteNumber(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '5px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #C4B5FD',
                                        fontSize: '0.76rem',
                                        fontWeight: '900',
                                        color: '#4C1D95',
                                        backgroundColor: '#FFFFFF',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.64rem', fontWeight: '800', color: '#6D28D9', textTransform: 'uppercase', display: 'block', marginBottom: '3px' }}>
                                    Factura de Referencia Asociada
                                </label>
                                <input
                                    type="text"
                                    value={referenceInvoiceNumber}
                                    onChange={e => setReferenceInvoiceNumber(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '5px 8px',
                                        borderRadius: '6px',
                                        border: '1px solid #C4B5FD',
                                        fontSize: '0.76rem',
                                        fontWeight: '800',
                                        color: '#334155',
                                        backgroundColor: '#FFFFFF',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <div>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                    Base Contable Acreditada
                                </span>
                                <span style={{ fontSize: '0.84rem', fontWeight: '900', color: '#1E293B' }}>
                                    {formatMoney(isIvaResponsible ? Math.round(calculatedCreditAmount / 1.19) : calculatedCreditAmount)}
                                </span>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                    Régimen IVA ({isIvaResponsible ? 'Gravado 19%' : 'Exento Agro 0%'})
                                </span>
                                <span style={{ fontSize: '0.84rem', fontWeight: '900', color: '#0D7A57' }}>
                                    {formatMoney(isIvaResponsible ? calculatedCreditAmount - Math.round(calculatedCreditAmount / 1.19) : 0)}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Products & Items Breakdown Table */}
                    <div>
                        {(() => {
                            const selectedCount = items.filter(i => i.selected || i.affected_quantity > 0).length;
                            const hiddenCount = Math.max(0, items.length - selectedCount);
                            const visibleEntries = items
                                .map((item, idx) => ({ item, idx }))
                                .filter(({ item }) => showAllOrderItems || selectedCount === 0 || item.selected || item.affected_quantity > 0);

                            return (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: '900', textTransform: 'uppercase', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <PackageCheck size={15} color="#0D7A57" />
                                            Desglose de Productos & Cantidades Afectadas ({selectedCount} de {items.length} con novedad)
                                        </label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            {!useManualGlobal && hiddenCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllOrderItems(!showAllOrderItems)}
                                                    style={{
                                                        background: '#F1F5F9',
                                                        border: '1px solid #CBD5E1',
                                                        borderRadius: '6px',
                                                        padding: '3px 9px',
                                                        color: '#334155',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    {showAllOrderItems ? `Ocultar productos sin novedad (${hiddenCount})` : `+ Ver demás productos del pedido (${hiddenCount})`}
                                                </button>
                                            )}
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
                                                    {visibleEntries.map(({ item, idx }, rowPos) => {
                                                        const subtotal = item.affected_quantity * item.unit_price;
                                                        return (
                                                            <tr 
                                                                key={item.id} 
                                                                style={{ 
                                                                    borderBottom: rowPos < visibleEntries.length - 1 ? '1px solid #F1F5F9' : 'none',
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
                                </>
                            );
                        })()}
                    </div>

                    {/* Read-Only Summary of Step 3 RCA & Imputed Collaborators */}
                    <div style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '0.9rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '900', textTransform: 'uppercase', color: '#0D7A57', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Sparkles size={14} color="#0D7A57" />
                                Dictamen Técnico & Imputabilidad Vinculada (Paso 3)
                            </span>
                            <span style={{
                                fontSize: '0.68rem',
                                fontWeight: '800',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                backgroundColor: '#DCFCE7',
                                color: '#166534',
                                border: '1px solid #86EFAC'
                            }}>
                                Sincronizado con Auditoría PQR
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px', fontSize: '0.74rem' }}>
                            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                    Causa Raíz (L1 / L2)
                                </span>
                                <strong style={{ color: '#1E293B', display: 'block', marginTop: '2px' }}>
                                    {selectedCategoryL1Obj?.label || rcaCategoryL1}
                                </strong>
                                <span style={{ color: '#475569', fontSize: '0.7rem' }}>
                                    {selectedCategoryL1Obj?.subtypes.find(s => s.code === rcaSubtypeL2)?.label || rcaSubtypeL2}
                                </span>
                            </div>

                            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                    Área Responsable
                                </span>
                                <strong style={{ color: '#0D7A57', display: 'block', marginTop: '2px' }}>
                                    {RESPONSIBLE_PARTIES[rcaResponsible as keyof typeof RESPONSIBLE_PARTIES]?.label || rcaResponsible}
                                </strong>
                            </div>

                            <div style={{ backgroundColor: '#FFFFFF', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                    Imputación Patrimonial (Columna N / Proveedor)
                                </span>
                                {imputedEntities && imputedEntities.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                        {imputedEntities.map((ent, i) => {
                                            const calcCop = Math.round((calculatedCreditAmount * (Number(ent.sharePercent) || 100)) / 100);
                                            return (
                                                <div key={i} style={{ fontSize: '0.72rem', fontWeight: '800', color: '#991B1B' }}>
                                                    {ent.name} ({ent.sharePercent}% = {formatMoney(calcCop)})
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <span style={{ color: '#64748B', fontSize: '0.72rem', display: 'block', marginTop: '2px' }}>
                                        Sin cargo individual asignado ($0)
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Accounting Notes / Justification Textarea */}
                    <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B', display: 'block', marginBottom: '4px' }}>
                            Concepto Contable & Observación de Liquidación
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
