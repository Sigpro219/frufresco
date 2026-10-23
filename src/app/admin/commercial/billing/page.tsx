'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import {
    getFriendlyOrderId,
    formatStructuredSpecification,
    getOrderReplacementInfo
} from '@/lib/orderUtils';
import { THEME, formatMoney, formatNumber } from '@/lib/adminTheme';
import { GalleryOmnibox, matchesUniversalSearch } from '@/components/common/GalleryOmnibox';
import { 
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Timer,
    ShoppingBag, 
    TrendingUp, 
    AlertCircle, 
    CheckCircle2, 
    Receipt, 
    Calendar, 
    FileText, 
    ChevronRight, 
    Download, 
    CreditCard, 
    RefreshCw, 
    Search, 
    Plus, 
    Trash2, 
    Edit2, 
    User, 
    Users, 
    Printer,
    Sun,
    Moon,
    Wallet,
    Settings,
    Lock,
    FileSignature,
    AlertTriangle,
    FileCheck,
    ArrowLeft,
    Clock,
    Sparkles,
    DollarSign,
    Layers,
    Building2,
    HelpCircle,
    ShieldCheck,
    ShieldAlert,
    X,
    Filter,
    Truck,
    FileSpreadsheet,
    RotateCcw,
    Hash,
    Check,
    ShoppingCart,
    Eye,
    ExternalLink,
    Package,
    Mail,
    Gift,
    Banknote,
    MapPin,
    Phone,
    Zap,
    Archive,
    Copy,
    Tag,
    Scale
} from 'lucide-react';
import { downloadWorldOfficeExcel, downloadCreditNotesExcel, CreditNoteReportItem, resolveWorldOfficeBranch, resolveWorldOfficeNote } from '@/lib/worldOfficeExport';
import { cleanHumanResolutionNotes, parseRcaFromRecord } from '@/lib/rcaTaxonomy';

interface BillingCut {
    id: string;
    cut_number: number;
    scheduled_date: string;
    cut_slot: 'AM' | 'PM' | 'ADJ';
    status: 'open' | 'processing' | 'closed' | 'exported';
    total_orders: number;
    total_amount: number;
    created_at: string;
}

interface BillingReturn {
    id: string;
    order_id: string;
    product_id: string;
    quantity_returned: number;
    reason: string;
    photo_url: string;
    status: string;
    notes?: string;
    credit_note_number?: string;
    reference_invoice_number?: string;
    defect_category_l1?: string;
    defect_subtype_l2?: string;
    created_at?: string;
    products?: { id?: string; name: string; sku?: string; unit_of_measure?: string };
    orders?: {
        id?: string;
        sequence_id: number;
        created_at: string;
        delivery_date?: string;
        total?: number;
        admin_notes?: string;
        profiles?: {
            id?: string;
            company_name?: string;
            razon_social?: string;
            nit?: string;
            parent_id?: string | null;
        };
        customer_service_pqrs?: Array<{
            id?: string;
            type?: string;
            category?: string;
            subject?: string;
            description?: string;
            status?: string;
            resolution_notes?: string;
            created_at?: string;
        }>;
    };
}

interface Invoice {
    id: string;
    invoice_number: string;
    invoice_prefix?: string;
    invoice_number_raw?: number;
    order_id: string;
    cut_id: string;
    total_base: number;
    total_tax: number;
    total_final: number;
    status: 'pending' | 'printed' | 'exported' | 'cancelled';
    payment_status: 'pending' | 'paid' | 'overdue';
    due_date: string;
    created_at: string;
    orders: {
        sequence_id: number;
        created_at: string;
        profiles: {
            company_name: string;
            nit: string;
            payment_days: number;
            parent_id?: string;
            role?: string;
        } | null;
    } | null;
}

export interface CutPreviewOrder {
    id: string;
    sequence_id: number;
    created_at: string;
    total: number;
    originalTotal: number;
    qualityDeduction: number;
    qualityDeductionReason?: string;
    qualityDeductionQty?: number;
    netTotal: number;
    projectedInvoiceNumber: string;
    routeCode: string;
    stopSequence: number;
    documentRequirement: string;
    type?: string;
    admin_notes?: string;
    logistics_data?: any;
    origin_source?: string;
    profile: {
        company_name: string;
        razon_social?: string;
        nit: string;
        iva_responsible: boolean;
        payment_days: number;
        parent_id?: string;
        role?: string;
        document_type?: string;
        print_invoice?: boolean;
        remission_with_prices?: boolean;
    } | null;
}

/**
 * Resolver oficial de Documento de Emisión y Plazo/Condición de Pago
 * Cumple con el estándar corporativo FruFresco:
 * 1. Modalidades de Documento: FAC-DIG, FAC-IMP, REM-VALOR, REM-S/S, REM-OBSEQUIO
 * 2. Plazos B2B: Crédito institucional (hereda de matriz o default 30d, nunca contado)
 * 3. Plazos B2C: Contra Entrega (efectivo/datáfono) o Pasarela Online (Wompi)
 */
export function resolveOrderBillingInfo(order: any, parentsMap: Map<string, any> = new Map()) {
    const prof = order?.profiles || {};
    const parent = prof.parent_id ? parentsMap.get(prof.parent_id) : null;

    // Determine if B2B / Institucional
    const isB2B = prof.role === 'b2b_client' 
        || order?.type === 'b2b' 
        || !!prof.parent_id 
        || !!prof.is_corporate_parent
        || (prof.company_name && /(SAS|S\.A|LTDA|BIC|E\.U\.|CORP|COLSUBSIDIO|ALDIMARK|MONSERRATE|TEQUENDAMA|IRCC|COLEGIO|HOTEL|CLINICA|CAJA DE COMPENSACION|FONDO|WOK)/i.test(prof.company_name));

    // 1. Resolve Document Type (Escenario 221: Si es una remisión fuera de acuerdo despachada a $0 y aún no valorizada, forzar REM-S/S; una vez valorizada por Comercial, emitir según el documento fiscal del cliente)
    const isUnpricedOffAgreement = Boolean(
        (order?.admin_notes || '').includes('DESPACHADO SIN PRECIO') ||
        (order?.admin_notes || '').includes('SE DESPACHÓ SIN PRECIO') ||
        (order?.logistics_data?.is_off_agreement_split && !order?.logistics_data?.off_agreement_priced)
    );
    const rawDocType = isUnpricedOffAgreement
        ? 'remission'
        : ((order?.logistics_data?.document_type_override && !order?.logistics_data?.off_agreement_priced)
            ? order.logistics_data.document_type_override
            : (prof.document_type || parent?.document_type || (isB2B ? 'remission' : 'invoice')));
    const isPrinted = prof.print_invoice !== undefined ? prof.print_invoice : (parent?.print_invoice !== undefined ? parent.print_invoice : true);
    const isWithPrices = isUnpricedOffAgreement
        ? false
        : (prof.remission_with_prices !== undefined ? prof.remission_with_prices : (parent?.remission_with_prices !== undefined ? parent.remission_with_prices : true));

    let docInfo = {
        code: 'FAC-DIG',
        label: 'Factura Digital',
        type: 'invoice',
        isPrinted,
        isWithPrices,
        bg: '#EFF6FF',
        color: '#1E40AF',
        border: '#BFDBFE',
        icon: Mail
    };

    if (rawDocType === 'gift_remission') {
        docInfo = {
            code: 'REM-OBSEQUIO',
            label: 'Remisión Obsequio',
            type: 'gift_remission',
            isPrinted: true,
            isWithPrices: false,
            bg: '#FAF5FF',
            color: '#6B21A8',
            border: '#E9D5FF',
            icon: Gift
        };
    } else if (rawDocType === 'remission') {
        if (isWithPrices) {
            docInfo = {
                code: 'REM-VALOR',
                label: 'Remisión con Valor',
                type: 'remission',
                isPrinted: true,
                isWithPrices: true,
                bg: '#FEF3C7',
                color: '#92400E',
                border: '#FDE68A',
                icon: FileText
            };
        } else {
            docInfo = {
                code: 'REM-S/S',
                label: isUnpricedOffAgreement ? 'Remisión $0 (Por Fijar)' : 'Remisión Sin Valor',
                type: 'remission',
                isPrinted: true,
                isWithPrices: false,
                bg: isUnpricedOffAgreement ? '#FEF2F2' : '#F1F5F9',
                color: isUnpricedOffAgreement ? '#991B1B' : '#475569',
                border: isUnpricedOffAgreement ? '#FECACA' : '#CBD5E1',
                icon: Package
            };
        }
    } else {
        // invoice
        if (isPrinted) {
            docInfo = {
                code: 'FAC-IMP',
                label: 'Factura Impresa',
                type: 'invoice',
                isPrinted: true,
                isWithPrices: true,
                bg: '#DBEAFE',
                color: '#1E3A8A',
                border: '#93C5FD',
                icon: Printer
            };
        } else {
            docInfo = {
                code: 'FAC-DIG',
                label: 'Factura Digital',
                type: 'invoice',
                isPrinted: false,
                isWithPrices: true,
                bg: '#EFF6FF',
                color: '#1E40AF',
                border: '#BFDBFE',
                icon: Mail
            };
        }
    }

    // 2. Resolve Payment Terms
    let paymentInfo = {
        label: 'Pago Contado',
        sublabel: 'Contado',
        type: 'cash',
        days: 0,
        isCredit: false,
        bg: '#F8FAFC',
        color: '#475569',
        border: '#E2E8F0',
        icon: Banknote
    };

    if (isB2B) {
        const rawDays = prof.payment_days || parent?.payment_days || 30; // Default B2B credit is 30d
        paymentInfo = {
            label: `Crédito ${rawDays}d`,
            sublabel: `Plazo ${rawDays} días`,
            type: 'credit',
            days: rawDays,
            isCredit: true,
            bg: '#ECFDF5',
            color: '#065F46',
            border: '#A7F3D0',
            icon: Building2
        };
    } else {
        // B2C
        const method = (order?.payment_method || prof.preferred_payment_method || '').toLowerCase();
        const status = (order?.payment_status || '').toLowerCase();
        const isPaidOnline = method.includes('wompi') || method.includes('bold') || method.includes('pasarela') || status === 'paid' || status === 'pagado' || status === 'approved';

        if (isPaidOnline) {
            paymentInfo = {
                label: 'Pasarela (Wompi)',
                sublabel: 'Pagado Online',
                type: 'online_paid',
                days: 0,
                isCredit: false,
                bg: '#EFF6FF',
                color: '#1E40AF',
                border: '#BFDBFE',
                icon: CreditCard
            };
        } else {
            paymentInfo = {
                label: 'Contra Entrega',
                sublabel: 'Pago al Recibir',
                type: 'contra_entrega',
                days: 0,
                isCredit: false,
                bg: '#FFF7ED',
                color: '#C2410C',
                border: '#FFEDD5',
                icon: Banknote
            };
        }
    }

    return { docInfo, paymentInfo, isB2B };
}

/**
 * Resuelve y formatea con precisión matemática la presentación física, conteo de unidades discretas
 * y peso total en kilogramos para los productos de un pedido (ej: "12 bandejas × 120 g (1.44 Kg total)").
 */
export function formatItemQuantityPresentation(item: any) {
    if (!item) return { primary: '0', secondary: null, totalKg: null, unitCount: null };
    
    const qty = Number(item.quantity) || 0;
    const rawUnit = (item.unit || item.products?.unit_of_measure || 'Kg').toLowerCase().trim();
    const opts = item.selected_options || {};
    const presText = (opts['Presentación'] || opts['Presentacion'] || item.variant_label || item.nickname || '') as string;
    const origQty = Number(opts._original_qty || opts.original_qty) || 0;
    const unitWeightGr = Number(opts._unit_weight_gr || opts.unit_weight_gr) || 0;
    const origUnit = (opts._original_unit || opts.original_unit || '').toLowerCase();

    // 1. Dual Unit explícito en selected_options
    if (origQty > 0 && unitWeightGr > 0) {
        const isBandeja = origUnit.includes('bandeja') || /bandeja/i.test(presText);
        const noun = isBandeja ? (origQty === 1 ? 'bandeja' : 'bandejas') : (origQty === 1 ? 'und' : 'unds');
        const weightLabel = unitWeightGr >= 1000 ? `${unitWeightGr / 1000} kg` : `${unitWeightGr} g`;
        const totalKgFormatted = (qty % 1 === 0 ? qty.toString() : qty.toFixed(2)) + ' Kg';

        return {
            primary: `${origQty} ${noun} × ${weightLabel}`,
            secondary: `${totalKgFormatted} total`,
            totalKg: qty,
            unitCount: origQty
        };
    }

    // 2. Extracción y coincidencia de patrones en Presentación / Variante (ej: "Bandeja 120 gr", "Unidad 120 g", "Und 2000 gr")
    const matchGr = presText.match(/(?:Unidad(?:es)?|Und|U|Bandeja(?:s)?)\s*(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)/i);
    if (matchGr) {
        const gr = parseFloat(matchGr[1].replace(',', '.'));
        const weightKg = gr / 1000;
        const isBandeja = /bandeja/i.test(presText);
        const weightLabel = gr >= 1000 ? `${gr / 1000} kg` : `${gr} g`;

        if (rawUnit.includes('kg') || rawUnit.includes('kilo') || (qty < 10 && weightKg > 0 && (qty / weightKg) >= 1)) {
            // Demanda en Kg con desglose de unidades (ej: 1.44 Kg en bandejas de 120 g -> 12 bandejas × 120 g)
            const count = Math.round(qty / weightKg);
            const noun = isBandeja ? (count === 1 ? 'bandeja' : 'bandejas') : (count === 1 ? 'und' : 'unds');
            const totalKgFormatted = (qty % 1 === 0 ? qty.toString() : qty.toFixed(2)) + ' Kg';

            return {
                primary: `${count} ${noun} × ${weightLabel}`,
                secondary: `${totalKgFormatted} total`,
                totalKg: qty,
                unitCount: count
            };
        } else {
            // Demanda en unidades discretas (ej: 12 bandejas de 120 g -> 1.44 Kg total)
            const count = Math.round(qty);
            const totalWeightKg = count * weightKg;
            const noun = isBandeja ? (count === 1 ? 'bandeja' : 'bandejas') : (count === 1 ? 'und' : 'unds');
            const totalKgFormatted = (totalWeightKg % 1 === 0 ? totalWeightKg.toString() : totalWeightKg.toFixed(2)) + ' Kg';

            return {
                primary: `${count} ${noun} × ${weightLabel}`,
                secondary: `${totalKgFormatted} total`,
                totalKg: totalWeightKg,
                unitCount: count
            };
        }
    }

    // 3. Extracción de gramaje en opts.Gramaje (ej: "120 gr")
    const rawG = opts['Gramaje'] || opts['Gramaje frutas'] || opts['gramaje'];
    if (rawG && String(rawG).toLowerCase() !== 'estándar' && String(rawG).toLowerCase() !== 'estandar') {
        const matchGramaje = String(rawG).match(/(\d+(?:[.,]\d+)?)\s*(?:gr|g|gramos)?/i);
        if (matchGramaje) {
            const gr = parseFloat(matchGramaje[1].replace(',', '.'));
            if (gr > 0) {
                const weightKg = gr / 1000;
                const count = (rawUnit.includes('kg') || rawUnit.includes('kilo')) ? Math.round(qty / weightKg) : Math.round(qty);
                const weightLabel = gr >= 1000 ? `${gr / 1000} kg` : `${gr} g`;
                const totalKgFormatted = (qty % 1 === 0 ? qty.toString() : qty.toFixed(2)) + ' Kg';

                return {
                    primary: `${count} und × ${weightLabel}`,
                    secondary: `${totalKgFormatted} total`,
                    totalKg: qty,
                    unitCount: count
                };
            }
        }
    }

    // 4. Formato estándar de unidad simple
    const formattedQty = qty % 1 === 0 ? qty.toString() : qty.toFixed(2);
    const unitLabel = rawUnit.includes('kg') || rawUnit.includes('kilo') ? 'Kg' : (item.unit || item.products?.unit_of_measure || 'Kg');

    return {
        primary: `${formattedQty} ${unitLabel}`,
        secondary: null,
        totalKg: unitLabel === 'Kg' ? qty : null,
        unitCount: unitLabel !== 'Kg' ? qty : null
    };
}

export function getOrderGraceInfo(order: any, graceMinutes: number = 120, cutCloseTime: string = '17:00') {
    const activeReturns = (order.billing_returns || []).filter((r: any) => r.status !== 'rejected');
    const activePqrs = (order.customer_service_pqrs || []).filter((p: any) => p.status === 'pending' || p.status === 'in_progress');
    const hasReturn = activeReturns.length > 0 || activePqrs.length > 0;
    const isUnpricedOffAgreement = Boolean(
        (order.admin_notes || '').includes('DESPACHADO SIN PRECIO') ||
        (order.admin_notes || '').includes('SE DESPACHÓ SIN PRECIO') ||
        (order.logistics_data?.is_off_agreement_split && !order.logistics_data?.off_agreement_priced)
    );
    const isDelivered = order.status === 'delivered';
    const isShipped = order.status === 'shipped';

    // Escenario 221: Novedad Comercial — Remisión Fuera de Acuerdo a $0 con Countdown contra hora de cierre de corte
    if (isUnpricedOffAgreement) {
        const targetDateStr = order.delivery_date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
        const [closeHourStr = '17', closeMinStr = '00'] = (cutCloseTime || '17:00').split(':');
        const closeTimestamp = new Date(`${targetDateStr}T${closeHourStr.padStart(2, '0')}:${closeMinStr.padStart(2, '0')}:00-05:00`).getTime();
        const startDayTimestamp = new Date(`${targetDateStr}T06:00:00-05:00`).getTime();
        const nowMs = Date.now();
        const remainingCutMs = closeTimestamp - nowMs;
        const remainingCutMin = Math.ceil(remainingCutMs / 60000);
        const totalWindowMs = Math.max(1, closeTimestamp - startDayTimestamp);
        const elapsedWindowMs = Math.max(0, nowMs - startDayTimestamp);
        const cutProgressPct = Math.min(100, Math.max(15, Math.round((elapsedWindowMs / totalWindowMs) * 100)));

        let cutCountdownLabel = '';
        if (remainingCutMin > 0) {
            const hrs = Math.floor(remainingCutMin / 60);
            const mins = remainingCutMin % 60;
            cutCountdownLabel = hrs > 0
                ? `${hrs}h ${String(mins).padStart(2, '0')}m al cierre (${cutCloseTime})`
                : `${mins}m al cierre (${cutCloseTime})`;
        } else {
            cutCountdownLabel = `Cierre vencido (${cutCloseTime})`;
        }

        return {
            statusType: 'novelty',
            isUnpricedNovelty: true,
            badgeText: 'Asignar Precio ($0)',
            badgeBg: '#FEF2F2',
            badgeColor: '#991B1B',
            badgeBorder: '#FECACA',
            progressBarBg: remainingCutMin <= 60 ? '#DC2626' : '#EA580C',
            progressPct: cutProgressPct,
            isReadyForCut: false,
            remainingMin: Math.max(0, remainingCutMin),
            cutCountdownLabel,
            isCutExpired: remainingCutMin <= 0,
            label: 'Pendiente Asignar Precio ($0)'
        };
    }
    
    const pendingReturns = activeReturns.filter((r: any) => r.status === 'pending_review');
    const approvedReturns = activeReturns.filter((r: any) => r.status === 'approved');
    const hasOpenInvestigation = activePqrs.length > 0 || pendingReturns.length > 0;
    const isQualityResolvedWithReturns = !hasOpenInvestigation && approvedReturns.length > 0;

    if (hasOpenInvestigation) {
        return {
            statusType: 'novelty',
            isUnpricedNovelty: false,
            badgeText: activePqrs.length > 0 ? 'PQRS Abierta' : 'En Auditoría',
            badgeBg: '#FEF2F2',
            badgeColor: '#991B1B',
            badgeBorder: '#FECACA',
            progressBarBg: '#EF4444',
            progressPct: 100,
            isReadyForCut: false,
            remainingMin: 0,
            cutCountdownLabel: '',
            isCutExpired: false,
            label: 'Retenido por Calidad'
        };
    }

    if (isQualityResolvedWithReturns) {
        return {
            statusType: 'resolved_novelty',
            isUnpricedNovelty: false,
            badgeText: 'Resuelto SAC',
            badgeBg: '#EFF6FF',
            badgeColor: '#1D4ED8',
            badgeBorder: '#BFDBFE',
            progressBarBg: '#3B82F6',
            progressPct: 100,
            isReadyForCut: true,
            remainingMin: 0,
            cutCountdownLabel: '',
            isCutExpired: false,
            label: 'Resuelto por Calidad'
        };
    }

    if (isDelivered) {
        const deliveryTimeStr = order.manual_delivery_time || order.logistics_data?.delivered_at || order.logistics_data?.completion_time || order.created_at;
        const deliveryTimestamp = deliveryTimeStr ? new Date(deliveryTimeStr).getTime() : Date.now();
        const elapsedMs = Math.max(0, Date.now() - deliveryTimestamp);
        const graceMs = (graceMinutes || 120) * 60 * 1000;
        const remainingMs = Math.max(0, graceMs - elapsedMs);
        const remainingMin = Math.ceil(remainingMs / 60000);
        const isGraceActive = remainingMs > 0;
        const progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / graceMs) * 100)));

        if (isGraceActive) {
            return {
                statusType: 'grace',
                badgeText: `${remainingMin}m`,
                badgeBg: '#FFFBEB',
                badgeColor: '#B45309',
                badgeBorder: '#FDE68A',
                progressBarBg: '#F59E0B',
                progressPct,
                isReadyForCut: false,
                remainingMin,
                label: 'En Gracia'
            };
        }

        const graceLabel = graceMinutes >= 60 ? `${Math.round(graceMinutes / 60)}h` : `${graceMinutes}m`;
        return {
            statusType: 'ready',
            badgeText: `Listo (${graceLabel})`,
            badgeBg: '#ECFDF5',
            badgeColor: '#065F46',
            badgeBorder: '#A7F3D0',
            progressBarBg: '#10B981',
            progressPct: 100,
            isReadyForCut: true,
            remainingMin: 0,
            label: 'Listo para Facturar'
        };
    }

    if (isShipped) {
        return {
            statusType: 'in_route',
            badgeText: 'En Ruta',
            badgeBg: '#F0F9FF',
            badgeColor: '#0369A1',
            badgeBorder: '#BAE6FD',
            progressBarBg: '#0284C7',
            progressPct: 30,
            isReadyForCut: false,
            remainingMin: 0,
            label: 'En Despacho'
        };
    }

    const statusMap = {
        picking: 'Alistamiento',
        approved: 'Aprobado',
        para_compra: 'Compras',
        pending_approval: 'Por Aprobar',
        recibido: 'Recibido'
    };
    return {
        statusType: 'in_process',
        badgeText: (statusMap as any)[order.status] || order.status || 'En Proceso',
        badgeBg: '#F1F5F9',
        badgeColor: '#475569',
        badgeBorder: '#CBD5E1',
        progressBarBg: '#94A3B8',
        progressPct: 15,
        isReadyForCut: false,
        remainingMin: 0,
        label: 'En Preparación'
    };
}

export function resolveReturnProductAndAmount(ret: any, pqr: any) {
    let prodName = ret?.products?.name;
    if (!prodName && ret?.reason) {
        const match = ret.reason.match(/Reclamo en\s+([^–\-\•\n\r]+)/i);
        if (match) prodName = match[1].trim();
    }
    if (!prodName && pqr?.subject) {
        const match = pqr.subject.match(/Reclamo en\s+([^–\-\•\n\r]+)/i);
        if (match) prodName = match[1].trim();
    }
    if (!prodName && pqr?.description) {
        const match = pqr.description.match(/•\s*Producto:\s*([^\n\r]+)/i);
        if (match) prodName = match[1].trim();
    }
    if (!prodName) {
        prodName = 'Producto agrícola';
    }

    let ncAmount = 0;
    if (pqr?.resolution_notes) {
        const valMatch = pqr.resolution_notes.match(/Valor Acreditado a Favor del Cliente:\s*\$([\d.]+)/i) ||
                         pqr.resolution_notes.match(/Nuevo Total Final:.*\(-\$([\d.]+)\)/i) ||
                         pqr.resolution_notes.match(/Total Final:.*\(-\$([\d.]+)\)/i);
        if (valMatch) ncAmount = parseInt(valMatch[1].replace(/\./g, ''), 10);
    }
    if (!ncAmount) {
        const rcaMeta = parseRcaFromRecord(pqr || {});
        if ((rcaMeta as any).deductionAmount) ncAmount = Number((rcaMeta as any).deductionAmount);
    }
    if (!ncAmount && (ret as any)?.calculated_amount) {
        ncAmount = Number((ret as any).calculated_amount);
    }

    return { prodName, ncAmount };
}

export default function BillingDashboard() {
    const [cuts, setCuts] = useState<BillingCut[]>([]);
    const [returns, setReturns] = useState<BillingReturn[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [parentProfilesMap, setParentProfilesMap] = useState<Map<string, any>>(new Map());
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'invoicing' | 'portfolio' | 'configuration'>('invoicing');
    const [subTab, setSubTab] = useState<'pending' | 'batch_accumulated' | 'cuts' | 'returns'>('pending');
    const [returnsViewMode, setReturnsViewMode] = useState<'credit_notes' | 'pending_review' | 'all'>('credit_notes');
    const [batchAccumulatedOrders, setBatchAccumulatedOrders] = useState<any[]>([]);
    const [batchAccumulatedCount, setBatchAccumulatedCount] = useState<number>(0);
    const [batchClientFilter, setBatchClientFilter] = useState<string>('all');
    const [batchStartDate, setBatchStartDate] = useState<string>('');
    const [batchEndDate, setBatchEndDate] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

    // Toast Notification & Action Confirmation States (Poka-Yoke Zero-Alert Standard)
    const [toasts, setToasts] = useState<Array<{ id: string; type: 'success' | 'error' | 'warning' | 'info'; title?: string; message: string }>>([]);
    const [confirmBatchLiquidation, setConfirmBatchLiquidation] = useState(false);
    const [previewCutPokaYokeError, setPreviewCutPokaYokeError] = useState<string | null>(null);

    const showToast = useCallback((toast: { type: 'success' | 'error' | 'warning' | 'info'; title?: string; message: string }) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev.slice(-3), { ...toast, id }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    useEffect(() => {
        if (toasts.length > 0) {
            const first = toasts[0];
            const timer = setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== first.id));
            }, first.type === 'error' ? 8000 : 5000);
            return () => clearTimeout(timer);
        }
    }, [toasts]);

    // Global Search & Date Filters
    const [billingSearchQuery, setBillingSearchQuery] = useState('');
    const [includeAllStatuses, setIncludeAllStatuses] = useState(true);
    const [graceMinutes, setGraceMinutes] = useState<number>(120);
    const [cutCloseTime, setCutCloseTime] = useState<string>('17:00');
    const [pendingStatusFilter, setPendingStatusFilter] = useState<'all' | 'ready' | 'grace' | 'in_route' | 'novelties' | 'in_process'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'sequence_id', direction: 'desc' });
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

    // Escenario 221: Modal de Asignación de Precios Fuera de Acuerdo ($0 Remisiones del Día)
    const [isAssignPriceModalOpen, setIsAssignPriceModalOpen] = useState(false);
    const [loadingAssignPriceOrders, setLoadingAssignPriceOrders] = useState(false);
    const [savingAssignPrices, setSavingAssignPrices] = useState(false);
    const [assignPriceOrders, setAssignPriceOrders] = useState<any[]>([]);
    const [assignPriceSkuInputs, setAssignPriceSkuInputs] = useState<Record<string, string>>({});
    const [assignPriceItemInputs, setAssignPriceItemInputs] = useState<Record<string, string>>({});
    const [assignPriceTargetOrderId, setAssignPriceTargetOrderId] = useState<string | null>(null);

    const toggleOrderSelection = (id: string) => {
        setSelectedOrderIds(prev =>
            prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
        );
    };

    const selectAllVisibleOrders = () => {
        const visibleIds = filteredPendingOrders.map(o => o.id);
        setSelectedOrderIds(visibleIds);
    };

    const selectReadyOrders = () => {
        const readyIds = pendingOrders
            .filter(o => {
                const st = getOrderGraceInfo(o, graceMinutes, cutCloseTime).statusType;
                return st === 'ready' || st === 'resolved_novelty';
            })
            .map(o => o.id);
        setSelectedOrderIds(readyIds);
    };

    const clearOrderSelection = () => {
        setSelectedOrderIds([]);
    };

    const handleSort = (key: string) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const getBogotaDate = (offsetDays: number = 0) => {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(d);
    };

    const [selectedBillingDate, setSelectedBillingDate] = useState<string>(getBogotaDate(0));
    const { profile, loading: authLoading } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);
    const [permissionsLoaded, setPermissionsLoaded] = useState(false);
    const [hasInvoicingAccess, setHasInvoicingAccess] = useState(false);
    const [hasPortfolioAccess, setHasPortfolioAccess] = useState(false);
    const [hasConfigAccess, setHasConfigAccess] = useState(false);

    useEffect(() => {
        const loadRolesAndCheckPerms = async () => {
            try {
                const { data, error } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .eq('key', 'system_roles')
                    .single();

                let parsedRoles: any[] = [];
                if (!error && data && data.value) {
                    try {
                        parsedRoles = JSON.parse(data.value);
                        setRoles(parsedRoles);
                    } catch (parseErr) {
                        console.error('Error parsing system_roles in Billing page:', parseErr);
                    }
                }

                // Jerarquía canónica de permisos (PermissionTreeEditor & Roles)
                const canInvoicing = 
                    checkUserPermission(profile, 'admin.commercial.billing.invoicing', parsedRoles) ||
                    checkUserPermission(profile, 'admin.commercial.billing', parsedRoles) ||
                    checkUserPermission(profile, 'admin.commercial', parsedRoles) ||
                    checkUserPermission(profile, 'billing_invoicing_access', parsedRoles) ||
                    checkUserPermission(profile, 'billing', parsedRoles);

                const canPortfolio = 
                    checkUserPermission(profile, 'admin.commercial.billing.portfolio', parsedRoles) ||
                    checkUserPermission(profile, 'admin.commercial.billing', parsedRoles) ||
                    checkUserPermission(profile, 'admin.commercial', parsedRoles) ||
                    checkUserPermission(profile, 'billing_portfolio_access', parsedRoles) ||
                    checkUserPermission(profile, 'billing', parsedRoles);

                const canConfig = 
                    checkUserPermission(profile, 'admin.commercial.billing.config', parsedRoles) ||
                    checkUserPermission(profile, 'admin.commercial.billing', parsedRoles) ||
                    checkUserPermission(profile, 'admin.commercial', parsedRoles) ||
                    checkUserPermission(profile, 'billing_config_access', parsedRoles);

                setHasInvoicingAccess(canInvoicing);
                setHasPortfolioAccess(canPortfolio);
                setHasConfigAccess(canConfig);

                if (!canInvoicing) {
                    if (canPortfolio) {
                        setActiveTab('portfolio');
                    } else if (canConfig) {
                        setActiveTab('configuration');
                    }
                }
            } catch (e) {
                console.error('Error loading roles in Billing page:', e);
            } finally {
                setPermissionsLoaded(true);
            }
        };

        if (profile) {
            loadRolesAndCheckPerms();
        } else if (!authLoading) {
            setPermissionsLoaded(true);
        }
    }, [profile, authLoading]);

    // Sequences & Configuration State (COM-29)
    const [invoicePrefix, setInvoicePrefix] = useState('SETT');
    const [invoiceNextNumber, setInvoiceNextNumber] = useState(10003);
    const [ncPrefix, setNcPrefix] = useState('NC');
    const [ncNextNumber, setNcNextNumber] = useState(1);
    const [resolutionNumber, setResolutionNumber] = useState('18764000001');
    const [resolutionDate, setResolutionDate] = useState('2026-01-15');
    const [rangeFrom, setRangeFrom] = useState(1);
    const [rangeTo, setRangeTo] = useState(50000);
    const [savingConfig, setSavingConfig] = useState(false);

    // Cut Preview Modal State
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [previewSlot, setPreviewSlot] = useState<'AM' | 'PM' | 'ADJ'>('AM');
    const [previewOrders, setPreviewOrders] = useState<CutPreviewOrder[]>([]);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Order Detail Inspection Modal State (COM-26)
    const [selectedOrderDetail, setSelectedOrderDetail] = useState<any | null>(null);
    const [loadingOrderDetailItems, setLoadingOrderDetailItems] = useState(false);
    const [orderDetailItems, setOrderDetailItems] = useState<any[]>([]);
    const [orderDetailReturns, setOrderDetailReturns] = useState<any[]>([]);
    const [orderDetailPqrs, setOrderDetailPqrs] = useState<any[]>([]);
    const [selectedNoveltyDetail, setSelectedNoveltyDetail] = useState<any | null>(null);

    // World Office Credit Note Integration State (Opción B)
    const [woModalOpen, setWoModalOpen] = useState(false);
    const [woTargetOrder, setWoTargetOrder] = useState<any | null>(null);
    const [woTargetReturn, setWoTargetReturn] = useState<any | null>(null);
    const [woTargetPqr, setWoTargetPqr] = useState<any | null>(null);
    const [woFolioInput, setWoFolioInput] = useState('');
    const [woNotesInput, setWoNotesInput] = useState('');
    const [woSubmitting, setWoSubmitting] = useState(false);
    const [woCopiedOrderId, setWoCopiedOrderId] = useState<string | null>(null);

    const resolveItemNoveltyInfo = (
        item: any,
        returnsList: any[],
        pqrsList: any[]
    ) => {
        const prodId = item.product_id || item.products?.id;
        const prodName = (item.products?.name || item.nickname || '').toLowerCase().trim();
        const cleanName = prodName.replace(/\s*\([^)]*\)/g, '').trim();
        const words = cleanName.split(/\s+/).filter((w: string) => w.length > 3);

        // 1. Check matching return
        const matchedReturn = returnsList.find(r => 
            (prodId && r.product_id === prodId) ||
            (r.products?.name && r.products.name.toLowerCase().trim() === cleanName) ||
            (r.reason && (r.reason.toLowerCase().includes(cleanName) || words.some((w: string) => r.reason.toLowerCase().includes(w))))
        );

        // 2. Check matching PQR (checking subject, description and resolution_notes)
        const matchedPqr = pqrsList.find(p => 
            (p.subject && (p.subject.toLowerCase().includes(cleanName) || words.some((w: string) => p.subject.toLowerCase().includes(w)))) ||
            (p.description && (p.description.toLowerCase().includes(cleanName) || words.some((w: string) => p.description.toLowerCase().includes(w)))) ||
            (p.resolution_notes && (p.resolution_notes.toLowerCase().includes(cleanName) || words.some((w: string) => p.resolution_notes.toLowerCase().includes(w)))) ||
            (matchedReturn?.reason && p.id && matchedReturn.reason.includes(p.id.substring(0, 8)))
        );

        if (!matchedReturn && !matchedPqr) return null;

        // Quantity returned / claimed (check return, resolution_notes lines, or description)
        let qtyClaimed = Number(matchedReturn?.quantity_returned) || 0;
        let totalPqrClaimed = 0;
        pqrsList.forEach(p => {
            const resNotes = p.resolution_notes || '';
            const lines = resNotes.split('\n');
            lines.forEach((l: string) => {
                if (l.trim().startsWith('•')) {
                    const lowerL = l.toLowerCase();
                    if (lowerL.includes(cleanName) || words.some((w: string) => lowerL.includes(w))) {
                        const m = l.match(/•\s*([^:]+):\s*([\d.,]+)\s*([A-Za-z]+)\s*@/i);
                        if (m) {
                            const parsed = parseFloat(m[2].replace(',', '.'));
                            if (!isNaN(parsed) && parsed > 0) {
                                totalPqrClaimed += parsed;
                            }
                        }
                    }
                }
            });
        });

        if (totalPqrClaimed > 0) {
            qtyClaimed = Math.max(qtyClaimed, totalPqrClaimed);
        }

        if (qtyClaimed === 0 && matchedPqr?.description) {
            const m = matchedPqr.description.match(/Cantidad:\s*([\d.,]+)\s*(?:Kg|kg|und|Und|Atado|atado)?/i);
            if (m) qtyClaimed = parseFloat(m[1].replace(',', '.')) || 0;
        }

        const unit = item.unit || item.products?.unit_of_measure || 'Kg';
        const notes = ((matchedPqr?.resolution_notes || '') + ' ' + (matchedReturn?.reason || '')).toLowerCase();
        const pqrStatus = matchedPqr?.status || '';
        const returnStatus = matchedReturn?.status || '';

        // Determine Scenario
        let scenarioType: 'sin_costo' | 'reposicion' | 'nota_credito' | 'ajuste_factura' | 'pendiente' = 'pendiente';
        let badgeText = '';
        let badgeBg = '#FEF3C7';
        let badgeColor = '#92400E';
        let badgeBorder = '#FDE68A';
        let invoiceInstruction = '';
        let resolutionTitle = '';

        if (
            returnStatus === 'rejected' ||
            pqrStatus === 'rejected' ||
            notes.includes('cerrado conforme') ||
            notes.includes('rechazo de solicitud') ||
            notes.includes('desestimado') ||
            notes.includes('sin costo') ||
            notes.includes('se factura 100%')
        ) {
            scenarioType = 'sin_costo';
            resolutionTitle = 'Cerrado Conforme / Desestimado sin Costo';
            badgeText = `Reclamo ${qtyClaimed} ${unit}: Cerrado Conforme • Facturar 100% Original`;
            badgeBg = '#ECFDF5';
            badgeColor = '#065F46';
            badgeBorder = '#A7F3D0';
            invoiceInstruction = `Calidad desestimó la afectación comercial por entrega conforme al estándar acordado. Facturar los ${item.quantity} ${unit} completos sin aplicar notas crédito ni deducciones.`;
        } else if (
            notes.includes('ajuste de factura') ||
            notes.includes('ajuste en factura')
        ) {
            scenarioType = 'ajuste_factura';
            resolutionTitle = 'Ajuste Directo en Factura Autorizado';
            badgeText = `Reclamo ${qtyClaimed} ${unit}: Ajuste Autorizado • Descontar en Factura`;
            badgeBg = '#FEF2F2';
            badgeColor = '#991B1B';
            badgeBorder = '#FECACA';
            const remainingQty = Math.max(0, Number(item.quantity || 0) - qtyClaimed);
            invoiceInstruction = `Calidad autorizó descontar ${qtyClaimed} ${unit} de este ítem en la factura. Facturar únicamente ${remainingQty} ${unit}.`;
        } else if (
            notes.includes('nota crédito') ||
            notes.includes('nota credito') ||
            notes.includes('saldo a favor')
        ) {
            scenarioType = 'nota_credito';
            resolutionTitle = 'Nota Crédito / Saldo a Favor Emitido';
            badgeText = `Reclamo ${qtyClaimed} ${unit}: NC Emitida • Facturar 100% Original`;
            badgeBg = '#EFF6FF';
            badgeColor = '#1E40AF';
            badgeBorder = '#BFDBFE';
            invoiceInstruction = `Calidad emitió Nota Crédito por separado para compensar los ${qtyClaimed} ${unit}. La factura actual debe emitirse por el 100% (${item.quantity} ${unit}).`;
        } else if (
            notes.includes('reposición') ||
            notes.includes('reposicion') ||
            notes.includes('reponer d+1')
        ) {
            scenarioType = 'reposicion';
            resolutionTitle = 'Reposición Física D+1 Programada ($0 COP)';
            badgeText = `Reclamo ${qtyClaimed} ${unit}: Reposición D+1 • Facturar 100% Original`;
            badgeBg = '#FAF5FF';
            badgeColor = '#6B21A8';
            badgeBorder = '#E9D5FF';
            invoiceInstruction = `Calidad programó la reposición física de ${qtyClaimed} ${unit} a costo $0 para la siguiente ruta. La factura actual debe cobrarse al 100% original (${item.quantity} ${unit}).`;
        } else {
            scenarioType = 'pendiente';
            resolutionTitle = 'En Trámite de Auditoría por Calidad';
            badgeText = `Reclamo ${qtyClaimed || ''} ${unit}: En Auditoría SAC • Pendiente Dictamen`;
            badgeBg = '#FEF3C7';
            badgeColor = '#92400E';
            badgeBorder = '#FDE68A';
            invoiceInstruction = `El reclamo se encuentra en gestión activa por el equipo de Calidad y SAC. Verificar antes de cerrar la factura definitiva.`;
        }

        // Photo evidence
        const photoUrl = matchedReturn?.photo_url || matchedPqr?.primary_photo_url || (matchedPqr?.additional_photos && matchedPqr.additional_photos[0]) || null;

        // Reason & Motive
        const clientMotive = matchedPqr?.description || matchedReturn?.reason || 'Reclamación registrada por cliente en recepción de entrega.';

        // Sanitary Disposition
        const sanitaryDisposition = (() => {
            const raw = matchedPqr?.resolution_notes || '';
            const m = raw.match(/\[DISPOSICIÓN SANITARIA:\s*([^\]]+)\]/i);
            return m ? m[1].trim() : 'Disposición estándar de Calidad';
        })();

        // Quality concept
        const qualityConcept = (() => {
            const raw = matchedPqr?.resolution_notes || '';
            const m = raw.match(/\[CONCEPTO:\s*([^\]]+)\]/i);
            return m ? m[1].trim() : (matchedReturn?.notes || 'Verificado por SAC');
        })();

        // QC Auditor Justification / Detalle Técnico del Auditor
        const rcaData = matchedPqr ? parseRcaFromRecord(matchedPqr) : null;
        const rawPqrNotes = matchedPqr?.resolution_notes || '';
        const qcJustification = cleanHumanResolutionNotes(rawPqrNotes) || matchedReturn?.notes || '';
        const auditedBy = rcaData?.auditedBy || (matchedPqr as any)?.assigned_to || null;

        return {
            productName: item.products?.name || item.nickname || 'Producto',
            qtyClaimed,
            totalQty: item.quantity,
            unit,
            unitPrice: item.unit_price,
            scenarioType,
            resolutionTitle,
            badgeText,
            badgeBg,
            badgeColor,
            badgeBorder,
            invoiceInstruction,
            clientMotive,
            photoUrl,
            sanitaryDisposition,
            qualityConcept,
            qcJustification,
            auditedBy,
            pqr: matchedPqr,
            ret: matchedReturn
        };
    };

    const handleOpenOrderDetail = async (order: any) => {
        setSelectedOrderDetail(order);
        setLoadingOrderDetailItems(true);
        setSelectedNoveltyDetail(null);
        try {
            const [itemsRes, returnsRes, pqrsRes] = await Promise.all([
                supabase
                    .from('order_items')
                    .select(`
                        id, product_id, quantity, unit_price, unit, variant_label, nickname, selected_options,
                        products (
                            id, name, sku, unit_of_measure, iva_rate
                        )
                    `)
                    .eq('order_id', order.id)
                    .order('id'),
                supabase
                    .from('billing_returns')
                    .select(`
                        id, product_id, quantity_returned, reason, status, photo_url, notes, created_at,
                        products (id, name, sku)
                    `)
                    .eq('order_id', order.id),
                supabase
                    .from('customer_service_pqrs')
                    .select(`
                        id, client_id, order_id, type, category, subject, description,
                        primary_photo_url, additional_photos, status, priority,
                        created_at, resolved_at, resolution_notes
                    `)
                    .eq('order_id', order.id)
            ]);

            if (itemsRes.error) throw itemsRes.error;
            setOrderDetailItems(itemsRes.data || []);
            setOrderDetailReturns(returnsRes.data || []);
            setOrderDetailPqrs(pqrsRes.data || []);
        } catch (err) {
            console.error('Error fetching order detail items:', err);
        } finally {
            setLoadingOrderDetailItems(false);
        }
    };

    // Portfolio Subtab (Invoices vs Dossiers)
    const [portfolioSubTab, setPortfolioSubTab] = useState<'invoices' | 'dossiers'>('invoices');
    const [portfolioStatusFilter, setPortfolioStatusFilter] = useState<'all' | 'al_dia' | 'vencido_1_15' | 'vencido_16_30' | 'vencido_30_mas' | 'paid'>('all');
    const [dossierStatusFilter, setDossierStatusFilter] = useState<'all' | 'aprobado' | 'radicado' | 'pendiente'>('all');
    const [b2bClients, setB2bClients] = useState<any[]>([]);
    const [dossiersDataMap, setDossiersDataMap] = useState<Record<string, any>>({});
    const [dossiersSearchTerm, setDossiersSearchTerm] = useState('');
    const [selectedB2bClient, setSelectedB2bClient] = useState<any>(null);
    const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
    const [isSavingDossier, setIsSavingDossier] = useState(false);
    const [activeDossierSection, setActiveDossierSection] = useState<'general' | 'contacts' | 'financial' | 'references' | 'negociacion' | 'codeudores'>('general');
    const [isRegisteringNewClient, setIsRegisteringNewClient] = useState(false);
    const [selectedB2bClientAssocId, setSelectedB2bClientAssocId] = useState('');

    const initialDossierForm = {
        profile_id: '',
        agencia: false,
        supermercado: false,
        ciudad: '',
        cupo_solicitado: 0,
        plazo_solicitado: 0,
        fecha_solicitud: new Date().toISOString().split('T')[0],
        tipo_solicitud: 'creacion',
        razon_social: '',
        nombre_comercial: '',
        nit: '',
        direccion: '',
        ciudad_info: '',
        departamento_info: '',
        telefono: '',
        actividad_economica_principal: '',
        ciiu_principal: '',
        actividad_economica_secundaria: '',
        ciiu_secundario: '',
        rep_legal_nombre: '',
        rep_legal_identificacion: '',
        rep_legal_direccion: '',
        rep_legal_telefono: '',
        rep_legal_celular: '',
        rep_legal_email: '',
        rep_legal_es_pep: false,
        sucursales_a_crear: ['', '', '', '', '', ''],
        contactos: [
            { area: 'Compras/pedidos', nombre: '', telefono: '', celular: '', email: '' },
            { area: 'Contabilidad/tesoreria', nombre: '', telefono: '', celular: '', email: '' },
            { area: 'Oficial de Cumplimiento', nombre: '', telefono: '', celular: '', email: '' }
        ],
        participacion_accionaria: [
            { nombre: '', tipo_id: 'CC', numero_id: '', participacion_pct: 0, es_pep: false }
        ],
        realiza_operaciones_internacionales: false,
        operaciones_internacionales_detalle: { transferencias: false, importaciones: false, exportaciones: false, inversiones: false, giros: false, pago_servicio: false, otros: '' },
        tiene_productos_financieros_internacionales: false,
        productos_financieros_internacionales_detalle: { productos: [] },
        tipo_contribuyente: 'persona_juridica',
        clase_contribuyente: { gran_contribuyente: false, auto_retenedor: false, regimen_comun: false, regimen_simplificado: false, sin_animo_lucro: false, regimen_especial: false, regimen_simple: false, no_contribuyente: false, no_responsable: false },
        codigo_ica: '',
        tarifa_ica: '',
        referencias_comerciales: [
            { entidad: '', telefono: '', cupo: 0, plazo: 0 },
            { entidad: '', telefono: '', cupo: 0, plazo: 0 }
        ],
        referencias_personales: [
            { nombre: '', direccion: '', ciudad: '', celular: '' },
            { nombre: '', direccion: '', ciudad: '', celular: '' }
        ],
        condiciones_pago: { forma_pago: 'transferencia', banco: '', tipo_cuenta: 'corriente', numero_cuenta: '', certificacion_bancaria: false },
        aprobacion_empresa: { cupo_aprobado: 0, plazo_aprobado: 0, fecha_aprobacion: '', aprobado_por: '', observaciones: '' },
        pagare_firma_deudor: { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' },
        pagare_firma_codeudor: { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' },
    };

    const [dossierForm, setDossierForm] = useState(initialDossierForm);

    const fetchDossiersData = async () => {
        try {
            const { data: clients, error: clientsErr } = await supabase
                .from('profiles')
                .select('id, company_name, razon_social, nit, address, city, department, municipality, phone, contact_name, contact_phone, email, role')
                .in('role', ['b2b_client', 'b2b_lead', 'client'])
                .order('company_name', { ascending: true });

            if (clientsErr) throw clientsErr;
            setB2bClients(clients || []);

            const { data: dossiers, error: dossiersErr } = await supabase
                .from('client_credit_dossiers')
                .select('*');

            if (dossiersErr) throw dossiersErr;
            const map: Record<string, any> = {};
            (dossiers || []).forEach(d => {
                map[d.profile_id] = d;
            });
            setDossiersDataMap(map);
        } catch (e) {
            console.error('Error fetching dossiers data:', e);
        }
    };

    useEffect(() => {
        if (activeTab === 'portfolio' && portfolioSubTab === 'dossiers') {
            fetchDossiersData();
        }
    }, [activeTab, portfolioSubTab]);

    const handleOpenDossierModal = (client: any) => {
        const existing = dossiersDataMap[client.id];
        if (existing) {
            setDossierForm({
                ...initialDossierForm,
                ...existing,
                profile_id: client.id,
                contactos: existing.contactos || initialDossierForm.contactos,
                participacion_accionaria: existing.participacion_accionaria || initialDossierForm.participacion_accionaria,
                operaciones_internacionales_detalle: existing.operaciones_internacionales_detalle || initialDossierForm.operaciones_internacionales_detalle,
                productos_financieros_internacionales_detalle: existing.productos_financieros_internacionales_detalle || initialDossierForm.productos_financieros_internacionales_detalle,
                clase_contribuyente: existing.clase_contribuyente || initialDossierForm.clase_contribuyente,
                referencias_comerciales: existing.referencias_comerciales || initialDossierForm.referencias_comerciales,
                referencias_personales: existing.referencias_personales || initialDossierForm.referencias_personales,
                condiciones_pago: existing.condiciones_pago || initialDossierForm.condiciones_pago,
                pagare_firma_deudor: existing.pagare_firma_deudor || { ...initialDossierForm.pagare_firma_deudor, nombre: client.contact_name || '', identificacion: client.nit || '', direccion: client.address || '', celular: client.contact_phone || '', email: client.email || '' },
                pagare_firma_codeudor: existing.pagare_firma_codeudor || initialDossierForm.pagare_firma_codeudor,
            });
        } else {
            setDossierForm({
                ...initialDossierForm,
                profile_id: client.id,
                razon_social: client.razon_social || client.company_name || '',
                nombre_comercial: client.company_name || '',
                nit: client.nit || '',
                direccion: client.address || '',
                ciudad: client.city || '',
                ciudad_info: client.city || '',
                departamento_info: client.department || '',
                telefono: client.phone || client.contact_phone || '',
                rep_legal_nombre: client.contact_name || '',
                rep_legal_email: client.email || '',
                rep_legal_celular: client.contact_phone || '',
                pagare_firma_deudor: {
                    nombre: client.contact_name || '',
                    identificacion: client.nit || '',
                    direccion: client.address || '',
                    barrio: client.municipality || '',
                    celular: client.contact_phone || '',
                    telefono: client.phone || '',
                    email: client.email || ''
                }
            });
        }
        
        setSelectedB2bClient(client);
        setIsDossierModalOpen(true);
        setActiveDossierSection('general');
    };

    const handleCreateNewDossier = () => {
        setDossierForm({
            ...initialDossierForm,
            profile_id: 'new',
            razon_social: '',
            nombre_comercial: '',
            nit: '',
            direccion: '',
            ciudad: '',
            ciudad_info: '',
            departamento_info: '',
            telefono: '',
            rep_legal_nombre: '',
            rep_legal_email: '',
            rep_legal_celular: '',
            pagare_firma_deudor: { nombre: '', identificacion: '', direccion: '', barrio: '', celular: '', telefono: '', email: '' }
        });
        setSelectedB2bClient({ id: 'new', company_name: 'Nuevo Cliente', nit: '' });
        setIsRegisteringNewClient(false);
        setSelectedB2bClientAssocId('');
        setIsDossierModalOpen(true);
        setActiveDossierSection('general');
    };

    const handleSaveDossier = async () => {
        setIsSavingDossier(true);
        try {
            let targetProfileId = selectedB2bClient.id;

            if (selectedB2bClient.id === 'new') {
                if (!isRegisteringNewClient) {
                    if (!selectedB2bClientAssocId) {
                        showToast({ type: 'warning', message: 'Por favor selecciona un cliente B2B existente.' });
                        setIsSavingDossier(false);
                        return;
                    }
                    targetProfileId = selectedB2bClientAssocId;
                } else {
                    if (!dossierForm.nombre_comercial || !dossierForm.nit) {
                        showToast({ type: 'warning', message: 'Por favor completa el Nombre Comercial y NIT del nuevo cliente.' });
                        setIsSavingDossier(false);
                        return;
                    }
                    // Create new profile
                    const { data: newProfile, error: profileErr } = await supabase
                        .from('profiles')
                        .insert([{
                            role: 'b2b_client',
                            company_name: dossierForm.nombre_comercial,
                            razon_social: dossierForm.razon_social || dossierForm.nombre_comercial,
                            nit: dossierForm.nit,
                            address: dossierForm.direccion,
                            city: dossierForm.ciudad_info,
                            department: dossierForm.departamento_info,
                            phone: dossierForm.telefono,
                            contact_name: dossierForm.rep_legal_nombre,
                            contact_phone: dossierForm.rep_legal_celular,
                            email: dossierForm.rep_legal_email,
                            profile_type: 'employee',
                            is_active: true
                        }])
                        .select('id')
                        .single();
                    
                    if (profileErr) throw profileErr;
                    if (!newProfile) throw new Error('No se pudo crear el perfil del cliente.');
                    targetProfileId = newProfile.id;
                }
            }

            const { error } = await supabase
                .from('client_credit_dossiers')
                .upsert({
                    ...dossierForm,
                    profile_id: targetProfileId,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'profile_id' });

            if (error) throw error;
            
            showToast({ type: 'success', message: 'Formulario de crédito guardado exitosamente.' });
            setIsDossierModalOpen(false);
            fetchDossiersData();
        } catch (err: any) {
            console.error('Error saving dossier:', err);
            showToast({ type: 'error', message: `Error al guardar el formulario: ${err.message}` });
        } finally {
            setIsSavingDossier(false);
        }
    };

    const [isRefreshingRealtime, setIsRefreshingRealtime] = useState(false);
    const [lastRealtimeSync, setLastRealtimeSync] = useState<string>('');

    // Central Data Fetching
    const fetchData = useCallback(async (silentOrEvent?: boolean | React.MouseEvent) => {
        const silent = silentOrEvent === true;
        if (!silent) {
            setLoading(true);
        } else {
            setIsRefreshingRealtime(true);
        }
        try {
            // 1. Fetch cuts
            const { data: cutsData, error: cutsError } = await supabase
                .from('billing_cuts')
                .select('*')
                .order('created_at', { ascending: false });
            if (cutsError) throw cutsError;
            setCuts(cutsData || []);

            // 2. Fetch returns (both pending_review and approved for full credit note reconciliation)
            const { data: returnsData, error: returnsError } = await supabase
                .from('billing_returns')
                .select(`
                    *,
                    products (id, name, sku, unit_of_measure),
                    orders (
                        id,
                        sequence_id,
                        created_at,
                        delivery_date,
                        total,
                        admin_notes,
                        profiles (
                            id,
                            company_name,
                            razon_social,
                            nit,
                            parent_id
                        ),
                        customer_service_pqrs (
                            id,
                            type,
                            category,
                            subject,
                            description,
                            status,
                            resolution_notes,
                            created_at
                        )
                    )
                `)
                .in('status', ['approved', 'pending_review'])
                .order('created_at', { ascending: false });
            if (returnsError) throw returnsError;
            setReturns(returnsData || []);

            // 3. Fetch invoices with profile data
            const { data: invoicesData, error: invoicesError } = await supabase
                .from('billing_invoices')
                .select(`
                    *,
                    orders:orders!billing_invoices_order_id_fkey (
                        sequence_id,
                        created_at,
                        profiles (
                            company_name,
                            razon_social,
                            nit,
                            payment_days,
                            parent_id,
                            role
                        )
                    )
                `)
                .order('created_at', { ascending: false });
            if (invoicesError) throw invoicesError;
            setInvoices(invoicesData || []);

            // 4. Fetch pending orders (orders without billing cut)
            let pOrdersQuery = supabase
                .from('orders')
                .select(`
                    id, sequence_id, created_at, delivery_date, delivery_slot, total, subtotal, tax, status, type, special_notes, admin_notes, purchase_order_number, payment_method, payment_status, shipping_address, logistics_data,
                    profiles:profile_id (
                        id, company_name, razon_social, nit, payment_days, iva_responsible, print_invoice, document_type, remission_with_prices, address, phone, role, parent_id, is_corporate_parent, preferred_payment_method, delivery_restrictions, logistics_data
                    ),
                    order_items (
                        count
                    ),
                    billing_returns (
                        id, quantity_returned, status, reason, notes, credit_note_number, reference_invoice_number, product_id,
                        products:product_id ( id, name, sku )
                    ),
                    customer_service_pqrs (
                        id, type, category, status, priority, subject, description, created_at, resolved_at, resolution_notes
                    )
                `)
                .is('billing_cut_id', null)
                .order('created_at', { ascending: false });

            if (includeAllStatuses) {
                pOrdersQuery = pOrdersQuery.in('status', ['delivered', 'shipped', 'picking', 'approved', 'para_compra', 'pending_approval', 'recibido', 'ready_for_dispatch', 'in_transit']);
            } else {
                pOrdersQuery = pOrdersQuery.eq('status', 'delivered');
            }

            if (selectedBillingDate && selectedBillingDate !== 'all') {
                pOrdersQuery = pOrdersQuery.eq('delivery_date', selectedBillingDate);
            }

            const { data: pOrdersData, error: pOrdersErr } = await pOrdersQuery;
            if (!pOrdersErr && pOrdersData) {
                // Si la fecha seleccionada fue 'Hoy' y no hay pedidos pendientes:
                // 1. Verificar si 'Mañana' (tanda activa D+1) tiene pedidos por facturar
                // 2. Si no, verificar si 'Ayer' tiene pedidos pendientes rezagados
                if (pOrdersData.length === 0 && selectedBillingDate === getBogotaDate(0)) {
                    const { data: tomorrowOrders } = await supabase
                        .from('orders')
                        .select('id')
                        .is('billing_cut_id', null)
                        .eq('delivery_date', getBogotaDate(1))
                        .limit(1);
                    if (tomorrowOrders && tomorrowOrders.length > 0) {
                        setSelectedBillingDate(getBogotaDate(1));
                        return;
                    }

                    const { data: yesterdayOrders, error: yErr } = await supabase
                        .from('orders')
                        .select('id')
                        .is('billing_cut_id', null)
                        .eq('delivery_date', getBogotaDate(-1))
                        .limit(1);
                    if (!yErr && yesterdayOrders && yesterdayOrders.length > 0) {
                        setSelectedBillingDate(getBogotaDate(-1));
                        return;
                    }
                }

                // Escenario 252: Separar pedidos por Lote Acumulado vs Pendientes Diarios
                const { data: allUnbilledOrders } = await supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, created_at, delivery_date, delivery_slot, total, subtotal, tax, status, type, special_notes, admin_notes, purchase_order_number, payment_method, payment_status, shipping_address, logistics_data, invoice_id,
                        profiles:profile_id (
                            id, company_name, razon_social, nit, payment_days, iva_responsible, print_invoice, document_type, remission_with_prices, address, phone, role, parent_id, is_corporate_parent, preferred_payment_method, delivery_restrictions, logistics_data
                        ),
                        order_items (
                            count
                        ),
                        billing_returns (
                            id, quantity_returned, status, reason, notes, credit_note_number, reference_invoice_number, product_id,
                            products:product_id ( id, name, sku )
                        ),
                        customer_service_pqrs (
                            id, type, category, status, priority, subject, description, created_at, resolved_at, resolution_notes
                        )
                    `)
                    .is('billing_cut_id', null)
                    .is('invoice_id', null)
                    .order('delivery_date', { ascending: false });

                const accumulatedOrders = (allUnbilledOrders || []).filter((o: any) => 
                    o.logistics_data?.is_batch_accumulated === true || o.profiles?.document_type === 'batch_remission'
                );
                setBatchAccumulatedOrders(accumulatedOrders);
                setBatchAccumulatedCount(accumulatedOrders.length);

                const dailyOrders = (pOrdersData || []).filter((o: any) => 
                    !o.logistics_data?.is_batch_accumulated && o.profiles?.document_type !== 'batch_remission'
                );
                setPendingOrders(dailyOrders as any[]);
                setPendingOrdersCount(dailyOrders.length);

                // Fetch parent profiles for branch inheritance
                const parentIds = Array.from(new Set((pOrdersData as any[]).map((o: any) => o.profiles?.parent_id).filter(Boolean)));
                if (parentIds.length > 0) {
                    const { data: parentsData } = await supabase
                        .from('profiles')
                        .select('id, company_name, razon_social, nit, payment_days, print_invoice, document_type, remission_with_prices, preferred_payment_method')
                        .in('id', parentIds);
                    if (parentsData) {
                        const newMap = new Map();
                        parentsData.forEach((p: any) => newMap.set(p.id, p));
                        setParentProfilesMap(newMap);
                    }
                }
            }

            // 5. Fetch billing sequence settings from app_settings (COM-29)
            const { data: settingsData } = await supabase
                .from('app_settings')
                .select('key, value')
                .in('key', [
                    'billing_invoice_prefix',
                    'billing_invoice_next_number',
                    'billing_nc_prefix',
                    'billing_nc_next_number',
                    'billing_resolution_number',
                    'billing_resolution_date',
                    'billing_range_from',
                    'billing_range_to',
                    'billing_delivery_grace_minutes',
                    'billing_cut_close_time'
                ]);

            if (settingsData) {
                settingsData.forEach(s => {
                    if (s.key === 'billing_invoice_prefix' && s.value) setInvoicePrefix(s.value);
                    if (s.key === 'billing_invoice_next_number' && s.value) setInvoiceNextNumber(Number(s.value));
                    if (s.key === 'billing_nc_prefix' && s.value) setNcPrefix(s.value);
                    if (s.key === 'billing_nc_next_number' && s.value) setNcNextNumber(Number(s.value));
                    if (s.key === 'billing_resolution_number' && s.value) setResolutionNumber(s.value);
                    if (s.key === 'billing_resolution_date' && s.value) setResolutionDate(s.value);
                    if (s.key === 'billing_range_from' && s.value) setRangeFrom(Number(s.value));
                    if (s.key === 'billing_range_to' && s.value) setRangeTo(Number(s.value));
                    if (s.key === 'billing_delivery_grace_minutes' && s.value) setGraceMinutes(Number(s.value));
                    if (s.key === 'billing_cut_close_time' && s.value) setCutCloseTime(String(s.value));
                });
            }

            setLastRealtimeSync(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } catch (err: any) {
            console.error('Error in billing fetchData:', err);
        } finally {
            setLoading(false);
            setIsRefreshingRealtime(false);
        }
    }, [selectedBillingDate, includeAllStatuses]);

    const handleOpenAssignPriceModal = useCallback(async (targetOrderId?: string, overrideDate?: string) => {
        setIsAssignPriceModalOpen(true);
        setLoadingAssignPriceOrders(true);
        setAssignPriceTargetOrderId(targetOrderId || null);
        try {
            const params = new URLSearchParams();
            const effectiveDate = overrideDate || selectedBillingDate;
            if (targetOrderId) {
                params.set('orderId', targetOrderId);
            } else if (effectiveDate && effectiveDate !== 'all') {
                params.set('date', effectiveDate);
            }
            const res = await fetch(`/api/commercial/billing/assign-off-agreement-prices?${params.toString()}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error cargando remisiones fuera de acuerdo');
            const ordersList = json.orders || [];
            setAssignPriceOrders(ordersList);

            const initialItemMap: Record<string, string> = {};
            const initialSkuMap: Record<string, string> = {};
            ordersList.forEach((o: any) => {
                (o.unpriced_items || []).forEach((it: any) => {
                    const currentVal = Number(it.unit_price || 0);
                    initialItemMap[it.id] = currentVal > 0 ? String(currentVal) : '';
                    if (it.product_id && !(it.product_id in initialSkuMap)) {
                        initialSkuMap[it.product_id] = currentVal > 0 ? String(currentVal) : '';
                    }
                });
            });
            setAssignPriceItemInputs(initialItemMap);
            setAssignPriceSkuInputs(initialSkuMap);
        } catch (err: any) {
            console.error('Error loading unpriced off-agreement orders:', err);
            showToast({ type: 'error', message: `Error cargando remisiones $0: ${err.message}` });
        } finally {
            setLoadingAssignPriceOrders(false);
        }
    }, [selectedBillingDate, showToast]);

    const handleSaveAssignedOffAgreementPrices = async () => {
        const orderIds = assignPriceOrders.map(o => o.id);
        if (orderIds.length === 0) return;

        const itemPricesPayload: Record<string, number> = {};
        let missingCount = 0;

        assignPriceOrders.forEach(o => {
            (o.unpriced_items || []).forEach((it: any) => {
                const rawItemPrice = assignPriceItemInputs[it.id];
                const rawSkuPrice = it.product_id ? assignPriceSkuInputs[it.product_id] : '';
                const parsed = Number(rawItemPrice || rawSkuPrice || 0);
                if (parsed > 0) {
                    itemPricesPayload[it.id] = parsed;
                } else {
                    missingCount++;
                }
            });
        });

        if (Object.keys(itemPricesPayload).length === 0) {
            showToast({
                type: 'warning',
                title: 'Tarifa Comercial Requerida',
                message: 'Ingresa un precio unitario mayor a $0 para al menos un SKU fuera de acuerdo antes de guardar.'
            });
            return;
        }

        if (missingCount > 0) {
            showToast({
                type: 'warning',
                title: 'Ítems Pendientes por Precio',
                message: `Aún quedan ${missingCount} ítem(s) en $0. Asigna tarifa a todos los ítems de la remisión para liberarla al corte de facturación.`
            });
            return;
        }

        setSavingAssignPrices(true);
        try {
            const res = await fetch('/api/commercial/billing/assign-off-agreement-prices', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderIds,
                    itemPrices: itemPricesPayload
                })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error al asignar precios fuera de acuerdo');

            showToast({
                type: 'success',
                title: 'Tarifa Comercial Asignada',
                message: json.message || 'Se asignaron los precios a las remisiones fuera de acuerdo sin alterar el acuerdo del cliente.'
            });
            setIsAssignPriceModalOpen(false);
            await fetchData();
        } catch (err: any) {
            console.error('Error saving assigned off-agreement prices:', err);
            showToast({ type: 'error', message: `Error al asignar precios: ${err.message}` });
        } finally {
            setSavingAssignPrices(false);
        }
    };

    // Deep-link desde Dashboard Comercial (?search=...&assign_price=1&order_id=...&date=...)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        const qSearch = params.get('search');
        const qDate = params.get('date');
        const qAssign = params.get('assign_price');
        const qOrderId = params.get('order_id');

        if (qSearch) {
            setBillingSearchQuery(qSearch);
        }
        if (qDate) {
            setSelectedBillingDate(qDate);
        }
        if (qAssign === '1') {
            setActiveTab('invoicing');
            setSubTab('pending');
            handleOpenAssignPriceModal(qOrderId || undefined, qDate || undefined);
        }
    }, [handleOpenAssignPriceModal]);

    const handleLiquidateOpenOrder = async (orderId: string) => {
        setIsProcessing(true);
        try {
            const res = await fetch('/api/commercial/billing/liquidate-open-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderId })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error al liquidar pedido');
            showToast({ type: 'success', message: json.message || 'Pedido liquidado a costo vigente exitosamente.' });
            await fetchData();
        } catch (err: any) {
            console.error('Error liquidating order:', err);
            showToast({ type: 'error', message: `Error al liquidar pedido: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleLiquidateSelectedOrAllOpenOrders = async () => {
        const targetIds = selectedOrderIds.length > 0 
            ? selectedOrderIds 
            : pendingOrders.filter(o => {
                const isOffAgreement = o.admin_notes?.includes('DESPACHADO SIN PRECIO') || o.admin_notes?.includes('SE DESPACHÓ SIN PRECIO') || (o.logistics_data?.is_off_agreement_split && !o.logistics_data?.off_agreement_priced);
                if (isOffAgreement) return false;
                return o.total === 0 || o.admin_notes?.includes('CONSUMO ABIERTO');
            }).map(o => o.id);

        if (targetIds.length === 0) {
            showToast({ type: 'info', message: 'No hay pedidos sobre lista abierta a consumo para liquidar automáticamente.' });
            return;
        }

        setIsProcessing(true);
        try {
            const res = await fetch('/api/commercial/billing/liquidate-open-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderIds: targetIds })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Error al liquidar pedidos');
            showToast({ type: 'success', message: json.message || 'Pedidos liquidados a costo vigente con éxito.' });
            await fetchData();
        } catch (err: any) {
            console.error('Error in batch liquidation:', err);
            showToast({ type: 'error', message: `Error al liquidar pedidos en lote: ${err.message}` });
        } finally {
            setIsProcessing(false);
            setConfirmBatchLiquidation(false);
        }
    };

    useEffect(() => {
        if (permissionsLoaded && (hasInvoicingAccess || hasPortfolioAccess || hasConfigAccess)) {
            fetchData();
        }
    }, [permissionsLoaded, hasInvoicingAccess, hasPortfolioAccess, hasConfigAccess, fetchData]);

    // Real-Time Synchronization (WebSockets + Tab Focus + Silent Heartbeat)
    useEffect(() => {
        if (!permissionsLoaded || !(hasInvoicingAccess || hasPortfolioAccess || hasConfigAccess)) return;

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const triggerSilentRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchData(true);
            }, 350);
        };

        const channel = supabase
            .channel('billing-live-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, triggerSilentRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_returns' }, triggerSilentRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_service_pqrs' }, triggerSilentRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_cuts' }, triggerSilentRefresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_invoices' }, triggerSilentRefresh)
            .subscribe();

        const handleFocusOrVisibility = () => {
            if (document.visibilityState === 'visible') {
                triggerSilentRefresh();
            }
        };

        window.addEventListener('focus', handleFocusOrVisibility);
        document.addEventListener('visibilitychange', handleFocusOrVisibility);

        const heartbeatInterval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchData(true);
            }
        }, 10000);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            clearInterval(heartbeatInterval);
            window.removeEventListener('focus', handleFocusOrVisibility);
            document.removeEventListener('visibilitychange', handleFocusOrVisibility);
            supabase.removeChannel(channel);
        };
    }, [permissionsLoaded, hasInvoicingAccess, hasPortfolioAccess, hasConfigAccess, fetchData]);

    // Memoized Status Counts for Pending Orders
    const pendingGraceCounts = useMemo(() => {
        let ready = 0;
        let grace = 0;
        let inRoute = 0;
        let novelties = 0;
        let inProcess = 0;

        pendingOrders.forEach(o => {
            const statusType = getOrderGraceInfo(o, graceMinutes, cutCloseTime).statusType;
            if (statusType === 'ready' || statusType === 'resolved_novelty') ready++;
            else if (statusType === 'grace') grace++;
            else if (statusType === 'in_route') inRoute++;
            else if (statusType === 'novelty') novelties++;
            else if (statusType === 'in_process') inProcess++;
        });

        return { ready, grace, inRoute, novelties, inProcess };
    }, [pendingOrders, graceMinutes, cutCloseTime]);

    const { ready: readyCount, grace: graceCount, inRoute: inRouteCount, novelties: noveltiesCount, inProcess: inProcessCount } = pendingGraceCounts;
    const unpricedOffAgreementCount = useMemo(() => {
        return pendingOrders.filter(o => {
            const rep = getOrderReplacementInfo(o);
            if (rep.isReplacement || o.origin_source === 'customer_service') return false;
            return o.admin_notes?.includes('DESPACHADO SIN PRECIO') || o.admin_notes?.includes('SE DESPACHÓ SIN PRECIO') || (o.logistics_data?.is_off_agreement_split && !o.logistics_data?.off_agreement_priced);
        }).length;
    }, [pendingOrders]);

    const openConsumptionCount = useMemo(() => {
        return pendingOrders.filter(o => {
            const { docInfo } = resolveOrderBillingInfo(o, parentProfilesMap);
            const isGiftOrReplacement = docInfo.type === 'gift_remission' || o.admin_notes?.includes('REMISIÓN DE OBSEQUIO') || o.admin_notes?.includes('REPOSICIÓN');
            if (isGiftOrReplacement) return false;
            const isOffAgreement = o.admin_notes?.includes('DESPACHADO SIN PRECIO') || o.admin_notes?.includes('SE DESPACHÓ SIN PRECIO') || (o.logistics_data?.is_off_agreement_split && !o.logistics_data?.off_agreement_priced);
            if (isOffAgreement) return false;
            return o.total === 0 || o.admin_notes?.includes('CONSUMO ABIERTO');
        }).length;
    }, [pendingOrders, parentProfilesMap]);

    // Filter & Sort Pending Orders (Excluye pedidos acumulados en lote)
    const filteredPendingOrders = useMemo(() => {
        let result = pendingOrders.filter(o => !o.logistics_data?.is_batch_accumulated && o.profiles?.document_type !== 'batch_remission');

        // 1. Universal Search Query
        if (billingSearchQuery) {
            result = result.filter(order => matchesUniversalSearch(
                order,
                billingSearchQuery,
                o => [
                    o.sequence_id ? `#${o.sequence_id}` : '',
                    getFriendlyOrderId(o),
                    o.profiles?.company_name || '',
                    o.profiles?.razon_social || '',
                    o.profiles?.nit || '',
                    o.purchase_order_number ? `OC ${o.purchase_order_number}` : '',
                    o.status || '',
                    o.delivery_slot || ''
                ],
                o => o.sequence_id
            ));
        }

        // 2. Status / Grace Filter
        if (pendingStatusFilter !== 'all') {
            result = result.filter(order => {
                const info = getOrderGraceInfo(order, graceMinutes, cutCloseTime);
                if (pendingStatusFilter === 'ready') return info.statusType === 'ready';
                if (pendingStatusFilter === 'grace') return info.statusType === 'grace';
                if (pendingStatusFilter === 'in_route') return info.statusType === 'in_route';
                if (pendingStatusFilter === 'novelties') return info.statusType === 'novelty';
                if (pendingStatusFilter === 'in_process') return info.statusType === 'in_process';
                return true;
            });
        }

        // 3. Column Sorting
        if (sortConfig.key) {
            result = [...result].sort((a, b) => {
                let valA: any = '';
                let valB: any = '';

                switch (sortConfig.key) {
                    case 'order_id':
                        valA = a.created_at ? new Date(a.created_at).getTime() : (a.sequence_id || 0);
                        valB = b.created_at ? new Date(b.created_at).getTime() : (b.sequence_id || 0);
                        break;
                    case 'invoice_seq':
                        valA = a.billing_invoices?.invoice_number || a.invoice_number || '';
                        valB = b.billing_invoices?.invoice_number || b.invoice_number || '';
                        break;
                    case 'client':
                        valA = (a.profiles?.company_name || a.profiles?.razon_social || '').toLowerCase();
                        valB = (b.profiles?.company_name || b.profiles?.razon_social || '').toLowerCase();
                        break;
                    case 'items':
                        valA = a.order_items?.[0]?.count ?? (a.order_items?.length || 0);
                        valB = b.order_items?.[0]?.count ?? (b.order_items?.length || 0);
                        break;
                    case 'novelties':
                        valA = (a.billing_returns || []).length;
                        valB = (b.billing_returns || []).length;
                        break;
                    case 'document':
                        valA = resolveOrderBillingInfo(a, parentProfilesMap).docInfo.code;
                        valB = resolveOrderBillingInfo(b, parentProfilesMap).docInfo.code;
                        break;
                    case 'grace_status':
                        valA = getOrderGraceInfo(a, graceMinutes).statusType;
                        valB = getOrderGraceInfo(b, graceMinutes).statusType;
                        break;
                    case 'total':
                        valA = Number(a.total || 0);
                        valB = Number(b.total || 0);
                        break;
                    default:
                        return 0;
                }

                if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [pendingOrders, billingSearchQuery, pendingStatusFilter, sortConfig, graceMinutes, parentProfilesMap]);

    // Filter Cuts
    const filteredCuts = useMemo(() => {
        if (!billingSearchQuery) return cuts;
        return cuts.filter(cut => matchesUniversalSearch(
            cut,
            billingSearchQuery,
            c => [
                `#${c.cut_number}`,
                c.scheduled_date || '',
                c.cut_slot || '',
                c.status || ''
            ],
            c => c.cut_number
        ));
    }, [cuts, billingSearchQuery]);

    // COM-32: Poka-Yoke — fecha bloqueada si ya tiene corte cerrado/exportado
    const isDateLockedByCut = useMemo(() => {
        if (selectedBillingDate === 'all') return false;
        return cuts.some(c =>
            c.scheduled_date === selectedBillingDate &&
            (c.status === 'closed' || c.status === 'exported')
        );
    }, [cuts, selectedBillingDate]);


    const filteredReturns = useMemo(() => {
        let baseList = returns;
        if (returnsViewMode === 'pending_review') {
            baseList = baseList.filter(r => r.status === 'pending_review');
        }
        if (!billingSearchQuery) return baseList;
        return baseList.filter(ret => matchesUniversalSearch(
            ret,
            billingSearchQuery,
            r => [
                r.orders?.sequence_id ? `#${r.orders.sequence_id}` : '',
                r.products?.name || '',
                r.reason || '',
                r.defect_category_l1 || '',
                r.status || '',
                r.orders?.profiles?.company_name || '',
                r.orders?.profiles?.razon_social || ''
            ],
            r => r.orders?.sequence_id
        ));
    }, [returns, billingSearchQuery, returnsViewMode]);

    // Consolidado diario de Novedades para Notas Crédito World Office (Gemba Accounting)
    const creditNotesItems = useMemo<CreditNoteReportItem[]>(() => {
        return returns
            .map(ret => {
                const o: any = ret.orders || {};
                const prof = o.profiles || {};
                const parent = prof.parent_id ? parentProfilesMap.get(prof.parent_id) : null;
                const clientMatriz = parent?.razon_social || parent?.company_name || prof.razon_social || prof.company_name || 'Cliente';
                const sucursal = prof.company_name || prof.razon_social || 'Sede Principal';
                const pqr = (o.customer_service_pqrs || [])[0];
                const { prodName, ncAmount } = resolveReturnProductAndAmount(ret, pqr);
                const invoiceRef = ret.reference_invoice_number || (o.sequence_id ? `FV-${o.sequence_id}` : '');
                const creditNoteFolio = ret.credit_note_number || (o.sequence_id ? `NC-${o.sequence_id}-2010` : '');
                const date = o.delivery_date || (ret.created_at ? ret.created_at.slice(0, 10) : '');
                const pqrFolio = pqr?.id ? `PQR #${pqr.id.substring(0, 8).toUpperCase()}` : '';

                return {
                    date,
                    clientMatriz,
                    sucursal,
                    productName: prodName,
                    quantity: Number(ret.quantity_returned) || 0,
                    unitOfMeasure: ret.products?.unit_of_measure || 'Kg',
                    amount: ncAmount,
                    invoiceRef,
                    creditNoteFolio,
                    pqrFolio,
                    reason: cleanHumanResolutionNotes(ret.reason || '') || (pqr?.subject || 'Novedad de calidad'),
                    orderSequence: o.sequence_id,
                    status: ret.status
                };
            })
            .filter(item => {
                const reasonLower = (item.reason || '').toLowerCase();
                return item.amount > 0 || 
                    reasonLower.includes('nota crédito') || 
                    reasonLower.includes('nota credito') || 
                    reasonLower.includes('ajuste factura') || 
                    Boolean(item.creditNoteFolio);
            });
    }, [returns, parentProfilesMap]);

    const filteredCreditNotes = useMemo(() => {
        let list = creditNotesItems;
        if (selectedBillingDate && selectedBillingDate !== 'all') {
            list = list.filter(item => item.date === selectedBillingDate);
        }
        if (billingSearchQuery) {
            list = list.filter(item => 
                matchesUniversalSearch(
                    item,
                    billingSearchQuery,
                    it => [
                        it.clientMatriz,
                        it.sucursal,
                        it.productName,
                        it.invoiceRef,
                        it.creditNoteFolio,
                        String(it.orderSequence || ''),
                        it.reason,
                        it.pqrFolio || ''
                    ]
                )
            );
        }
        return list;
    }, [creditNotesItems, selectedBillingDate, billingSearchQuery]);

    // Exportador Diario de Notas Crédito para World Office (Gemba Accounting)
    const handleExportCreditNotesExcel = async () => {
        const targetList = filteredCreditNotes.length > 0 ? filteredCreditNotes : creditNotesItems;
        if (targetList.length === 0) {
            showToast({
                type: 'warning',
                message: 'No hay novedades de notas crédito disponibles para exportar.'
            });
            return;
        }
        try {
            setIsProcessing(true);
            await downloadCreditNotesExcel(targetList, selectedBillingDate);
            showToast({
                type: 'success',
                message: `Exportadas ${targetList.length} notas crédito a Excel para World Office.`
            });
        } catch (err: any) {
            console.error('Error al exportar notas crédito:', err);
            showToast({
                type: 'error',
                message: `Error al exportar reporte NC: ${err.message}`
            });
        } finally {
            setIsProcessing(false);
        }
    };

    // Filter Invoices (Portfolio)
    const filteredInvoices = useMemo(() => {
        const today = new Date();
        today.setHours(0,0,0,0);

        return invoices.filter(inv => {
            const due = new Date(inv.due_date);
            due.setHours(0,0,0,0);
            const diffDays = Math.ceil((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
            const isPaid = inv.payment_status === 'paid';

            if (portfolioStatusFilter === 'paid') {
                if (!isPaid) return false;
            } else if (portfolioStatusFilter === 'al_dia') {
                if (isPaid || diffDays > 0) return false;
            } else if (portfolioStatusFilter === 'vencido_1_15') {
                if (isPaid || diffDays <= 0 || diffDays > 15) return false;
            } else if (portfolioStatusFilter === 'vencido_16_30') {
                if (isPaid || diffDays <= 15 || diffDays > 30) return false;
            } else if (portfolioStatusFilter === 'vencido_30_mas') {
                if (isPaid || diffDays <= 30) return false;
            }

            if (!billingSearchQuery) return true;
            return matchesUniversalSearch(
                inv,
                billingSearchQuery,
                i => [
                    i.invoice_number || '',
                    (i.orders?.profiles as any)?.company_name || '',
                    (i.orders?.profiles as any)?.razon_social || '',
                    (i.orders?.profiles as any)?.nit || '',
                    i.payment_status || '',
                    i.orders?.sequence_id ? `#${i.orders.sequence_id}` : '',
                    inv.due_date || ''
                ],
                i => i.orders?.sequence_id
            );
        });
    }, [invoices, portfolioStatusFilter, billingSearchQuery]);

    // Filter Dossiers (Portfolio)
    const filteredDossiers = useMemo(() => {
        return b2bClients.filter(client => {
            const dossier = dossiersDataMap[client.id];
            const hasDossier = !!dossier;
            const status = hasDossier ? (dossier.aprobacion_empresa?.cupo_aprobado > 0 ? 'aprobado' : 'radicado') : 'pendiente';

            if (dossierStatusFilter !== 'all' && status !== dossierStatusFilter) return false;

            if (!billingSearchQuery) return true;
            return matchesUniversalSearch(
                client,
                billingSearchQuery,
                c => [
                    c.company_name || '',
                    c.razon_social || '',
                    c.nit || '',
                    c.email || '',
                    c.phone || '',
                    c.contact_name || '',
                    status
                ],
                c => c.nit
            );
        });
    }, [b2bClients, dossiersDataMap, dossierStatusFilter, billingSearchQuery]);

    const dossierCounts = useMemo(() => {
        let aprobados = 0;
        let radicados = 0;
        let pendientes = 0;

        b2bClients.forEach(client => {
            const dossier = dossiersDataMap[client.id];
            const hasDossier = !!dossier;
            const status = hasDossier ? (dossier.aprobacion_empresa?.cupo_aprobado > 0 ? 'aprobado' : 'radicado') : 'pendiente';
            if (status === 'aprobado') aprobados++;
            else if (status === 'radicado') radicados++;
            else pendientes++;
        });

        return { aprobados, radicados, pendientes };
    }, [b2bClients, dossiersDataMap]);

    // Open Cut Preview Modal & Compute Tripartite Deductions
    const handleOpenCutPreview = async (slot: 'AM' | 'PM' | 'ADJ') => {
        setPreviewSlot(slot);
        setIsPreviewModalOpen(true);
        setLoadingPreview(true);

        try {
            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id,
                    total,
                    subtotal,
                    profile_id,
                    sequence_id,
                    created_at,
                    delivery_date,
                    admin_notes,
                    special_notes,
                    type,
                    logistics_data,
                    origin_source,
                    profiles (
                        company_name,
                        razon_social,
                        nit,
                        payment_days,
                        iva_responsible,
                        print_invoice,
                        document_type,
                        remission_with_prices,
                        parent_id,
                        role
                    )
                `);

            if (slot === 'ADJ') {
                const { data: retOrders } = await supabase
                    .from('billing_returns')
                    .select('order_id')
                    .eq('status', 'approved');
                const adjOrderIds = Array.from(new Set((retOrders || []).map(r => r.order_id).filter(Boolean)));
                if (adjOrderIds.length === 0) {
                    setPreviewOrders([]);
                    setLoadingPreview(false);
                    return;
                }
                ordersQuery = ordersQuery.in('id', adjOrderIds);
            } else {
                ordersQuery = ordersQuery.is('billing_cut_id', null);
                if (includeAllStatuses) {
                    ordersQuery = ordersQuery.in('status', ['delivered', 'shipped', 'picking', 'approved', 'para_compra', 'pending_approval', 'recibido']);
                } else {
                    ordersQuery = ordersQuery.eq('status', 'delivered');
                }
                if (selectedBillingDate && selectedBillingDate !== 'all') {
                    ordersQuery = ordersQuery.eq('delivery_date', selectedBillingDate);
                }
            }

            const { data: rawOrders, error: ordersError } = await ordersQuery;
            if (ordersError) throw ordersError;

            let targetOrders = rawOrders || [];
            if (slot !== 'ADJ' && selectedOrderIds.length > 0) {
                targetOrders = targetOrders.filter(o => selectedOrderIds.includes(o.id));
            } else if (slot !== 'ADJ') {
                // Escenario 121: En cortes oficiales de Facturación Masiva (FV), excluir automáticamente reposiciones de garantía de SAC a $0 COP
                targetOrders = targetOrders.filter(o => {
                    const rep = getOrderReplacementInfo(o);
                    return !rep.isReplacement && o.origin_source !== 'customer_service';
                });
            }

            if (!targetOrders || targetOrders.length === 0) {
                setPreviewOrders([]);
                setLoadingPreview(false);
                return;
            }

            const orderIds = targetOrders.map(o => o.id);

            // Fetch route stops to determine Delivery Order Hierarchy
            const { data: routeStopsData } = await supabase
                .from('route_stops')
                .select('order_id, sequence_number, routes (id, vehicle_plate)')
                .in('order_id', orderIds);

            const routeStopsMap = new Map<string, any>();
            (routeStopsData || []).forEach(rs => {
                if (rs.order_id) routeStopsMap.set(rs.order_id, rs);
            });

            // Fetch approved returns to compute Quality Deductions
            const { data: returnsData } = await supabase
                .from('billing_returns')
                .select('order_id, quantity_returned, reason, defect_category_l1, defect_subtype_l2')
                .eq('status', 'approved')
                .in('order_id', orderIds);

            const returnsMap = new Map<string, any[]>();
            (returnsData || []).forEach(ret => {
                if (ret.order_id) {
                    const list = returnsMap.get(ret.order_id) || [];
                    list.push(ret);
                    returnsMap.set(ret.order_id, list);
                }
            });

            // Sort: 1. Route Plate -> 2. Stop sequence_number -> 3. order sequence_id
            const sorted = [...targetOrders].sort((a, b) => {
                const stopA = routeStopsMap.get(a.id);
                const stopB = routeStopsMap.get(b.id);
                const routeA = stopA?.routes?.vehicle_plate || 'ZZZZ';
                const routeB = stopB?.routes?.vehicle_plate || 'ZZZZ';

                if (routeA !== routeB) return routeA.localeCompare(routeB);
                const seqA = stopA?.sequence_number ?? 999999;
                const seqB = stopB?.sequence_number ?? 999999;
                if (seqA !== seqB) return seqA - seqB;
                return (a.sequence_id || 0) - (b.sequence_id || 0);
            });

            const isNcSlot = slot === 'ADJ';
            const activePrefix = isNcSlot ? ncPrefix : invoicePrefix;
            const startNumber = isNcSlot ? ncNextNumber : invoiceNextNumber;

            const mapped: CutPreviewOrder[] = sorted.map((o, idx) => {
                const rets = returnsMap.get(o.id) || [];
                const net = Number(o.total) || 0;
                
                const deductionQty = rets.reduce((sum, r) => sum + (Number(r.quantity_returned) || 0), 0);
                const deductionReason = rets.length > 0 
                    ? rets.map(r => r.reason || r.defect_category_l1).filter(Boolean).join(', ')
                    : '';
                
                let deductionAmount = 0;
                if (o.admin_notes && o.admin_notes.includes('[AJUSTE FACTURA')) {
                    const match = o.admin_notes.match(/-\$([0-9.,]+)/);
                    if (match) {
                        deductionAmount = parseFloat(match[1].replace(/,/g, '')) || 0;
                    }
                }
                const origTotal = deductionAmount > 0 ? net + deductionAmount : net;

                const stopInfo = routeStopsMap.get(o.id);
                const routeCode = stopInfo?.routes?.vehicle_plate ? `Ruta ${stopInfo.routes.vehicle_plate}` : 'Sin Ruta';
                const stopSequence = stopInfo?.sequence_number ?? 0;

                const projectedNum = `${activePrefix}-${startNumber + idx}`;
                const prof = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;

                return {
                    id: o.id,
                    sequence_id: o.sequence_id,
                    created_at: o.created_at,
                    total: net,
                    originalTotal: origTotal,
                    qualityDeduction: deductionAmount,
                    qualityDeductionReason: deductionReason,
                    qualityDeductionQty: deductionQty,
                    netTotal: net,
                    projectedInvoiceNumber: projectedNum,
                    routeCode,
                    stopSequence,
                    documentRequirement: prof?.print_invoice ? 'Factura Requerida' : 'Remisión Entrega',
                    type: o.type,
                    admin_notes: o.admin_notes,
                    logistics_data: o.logistics_data,
                    origin_source: o.origin_source,
                    profile: prof ? {
                        company_name: prof.company_name || 'Cliente sin nombre',
                        razon_social: prof.razon_social,
                        nit: prof.nit || 'N/A',
                        iva_responsible: !!prof.iva_responsible,
                        payment_days: prof.payment_days || 0,
                        parent_id: prof.parent_id,
                        role: prof.role,
                        document_type: prof.document_type,
                        print_invoice: prof.print_invoice,
                        remission_with_prices: prof.remission_with_prices
                    } : null
                };
            });

            setPreviewOrders(mapped);
        } catch (err: any) {
            console.error('Error generating preview:', err);
            showToast({ type: 'error', message: `Error al cargar la previsualización: ${err.message}` });
        } finally {
            setLoadingPreview(false);
        }
    };

    // Execute Official Cut Generation
    const handleConfirmGenerateCut = async () => {
        if (previewOrders.length === 0) return;
        setPreviewCutPokaYokeError(null);

        // Poka-Yoke Canónico (Escenario 121 SDD):
        // Se prohíbe emitir corte o factura definitiva sobre pedidos despachados sin precio o consumo abierto no liquidado (excepto Remisión Obsequio o Reposición)
        const unpricedOrder = previewOrders.find(o => {
            const rep = getOrderReplacementInfo(o);
            const isGiftOrReplacement = o.profile?.document_type === 'gift_remission' 
                || rep.isReplacement 
                || o.origin_source === 'customer_service'
                || /reposici[oó]n/i.test(o.admin_notes || '')
                || /obsequio/i.test(o.admin_notes || '');
            if (isGiftOrReplacement) return false;
            return (
                o.netTotal === 0 || 
                o.admin_notes?.includes('DESPACHADO SIN PRECIO') || 
                o.admin_notes?.includes('SE DESPACHÓ SIN PRECIO')
            );
        });
        if (unpricedOrder) {
            const errorMsg = `El pedido #${unpricedOrder.sequence_id || unpricedOrder.id.slice(0, 8)} fue despachado sin precio (o sobre consumo abierto no liquidado). Acción requerida: El Área Comercial debe fijar la tarifa o se debe liquidar el pedido a costo vigente antes de emitir la factura electrónica.`;
            setPreviewCutPokaYokeError(errorMsg);
            showToast({
                type: 'error',
                title: 'Poka-Yoke de Facturación Activo',
                message: errorMsg
            });
            return;
        }

        setIsProcessing(true);

        try {
            const isNcSlot = previewSlot === 'ADJ';
            const totalCutAmount = previewOrders.reduce((sum, o) => sum + o.netTotal, 0);

            // 1. Create billing_cuts record
            const { data: cutNumberData } = await supabase
                .from('billing_cuts')
                .select('cut_number')
                .order('cut_number', { ascending: false })
                .limit(1);

            const nextCutNum = (cutNumberData?.[0]?.cut_number || 0) + 1;

            const { data: newCut, error: cutErr } = await supabase
                .from('billing_cuts')
                .insert({
                    cut_number: nextCutNum,
                    scheduled_date: selectedBillingDate === 'all' ? getBogotaDate(0) : selectedBillingDate,
                    cut_slot: previewSlot,
                    status: 'open',
                    total_orders: previewOrders.length,
                    total_amount: totalCutAmount
                })
                .select()
                .single();

            if (cutErr) throw cutErr;

            // 2. Link orders to this cut
            const orderIdsToUpdate = previewOrders.map(o => o.id);
            const { error: updateOrdersErr } = await supabase
                .from('orders')
                .update({ billing_cut_id: newCut.id })
                .in('id', orderIdsToUpdate);

            if (updateOrdersErr) throw updateOrdersErr;

            // 3. Create billing_invoices records
            const invoicesToInsert = previewOrders.map((o, idx) => {
                const isIva = o.profile?.iva_responsible || false;
                const total = o.netTotal;
                const totalBase = isIva ? Math.round((total / 1.19) * 100) / 100 : total;
                const totalTax = isIva ? Math.round((total - totalBase) * 100) / 100 : 0;

                const isB2B = o.profile?.role === 'b2b_client' || o.type === 'b2b' || !!o.profile?.parent_id;
                const creditDays = o.profile?.payment_days || (isB2B ? 30 : 0);
                const dueDate = new Date();
                dueDate.setDate(dueDate.getDate() + creditDays);

                const numRaw = (isNcSlot ? ncNextNumber : invoiceNextNumber) + idx;
                const prefix = isNcSlot ? ncPrefix : invoicePrefix;

                return {
                    order_id: o.id,
                    cut_id: newCut.id,
                    invoice_number: o.projectedInvoiceNumber,
                    invoice_prefix: prefix,
                    invoice_number_raw: numRaw,
                    total_base: totalBase,
                    total_tax: totalTax,
                    total_final: total,
                    status: 'pending',
                    payment_status: isB2B ? 'pending' : 'paid',
                    due_date: dueDate.toISOString().split('T')[0]
                };
            });

            let { data: createdInvoices, error: invErr } = await supabase
                .from('billing_invoices')
                .insert(invoicesToInsert)
                .select();

            // Poka-Yoke Schema Resilience: Fallback to base columns if extended columns are not yet in PostgREST cache
            if (invErr && /column|schema cache/i.test(invErr.message || '')) {
                const fallbackInvoices = invoicesToInsert.map(inv => ({
                    order_id: inv.order_id,
                    cut_id: inv.cut_id,
                    invoice_number: inv.invoice_number,
                    total_base: inv.total_base,
                    total_tax: inv.total_tax,
                    total_final: inv.total_final,
                    status: inv.status
                }));
                const fallbackRes = await supabase
                    .from('billing_invoices')
                    .insert(fallbackInvoices)
                    .select();
                createdInvoices = fallbackRes.data;
                invErr = fallbackRes.error;
            }

            if (invErr) throw invErr;

            // 4. Update orders.invoice_id
            if (createdInvoices) {
                for (const inv of createdInvoices) {
                    if (inv.order_id) {
                        await supabase
                            .from('orders')
                            .update({ invoice_id: inv.id })
                            .eq('id', inv.order_id);
                    }
                }
            }

            // 5. Advance global sequence in app_settings (COM-29)
            const newNextNumber = (isNcSlot ? ncNextNumber : invoiceNextNumber) + previewOrders.length;
            const keyToUpdate = isNcSlot ? 'billing_nc_next_number' : 'billing_invoice_next_number';

            await supabase
                .from('app_settings')
                .upsert({
                    key: keyToUpdate,
                    value: String(newNextNumber),
                    updated_at: new Date().toISOString()
                });

            if (isNcSlot) {
                setNcNextNumber(newNextNumber);
            } else {
                setInvoiceNextNumber(newNextNumber);
            }

            showToast({
                type: 'success',
                title: `¡Corte ${previewSlot} Generado con Éxito!`,
                message: `${previewOrders.length} facturas emitidas (Rango: ${previewOrders[0]?.projectedInvoiceNumber} al ${previewOrders[previewOrders.length - 1]?.projectedInvoiceNumber}).`
            });
            setIsPreviewModalOpen(false);
            setPreviewCutPokaYokeError(null);
            setSelectedOrderIds([]);
            fetchData();
        } catch (err: any) {
            console.error('Error generating cut:', err);
            showToast({ type: 'error', message: `Error al generar el corte: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    // Process Return Deduction
    // World Office Handlers (Opción B)
    const handleCopyWorldOfficeCard = (order: any, ret: any, pqr: any) => {
        const nit = order.profiles?.nit || 'N/A';
        const clientName = order.profiles?.company_name || order.profiles?.contact_name || 'Cliente';
        const orderSeq = order.sequence_id ? `#1710_${order.sequence_id}` : `#${order.id.slice(0, 8)}`;
        const invoiceRef = order.invoice_number || ret?.reference_invoice_number || `FV-${order.sequence_id}`;
        const suggestedNc = ret?.credit_note_number || `NC-${order.sequence_id}-2010`;
        
        const { prodName, ncAmount } = resolveReturnProductAndAmount(ret, pqr);
        const qty = ret?.quantity_returned || 0;
        const pqrFolio = pqr?.id ? `PQR #${pqr.id.substring(0, 8).toUpperCase()}` : 'RNC Calidad';

        const textToCopy = `=== RADICACIÓN NOTA CRÉDITO EN WORLD OFFICE ===\n` +
            `• NIT: ${nit}\n` +
            `• Cliente: ${clientName}\n` +
            `• Pedido FruFresco: ${orderSeq}\n` +
            `• Factura Ref: ${invoiceRef}\n` +
            `• Consecutivo Sugerido: ${suggestedNc}\n` +
            `• Monto Nota Crédito: ${formatNumber(ncAmount)} COP\n` +
            `• Ítem Afectado: ${qty ? `${qty} Kg de ` : ''}${prodName}\n` +
            `• Soporte SAC: ${pqrFolio}\n` +
            `================================================`;

        if (typeof navigator !== 'undefined' && navigator.clipboard) {
            navigator.clipboard.writeText(textToCopy);
        }
        setWoCopiedOrderId(order.id);
        setTimeout(() => setWoCopiedOrderId(null), 3000);
    };

    const handleConfirmWorldOfficeSettlement = async () => {
        if (!woTargetOrder) return;
        setWoSubmitting(true);
        try {
            const targetFolio = woFolioInput.trim() || 'NC-WORLD-OFFICE';
            const syncPayload = {
                folio: targetFolio,
                settledAt: new Date().toISOString(),
                settledBy: profile?.email || 'Facturación / Cartera',
                notes: woNotesInput.trim() || 'Radicada y sincronizada en World Office.'
            };
            const syncTag = `\n\n[WO_SYNCED: ${JSON.stringify(syncPayload)}]`;

            if (woTargetReturn?.id) {
                const currentNotes = woTargetReturn.notes || '';
                await supabase
                    .from('billing_returns')
                    .update({ 
                        credit_note_number: targetFolio,
                        notes: `${currentNotes}${syncTag}` 
                    })
                    .eq('id', woTargetReturn.id);
            }

            if (woTargetPqr?.id) {
                const currentPqrNotes = woTargetPqr.resolution_notes || '';
                await supabase
                    .from('customer_service_pqrs')
                    .update({ 
                        resolution_notes: `${currentPqrNotes}${syncTag}` 
                    })
                    .eq('id', woTargetPqr.id);
            }

            showToast({
                type: 'success',
                title: 'Nota de Crédito Sincronizada',
                message: `Folio ${targetFolio} asentado exitosamente para World Office.`
            });

            setWoModalOpen(false);
            setWoTargetOrder(null);
            setWoTargetReturn(null);
            setWoTargetPqr(null);
            setWoFolioInput('');
            setWoNotesInput('');
            await fetchData();
        } catch (err: any) {
            console.error('Error settling World Office NC:', err);
            showToast({ type: 'error', message: 'Error al radicar en World Office: ' + (err?.message || err) });
        } finally {
            setWoSubmitting(false);
        }
    };

    const handleProcessReturn = async (ret: BillingReturn, decision: 'approved' | 'rejected') => {
        try {
            if (decision === 'rejected') {
                await supabase.from('billing_returns').update({ status: 'rejected' }).eq('id', ret.id);
            } else {
                const { data: itemData } = await supabase
                    .from('order_items')
                    .select('unit_price')
                    .eq('order_id', ret.order_id)
                    .eq('product_id', ret.product_id)
                    .single();

                const unitPrice = Number(itemData?.unit_price) || 0;
                const priceCredit = unitPrice * Number(ret.quantity_returned);

                const { data: orderData } = await supabase.from('orders').select('total').eq('id', ret.order_id).single();
                const newTotal = Math.max(0, (Number(orderData?.total) || 0) - priceCredit);
                
                await supabase
                    .from('orders')
                    .update({ total: newTotal })
                    .eq('id', ret.order_id);

                const { data: invoiceData } = await supabase.from('billing_invoices').select('id, order_id').eq('order_id', ret.order_id).single();
                if (invoiceData) {
                    const { data: orderProf } = await supabase
                        .from('orders')
                        .select('profiles(iva_responsible)')
                        .eq('id', ret.order_id)
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

                await supabase.from('billing_returns').update({ status: 'approved' }).eq('id', ret.id);
            }
            showToast({
                type: 'success',
                message: `Novedad procesada: ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'}`
            });
            fetchData();
        } catch (err: any) {
            console.error('Error processing return:', err);
            showToast({ type: 'error', message: `Error al procesar la devolución: ${err.message}` });
        }
    };

    // Register Payment
    const handleRegisterPayment = async () => {
        if (!selectedInvoice) return;
        setIsProcessing(true);
        try {
            const { error } = await supabase
                .from('billing_invoices')
                .update({
                    payment_status: 'paid',
                    paid_at: new Date().toISOString(),
                    payment_method: paymentMethod
                })
                .eq('id', selectedInvoice.id);

            if (error) throw error;
            showToast({ type: 'success', message: 'Pago registrado exitosamente.' });
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
            fetchData();
        } catch (err: any) {
            console.error('Error registering payment:', err);
            showToast({ type: 'error', message: `Error al registrar el pago: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    // Export an official cut to World Office (.xlsx)
    const exportToWorldOffice = async (cutId: string) => {
        try {
            const targetCut = cuts.find(c => c.id === cutId);

            // 1. Fetch cut orders with profiles and items
            const { data: cutOrders, error: cutOrdersErr } = await supabase
                .from('orders')
                .select(`
                    id, sequence_id, created_at, delivery_date, type, total, logistics_data, purchase_order_number,
                    profiles (
                        id, nit, company_name, razon_social, contact_name, address, city, phone, payment_days, iva_responsible, parent_id, role, logistics_data
                    ),
                    order_items (
                        id, quantity, unit_price, nickname, unit, product_id,
                        products (
                            id, accounting_id, sku, name, unit_of_measure, iva_rate
                        )
                    ),
                    billing_returns (
                        id, product_id, quantity_returned, status, reason
                    )
                `)
                .eq('billing_cut_id', cutId);

            if (cutOrdersErr) throw cutOrdersErr;
            if (!cutOrders || cutOrders.length === 0) {
                showToast({ type: 'warning', message: 'No se encontraron pedidos asociados a este corte.' });
                return;
            }

            // 2. Fetch assigned invoices for consecutive numbers
            const { data: assignedInvoices } = await supabase
                .from('billing_invoices')
                .select('order_id, invoice_number')
                .eq('cut_id', cutId);

            const invoiceMap = new Map<string, string>();
            (assignedInvoices || []).forEach(inv => {
                if (inv.order_id && inv.invoice_number) invoiceMap.set(inv.order_id, inv.invoice_number);
            });

            // 2.1 Fetch parent profiles if any cut order belongs to a branch
            const cutParentIds = Array.from(new Set((cutOrders as any[]).map((o: any) => o.profiles?.parent_id).filter(Boolean)));
            const cutParentsMap = new Map(parentProfilesMap);
            if (cutParentIds.length > 0) {
                const missingParents = cutParentIds.filter(id => !cutParentsMap.has(id));
                if (missingParents.length > 0) {
                    const { data: extraParents } = await supabase
                        .from('profiles')
                        .select('id, company_name, razon_social, nit, payment_days, print_invoice, document_type, remission_with_prices, preferred_payment_method')
                        .in('id', missingParents);
                    (extraParents || []).forEach((p: any) => cutParentsMap.set(p.id, p));
                }
            }

            // 3. Build flattened 57-column export rows
            const exportRows: any[] = [];
            cutOrders.forEach((order: any) => {
                const prof = order.profiles || {};
                const parentProf = prof.parent_id ? cutParentsMap.get(prof.parent_id) : null;
                const clientName = (parentProf?.razon_social || parentProf?.company_name || prof.razon_social || prof.company_name || prof.contact_name || 'Cliente General').trim();
                const nit = (parentProf?.nit || prof.nit || '222222222222').trim();
                const isIva = !!(parentProf?.iva_responsible ?? prof.iva_responsible);
                const isB2B = prof.role === 'b2b_client' || order.type === 'b2b' || !!prof.parent_id || !!parentProf;
                const paymentDays = Number(parentProf?.payment_days) || Number(prof.payment_days) || (isB2B ? 30 : 0);

                const rawInv = invoiceMap.get(order.id) || order.sequence_id;
                const cleanInvNum = parseInt(String(rawInv).replace(/\D/g, ''), 10) || order.sequence_id;
                const invNum = cleanInvNum;

                // Escenario 254: Conversión de Libras (1 Kg = 2 Lb) si el cliente tiene billing_weight_unit === 'lb'
                const isClientInLb = (prof.logistics_data?.billing_weight_unit === 'lb') || (order.logistics_data?.billing_weight_unit === 'lb') || (parentProf?.logistics_data?.billing_weight_unit === 'lb');
                // Escenario 253: Descuento Comercial en Vigencia a la fecha del pedido
                const discountPct = Number(order.logistics_data?.agreement_discount_pct || prof.logistics_data?.agreement_discount_pct || 0);
                const discountDecimal = discountPct > 0 ? (discountPct / 100) : 0;
                const branchName = resolveWorldOfficeBranch(prof, parentProf);
                const noteStr = resolveWorldOfficeNote(order, prof, branchName, parentProf);

                (order.order_items || []).forEach((item: any) => {
                    const baseItemQty = Number(item.quantity) || 0;
                    // Descontar novedades autorizadas / PQR cerradas de la Factura de Venta plana
                    const matchedReturn = (order.billing_returns || []).find((r: any) =>
                        (r.product_id === item.product_id || (r.products?.name && r.products.name.toLowerCase() === item.products?.name?.toLowerCase())) &&
                        (r.status === 'approved' || (r.reason && (r.reason.includes('AJUSTE FACTURA') || r.reason.includes('NOTA CRÉDITO'))))
                    );
                    const deductionQty = matchedReturn ? Number(matchedReturn.quantity_returned || 0) : 0;
                    const rawQty = Math.max(0, baseItemQty - deductionQty);
                    if (rawQty <= 0) return; // Si la cantidad neta es 0, no viaja en la Factura de Venta
                    const rawUnitPrice = Number(item.unit_price) || 0;
                    const rawUom = item.unit || item.products?.unit_of_measure || 'KG';
                    const isKg = /^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(rawUom.trim());

                    const qty = (isClientInLb && isKg) ? rawQty * 2 : rawQty;
                    const unitPrice = (isClientInLb && isKg && rawUnitPrice > 0) ? rawUnitPrice / 2 : rawUnitPrice;
                    const uom = (isClientInLb && isKg) ? 'LB' : rawUom;

                    const lineTotal = qty * unitPrice;
                    const lineBase = isIva ? Math.round((lineTotal / 1.19) * 100) / 100 : lineTotal;
                    const lineIva = isIva ? Math.round((lineTotal - lineBase) * 100) / 100 : 0;
                    const prodCode = item.products?.accounting_id ?? item.products?.sku ?? `FRU-${item.id?.slice(0, 4) || 'ITEM'}`;

                    exportRows.push({
                        tipoDocumento: 'FV',
                        numero: invNum,
                        consecutivo: invNum,
                        fecha: targetCut?.scheduled_date || order.delivery_date || getBogotaDate(0),
                        identificacionTercero: nit,
                        nitCliente: nit,
                        razonSocial: clientName,
                        sucursal: branchName,
                        formaPago: isB2B ? 'Credito' : 'Contado',
                        fechaEntrega: order.delivery_date || targetCut?.scheduled_date || getBogotaDate(0),
                        diasCredito: paymentDays,
                        codigoProducto: prodCode,
                        descripcion: item.nickname || item.products?.name || 'Producto FruFresco',
                        bodega: 'Principal',
                        unidadMedida: uom,
                        cantidad: qty,
                        valorUnitario: unitPrice,
                        valorBase: lineBase,
                        ivaRateDecimal: isIva ? 0.19 : 0,
                        tarifaIva: isIva ? 19 : 0,
                        valorIva: lineIva,
                        totalLinea: lineTotal,
                        descuento: discountDecimal,
                        notaEncabezado: noteStr,
                        observaciones: `Pedido #${order.sequence_id} | Corte ${targetCut?.cut_slot || 'AM'} #${targetCut?.cut_number || 1}`
                    });
                });
            });

            if (exportRows.length === 0) {
                showToast({ type: 'warning', message: 'Los pedidos de este corte no contienen ítems para exportar.' });
                return;
            }

            await downloadWorldOfficeExcel(
                exportRows, 
                `WorldOffice_Corte_${targetCut?.cut_slot || 'AM'}_${targetCut?.cut_number || 1}`
            );

            await supabase
                .from('billing_cuts')
                .update({ 
                    status: 'exported', 
                    exported_at: new Date().toISOString() 
                })
                .eq('id', cutId);

            showToast({
                type: 'success',
                title: 'Plano World Office Exportado',
                message: `Se generaron ${exportRows.length} líneas de detalle para el corte.`
            });
            fetchData();
        } catch (err: any) {
            console.error('Export error:', err);
            showToast({ type: 'error', message: `Error al exportar plano para World Office: ${err.message}` });
        }
    };

    // Direct Export of Pending Orders to World Office (.xlsx)
    const handleExportPendingToWorldOffice = async () => {
        const targetOrders = selectedOrderIds.length > 0
            ? filteredPendingOrders.filter(o => selectedOrderIds.includes(o.id))
            : filteredPendingOrders;

        if (targetOrders.length === 0) {
            showToast({ type: 'warning', message: 'No hay pedidos seleccionados o disponibles para exportar.' });
            return;
        }

        setIsProcessing(true);
        try {
            const orderIds = targetOrders.map(o => o.id);
            const { data: fullOrders, error: ordersErr } = await supabase
                .from('orders')
                .select(`
                    id, sequence_id, created_at, delivery_date, type, total, logistics_data, purchase_order_number,
                    profiles (
                        id, nit, company_name, razon_social, contact_name, address, city, phone, payment_days, iva_responsible, parent_id, role, logistics_data
                    ),
                    order_items (
                        id, quantity, unit_price, nickname, unit,
                        products (
                            accounting_id, sku, name, unit_of_measure, iva_rate
                        )
                    )
                `)
                .in('id', orderIds);

            if (ordersErr) throw ordersErr;
            if (!fullOrders || fullOrders.length === 0) {
                showToast({ type: 'warning', message: 'No se encontraron detalles de productos para los pedidos seleccionados.' });
                return;
            }

            // Mapeo canónico de números de factura fiscal según la posición en la vista de Facturación
            const pendingInvoiceMap = new Map<string, { docNum: number; projected: string }>();
            filteredPendingOrders.forEach((o, idx) => {
                const proj = o.billing_invoices?.invoice_number || o.invoice_number || `${invoicePrefix}-${invoiceNextNumber + idx}`;
                const clean = parseInt(String(proj).replace(/\D/g, ''), 10) || (invoiceNextNumber + idx);
                pendingInvoiceMap.set(o.id, { docNum: clean, projected: proj });
            });

            // Respaldo de perfiles padre para resolución precisa de sucursales en WorldOffice
            const pendingParentIds = Array.from(new Set((fullOrders as any[]).map((o: any) => o.profiles?.parent_id).filter(Boolean)));
            const pendingParentsMap = new Map(parentProfilesMap);
            if (pendingParentIds.length > 0) {
                const missingParents = pendingParentIds.filter(id => !pendingParentsMap.has(id));
                if (missingParents.length > 0) {
                    const { data: extraParents } = await supabase
                        .from('profiles')
                        .select('id, company_name, razon_social, nit, payment_days, print_invoice, document_type, remission_with_prices, preferred_payment_method')
                        .in('id', missingParents);
                    (extraParents || []).forEach((p: any) => pendingParentsMap.set(p.id, p));
                }
            }

            const exportRows: any[] = [];
            fullOrders.forEach((order: any) => {
                // Omitir pedidos liquidados en $0 por SAC o con saldo no facturable
                if (Number(order.total || 0) <= 0) return;

                const prof = order.profiles || {};
                const parentProf = prof.parent_id ? pendingParentsMap.get(prof.parent_id) : null;
                const clientName = (parentProf?.razon_social || parentProf?.company_name || prof.razon_social || prof.company_name || prof.contact_name || 'Cliente General').trim();
                const nit = (parentProf?.nit || prof.nit || '222222222222').trim();
                const isIva = !!(parentProf?.iva_responsible ?? prof.iva_responsible);
                const isB2B = prof.role === 'b2b_client' || order.type === 'b2b' || !!prof.parent_id || !!parentProf;
                const paymentDays = Number(parentProf?.payment_days) || Number(prof.payment_days) || (isB2B ? 30 : 0);

                // Consecutivo Fiscal Oficial para WorldOffice (Columna D: estrictamente numérico puro, ej: 68494)
                const mappedInv = pendingInvoiceMap.get(order.id);
                const rawInv = order.billing_invoices?.invoice_number || mappedInv?.projected || `${invoicePrefix}-${invoiceNextNumber}`;
                const cleanInvNum = mappedInv?.docNum || parseInt(String(rawInv).replace(/\D/g, ''), 10) || order.sequence_id;
                const invNum = cleanInvNum;

                // Escenario 254: Conversión de Libras (1 Kg = 2 Lb) si el cliente tiene billing_weight_unit === 'lb'
                const isClientInLb = (prof.logistics_data?.billing_weight_unit === 'lb') || (order.logistics_data?.billing_weight_unit === 'lb') || (parentProf?.logistics_data?.billing_weight_unit === 'lb');
                // Escenario 253: Descuento Comercial en Vigencia a la fecha del pedido
                const discountPct = Number(order.logistics_data?.agreement_discount_pct || prof.logistics_data?.agreement_discount_pct || 0);
                const discountDecimal = discountPct > 0 ? (discountPct / 100) : 0;
                const branchName = resolveWorldOfficeBranch(prof, parentProf);
                const noteStr = resolveWorldOfficeNote(order, prof, branchName, parentProf);

                (order.order_items || []).forEach((item: any) => {
                    const rawQty = Number(item.quantity) || 0;
                    // Omitir productos con cantidad 0 (no despachados o descontados 100% en PQR)
                    if (rawQty <= 0) return;
                    const rawUnitPrice = Number(item.unit_price) || 0;
                    const rawUom = item.unit || item.products?.unit_of_measure || 'KG';
                    const isKg = /^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(rawUom.trim());

                    const qty = (isClientInLb && isKg) ? rawQty * 2 : rawQty;
                    const unitPrice = (isClientInLb && isKg && rawUnitPrice > 0) ? rawUnitPrice / 2 : rawUnitPrice;
                    const uom = (isClientInLb && isKg) ? 'LB' : rawUom;

                    const lineTotal = qty * unitPrice;
                    const lineBase = isIva ? Math.round((lineTotal / 1.19) * 100) / 100 : lineTotal;
                    const lineIva = isIva ? Math.round((lineTotal - lineBase) * 100) / 100 : 0;
                    const prodCode = item.products?.accounting_id ?? item.products?.sku ?? `FRU-${item.id?.slice(0, 4) || 'ITEM'}`;

                    exportRows.push({
                        tipoDocumento: 'FV',
                        numero: invNum,
                        consecutivo: invNum,
                        fecha: order.delivery_date || getBogotaDate(0),
                        identificacionTercero: nit,
                        nitCliente: nit,
                        razonSocial: clientName,
                        sucursal: branchName,
                        formaPago: isB2B ? 'Credito' : 'Contado',
                        fechaEntrega: order.delivery_date || getBogotaDate(0),
                        diasCredito: paymentDays,
                        codigoProducto: prodCode,
                        descripcion: item.nickname || item.products?.name || 'Producto FruFresco',
                        bodega: 'Principal',
                        unidadMedida: uom,
                        cantidad: qty,
                        valorUnitario: unitPrice,
                        valorBase: lineBase,
                        ivaRateDecimal: isIva ? 0.19 : 0,
                        tarifaIva: isIva ? 19 : 0,
                        valorIva: lineIva,
                        totalLinea: lineTotal,
                        descuento: discountDecimal,
                        notaEncabezado: noteStr,
                        observaciones: `Pedido #${order.sequence_id} (Pre-Corte)`
                    });
                });
            });

            if (exportRows.length === 0) {
                showToast({ type: 'warning', message: 'Los pedidos seleccionados no tienen ítems registrados para exportar.' });
                return;
            }

            const dateLabel = selectedBillingDate === 'all' ? 'Todas' : selectedBillingDate;
            await downloadWorldOfficeExcel(
                exportRows,
                `WorldOffice_Pedidos_${dateLabel}_${targetOrders.length}_pedidos`
            );

            showToast({
                type: 'success',
                title: 'Plano World Office Descargado',
                message: `Se exportaron ${targetOrders.length} pedidos (${exportRows.length} líneas de producto).`
            });
        } catch (err: any) {
            console.error('Error exporting pending orders to Excel:', err);
            showToast({ type: 'error', message: `Error al descargar plano para World Office: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    // Export orders in preview modal to World Office Excel
    const handleExportPreviewToWorldOffice = async () => {
        if (previewOrders.length === 0) return;
        setIsProcessing(true);
        try {
            const orderIds = previewOrders.map(o => o.id);
            const { data: fullOrders, error: ordersErr } = await supabase
                .from('orders')
                .select(`
                    id, sequence_id, created_at, delivery_date, type, total, logistics_data, purchase_order_number,
                    profiles (
                        id, nit, company_name, razon_social, contact_name, address, city, phone, payment_days, iva_responsible, parent_id, role, logistics_data
                    ),
                    order_items (
                        id, quantity, unit_price, nickname, unit,
                        products (
                            accounting_id, sku, name, unit_of_measure, iva_rate
                        )
                    )
                `)
                .in('id', orderIds);

            if (ordersErr) throw ordersErr;
            if (!fullOrders || fullOrders.length === 0) {
                showToast({ type: 'warning', message: 'No se encontraron detalles de productos para la previsualización.' });
                return;
            }

            const isNcSlot = previewSlot === 'ADJ';
            const activePrefix = isNcSlot ? ncPrefix : invoicePrefix;
            const startNumber = isNcSlot ? ncNextNumber : invoiceNextNumber;

            const previewMap = new Map<string, { docNum: number; projected: string }>();
            previewOrders.forEach((po, idx) => {
                const proj = po.projectedInvoiceNumber || `${activePrefix}-${startNumber + idx}`;
                const clean = parseInt(String(proj).replace(/\D/g, ''), 10) || (startNumber + idx);
                previewMap.set(po.id, { docNum: clean, projected: proj });
            });

            // Respaldo de perfiles padre para resolución precisa de sucursales en WorldOffice
            const previewParentIds = Array.from(new Set((fullOrders as any[]).map((o: any) => o.profiles?.parent_id).filter(Boolean)));
            const previewParentsMap = new Map(parentProfilesMap);
            if (previewParentIds.length > 0) {
                const missingParents = previewParentIds.filter(id => !previewParentsMap.has(id));
                if (missingParents.length > 0) {
                    const { data: extraParents } = await supabase
                        .from('profiles')
                        .select('id, company_name, razon_social, nit, payment_days, print_invoice, document_type, remission_with_prices, preferred_payment_method')
                        .in('id', missingParents);
                    (extraParents || []).forEach((p: any) => previewParentsMap.set(p.id, p));
                }
            }

            const exportRows: any[] = [];
            fullOrders.forEach((order: any) => {
                const prof = order.profiles || {};
                const parentProf = prof.parent_id ? previewParentsMap.get(prof.parent_id) : null;
                const clientName = (parentProf?.razon_social || parentProf?.company_name || prof.razon_social || prof.company_name || prof.contact_name || 'Cliente General').trim();
                const nit = (parentProf?.nit || prof.nit || '222222222222').trim();
                const isIva = !!(parentProf?.iva_responsible ?? prof.iva_responsible);
                const isB2B = prof.role === 'b2b_client' || order.type === 'b2b' || !!prof.parent_id || !!parentProf;
                const paymentDays = Number(parentProf?.payment_days) || Number(prof.payment_days) || (isB2B ? 30 : 0);

                const mappedInv = previewMap.get(order.id);
                const cleanInvNum = mappedInv?.docNum || parseInt(String(mappedInv?.projected || order.sequence_id).replace(/\D/g, ''), 10) || order.sequence_id;
                const invNum = cleanInvNum;

                // Escenario 254: Conversión de Libras (1 Kg = 2 Lb) si el cliente tiene billing_weight_unit === 'lb'
                const isClientInLb = (prof.logistics_data?.billing_weight_unit === 'lb') || (order.logistics_data?.billing_weight_unit === 'lb') || (parentProf?.logistics_data?.billing_weight_unit === 'lb');
                // Escenario 253: Descuento Comercial en Vigencia a la fecha del pedido
                const discountPct = Number(order.logistics_data?.agreement_discount_pct || prof.logistics_data?.agreement_discount_pct || 0);
                const discountDecimal = discountPct > 0 ? (discountPct / 100) : 0;
                const branchName = resolveWorldOfficeBranch(prof, parentProf);
                const noteStr = resolveWorldOfficeNote(order, prof, branchName, parentProf);

                (order.order_items || []).forEach((item: any) => {
                    const rawQty = Number(item.quantity) || 0;
                    const rawUnitPrice = Number(item.unit_price) || 0;
                    const rawUom = item.unit || item.products?.unit_of_measure || 'KG';
                    const isKg = /^(kg|kilo|kilos|kilogramo|kilogramos)$/i.test(rawUom.trim());

                    const qty = (isClientInLb && isKg) ? rawQty * 2 : rawQty;
                    const unitPrice = (isClientInLb && isKg && rawUnitPrice > 0) ? rawUnitPrice / 2 : rawUnitPrice;
                    const uom = (isClientInLb && isKg) ? 'LB' : rawUom;

                    const lineTotal = qty * unitPrice;
                    const lineBase = isIva ? Math.round((lineTotal / 1.19) * 100) / 100 : lineTotal;
                    const lineIva = isIva ? Math.round((lineTotal - lineBase) * 100) / 100 : 0;
                    const prodCode = item.products?.accounting_id ?? item.products?.sku ?? `FRU-${item.id?.slice(0, 4) || 'ITEM'}`;

                    exportRows.push({
                        tipoDocumento: isNcSlot ? 'NC' : 'FV',
                        numero: invNum,
                        consecutivo: invNum,
                        fecha: selectedBillingDate === 'all' ? getBogotaDate(0) : selectedBillingDate,
                        identificacionTercero: nit,
                        nitCliente: nit,
                        razonSocial: clientName,
                        sucursal: branchName,
                        formaPago: isB2B ? 'Credito' : 'Contado',
                        fechaEntrega: order.delivery_date || getBogotaDate(0),
                        diasCredito: paymentDays,
                        codigoProducto: prodCode,
                        descripcion: item.nickname || item.products?.name || 'Producto FruFresco',
                        bodega: 'Principal',
                        unidadMedida: uom,
                        cantidad: qty,
                        valorUnitario: unitPrice,
                        valorBase: lineBase,
                        ivaRateDecimal: isIva ? 0.19 : 0,
                        tarifaIva: isIva ? 19 : 0,
                        valorIva: lineIva,
                        totalLinea: lineTotal,
                        descuento: discountDecimal,
                        notaEncabezado: noteStr,
                        observaciones: `Pedido #${order.sequence_id} | Pre-Corte ${previewSlot}`
                    });
                });
            });

            await downloadWorldOfficeExcel(
                exportRows,
                `WorldOffice_PreCorte_${previewSlot}_${selectedBillingDate}_${previewOrders.length}_pedidos`
            );

            showToast({
                type: 'success',
                title: 'Plano World Office Descargado',
                message: `Se exportaron ${previewOrders.length} pedidos de la previsualización.`
            });
        } catch (err: any) {
            console.error('Error exporting preview to Excel:', err);
            showToast({ type: 'error', message: `Error al descargar plano para World Office: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    // Escenario 252: Memoria de Filtros para Pedidos Acumulados por Lote
    const filteredBatchAccumulatedOrders = useMemo(() => {
        let result = batchAccumulatedOrders;
        if (batchClientFilter !== 'all') {
            result = result.filter(o => (o.profiles?.nit || o.profiles?.id) === batchClientFilter);
        }
        if (batchStartDate) {
            result = result.filter(o => (o.delivery_date || o.created_at?.slice(0, 10)) >= batchStartDate);
        }
        if (batchEndDate) {
            result = result.filter(o => (o.delivery_date || o.created_at?.slice(0, 10)) <= batchEndDate);
        }
        if (billingSearchQuery) {
            result = result.filter(order => matchesUniversalSearch(
                order,
                billingSearchQuery,
                o => [
                    o.sequence_id ? `#${o.sequence_id}` : '',
                    getFriendlyOrderId(o),
                    o.profiles?.company_name || '',
                    o.profiles?.razon_social || '',
                    o.profiles?.nit || '',
                    o.purchase_order_number ? `OC ${o.purchase_order_number}` : '',
                    o.status || '',
                    o.delivery_slot || ''
                ],
                o => o.sequence_id
            ));
        }
        return result;
    }, [batchAccumulatedOrders, batchClientFilter, batchStartDate, batchEndDate, billingSearchQuery]);

    const batchClientsList = useMemo(() => {
        const map = new Map<string, { id: string; name: string; nit: string; count: number }>();
        batchAccumulatedOrders.forEach(o => {
            const key = o.profiles?.nit || o.profiles?.id || 'sin_cliente';
            const name = o.profiles?.company_name || o.profiles?.razon_social || 'Cliente sin nombre';
            const nit = o.profiles?.nit || 'S/N';
            if (!map.has(key)) {
                map.set(key, { id: key, name, nit, count: 1 });
            } else {
                map.get(key)!.count += 1;
            }
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }, [batchAccumulatedOrders]);

    // Acciones para Acumulados por Lote (Escenario 252)
    const handleAccumulateOrdersForBatch = async (targetOrderIds: string[]) => {
        if (!targetOrderIds || targetOrderIds.length === 0) return;
        setIsProcessing(true);
        try {
            for (const orderId of targetOrderIds) {
                const ord = pendingOrders.find(o => o.id === orderId);
                const nextLogistics = {
                    ...(ord?.logistics_data || {}),
                    is_batch_accumulated: true
                };
                await supabase
                    .from('orders')
                    .update({ logistics_data: nextLogistics })
                    .eq('id', orderId);
            }
            showToast({
                type: 'success',
                title: 'Pedidos Acumulados p/ Lote',
                message: `Se enviaron ${targetOrderIds.length} pedidos a la pestaña "Acumulados por Lote".`
            });
            clearOrderSelection();
            await fetchData();
        } catch (err: any) {
            console.error('Error accumulating orders:', err);
            showToast({ type: 'error', message: `Error acumulando pedidos: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDeaccumulateOrders = async (targetOrderIds: string[]) => {
        if (!targetOrderIds || targetOrderIds.length === 0) return;
        setIsProcessing(true);
        try {
            for (const orderId of targetOrderIds) {
                const ord = batchAccumulatedOrders.find(o => o.id === orderId);
                const nextLogistics = {
                    ...(ord?.logistics_data || {}),
                    is_batch_accumulated: false
                };
                await supabase
                    .from('orders')
                    .update({ logistics_data: nextLogistics })
                    .eq('id', orderId);
            }
            showToast({
                type: 'info',
                title: 'Pedidos Regresados a Pendientes',
                message: `Se desacumularon ${targetOrderIds.length} pedidos y volvieron a la lista de pendientes diarios.`
            });
            clearOrderSelection();
            await fetchData();
        } catch (err: any) {
            console.error('Error deaccumulating orders:', err);
            showToast({ type: 'error', message: `Error desacumulando pedidos: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleUnifyOrdersIntoSingleInvoice = async (targetOrderIds: string[]) => {
        if (!targetOrderIds || targetOrderIds.length === 0) return;
        const allKnown = [...pendingOrders, ...batchAccumulatedOrders];
        const selected = allKnown.filter(o => targetOrderIds.includes(o.id));
        if (selected.length === 0) return;

        // 1. Validar que todos los pedidos pertenezcan al mismo cliente / NIT
        const firstNit = selected[0].profiles?.nit || selected[0].profile_id;
        const isSingleClient = selected.every(o => (o.profiles?.nit || o.profile_id) === firstNit);
        if (!isSingleClient) {
            showToast({
                type: 'error',
                title: 'NIT / Clientes Diferentes',
                message: 'Para unificar en 1 sola factura, todos los pedidos seleccionados deben pertenecer al mismo cliente / NIT.'
            });
            return;
        }

        // 2. Validar que ninguno tenga ítems en $0 sin tarifa comercial
        const hasUnpriced = selected.some(o => 
            o.admin_notes?.includes('DESPACHADO SIN PRECIO') || 
            o.admin_notes?.includes('SE DESPACHÓ SIN PRECIO') ||
            (o.logistics_data?.is_off_agreement_split && !o.logistics_data?.off_agreement_priced)
        );
        if (hasUnpriced) {
            showToast({
                type: 'warning',
                title: 'Remisiones con Ítems en $0',
                message: 'No es posible facturar pedidos con ítems en $0. El área Comercial debe asignar la tarifa previamente.'
            });
            return;
        }

        setIsProcessing(true);
        try {
            const { data: fullOrders, error: fullErr } = await supabase
                .from('orders')
                .select(`
                    id, total, subtotal, tax, sequence_id, profiles ( id, nit, company_name, razon_social, iva_responsible, payment_days )
                `)
                .in('id', targetOrderIds);

            if (fullErr) throw fullErr;

            const totalBase = (fullOrders || []).reduce((acc, o) => acc + Number(o.subtotal || o.total || 0), 0);
            const totalTax = (fullOrders || []).reduce((acc, o) => acc + Number(o.tax || 0), 0);
            const totalFinal = (fullOrders || []).reduce((acc, o) => acc + Number(o.total || 0), 0);

            const invoiceNum = `${invoicePrefix}-${invoiceNextNumber}`;
            const primaryOrderId = selected[0].id;

            const { data: newInvoice, error: invErr } = await supabase
                .from('billing_invoices')
                .insert({
                    order_id: primaryOrderId,
                    invoice_number: invoiceNum,
                    total_base: totalBase,
                    total_tax: totalTax,
                    total_final: totalFinal,
                    status: 'pending'
                })
                .select('id, invoice_number')
                .single();

            if (invErr) throw invErr;

            for (const ord of selected) {
                const nextLogistics = {
                    ...(ord.logistics_data || {}),
                    is_batch_accumulated: true,
                    unified_invoice_id: newInvoice.id,
                    unified_invoice_number: newInvoice.invoice_number
                };
                await supabase
                    .from('orders')
                    .update({
                        invoice_id: newInvoice.id,
                        logistics_data: nextLogistics
                    })
                    .eq('id', ord.id);
            }

            const nextNum = invoiceNextNumber + 1;
            await supabase
                .from('app_settings')
                .upsert({
                    key: 'billing_invoice_next_number',
                    value: String(nextNum),
                    description: 'Próximo consecutivo numérico Facturas de Venta',
                    updated_at: new Date().toISOString()
                });
            setInvoiceNextNumber(nextNum);

            showToast({
                type: 'success',
                title: 'Factura Unificada Generada',
                message: `Se unificaron ${selected.length} pedidos en la factura ${invoiceNum} por un total de ${formatMoney(totalFinal)}.`
            });

            clearOrderSelection();
            await fetchData();
        } catch (err: any) {
            console.error('Error unifying orders:', err);
            showToast({ type: 'error', message: `Error al unificar factura: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleBillOrdersOneByOne = async (targetOrderIds: string[]) => {
        if (!targetOrderIds || targetOrderIds.length === 0) return;
        const allKnown = [...pendingOrders, ...batchAccumulatedOrders];
        const selected = allKnown.filter(o => targetOrderIds.includes(o.id));
        if (selected.length === 0) return;

        setIsProcessing(true);
        try {
            let currentNext = invoiceNextNumber;
            for (let i = 0; i < selected.length; i++) {
                const ord = selected[i];
                const invNum = `${invoicePrefix}-${currentNext + i}`;
                const sub = Number(ord.subtotal || ord.total || 0);
                const tx = Number(ord.tax || 0);
                const tot = Number(ord.total || 0);

                const { data: newInv, error: invErr } = await supabase
                    .from('billing_invoices')
                    .insert({
                        order_id: ord.id,
                        invoice_number: invNum,
                        total_base: sub,
                        total_tax: tx,
                        total_final: tot,
                        status: 'pending'
                    })
                    .select('id, invoice_number')
                    .single();

                if (invErr) throw invErr;

                await supabase
                    .from('orders')
                    .update({
                        invoice_id: newInv.id
                    })
                    .eq('id', ord.id);
            }

            const nextNum = currentNext + selected.length;
            await supabase
                .from('app_settings')
                .upsert({
                    key: 'billing_invoice_next_number',
                    value: String(nextNum),
                    description: 'Próximo consecutivo numérico Facturas de Venta',
                    updated_at: new Date().toISOString()
                });
            setInvoiceNextNumber(nextNum);

            showToast({
                type: 'success',
                title: 'Facturas Individuales Generadas',
                message: `Se generaron ${selected.length} facturas individuales (${invoicePrefix}-${currentNext} a ${invoicePrefix}-${nextNum - 1}).`
            });

            clearOrderSelection();
            await fetchData();
        } catch (err: any) {
            console.error('Error billing 1-to-1:', err);
            showToast({ type: 'error', message: `Error facturando 1 a 1: ${err.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    // Escenario 251: Copiar Novedades de Remisiones $0 para el Equipo Comercial
    const handleCopyNoveltiesToCommercial = () => {
        let text = `📋 *REPORTE DE REMISIONES RETENIDAS POR PRECIO $0*\n`;
        text += `Módulo: Facturación | Segregación de Funciones (SoD)\n`;
        text += `Fecha de Auditoría: ${new Date().toLocaleDateString('es-CO')}\n\n`;

        assignPriceOrders.forEach((o: any) => {
            const client = o.profiles?.company_name || o.profiles?.razon_social || 'Cliente';
            const remNum = o.sequence_id ? `#${o.sequence_id}` : o.id.slice(0, 8);
            text += `• *Remisión ${remNum}* - ${client} (Entrega: ${o.delivery_date || 'N/A'})\n`;
            (o.unpriced_items || []).forEach((it: any) => {
                const name = it.products?.name || it.nickname || 'Producto';
                const sku = it.products?.sku || 'S/N';
                const qty = it.billable_quantity ?? it.quantity ?? 0;
                const unit = it.unit || it.products?.unit_of_measure || 'Und';
                const refCost = it.reference_cost ? ` (Costo Ref: ${Number(it.reference_cost).toLocaleString('es-CO')})` : '';
                text += `   - SKU ${sku}: ${name} x ${qty} ${unit}${refCost}\n`;
            });
            text += `\n`;
        });
        text += `⚠️ *Acción requerida:* Asignar tarifa comercial en el Módulo de Pedidos/Acuerdos para liberar la facturación de estos pedidos.`;

        navigator.clipboard.writeText(text);
        showToast({
            type: 'success',
            title: 'Reporte Copiado',
            message: 'Se copió el reporte de novedades al portapapeles. Listo para enviar al equipo Comercial.'
        });
    };

    // Save Configuration Settings in app_settings (COM-29)
    const handleSaveConfiguration = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingConfig(true);
        try {
            const updates = [
                { key: 'billing_invoice_prefix', value: invoicePrefix, description: 'Prefijo oficial DIAN para Facturas de Venta' },
                { key: 'billing_invoice_next_number', value: String(invoiceNextNumber), description: 'Próximo consecutivo numérico Facturas de Venta' },
                { key: 'billing_nc_prefix', value: ncPrefix, description: 'Prefijo oficial DIAN para Notas Crédito' },
                { key: 'billing_nc_next_number', value: String(ncNextNumber), description: 'Próximo consecutivo numérico Notas Crédito' },
                { key: 'billing_resolution_number', value: resolutionNumber, description: 'Número de Resolución DIAN de Facturación' },
                { key: 'billing_resolution_date', value: resolutionDate, description: 'Fecha de expedición de la resolución DIAN' },
                { key: 'billing_range_from', value: String(rangeFrom), description: 'Rango autorizado Desde' },
                { key: 'billing_range_to', value: String(rangeTo), description: 'Rango autorizado Hasta' },
                { key: 'billing_delivery_grace_minutes', value: String(graceMinutes), description: 'Ventana de gracia en minutos post-entrega para auditoría de calidad y reclamaciones antes de facturación masiva' },
                { key: 'billing_cut_close_time', value: String(cutCloseTime || '17:00'), description: 'Hora límite de cierre del corte de facturación (HH:MM) para el countdown de novedades de remisiones fuera de acuerdo a $0' },
            ];

            for (const item of updates) {
                await supabase
                    .from('app_settings')
                    .upsert({
                        key: item.key,
                        value: item.value,
                        description: item.description,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'key' });
            }

            showToast({ type: 'success', message: '¡Configuración fiscal y secuencias guardadas con éxito!' });
            fetchData();
        } catch (err: any) {
            console.error('Error saving config:', err);
            showToast({ type: 'error', message: `Error al guardar configuración: ${err.message}` });
        } finally {
            setSavingConfig(false);
        }
    };

    // Ageing Totals & Counts
    const aging = useMemo(() => {
        let alDia = 0;
        let vencido1_15 = 0;
        let vencido16_30 = 0;
        let vencido30Mas = 0;
        let totalPendiente = 0;
        let countAlDia = 0;
        let countVencido1_15 = 0;
        let countVencido16_30 = 0;
        let countVencido30Mas = 0;
        let countPaid = 0;

        const today = new Date();
        today.setHours(0,0,0,0);

        invoices.forEach(inv => {
            if (inv.payment_status === 'paid') {
                countPaid++;
                return;
            }
            const due = new Date(inv.due_date);
            due.setHours(0,0,0,0);
            
            const diffTime = today.getTime() - due.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const amount = Number(inv.total_final || 0);
            totalPendiente += amount;

            if (diffDays <= 0) {
                alDia += amount;
                countAlDia++;
            } else if (diffDays <= 15) {
                vencido1_15 += amount;
                countVencido1_15++;
            } else if (diffDays <= 30) {
                vencido16_30 += amount;
                countVencido16_30++;
            } else {
                vencido30Mas += amount;
                countVencido30Mas++;
            }
        });

        return {
            alDia,
            vencido1_15,
            vencido16_30,
            vencido30Mas,
            totalPendiente,
            countAlDia,
            countVencido1_15,
            countVencido16_30,
            countVencido30Mas,
            countPaid
        };
    }, [invoices]);

    const formatDeliveryDate = (dateStr?: string, slot?: string) => {
        if (!dateStr) return 'Sin fecha';
        try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                const mIndex = parseInt(parts[1], 10) - 1;
                const formatted = `${parseInt(parts[2], 10)} ${months[mIndex] || parts[1]}`;
                return slot ? `${formatted} · ${slot}` : formatted;
            }
        } catch {}
        return slot ? `${dateStr} (${slot})` : dateStr;
    };

    const formatCreatedAtCompact = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        try {
            const d = new Date(dateStr);
            const day = d.getDate();
            const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
            const month = months[d.getMonth()];
            let hours = d.getHours();
            const minutes = d.getMinutes().toString().padStart(2, '0');
            const ampm = hours >= 12 ? 'pm' : 'am';
            hours = hours % 12;
            hours = hours ? hours : 12;
            return `${day} ${month} · ${hours}:${minutes}${ampm}`;
        } catch {
            return dateStr;
        }
    };

    const resolveDeliveryWindowLabel = (order: any) => {
        const orderSlot = typeof order.delivery_slot === 'string' ? order.delivery_slot.trim() : '';
        if (orderSlot && orderSlot !== 'AM' && orderSlot !== 'PM' && orderSlot !== 'Cualquier hora' && orderSlot !== 'Mañana') {
            return orderSlot;
        }

        const pLogistics = order.profiles?.logistics_data;
        if (pLogistics && typeof pLogistics === 'object' && pLogistics.start_time && pLogistics.end_time) {
            return `${pLogistics.start_time} - ${pLogistics.end_time}`;
        }

        const rawRestrictions = order.profiles?.delivery_restrictions;
        const restrictions = typeof rawRestrictions === 'string' ? rawRestrictions : '';
        if (restrictions) {
            const match = restrictions.match(/(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)\s*(?:a|-)\s*(\d{1,2}:\d{2}(?:\s*[AaPp][Mm])?)/);
            if (match) {
                return `${match[1]} - ${match[2]}`;
            }
        }

        return orderSlot || 'AM';
    };


    const inputStyle = {
        width: '100%',
        padding: '0.65rem 0.85rem',
        borderRadius: '10px',
        border: `1px solid ${THEME.colors.border}`,
        fontSize: '0.82rem',
        outline: 'none',
        backgroundColor: '#FFFFFF',
        boxSizing: 'border-box' as const
    };

    const labelStyle = {
        display: 'block',
        fontSize: '0.72rem',
        fontWeight: '800',
        color: THEME.colors.textSecondary,
        marginBottom: '0.35rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.04em'
    };

    if (authLoading || !permissionsLoaded) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '4rem 2rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <RefreshCw size={30} className="animate-spin" style={{ color: THEME.colors.primary, animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontWeight: '700', color: THEME.colors.textSecondary }}>Cargando permisos de facturación y cartera...</span>
                </div>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}} />
            </div>
        );
    }

    if (!hasInvoicingAccess && !hasPortfolioAccess && !hasConfigAccess) {
        return (
            <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: '2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ backgroundColor: 'white', padding: '3.5rem 2.5rem', borderRadius: '24px', maxWidth: '480px', width: '100%', textAlign: 'center', border: '1px solid #E2E8F0', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05)' }}>
                    <div style={{ width: '64px', height: '64px', borderRadius: '18px', backgroundColor: '#FEE2E2', color: '#DC2626', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
                        <Lock size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', marginBottom: '0.6rem' }}>Acceso Restringido</h2>
                    <p style={{ fontSize: '0.88rem', color: '#64748B', lineHeight: '1.5', margin: '0 0 1.8rem 0' }}>
                        No tienes permisos asignados para acceder a Facturación, Cartera o Configuración.
                    </p>
                    <Link href="/admin/orders/create" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: THEME.colors.primary, color: 'white', padding: '0.75rem 1.4rem', borderRadius: '12px', fontWeight: '700', fontSize: '0.85rem', textDecoration: 'none' }}>
                        <ArrowLeft size={16} /> Volver a Pedidos
                    </Link>
                </div>
            </main>
        );
    }

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, overflowX: 'clip', overflowY: 'visible', width: '100%' }}>
            {/* FLOATING TOAST NOTIFICATIONS (POKA-YOKE SYSTEM) */}
            <div style={{
                position: 'fixed',
                top: '20px',
                right: '24px',
                zIndex: 99999,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxWidth: '440px',
                pointerEvents: 'none'
            }}>
                {toasts.map(t => (
                    <div key={t.id} style={{
                        pointerEvents: 'auto',
                        padding: '0.85rem 1.1rem',
                        borderRadius: '10px',
                        backgroundColor: t.type === 'success' ? '#ECFDF5' : t.type === 'error' ? '#FEF2F2' : t.type === 'warning' ? '#FFFBEB' : '#EFF6FF',
                        border: `1px solid ${t.type === 'success' ? '#A7F3D0' : t.type === 'error' ? '#FECACA' : t.type === 'warning' ? '#FDE68A' : '#BFDBFE'}`,
                        color: t.type === 'success' ? '#065F46' : t.type === 'error' ? '#991B1B' : t.type === 'warning' ? '#92400E' : '#1E40AF',
                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        animation: 'slideInRight 0.25s ease-out'
                    }}>
                        {t.type === 'success' && <CheckCircle2 size={18} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />}
                        {t.type === 'error' && <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />}
                        {t.type === 'warning' && <AlertCircle size={18} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />}
                        {t.type === 'info' && <Sparkles size={18} color="#2563EB" style={{ flexShrink: 0, marginTop: '2px' }} />}
                        <div style={{ flex: 1 }}>
                            {t.title && <div style={{ fontWeight: '800', fontSize: '0.84rem', marginBottom: '2px' }}>{t.title}</div>}
                            <div style={{ fontSize: '0.8rem', fontWeight: '600', lineHeight: 1.35 }}>{t.message}</div>
                        </div>
                        <button
                            type="button"
                            onClick={() => removeToast(t.id)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'inherit',
                                padding: '2px',
                                opacity: 0.7,
                                marginTop: '1px'
                            }}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Contenedor Maestro Universal 1600px */}
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0.6rem 0.8rem 2.5rem', width: '100%', overflowX: 'clip', overflowY: 'visible' }}>

                {/* Línea 1 Sticky: Subtabs Bar Unificada (top: 85px, zIndex: 45) */}
                <div style={{
                    position: 'sticky',
                    top: '85px',
                    zIndex: 45,
                    backgroundColor: '#FFFFFF',
                    borderBottom: `1px solid ${THEME.colors.border}`,
                    padding: '0.24rem 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    marginBottom: '0.35rem'
                }}>
                    {/* Left: Main Module Tabs + Integrated Subtabs */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'inline-flex', gap: '3px', alignItems: 'center' }}>
                            {hasInvoicingAccess && (
                                <button
                                    onClick={() => setActiveTab('invoicing')}
                                    style={{ 
                                        padding: '0.28rem 0.65rem', 
                                        borderRadius: '6px', 
                                        border: 'none', 
                                        background: activeTab === 'invoicing' ? '#0D7A57' : 'transparent', 
                                        fontWeight: '800', 
                                        fontSize: '0.74rem', 
                                        cursor: 'pointer', 
                                        color: activeTab === 'invoicing' ? 'white' : '#64748B', 
                                        boxShadow: activeTab === 'invoicing' ? '0 1px 4px rgba(13, 122, 87, 0.2)' : 'none',
                                        transition: 'all 0.15s ease',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Receipt size={12} /> Facturación
                                </button>
                            )}

                            {hasPortfolioAccess && (
                                <button
                                    onClick={() => setActiveTab('portfolio')}
                                    style={{ 
                                        padding: '0.28rem 0.65rem', 
                                        borderRadius: '6px', 
                                        border: 'none', 
                                        background: activeTab === 'portfolio' ? '#0D7A57' : 'transparent', 
                                        fontWeight: '800', 
                                        fontSize: '0.74rem', 
                                        cursor: 'pointer', 
                                        color: activeTab === 'portfolio' ? 'white' : '#64748B', 
                                        boxShadow: activeTab === 'portfolio' ? '0 1px 4px rgba(13, 122, 87, 0.2)' : 'none',
                                        transition: 'all 0.15s ease',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Wallet size={12} /> Cartera
                                </button>
                            )}

                            {hasConfigAccess && (
                                <button
                                    onClick={() => setActiveTab('configuration')}
                                    style={{ 
                                        padding: '0.28rem 0.65rem', 
                                        borderRadius: '6px', 
                                        border: 'none', 
                                        background: activeTab === 'configuration' ? '#0D7A57' : 'transparent', 
                                        fontWeight: '800', 
                                        fontSize: '0.74rem', 
                                        cursor: 'pointer', 
                                        color: activeTab === 'configuration' ? 'white' : '#64748B', 
                                        boxShadow: activeTab === 'configuration' ? '0 1px 4px rgba(13, 122, 87, 0.2)' : 'none',
                                        transition: 'all 0.15s ease',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Settings size={12} /> Configuración
                                </button>
                            )}
                        </div>

                        {/* Divisor Vertical */}
                        <div style={{ width: '1px', height: '16px', backgroundColor: '#CBD5E1', margin: '0 4px' }} />

                        {/* Subtabs Operativas */}
                        {activeTab === 'invoicing' && (
                            <div style={{ display: 'inline-flex', gap: '2px', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '7px' }}>
                                <button
                                    onClick={() => setSubTab('pending')}
                                    style={{ 
                                        backgroundColor: subTab === 'pending' ? 'white' : 'transparent', 
                                        color: subTab === 'pending' ? '#0D7A57' : '#64748B', 
                                        padding: '0.22rem 0.55rem', 
                                        borderRadius: '5px', 
                                        border: 'none', 
                                        fontWeight: '800', 
                                        fontSize: '0.70rem', 
                                        cursor: 'pointer', 
                                        boxShadow: subTab === 'pending' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <ShoppingCart size={11} style={{ color: subTab === 'pending' ? '#0D7A57' : '#64748B' }} /> Pedidos por Facturar ({pendingOrdersCount})
                                </button>
                                <button
                                    onClick={() => setSubTab('batch_accumulated')}
                                    style={{ 
                                        backgroundColor: subTab === 'batch_accumulated' ? 'white' : 'transparent', 
                                        color: subTab === 'batch_accumulated' ? '#0D7A57' : '#64748B', 
                                        padding: '0.22rem 0.55rem', 
                                        borderRadius: '5px', 
                                        border: 'none', 
                                        fontWeight: '800', 
                                        fontSize: '0.70rem', 
                                        cursor: 'pointer', 
                                        boxShadow: subTab === 'batch_accumulated' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Archive size={11} style={{ color: subTab === 'batch_accumulated' ? '#0D7A57' : '#64748B' }} /> Acumulados por Lote ({batchAccumulatedCount})
                                </button>
                                <button
                                    onClick={() => setSubTab('cuts')}
                                    style={{ 
                                        backgroundColor: subTab === 'cuts' ? 'white' : 'transparent', 
                                        color: subTab === 'cuts' ? '#0F172A' : '#64748B', 
                                        padding: '0.22rem 0.55rem', 
                                        borderRadius: '5px', 
                                        border: 'none', 
                                        fontWeight: '800', 
                                        fontSize: '0.70rem', 
                                        cursor: 'pointer', 
                                        boxShadow: subTab === 'cuts' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <Layers size={11} style={{ color: subTab === 'cuts' ? '#0D7A57' : '#64748B' }} /> Historial ({cuts.length})
                                </button>
                                <button
                                    onClick={() => setSubTab('returns')}
                                    style={{ 
                                        backgroundColor: subTab === 'returns' ? 'white' : 'transparent', 
                                        color: subTab === 'returns' ? '#DC2626' : '#64748B', 
                                        padding: '0.22rem 0.55rem', 
                                        borderRadius: '5px', 
                                        border: 'none', 
                                        fontWeight: '800', 
                                        fontSize: '0.70rem', 
                                        cursor: 'pointer', 
                                        boxShadow: subTab === 'returns' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <AlertCircle size={11} style={{ color: subTab === 'returns' ? '#DC2626' : '#64748B' }} /> Devoluciones ({returns.length})
                                </button>
                            </div>
                        )}

                        {activeTab === 'portfolio' && (
                            <div style={{ display: 'inline-flex', gap: '2px', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '7px' }}>
                                <button
                                    onClick={() => setPortfolioSubTab('invoices')}
                                    style={{ 
                                        backgroundColor: portfolioSubTab === 'invoices' ? 'white' : 'transparent', 
                                        color: portfolioSubTab === 'invoices' ? '#0D7A57' : '#64748B', 
                                        padding: '0.22rem 0.55rem', 
                                        borderRadius: '5px', 
                                        border: 'none', 
                                        fontWeight: '800', 
                                        fontSize: '0.70rem', 
                                        cursor: 'pointer', 
                                        boxShadow: portfolioSubTab === 'invoices' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <FileText size={11} style={{ color: portfolioSubTab === 'invoices' ? '#0D7A57' : '#64748B' }} /> Facturas ({invoices.length})
                                </button>
                                <button
                                    onClick={() => setPortfolioSubTab('dossiers')}
                                    style={{ 
                                        backgroundColor: portfolioSubTab === 'dossiers' ? 'white' : 'transparent', 
                                        color: portfolioSubTab === 'dossiers' ? '#0F172A' : '#64748B', 
                                        padding: '0.22rem 0.55rem', 
                                        borderRadius: '5px', 
                                        border: 'none', 
                                        fontWeight: '800', 
                                        fontSize: '0.70rem', 
                                        cursor: 'pointer', 
                                        boxShadow: portfolioSubTab === 'dossiers' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                    }}
                                >
                                    <FileSignature size={11} style={{ color: portfolioSubTab === 'dossiers' ? '#0D7A57' : '#64748B' }} /> Fichas B2B ({b2bClients.length})
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right: Tanda operativa toggle + EN VIVO telemetría */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {activeTab === 'invoicing' && (
                            <>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.66rem', fontWeight: '700', color: '#475569', backgroundColor: '#F8FAFC', padding: '2px 6px', borderRadius: '5px', border: '1px solid #E2E8F0' }}>
                                    <input
                                        type="checkbox"
                                        checked={includeAllStatuses}
                                        onChange={(e) => setIncludeAllStatuses(e.target.checked)}
                                        style={{ cursor: 'pointer', accentColor: '#0D7A57', width: '12px', height: '12px' }}
                                    />
                                    Tanda operativa
                                </label>

                                <button
                                    type="button"
                                    onClick={() => fetchData(true)}
                                    title={lastRealtimeSync ? `Sincronización en tiempo real activa (Última: ${lastRealtimeSync}) — Clic para refrescar ahora` : 'Sincronización en tiempo real activa — Clic para refrescar ahora'}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        backgroundColor: '#ECFDF5',
                                        border: '1px solid #A7F3D0',
                                        padding: '0.18rem 0.5rem',
                                        borderRadius: '5px',
                                        fontSize: '0.62rem',
                                        fontWeight: '800',
                                        color: '#065F46',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <span style={{
                                        width: '5px',
                                        height: '5px',
                                        borderRadius: '50%',
                                        backgroundColor: '#10B981',
                                        boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)'
                                    }} />
                                    <span>EN VIVO</span>
                                    <RefreshCw
                                        size={9}
                                        style={{
                                            color: '#059669',
                                            animation: isRefreshingRealtime ? 'spin 0.8s linear infinite' : 'none'
                                        }}
                                    />
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Línea 2 Sticky: Frosted Command Dock Unificado (top: 122px, zIndex: 40) */}
                {activeTab !== 'configuration' && (
                    <div style={{
                        position: 'sticky',
                        top: '122px',
                        zIndex: 40,
                        backgroundColor: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                        padding: '0.36rem 0.65rem',
                        marginBottom: '0.45rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.45rem'
                    }}>
                        {/* Flanco Izquierdo: Omnibox + Quick Status Pills */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                            <GalleryOmnibox
                                value={billingSearchQuery}
                                onChange={setBillingSearchQuery}
                                placeholder={
                                    activeTab === 'invoicing'
                                        ? (subTab === 'cuts' ? 'Buscar cortes...' : subTab === 'pending' ? 'Buscar cliente, NIT, pedido...' : 'Buscar devoluciones...')
                                        : (portfolioSubTab === 'invoices' ? 'Buscar facturas...' : 'Buscar clientes B2B...')
                                }
                                filteredCount={
                                    activeTab === 'invoicing'
                                        ? (subTab === 'cuts' ? filteredCuts.length : subTab === 'pending' ? filteredPendingOrders.length : filteredReturns.length)
                                        : (portfolioSubTab === 'invoices' ? filteredInvoices.length : filteredDossiers.length)
                                }
                                totalCount={
                                    activeTab === 'invoicing'
                                        ? (subTab === 'cuts' ? cuts.length : subTab === 'pending' ? pendingOrders.length : returns.length)
                                        : (portfolioSubTab === 'invoices' ? invoices.length : b2bClients.length)
                                }
                                style={{ width: '230px', minWidth: '180px' }}
                            />

                            {/* Píldoras de Estado Rápido (Quick Status Pills en pending) */}
                            {activeTab === 'invoicing' && subTab === 'pending' && (
                                <div style={{ display: 'inline-flex', gap: '2px', backgroundColor: '#F8FAFC', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                    <button
                                        type="button"
                                        onClick={() => setPendingStatusFilter('all')}
                                        style={{
                                            border: 'none',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.64rem',
                                            fontWeight: pendingStatusFilter === 'all' ? '800' : '600',
                                            backgroundColor: pendingStatusFilter === 'all' ? '#0F172A' : 'transparent',
                                            color: pendingStatusFilter === 'all' ? 'white' : '#64748B',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Todos ({pendingOrders.length})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingStatusFilter('ready')}
                                        title="Pedidos entregados con margen de gracia cumplido"
                                        style={{
                                            border: 'none',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.64rem',
                                            fontWeight: pendingStatusFilter === 'ready' ? '800' : '600',
                                            backgroundColor: pendingStatusFilter === 'ready' ? '#0D7A57' : 'transparent',
                                            color: pendingStatusFilter === 'ready' ? 'white' : '#065F46',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        <Check size={10} /> Listos ({readyCount})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPendingStatusFilter('grace')}
                                        title="Pedidos dentro del margen de 3h de inspección"
                                        style={{
                                            border: 'none',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            fontSize: '0.64rem',
                                            fontWeight: pendingStatusFilter === 'grace' ? '800' : '600',
                                            backgroundColor: pendingStatusFilter === 'grace' ? '#D97706' : 'transparent',
                                            color: pendingStatusFilter === 'grace' ? 'white' : '#92400E',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                        }}
                                    >
                                        <Clock size={10} /> En Gracia ({graceCount})
                                    </button>
                                    {inRouteCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setPendingStatusFilter('in_route')}
                                            style={{
                                                border: 'none',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.64rem',
                                                fontWeight: pendingStatusFilter === 'in_route' ? '800' : '600',
                                                backgroundColor: pendingStatusFilter === 'in_route' ? '#0284C7' : 'transparent',
                                                color: pendingStatusFilter === 'in_route' ? 'white' : '#0369A1',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            <Truck size={10} /> En Ruta ({inRouteCount})
                                        </button>
                                    )}
                                    {inProcessCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setPendingStatusFilter('in_process')}
                                            style={{
                                                border: 'none',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.64rem',
                                                fontWeight: pendingStatusFilter === 'in_process' ? '800' : '600',
                                                backgroundColor: pendingStatusFilter === 'in_process' ? '#475569' : 'transparent',
                                                color: pendingStatusFilter === 'in_process' ? 'white' : '#475569',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            <Layers size={10} /> En Prep. ({inProcessCount})
                                        </button>
                                    )}
                                    {noveltiesCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setPendingStatusFilter('novelties')}
                                            style={{
                                                border: 'none',
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.64rem',
                                                fontWeight: pendingStatusFilter === 'novelties' ? '800' : '600',
                                                backgroundColor: pendingStatusFilter === 'novelties' ? '#DC2626' : 'transparent',
                                                color: pendingStatusFilter === 'novelties' ? 'white' : '#991B1B',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px'
                                            }}
                                        >
                                            <AlertTriangle size={10} /> Novedades ({noveltiesCount})
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Centro: Selector compacto de Tanda */}
                        {activeTab === 'invoicing' && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', backgroundColor: '#F8FAFC', padding: '2px 4px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                                <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#64748B', padding: '0 2px' }}>Tanda:</span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedBillingDate(getBogotaDate(-1))}
                                    style={{
                                        border: 'none',
                                        padding: '2px 5px',
                                        borderRadius: '4px',
                                        fontSize: '0.64rem',
                                        fontWeight: selectedBillingDate === getBogotaDate(-1) ? '800' : '600',
                                        backgroundColor: selectedBillingDate === getBogotaDate(-1) ? '#0D7A57' : 'transparent',
                                        color: selectedBillingDate === getBogotaDate(-1) ? 'white' : '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Ayer
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedBillingDate(getBogotaDate(0))}
                                    style={{
                                        border: 'none',
                                        padding: '2px 5px',
                                        borderRadius: '4px',
                                        fontSize: '0.64rem',
                                        fontWeight: selectedBillingDate === getBogotaDate(0) ? '800' : '600',
                                        backgroundColor: selectedBillingDate === getBogotaDate(0) ? '#0D7A57' : 'transparent',
                                        color: selectedBillingDate === getBogotaDate(0) ? 'white' : '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Hoy
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedBillingDate(getBogotaDate(1))}
                                    style={{
                                        border: 'none',
                                        padding: '2px 5px',
                                        borderRadius: '4px',
                                        fontSize: '0.64rem',
                                        fontWeight: selectedBillingDate === getBogotaDate(1) ? '800' : '600',
                                        backgroundColor: selectedBillingDate === getBogotaDate(1) ? '#0D7A57' : 'transparent',
                                        color: selectedBillingDate === getBogotaDate(1) ? 'white' : '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Mañana
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedBillingDate('all')}
                                    style={{
                                        border: 'none',
                                        padding: '2px 5px',
                                        borderRadius: '4px',
                                        fontSize: '0.64rem',
                                        fontWeight: selectedBillingDate === 'all' ? '800' : '600',
                                        backgroundColor: selectedBillingDate === 'all' ? '#0D7A57' : 'transparent',
                                        color: selectedBillingDate === 'all' ? 'white' : '#475569',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Todas
                                </button>
                                {/* Datepicker compacto */}
                                {(() => {
                                    const isCustomDate = selectedBillingDate !== getBogotaDate(1) && selectedBillingDate !== getBogotaDate(0) && selectedBillingDate !== getBogotaDate(-1) && selectedBillingDate !== 'all';
                                    return (
                                        <div
                                            title="Seleccionar fecha de despacho"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '2px',
                                                padding: '1px 4px',
                                                borderRadius: '4px',
                                                backgroundColor: isCustomDate ? '#0D7A57' : '#FFFFFF',
                                                border: isCustomDate ? '1px solid #0D7A57' : '1px solid #CBD5E1',
                                                position: 'relative'
                                            }}
                                        >
                                            <Calendar size={10} strokeWidth={2.2} style={{ color: isCustomDate ? '#FFFFFF' : '#0D7A57', flexShrink: 0 }} />
                                            <input
                                                type="date"
                                                max={getBogotaDate(7)}
                                                value={isCustomDate ? selectedBillingDate : ''}
                                                onChange={(e) => {
                                                    if (e.target.value) {
                                                        setSelectedBillingDate(e.target.value);
                                                    }
                                                }}
                                                className="clean-date-input"
                                                style={{
                                                    border: 'none',
                                                    outline: 'none',
                                                    backgroundColor: 'transparent',
                                                    color: isCustomDate ? '#FFFFFF' : '#334155',
                                                    fontSize: '0.64rem',
                                                    fontWeight: isCustomDate ? '800' : '600',
                                                    cursor: 'pointer',
                                                    padding: 0,
                                                    width: isCustomDate ? '74px' : '68px'
                                                }}
                                            />
                                            {isCustomDate && (
                                                <button
                                                    type="button"
                                                    title="Restablecer tanda a Hoy"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedBillingDate(getBogotaDate(0));
                                                    }}
                                                    style={{
                                                        border: 'none',
                                                        background: 'rgba(255, 255, 255, 0.25)',
                                                        color: 'white',
                                                        borderRadius: '50%',
                                                        width: '12px',
                                                        height: '12px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                >
                                                    <X size={8} strokeWidth={3} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        )}

                        {/* Flanco Derecho: Acciones Contextuales y Botones Primarios */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {activeTab === 'invoicing' && subTab === 'pending' && (
                                <>
                                    {unpricedOffAgreementCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => handleOpenAssignPriceModal()}
                                            title="Remisiones con tarifa pendiente asignable por Comercial (SoD)"
                                            style={{
                                                backgroundColor: '#FEF2F2',
                                                color: '#991B1B',
                                                border: '1px solid #F87171',
                                                padding: '0.28rem 0.55rem',
                                                borderRadius: '6px',
                                                fontWeight: '800',
                                                fontSize: '0.68rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <AlertTriangle size={11} style={{ color: '#DC2626' }} />
                                            <span>{unpricedOffAgreementCount} Retenidos</span>
                                        </button>
                                    )}

                                    {selectedOrderIds.length > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleAccumulateOrdersForBatch(selectedOrderIds)}
                                                style={{
                                                    backgroundColor: '#F8FAFC',
                                                    color: '#0F172A',
                                                    border: '1px solid #CBD5E1',
                                                    padding: '0.28rem 0.6rem',
                                                    borderRadius: '6px',
                                                    fontWeight: '800',
                                                    fontSize: '0.70rem',
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                                title="Enviar pedidos seleccionados a la bandeja de facturación por lote acumulado"
                                            >
                                                <Archive size={11} style={{ color: '#0D7A57' }} />
                                                <span>Acumular Lote ({selectedOrderIds.length})</span>
                                            </button>

                                            {(() => {
                                                const selectedOrdersList = filteredPendingOrders.filter(o => selectedOrderIds.includes(o.id));
                                                if (selectedOrdersList.length < 2) return null;
                                                const firstClient = selectedOrdersList[0].profiles?.nit || selectedOrdersList[0].profile_id;
                                                const isSameClient = selectedOrdersList.every(o => (o.profiles?.nit || o.profile_id) === firstClient);
                                                if (!isSameClient) return null;
                                                return (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnifyOrdersIntoSingleInvoice(selectedOrderIds)}
                                                        style={{
                                                            backgroundColor: '#0D7A57',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '0.28rem 0.65rem',
                                                            borderRadius: '6px',
                                                            fontWeight: '900',
                                                            fontSize: '0.70rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            boxShadow: '0 1px 4px rgba(13, 122, 87, 0.25)'
                                                        }}
                                                        title="Unificar los pedidos seleccionados del mismo cliente en una sola Factura de Venta"
                                                    >
                                                        <CheckCircle2 size={11} />
                                                        <span>Unificar ({selectedOrderIds.length})</span>
                                                    </button>
                                                );
                                            })()}

                                            <button
                                                type="button"
                                                onClick={clearOrderSelection}
                                                style={{
                                                    border: '1px solid #FECACA',
                                                    backgroundColor: '#FEF2F2',
                                                    color: '#991B1B',
                                                    padding: '0.25rem 0.5rem',
                                                    borderRadius: '5px',
                                                    fontSize: '0.64rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Limpiar ({selectedOrderIds.length})
                                            </button>
                                        </>
                                    )}

                                    {/* Exportar Novedades NC World Office (Gemba Accounting) */}
                                    <button
                                        type="button"
                                        onClick={handleExportCreditNotesExcel}
                                        disabled={creditNotesItems.length === 0 || isProcessing}
                                        style={{
                                            backgroundColor: '#FAF5FF',
                                            color: '#6B21A8',
                                            border: '1px solid #D8B4FE',
                                            padding: '0.32rem 0.65rem',
                                            borderRadius: '6px',
                                            fontWeight: '800',
                                            fontSize: '0.72rem',
                                            cursor: creditNotesItems.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
                                            opacity: creditNotesItems.length === 0 || isProcessing ? 0.6 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: '0 1px 3px rgba(107, 33, 168, 0.1)'
                                        }}
                                        title="Descargar reporte Excel agrupando todas las notas crédito del día para World Office (Cliente, Sucursal, Producto, Cantidad, Valor)"
                                    >
                                        <FileSpreadsheet size={13} color="#7C3AED" />
                                        <span>Novedades NC ({filteredCreditNotes.length > 0 ? filteredCreditNotes.length : creditNotesItems.length})</span>
                                    </button>

                                    {/* Exportar Excel World Office */}
                                    <button
                                        type="button"
                                        onClick={handleExportPendingToWorldOffice}
                                        disabled={pendingOrders.length === 0 || isProcessing}
                                        style={{
                                            backgroundColor: '#FFFFFF',
                                            color: '#0F172A',
                                            border: '1px solid #CBD5E1',
                                            padding: '0.32rem 0.65rem',
                                            borderRadius: '6px',
                                            fontWeight: '700',
                                            fontSize: '0.72rem',
                                            cursor: pendingOrders.length === 0 ? 'not-allowed' : 'pointer',
                                            opacity: pendingOrders.length === 0 ? 0.6 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
                                        }}
                                        title="Descargar archivo Excel (.xlsx) con la plantilla oficial de World Office"
                                    >
                                        <FileSpreadsheet size={12} style={{ color: '#0D7A57' }} />
                                        <span>Excel WO {selectedOrderIds.length > 0 ? `(${selectedOrderIds.length})` : `(${filteredPendingOrders.length})`}</span>
                                    </button>

                                    {/* Generar Corte AM */}
                                    <button
                                        type="button"
                                        onClick={() => isDateLockedByCut ? undefined : handleOpenCutPreview('AM')}
                                        disabled={pendingOrdersCount === 0 || isProcessing || isDateLockedByCut}
                                        title={isDateLockedByCut ? 'Esta fecha ya tiene un corte cerrado. Modo Consulta activo' : 'Generar Corte AM'}
                                        style={{
                                            backgroundColor: isDateLockedByCut ? '#E2E8F0' : '#0D7A57',
                                            color: isDateLockedByCut ? '#64748B' : 'white',
                                            border: 'none',
                                            padding: '0.32rem 0.75rem',
                                            borderRadius: '6px',
                                            fontWeight: '800',
                                            fontSize: '0.72rem',
                                            cursor: (pendingOrdersCount === 0 || isDateLockedByCut) ? 'not-allowed' : 'pointer',
                                            opacity: (pendingOrdersCount === 0 || isDateLockedByCut) ? 0.6 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            boxShadow: isDateLockedByCut ? 'none' : '0 2px 6px rgba(13, 122, 87, 0.2)'
                                        }}
                                    >
                                        {isDateLockedByCut ? <Lock size={12} /> : <Sun size={12} />} {isDateLockedByCut ? 'Corte Cerrado' : 'Corte AM ' + (selectedOrderIds.length > 0 ? '(' + selectedOrderIds.length + ')' : '(' + pendingOrdersCount + ')')}
                                    </button>

                                    {/* Micro-icono HelpCircle con Tooltip */}
                                    <span
                                        title={`Margen de inspección y recepción: ${graceMinutes >= 60 ? `${Math.round(graceMinutes/60)}h` : `${graceMinutes}m`} post-entrega. Al expirar la gracia sin novedades, los pedidos pasan a listos automáticamente.`}
                                        style={{ cursor: 'help', color: '#94A3B8', display: 'inline-flex', alignItems: 'center', padding: '0 2px' }}
                                    >
                                        <HelpCircle size={14} />
                                    </span>
                                </>
                            )}

                            {/* Acciones en Cartera */}
                            {activeTab === 'portfolio' && portfolioSubTab === 'dossiers' && (
                                <>
                                    <button
                                        onClick={handleCreateNewDossier}
                                        style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.32rem 0.7rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 5px rgba(13, 122, 87, 0.2)' }}
                                    >
                                        <Plus size={12} strokeWidth={2.5} /> Crear Expediente
                                    </button>
                                    <a
                                        href="/admin/commercial/billing/print-credit/blank"
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ backgroundColor: 'white', border: '1px solid #CBD5E1', color: '#334155', padding: '0.32rem 0.65rem', borderRadius: '6px', fontWeight: '700', fontSize: '0.72rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Printer size={11} /> Imprimir Vacío
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* INVOICING SUBMODULE */}
                {activeTab === 'invoicing' && (
                    <div>

                        {/* SUBTAB: HISTORIAL DE CORTES */}
                        {subTab === 'cuts' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, overflow: 'visible', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                                {loading ? (
                                    <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.84rem' }}>
                                        Cargando cortes...
                                    </div>
                                ) : cuts.length === 0 ? (
                                    <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center' }}>
                                        <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                                            <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: THEME.colors.primaryLight, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: THEME.colors.primary, marginBottom: '0.75rem' }}>
                                                <Layers size={22} />
                                            </div>
                                            <h3 style={{ fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, marginBottom: '0.25rem' }}>
                                                No hay cortes históricos generados aún
                                            </h3>
                                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: '0 auto 1.25rem auto', maxWidth: '400px' }}>
                                                {pendingOrdersCount > 0 
                                                    ? `Tienes ${pendingOrdersCount} pedidos activos en la pestaña "Pedidos por Facturar". Al generar el Corte AM o PM, quedarán archivados aquí con su plano World Office.` 
                                                    : 'Los cortes diarios generados y sus archivos planos exportados para World Office quedarán archivados aquí.'}
                                            </p>
                                            {pendingOrdersCount > 0 && (
                                                <div style={{ display: 'inline-flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSubTab('pending')}
                                                        style={{
                                                            backgroundColor: '#0D7A57',
                                                            color: 'white',
                                                            border: 'none',
                                                            padding: '0.48rem 1rem',
                                                            borderRadius: '8px',
                                                            fontWeight: '800',
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                                        }}
                                                    >
                                                        <ShoppingCart size={14} /> Ver {pendingOrdersCount} Pedidos por Facturar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => isDateLockedByCut ? undefined : handleOpenCutPreview('AM')}
                                                        disabled={isDateLockedByCut}
                                                        title={isDateLockedByCut ? 'Esta fecha ya tiene un corte cerrado. Modo Consulta activo' : 'Generar Corte AM'}
                                                        style={{
                                                            backgroundColor: '#F1F5F9',
                                                            color: isDateLockedByCut ? '#94A3B8' : '#334155',
                                                            border: isDateLockedByCut ? '1px solid #E2E8F0' : '1px solid #CBD5E1',
                                                            padding: '0.48rem 1rem',
                                                            borderRadius: '8px',
                                                            fontWeight: '700',
                                                            fontSize: '0.78rem',
                                                            cursor: isDateLockedByCut ? 'not-allowed' : 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px',
                                                            opacity: isDateLockedByCut ? 0.55 : 1
                                                        }}
                                                    >
                                                        {isDateLockedByCut ? <Lock size={14} /> : <Sun size={14} />} {isDateLockedByCut ? 'Corte Cerrado (Solo Consulta)' : 'Auditar y Generar Corte AM (' + pendingOrdersCount + ')'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ width: '100%', maxWidth: '100%', overflow: 'visible' }}>
                                    <table style={{ width: '100%', minWidth: '920px', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}># Corte</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fecha y Franja</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pedidos</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Bruto</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredCuts.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                                                            No se encontraron cortes que coincidan con &quot;{billingSearchQuery}&quot;
                                                        </td>
                                                    </tr>
                                                ) : filteredCuts.map((cut) => {
                                                    return (
                                                        <tr key={cut.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'background-color 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                            <td style={{ padding: '0.55rem 0.75rem' }}><span style={{ fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>#{cut.cut_number.toString().padStart(4, '0')}</span></td>
                                                            <td style={{ padding: '0.55rem 0.75rem' }}>
                                                                <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.78rem' }}>{new Date(cut.scheduled_date).toLocaleDateString()}</div>
                                                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '1px' }}>Franja: {cut.cut_slot}</div>
                                                            </td>
                                                            <td style={{ padding: '0.55rem 0.75rem', fontWeight: '600', color: '#334155', fontSize: '0.76rem' }}>{cut.total_orders} pedidos</td>
                                                            <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>{formatMoney(cut.total_amount)}</td>
                                                            <td style={{ padding: '0.55rem 0.75rem' }}>
                                                                <span style={{ backgroundColor: cut.status === 'exported' ? '#ECFDF5' : '#FEF3C7', color: cut.status === 'exported' ? '#065F46' : '#92400E', border: `1px solid ${cut.status === 'exported' ? '#A7F3D0' : '#FDE68A'}`, padding: '0.18rem 0.5rem', borderRadius: '99px', fontSize: '0.66rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                    {cut.status}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.55rem 0.75rem', textAlign: 'right' }}>
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                    <a 
                                                                        href={`/admin/commercial/billing/print/${cut.id}`}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{ 
                                                                            backgroundColor: '#ECFDF5', 
                                                                            color: '#065F46', 
                                                                            padding: '0.36rem 0.75rem', 
                                                                            borderRadius: '7px', 
                                                                            border: '1px solid #A7F3D0', 
                                                                            fontWeight: '700', 
                                                                            fontSize: '0.72rem', 
                                                                            textDecoration: 'none',
                                                                            display: 'inline-flex', 
                                                                            alignItems: 'center', 
                                                                            gap: '5px', 
                                                                            transition: 'all 0.15s ease', 
                                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.02)' 
                                                                        }}
                                                                        title="Imprimir Remisiones y Facturas Oficiales de este Corte"
                                                                    >
                                                                        <Printer size={13} style={{ color: '#0D7A57' }} /> Imprimir Documentos
                                                                    </a>
                                                                    <button 
                                                                        onClick={() => exportToWorldOffice(cut.id)}
                                                                        style={{ backgroundColor: THEME.colors.surface, color: THEME.colors.textMain, padding: '0.36rem 0.75rem', borderRadius: '7px', border: `1px solid ${THEME.colors.border}`, fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}
                                                                        onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.primary; e.currentTarget.style.color = THEME.colors.primary; }}
                                                                        onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.border; e.currentTarget.style.color = THEME.colors.textMain; }}
                                                                    >
                                                                        <FileSpreadsheet size={13} style={{ color: THEME.colors.primary }} /> Plano World Office (.xlsx)
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* SUBTAB: PEDIDOS ACUMULADOS POR LOTE (ESCENARIO 252) */}
                        {subTab === 'batch_accumulated' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '14px', border: `1px solid ${THEME.colors.border}`, overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                                {/* Header / Filter Toolbar */}
                                <div style={{ padding: '0.75rem 1rem', backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Archive size={16} style={{ color: '#0D7A57' }} />
                                            <h3 style={{ margin: 0, fontSize: '0.86rem', fontWeight: '900', color: '#0F172A' }}>
                                                Pedidos Acumulados por Lote
                                            </h3>
                                            <span style={{ fontSize: '0.70rem', fontWeight: '800', backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '1px 7px', borderRadius: '99px' }}>
                                                {filteredBatchAccumulatedOrders.length} {filteredBatchAccumulatedOrders.length === 1 ? 'pedido acumulado' : 'pedidos acumulados'}
                                            </span>
                                        </div>

                                        {/* Filtro de Cliente */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span style={{ fontSize: '0.70rem', fontWeight: '700', color: '#64748B' }}>Cliente:</span>
                                            <select
                                                value={batchClientFilter}
                                                onChange={(e) => setBatchClientFilter(e.target.value)}
                                                style={{
                                                    padding: '0.28rem 0.55rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.74rem',
                                                    fontWeight: '700',
                                                    color: '#0F172A',
                                                    backgroundColor: 'white'
                                                }}
                                            >
                                                <option value="all">Todos los Clientes ({batchAccumulatedOrders.length})</option>
                                                {batchClientsList.map(c => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.name} ({c.count} pedidos) - NIT {c.nit}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Filtro Rango de Fechas */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                            <span style={{ fontSize: '0.70rem', fontWeight: '700', color: '#64748B' }}>Desde:</span>
                                            <input
                                                type="date"
                                                value={batchStartDate}
                                                onChange={(e) => setBatchStartDate(e.target.value)}
                                                style={{
                                                    padding: '0.24rem 0.45rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    color: '#0F172A'
                                                }}
                                            />
                                            <span style={{ fontSize: '0.70rem', fontWeight: '700', color: '#64748B' }}>Hasta:</span>
                                            <input
                                                type="date"
                                                value={batchEndDate}
                                                onChange={(e) => setBatchEndDate(e.target.value)}
                                                style={{
                                                    padding: '0.24rem 0.45rem',
                                                    borderRadius: '6px',
                                                    border: '1px solid #CBD5E1',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '700',
                                                    color: '#0F172A'
                                                }}
                                            />
                                            {(batchStartDate || batchEndDate || batchClientFilter !== 'all') && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setBatchStartDate('');
                                                        setBatchEndDate('');
                                                        setBatchClientFilter('all');
                                                    }}
                                                    style={{
                                                        padding: '0.24rem 0.5rem',
                                                        borderRadius: '6px',
                                                        border: '1px solid #FECACA',
                                                        backgroundColor: '#FEF2F2',
                                                        color: '#991B1B',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Limpiar
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Acciones para Acumulados */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        {selectedOrderIds.length > 0 && (
                                            <>
                                                {/* Botón Desacumular / Regresar a Pendientes */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeaccumulateOrders(selectedOrderIds)}
                                                    disabled={isProcessing}
                                                    style={{
                                                        backgroundColor: 'white',
                                                        color: '#475569',
                                                        border: '1px solid #CBD5E1',
                                                        padding: '0.38rem 0.75rem',
                                                        borderRadius: '8px',
                                                        fontWeight: '700',
                                                        fontSize: '0.73rem',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Regresar los pedidos seleccionados a la bandeja de pendientes diarios"
                                                >
                                                    <RotateCcw size={12} />
                                                    <span>Regresar a Pendientes ({selectedOrderIds.length} sel)</span>
                                                </button>

                                                {/* Botón Facturar 1 a 1 */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleBillOrdersOneByOne(selectedOrderIds)}
                                                    disabled={isProcessing}
                                                    style={{
                                                        backgroundColor: 'white',
                                                        color: '#0F172A',
                                                        border: '1px solid #0D7A57',
                                                        padding: '0.38rem 0.75rem',
                                                        borderRadius: '8px',
                                                        fontWeight: '800',
                                                        fontSize: '0.73rem',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Generar una Factura de Venta individual para cada uno de los pedidos seleccionados"
                                                >
                                                    <FileText size={12} style={{ color: '#0D7A57' }} />
                                                    <span>Facturar 1 a 1 ({selectedOrderIds.length} sel)</span>
                                                </button>

                                                {/* Botón Unificar en 1 Sola Factura (si son del mismo cliente) */}
                                                {(() => {
                                                    const selectedOrdersList = filteredBatchAccumulatedOrders.filter(o => selectedOrderIds.includes(o.id));
                                                    if (selectedOrdersList.length === 0) return null;
                                                    const firstClient = selectedOrdersList[0].profiles?.nit || selectedOrdersList[0].profile_id;
                                                    const isSameClient = selectedOrdersList.every(o => (o.profiles?.nit || o.profile_id) === firstClient);
                                                    if (!isSameClient) {
                                                        return (
                                                            <span style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: '800', backgroundColor: '#FEF2F2', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FECACA' }}>
                                                                Mismo NIT requerido para Unificar
                                                            </span>
                                                        );
                                                    }
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleUnifyOrdersIntoSingleInvoice(selectedOrderIds)}
                                                            disabled={isProcessing}
                                                            style={{
                                                                backgroundColor: '#0D7A57',
                                                                color: 'white',
                                                                border: 'none',
                                                                padding: '0.38rem 0.85rem',
                                                                borderRadius: '8px',
                                                                fontWeight: '900',
                                                                fontSize: '0.73rem',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                                            }}
                                                            title="Unificar todos los pedidos seleccionados en una sola Factura de Venta acumulada"
                                                        >
                                                            <CheckCircle2 size={13} />
                                                            <span>Unificar en 1 Sola Factura ({selectedOrderIds.length} sel)</span>
                                                        </button>
                                                    );
                                                })()}
                                            </>
                                        )}

                                        {/* Exportar a World Office */}
                                        <button
                                            type="button"
                                            onClick={handleExportPendingToWorldOffice}
                                            disabled={filteredBatchAccumulatedOrders.length === 0 || isProcessing}
                                            style={{
                                                backgroundColor: '#FFFFFF',
                                                color: '#0F172A',
                                                border: '1px solid #CBD5E1',
                                                padding: '0.38rem 0.75rem',
                                                borderRadius: '8px',
                                                fontWeight: '700',
                                                fontSize: '0.73rem',
                                                cursor: filteredBatchAccumulatedOrders.length === 0 ? 'not-allowed' : 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                            title="Descargar archivo Excel (.xlsx) con la plantilla oficial de World Office para los pedidos acumulados"
                                        >
                                            <FileSpreadsheet size={13} style={{ color: '#0D7A57' }} />
                                            <span>Descargar Excel World Office {selectedOrderIds.length > 0 ? `(${selectedOrderIds.length} sel)` : `(${filteredBatchAccumulatedOrders.length})`}</span>
                                        </button>
                                    </div>
                                </div>

                                {/* Tabla de Pedidos Acumulados */}
                                <div style={{ overflow: 'visible' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.25rem', width: '34px', textAlign: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={filteredBatchAccumulatedOrders.length > 0 && filteredBatchAccumulatedOrders.every(o => selectedOrderIds.includes(o.id))}
                                                        onChange={() => {
                                                            const allSelected = filteredBatchAccumulatedOrders.length > 0 && filteredBatchAccumulatedOrders.every(o => selectedOrderIds.includes(o.id));
                                                            if (allSelected) {
                                                                setSelectedOrderIds(prev => prev.filter(id => !filteredBatchAccumulatedOrders.some(o => o.id === id)));
                                                            } else {
                                                                const visibleIds = filteredBatchAccumulatedOrders.map(o => o.id);
                                                                setSelectedOrderIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                                                            }
                                                        }}
                                                        style={{ cursor: 'pointer', accentColor: '#0D7A57', width: '14px', height: '14px' }}
                                                    />
                                                </th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.62rem' }}>Remisión / Pedido</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.62rem' }}>Cliente / Razón Social</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.62rem' }}>Entrega</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.62rem', textAlign: 'center' }}>Ítems</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.62rem', textAlign: 'right' }}>Total Pedido</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.62rem', textAlign: 'center' }}>Modalidad</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredBatchAccumulatedOrders.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                                                        <div style={{ maxWidth: '400px', margin: '0 auto', color: '#64748B' }}>
                                                            <Archive size={32} style={{ margin: '0 auto 8px auto', display: 'block', color: '#94A3B8' }} />
                                                            <div style={{ fontWeight: '800', fontSize: '0.86rem', color: '#334155' }}>No hay pedidos acumulados por lote para los filtros seleccionados</div>
                                                            <div style={{ fontSize: '0.72rem', marginTop: '4px' }}>
                                                                En la pestaña de &quot;Pedidos por Facturar&quot;, selecciona pedidos y presiona &quot;Acumular p/ Lote&quot; para agruparlos aquí.
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredBatchAccumulatedOrders.map((order) => {
                                                    const isSelected = selectedOrderIds.includes(order.id);
                                                    const clientName = order.profiles?.company_name || order.profiles?.razon_social || 'Cliente sin nombre';
                                                    const clientNit = order.profiles?.nit || 'S/N';
                                                    const itemCount = order.order_items?.[0]?.count ?? (order.order_items?.length || 0);
                                                    const discountPct = Number(order.logistics_data?.agreement_discount_pct || order.profiles?.logistics_data?.agreement_discount_pct || 0);

                                                    return (
                                                        <tr
                                                            key={order.id}
                                                            style={{
                                                                borderBottom: `1px solid ${THEME.colors.border}`,
                                                                backgroundColor: isSelected ? '#F0FDF4' : 'transparent',
                                                                transition: 'background-color 0.15s ease',
                                                                cursor: 'pointer'
                                                            }}
                                                            onClick={() => handleOpenOrderDetail(order)}
                                                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
                                                            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                        >
                                                            <td
                                                                style={{ padding: '0.5rem 0.5rem', textAlign: 'center' }}
                                                                onClick={e => { e.stopPropagation(); toggleOrderSelection(order.id); }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => toggleOrderSelection(order.id)}
                                                                    style={{ cursor: 'pointer', accentColor: '#0D7A57', width: '14px', height: '14px' }}
                                                                />
                                                            </td>
                                                            <td style={{ padding: '0.4rem 0.35rem' }}>
                                                                <div style={{ fontWeight: '900', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                                                    REM-{order.sequence_id || order.id.slice(0, 8)}
                                                                </div>
                                                                <div style={{ fontSize: '0.64rem', color: '#64748B' }}>
                                                                    ID: {order.id.slice(0, 8)}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.4rem 0.25rem' }}>
                                                                <div style={{ fontWeight: '800', color: '#0D7A57' }}>
                                                                    {clientName}
                                                                </div>
                                                                <div style={{ fontSize: '0.65rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                    <span>NIT: {clientNit}</span>
                                                                    {discountPct > 0 && (
                                                                        <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '0 4px', borderRadius: '3px', fontWeight: '800', fontSize: '0.58rem' }}>
                                                                            Dto. -{discountPct}%
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.4rem 0.35rem' }}>
                                                                <div style={{ fontWeight: '700', color: '#334155' }}>
                                                                    {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString('es-CO') : 'Sin fecha'}
                                                                </div>
                                                                <div style={{ fontSize: '0.64rem', color: '#64748B' }}>
                                                                    Franja: {order.delivery_slot || 'AM'}
                                                                </div>
                                                            </td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: '700', color: '#334155' }}>
                                                                {itemCount}
                                                            </td>
                                                            <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '900', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                                                {formatMoney(order.total || 0)}
                                                            </td>
                                                            <td style={{ padding: '0.4rem 0.25rem', textAlign: 'center' }}>
                                                                <span style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '0.15rem 0.45rem', borderRadius: '4px', fontSize: '0.62rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                    Lote Acumulado
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: PEDIDOS POR FACTURAR */}
                        {subTab === 'pending' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '12px', border: `1px solid ${THEME.colors.border}`, width: '100%', maxWidth: '100%', overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                                <div style={{ overflow: 'visible' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                {/* 0. Checkbox Maestro */}
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.5rem', width: '38px', textAlign: 'center', borderTopLeftRadius: '12px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={filteredPendingOrders.length > 0 && filteredPendingOrders.every(o => selectedOrderIds.includes(o.id))}
                                                        onChange={() => {
                                                            const allVisibleSelected = filteredPendingOrders.length > 0 && filteredPendingOrders.every(o => selectedOrderIds.includes(o.id));
                                                            if (allVisibleSelected) {
                                                                setSelectedOrderIds(prev => prev.filter(id => !filteredPendingOrders.some(o => o.id === id)));
                                                            } else {
                                                                const visibleIds = filteredPendingOrders.map(o => o.id);
                                                                setSelectedOrderIds(prev => Array.from(new Set([...prev, ...visibleIds])));
                                                            }
                                                        }}
                                                        style={{ cursor: 'pointer', accentColor: '#0D7A57', width: '14px', height: '14px' }}
                                                        title={filteredPendingOrders.length > 0 && filteredPendingOrders.every(o => selectedOrderIds.includes(o.id)) ? "Deseleccionar todos" : "Seleccionar todos"}
                                                    />
                                                </th>

                                                {/* 1. # Pedido / Fechas */}
                                                <th 
                                                    onClick={() => handleSort('sequence_id')}
                                                    title="Ordenar por número de pedido o fecha de creación"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.35rem', width: '95px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'sequence_id' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span># Pedido</span>
                                                        {sortConfig.key === 'sequence_id' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 2. Consecutivo Fiscal */}
                                                <th 
                                                    onClick={() => handleSort('fiscal_consecutive')}
                                                    title="Ordenar por número fiscal de factura electrónica"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.35rem', width: '85px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'fiscal_consecutive' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Consecutivo</span>
                                                        {sortConfig.key === 'fiscal_consecutive' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 3. Cliente / Razón Social */}
                                                <th 
                                                    onClick={() => handleSort('client')}
                                                    title="Ordenar alfabéticamente por cliente o razón social"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.35rem', width: '140px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'client' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Cliente</span>
                                                        {sortConfig.key === 'client' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 4. Ítems */}
                                                <th 
                                                    onClick={() => handleSort('items')}
                                                    title="Ordenar por cantidad de productos"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.25rem', width: '60px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'items' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Ítems</span>
                                                        {sortConfig.key === 'items' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 5. Novedades QA */}
                                                <th 
                                                    onClick={() => handleSort('novelties')}
                                                    title="Ordenar por novedades o incidencias de entrega"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.35rem', width: '125px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'novelties' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Novedades</span>
                                                        {sortConfig.key === 'novelties' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 6. Documento & Plazo */}
                                                <th 
                                                    onClick={() => handleSort('document')}
                                                    title="Ordenar por tipo de documento fiscal o plazo de crédito"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.30rem', width: '95px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'document' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Documento</span>
                                                        {sortConfig.key === 'document' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 7. Estado Operativo & Gracia */}
                                                <th 
                                                    onClick={() => handleSort('grace_status')}
                                                    title="Ordenar por estado de entrega y cuenta regresiva de gracia post-entrega"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.35rem', width: '95px', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'grace_status' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Estado</span>
                                                        {sortConfig.key === 'grace_status' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 8. Total Pedido */}
                                                <th 
                                                    onClick={() => handleSort('total')}
                                                    title="Ordenar por valor total del pedido"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.35rem', width: '85px', textAlign: 'right', fontSize: '0.60rem', fontWeight: '800', color: sortConfig.key === 'total' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end' }}>
                                                        <span>Total</span>
                                                        {sortConfig.key === 'total' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 9. Acciones */}
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.45rem 0.25rem', width: '80px', textAlign: 'center', fontSize: '0.60rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', borderTopRightRadius: '12px' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {loading ? (
                                                <tr><td colSpan={10} style={{ padding: '2.5rem', textAlign: 'center', color: THEME.colors.textSecondary, fontWeight: '600', fontSize: '0.78rem' }}>Cargando pedidos...</td></tr>
                                            ) : filteredPendingOrders.length === 0 ? (
                                                <tr>
                                                    <td colSpan={10} style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
                                                        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                                                            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#F1F5F9', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', marginBottom: '0.6rem' }}>
                                                                <ShoppingCart size={18} />
                                                            </div>
                                                            <h3 style={{ fontSize: '0.92rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '0.2rem' }}>
                                                                No hay pedidos pendientes
                                                            </h3>
                                                            <p style={{ color: THEME.colors.textSecondary, fontSize: '0.76rem', margin: 0 }}>
                                                                {billingSearchQuery 
                                                                    ? `No se encontraron pedidos que coincidan con "${billingSearchQuery}"` 
                                                                    : 'No hay pedidos en la fecha seleccionada pendientes de asignación contable.'}
                                                            </p>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : filteredPendingOrders.map((order, idx) => {
                                                const isDelivered = order.status === 'delivered';
                                                const isSelected = selectedOrderIds.includes(order.id);
                                                const clientName = order.profiles?.company_name || order.profiles?.razon_social || 'Cliente sin nombre';
                                                const friendlyId = getFriendlyOrderId(order);
                                                const itemCount = order.order_items?.[0]?.count ?? (order.order_items?.length || 0);
                                                const returnsList = order.billing_returns || [];
                                                const returnsCount = returnsList.length;
                                                const projectedInvoiceNumber = order.billing_invoices?.invoice_number 
                                                    || order.invoice_number 
                                                    || `${invoicePrefix}-${invoiceNextNumber + idx}`;

                                                return (
                                                    <tr 
                                                        key={order.id} 
                                                        onClick={() => handleOpenOrderDetail(order)}
                                                        style={{ 
                                                            borderBottom: `1px solid ${THEME.colors.border}`, 
                                                            backgroundColor: isSelected ? '#F0FDF4' : 'transparent',
                                                            borderLeft: isSelected ? '3px solid #0D7A57' : '3px solid transparent',
                                                            transition: 'all 0.15s ease', 
                                                            cursor: 'pointer' 
                                                        }} 
                                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC'; }} 
                                                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                                    >
                                                        {/* 0. Checkbox de Fila */}
                                                        <td style={{ padding: '0.4rem 0.25rem', textAlign: 'center', width: '34px' }} onClick={(e) => e.stopPropagation()}>
                                                            {(() => {
                                                                const rep = getOrderReplacementInfo(order);
                                                                if (rep.isReplacement) {
                                                                    return (
                                                                        <input
                                                                            type="checkbox"
                                                                            disabled
                                                                            checked={false}
                                                                            style={{ cursor: 'not-allowed', opacity: 0.3, width: '14px', height: '14px' }}
                                                                            title="Los pedidos de reposición ($0 COP) viajan con Remisión Oficial y no generan Factura de Venta comercial"
                                                                        />
                                                                    );
                                                                }
                                                                return (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleOrderSelection(order.id)}
                                                                        style={{ cursor: 'pointer', accentColor: '#0D7A57', width: '14px', height: '14px' }}
                                                                        title={isSelected ? "Desmarcar pedido para este corte" : "Marcar pedido para incluir en corte"}
                                                                    />
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 1. # Pedido & Fechas / Trazabilidad */}
                                                        <td style={{ padding: '0.4rem 0.35rem' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', alignItems: 'flex-start', maxWidth: '100px' }}>
                                                                <span style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem', letterSpacing: '-0.01em' }}>
                                                                    #{friendlyId}
                                                                </span>
                                                                {order.purchase_order_number && (
                                                                    <span style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '1px 4px', borderRadius: '3px', border: '1px solid #BFDBFE', fontWeight: '700', fontSize: '0.55rem', maxWidth: '95px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`OC: ${order.purchase_order_number}`}>
                                                                        OC: {order.purchase_order_number}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '600', marginTop: '2px', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
                                                                Ped: {formatCreatedAtCompact(order.created_at).split('·')[0].trim()}
                                                            </div>
                                                            {(() => {
                                                                const rawRestrictions = order.profiles?.delivery_restrictions;
                                                                const restrictionStr = typeof rawRestrictions === 'string' 
                                                                    ? rawRestrictions 
                                                                    : (order.profiles?.logistics_data?.start_time ? `Horario: ${order.profiles.logistics_data.start_time} - ${order.profiles.logistics_data.end_time}` : '');
                                                                const windowLabel = resolveDeliveryWindowLabel(order);

                                                                return (
                                                                    <div 
                                                                        title={restrictionStr ? `Fecha programada: ${order.delivery_date || 'N/A'}\nVentana / Restricción de recepción: ${restrictionStr}` : `Fecha de entrega: ${order.delivery_date || 'N/A'} (${windowLabel})`}
                                                                        style={{ fontSize: '0.64rem', color: '#334155', fontWeight: '700', marginTop: '1px', whiteSpace: 'nowrap', lineHeight: '1.2', cursor: restrictionStr ? 'help' : 'default' }}
                                                                    >
                                                                        Ent: {formatDeliveryDate(order.delivery_date, windowLabel).split('·')[0].trim()}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 2. Consecutivo Fiscal Autoasignado */}
                                                        <td style={{ padding: '0.4rem 0.30rem' }}>
                                                            {(() => {
                                                                const rep = getOrderReplacementInfo(order);
                                                                if (rep.isReplacement) {
                                                                    return (
                                                                        <div>
                                                                            <div style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                backgroundColor: '#ECFDF5',
                                                                                border: '1px solid #A7F3D0',
                                                                                padding: '0.18rem 0.45rem',
                                                                                borderRadius: '6px',
                                                                                fontWeight: '800',
                                                                                fontSize: '0.70rem',
                                                                                color: '#065F46'
                                                                            }}>
                                                                                <RotateCcw size={10} style={{ color: '#059669' }} />
                                                                                <span>REMISIÓN $0 (Garantía)</span>
                                                                            </div>
                                                                            <div style={{ fontSize: '0.62rem', color: '#047857', fontWeight: '700', marginTop: '2px' }}>
                                                                                {rep.parentSequenceId ? `Hijo de Pedido #${rep.parentSequenceId}` : 'Garantía SAC'}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }
                                                                return (
                                                                    <>
                                                                        <div style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            backgroundColor: order.billing_invoices?.invoice_number ? '#ECFDF5' : '#F8FAFC',
                                                                            border: `1px solid ${order.billing_invoices?.invoice_number ? '#A7F3D0' : '#CBD5E1'}`,
                                                                            padding: '0.18rem 0.45rem',
                                                                            borderRadius: '6px',
                                                                            fontVariantNumeric: 'tabular-nums',
                                                                            fontWeight: '800',
                                                                            fontSize: '0.74rem',
                                                                            color: order.billing_invoices?.invoice_number ? '#065F46' : '#0F172A'
                                                                        }}>
                                                                            <FileCheck size={11} style={{ color: order.billing_invoices?.invoice_number ? '#059669' : '#64748B' }} />
                                                                            <span>{projectedInvoiceNumber}</span>
                                                                        </div>
                                                                        <div style={{ fontSize: '0.62rem', color: '#64748B', marginTop: '2px' }}>
                                                                            {order.billing_invoices?.invoice_number ? 'Asignado en corte' : `Auto-asignado (#${idx + 1})`}
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 3. Cliente & NIT */}
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                            <div title={clientName} style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.74rem', lineHeight: '1.2', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {clientName}
                                                            </div>
                                                            <div style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: '600', marginTop: '1px' }}>
                                                                NIT: {order.profiles?.nit || 'N/A'}
                                                            </div>
                                                        </td>

                                                        {/* 4. Ítems */}
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleOpenOrderDetail(order);
                                                                }}
                                                                style={{
                                                                    backgroundColor: '#F8FAFC',
                                                                    border: '1px solid #E2E8F0',
                                                                    borderRadius: '6px',
                                                                    padding: '0.18rem 0.45rem',
                                                                    fontSize: '0.70rem',
                                                                    fontWeight: '700',
                                                                    color: '#334155',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <ShoppingBag size={11} style={{ color: '#0D7A57' }} />
                                                                <span>{itemCount} ítems</span>
                                                            </button>
                                                            <div style={{ fontSize: '0.62rem', color: '#0D7A57', fontWeight: '700', marginTop: '1px', cursor: 'pointer' }}>
                                                                Ver productos ↗
                                                            </div>
                                                        </td>

                                                        {/* 5. Novedades / Auditoría QA / PQRS */}
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                            {(() => {
                                                                const activeReturns = (order.billing_returns || []).filter((r: any) => r.status !== 'rejected');
                                                                const activePqrs = (order.customer_service_pqrs || []).filter((p: any) => p.status === 'pending' || p.status === 'in_progress');
                                                                const pendingReturns = activeReturns.filter((r: any) => r.status === 'pending_review');
                                                                const approvedReturns = activeReturns.filter((r: any) => r.status === 'approved');
                                                                const hasOpenInvestigation = activePqrs.length > 0 || pendingReturns.length > 0;
                                                                const isResolvedWithReturns = !hasOpenInvestigation && approvedReturns.length > 0;

                                                                if (hasOpenInvestigation) {
                                                                    const totalOpen = activePqrs.length + pendingReturns.length;
                                                                    const firstPqr = activePqrs[0];
                                                                    const firstReturn = pendingReturns[0] || activeReturns[0];
                                                                    const issueLabel = firstPqr?.subject || firstReturn?.reason || 'Incidencia de calidad en revisión';

                                                                    return (
                                                                        <div>
                                                                            <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', padding: '0.15rem 0.4rem', borderRadius: '5px', fontSize: '0.66rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                <AlertTriangle size={10} /> {totalOpen} {totalOpen === 1 ? (activePqrs.length > 0 ? 'PQRS Abierta' : 'En Auditoría') : 'Incidencias Abiertas'}
                                                                            </span>
                                                                            <div style={{ fontSize: '0.60rem', color: '#DC2626', fontWeight: '600', marginTop: '1px', maxWidth: '105px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issueLabel}>
                                                                                {issueLabel}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (isResolvedWithReturns) {
                                                                    const firstReturn = approvedReturns[0];
                                                                    const issueLabel = firstReturn?.reason || 'Novedad dictaminada por Calidad';
                                                                    
                                                                    // Check if it corresponds to Camino 3 (Nota Crédito en World Office)
                                                                    const associatedPqr = (order.customer_service_pqrs || []).find((p: any) => 
                                                                        (p.resolution_notes || '').toLowerCase().includes('nota crédito') ||
                                                                        (p.resolution_notes || '').toLowerCase().includes('nota credito') ||
                                                                        (p.resolution_notes || '').toLowerCase().includes('opción 3')
                                                                    ) || (order.customer_service_pqrs || [])[0];

                                                                    const returnReasonLower = (firstReturn?.reason || '').toLowerCase();
                                                                    const isCreditNote = returnReasonLower.includes('nota crédito') || 
                                                                        returnReasonLower.includes('nota credito') || 
                                                                        Boolean(firstReturn?.credit_note_number) ||
                                                                        (associatedPqr?.resolution_notes || '').toLowerCase().includes('opción 3') ||
                                                                        (associatedPqr?.resolution_notes || '').toLowerCase().includes('nota crédito');

                                                                    if (isCreditNote) {
                                                                        const rawNotes = (firstReturn?.notes || '') + ' ' + (associatedPqr?.resolution_notes || '');
                                                                        const isWoSettled = rawNotes.includes('[WO_SYNCED:');
                                                                        
                                                                        let woSettledFolio = '';
                                                                        if (isWoSettled) {
                                                                            const match = rawNotes.match(/\[WO_SYNCED:\s*(\{[^\]]+\})\]/);
                                                                            if (match) {
                                                                                try {
                                                                                    const parsed = JSON.parse(match[1]);
                                                                                    woSettledFolio = parsed.folio;
                                                                                } catch(e) {}
                                                                            }
                                                                            if (!woSettledFolio) woSettledFolio = firstReturn?.credit_note_number || 'NC';
                                                                        }

                                                                        const { prodName: cardProdName, ncAmount } = resolveReturnProductAndAmount(firstReturn, associatedPqr);
                                                                        const qtyText = firstReturn?.quantity_returned ? `${firstReturn.quantity_returned} Kg` : '';

                                                                        if (isWoSettled) {
                                                                            return (
                                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                                                                    <span style={{ 
                                                                                        backgroundColor: '#F0FDF4', 
                                                                                        color: '#15803D', 
                                                                                        border: '1px solid #86EFAC', 
                                                                                        padding: '0.18rem 0.45rem', 
                                                                                        borderRadius: '6px', 
                                                                                        fontSize: '0.64rem', 
                                                                                        fontWeight: '800', 
                                                                                        display: 'inline-flex', 
                                                                                        alignItems: 'center', 
                                                                                        gap: '4px' 
                                                                                    }}>
                                                                                        <CheckCircle2 size={11} color="#16A34A" /> NC Radicada WO
                                                                                    </span>
                                                                                    <div style={{ fontSize: '0.62rem', color: '#166534', fontWeight: '700' }}>
                                                                                        {woSettledFolio} • {ncAmount > 0 ? `-${formatNumber(ncAmount)}` : 'Sincronizada'}
                                                                                    </div>
                                                                                </div>
                                                                            );
                                                                        }

                                                                        // PENDIENTE EN WORLD OFFICE: BADGE COMPACTO BRILLANTE & NEÓN (100% AJUSTE ESPACIAL)
                                                                        return (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start', maxWidth: '145px' }}>
                                                                                {/* Badge Neón Eléctrico Compacto */}
                                                                                <div 
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setWoTargetOrder(order);
                                                                                        setWoTargetReturn(firstReturn);
                                                                                        setWoTargetPqr(associatedPqr);
                                                                                        setWoFolioInput(firstReturn?.credit_note_number || `NC-${order.sequence_id}-2010`);
                                                                                        setWoModalOpen(true);
                                                                                    }}
                                                                                    title="Acción Contable: Haga clic para radicar NC en World Office"
                                                                                    style={{ 
                                                                                        background: 'linear-gradient(135deg, #FAF5FF 0%, #F3E8FF 100%)', 
                                                                                        color: '#6B21A8', 
                                                                                        border: '1.5px solid #8B5CF6', 
                                                                                        boxShadow: '0 0 8px rgba(139, 92, 246, 0.4)',
                                                                                        padding: '0.14rem 0.38rem', 
                                                                                        borderRadius: '5px', 
                                                                                        fontSize: '0.60rem', 
                                                                                        fontWeight: '900', 
                                                                                        display: 'inline-flex', 
                                                                                        alignItems: 'center', 
                                                                                        gap: '4px',
                                                                                        cursor: 'pointer',
                                                                                        letterSpacing: '0.01em',
                                                                                        whiteSpace: 'nowrap',
                                                                                        animation: 'woPulse 2s infinite'
                                                                                    }}
                                                                                >
                                                                                    {/* Radar Pulse Dot */}
                                                                                    <span style={{ position: 'relative', display: 'flex', width: '6px', height: '6px' }}>
                                                                                        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', backgroundColor: '#A855F7', opacity: 0.75, animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                                                                                        <span style={{ position: 'relative', borderRadius: '50%', width: '6px', height: '6px', backgroundColor: '#7C3AED' }} />
                                                                                    </span>
                                                                                    <span>⚡ NC WORLD OFFICE</span>
                                                                                </div>

                                                                                {/* Subtexto Informativo de Monto y Peso en 1 Línea */}
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.61rem', whiteSpace: 'nowrap' }}>
                                                                                    <span style={{ color: '#DC2626', fontWeight: '800' }}>
                                                                                        {ncAmount > 0 ? `-${formatNumber(ncAmount)}` : 'Saldo a Favor'}
                                                                                    </span>
                                                                                    {qtyText && (
                                                                                        <span style={{ color: '#6B21A8', fontWeight: '600' }}>
                                                                                            • {qtyText}
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                {/* Botones Tácticos Rápidos */}
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleCopyWorldOfficeCard(order, firstReturn, associatedPqr);
                                                                                        }}
                                                                                        style={{
                                                                                            backgroundColor: woCopiedOrderId === order.id ? '#DCFCE7' : '#FFFFFF',
                                                                                            color: woCopiedOrderId === order.id ? '#15803D' : '#6B21A8',
                                                                                            border: `1px solid ${woCopiedOrderId === order.id ? '#86EFAC' : '#D8B4FE'}`,
                                                                                            borderRadius: '4px',
                                                                                            padding: '0.12rem 0.32rem',
                                                                                            fontSize: '0.58rem',
                                                                                            fontWeight: '700',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '2px',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}
                                                                                        title="Copiar ficha contable para pegar en World Office"
                                                                                    >
                                                                                        {woCopiedOrderId === order.id ? (
                                                                                            <>
                                                                                                <Check size={8} strokeWidth={2.5} /> Copiado
                                                                                            </>
                                                                                        ) : (
                                                                                            <>
                                                                                                <Copy size={8} /> Ficha WO
                                                                                            </>
                                                                                        )}
                                                                                    </button>

                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            setWoTargetOrder(order);
                                                                                            setWoTargetReturn(firstReturn);
                                                                                            setWoTargetPqr(associatedPqr);
                                                                                            setWoFolioInput(firstReturn?.credit_note_number || `NC-${order.sequence_id}-2010`);
                                                                                            setWoModalOpen(true);
                                                                                        }}
                                                                                        style={{
                                                                                            backgroundColor: '#7C3AED',
                                                                                            color: '#FFFFFF',
                                                                                            border: 'none',
                                                                                            borderRadius: '4px',
                                                                                            padding: '0.12rem 0.35rem',
                                                                                            fontSize: '0.58rem',
                                                                                            fontWeight: '700',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '2px',
                                                                                            whiteSpace: 'nowrap'
                                                                                        }}
                                                                                        title="Registrar número de radicado oficial de World Office"
                                                                                    >
                                                                                        <Zap size={8} /> Radicar
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // Fallback para otras novedades no-NC (ej. reposición física, ajuste estándar)
                                                                    return (
                                                                        <div>
                                                                            <span style={{ backgroundColor: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', padding: '0.15rem 0.4rem', borderRadius: '5px', fontSize: '0.66rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                <CheckCircle2 size={10} color="#2563EB" /> {approvedReturns.length} {approvedReturns.length === 1 ? 'Resuelta' : 'Resueltas'}
                                                                            </span>
                                                                            <div style={{ fontSize: '0.60rem', color: '#2563EB', fontWeight: '600', marginTop: '1px', maxWidth: '105px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issueLabel}>
                                                                                {issueLabel}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <div style={{ maxWidth: '115px' }}>
                                                                        <span style={{ backgroundColor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', padding: '0.12rem 0.35rem', borderRadius: '5px', fontSize: '0.60rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                            <CheckCircle2 size={9} /> Conforme
                                                                        </span>
                                                                        <div style={{ fontSize: '0.60rem', color: '#94A3B8', marginTop: '1px' }}>
                                                                            Sin mermas
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 6. Documento que Acompaña el Pedido & Plazo/Forma de Pago */}
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                            {(() => {
                                                                const { docInfo, paymentInfo } = resolveOrderBillingInfo(order, parentProfilesMap);
                                                                const DocIcon = docInfo.icon;
                                                                const PayIcon = paymentInfo.icon;

                                                                return (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                                                        {/* Badge 1: Documento Base de Emisión */}
                                                                        <span 
                                                                            title={`Documento que debe acompañar el pedido: ${docInfo.label}`}
                                                                            style={{
                                                                                backgroundColor: docInfo.bg,
                                                                                color: docInfo.color,
                                                                                border: `1px solid ${docInfo.border}`,
                                                                                padding: '0.10rem 0.30rem', borderRadius: '5px', fontSize: '0.58rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px', whiteSpace: 'nowrap'
                                                                            }}
                                                                        >
                                                                            <DocIcon size={10} style={{ color: docInfo.color, flexShrink: 0 }} />
                                                                            <span>{docInfo.label.replace('Remisión', 'Rem.').replace('Electrónica', 'Elect.')}</span>
                                                                        </span>

                                                                        {/* Badge 2: Descuento Comercial de Acuerdo (Escenario 253 - Si no hay descuento, no se muestra nada) */}
                                                                        {(() => {
                                                                            const discountPct = Number(order.logistics_data?.agreement_discount_pct || order.profiles?.logistics_data?.agreement_discount_pct || 0);
                                                                            if (discountPct <= 0) return null;
                                                                            return (
                                                                                <span
                                                                                    title={`Descuento Comercial de Acuerdo: ${discountPct}% aplicado durante la vigencia`}
                                                                                    style={{
                                                                                        backgroundColor: '#ECFDF5',
                                                                                        color: '#065F46',
                                                                                        border: '1px solid #A7F3D0',
                                                                                        padding: '0.10rem 0.38rem',
                                                                                        borderRadius: '4px',
                                                                                        fontSize: '0.61rem',
                                                                                        fontWeight: '800',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        gap: '3px',
                                                                                        whiteSpace: 'nowrap'
                                                                                    }}
                                                                                >
                                                                                    <Tag size={9} style={{ color: '#059669', flexShrink: 0 }} />
                                                                                    <span>Dto. Acuerdo -{discountPct}%</span>
                                                                                </span>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 7. Estado Operativo & Cuenta Regresiva de Gracia / Corte */}
                                                        <td style={{ padding: '0.4rem 0.35rem' }}>
                                                            {(() => {
                                                                const grace: any = getOrderGraceInfo(order, graceMinutes, cutCloseTime);
                                                                return (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' }}>
                                                                        {/* Badge Principal */}
                                                                        <span style={{
                                                                            backgroundColor: grace.badgeBg,
                                                                            color: grace.badgeColor,
                                                                            border: `1px solid ${grace.badgeBorder}`,
                                                                            padding: '0.12rem 0.42rem',
                                                                            borderRadius: '5px',
                                                                            fontSize: '0.62rem',
                                                                            fontWeight: '800',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            letterSpacing: '0.02em',
                                                                            textTransform: 'uppercase',
                                                                            whiteSpace: 'nowrap'
                                                                        }}>
                                                                            <span style={{
                                                                                width: '5px',
                                                                                height: '5px',
                                                                                borderRadius: '50%',
                                                                                backgroundColor: grace.progressBarBg || 'currentColor'
                                                                            }}></span>
                                                                            {grace.badgeText}
                                                                        </span>

                                                                        {/* Barra de Cuenta Regresiva (Glassmorphism & Ghost Track) */}
                                                                        <div 
                                                                            title={
                                                                                grace.isUnpricedNovelty
                                                                                    ? `Cuenta regresiva contra cierre de corte (${cutCloseTime}): ${grace.cutCountdownLabel}. El área comercial debe asignar precio a esta remisión $0 antes del corte.`
                                                                                    : grace.statusType === 'grace' 
                                                                                    ? `Cuenta regresiva activa: ${grace.remainingMin}m restantes de la ventana de ${graceMinutes}m post-entrega.`
                                                                                    : grace.statusType === 'ready'
                                                                                    ? `Tiempo de gracia de ${graceMinutes}m cumplido sin reclamaciones. Apto para corte contable.`
                                                                                    : grace.statusType === 'resolved_novelty'
                                                                                    ? `Novedad auditada y resuelta en SAC. Dictamen aplicado y apto para corte contable.`
                                                                                    : grace.statusType === 'novelty'
                                                                                    ? `Pedido con novedades o reclamaciones abiertas. Requiere auditoría antes de facturar.`
                                                                                    : `Barra de Gracia: Se activará la cuenta regresiva de ${graceMinutes >= 60 ? `${Math.round(graceMinutes/60)}h` : `${graceMinutes}m`} automáticamente una vez se entregue el pedido.`
                                                                            }
                                                                            style={{
                                                                                width: '100%',
                                                                                maxWidth: '80px', height: '4px',
                                                                                borderRadius: '9999px',
                                                                                backgroundColor: grace.statusType === 'in_process' 
                                                                                    ? 'rgba(241, 245, 249, 0.95)' 
                                                                                    : 'rgba(226, 232, 240, 0.75)',
                                                                                backdropFilter: 'blur(4px)',
                                                                                border: grace.statusType === 'in_process' ? '1px dashed #CBD5E1' : '1px solid rgba(203, 213, 225, 0.5)',
                                                                                overflow: 'hidden',
                                                                                position: 'relative',
                                                                                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)'
                                                                            }}
                                                                        >
                                                                            {grace.progressPct > 0 ? (
                                                                                <div style={{
                                                                                    width: `${grace.progressPct}%`,
                                                                                    height: '100%',
                                                                                    backgroundColor: grace.progressBarBg,
                                                                                    borderRadius: '9999px',
                                                                                    transition: 'width 0.4s ease'
                                                                                }} />
                                                                            ) : grace.statusType === 'in_process' ? (
                                                                                <div style={{
                                                                                    width: '20%',
                                                                                    height: '100%',
                                                                                    backgroundColor: 'rgba(203, 213, 225, 0.4)',
                                                                                    borderRadius: '9999px'
                                                                                }} />
                                                                            ) : null}
                                                                        </div>

                                                                        {/* Micro-telemetría explicativa */}
                                                                        <div style={{ fontSize: '0.58rem', color: grace.isUnpricedNovelty ? (grace.isCutExpired ? '#DC2626' : '#C2410C') : grace.statusType === 'grace' ? '#B45309' : grace.statusType === 'ready' ? '#065F46' : grace.statusType === 'resolved_novelty' ? '#1D4ED8' : '#94A3B8', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                            {grace.isUnpricedNovelty ? (
                                                                                <>
                                                                                    <Timer size={9} style={{ color: grace.isCutExpired ? '#DC2626' : '#EA580C', flexShrink: 0 }} />
                                                                                    <span>{grace.cutCountdownLabel}</span>
                                                                                </>
                                                                            ) : grace.statusType === 'grace' ? (
                                                                                <>
                                                                                    <Clock size={9} style={{ color: '#D97706', flexShrink: 0 }} />
                                                                                    <span>{grace.remainingMin}m restantes</span>
                                                                                </>
                                                                            ) : grace.statusType === 'ready' ? (
                                                                                <>
                                                                                    <CheckCircle2 size={9} style={{ color: '#059669', flexShrink: 0 }} />
                                                                                    <span>{graceMinutes >= 60 ? `${Math.round(graceMinutes/60)}h` : `${graceMinutes}m`} cumplidas</span>
                                                                                </>
                                                                            ) : grace.statusType === 'resolved_novelty' ? (
                                                                                <>
                                                                                    <CheckCircle2 size={9} style={{ color: '#2563EB', flexShrink: 0 }} />
                                                                                    <span>Dictamen aplicado</span>
                                                                                </>
                                                                            ) : grace.statusType === 'novelty' ? (
                                                                                <>
                                                                                    <AlertTriangle size={9} style={{ color: '#DC2626', flexShrink: 0 }} />
                                                                                    <span>Pendiente Calidad</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <Clock size={9} style={{ color: '#94A3B8', flexShrink: 0 }} />
                                                                                    <span>Inicia en entrega</span>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 8. Total Pedido */}
                                                        <td style={{ padding: '0.4rem 0.35rem', textAlign: 'right' }}>
                                                            {(() => {
                                                                const rep = getOrderReplacementInfo(order);
                                                                if (rep.isReplacement) {
                                                                    return (
                                                                        <div>
                                                                            <div style={{ fontWeight: '800', color: '#047857', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                                                                                $0 COP
                                                                            </div>
                                                                            <div style={{ fontSize: '0.60rem', color: '#065F46', fontWeight: '800', backgroundColor: '#D1FAE5', border: '1px solid #A7F3D0', padding: '1px 5px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                                                                <CheckCircle2 size={9} style={{ color: '#059669', flexShrink: 0 }} />
                                                                                <span>Garantía / Sin Cobro</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                const isUnpricedDispatch = order.admin_notes?.includes('DESPACHADO SIN PRECIO') || order.admin_notes?.includes('SE DESPACHÓ SIN PRECIO') || (order.logistics_data?.is_off_agreement_split && !order.logistics_data?.off_agreement_priced);
                                                                const isOpenConsumption = !isUnpricedDispatch && (order.total === 0 || order.admin_notes?.includes('CONSUMO ABIERTO'));

                                                                if (isUnpricedDispatch) {
                                                                    return (
                                                                        <div>
                                                                            <div style={{ fontWeight: '800', color: '#DC2626', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                                                                <Zap size={11} className="text-red-500 animate-pulse" />
                                                                                {formatMoney(order.total || 0)}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.60rem', color: '#991B1B', fontWeight: '800', backgroundColor: '#FEE2E2', border: '1px solid #FCA5A5', padding: '1px 5px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                                                                <AlertTriangle size={9} style={{ color: '#DC2626', flexShrink: 0 }} />
                                                                                <span>Fuera de Acuerdo ($0)</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                if (isOpenConsumption) {
                                                                    return (
                                                                        <div>
                                                                            <div style={{ fontWeight: '800', color: '#D97706', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                                                                                <Zap size={11} className="text-amber-500 animate-pulse" />
                                                                                {formatMoney(order.total || 0)}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.60rem', color: '#B45309', fontWeight: '700', backgroundColor: '#FEF3C7', padding: '1px 4px', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                                                                                <AlertTriangle size={9} style={{ color: '#D97706', flexShrink: 0 }} />
                                                                                <span>Consumo Abierto</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <>
                                                                        <div style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                                                                            {formatMoney(order.total || 0)}
                                                                        </div>
                                                                        <div style={{ fontSize: '0.62rem', color: '#64748B' }}>
                                                                            Tarifa {order.profiles?.iva_responsible ? '19% IVA' : '0% IVA'}
                                                                        </div>
                                                                    </>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 9. Acciones Rápidas */}
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                {(() => {
                                                                    const rep = getOrderReplacementInfo(order);
                                                                    if (rep.isReplacement) return null;

                                                                    const isUnpricedDispatch = order.admin_notes?.includes('DESPACHADO SIN PRECIO') || order.admin_notes?.includes('SE DESPACHÓ SIN PRECIO') || (order.logistics_data?.is_off_agreement_split && !order.logistics_data?.off_agreement_priced);
                                                                    if (isUnpricedDispatch) {
                                                                        return (
                                                                            <span 
                                                                                title="La fijación de precios fuera de acuerdo es competencia exclusiva del Área Comercial (gestión en módulo de Pedidos)"
                                                                                style={{
                                                                                    backgroundColor: '#FEF2F2',
                                                                                    color: '#991B1B',
                                                                                    border: '1px solid #FCA5A5',
                                                                                    padding: '0.20rem 0.40rem',
                                                                                    borderRadius: '5px',
                                                                                    fontSize: '0.64rem',
                                                                                    fontWeight: '800',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '3px'
                                                                                }}
                                                                            >
                                                                                <AlertTriangle size={10} style={{ color: '#DC2626' }} /> Tarifa Comercial Pendiente
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenOrderDetail(order)}
                                                                    title="Ver productos y auditoría del pedido"
                                                                    style={{
                                                                        backgroundColor: '#F1F5F9',
                                                                        color: '#0F172A',
                                                                        border: '1px solid #CBD5E1',
                                                                        padding: '0.2rem 0.35rem', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '2px', fontSize: '0.64rem',
                                                                        fontWeight: '700'
                                                                    }}
                                                                >
                                                                    <Eye size={11} style={{ color: '#0D7A57' }} /> Detalle
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => window.open(`/admin/orders/contingency-print?mode=remissions&orderIds=${order.id}&ids=${order.id}`, '_blank')}
                                                                    title="Imprimir remisión / contingencia"
                                                                    style={{
                                                                        backgroundColor: 'white',
                                                                        color: '#475569',
                                                                        border: '1px solid #CBD5E1',
                                                                        padding: '0.2rem 0.35rem', borderRadius: '4px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                                                    <Printer size={10} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* SUBTAB: DEVOLUCIONES Y NOVEDADES */}
                        {subTab === 'returns' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {/* Header y Filtros Específicos de Novedades */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                                    {/* Segmented Control Pills */}
                                    <div style={{ display: 'inline-flex', gap: '3px', backgroundColor: '#F1F5F9', padding: '3px', borderRadius: '8px' }}>
                                        <button
                                            type="button"
                                            onClick={() => setReturnsViewMode('credit_notes')}
                                            style={{
                                                border: 'none',
                                                padding: '0.3rem 0.75rem',
                                                borderRadius: '6px',
                                                fontSize: '0.72rem',
                                                fontWeight: returnsViewMode === 'credit_notes' ? '800' : '600',
                                                backgroundColor: returnsViewMode === 'credit_notes' ? '#FFFFFF' : 'transparent',
                                                color: returnsViewMode === 'credit_notes' ? '#6B21A8' : '#64748B',
                                                boxShadow: returnsViewMode === 'credit_notes' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <Zap size={12} color={returnsViewMode === 'credit_notes' ? '#7C3AED' : '#64748B'} />
                                            <span>Notas Crédito WO ({creditNotesItems.length})</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReturnsViewMode('pending_review')}
                                            style={{
                                                border: 'none',
                                                padding: '0.3rem 0.75rem',
                                                borderRadius: '6px',
                                                fontSize: '0.72rem',
                                                fontWeight: returnsViewMode === 'pending_review' ? '800' : '600',
                                                backgroundColor: returnsViewMode === 'pending_review' ? '#FFFFFF' : 'transparent',
                                                color: returnsViewMode === 'pending_review' ? '#DC2626' : '#64748B',
                                                boxShadow: returnsViewMode === 'pending_review' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <AlertCircle size={12} color={returnsViewMode === 'pending_review' ? '#DC2626' : '#64748B'} />
                                            <span>Pendientes de Revisión ({returns.filter(r => r.status === 'pending_review').length})</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setReturnsViewMode('all')}
                                            style={{
                                                border: 'none',
                                                padding: '0.3rem 0.75rem',
                                                borderRadius: '6px',
                                                fontSize: '0.72rem',
                                                fontWeight: returnsViewMode === 'all' ? '800' : '600',
                                                backgroundColor: returnsViewMode === 'all' ? '#FFFFFF' : 'transparent',
                                                color: returnsViewMode === 'all' ? '#0F172A' : '#64748B',
                                                boxShadow: returnsViewMode === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <Layers size={12} color={returnsViewMode === 'all' ? '#0F172A' : '#64748B'} />
                                            <span>Todas ({returns.length})</span>
                                        </button>
                                    </div>

                                    {/* Action: Descargar Excel NC del Día */}
                                    <button
                                        type="button"
                                        onClick={handleExportCreditNotesExcel}
                                        disabled={creditNotesItems.length === 0 || isProcessing}
                                        style={{
                                            backgroundColor: '#0D7A57',
                                            color: '#FFFFFF',
                                            border: 'none',
                                            padding: '0.38rem 0.85rem',
                                            borderRadius: '7px',
                                            fontWeight: '800',
                                            fontSize: '0.75rem',
                                            cursor: creditNotesItems.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
                                            opacity: creditNotesItems.length === 0 || isProcessing ? 0.6 : 1,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            boxShadow: '0 2px 5px rgba(13, 122, 87, 0.25)'
                                        }}
                                        title="Descargar archivo Excel con Cliente, Sucursal, Producto, Cantidad y Valor"
                                    >
                                        <FileSpreadsheet size={14} />
                                        <span>Descargar Novedades NC (Excel)</span>
                                    </button>
                                </div>

                                {/* Table Display: Modo Notas Crédito WO vs Modo Devoluciones Tradicional */}
                                {returnsViewMode === 'credit_notes' ? (
                                    <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', position: 'relative', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)', overflow: 'visible' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#FAF5FF' }}>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF', borderTopLeftRadius: '14px' }}>Fecha / Pedido</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Cliente (Matriz)</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Sucursal / Sede</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Producto Afectado</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Cantidad</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Valor Nota Crédito</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Factura / Consecutivo WO</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF' }}>Motivo / Justificación</th>
                                                    <th style={{ padding: '0.55rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: '#6B21A8', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '2px solid #E9D5FF', borderTopRightRadius: '14px' }}>Acción</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredCreditNotes.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} style={{ padding: '2.75rem 1.5rem', textAlign: 'center' }}>
                                                            <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                                                                <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#FAF5FF', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                                                                    <CheckCircle2 size={22} />
                                                                </div>
                                                                <h3 style={{ fontWeight: '900', color: '#0F172A', margin: '0 0 0.25rem 0', fontSize: '1.05rem' }}>No hay notas crédito para este filtro</h3>
                                                                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>No se encontraron novedades de calidad con dictamen de nota crédito en la fecha seleccionada.</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredCreditNotes.map((nc, idx) => {
                                                        const matchingReturn = returns.find(r => r.orders?.sequence_id === nc.orderSequence);
                                                        const matchingOrder = matchingReturn?.orders;

                                                        return (
                                                            <tr key={`nc-${idx}-${nc.orderSequence}`} style={{ borderBottom: '1px solid #E2E8F0', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#FAF5FF'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>#{nc.orderSequence || 'N/A'}</div>
                                                                    <div style={{ fontSize: '0.64rem', color: '#64748B' }}>{nc.date}</div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.78rem' }}>{nc.clientMatriz}</div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <div style={{ fontSize: '0.75rem', color: '#334155', fontWeight: '600' }}>{nc.sucursal}</div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.78rem' }}>{nc.productName}</div>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <span style={{ fontWeight: '800', color: '#991B1B', backgroundColor: '#FEF2F2', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #FECACA', fontSize: '0.74rem' }}>
                                                                        {nc.quantity} {nc.unitOfMeasure}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <span style={{ fontWeight: '900', color: '#DC2626', fontSize: '0.82rem', fontVariantNumeric: 'tabular-nums' }}>
                                                                        {nc.amount > 0 ? `-${nc.amount.toLocaleString('es-CO')} COP` : 'Saldo a Favor'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                    <div style={{ fontSize: '0.72rem', color: '#0F172A', fontWeight: '700' }}>{nc.invoiceRef || 'Sin FV'}</div>
                                                                    <span style={{ fontSize: '0.65rem', color: '#7C3AED', fontWeight: '800' }}>{nc.creditNoteFolio}</span>
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem', maxWidth: '240px' }}>
                                                                    <div style={{ fontSize: '0.72rem', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nc.reason}>
                                                                        {nc.reason}
                                                                    </div>
                                                                    {nc.pqrFolio && <span style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: '700' }}>{nc.pqrFolio}</span>}
                                                                </td>
                                                                <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                                                    {matchingOrder ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                setWoTargetOrder(matchingOrder);
                                                                                setWoTargetReturn(matchingReturn);
                                                                                setWoTargetPqr((matchingOrder.customer_service_pqrs || [])[0]);
                                                                                setWoFolioInput(nc.creditNoteFolio || `NC-${nc.orderSequence}-2010`);
                                                                                setWoModalOpen(true);
                                                                            }}
                                                                            style={{
                                                                                backgroundColor: '#7C3AED',
                                                                                color: 'white',
                                                                                border: 'none',
                                                                                padding: '0.28rem 0.55rem',
                                                                                borderRadius: '5px',
                                                                                fontWeight: '800',
                                                                                fontSize: '0.68rem',
                                                                                cursor: 'pointer',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px'
                                                                            }}
                                                                            title="Radicar comprobante contable en World Office"
                                                                        >
                                                                            <Zap size={11} /> Radicar WO
                                                                        </button>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>Aprobada</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', position: 'relative', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)', overflow: 'visible' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, borderTopLeftRadius: '14px', position: 'sticky', top: '169px', zIndex: 30 }}># Pedido</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, position: 'sticky', top: '169px', zIndex: 30 }}>Producto / Ítem</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, position: 'sticky', top: '169px', zIndex: 30 }}>Cantidad Devuelta</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, position: 'sticky', top: '169px', zIndex: 30 }}>Motivo / Novedad</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, position: 'sticky', top: '169px', zIndex: 30 }}>Estado</th>
                                                    <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, borderTopRightRadius: '14px', position: 'sticky', top: '169px', zIndex: 30 }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {returns.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} style={{ padding: '2.75rem 1.5rem', textAlign: 'center' }}>
                                                            <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                                                                <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#ECFDF5', color: '#0D7A57', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
                                                                    <CheckCircle2 size={22} />
                                                                </div>
                                                                <h3 style={{ fontWeight: '900', color: '#0F172A', margin: '0 0 0.25rem 0', fontSize: '1.05rem' }}>No hay devoluciones pendientes</h3>
                                                                <p style={{ fontSize: '0.8rem', color: '#64748B', margin: 0 }}>Todas las novedades de transportadores se encuentran al día.</p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : filteredReturns.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                                                            No se encontraron devoluciones que coincidan con &quot;{billingSearchQuery}&quot;
                                                        </td>
                                                    </tr>
                                                ) : filteredReturns.map((ret) => {
                                                    const orderNum = getFriendlyOrderId({ created_at: ret.orders?.created_at, sequence_id: ret.orders?.sequence_id });

                                                    return (
                                                        <tr key={ret.id} style={{ borderBottom: '1px solid #E2E8F0', transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>#{orderNum}</span>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.78rem' }}>{ret.products?.name || 'Producto sin nombre'}</div>
                                                                {ret.products?.sku && <span style={{ fontSize: '0.65rem', color: THEME.colors.textSecondary }}>SKU: {ret.products.sku}</span>}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <span style={{ fontWeight: '800', color: '#991B1B', backgroundColor: '#FEF2F2', padding: '0.15rem 0.45rem', borderRadius: '4px', border: '1px solid #FECACA', fontSize: '0.74rem' }}>
                                                                    {ret.quantity_returned} {ret.products?.unit_of_measure || 'Kg'}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <div style={{ fontSize: '0.76rem', color: THEME.colors.textMain, fontWeight: '600' }}>{ret.reason}</div>
                                                                {ret.photo_url && (
                                                                    <a href={ret.photo_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.66rem', color: THEME.colors.primary, textDecoration: 'underline', display: 'inline-block', marginTop: '2px' }}>
                                                                        Ver evidencia fotográfica
                                                                    </a>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', padding: '0.15rem 0.45rem', borderRadius: '99px', fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase' }}>
                                                                    {ret.status}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                                                <div style={{ display: 'inline-flex', gap: '5px' }}>
                                                                    {ret.status === 'pending_review' ? (
                                                                        <>
                                                                            <button
                                                                                onClick={() => handleProcessReturn(ret, 'approved')}
                                                                                style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.35rem 0.7rem', borderRadius: '6px', fontWeight: '800', fontSize: '0.72rem', cursor: 'pointer' }}
                                                                            >
                                                                                Aprobar Descuento
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleProcessReturn(ret, 'rejected')}
                                                                                style={{ backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '0.35rem 0.7rem', borderRadius: '6px', fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer' }}
                                                                            >
                                                                                Rechazar
                                                                            </button>
                                                                        </>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.70rem', color: '#059669', fontWeight: '800' }}>Aprobado</span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* PORTFOLIO SUBMODULE */}
                {activeTab === 'portfolio' && (
                    <div>
                        {portfolioSubTab === 'invoices' ? (
                            <>
                                {/* 1. Aging Receivable Interactive Metric Cards */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
                                    {/* Card 1: Al Día */}
                                    <div
                                        onClick={() => setPortfolioStatusFilter(prev => prev === 'al_dia' ? 'all' : 'al_dia')}
                                        style={{
                                            backgroundColor: 'white',
                                            padding: '0.85rem 1rem',
                                            borderRadius: '12px',
                                            border: portfolioStatusFilter === 'al_dia' ? '2px solid #059669' : '1px solid #E2E8F0',
                                            boxShadow: portfolioStatusFilter === 'al_dia' ? '0 0 0 3px rgba(5, 150, 105, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <CheckCircle2 size={12} /> Al Día (Vigente)
                                            </span>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#065F46', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '1px 6px', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                                {aging.countAlDia}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(aging.alDia)}
                                        </div>
                                    </div>

                                    {/* Card 2: Vencido 1 a 15 días */}
                                    <div
                                        onClick={() => setPortfolioStatusFilter(prev => prev === 'vencido_1_15' ? 'all' : 'vencido_1_15')}
                                        style={{
                                            backgroundColor: 'white',
                                            padding: '0.85rem 1rem',
                                            borderRadius: '12px',
                                            border: portfolioStatusFilter === 'vencido_1_15' ? '2px solid #D97706' : '1px solid #E2E8F0',
                                            boxShadow: portfolioStatusFilter === 'vencido_1_15' ? '0 0 0 3px rgba(217, 119, 6, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#D97706', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <Clock size={12} /> Vencido 1 a 15 días
                                            </span>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#92400E', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', padding: '1px 6px', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                                {aging.countVencido1_15}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#D97706', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(aging.vencido1_15)}
                                        </div>
                                    </div>

                                    {/* Card 3: Vencido 16 a 30 días */}
                                    <div
                                        onClick={() => setPortfolioStatusFilter(prev => prev === 'vencido_16_30' ? 'all' : 'vencido_16_30')}
                                        style={{
                                            backgroundColor: 'white',
                                            padding: '0.85rem 1rem',
                                            borderRadius: '12px',
                                            border: portfolioStatusFilter === 'vencido_16_30' ? '2px solid #EA580C' : '1px solid #E2E8F0',
                                            boxShadow: portfolioStatusFilter === 'vencido_16_30' ? '0 0 0 3px rgba(234, 88, 12, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#EA580C', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <AlertTriangle size={12} /> Vencido 16 a 30 días
                                            </span>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#9A3412', backgroundColor: '#FFF7ED', border: '1px solid #FFEDD5', padding: '1px 6px', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                                {aging.countVencido16_30}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#EA580C', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(aging.vencido16_30)}
                                        </div>
                                    </div>

                                    {/* Card 4: Vencido > 30 días */}
                                    <div
                                        onClick={() => setPortfolioStatusFilter(prev => prev === 'vencido_30_mas' ? 'all' : 'vencido_30_mas')}
                                        style={{
                                            backgroundColor: 'white',
                                            padding: '0.85rem 1rem',
                                            borderRadius: '12px',
                                            border: portfolioStatusFilter === 'vencido_30_mas' ? '2px solid #DC2626' : '1px solid #E2E8F0',
                                            boxShadow: portfolioStatusFilter === 'vencido_30_mas' ? '0 0 0 3px rgba(220, 38, 38, 0.12)' : '0 1px 3px rgba(0,0,0,0.02)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <AlertCircle size={12} /> Vencido &gt; 30 días
                                            </span>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', color: '#991B1B', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', padding: '1px 6px', borderRadius: '4px', fontVariantNumeric: 'tabular-nums' }}>
                                                {aging.countVencido30Mas}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '1.25rem', fontWeight: '900', color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(aging.vencido30Mas)}
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Invoices Table Card */}
                                <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'visible', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)' }}>
                                    {/* Card Header con Sub-toolbar de Filtros Rápidos */}
                                    <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <h2 style={{ fontSize: '0.92rem', fontWeight: '900', margin: 0, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <FileText size={15} style={{ color: '#0D7A57' }} /> Facturas y Cuentas por Cobrar
                                                </h2>

                                                {/* Píldoras de Filtro Rápido */}
                                                <div style={{ display: 'inline-flex', gap: '3px', backgroundColor: '#F1F5F9', padding: '2px 4px', borderRadius: '6px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPortfolioStatusFilter('all')}
                                                        style={{
                                                            border: 'none',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: portfolioStatusFilter === 'all' ? '800' : '600',
                                                            backgroundColor: portfolioStatusFilter === 'all' ? '#0F172A' : 'transparent',
                                                            color: portfolioStatusFilter === 'all' ? 'white' : '#64748B',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <span>Todas ({invoices.length})</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPortfolioStatusFilter('al_dia')}
                                                        style={{
                                                            border: 'none',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: portfolioStatusFilter === 'al_dia' ? '800' : '600',
                                                            backgroundColor: portfolioStatusFilter === 'al_dia' ? '#059669' : 'transparent',
                                                            color: portfolioStatusFilter === 'al_dia' ? 'white' : '#065F46',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <CheckCircle2 size={11} />
                                                        <span>Al Día ({aging.countAlDia})</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPortfolioStatusFilter('vencido_1_15')}
                                                        style={{
                                                            border: 'none',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: portfolioStatusFilter === 'vencido_1_15' ? '800' : '600',
                                                            backgroundColor: portfolioStatusFilter === 'vencido_1_15' ? '#D97706' : 'transparent',
                                                            color: portfolioStatusFilter === 'vencido_1_15' ? 'white' : '#92400E',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <Clock size={11} />
                                                        <span>1 a 15d ({aging.countVencido1_15})</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPortfolioStatusFilter('vencido_16_30')}
                                                        style={{
                                                            border: 'none',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: portfolioStatusFilter === 'vencido_16_30' ? '800' : '600',
                                                            backgroundColor: portfolioStatusFilter === 'vencido_16_30' ? '#EA580C' : 'transparent',
                                                            color: portfolioStatusFilter === 'vencido_16_30' ? 'white' : '#9A3412',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <AlertTriangle size={11} />
                                                        <span>16 a 30d ({aging.countVencido16_30})</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPortfolioStatusFilter('vencido_30_mas')}
                                                        style={{
                                                            border: 'none',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: portfolioStatusFilter === 'vencido_30_mas' ? '800' : '600',
                                                            backgroundColor: portfolioStatusFilter === 'vencido_30_mas' ? '#DC2626' : 'transparent',
                                                            color: portfolioStatusFilter === 'vencido_30_mas' ? 'white' : '#991B1B',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <AlertCircle size={11} />
                                                        <span>&gt; 30d ({aging.countVencido30Mas})</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPortfolioStatusFilter('paid')}
                                                        style={{
                                                            border: 'none',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.65rem',
                                                            fontWeight: portfolioStatusFilter === 'paid' ? '800' : '600',
                                                            backgroundColor: portfolioStatusFilter === 'paid' ? '#0D7A57' : 'transparent',
                                                            color: portfolioStatusFilter === 'paid' ? 'white' : '#065F46',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <Check size={11} />
                                                        <span>Pagadas ({aging.countPaid})</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                                Detalle de facturación electrónica emitida y estado de pagos de clientes
                                            </p>
                                        </div>
                                    </div>

                                    {/* 3. Tabla Chromium con Thead Sticky en 169px */}
                                    <div style={{ overflow: 'visible' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Prefijo & # Factura</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cliente / Razón Social</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Vencimiento & Plazo</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Base Imponible</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>IVA</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Neto</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado Cartera</th>
                                                    <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {invoices.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} style={{ padding: '2.75rem 1.5rem', textAlign: 'center' }}>
                                                            <div style={{ maxWidth: '440px', margin: '0 auto' }}>
                                                                <div style={{ width: '46px', height: '46px', borderRadius: '12px', backgroundColor: '#EAEFEA', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#0D7A57', marginBottom: '0.75rem' }}>
                                                                    <Wallet size={22} />
                                                                </div>
                                                                <h3 style={{ fontSize: '1.05rem', fontWeight: '900', color: THEME.colors.textMain, marginBottom: '0.25rem' }}>
                                                                    No hay facturas emitidas en cartera
                                                                </h3>
                                                                <p style={{ color: THEME.colors.textSecondary, fontSize: '0.8rem', margin: 0 }}>
                                                                    Al generar cortes diarios, las cuentas por cobrar y facturas de venta se gestionarán aquí.
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : filteredInvoices.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                                                            No se encontraron facturas con los filtros aplicados.
                                                        </td>
                                                    </tr>
                                                ) : filteredInvoices.map((inv) => {
                                                    const client = inv.orders?.profiles;
                                                    const today = new Date();
                                                    today.setHours(0,0,0,0);
                                                    const due = new Date(inv.due_date);
                                                    due.setHours(0,0,0,0);
                                                    const isOverdue = inv.payment_status !== 'paid' && due < today;

                                                    return (
                                                        <tr key={inv.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <span style={{ fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>{inv.invoice_number}</span>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.78rem' }}>{client?.company_name || 'Cliente sin nombre'}</div>
                                                                <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '1px' }}>NIT: {client?.nit || 'N/A'}</div>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                <div style={{ fontSize: '0.76rem', fontWeight: '700', color: isOverdue ? '#DC2626' : THEME.colors.textMain }}>{inv.due_date}</div>
                                                                <div style={{ fontSize: '0.68rem', color: '#64748B' }}>Plazo: {client?.payment_days || 0} días</div>
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: '600', color: '#334155' }}>
                                                                {formatMoney(inv.total_base)}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: '600', color: '#334155' }}>
                                                                {formatMoney(inv.total_tax)}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: '800', color: THEME.colors.textMain, fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                                                                {formatMoney(inv.total_final)}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem' }}>
                                                                {inv.payment_status === 'paid' ? (
                                                                    <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '0.14rem 0.45rem', borderRadius: '99px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                        <CheckCircle2 size={10} /> PAGADA
                                                                    </span>
                                                                ) : isOverdue ? (
                                                                    <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', padding: '0.14rem 0.45rem', borderRadius: '99px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                        <AlertCircle size={10} /> VENCIDA
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '0.14rem 0.45rem', borderRadius: '99px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                        <Clock size={10} /> PENDIENTE
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                                                {inv.payment_status !== 'paid' && (
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedInvoice(inv);
                                                                            setIsPaymentModalOpen(true);
                                                                        }}
                                                                        style={{
                                                                            backgroundColor: '#0D7A57',
                                                                            color: 'white',
                                                                            border: 'none',
                                                                            padding: '0.36rem 0.75rem',
                                                                            borderRadius: '7px',
                                                                            fontWeight: '800',
                                                                            fontSize: '0.72rem',
                                                                            cursor: 'pointer',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px'
                                                                        }}
                                                                    >
                                                                        <CreditCard size={12} /> Registrar Pago
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : (
                            /* Dossiers Sub-tab View */
                            <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'visible', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)' }}>
                                <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <h2 style={{ fontSize: '0.92rem', fontWeight: '900', margin: 0, color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <FileSignature size={15} style={{ color: '#0D7A57' }} /> Fichas de Conocimiento y Pagarés B2B
                                            </h2>
                                            
                                            {/* Píldoras de Filtro Rápido */}
                                            <div style={{ display: 'inline-flex', gap: '3px', backgroundColor: '#F1F5F9', padding: '2px 4px', borderRadius: '6px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setDossierStatusFilter('all')}
                                                    style={{
                                                        border: 'none',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: dossierStatusFilter === 'all' ? '800' : '600',
                                                        backgroundColor: dossierStatusFilter === 'all' ? '#0F172A' : 'transparent',
                                                        color: dossierStatusFilter === 'all' ? 'white' : '#64748B',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <span>Todos ({b2bClients.length})</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDossierStatusFilter('aprobado')}
                                                    style={{
                                                        border: 'none',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: dossierStatusFilter === 'aprobado' ? '800' : '600',
                                                        backgroundColor: dossierStatusFilter === 'aprobado' ? '#059669' : 'transparent',
                                                        color: dossierStatusFilter === 'aprobado' ? 'white' : '#065F46',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <CheckCircle2 size={11} />
                                                    <span>Aprobados ({dossierCounts.aprobados})</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDossierStatusFilter('radicado')}
                                                    style={{
                                                        border: 'none',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: dossierStatusFilter === 'radicado' ? '800' : '600',
                                                        backgroundColor: dossierStatusFilter === 'radicado' ? '#D97706' : 'transparent',
                                                        color: dossierStatusFilter === 'radicado' ? 'white' : '#92400E',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <Clock size={11} />
                                                    <span>Radicados ({dossierCounts.radicados})</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setDossierStatusFilter('pendiente')}
                                                    style={{
                                                        border: 'none',
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.65rem',
                                                        fontWeight: dossierStatusFilter === 'pendiente' ? '800' : '600',
                                                        backgroundColor: dossierStatusFilter === 'pendiente' ? '#64748B' : 'transparent',
                                                        color: dossierStatusFilter === 'pendiente' ? 'white' : '#475569',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    <AlertCircle size={11} />
                                                    <span>Pendientes ({dossierCounts.pendientes})</span>
                                                </button>
                                            </div>
                                        </div>
                                        <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                            Gestión de límites de crédito, cupos solicitados y pagarés en blanco
                                        </p>
                                    </div>
                                </div>

                                <div style={{ overflow: 'visible' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cliente / Razón Social</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>NIT</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Límite de Crédito</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Estado Ficha</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cupo Solicitado</th>
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredDossiers.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                                                        No se encontraron expedientes B2B con los criterios seleccionados.
                                                    </td>
                                                </tr>
                                            ) : filteredDossiers.map((client) => {
                                                const dossier = dossiersDataMap[client.id];
                                                const hasDossier = !!dossier;
                                                const statusText = hasDossier ? (dossier.aprobacion_empresa?.cupo_aprobado > 0 ? 'APROBADO' : 'RADICADO') : 'PENDIENTE';
                                                const statusColor = statusText === 'APROBADO' ? '#ECFDF5' : statusText === 'RADICADO' ? '#FFFBEB' : '#F1F5F9';
                                                const statusTextColor = statusText === 'APROBADO' ? '#065F46' : statusText === 'RADICADO' ? '#92400E' : '#475569';
                                                const statusBorder = statusText === 'APROBADO' ? '#A7F3D0' : statusText === 'RADICADO' ? '#FDE68A' : '#CBD5E1';
                                                const StatusIcon = statusText === 'APROBADO' ? CheckCircle2 : statusText === 'RADICADO' ? Clock : AlertCircle;

                                                return (
                                                    <tr key={client.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, transition: 'all 0.15s ease' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                                            <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.78rem' }}>{client.company_name || 'Sin nombre'}</div>
                                                            <div style={{ fontSize: '0.68rem', color: THEME.colors.textSecondary, marginTop: '1px' }}>{client.razon_social || client.company_name}</div>
                                                        </td>
                                                        <td style={{ padding: '0.65rem 0.75rem', fontVariantNumeric: 'tabular-nums', fontWeight: '600', color: '#334155' }}>
                                                            {client.nit || 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '0.65rem 0.75rem', fontVariantNumeric: 'tabular-nums', fontWeight: '800', color: '#0F172A' }}>
                                                            {hasDossier && dossier.aprobacion_empresa?.cupo_aprobado > 0 
                                                                ? formatMoney(dossier.aprobacion_empresa.cupo_aprobado) 
                                                                : 'Sin cupo'}
                                                        </td>
                                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                                            <span style={{ backgroundColor: statusColor, color: statusTextColor, border: `1px solid ${statusBorder}`, padding: '0.14rem 0.45rem', borderRadius: '99px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                <StatusIcon size={10} /> {statusText}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '0.65rem 0.75rem', fontVariantNumeric: 'tabular-nums', fontWeight: '700', color: '#334155' }}>
                                                            {hasDossier ? formatMoney(dossier.cupo_solicitado) : 'N/A'}
                                                        </td>
                                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                                            <button
                                                                onClick={() => handleOpenDossierModal(client)}
                                                                style={{ backgroundColor: 'white', border: '1px solid #CBD5E1', padding: '0.35rem 0.7rem', borderRadius: '7px', fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer', marginRight: '0.4rem', transition: 'all 0.15s', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#334155' }}
                                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                                            >
                                                                <Edit2 size={12} /> Editar
                                                            </button>
                                                            {hasDossier && (
                                                                <a
                                                                    href={`/admin/commercial/billing/print-credit/${client.id}`}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#0D7A57', color: 'white', padding: '0.35rem 0.7rem', borderRadius: '7px', fontWeight: '800', fontSize: '0.72rem', textDecoration: 'none', transition: 'all 0.15s', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)' }}
                                                                >
                                                                    <Printer size={12} /> Imprimir
                                                                </a>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* CONFIGURATION SUBMODULE */}
                {activeTab === 'configuration' && (
                    <div style={{ maxWidth: '960px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <form onSubmit={handleSaveConfiguration} style={{ backgroundColor: 'white', borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.75rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '900', margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Settings size={17} style={{ color: '#0D7A57' }} /> Parámetros y Secuencias DIAN (COM-29)
                                    </h3>
                                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                        Configuración centralizada de prefijos, consecutivos y rangos de resolución
                                    </p>
                                </div>
                                <button
                                    type="submit"
                                    disabled={savingConfig}
                                    style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.45rem 1.1rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)' }}
                                >
                                    <FileCheck size={14} /> {savingConfig ? 'Guardando...' : 'Guardar Parámetros'}
                                </button>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.2rem' }}>
                                <div>
                                    <label style={labelStyle}>Prefijo Factura Electrónica</label>
                                    <input
                                        type="text"
                                        value={invoicePrefix}
                                        onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                                        style={{ ...inputStyle, fontWeight: '800' }}
                                        placeholder="Ej: SETT"
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Próximo Consecutivo Factura</label>
                                    <input
                                        type="number"
                                        value={invoiceNextNumber}
                                        onChange={(e) => setInvoiceNextNumber(Number(e.target.value))}
                                        style={{ ...inputStyle, fontWeight: '800' }}
                                        placeholder="Ej: 10003"
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Prefijo Nota Crédito</label>
                                    <input
                                        type="text"
                                        value={ncPrefix}
                                        onChange={(e) => setNcPrefix(e.target.value.toUpperCase())}
                                        style={{ ...inputStyle, fontWeight: '800' }}
                                        placeholder="Ej: NC"
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Próximo Consecutivo Nota Crédito</label>
                                    <input
                                        type="number"
                                        value={ncNextNumber}
                                        onChange={(e) => setNcNextNumber(Number(e.target.value))}
                                        style={{ ...inputStyle, fontWeight: '800' }}
                                        placeholder="Ej: 1"
                                        required
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Número Resolución DIAN</label>
                                    <input
                                        type="text"
                                        value={resolutionNumber}
                                        onChange={(e) => setResolutionNumber(e.target.value)}
                                        style={inputStyle}
                                        placeholder="Ej: 18764000001"
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Fecha Resolución DIAN</label>
                                    <input
                                        type="date"
                                        value={resolutionDate}
                                        onChange={(e) => setResolutionDate(e.target.value)}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Rango Autorizado Desde</label>
                                    <input
                                        type="number"
                                        value={rangeFrom}
                                        onChange={(e) => setRangeFrom(Number(e.target.value))}
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Rango Autorizado Hasta</label>
                                    <input
                                        type="number"
                                        value={rangeTo}
                                        onChange={(e) => setRangeTo(Number(e.target.value))}
                                        style={inputStyle}
                                    />
                                </div>
                            </div>
                        </form>

                        {/* CARD 2: Ventana de Gracia Post-Entrega (Margen de Recepción y Novedades) */}
                        <div style={{ backgroundColor: 'white', borderRadius: '16px', border: `1px solid ${THEME.colors.border}`, padding: '1.5rem', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.15rem', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.75rem' }}>
                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '900', margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Timer size={17} style={{ color: '#0D7A57' }} /> Ventana de Gracia Post-Entrega (Margen de Recepción y Novedades)
                                    </h3>
                                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                        Tiempo de espera requerido tras la entrega física en cocina institucional antes de autorizar la inclusión del pedido en el corte masivo.
                                    </p>
                                </div>
                                <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '0.2rem 0.6rem', borderRadius: '99px', fontSize: '0.72rem', fontWeight: '800' }}>
                                    Activo: {graceMinutes >= 60 ? `${Math.round(graceMinutes/60)} Horas (${graceMinutes} min)` : `${graceMinutes} Minutos`}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div>
                                    <label style={labelStyle}>Selección Rápida de Tiempo de Gracia</label>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {[
                                            { label: '30 min (Express)', value: 30 },
                                            { label: '60 min (1 Hora)', value: 60 },
                                            { label: '120 min (2 Horas - Recomendado)', value: 120 },
                                            { label: '180 min (3 Horas)', value: 180 }
                                        ].map(preset => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                onClick={() => setGraceMinutes(preset.value)}
                                                style={{
                                                    backgroundColor: graceMinutes === preset.value ? '#0D7A57' : '#F8FAFC',
                                                    color: graceMinutes === preset.value ? 'white' : '#334155',
                                                    border: `1.5px solid ${graceMinutes === preset.value ? '#0D7A57' : '#CBD5E1'}`,
                                                    padding: '0.45rem 0.85rem',
                                                    borderRadius: '8px',
                                                    fontWeight: '800',
                                                    fontSize: '0.74rem',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                                    <div>
                                        <label style={labelStyle}>Minutos de Gracia Personalizados</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="number"
                                                value={graceMinutes}
                                                onChange={(e) => setGraceMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                                                style={{ ...inputStyle, fontWeight: '800' }}
                                                min="0"
                                                max="720"
                                            />
                                            <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#64748B' }}>minutos</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={labelStyle}>Hora Límite de Cierre de Corte (Countdown Novedades $0)</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="time"
                                                value={cutCloseTime}
                                                onChange={(e) => setCutCloseTime(e.target.value || '17:00')}
                                                style={{ ...inputStyle, fontWeight: '800' }}
                                            />
                                            <span style={{ fontSize: '0.74rem', fontWeight: '700', color: '#DC2626', whiteSpace: 'nowrap' }}>SLA Comercial</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.75rem 0.9rem', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                    <ShieldCheck size={16} style={{ color: '#0D7A57', flexShrink: 0, marginTop: '2px' }} />
                                    <p style={{ margin: 0, fontSize: '0.72rem', color: '#475569', lineHeight: '1.4' }}>
                                        <b>Fundamento Lean & Blindaje Fiscal:</b> Los clientes institucionales (B2B) realizan el desempaque y conteo ciego al recibir el camión. Si se emite la Factura Electrónica inmediatamente, cualquier novedad genera una Nota Crédito contable innecesaria. La barra de cuenta regresiva en la galería principal alerta visualmente cuándo el pedido está listo para corte.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* CUT PREVIEW MODAL */}
                {isPreviewModalOpen && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
                        <div style={{ backgroundColor: 'white', borderRadius: '20px', border: `1px solid ${THEME.colors.border}`, padding: '1.4rem', maxWidth: '1200px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${THEME.colors.border}`, paddingBottom: '0.9rem' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Sun size={18} style={{ color: '#0D7A57' }} />
                                        Auditoría y Generación de Corte {previewSlot} · {selectedBillingDate === 'all' ? 'Todas las Fechas' : selectedBillingDate}
                                    </h3>
                                    <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                        Previsualización determinística por jerarquía de ruta, correlativo DIAN y deducción de novedades aprobadas
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsPreviewModalOpen(false)}
                                    style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <div style={{ padding: '1rem 0', overflowY: 'auto', flex: 1 }}>
                                {loadingPreview ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>Cargando auditoría del corte...</div>
                                ) : previewOrders.length === 0 ? (
                                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>No hay pedidos listos para procesar en este corte.</div>
                                ) : (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.74rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: '800', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: THEME.colors.textSecondary }}>Orden / Ruta</th>
                                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: '800', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: THEME.colors.textSecondary }}>Pedido & Cliente</th>
                                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: '800', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: THEME.colors.textSecondary, textAlign: 'right' }}>Total Original</th>
                                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: '800', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: THEME.colors.textSecondary, textAlign: 'right' }}>Deducción Calidad (-)</th>
                                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: '800', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: THEME.colors.textSecondary, textAlign: 'right' }}>Factura Neta (=)</th>
                                                <th style={{ padding: '0.5rem 0.75rem', fontWeight: '800', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: THEME.colors.textSecondary, textAlign: 'center' }}>Factura Asignada</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {previewOrders.map((ord, idx) => (
                                                <tr key={ord.id} style={{ borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: idx % 2 === 0 ? 'white' : '#FAFAFA' }}>
                                                    <td style={{ padding: '0.6rem 0.85rem' }}>
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F1F5F9', padding: '3px 7px', borderRadius: '6px', fontWeight: '800', fontSize: '0.72rem', color: '#334155' }}>
                                                            <Truck size={12} style={{ color: THEME.colors.primary }} />
                                                            <span>{ord.routeCode}</span>
                                                            {ord.stopSequence > 0 && <span style={{ color: THEME.colors.primary }}>• #{ord.stopSequence}</span>}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.85rem' }}>
                                                        <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.78rem' }}>
                                                            {ord.profile?.company_name || 'Cliente'}
                                                        </div>
                                                        <div style={{ fontSize: '0.66rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>Ped #{ord.sequence_id}</span>
                                                            <span>·</span>
                                                            <span>NIT: {ord.profile?.nit || 'N/A'}</span>
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatMoney(ord.originalTotal)}
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: ord.qualityDeduction > 0 ? '#DC2626' : '#94A3B8', fontWeight: ord.qualityDeduction > 0 ? '800' : '500' }}>
                                                        {ord.qualityDeduction > 0 ? `-${formatMoney(ord.qualityDeduction)}` : '$0'}
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'right', fontWeight: '900', color: '#065F46', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                                                        {formatMoney(ord.netTotal)}
                                                    </td>
                                                    <td style={{ padding: '0.6rem 0.85rem', textAlign: 'center' }}>
                                                        <span style={{ backgroundColor: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0', padding: '0.2rem 0.55rem', borderRadius: '6px', fontWeight: '800', fontVariantNumeric: 'tabular-nums', fontSize: '0.74rem' }}>
                                                            {ord.projectedInvoiceNumber}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>

                            {previewCutPokaYokeError && (
                                <div style={{
                                    margin: '0.75rem 0',
                                    padding: '0.85rem 1rem',
                                    backgroundColor: '#FEF2F2',
                                    border: '1px solid #FECACA',
                                    borderRadius: '10px',
                                    color: '#991B1B',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px'
                                }}>
                                    <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '2px' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '800', fontSize: '0.82rem', marginBottom: '2px' }}>Poka-Yoke de Facturación Activo</div>
                                        <div style={{ fontSize: '0.76rem', color: '#B91C1C', lineHeight: 1.4, fontWeight: '600' }}>{previewCutPokaYokeError}</div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setPreviewCutPokaYokeError(null)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', padding: '2px' }}
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                            )}

                            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                                <div style={{ fontSize: '0.82rem', color: '#334155' }}>
                                    Total Corte: <strong>{formatMoney(previewOrders.reduce((sum, o) => sum + o.netTotal, 0))}</strong> · <strong>{previewOrders.length} facturas</strong>
                                </div>
                                <div style={{ display: 'flex', gap: '0.6rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setIsPreviewModalOpen(false)}
                                        style={{ backgroundColor: '#F1F5F9', color: '#64748B', border: '1px solid #CBD5E1', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleExportPreviewToWorldOffice}
                                        disabled={isProcessing || previewOrders.length === 0}
                                        style={{ backgroundColor: '#FFFFFF', color: '#0F172A', border: '1px solid #CBD5E1', padding: '0.5rem 1rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                                    >
                                        <FileSpreadsheet size={14} style={{ color: '#0D7A57' }} /> Descargar Excel (.xlsx)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmGenerateCut}
                                        disabled={isProcessing || previewOrders.length === 0}
                                        style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.5rem 1.25rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)' }}
                                    >
                                        <CheckCircle2 size={15} /> {isProcessing ? 'Procesando Corte...' : 'Confirmar y Emitir Corte Oficial'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ORDER DETAIL INSPECTION MODAL (COM-26) */}
                {selectedOrderDetail && (() => {
                    const friendlyId = getFriendlyOrderId(selectedOrderDetail);
                    const grace = getOrderGraceInfo(selectedOrderDetail, graceMinutes);
                    const modalBilling = resolveOrderBillingInfo(selectedOrderDetail, parentProfilesMap);
                    const MDocIcon = modalBilling.docInfo.icon;
                    const MPayIcon = modalBilling.paymentInfo.icon;

                    const isInvoiceIssued = Boolean(selectedOrderDetail.billing_invoices?.invoice_number || selectedOrderDetail.invoice_number);
                    const orderIndex = filteredPendingOrders.findIndex((o: any) => o.id === selectedOrderDetail.id);
                    const projectedInvoiceNumber = selectedOrderDetail.billing_invoices?.invoice_number 
                        || selectedOrderDetail.invoice_number 
                        || `${invoicePrefix}-${invoiceNextNumber + (orderIndex >= 0 ? orderIndex : 0)}`;

                    const isB2B = modalBilling.isB2B;
                    const isIvaResponsible = Boolean(selectedOrderDetail.profiles?.iva_responsible);
                    const orderSubtotal = Number(selectedOrderDetail.subtotal || selectedOrderDetail.total || 0);
                    const orderTotal = Number(selectedOrderDetail.total || 0);
                    const calculatedTax = isIvaResponsible 
                        ? Number(selectedOrderDetail.tax_amount || selectedOrderDetail.total_tax || (orderTotal > orderSubtotal ? orderTotal - orderSubtotal : Math.round(orderTotal * 0.19 / 1.19)))
                        : 0;
                    const baseImponible = isIvaResponsible ? (orderTotal - calculatedTax) : orderTotal;

                    // Restriction / Reception Delivery Window
                    const rawRestrictions = selectedOrderDetail.profiles?.delivery_restrictions;
                    const restrictionStr = typeof rawRestrictions === 'string' && rawRestrictions.trim().length > 0
                        ? rawRestrictions.trim()
                        : (selectedOrderDetail.profiles?.logistics_data?.start_time ? `${selectedOrderDetail.profiles.logistics_data.start_time} - ${selectedOrderDetail.profiles.logistics_data.end_time}` : '');
                    
                    const deliveryWindow = isB2B 
                        ? (restrictionStr || `Franja ${selectedOrderDetail.delivery_slot || 'AM'} (Recepción Institucional)`)
                        : '07:00 AM - 04:00 PM (Jornada Continua Habitual Hogar)';

                    const clientTitle = selectedOrderDetail.profiles?.company_name || selectedOrderDetail.profiles?.razon_social || 'Cliente sin nombre';
                    const clientRazonSocial = selectedOrderDetail.profiles?.razon_social || selectedOrderDetail.profiles?.company_name || 'N/A';
                    const clientAddress = selectedOrderDetail.shipping_address || selectedOrderDetail.profiles?.address || 'Sin dirección física registrada';
                    const clientEmail = selectedOrderDetail.profiles?.email || selectedOrderDetail.profiles?.billing_email || '';
                    const clientPhone = selectedOrderDetail.profiles?.phone || selectedOrderDetail.shipping_phone || '';

                    // Items metrics & Tripartite PQR Financial Reconciliation
                    const totalCalculatedItemsPrice = orderDetailItems.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);

                    // Extraer desglose financiero de PQR (Factura Inicial, Deducción PQR y Total Facturable)
                    let pqrDeductionsTotal = 0;
                    let initialInvoiceTotal = orderTotal;

                    // 1. Extraer bitácora en admin_notes: [AJUSTE FACTURA PQR ...]: Valor ajustado de $PREV a $NEW (-$DED) (soporta múltiples ajustes)
                    if (selectedOrderDetail.admin_notes) {
                        const adjRegex = /\[AJUSTE FACTURA[^\]]*\]:\s*Valor ajustado de\s*\$?([\d.,]+)\s*a\s*\$?([\d.,]+)\s*\(-?\$?([\d.,]+)\)/gi;
                        let m;
                        let firstInitial: number | null = null;
                        let totalDeductions = 0;
                        while ((m = adjRegex.exec(selectedOrderDetail.admin_notes)) !== null) {
                            const prev = parseFloat(m[1].replace(/\./g, '').replace(/,/g, '')) || 0;
                            const ded = parseFloat(m[3].replace(/\./g, '').replace(/,/g, '')) || 0;
                            if (firstInitial === null) firstInitial = prev;
                            totalDeductions += ded;
                        }
                        if (firstInitial !== null && totalDeductions > 0) {
                            initialInvoiceTotal = firstInitial;
                            pqrDeductionsTotal = totalDeductions;
                        } else {
                            const matchNc = selectedOrderDetail.admin_notes.match(/\[NOTA_CREDITO_PQR[^\]]*VALOR:\s*-?\$?([\d.,]+)\]/i);
                            if (matchNc) {
                                const ncVal = parseFloat(matchNc[1].replace(/\./g, '').replace(/,/g, '')) || 0;
                                if (ncVal > 0) {
                                    pqrDeductionsTotal = ncVal;
                                    initialInvoiceTotal = orderTotal + ncVal;
                                }
                            }
                        }
                    }

                    // 2. Si no está en notas, calcular a partir de las novedades resueltas en ítems / devoluciones
                    if (pqrDeductionsTotal === 0 && (orderDetailReturns.length > 0 || orderDetailPqrs.length > 0)) {
                        let sumDeductions = 0;
                        orderDetailItems.forEach(it => {
                            const n = resolveItemNoveltyInfo(it, orderDetailReturns, orderDetailPqrs);
                            if (n && n.scenarioType !== 'sin_costo' && (n as any).qtyClaimed > 0) {
                                sumDeductions += ((n as any).qtyClaimed * Number(it.unit_price || 0));
                            }
                        });
                        if (sumDeductions === 0 && orderDetailReturns.length > 0) {
                            orderDetailReturns.forEach(r => {
                                const pqr = orderDetailPqrs[0];
                                const { ncAmount } = resolveReturnProductAndAmount(r, pqr);
                                if (ncAmount > 0) sumDeductions += ncAmount;
                            });
                        }
                        if (sumDeductions > 0) {
                            pqrDeductionsTotal = sumDeductions;
                            initialInvoiceTotal = Math.max(orderTotal, totalCalculatedItemsPrice);
                        }
                    }

                    const netFacturableTotal = Math.max(0, initialInvoiceTotal - pqrDeductionsTotal);

                    const orderNoveltiesSummary = (() => {
                        if (!orderDetailItems || orderDetailItems.length === 0) return null;
                        if (orderDetailReturns.length === 0 && orderDetailPqrs.length === 0) return null;

                        const novelties: any[] = [];
                        orderDetailItems.forEach(it => {
                            const n = resolveItemNoveltyInfo(it, orderDetailReturns, orderDetailPqrs);
                            if (n) novelties.push(n);
                        });

                        if (novelties.length === 0 && orderDetailReturns.length > 0) {
                            return {
                                summaryText: `${orderDetailReturns.length} devoluciones reportadas`,
                                badgeBg: '#FEF2F2',
                                badgeColor: '#991B1B',
                                badgeBorder: '#FECACA',
                                firstNovelty: null
                            };
                        }

                        if (novelties.length === 0) return null;

                        const first = novelties[0];
                        const allResolvedSinCosto = novelties.every(n => n.scenarioType === 'sin_costo');
                        const anyAjuste = novelties.some(n => n.scenarioType === 'ajuste_factura');

                        if (allResolvedSinCosto) {
                            return {
                                summaryText: `${novelties.length} ${novelties.length === 1 ? 'Reclamación' : 'Reclamaciones'} SAC: Cerrado Conforme (Facturar 100%)`,
                                badgeBg: '#ECFDF5',
                                badgeColor: '#065F46',
                                badgeBorder: '#A7F3D0',
                                firstNovelty: first
                            };
                        }

                        if (anyAjuste) {
                            return {
                                summaryText: `${novelties.length} ${novelties.length === 1 ? 'Reclamación' : 'Reclamaciones'} SAC: Ajuste Autorizado en Factura`,
                                badgeBg: '#FEF2F2',
                                badgeColor: '#991B1B',
                                badgeBorder: '#FECACA',
                                firstNovelty: first
                            };
                        }

                        return {
                            summaryText: `${novelties.length} ${novelties.length === 1 ? 'Reclamación' : 'Reclamaciones'} SAC Gestionadas`,
                            badgeBg: first.badgeBg,
                            badgeColor: first.badgeColor,
                            badgeBorder: first.badgeBorder,
                            firstNovelty: first
                        };
                    })();

                    return (
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120, padding: '1rem' }}>
                            <div style={{ backgroundColor: 'white', borderRadius: '20px', border: `1px solid ${THEME.colors.border}`, maxWidth: '1180px', width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', overflow: 'hidden' }}>
                                
                                {/* Componente 1: Header del Modal */}
                                <div style={{ padding: '1.1rem 1.5rem', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0F172A', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                                                Pedido #{friendlyId}
                                            </span>
                                            
                                            {/* Estado Operativo Real (sin dato mockeado / sin DELIVERED erróneo) */}
                                            <span style={{
                                                backgroundColor: grace.badgeBg,
                                                color: grace.badgeColor,
                                                border: `1px solid ${grace.badgeBorder}`,
                                                padding: '0.18rem 0.55rem',
                                                borderRadius: '6px',
                                                fontSize: '0.68rem',
                                                fontWeight: '800',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.02em'
                                            }}>
                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: grace.progressBarBg || 'currentColor' }}></span>
                                                {grace.badgeText}
                                            </span>

                                            {/* Consecutivo Fiscal Asignado / Proyectado */}
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                backgroundColor: isInvoiceIssued ? '#ECFDF5' : '#F8FAFC',
                                                border: `1px solid ${isInvoiceIssued ? '#A7F3D0' : '#CBD5E1'}`,
                                                padding: '0.18rem 0.6rem',
                                                borderRadius: '6px',
                                                fontVariantNumeric: 'tabular-nums',
                                                fontWeight: '800',
                                                fontSize: '0.72rem',
                                                color: isInvoiceIssued ? '#065F46' : '#0F172A'
                                            }}>
                                                <FileCheck size={13} style={{ color: isInvoiceIssued ? '#059669' : '#64748B' }} />
                                                <span>{isInvoiceIssued ? `Factura Oficial: ${projectedInvoiceNumber}` : `Factura Prevista: ${projectedInvoiceNumber}`}</span>
                                            </div>
                                        </div>

                                        <h2 style={{ fontSize: '0.98rem', fontWeight: '900', color: '#0D7A57', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {clientTitle}
                                        </h2>

                                        <div style={{ fontSize: '0.72rem', color: THEME.colors.textSecondary, display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span>NIT: <strong style={{ color: '#334155' }}>{selectedOrderDetail.profiles?.nit || 'N/A'}</strong></span>
                                            {clientPhone && (
                                                <>
                                                    <span>·</span>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <Phone size={11} style={{ color: '#64748B' }} /> Tel: <strong style={{ color: '#334155' }}>{clientPhone}</strong>
                                                    </span>
                                                </>
                                            )}
                                            {clientEmail && (
                                                <>
                                                    <span>·</span>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <Mail size={11} style={{ color: '#64748B' }} /> <strong style={{ color: '#334155' }}>{clientEmail}</strong>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setSelectedOrderDetail(null)}
                                        style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#64748B', cursor: 'pointer', padding: '6px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Modal Body: Upper Fixed Summary Section + Dedicated Table Scroll Container */}
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}>
                                    
                                    {/* Componentes 2 y 3: Fixed Upper Summary Section (Cards Grid) */}
                                    <div style={{ padding: '0.75rem 1.5rem', backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', flexShrink: 0 }}>
                                        {/* ALERTA VISUAL: PEDIDO LIQUIDADO AL 100% POR NOVEDADES SAC ($0 FACTURABLE) */}
                                        {orderTotal === 0 && pqrDeductionsTotal > 0 && (
                                            <div style={{
                                                backgroundColor: '#FEF2F2',
                                                border: '1.5px solid #F87171',
                                                borderRadius: '8px',
                                                padding: '0.55rem 0.85rem',
                                                marginBottom: '0.65rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '10px',
                                                boxShadow: '0 1px 3px rgba(220, 38, 38, 0.08)'
                                            }}>
                                                <AlertTriangle size={18} color="#DC2626" style={{ flexShrink: 0 }} />
                                                <div>
                                                    <div style={{ fontWeight: '900', color: '#991B1B', fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                        Pedido Liquidado en $0 por SAC (100% Novedad / Sin Entrega Física) • No Facturable en World Office
                                                    </div>
                                                    <div style={{ color: '#7F1D1D', fontSize: '0.68rem', marginTop: '1px', lineHeight: '1.2' }}>
                                                        Este pedido tuvo resolución de PQR con Opción 4 (Ajuste de Factura) por el valor total de <strong>{formatMoney(pqrDeductionsTotal)}</strong>. Todas las cantidades fueron descontadas por producto escaso/avería, por lo que su saldo neto a facturar es <strong>$0</strong>. No genera cobro al cliente ni factura electrónica.
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                                            
                                            {/* Card 1: Razón Social, Dirección & Contacto */}
                                            <div style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Razón Social & Contacto
                                                    </div>
                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.78rem', marginTop: '1px', lineHeight: '1.2' }}>
                                                        {clientRazonSocial}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.68rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                                                        <MapPin size={11} style={{ color: '#0D7A57', flexShrink: 0, marginTop: '2px' }} />
                                                        <span style={{ lineHeight: '1.25', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={clientAddress}>{clientAddress}</span>
                                                    </div>
                                                    {clientEmail && (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748B' }}>
                                                            <Mail size={10} style={{ color: '#64748B', flexShrink: 0 }} />
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientEmail}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card 2: Condición Comercial & Fiscal */}
                                            <div style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Condición Comercial & Fiscal
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                        <span style={{ backgroundColor: modalBilling.docInfo.bg, color: modalBilling.docInfo.color, border: `1px solid ${modalBilling.docInfo.border}`, padding: '0.10rem 0.40rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                            <MDocIcon size={10} /> {modalBilling.docInfo.label}
                                                        </span>
                                                        <span style={{ backgroundColor: modalBilling.paymentInfo.bg, color: modalBilling.paymentInfo.color, border: `1px solid ${modalBilling.paymentInfo.border}`, padding: '0.10rem 0.40rem', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                            <MPayIcon size={10} /> {modalBilling.paymentInfo.label}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.67rem', color: '#475569', lineHeight: '1.3', borderTop: '1px solid #F1F5F9', paddingTop: '3px' }}>
                                                    <div>Régimen: <strong>{isB2B ? 'Institucional B2B' : 'Consumidor Hogar B2C'}</strong></div>
                                                    <div style={{ color: isIvaResponsible ? '#1E40AF' : '#64748B' }}>
                                                        IVA: <strong>{isIvaResponsible ? 'Responsable (19%)' : 'No Responsable (0% / Exento)'}</strong>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 3: Tipo de Cliente, Franja & Orden de Compra */}
                                            <div style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Tipo de Cliente & Franja
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                        <span style={{
                                                            backgroundColor: isB2B ? '#ECFDF5' : '#EFF6FF',
                                                            color: isB2B ? '#065F46' : '#1E40AF',
                                                            border: `1px solid ${isB2B ? '#A7F3D0' : '#BFDBFE'}`,
                                                            padding: '0.10rem 0.40rem',
                                                            borderRadius: '4px',
                                                            fontSize: '0.64rem',
                                                            fontWeight: '800',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px'
                                                        }}>
                                                            {isB2B ? <Building2 size={9} /> : <User size={9} />}
                                                            {isB2B ? 'Institucional B2B' : 'Cliente Hogar (B2C)'}
                                                        </span>
                                                        {selectedOrderDetail.purchase_order_number && (
                                                            <span style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '0.08rem 0.35rem', borderRadius: '4px', fontSize: '0.62rem', fontWeight: '800' }}>
                                                                OC: {selectedOrderDetail.purchase_order_number}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.67rem', color: '#475569', lineHeight: '1.3', borderTop: '1px solid #F1F5F9', paddingTop: '3px' }}>
                                                    <div>Franja: <strong style={{ color: '#0F172A' }}>{deliveryWindow}</strong></div>
                                                    <div>Entrega: <strong style={{ color: '#0F172A' }}>{selectedOrderDetail.delivery_date || 'N/A'}</strong></div>
                                                </div>
                                            </div>

                                            {/* Card 4 (Componente 3): Totalización Facturable */}
                                            <div style={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.65rem 0.85rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.60rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Totalización Facturable
                                                    </div>
                                                    {pqrDeductionsTotal > 0 ? (
                                                        <div style={{ marginTop: '1px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                                                <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#94A3B8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                                                                    {formatMoney(initialInvoiceTotal)}
                                                                </span>
                                                                <span style={{ fontWeight: '900', color: '#065F46', fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums' }}>
                                                                    {formatMoney(netFacturableTotal)}
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#DC2626', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                Ajuste PQR: -{formatMoney(pqrDeductionsTotal)}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontWeight: '900', color: '#065F46', fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums', marginTop: '1px' }}>
                                                            {formatMoney(orderTotal)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '3px', fontSize: '0.66rem', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#475569' }}>
                                                        <span>Base:</span>
                                                        <span style={{ fontWeight: '700', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(baseImponible)}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: isIvaResponsible ? '#1E40AF' : '#64748B' }}>
                                                        <span>IVA:</span>
                                                        <span style={{ fontWeight: '800', fontVariantNumeric: 'tabular-nums' }}>{isIvaResponsible ? formatMoney(calculatedTax) : '$0 (0%)'}</span>
                                                    </div>
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Table Subheader Strip */}
                                    <div style={{ padding: '0.45rem 1.5rem', backgroundColor: 'white', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Package size={14} style={{ color: '#0D7A57' }} />
                                            <span>Productos y Especificaciones del Pedido</span>
                                            <span style={{ backgroundColor: '#EAEFEA', color: '#0D7A57', padding: '1px 6px', borderRadius: '99px', fontSize: '0.66rem', fontWeight: '800' }}>
                                                {orderDetailItems.length} ítems
                                            </span>
                                        </div>
                                        {orderNoveltiesSummary ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (orderNoveltiesSummary.firstNovelty) {
                                                        setSelectedNoveltyDetail(orderNoveltiesSummary.firstNovelty);
                                                    }
                                                }}
                                                style={{
                                                    backgroundColor: orderNoveltiesSummary.badgeBg,
                                                    color: orderNoveltiesSummary.badgeColor,
                                                    border: `1px solid ${orderNoveltiesSummary.badgeBorder}`,
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.66rem',
                                                    fontWeight: '800',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    cursor: orderNoveltiesSummary.firstNovelty ? 'pointer' : 'default',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Ver dictamen de Calidad y SAC"
                                            >
                                                <ShieldAlert size={11} />
                                                <span>{orderNoveltiesSummary.summaryText}</span>
                                                {orderNoveltiesSummary.firstNovelty && (
                                                    <span style={{ textDecoration: 'underline', marginLeft: '3px' }}>Ver Detalle</span>
                                                )}
                                            </button>
                                        ) : (orderDetailReturns.length > 0 || orderDetailPqrs.length > 0) && (
                                            <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', padding: '2px 7px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <AlertTriangle size={11} /> {orderDetailReturns.length || orderDetailPqrs.length} devoluciones reportadas
                                            </span>
                                        )}
                                    </div>

                                    {/* Dedicated Scroll Container for Products Table (Zero-Gap Sticky Thead) */}
                                    <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, backgroundColor: 'white' }}>
                                        {loadingOrderDetailItems ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', fontSize: '0.82rem' }}>
                                                <RefreshCw size={20} className="animate-spin" style={{ margin: '0 auto 0.5rem auto', color: '#0D7A57' }} />
                                                Cargando productos y especificaciones del pedido...
                                            </div>
                                        ) : (
                                            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                                <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                                                    <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                        <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', padding: '0.50rem 0.75rem', fontWeight: '800', color: '#64748B', fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '36px', textAlign: 'center' }}>#</th>
                                                        <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', padding: '0.50rem 0.75rem', fontWeight: '800', color: '#64748B', fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Producto & Variedad</th>
                                                        <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', padding: '0.50rem 0.75rem', fontWeight: '800', color: '#64748B', fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Especificación / Maduración</th>
                                                        <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', padding: '0.50rem 0.75rem', fontWeight: '800', color: '#64748B', fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Cantidad & Presentación</th>
                                                        <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', padding: '0.50rem 0.75rem', fontWeight: '800', color: '#64748B', fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Precio Unit.</th>
                                                        <th style={{ position: 'sticky', top: 0, zIndex: 20, backgroundColor: '#F8FAFC', borderBottom: '2px solid #CBD5E1', padding: '0.50rem 0.75rem', fontWeight: '800', color: '#64748B', fontSize: '0.63rem', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Total Línea</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {orderDetailItems.map((item: any, idx: number) => {
                                                        const prodName = item.products?.name || item.nickname || 'Producto sin nombre';
                                                        const itemTotal = Number(item.quantity || 0) * Number(item.unit_price || 0);
                                                        const structuredSpec = formatStructuredSpecification(item);
                                                        const presentation = formatItemQuantityPresentation(item);
                                                        const isLast = idx === orderDetailItems.length - 1;
                                                        const itemNovelty = resolveItemNoveltyInfo(item, orderDetailReturns, orderDetailPqrs);

                                                        return (
                                                            <tr 
                                                                key={item.id || idx} 
                                                                style={{ borderBottom: isLast ? 'none' : '1px solid #F1F5F9', transition: 'background-color 0.15s' }} 
                                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'} 
                                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                                                            >
                                                                <td style={{ padding: '0.50rem 0.75rem', color: '#94A3B8', fontWeight: '700', fontSize: '0.70rem', textAlign: 'center' }}>
                                                                    {idx + 1}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem' }}>
                                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.78rem' }}>
                                                                        {prodName}
                                                                    </div>
                                                                    {itemNovelty && (
                                                                        <div style={{ marginTop: '4px' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => { e.stopPropagation(); setSelectedNoveltyDetail(itemNovelty); }}
                                                                                style={{
                                                                                    backgroundColor: itemNovelty.badgeBg,
                                                                                    color: itemNovelty.badgeColor,
                                                                                    border: `1px solid ${itemNovelty.badgeBorder}`,
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '5px',
                                                                                    fontSize: '0.64rem',
                                                                                    fontWeight: '800',
                                                                                    cursor: 'pointer',
                                                                                    display: 'inline-flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    transition: 'all 0.15s'
                                                                                }}
                                                                                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                                                                                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                                                                                title="Ver dictamen de Calidad y directriz contable de facturación"
                                                                            >
                                                                                <ShieldAlert size={10} />
                                                                                <span>{itemNovelty.badgeText}</span>
                                                                                <span style={{ textDecoration: 'underline', marginLeft: '3px', fontWeight: '900' }}>Ver Dictamen →</span>
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem' }}>
                                                                    {structuredSpec ? (
                                                                        <span style={{ fontSize: '0.72rem', color: '#334155', fontWeight: '600' }}>
                                                                            {structuredSpec}
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.70rem', color: '#CBD5E1' }}>—</span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem', textAlign: 'right' }}>
                                                                    {itemNovelty && (itemNovelty as any).qtyClaimed > 0 && itemNovelty.scenarioType !== 'sin_costo' ? (() => {
                                                                        const netQty = Number(item.quantity || 0);
                                                                        const claimed = Number((itemNovelty as any).qtyClaimed || 0);
                                                                        const origQty = netQty + claimed;
                                                                        const uom = item.unit || item.products?.unit_of_measure || 'Kg';
                                                                        return (
                                                                            <div>
                                                                                <div style={{ fontSize: '0.66rem', color: '#94A3B8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {origQty} {uom}
                                                                                </div>
                                                                                <div style={{ fontWeight: '900', color: netQty === 0 ? '#DC2626' : '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>
                                                                                    {netQty === 0 ? `0 ${uom} (No entregado)` : `${netQty} ${uom} Facturables`}
                                                                                </div>
                                                                                <span style={{ fontSize: '0.58rem', color: '#DC2626', fontWeight: '800' }}>
                                                                                    -{claimed} PQR
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })() : Number(item.quantity || 0) === 0 ? (
                                                                        <div>
                                                                            <div style={{ fontWeight: '800', color: '#94A3B8', fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>
                                                                                0 {item.unit || item.products?.unit_of_measure || 'Kg'}
                                                                            </div>
                                                                            <span style={{ fontSize: '0.58rem', color: '#64748B', fontWeight: '700' }}>
                                                                                (Sin Despacho)
                                                                            </span>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <div style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>
                                                                                {presentation.primary}
                                                                            </div>
                                                                            {presentation.secondary && (
                                                                                <div style={{ fontSize: '0.64rem', color: '#0D7A57', fontWeight: '700', marginTop: '1px' }}>
                                                                                    {presentation.secondary}
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums', fontSize: '0.76rem' }}>
                                                                    {formatMoney(item.unit_price || 0)}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem', textAlign: 'right', fontWeight: '900', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.80rem' }}>
                                                                    {itemNovelty && (itemNovelty as any).qtyClaimed > 0 && itemNovelty.scenarioType !== 'sin_costo' ? (() => {
                                                                        const netQty = Number(item.quantity || 0);
                                                                        const claimed = Number((itemNovelty as any).qtyClaimed || 0);
                                                                        const origQty = netQty + claimed;
                                                                        const origTotal = origQty * Number(item.unit_price || 0);
                                                                        return (
                                                                            <div>
                                                                                <div style={{ fontSize: '0.66rem', color: '#94A3B8', textDecoration: 'line-through', fontVariantNumeric: 'tabular-nums' }}>
                                                                                    {formatMoney(origTotal)}
                                                                                </div>
                                                                                <div style={{ fontWeight: '900', color: netQty === 0 ? '#DC2626' : '#059669', fontVariantNumeric: 'tabular-nums', fontSize: '0.80rem' }}>
                                                                                    {formatMoney(itemTotal)}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })() : (
                                                                        formatMoney(itemTotal)
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>

                                </div>

                                {/* Modal Footer (Docked Bottom Bar with Discreet Fixed Total & Actions) */}
                                <div style={{ padding: '0.70rem 1.5rem', borderTop: `1px solid ${THEME.colors.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', flexWrap: 'wrap', gap: '0.75rem', flexShrink: 0 }}>
                                    <div style={{ fontSize: '0.73rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span>Total Ítems: <strong style={{ color: '#0F172A' }}>{orderDetailItems.length}</strong></span>
                                        <span>·</span>
                                        <span>Entrega programada: <strong style={{ color: '#0F172A' }}>{selectedOrderDetail.delivery_date}</strong></span>
                                        <span>·</span>
                                        <span>Franja: <strong style={{ color: '#0F172A' }}>{deliveryWindow}</strong></span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {/* Liquidación Tripartita: Factura Inicial | Descuento PQR | Total Facturable con PQR */}
                                        {pqrDeductionsTotal > 0 ? (
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                {/* 1. Factura Inicial */}
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'flex-end',
                                                    backgroundColor: '#F8FAFC',
                                                    border: '1px solid #E2E8F0',
                                                    padding: '0.24rem 0.60rem',
                                                    borderRadius: '7px'
                                                }}>
                                                    <span style={{ fontSize: '0.54rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                        Factura Inicial
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#64748B', fontVariantNumeric: 'tabular-nums', textDecoration: 'line-through' }}>
                                                        {formatMoney(initialInvoiceTotal)}
                                                    </span>
                                                </div>

                                                {/* 2. Descuento PQR */}
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'flex-end',
                                                    backgroundColor: '#FEF2F2',
                                                    border: '1px solid #FECACA',
                                                    padding: '0.24rem 0.60rem',
                                                    borderRadius: '7px'
                                                }}>
                                                    <span style={{ fontSize: '0.54rem', fontWeight: '800', color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <AlertCircle size={9} /> Descuento PQR
                                                    </span>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                                                        -{formatMoney(pqrDeductionsTotal)}
                                                    </span>
                                                </div>

                                                {/* 3. Total Facturable con PQR Realizada */}
                                                <div style={{
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'flex-end',
                                                    backgroundColor: '#ECFDF5',
                                                    border: '1.5px solid #10B981',
                                                    padding: '0.28rem 0.75rem',
                                                    borderRadius: '8px',
                                                    boxShadow: '0 1px 4px rgba(16, 185, 129, 0.15)'
                                                }}>
                                                    <span style={{ fontSize: '0.56rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <CheckCircle2 size={10} color="#059669" /> {isIvaResponsible ? 'Total con PQR (Inc. IVA)' : 'Total con PQR (Exento)'}
                                                    </span>
                                                    <span style={{ fontSize: '1.05rem', fontWeight: '900', color: '#065F46', fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatMoney(netFacturableTotal)}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                backgroundColor: '#ECFDF5',
                                                border: '1px solid #A7F3D0',
                                                padding: '0.30rem 0.75rem',
                                                borderRadius: '8px',
                                                boxShadow: '0 1px 3px rgba(6, 95, 70, 0.08)'
                                            }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: '1.1' }}>
                                                    <span style={{ fontSize: '0.56rem', fontWeight: '800', color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        {isIvaResponsible ? 'Total Facturable (Inc. IVA)' : 'Total Facturable (Exento)'}
                                                    </span>
                                                    <span style={{ fontSize: '1.02rem', fontWeight: '900', color: '#065F46', fontVariantNumeric: 'tabular-nums' }}>
                                                        {formatMoney(orderTotal)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}

                                        <button 
                                            type="button"
                                            onClick={() => window.open(`/admin/orders/contingency-print?mode=remissions&orderIds=${selectedOrderDetail.id}&ids=${selectedOrderDetail.id}`, '_blank')}
                                            style={{ backgroundColor: 'white', color: '#0F172A', border: '1px solid #CBD5E1', padding: '0.45rem 0.90rem', borderRadius: '8px', fontWeight: '700', fontSize: '0.74rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F8FAFC'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                                        >
                                            <Printer size={13} style={{ color: '#0D7A57' }} /> Previsualizar Impresión
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setSelectedOrderDetail(null)}
                                            style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.45rem 1.20rem', borderRadius: '8px', fontWeight: '800', fontSize: '0.74rem', cursor: 'pointer', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)', transition: 'all 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#0A6245'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0D7A57'}
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </div>

                                {/* Sub-modal / Drawer de Dictamen SAC y Directriz de Facturación */}
                                {selectedNoveltyDetail && (
                                    <div 
                                        style={{
                                            position: 'fixed',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            backgroundColor: 'rgba(15, 23, 42, 0.75)',
                                            backdropFilter: 'blur(4px)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            zIndex: 200,
                                            padding: '1rem'
                                        }}
                                        onClick={() => setSelectedNoveltyDetail(null)}
                                    >
                                        <div 
                                            style={{
                                                backgroundColor: 'white',
                                                borderRadius: '16px',
                                                border: '1px solid #CBD5E1',
                                                maxWidth: '680px',
                                                width: '95vw',
                                                maxHeight: '90vh',
                                                overflowY: 'auto',
                                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                                                display: 'flex',
                                                flexDirection: 'column'
                                            }}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            {/* Header */}
                                            <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTopLeftRadius: '16px', borderTopRightRadius: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: selectedNoveltyDetail.badgeBg, border: `1px solid ${selectedNoveltyDetail.badgeBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <ShieldAlert size={18} color={selectedNoveltyDetail.badgeColor} />
                                                    </div>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '0.94rem', fontWeight: '900', color: '#0F172A' }}>
                                                            Dictamen SAC & Facturación — {selectedNoveltyDetail.productName}
                                                        </h3>
                                                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                                                            Pedido #{friendlyId} • {clientTitle}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedNoveltyDetail(null)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#64748B', borderRadius: '6px' }}
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>

                                            {/* Content Body */}
                                            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                {/* 1. Directriz de Facturación Destacada */}
                                                <div style={{
                                                    backgroundColor: selectedNoveltyDetail.badgeBg,
                                                    border: `1.5px solid ${selectedNoveltyDetail.badgeBorder}`,
                                                    borderRadius: '10px',
                                                    padding: '0.85rem 1rem'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                                        <ShieldCheck size={16} color={selectedNoveltyDetail.badgeColor} />
                                                        <span style={{ fontSize: '0.78rem', fontWeight: '900', color: selectedNoveltyDetail.badgeColor, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                            {selectedNoveltyDetail.resolutionTitle}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.80rem', fontWeight: '700', color: '#0F172A', lineHeight: '1.4' }}>
                                                        {selectedNoveltyDetail.invoiceInstruction}
                                                    </div>
                                                </div>

                                                {/* 2. Grid de Información Dual (Cliente vs Calidad) */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                                                    {/* Tarjeta Reclamación del Cliente */}
                                                    <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.75rem 0.90rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            1. Reporte del Cliente
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                                            <span style={{ color: '#64748B' }}>Cantidad Afectada:</span>
                                                            <span style={{ fontWeight: '800', color: '#0F172A' }}>
                                                                {selectedNoveltyDetail.qtyClaimed} {selectedNoveltyDetail.unit} <span style={{ color: '#64748B', fontWeight: '400' }}>(de {selectedNoveltyDetail.totalQty} {selectedNoveltyDetail.unit})</span>
                                                            </span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                                                            <span style={{ color: '#64748B' }}>Valor en Discusión:</span>
                                                            <span style={{ fontWeight: '800', color: '#0F172A' }}>
                                                                {formatMoney((selectedNoveltyDetail.qtyClaimed || 0) * (selectedNoveltyDetail.unitPrice || 0))}
                                                            </span>
                                                        </div>
                                                        <div style={{ marginTop: '4px', fontSize: '0.72rem', color: '#334155', backgroundColor: 'white', border: '1px solid #E2E8F0', padding: '6px 8px', borderRadius: '6px', lineHeight: '1.35', maxHeight: '100px', overflowY: 'auto' }}>
                                                            {selectedNoveltyDetail.clientMotive}
                                                        </div>
                                                        {selectedNoveltyDetail.photoUrl && (
                                                            <div style={{ marginTop: '4px' }}>
                                                                <div style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748B', marginBottom: '3px' }}>
                                                                    Evidencia Fotográfica:
                                                                </div>
                                                                <a 
                                                                    href={selectedNoveltyDetail.photoUrl} 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    style={{ display: 'inline-block', position: 'relative', borderRadius: '6px', overflow: 'hidden', border: '1px solid #CBD5E1' }}
                                                                >
                                                                    <img 
                                                                        src={selectedNoveltyDetail.photoUrl} 
                                                                        alt="Evidencia fotográfica" 
                                                                        style={{ width: '90px', height: '65px', objectFit: 'cover', display: 'block' }}
                                                                    />
                                                                    <span style={{ position: 'absolute', bottom: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.65)', color: 'white', fontSize: '0.55rem', padding: '1px 3px', borderRadius: '3px' }}>
                                                                        Zoom ↗
                                                                    </span>
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Tarjeta Evaluación Técnica SAC */}
                                                    <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '0.75rem 0.90rem', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <div style={{ fontSize: '0.66rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                            2. Dictamen de Calidad & Disposición
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem' }}>
                                                            <div style={{ color: '#64748B', fontSize: '0.64rem', marginBottom: '1px' }}>Concepto Técnico:</div>
                                                            <div style={{ fontWeight: '800', color: '#0F172A', backgroundColor: 'white', border: '1px solid #E2E8F0', padding: '4px 6px', borderRadius: '4px' }}>
                                                                {selectedNoveltyDetail.qualityConcept}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem', marginTop: '2px' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                                <span style={{ color: '#64748B', fontSize: '0.64rem', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                                    Justificación / Dictamen del Auditor QC:
                                                                </span>
                                                                {selectedNoveltyDetail.auditedBy && (
                                                                    <span style={{ fontSize: '0.60rem', color: '#0D7A57', fontWeight: '800', backgroundColor: '#ECFDF5', padding: '1px 5px', borderRadius: '4px', border: '1px solid #A7F3D0' }}>
                                                                        Auditor: {selectedNoveltyDetail.auditedBy}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{
                                                                fontSize: '0.72rem',
                                                                color: '#1E293B',
                                                                backgroundColor: 'white',
                                                                border: '1px solid #E2E8F0',
                                                                borderLeft: '3px solid #0D7A57',
                                                                padding: '6px 8px',
                                                                borderRadius: '6px',
                                                                lineHeight: '1.35',
                                                                maxHeight: '100px',
                                                                overflowY: 'auto'
                                                            }}>
                                                                {selectedNoveltyDetail.qcJustification ? (
                                                                    <span>{selectedNoveltyDetail.qcJustification}</span>
                                                                ) : (
                                                                    <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>
                                                                        Sin observaciones adicionales registradas por el auditor.
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem', marginTop: '2px' }}>
                                                            <div style={{ color: '#64748B', fontSize: '0.64rem', marginBottom: '1px' }}>Disposición Sanitaria:</div>
                                                            <div style={{ fontWeight: '700', color: '#065F46', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '4px 6px', borderRadius: '4px', fontSize: '0.70rem' }}>
                                                                {selectedNoveltyDetail.sanitaryDisposition}
                                                            </div>
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: 'auto', paddingTop: '6px', borderTop: '1px dashed #CBD5E1' }}>
                                                            Auditoría cerrada con respaldo en Sistema de Gestión de Calidad (SGC).
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer */}
                                            <div style={{ padding: '0.75rem 1.25rem', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', borderBottomLeftRadius: '16px', borderBottomRightRadius: '16px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedNoveltyDetail(null)}
                                                    style={{
                                                        backgroundColor: '#0D7A57',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '0.45rem 1.25rem',
                                                        borderRadius: '8px',
                                                        fontWeight: '800',
                                                        fontSize: '0.76rem',
                                                        cursor: 'pointer',
                                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.25)'
                                                    }}
                                                >
                                                    Entendido, Cerrar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    );
                })()}

                {/* MODAL DE AUDITORÍA INFORMATIVA SoD — REMISIONES RETENIDAS POR PRECIO $0 (ESCENARIO 251) */}
                {isAssignPriceModalOpen && (
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: 'rgba(15, 23, 42, 0.72)',
                            backdropFilter: 'blur(6px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 130,
                            padding: '1rem'
                        }}
                    >
                        <div
                            style={{
                                backgroundColor: 'white',
                                borderRadius: '18px',
                                border: '1px solid #FECACA',
                                width: '100%',
                                maxWidth: '980px',
                                maxHeight: '90vh',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Header */}
                            <div
                                style={{
                                    padding: '1rem 1.35rem',
                                    backgroundColor: '#FEF2F2',
                                    borderBottom: '1px solid #FECACA',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '1rem'
                                }}
                            >
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span
                                            style={{
                                                backgroundColor: '#DC2626',
                                                color: 'white',
                                                padding: '2px 8px',
                                                borderRadius: '999px',
                                                fontSize: '0.66rem',
                                                fontWeight: '900',
                                                letterSpacing: '0.04em'
                                            }}
                                        >
                                            SEGREGACIÓN DE FUNCIONES (SoD) — SOLO LECTURA
                                        </span>
                                        <span
                                            style={{
                                                backgroundColor: '#FEE2E2',
                                                color: '#991B1B',
                                                border: '1px solid #FCA5A5',
                                                padding: '2px 8px',
                                                borderRadius: '999px',
                                                fontSize: '0.66rem',
                                                fontWeight: '800'
                                            }}
                                        >
                                            Retenido por Tarifa Comercial ($0)
                                        </span>
                                    </div>
                                    <h3 style={{ margin: '6px 0 2px 0', fontSize: '1.05rem', fontWeight: '900', color: '#7F1D1D' }}>
                                        Remisiones Retenidas — Pendiente Tarifa Comercial ($0)
                                    </h3>
                                    <p style={{ margin: 0, fontSize: '0.74rem', color: '#991B1B', fontWeight: '600' }}>
                                        Estas remisiones contienen productos despachados a $0 fuera de acuerdo. Por normativa interna y segregación de funciones, las tarifas deben ser asignadas exclusivamente por el equipo Comercial en el módulo de Pedidos o Acuerdos Comerciales.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsAssignPriceModalOpen(false)}
                                    style={{
                                        backgroundColor: 'white',
                                        border: '1px solid #FECACA',
                                        color: '#991B1B',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: '800'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Body */}
                            <div style={{ padding: '1.15rem 1.35rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {loadingAssignPriceOrders ? (
                                    <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748B', fontWeight: '700', fontSize: '0.85rem' }}>
                                        Cargando remisiones retenidas en $0...
                                    </div>
                                ) : assignPriceOrders.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', color: '#166534' }}>
                                        <CheckCircle2 size={28} style={{ margin: '0 auto 8px auto', display: 'block' }} />
                                        <div style={{ fontWeight: '800', fontSize: '0.9rem' }}>No hay remisiones fuera de acuerdo retenidas por precio para este filtro.</div>
                                        <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Todas las remisiones ya cuentan con tarifa comercial asignada y están listas para facturación.</div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Detalle por Remisión */}
                                        {assignPriceOrders.map((ord: any) => {
                                            const clientLabel = ord.profiles?.company_name || ord.profiles?.razon_social || 'Cliente Institucional';
                                            const itemsList = ord.unpriced_items || [];

                                            return (
                                                <div
                                                    key={ord.id}
                                                    style={{
                                                        border: '1px solid #E2E8F0',
                                                        borderRadius: '12px',
                                                        overflow: 'hidden',
                                                        backgroundColor: 'white'
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            padding: '0.65rem 0.95rem',
                                                            backgroundColor: '#F8FAFC',
                                                            borderBottom: '1px solid #E2E8F0',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            flexWrap: 'wrap',
                                                            gap: '8px'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontWeight: '900', fontSize: '0.82rem', color: '#0F172A' }}>
                                                                Remisión #{ord.sequence_id || ord.id.slice(0, 8)}
                                                            </span>
                                                            <span style={{ fontWeight: '800', fontSize: '0.78rem', color: '#0D7A57' }}>
                                                                {clientLabel}
                                                            </span>
                                                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: '600' }}>
                                                                Entrega: {ord.delivery_date || 'Hoy'}
                                                            </span>
                                                            {ord.logistics_data?.parent_order_sequence_id && (
                                                                <span style={{ fontSize: '0.64rem', backgroundColor: '#EFF6FF', color: '#1E40AF', border: '1px solid #BFDBFE', padding: '1px 6px', borderRadius: '99px', fontWeight: '800' }}>
                                                                    Vinculada a Pedido #{ord.logistics_data.parent_order_sequence_id}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#DC2626', backgroundColor: '#FEF2F2', padding: '2px 8px', borderRadius: '6px', border: '1px solid #FECACA' }}>
                                                            Tarifa Comercial Pendiente ($0)
                                                        </div>
                                                    </div>

                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                                                        <thead>
                                                            <tr style={{ backgroundColor: '#F1F5F9', color: '#475569', textAlign: 'left' }}>
                                                                <th style={{ padding: '0.45rem 0.75rem', fontWeight: '800' }}>SKU / Producto Despachado a $0</th>
                                                                <th style={{ padding: '0.45rem 0.75rem', fontWeight: '800', textAlign: 'center' }}>Cant. Entregada</th>
                                                                <th style={{ padding: '0.45rem 0.75rem', fontWeight: '800', textAlign: 'right' }}>Referencias (Costo / Inst.)</th>
                                                                <th style={{ padding: '0.45rem 0.75rem', fontWeight: '800', textAlign: 'center' }}>Estado en Facturación</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {itemsList.map((it: any) => {
                                                                const billableQty = Number(it.billable_quantity ?? it.quantity ?? 0);
                                                                const returnedQty = Number(it.quantity_returned || 0);

                                                                return (
                                                                    <tr key={it.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                                            <div style={{ fontWeight: '800', color: '#0F172A' }}>
                                                                                {it.products?.name || it.nickname || 'Producto'}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.64rem', color: '#64748B' }}>
                                                                                SKU: {it.products?.sku || 'S/N'} · {it.unit || it.products?.unit_of_measure || 'Und'}
                                                                            </div>
                                                                        </td>
                                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center', fontWeight: '800' }}>
                                                                            <span>{billableQty} {it.unit || it.products?.unit_of_measure || 'Und'}</span>
                                                                            {returnedQty > 0 && (
                                                                                <div style={{ fontSize: '0.62rem', color: '#DC2626', fontWeight: '700' }}>
                                                                                    (-{returnedQty} devuelto QA)
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.68rem', color: '#475569' }}>
                                                                            <div>Costo Ref: <b>{it.reference_cost > 0 ? formatMoney(it.reference_cost) : 'N/A'}</b></div>
                                                                            <div>Lista Inst: <b>{it.reference_general_price > 0 ? formatMoney(it.reference_general_price) : 'N/A'}</b></div>
                                                                        </td>
                                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                                            <span style={{ fontSize: '0.65rem', fontWeight: '800', color: '#991B1B', backgroundColor: '#FEF2F2', padding: '2px 7px', borderRadius: '4px', border: '1px solid #FCA5A5' }}>
                                                                                Bloqueado para facturación
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>

                            {/* Footer */}
                            <div
                                style={{
                                    padding: '0.85rem 1.35rem',
                                    backgroundColor: '#F8FAFC',
                                    borderTop: '1px solid #E2E8F0',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: '1rem',
                                    flexWrap: 'wrap'
                                }}
                            >
                                <div style={{ fontSize: '0.70rem', color: '#475569', fontWeight: '600' }}>
                                    Por control interno (SoD), Facturación no tiene permisos para fijar tarifas. Contacta al equipo Comercial para su valoración.
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {assignPriceOrders.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleCopyNoveltiesToCommercial}
                                            style={{
                                                backgroundColor: '#EFF6FF',
                                                color: '#1E40AF',
                                                border: '1px solid #BFDBFE',
                                                padding: '0.5rem 1rem',
                                                borderRadius: '8px',
                                                fontWeight: '800',
                                                fontSize: '0.76rem',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                            title="Copiar reporte estructurado para enviar por WhatsApp o Teams al área Comercial"
                                        >
                                            <Copy size={13} />
                                            <span>Copiar Novedades para Comercial</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setIsAssignPriceModalOpen(false)}
                                        style={{
                                            backgroundColor: 'white',
                                            color: '#475569',
                                            border: '1px solid #CBD5E1',
                                            padding: '0.5rem 1rem',
                                            borderRadius: '8px',
                                            fontWeight: '700',
                                            fontSize: '0.76rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

        {/* WORLD OFFICE CREDIT NOTE SETTLEMENT MODAL (Opción B) */}
            {woModalOpen && woTargetOrder && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 130,
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        borderRadius: '20px',
                        border: '1px solid #E2E8F0',
                        padding: '1.5rem',
                        maxWidth: '560px',
                        width: '100%',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        position: 'relative'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.9rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '10px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Zap size={20} color="#7C3AED" />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: '#0F172A' }}>
                                        Radicar Nota de Crédito en World Office
                                    </h3>
                                    <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B' }}>
                                        Sincronización oficial del comprobante contable con el ERP
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setWoModalOpen(false);
                                    setWoTargetOrder(null);
                                }}
                                style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Order & Client Summary Box */}
                        <div style={{ marginTop: '1rem', backgroundColor: '#FAF5FF', border: '1px solid #E9D5FF', borderRadius: '12px', padding: '0.9rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#581C87' }}>
                                        {woTargetOrder.profiles?.company_name || woTargetOrder.profiles?.contact_name || 'Cliente'}
                                    </div>
                                    <div style={{ fontSize: '0.70rem', color: '#7E22CE' }}>
                                        NIT: {woTargetOrder.profiles?.nit || 'N/A'} • Pedido: #{woTargetOrder.sequence_id ? `1710_${woTargetOrder.sequence_id}` : woTargetOrder.id.slice(0, 8)}
                                    </div>
                                </div>
                                <span style={{ backgroundColor: '#EDE9FE', color: '#6B21A8', padding: '0.2rem 0.5rem', borderRadius: '6px', fontSize: '0.70rem', fontWeight: '800' }}>
                                    Factura: {woTargetOrder.invoice_number || woTargetReturn?.reference_invoice_number || `FV-${woTargetOrder.sequence_id}`}
                                </span>
                            </div>

                            {(() => {
                                const { prodName: targetProdName, ncAmount: targetNcAmount } = resolveReturnProductAndAmount(woTargetReturn, woTargetPqr);
                                return (
                                    <div style={{ borderTop: '1px dashed #D8B4FE', paddingTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.74rem', color: '#6B21A8' }}>
                                            <b>Ítem Afectado:</b> {woTargetReturn?.quantity_returned ? `${woTargetReturn.quantity_returned} Kg de ` : ''}{targetProdName}
                                        </div>
                                        <div style={{ fontSize: '0.95rem', fontWeight: '900', color: '#DC2626' }}>
                                            {targetNcAmount > 0 ? `-${formatNumber(targetNcAmount)} COP` : 'Saldo a Favor'}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        {/* Form Inputs */}
                        <div style={{ marginTop: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#1E293B', marginBottom: '4px' }}>
                                    Número de Comprobante / Folio en World Office <span style={{ color: '#EF4444' }}>*</span>
                                </label>
                                <input
                                    type="text"
                                    value={woFolioInput}
                                    onChange={(e) => setWoFolioInput(e.target.value)}
                                    placeholder="Ej: NC-1042 o NC-1101-2010"
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: '8px',
                                        border: '1.5px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        fontWeight: '700',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                                <span style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px', display: 'block' }}>
                                    Ingresa el consecutivo oficial generado en el módulo de Notas Crédito de World Office.
                                </span>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '800', color: '#1E293B', marginBottom: '4px' }}>
                                    Observaciones Contables / Centro de Costos
                                </label>
                                <textarea
                                    value={woNotesInput}
                                    onChange={(e) => setWoNotesInput(e.target.value)}
                                    rows={2}
                                    placeholder="Ej: Aplicada contra factura en corte semanal. Aprobado por Contabilidad."
                                    style={{
                                        width: '100%',
                                        padding: '0.65rem 0.85rem',
                                        borderRadius: '8px',
                                        border: '1.5px solid #CBD5E1',
                                        fontSize: '0.78rem',
                                        outline: 'none',
                                        boxSizing: 'border-box',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ marginTop: '1.4rem', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setWoModalOpen(false);
                                    setWoTargetOrder(null);
                                }}
                                style={{
                                    backgroundColor: '#F1F5F9',
                                    color: '#64748B',
                                    border: '1px solid #CBD5E1',
                                    padding: '0.6rem 1.1rem',
                                    borderRadius: '8px',
                                    fontWeight: '700',
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={woSubmitting}
                                onClick={handleConfirmWorldOfficeSettlement}
                                style={{
                                    backgroundColor: '#7C3AED',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    padding: '0.6rem 1.25rem',
                                    borderRadius: '8px',
                                    fontWeight: '800',
                                    fontSize: '0.78rem',
                                    cursor: woSubmitting ? 'not-allowed' : 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.3)'
                                }}
                            >
                                <Check size={14} strokeWidth={2.5} />
                                {woSubmitting ? 'Sincronizando...' : 'Confirmar Radicación en WO'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes woPulse {
                    0%, 100% {
                        box-shadow: 0 0 8px rgba(139, 92, 246, 0.45);
                    }
                    50% {
                        box-shadow: 0 0 16px rgba(139, 92, 246, 0.85);
                    }
                }
                @keyframes ping {
                    75%, 100% {
                        transform: scale(2);
                        opacity: 0;
                    }
                }
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-4px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </main>
    );
}