'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { THEME, formatMoney } from '@/lib/adminTheme';
import { 
    X, Receipt, Scale, AlertTriangle, CheckCircle2, 
    ArrowRight, CornerDownRight, Sparkles, Building2, 
    PackageCheck, PackageMinus, Info, SlidersHorizontal, Check, RefreshCw, Loader2
} from 'lucide-react';
import { 
    RCA_CATEGORIES_L1, 
    RESPONSIBLE_PARTIES, 
    DefectCategoryL1, 
    buildRcaMetadataTag,
    parseRcaFromRecord
} from '@/lib/rcaTaxonomy';
import {
    pickPrimaryFvInvoice,
    recalculateOrderTotalsFromItems,
    computeManualCreditNoteTaxSplit,
    extractAgreementDiscountPct,
    round2,
    type BillingReturnLike,
    type OrderItemLike,
} from '@/lib/commercial/pqrAdjustmentEngine';

export interface FinancialAdjustmentItem {
    id: string;
    product_id: string;
    product_name: string;
    unit_of_measure: string;
    original_quantity: number;
    unit_price: number;
    iva_rate?: number;
    affected_quantity: number;
    affected_quantity_input?: string;
    requested_return_quantity?: number;
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
    const [creditNoteNumber, setCreditNoteNumber] = useState('Pendiente Corte ADJ');
    const [isOrderInvoicedLocked, setIsOrderInvoicedLocked] = useState(false);
    const [orderAgreementDiscountPct, setOrderAgreementDiscountPct] = useState(0);
    const [isOffAgreementSplit, setIsOffAgreementSplit] = useState(false);
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
        setCreditNoteNumber('Pendiente Corte ADJ');
        setIsOrderInvoicedLocked(false);
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

                let localIsOffAgreementSplit = false;
                if (pqr.order_id) {
                    const [itemsRes, returnsRes, invoiceRes, orderProfRes] = await Promise.all([
                        supabase
                            .from('order_items')
                            .select('id, product_id, quantity, picked_quantity, unit_price, selected_options, nickname, products(name, accounting_id, unit_of_measure, iva_rate)')
                            .eq('order_id', pqr.order_id),
                        supabase
                            .from('billing_returns')
                            .select('id, product_id, quantity_returned, status, reason, notes, source, credit_note_number, calculated_amount')
                            .eq('order_id', pqr.order_id),
                        supabase
                            .from('billing_invoices')
                            .select('id, invoice_number, is_credit_note, worldoffice_sync_status')
                            .eq('order_id', pqr.order_id)
                            .or('is_credit_note.is.null,is_credit_note.eq.false')
                            .order('created_at', { ascending: false })
                            .limit(1),
                        supabase
                            .from('orders')
                            .select('sequence_id, billing_cut_id, invoice_id, subtotal, tax, total, admin_notes, logistics_data, profiles:profile_id(iva_responsible, logistics_data, parent:parent_id(logistics_data))')
                            .eq('id', pqr.order_id)
                            .maybeSingle()
                    ]);

                    if (itemsRes.data && itemsRes.data.length > 0) {
                        effectiveOrderItems = itemsRes.data;
                    }
                    existingReturns = returnsRes.data || [];
                    const primaryFv = pickPrimaryFvInvoice(invoiceRes.data || []);

                    if (!cancelled) {
                        if (primaryFv?.invoice_number) {
                            setReferenceInvoiceNumber(primaryFv.invoice_number);
                        } else if (orderProfRes.data?.sequence_id) {
                            setReferenceInvoiceNumber(`FV-${orderProfRes.data.sequence_id}`);
                        }
                        setCreditNoteNumber('Pendiente Corte ADJ');
                        const hasLockedInvoice = Boolean(
                            primaryFv?.invoice_number ||
                            orderProfRes.data?.billing_cut_id ||
                            orderProfRes.data?.invoice_id
                        );
                        setIsOrderInvoicedLocked(hasLockedInvoice);
                        const profData = (orderProfRes.data as any)?.profiles;
                        setOrderAgreementDiscountPct(
                            extractAgreementDiscountPct(orderProfRes.data, profData, profData?.parent)
                        );
                        localIsOffAgreementSplit = Boolean(orderProfRes.data?.logistics_data?.is_off_agreement_split);
                        setIsOffAgreementSplit(localIsOffAgreementSplit);
                    }
                }

                if (cancelled) return;

                if (effectiveOrderItems.length > 0) {
                    setUseManualGlobal(false);
                    setCustomGlobalAmount(null);

                    const combined = `${pqr.subject || ''} ${pqr.description || ''}`;
                    const qtyMatch = combined.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kls?|und|unidades?|libras?)/i);
                    const extractedQty = qtyMatch ? parseFloat(qtyMatch[1].replace(',', '.')) : 0;

                    // Consumo FIFO únicamente de devoluciones pending_review o del mismo PQR #shortId
                    const prefillPool = existingReturns.filter(
                        (r) =>
                            r.status === 'pending_review' ||
                            (r.reason && r.reason.includes(`PQR #${shortId}`))
                    );
                    const remainingReturnQty = prefillPool.map((r) => Math.max(0, Number(r.quantity_returned) || 0));

                    const mapped: FinancialAdjustmentItem[] = effectiveOrderItems.map((item, idx) => {
                        const baseQty =
                            item.selected_options?._charge_overweight === true &&
                            Number(item.picked_quantity) > Number(item.quantity)
                                ? Number(item.picked_quantity)
                                : Number(item.quantity) || 0;
                        const price = Number(item.unit_price) || 0;
                        const ivaRate = Number(item.products?.iva_rate) || 0;
                        const name = item.products?.name || item.nickname || `Producto #${idx + 1}`;
                        const uom = item.products?.unit_of_measure || 'Kg';

                        let fifoAllocated = 0;
                        let matchedReturn: any = null;
                        for (let rIdx = 0; rIdx < prefillPool.length; rIdx++) {
                            const ret = prefillPool[rIdx];
                            if (ret.product_id === item.product_id && remainingReturnQty[rIdx] > 0) {
                                const take = Math.min(baseQty - fifoAllocated, remainingReturnQty[rIdx]);
                                if (take > 0) {
                                    fifoAllocated += take;
                                    remainingReturnQty[rIdx] -= take;
                                    if (!matchedReturn) matchedReturn = ret;
                                }
                                if (fifoAllocated >= baseQty) break;
                            }
                        }

                        const isPendingMuelle =
                            mode === 'invoice_adjustment' &&
                            matchedReturn?.source === 'rectificacion_muelle' &&
                            !localIsOffAgreementSplit;
                        const origQty = isPendingMuelle ? baseQty + fifoAllocated : baseQty;

                        // 2. Fallback: Check if this item is mentioned in PQR subject or description
                        const cleanSubject = (pqr.subject || '').toLowerCase();
                        const cleanItemName = name.toLowerCase();
                        const isMentioned = cleanItemName.length > 3 && cleanSubject.includes(cleanItemName);

                        let initialAffQty = 0;
                        let initialSelected = false;

                        if (fifoAllocated > 0) {
                            initialSelected = true;
                            initialAffQty = fifoAllocated;
                        } else if (prefillPool.length === 0 && (effectiveOrderItems.length === 1 || isMentioned)) {
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
                            iva_rate: ivaRate,
                            affected_quantity: initialAffQty,
                            novelty_type: 'averia',
                            selected: initialSelected,
                            notes: matchedReturn?.reason || '',
                            requested_return_quantity: fifoAllocated
                        };
                    });

                    // Sort so selected (returned) items appear at the very top of the breakdown list
                    mapped.sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0));

                    if (mode === 'invoice_adjustment' && !mapped.some(m => m.selected) && mapped.length > 0) {
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

    const creditTaxBreakdown = useMemo(() => {
        if (useManualGlobal) {
            return computeManualCreditNoteTaxSplit(calculatedCreditAmount, 0);
        }
        let baseTotal = 0;
        let taxTotal = 0;
        let grossTotal = 0;
        for (const item of items) {
            if (!item.selected || item.affected_quantity <= 0) continue;
            const split = computeManualCreditNoteTaxSplit(
                item.affected_quantity * item.unit_price,
                item.iva_rate || 0
            );
            baseTotal = round2(baseTotal + split.baseTotal);
            taxTotal = round2(taxTotal + split.taxTotal);
            grossTotal = round2(grossTotal + split.grossTotal);
        }
        return { grossTotal, baseTotal, taxTotal };
    }, [items, useManualGlobal, calculatedCreditAmount]);

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

    const handleItemQtyChange = (index: number, val: number, rawInput?: string) => {
        setItems(prev => {
            const next = [...prev];
            const clamped = Math.max(0, Math.min(next[index].original_quantity, val));
            next[index].affected_quantity = clamped;
            if (rawInput !== undefined) {
                next[index].affected_quantity_input = rawInput;
            }
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
            next[index].affected_quantity_input = targetQty === 0 ? '' : String(targetQty).replace('.', ',');
            next[index].selected = targetQty > 0;
            return next;
        });
    };

    const handleSubmit = async () => {
        setErrorMsg(null);

        if (mode === 'invoice_adjustment' && isOrderInvoicedLocked) {
            setErrorMsg('Este pedido ya cuenta con Factura o Corte generado (FAC-IMP). Debes emitir Opción 3 (Nota Crédito) en lugar de Ajuste de Factura.');
            return;
        }

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
                deductionAmount: e.waiveDeduction ? 0 : (e.baseAmount !== undefined && e.baseAmount > 0 ? e.baseAmount : (e.deductionAmount !== undefined && e.deductionAmount > 0 ? e.deductionAmount : Math.round((calculatedCreditAmount * (e.sharePercent !== undefined ? Number(e.sharePercent) : 100)) / 100)))
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
                deductionAmount: calculatedCreditAmount,
                imputationMode: parseRcaFromRecord(pqr).imputationMode,
                itemImputations: parseRcaFromRecord(pqr).itemImputations
            });

            const upsertApprovedReturn = async (item: FinancialAdjustmentItem, prefixTag: string) => {
                const { data: candidateRows, error: fetchRetErr } = await supabase
                    .from('billing_returns')
                    .select('id, notes, source, status, reason')
                    .eq('order_id', orderId)
                    .eq('product_id', item.product_id);
                if (fetchRetErr) throw fetchRetErr;

                const existingRow = (candidateRows || []).find(
                    (r: any) =>
                        r.status === 'pending_review' ||
                        (r.reason && String(r.reason).includes(`PQR #${shortPqrId}`))
                ) || null;

                const custodyMatch = String(existingRow?.notes || '').match(/\[RETORNO_FISICO:\s*(SI|NO)\]/i);
                const custodyTag = custodyMatch ? `[RETORNO_FISICO: ${custodyMatch[1].toUpperCase()}]` : '[RETORNO_FISICO: NO]';
                const reasonText = `[${prefixTag} PQR #${shortPqrId}] ${item.novelty_type.toUpperCase()}: ${notes || pqr.subject}`;
                const notesText = `${custodyTag} | RCA: ${rcaCategoryL1} / ${rcaSubtypeL2} - Responsable: ${rcaResponsible}${mode === 'credit_note' ? ` | NC: Pendiente Corte ADJ (Ref: ${referenceInvoiceNumber})` : ''}`;
                const resolvedSource =
                    mode === 'credit_note'
                        ? 'pqr_nota_credito'
                        : existingRow?.source === 'rectificacion_muelle'
                            ? 'rectificacion_muelle'
                            : 'pqr_ajuste_factura_net';
                const lineAmount = round2(item.affected_quantity * item.unit_price);

                if (existingRow?.id) {
                    const { error: updErr } = await supabase
                        .from('billing_returns')
                        .update({
                            quantity_returned: item.affected_quantity,
                            reason: reasonText,
                            status: 'approved',
                            source: resolvedSource,
                            calculated_amount: lineAmount,
                            notes: notesText,
                            resolved_at: nowIso,
                            credit_note_number: null,
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
                            source: resolvedSource,
                            calculated_amount: lineAmount,
                            notes: notesText,
                            resolved_at: nowIso,
                            credit_note_number: null,
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
                // OPCIÓN 3: NOTA CRÉDITO COMERCIAL (Diferida a Corte ADJ)
                // =========================================================
                if (orderId) {
                    if (useManualGlobal) {
                        const globalReason = `[NOTA CRÉDITO GLOBAL PQR #${shortPqrId}]: ${notes || pqr.subject || 'Ajuste financiero global'}`;
                        const globalNotes = `[RETORNO_FISICO: NO] | RCA: ${rcaCategoryL1} / ${rcaSubtypeL2} - Responsable: ${rcaResponsible} | NC: Pendiente Corte ADJ (Ref: ${referenceInvoiceNumber})`;
                        const { error: globalInsErr } = await supabase
                            .from('billing_returns')
                            .insert([{
                                order_id: orderId,
                                product_id: null,
                                quantity_returned: 1,
                                calculated_amount: round2(calculatedCreditAmount),
                                reason: globalReason,
                                status: 'approved',
                                source: 'pqr_nota_credito',
                                notes: globalNotes,
                                resolved_at: nowIso,
                                credit_note_number: null,
                                reference_invoice_number: referenceInvoiceNumber || null
                            }]);
                        if (globalInsErr) throw globalInsErr;
                    } else if (selectedItems.length > 0) {
                        for (const item of selectedItems) {
                            await upsertApprovedReturn(item, 'NOTA CRÉDITO');
                        }
                    }
                }

                // Stamp Credit Note traceability in orders.admin_notes
                if (orderId) {
                    const { data: currentOrder, error: ordFetchErr } = await supabase
                        .from('orders')
                        .select('admin_notes')
                        .eq('id', orderId)
                        .maybeSingle();
                    if (ordFetchErr) throw ordFetchErr;
                    const prevAdminNotes = currentOrder?.admin_notes || '';
                    const cnTag = `[NOTA_CREDITO_PQR #${shortPqrId} | NC: Pendiente Corte ADJ | FACTURA_REF: ${referenceInvoiceNumber} | VALOR: -${formatMoney(calculatedCreditAmount)}]: Nota Crédito comercial emitida por Calidad (SAC).`;
                    if (!prevAdminNotes.includes(`NOTA_CREDITO_PQR #${shortPqrId}`)) {
                        const { error: ordUpdErr } = await supabase
                            .from('orders')
                            .update({
                                admin_notes: `${prevAdminNotes}\n${cnTag}`.trim()
                            })
                            .eq('id', orderId);
                        if (ordUpdErr) throw ordUpdErr;
                    }
                }

                const baseVal = creditTaxBreakdown.baseTotal;
                const taxVal = creditTaxBreakdown.taxTotal;

                const finalNotes = `${combinedHeaderNotes}\n\n[CONCEPTO: Opción 3 - Nota Crédito Comercial Emitida]\n-> Consecutivo Nota Crédito: Pendiente Corte ADJ (Factura Ref: ${referenceInvoiceNumber})\n-> Valor Acreditado a Favor del Cliente: ${formatMoney(calculatedCreditAmount)} (Base: ${formatMoney(baseVal)} + IVA: ${formatMoney(taxVal)})\n-> Desglose de Ítems:\n${itemsSummary || `• Ajuste comercial directo por ${formatMoney(calculatedCreditAmount)}`}\n${entitiesFormatted ? `-> Responsabilidad Imputada: ${entitiesFormatted}\n` : ''}${rcaTag}\n[RESPONSABLE IMPUTADO: ${respLabel}]`;

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

                onSuccess(`Nota Crédito de ${formatMoney(calculatedCreditAmount)} aprobada y encolada para Corte ADJ.`);
                onClose();

            } else {
                // =========================================================
                // OPCIÓN 4: AJUSTAR FACTURA & RECALCULAR PEDIDO (SIN MUTAR order_items)
                // =========================================================
                if (!orderId) {
                    throw new Error('Esta PQR no tiene un pedido asociado en base de datos para recalcular.');
                }

                // 1. Approve billing_returns (NEVER mutate order_items.quantity to prevent 2X deduction)
                for (const item of selectedItems) {
                    await upsertApprovedReturn(item, 'AJUSTE FACTURA');
                }

                // 2. Recalculate orders totals using pqrAdjustmentEngine (IVA included per product.iva_rate)
                const [freshOrderRes, freshItemsRes, freshReturnsRes] = await Promise.all([
                    supabase.from('orders').select('total, subtotal, tax, admin_notes, logistics_data, profiles:profile_id(logistics_data, parent:parent_id(logistics_data))').eq('id', orderId).single(),
                    supabase.from('order_items').select('id, product_id, quantity, picked_quantity, unit_price, selected_options, nickname, products(id, name, iva_rate)').eq('order_id', orderId),
                    supabase.from('billing_returns').select('id, product_id, quantity_returned, status, reason, source, credit_note_number, calculated_amount, products(id, name, iva_rate)').eq('order_id', orderId)
                ]);
                if (freshOrderRes.error) throw freshOrderRes.error;
                if (freshItemsRes.error) throw freshItemsRes.error;
                if (freshReturnsRes.error) throw freshReturnsRes.error;

                const currentOrder = freshOrderRes.data;
                const previousTotal = Number(currentOrder?.total) || originalOrderTotal;

                const mappedItems: OrderItemLike[] = (freshItemsRes.data || []).map((oi: any) => ({
                    id: oi.id,
                    product_id: oi.product_id,
                    product_name: oi.products?.name || oi.nickname,
                    quantity: oi.quantity,
                    picked_quantity: oi.picked_quantity,
                    selected_options: oi.selected_options,
                    unit_price: oi.unit_price,
                    products: oi.products
                }));
                const mappedReturns: BillingReturnLike[] = (freshReturnsRes.data || []).map((r: any) => ({
                    id: r.id,
                    product_id: r.product_id,
                    product_name: r.products?.name,
                    quantity: r.quantity_returned,
                    calculated_amount: r.calculated_amount,
                    status: r.status,
                    reason: r.reason,
                    source: r.source,
                    credit_note_number: r.credit_note_number,
                    products: r.products
                }));
                const freshProf = (currentOrder as any)?.profiles;
                const summary = recalculateOrderTotalsFromItems(mappedItems, mappedReturns, {
                    isOffAgreementSplit: Boolean(currentOrder?.logistics_data?.is_off_agreement_split),
                    agreementDiscountPct: extractAgreementDiscountPct(currentOrder, freshProf, freshProf?.parent)
                });
                const newTotal = summary.total;
                const newSubtotal = summary.subtotal;
                const newTax = summary.tax;

                const updatedAdminNotes = `${currentOrder?.admin_notes || ''}\n[AJUSTE FACTURA PQR #${shortPqrId}]: Valor ajustado de ${formatMoney(previousTotal)} a ${formatMoney(newTotal)} (-${formatMoney(calculatedCreditAmount)}).`.trim();

                const { error: ordUpdateErr } = await supabase
                    .from('orders')
                    .update({
                        total: newTotal,
                        subtotal: newSubtotal,
                        tax: newTax,
                        admin_notes: updatedAdminNotes
                    })
                    .eq('id', orderId);
                if (ordUpdateErr) throw ordUpdateErr;

                // 3. Update primary FV billing_invoices only if not synced to World Office
                const { data: invoiceData, error: invFetchErr } = await supabase
                    .from('billing_invoices')
                    .select('id, order_id, worldoffice_sync_status')
                    .eq('order_id', orderId)
                    .or('is_credit_note.is.null,is_credit_note.eq.false')
                    .limit(1)
                    .maybeSingle();
                if (invFetchErr) throw invFetchErr;

                if (invoiceData?.id && invoiceData.worldoffice_sync_status !== 'synced') {
                    const { error: invUpdErr } = await supabase
                        .from('billing_invoices')
                        .update({
                            total_base: newSubtotal,
                            total_tax: newTax,
                            total_final: newTotal
                        })
                        .eq('id', invoiceData.id);
                    if (invUpdErr) throw invUpdErr;
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
                    {/* FAC-IMP Lock Banner for Option 4 */}
                    {!isCredit && isOrderInvoicedLocked && (
                        <div style={{
                            padding: '10px 14px',
                            borderRadius: '10px',
                            backgroundColor: '#FFFBEB',
                            border: '1.5px solid #F59E0B',
                            color: '#92400E',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontWeight: '700'
                        }}>
                            <AlertTriangle size={16} color="#D97706" />
                            <span>
                                Pedido ya facturado o en corte ({referenceInvoiceNumber || 'FAC-IMP'}). No se puede usar Opción 4; utiliza Opción 3 (Nota Crédito).
                            </span>
                        </div>
                    )}

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
                                <div style={{
                                    width: '100%',
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    border: '1px dashed #C4B5FD',
                                    fontSize: '0.74rem',
                                    fontWeight: '800',
                                    color: '#6D28D9',
                                    backgroundColor: '#F5F3FF',
                                    boxSizing: 'border-box'
                                }}>
                                    {creditNoteNumber}
                                </div>
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
                                    {formatMoney(creditTaxBreakdown.baseTotal)}
                                </span>
                            </div>
                            <div>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'block' }}>
                                    IVA Discriminado (por Ítem)
                                </span>
                                <span style={{ fontSize: '0.84rem', fontWeight: '900', color: '#0D7A57' }}>
                                    {formatMoney(creditTaxBreakdown.taxTotal)}
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
                                            {isCredit && items.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setUseManualGlobal(!useManualGlobal)}
                                                    style={{
                                                        background: useManualGlobal ? '#ECFDF5' : '#F1F5F9',
                                                        border: useManualGlobal ? '1.5px solid #10B981' : '1px solid #CBD5E1',
                                                        borderRadius: '7px',
                                                        padding: '4px 11px',
                                                        color: useManualGlobal ? '#065F46' : '#0D7A57',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '5px',
                                                        boxShadow: useManualGlobal ? '0 1px 3px rgba(16, 185, 129, 0.2)' : 'none'
                                                    }}
                                                >
                                                    <SlidersHorizontal size={13} />
                                                    {useManualGlobal ? '← Volver al desglose por producto' : 'Ajustar valor global manual ($ COP)'}
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
                                                value={!customGlobalAmount ? '' : customGlobalAmount}
                                                onFocus={e => e.currentTarget.select()}
                                                onChange={e => {
                                                    const raw = e.target.value.replace(/^0+(?=\d)/, '');
                                                    if (raw !== e.target.value) e.target.value = raw;
                                                    setCustomGlobalAmount(raw === '' ? 0 : Number(raw));
                                                }}
                                                min={0}
                                                placeholder="0"
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
                                                                                type="text"
                                                                                inputMode="decimal"
                                                                                placeholder="0"
                                                                                value={item.affected_quantity_input !== undefined
                                                                                    ? item.affected_quantity_input
                                                                                    : (item.affected_quantity === 0 ? '' : String(item.affected_quantity).replace('.', ','))}
                                                                                onFocus={e => e.currentTarget.select()}
                                                                                onChange={e => {
                                                                                    let raw = e.target.value.replace(/[^0-9.,]/g, '');
                                                                                    const parts = raw.split(/[.,]/);
                                                                                    if (parts.length > 2) {
                                                                                        const sepMatch = raw.match(/[.,]/);
                                                                                        const sep = sepMatch ? sepMatch[0] : ',';
                                                                                        raw = parts[0] + sep + parts.slice(1).join('');
                                                                                    }
                                                                                    raw = raw.replace(/^0+(?=\d)/, '');
                                                                                    const normalized = raw.replace(',', '.');
                                                                                    const parsed = normalized === '' || normalized === '.' ? 0 : parseFloat(normalized);
                                                                                    handleItemQtyChange(idx, isNaN(parsed) ? 0 : parsed, raw);
                                                                                }}
                                                                                onBlur={() => {
                                                                                    setItems(prev => prev.map((r, rIdx) => (
                                                                                        rIdx === idx
                                                                                            ? { ...r, affected_quantity_input: r.affected_quantity === 0 ? '' : String(r.affected_quantity).replace('.', ',') }
                                                                                            : r
                                                                                    )));
                                                                                }}
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
                                            const calcCop = ent.waiveDeduction ? 0 : (ent.baseAmount !== undefined && ent.baseAmount > 0 ? ent.baseAmount : (ent.deductionAmount !== undefined && ent.deductionAmount > 0 ? ent.deductionAmount : Math.round((calculatedCreditAmount * (ent.sharePercent !== undefined ? Number(ent.sharePercent) : 100)) / 100)));
                                            return (
                                                <div key={i} style={{ fontSize: '0.72rem', fontWeight: '800', color: ent.waiveDeduction ? '#059669' : '#991B1B' }}>
                                                    {ent.name} ({ent.sharePercent}% = {ent.waiveDeduction ? '$0 COP (Exonerado / Reingreso)' : formatMoney(calcCop)})
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
                        disabled={isSubmitting || calculatedCreditAmount <= 0 || (!isCredit && isOrderInvoicedLocked)}
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
