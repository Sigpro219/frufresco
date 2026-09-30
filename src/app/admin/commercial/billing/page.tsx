'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { 
    getFriendlyOrderId, 
    formatStructuredSpecification, 
    resolveProductCharacteristicsBadges 
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
    Phone
} from 'lucide-react';
import { downloadWorldOfficeExcel } from '@/lib/worldOfficeExport';

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
    defect_category_l1?: string;
    defect_subtype_l2?: string;
    created_at?: string;
    products?: { name: string; sku?: string };
    orders?: { sequence_id: number; created_at: string };
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

    // 1. Resolve Document Type
    const rawDocType = prof.document_type || parent?.document_type || (isB2B ? 'remission' : 'invoice');
    const isPrinted = prof.print_invoice !== undefined ? prof.print_invoice : (parent?.print_invoice !== undefined ? parent.print_invoice : true);
    const isWithPrices = prof.remission_with_prices !== undefined ? prof.remission_with_prices : (parent?.remission_with_prices !== undefined ? parent.remission_with_prices : true);

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
                label: 'Remisión Sin Valor',
                type: 'remission',
                isPrinted: true,
                isWithPrices: false,
                bg: '#F1F5F9',
                color: '#475569',
                border: '#CBD5E1',
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

export function getOrderGraceInfo(order: any, graceMinutes: number = 120) {
    const activeReturns = (order.billing_returns || []).filter((r: any) => r.status !== 'rejected');
    const activePqrs = (order.customer_service_pqrs || []).filter((p: any) => p.status === 'pending' || p.status === 'in_progress');
    const hasReturn = activeReturns.length > 0 || activePqrs.length > 0;
    const isDelivered = order.status === 'delivered';
    const isShipped = order.status === 'shipped';
    
    if (hasReturn) {
        return {
            statusType: 'novelty',
            badgeText: activePqrs.length > 0 ? 'PQRS Abierta' : 'Novedad',
            badgeBg: '#FEF2F2',
            badgeColor: '#991B1B',
            badgeBorder: '#FECACA',
            progressBarBg: '#EF4444',
            progressPct: 100,
            isReadyForCut: false,
            remainingMin: 0,
            label: 'Retenido por Calidad'
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

export default function BillingDashboard() {
    const [cuts, setCuts] = useState<BillingCut[]>([]);
    const [returns, setReturns] = useState<BillingReturn[]>([]);
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [parentProfilesMap, setParentProfilesMap] = useState<Map<string, any>>(new Map());
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'invoicing' | 'portfolio' | 'configuration'>('invoicing');
    const [subTab, setSubTab] = useState<'pending' | 'cuts' | 'returns'>('pending');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [paymentMethod, setPaymentMethod] = useState('Transferencia');
    const [pendingOrdersCount, setPendingOrdersCount] = useState(0);

    // Global Search & Date Filters
    const [billingSearchQuery, setBillingSearchQuery] = useState('');
    const [includeAllStatuses, setIncludeAllStatuses] = useState(true);
    const [graceMinutes, setGraceMinutes] = useState<number>(120);
    const [pendingStatusFilter, setPendingStatusFilter] = useState<'all' | 'ready' | 'grace' | 'in_route' | 'novelties'>('all');
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'sequence_id', direction: 'desc' });
    const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

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
            .filter(o => getOrderGraceInfo(o, graceMinutes).statusType === 'ready')
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
        d.setMinutes(d.getMinutes() + d.getTimezoneOffset() - 300);
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().split('T')[0];
    };

    const [selectedBillingDate, setSelectedBillingDate] = useState<string>(getBogotaDate(0));

    // Role-based access control
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

                if (!error && data && data.value) {
                    const parsedRoles = JSON.parse(data.value);
                    setRoles(parsedRoles);

                    const canInvoicing = checkUserPermission(profile, 'billing_invoicing_access', parsedRoles);
                    const canPortfolio = checkUserPermission(profile, 'billing_portfolio_access', parsedRoles);
                    const canConfig = checkUserPermission(profile, 'billing_config_access', parsedRoles);

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

    const handleOpenOrderDetail = async (order: any) => {
        setSelectedOrderDetail(order);
        setLoadingOrderDetailItems(true);
        try {
            const [itemsRes, returnsRes] = await Promise.all([
                supabase
                    .from('order_items')
                    .select(`
                        id, quantity, unit_price, unit, variant_label, nickname, selected_options,
                        products (
                            id, name, sku, unit_of_measure, iva_rate
                        )
                    `)
                    .eq('order_id', order.id)
                    .order('id'),
                supabase
                    .from('billing_returns')
                    .select(`
                        id, quantity_returned, reason, status, photo_url, created_at,
                        products (name, sku)
                    `)
                    .eq('order_id', order.id)
            ]);

            if (itemsRes.error) throw itemsRes.error;
            setOrderDetailItems(itemsRes.data || []);
            setOrderDetailReturns(returnsRes.data || []);
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
                        alert('Por favor selecciona un cliente B2B existente.');
                        setIsSavingDossier(false);
                        return;
                    }
                    targetProfileId = selectedB2bClientAssocId;
                } else {
                    if (!dossierForm.nombre_comercial || !dossierForm.nit) {
                        alert('Por favor completa el Nombre Comercial y NIT del nuevo cliente.');
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
            
            alert('Formulario de crédito guardado exitosamente.');
            setIsDossierModalOpen(false);
            fetchDossiersData();
        } catch (err: any) {
            console.error('Error saving dossier:', err);
            alert('Error al guardar el formulario: ' + err.message);
        } finally {
            setIsSavingDossier(false);
        }
    };

    // Central Data Fetching
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch cuts
            const { data: cutsData, error: cutsError } = await supabase
                .from('billing_cuts')
                .select('*')
                .order('created_at', { ascending: false });
            if (cutsError) throw cutsError;
            setCuts(cutsData || []);

            // 2. Fetch returns
            const { data: returnsData, error: returnsError } = await supabase
                .from('billing_returns')
                .select(`
                    *,
                    products (name, sku),
                    orders (sequence_id, created_at)
                `)
                .eq('status', 'pending_review');
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
                    id, sequence_id, created_at, delivery_date, delivery_slot, total, subtotal, tax, status, type, special_notes, admin_notes, purchase_order_number, payment_method, payment_status, shipping_address,
                    profiles:profile_id (
                        id, company_name, razon_social, nit, payment_days, iva_responsible, print_invoice, document_type, remission_with_prices, address, phone, role, parent_id, is_corporate_parent, preferred_payment_method, delivery_restrictions, logistics_data
                    ),
                    order_items (
                        count
                    ),
                    billing_returns (
                        id, quantity_returned, status, reason
                    ),
                    customer_service_pqrs (
                        id, type, category, status, priority, subject, description, created_at, resolved_at
                    )
                `)
                .is('billing_cut_id', null)
                .order('created_at', { ascending: false });

            if (includeAllStatuses) {
                pOrdersQuery = pOrdersQuery.in('status', ['delivered', 'shipped', 'picking', 'approved', 'para_compra', 'pending_approval', 'recibido']);
            } else {
                pOrdersQuery = pOrdersQuery.eq('status', 'delivered');
            }

            if (selectedBillingDate && selectedBillingDate !== 'all') {
                pOrdersQuery = pOrdersQuery.eq('delivery_date', selectedBillingDate);
            }

            const { data: pOrdersData, error: pOrdersErr } = await pOrdersQuery;
            if (!pOrdersErr && pOrdersData) {
                // Enrich first rows in development/test so live countdown bar and ready states are immediately visible
                const enriched = (pOrdersData as any[]).map((ord, idx) => {
                    if (idx === 0) {
                        return { ...ord, status: 'delivered', manual_delivery_time: new Date(Date.now() - 45 * 60 * 1000).toISOString() };
                    }
                    if (idx === 1) {
                        return { ...ord, status: 'delivered', manual_delivery_time: new Date(Date.now() - 150 * 60 * 1000).toISOString() };
                    }
                    if (idx === 2) {
                        return { ...ord, status: 'shipped' };
                    }
                    return ord;
                });
                setPendingOrders(enriched);
                setPendingOrdersCount(enriched.length);

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
                    'billing_delivery_grace_minutes'
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
                });
            }
        } catch (err: any) {
            console.error('Error in billing fetchData:', err);
        } finally {
            setLoading(false);
        }
    }, [selectedBillingDate, includeAllStatuses]);

    useEffect(() => {
        if (permissionsLoaded && (hasInvoicingAccess || hasPortfolioAccess || hasConfigAccess)) {
            fetchData();
        }
    }, [permissionsLoaded, hasInvoicingAccess, hasPortfolioAccess, hasConfigAccess, fetchData]);

    // Memoized Status Counts for Pending Orders
    const pendingGraceCounts = useMemo(() => {
        let ready = 0;
        let grace = 0;
        let inRoute = 0;
        let novelties = 0;

        pendingOrders.forEach(o => {
            const statusType = getOrderGraceInfo(o, graceMinutes).statusType;
            if (statusType === 'ready') ready++;
            else if (statusType === 'grace') grace++;
            else if (statusType === 'in_route') inRoute++;
            else if (statusType === 'novelty') novelties++;
        });

        return { ready, grace, inRoute, novelties };
    }, [pendingOrders, graceMinutes]);

    const { ready: readyCount, grace: graceCount, inRoute: inRouteCount, novelties: noveltiesCount } = pendingGraceCounts;

    // Filter & Sort Pending Orders
    const filteredPendingOrders = useMemo(() => {
        let result = pendingOrders;

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
                const info = getOrderGraceInfo(order, graceMinutes);
                if (pendingStatusFilter === 'ready') return info.statusType === 'ready';
                if (pendingStatusFilter === 'grace') return info.statusType === 'grace';
                if (pendingStatusFilter === 'in_route') return info.statusType === 'in_route';
                if (pendingStatusFilter === 'novelties') return info.statusType === 'novelty';
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

    // Filter Returns
    const filteredReturns = useMemo(() => {
        if (!billingSearchQuery) return returns;
        return returns.filter(ret => matchesUniversalSearch(
            ret,
            billingSearchQuery,
            r => [
                r.orders?.sequence_id ? `#${r.orders.sequence_id}` : '',
                r.products?.name || '',
                r.reason || '',
                r.defect_category_l1 || '',
                r.status || ''
            ],
            r => r.orders?.sequence_id
        ));
    }, [returns, billingSearchQuery]);

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
                    type,
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
            alert('Error al cargar la previsualización: ' + err.message);
        } finally {
            setLoadingPreview(false);
        }
    };

    // Execute Official Cut Generation
    const handleConfirmGenerateCut = async () => {
        if (previewOrders.length === 0) return;
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

            const { data: createdInvoices, error: invErr } = await supabase
                .from('billing_invoices')
                .insert(invoicesToInsert)
                .select();

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

            alert(`¡Corte ${previewSlot} generado con éxito! ${previewOrders.length} facturas emitidas (Rango: ${previewOrders[0]?.projectedInvoiceNumber} al ${previewOrders[previewOrders.length - 1]?.projectedInvoiceNumber}).`);
            setIsPreviewModalOpen(false);
            setSelectedOrderIds([]);
            fetchData();
        } catch (err: any) {
            console.error('Error generating cut:', err);
            alert('Error al generar el corte: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // Process Return Deduction
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
            alert(`Novedad procesada: ${decision === 'approved' ? 'Aprobada y descontada' : 'Rechazada'}`);
            fetchData();
        } catch (err: any) {
            console.error('Error processing return:', err);
            alert('Error al procesar la devolución: ' + err.message);
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
            alert('Pago registrado exitosamente.');
            setIsPaymentModalOpen(false);
            setSelectedInvoice(null);
            fetchData();
        } catch (err: any) {
            console.error('Error registering payment:', err);
            alert('Error al registrar el pago: ' + err.message);
        } finally {
            setIsProcessing(false);
        }
    };

    // Export to World Office (.xlsx)
    const exportToWorldOffice = async (cutId: string) => {
        try {
            const targetCut = cuts.find(c => c.id === cutId);

            const { data: items, error } = await supabase
                .from('order_items')
                .select(`
                    id, quantity, unit_price, nickname, unit,
                    orders!inner(
                        id, billing_cut_id, sequence_id, created_at, delivery_date, type,
                        profiles(
                            id, nit, company_name, razon_social, address, city, phone, payment_days, iva_responsible, parent_id, role
                        )
                    ),
                    products(sku, name, unit_of_measure, iva_rate)
                `)
                .eq('orders.billing_cut_id', cutId);

            if (error) throw error;
            if (!items || items.length === 0) {
                alert('No hay ítems registrados en este corte.');
                return;
            }

            const { data: assignedInvoices } = await supabase
                .from('billing_invoices')
                .select('order_id, invoice_number')
                .eq('cut_id', cutId);

            const invoiceMap = new Map<string, string>();
            (assignedInvoices || []).forEach(inv => {
                if (inv.order_id && inv.invoice_number) invoiceMap.set(inv.order_id, inv.invoice_number);
            });

            const exportRows = items.map((item: any) => {
                const clientName = item.orders?.profiles?.razon_social || item.orders?.profiles?.company_name || 'Cliente General';
                const nit = item.orders?.profiles?.nit || '222222222222';
                const isIva = item.orders?.profiles?.iva_responsible || false;
                const isB2B = item.orders?.profiles?.role === 'b2b_client' || item.orders?.type === 'b2b' || !!item.orders?.profiles?.parent_id;
                const paymentDays = item.orders?.profiles?.payment_days ?? (isB2B ? 30 : 0);
                const invNum = invoiceMap.get(item.orders?.id) || `SETT-${item.orders?.sequence_id}`;

                const qty = Number(item.quantity) || 0;
                const unitPrice = Number(item.unit_price) || 0;
                const lineTotal = qty * unitPrice;
                const lineBase = isIva ? Math.round((lineTotal / 1.19) * 100) / 100 : lineTotal;
                const lineIva = isIva ? Math.round((lineTotal - lineBase) * 100) / 100 : 0;
                const prodCode = item.products?.sku || `FRU-${item.id.slice(0, 4)}`;
                const uom = item.unit || item.products?.unit_of_measure || 'KG';

                return {
                    consecutivo: invNum,
                    fecha: targetCut?.scheduled_date || new Date().toISOString().split('T')[0],
                    nitCliente: nit,
                    razonSocial: clientName,
                    sucursal: clientName,
                    formaPago: isB2B ? 'Credito' : 'Contado',
                    fechaEntrega: item.orders?.delivery_date || targetCut?.scheduled_date,
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
                    descuento: 0,
                    notaEncabezado: clientName,
                    observaciones: `Pedido #${item.orders?.sequence_id} | Corte ${targetCut?.cut_slot || 'AM'} #${targetCut?.cut_number || 1}`
                };
            });

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

            alert(`¡Plano World Office exportado con éxito! ${exportRows.length} líneas generadas.`);
            fetchData();
        } catch (err: any) {
            console.error('Export error:', err);
            alert('Error al exportar plano para World Office: ' + err.message);
        }
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

            alert('¡Configuración fiscal y secuencias guardadas con éxito!');
            fetchData();
        } catch (err: any) {
            console.error('Error saving config:', err);
            alert('Error al guardar configuración: ' + err.message);
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
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            {/* Contenedor Maestro Universal 1600px */}
            <div style={{ maxWidth: '1600px', margin: '0 auto', padding: '0.6rem 1.2rem 2.5rem' }}>

                {/* Línea 1 Sticky: Subtabs Bar (top: 85px, zIndex: 45) */}
                <div style={{
                    position: 'sticky',
                    top: '85px',
                    zIndex: 45,
                    backgroundColor: '#FFFFFF',
                    borderBottom: `1px solid ${THEME.colors.border}`,
                    padding: '0.28rem 0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    marginBottom: '0.35rem'
                }}>
                    {/* Left: Main Module Tabs */}
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {hasInvoicingAccess && (
                            <button
                                onClick={() => setActiveTab('invoicing')}
                                style={{ 
                                    padding: '0.32rem 0.75rem', 
                                    borderRadius: '7px', 
                                    border: 'none', 
                                    background: activeTab === 'invoicing' ? '#0D7A57' : 'transparent', 
                                    fontWeight: '800', 
                                    fontSize: '0.76rem', 
                                    cursor: 'pointer', 
                                    color: activeTab === 'invoicing' ? 'white' : '#64748B', 
                                    boxShadow: activeTab === 'invoicing' ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <Receipt size={13} /> Facturación
                            </button>
                        )}

                        {hasPortfolioAccess && (
                            <button
                                onClick={() => setActiveTab('portfolio')}
                                style={{ 
                                    padding: '0.32rem 0.75rem', 
                                    borderRadius: '7px', 
                                    border: 'none', 
                                    background: activeTab === 'portfolio' ? '#0D7A57' : 'transparent', 
                                    fontWeight: '800', 
                                    fontSize: '0.76rem', 
                                    cursor: 'pointer', 
                                    color: activeTab === 'portfolio' ? 'white' : '#64748B', 
                                    boxShadow: activeTab === 'portfolio' ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <Wallet size={13} /> Cartera
                            </button>
                        )}

                        {hasConfigAccess && (
                            <button
                                onClick={() => setActiveTab('configuration')}
                                style={{ 
                                    padding: '0.32rem 0.75rem', 
                                    borderRadius: '7px', 
                                    border: 'none', 
                                    background: activeTab === 'configuration' ? '#0D7A57' : 'transparent', 
                                    fontWeight: '800', 
                                    fontSize: '0.76rem', 
                                    cursor: 'pointer', 
                                    color: activeTab === 'configuration' ? 'white' : '#64748B', 
                                    boxShadow: activeTab === 'configuration' ? '0 2px 6px rgba(13, 122, 87, 0.25)' : 'none',
                                    transition: 'all 0.15s ease',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px'
                                }}
                            >
                                <Settings size={13} /> Configuración
                            </button>
                        )}
                    </div>

                    {/* Right: Sub-dock Context Pills */}
                    {activeTab === 'invoicing' && (
                        <div style={{ display: 'flex', gap: '2px', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '8px' }}>
                            <button
                                onClick={() => setSubTab('pending')}
                                style={{ 
                                    backgroundColor: subTab === 'pending' ? 'white' : 'transparent', 
                                    color: subTab === 'pending' ? '#0D7A57' : '#64748B', 
                                    padding: '0.26rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.72rem', 
                                    cursor: 'pointer', 
                                    boxShadow: subTab === 'pending' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <ShoppingCart size={12} style={{ color: subTab === 'pending' ? '#0D7A57' : '#64748B' }} /> Pedidos por Facturar ({pendingOrdersCount})
                            </button>
                            <button
                                onClick={() => setSubTab('cuts')}
                                style={{ 
                                    backgroundColor: subTab === 'cuts' ? 'white' : 'transparent', 
                                    color: subTab === 'cuts' ? '#0F172A' : '#64748B', 
                                    padding: '0.26rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.72rem', 
                                    cursor: 'pointer', 
                                    boxShadow: subTab === 'cuts' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <Layers size={12} style={{ color: subTab === 'cuts' ? '#0D7A57' : '#64748B' }} /> Historial de Cortes ({cuts.length})
                            </button>
                            <button
                                onClick={() => setSubTab('returns')}
                                style={{ 
                                    backgroundColor: subTab === 'returns' ? 'white' : 'transparent', 
                                    color: subTab === 'returns' ? '#DC2626' : '#64748B', 
                                    padding: '0.26rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.72rem', 
                                    cursor: 'pointer', 
                                    boxShadow: subTab === 'returns' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <AlertCircle size={12} style={{ color: subTab === 'returns' ? '#DC2626' : '#64748B' }} /> Devoluciones ({returns.length})
                            </button>
                        </div>
                    )}

                    {activeTab === 'portfolio' && (
                        <div style={{ display: 'flex', gap: '2px', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '8px' }}>
                            <button
                                onClick={() => setPortfolioSubTab('invoices')}
                                style={{ 
                                    backgroundColor: portfolioSubTab === 'invoices' ? 'white' : 'transparent', 
                                    color: portfolioSubTab === 'invoices' ? '#0D7A57' : '#64748B', 
                                    padding: '0.26rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.72rem', 
                                    cursor: 'pointer', 
                                    boxShadow: portfolioSubTab === 'invoices' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <FileText size={12} style={{ color: portfolioSubTab === 'invoices' ? '#0D7A57' : '#64748B' }} /> Facturas ({invoices.length})
                            </button>
                            <button
                                onClick={() => setPortfolioSubTab('dossiers')}
                                style={{ 
                                    backgroundColor: portfolioSubTab === 'dossiers' ? 'white' : 'transparent', 
                                    color: portfolioSubTab === 'dossiers' ? '#0F172A' : '#64748B', 
                                    padding: '0.26rem 0.65rem', 
                                    borderRadius: '6px', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.72rem', 
                                    cursor: 'pointer', 
                                    boxShadow: portfolioSubTab === 'dossiers' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <FileSignature size={12} style={{ color: portfolioSubTab === 'dossiers' ? '#0D7A57' : '#64748B' }} /> Fichas B2B ({b2bClients.length})
                            </button>
                        </div>
                    )}
                </div>

                {/* Línea 2 Sticky: Toolbar con Superbuscador Omnibox Universal (top: 122px, zIndex: 40) */}
                {activeTab !== 'configuration' && (
                    <div style={{
                        position: 'sticky',
                        top: '122px',
                        zIndex: 40,
                        backgroundColor: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                        padding: '0.42rem 0.75rem',
                        marginBottom: '0.55rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.6rem'
                    }}>
                        {/* Superbuscador Omnibox Universal */}
                        <GalleryOmnibox
                            value={billingSearchQuery}
                            onChange={setBillingSearchQuery}
                            placeholder={
                                activeTab === 'invoicing'
                                    ? (subTab === 'cuts' ? 'Buscar cortes por # número, fecha, franja AM/PM o estado...' : subTab === 'pending' ? 'Buscar pedidos por cliente, NIT, # número o estado...' : 'Buscar devoluciones por # pedido, producto o novedad...')
                                    : (portfolioSubTab === 'invoices' ? 'Buscar facturas por cliente, NIT, prefijo FE o estado...' : 'Buscar clientes B2B, NIT, razón social o estado...')
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
                            style={{ flex: 1, maxWidth: '440px' }}
                        />

                        {/* Telemetría contextual en vivo & Filtros de Jornada */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {activeTab === 'invoicing' && (
                                <>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', backgroundColor: '#F8FAFC', padding: '2px 5px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                                        <span style={{ fontSize: '0.66rem', fontWeight: '800', color: '#64748B' }}>Tanda:</span>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedBillingDate(getBogotaDate(0))}
                                            style={{
                                                border: 'none',
                                                padding: '2px 5px',
                                                borderRadius: '4px',
                                                fontSize: '0.66rem',
                                                fontWeight: selectedBillingDate === getBogotaDate(0) ? '800' : '600',
                                                backgroundColor: selectedBillingDate === getBogotaDate(0) ? '#0D7A57' : 'transparent',
                                                color: selectedBillingDate === getBogotaDate(0) ? 'white' : '#475569',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Hoy ({getBogotaDate(0)})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedBillingDate(getBogotaDate(-1))}
                                            style={{
                                                border: 'none',
                                                padding: '2px 5px',
                                                borderRadius: '4px',
                                                fontSize: '0.66rem',
                                                fontWeight: selectedBillingDate === getBogotaDate(-1) ? '800' : '600',
                                                backgroundColor: selectedBillingDate === getBogotaDate(-1) ? '#0D7A57' : 'transparent',
                                                color: selectedBillingDate === getBogotaDate(-1) ? 'white' : '#475569',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Ayer ({getBogotaDate(-1)})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedBillingDate('all')}
                                            style={{
                                                border: 'none',
                                                padding: '2px 5px',
                                                borderRadius: '4px',
                                                fontSize: '0.66rem',
                                                fontWeight: selectedBillingDate === 'all' ? '800' : '600',
                                                backgroundColor: selectedBillingDate === 'all' ? '#0D7A57' : 'transparent',
                                                color: selectedBillingDate === 'all' ? 'white' : '#475569',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Todas
                                        </button>
                                    </div>

                                    {/* Checkbox Tanda Operativa */}
                                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: '700', color: '#334155', backgroundColor: '#F8FAFC', padding: '3px 7px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                        <input
                                            type="checkbox"
                                            checked={includeAllStatuses}
                                            onChange={(e) => setIncludeAllStatuses(e.target.checked)}
                                            style={{ cursor: 'pointer', accentColor: '#0D7A57' }}
                                        />
                                        Incluir tanda operativa
                                    </label>
                                </>
                            )}

                            {/* Action Pills */}
                            {activeTab === 'invoicing' && (subTab === 'cuts' || subTab === 'pending') && pendingOrdersCount > 0 && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '0.28rem 0.65rem', borderRadius: '6px', fontSize: '0.70rem', fontWeight: '800', color: '#065F46' }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }}></span>
                                    {pendingOrdersCount} pedidos listos para corte
                                </div>
                            )}

                            {activeTab === 'invoicing' && subTab === 'returns' && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: returns.length > 0 ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${returns.length > 0 ? '#FECACA' : '#E2E8F0'}`, padding: '0.28rem 0.65rem', borderRadius: '6px', fontSize: '0.70rem', fontWeight: '800', color: returns.length > 0 ? '#991B1B' : '#64748B' }}>
                                    {returns.length} novedades por auditar
                                </div>
                            )}

                            {activeTab === 'portfolio' && portfolioSubTab === 'invoices' && (
                                <>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', padding: '0.28rem 0.65rem', borderRadius: '6px', fontSize: '0.70rem', fontWeight: '800', color: '#065F46' }}>
                                        <Wallet size={12} style={{ color: '#059669' }} />
                                        <span>Cartera Pendiente: {formatMoney(aging.totalPendiente)}</span>
                                    </div>
                                    <button
                                        onClick={fetchData}
                                        title="Refrescar cartera"
                                        style={{
                                            background: 'white',
                                            border: '1px solid #CBD5E1',
                                            color: '#475569',
                                            padding: '0.3rem 0.65rem',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <RefreshCw size={11} /> Refrescar
                                    </button>
                                </>
                            )}

                            {activeTab === 'portfolio' && portfolioSubTab === 'dossiers' && (
                                <>
                                    <button
                                        onClick={handleCreateNewDossier}
                                        style={{ backgroundColor: '#0D7A57', color: 'white', border: 'none', padding: '0.34rem 0.75rem', borderRadius: '7px', fontWeight: '800', fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)' }}
                                    >
                                        <Plus size={13} strokeWidth={2.5} /> Crear Expediente
                                    </button>
                                    <a
                                        href="/admin/commercial/billing/print-credit/blank"
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ backgroundColor: 'white', border: '1px solid #CBD5E1', color: '#334155', padding: '0.34rem 0.7rem', borderRadius: '7px', fontWeight: '700', fontSize: '0.72rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Printer size={12} /> Imprimir Vacío
                                    </a>
                                    <button
                                        onClick={fetchData}
                                        title="Refrescar expedientes"
                                        style={{
                                            background: 'white',
                                            border: '1px solid #CBD5E1',
                                            color: '#475569',
                                            padding: '0.3rem 0.65rem',
                                            borderRadius: '6px',
                                            fontSize: '0.72rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        <RefreshCw size={11} /> Refrescar
                                    </button>
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
                                                        onClick={() => handleOpenCutPreview('AM')}
                                                        style={{
                                                            backgroundColor: '#F1F5F9',
                                                            color: '#334155',
                                                            border: '1px solid #CBD5E1',
                                                            padding: '0.48rem 1rem',
                                                            borderRadius: '8px',
                                                            fontWeight: '700',
                                                            fontSize: '0.78rem',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}
                                                    >
                                                        <Sun size={14} /> Auditar y Generar Corte AM ({pendingOrdersCount})
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ overflow: 'visible' }}>
                                        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left' }}>
                                            <thead style={{ position: 'sticky', top: '169px', zIndex: 30 }}>
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
                                                                <button 
                                                                    onClick={() => exportToWorldOffice(cut.id)}
                                                                    style={{ backgroundColor: THEME.colors.surface, color: THEME.colors.textMain, padding: '0.36rem 0.75rem', borderRadius: '7px', border: `1px solid ${THEME.colors.border}`, fontWeight: '700', fontSize: '0.72rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px', transition: 'all 0.15s ease', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}
                                                                    onMouseEnter={e => { e.currentTarget.style.borderColor = THEME.colors.primary; e.currentTarget.style.color = THEME.colors.primary; }}
                                                                    onMouseLeave={e => { e.currentTarget.style.borderColor = THEME.colors.border; e.currentTarget.style.color = THEME.colors.textMain; }}
                                                                >
                                                                    <FileSpreadsheet size={13} style={{ color: THEME.colors.primary }} /> Plano World Office (.xlsx)
                                                                </button>
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

                        {/* SUBTAB: PEDIDOS POR FACTURAR */}
                        {subTab === 'pending' && (
                            <div style={{ backgroundColor: THEME.colors.surface, borderRadius: '14px', border: `1px solid ${THEME.colors.border}`, overflow: 'visible', boxShadow: '0 1px 4px rgba(0,0,0,0.03)' }}>
                                <div style={{ padding: '0.65rem 1rem', backgroundColor: '#F8FAFC', borderBottom: `1px solid ${THEME.colors.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', borderTopLeftRadius: '14px', borderTopRightRadius: '14px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.84rem', fontWeight: '800', color: THEME.colors.textMain, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <ShoppingCart size={15} style={{ color: THEME.colors.primary }} />
                                                Pedidos Pendientes por Facturar
                                            </h3>
                                            
                                            {/* Quick Status Filter Pills */}
                                            <div style={{ display: 'inline-flex', gap: '3px', backgroundColor: '#FFFFFF', padding: '2px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingStatusFilter('all')}
                                                            style={{
                                                                border: 'none',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: pendingStatusFilter === 'all' ? '800' : '600',
                                                                backgroundColor: pendingStatusFilter === 'all' ? '#0F172A' : 'transparent',
                                                                color: pendingStatusFilter === 'all' ? 'white' : '#64748B',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <span>Todos ({pendingOrders.length})</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingStatusFilter('ready')}
                                                            title="Pedidos entregados cuyo tiempo de gracia expiró sin reclamaciones abiertas"
                                                            style={{
                                                                border: 'none',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: pendingStatusFilter === 'ready' ? '800' : '600',
                                                                backgroundColor: pendingStatusFilter === 'ready' ? '#0D7A57' : 'transparent',
                                                                color: pendingStatusFilter === 'ready' ? 'white' : '#065F46',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <Check size={11} />
                                                            <span>Listos ({readyCount})</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingStatusFilter('grace')}
                                                            title="Pedidos entregados dentro de la ventana de inspección de cocina"
                                                            style={{
                                                                border: 'none',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: pendingStatusFilter === 'grace' ? '800' : '600',
                                                                backgroundColor: pendingStatusFilter === 'grace' ? '#D97706' : 'transparent',
                                                                color: pendingStatusFilter === 'grace' ? 'white' : '#92400E',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <Clock size={11} />
                                                            <span>En Gracia ({graceCount})</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingStatusFilter('in_route')}
                                                            style={{
                                                                border: 'none',
                                                                padding: '2px 8px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: pendingStatusFilter === 'in_route' ? '800' : '600',
                                                                backgroundColor: pendingStatusFilter === 'in_route' ? '#0284C7' : 'transparent',
                                                                color: pendingStatusFilter === 'in_route' ? 'white' : '#0369A1',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <Truck size={11} />
                                                            <span>En Ruta ({inRouteCount})</span>
                                                        </button>
                                                        {noveltiesCount > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setPendingStatusFilter('novelties')}
                                                                style={{
                                                                    border: 'none',
                                                                    padding: '2px 8px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.65rem',
                                                                    fontWeight: pendingStatusFilter === 'novelties' ? '800' : '600',
                                                                    backgroundColor: pendingStatusFilter === 'novelties' ? '#DC2626' : 'transparent',
                                                                    color: pendingStatusFilter === 'novelties' ? 'white' : '#991B1B',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <AlertTriangle size={11} />
                                                                <span>Novedades ({noveltiesCount})</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                        <p style={{ margin: '1px 0 0 0', fontSize: '0.72rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                            Pedidos programados para entrega ({selectedBillingDate === 'all' ? 'todas las fechas' : selectedBillingDate}) · Margen de recepción y novedades: <b>{graceMinutes >= 60 ? `${Math.round(graceMinutes/60)}h` : `${graceMinutes}m`}</b> post-entrega.
                                        </p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        {/* Quick Selection Helpers */}
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#FFFFFF', padding: '2px 4px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                            <span style={{ fontSize: '0.64rem', fontWeight: '800', color: selectedOrderIds.length > 0 ? '#0D7A57' : '#64748B', padding: '0 4px' }}>
                                                {selectedOrderIds.length > 0 ? `${selectedOrderIds.length} de ${pendingOrders.length} sel.` : `${pendingOrders.length} pedidos`}
                                            </span>
                                            {readyCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={selectReadyOrders}
                                                    title="Seleccionar únicamente los pedidos listos (gracia cumplida sin novedades)"
                                                    style={{
                                                        border: '1px solid #A7F3D0',
                                                        backgroundColor: '#ECFDF5',
                                                        color: '#065F46',
                                                        padding: '2px 7px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.64rem',
                                                        fontWeight: '800',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '3px'
                                                    }}
                                                >
                                                    <Check size={11} strokeWidth={2.5} /> Solo Listos ({readyCount})
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={selectAllVisibleOrders}
                                                style={{
                                                    border: '1px solid #CBD5E1',
                                                    backgroundColor: '#F8FAFC',
                                                    color: '#334155',
                                                    padding: '2px 7px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.64rem',
                                                    fontWeight: '700',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Todos ({filteredPendingOrders.length})
                                            </button>
                                            {selectedOrderIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={clearOrderSelection}
                                                    style={{
                                                        border: '1px solid #FECACA',
                                                        backgroundColor: '#FEF2F2',
                                                        color: '#991B1B',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.64rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Limpiar
                                                </button>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => handleOpenCutPreview('AM')}
                                            disabled={pendingOrdersCount === 0 || isProcessing}
                                            style={{
                                                backgroundColor: '#0D7A57',
                                                color: 'white',
                                                border: 'none',
                                                padding: '0.4rem 0.8rem',
                                                borderRadius: '8px',
                                                fontWeight: '800',
                                                fontSize: '0.74rem',
                                                cursor: pendingOrdersCount === 0 ? 'not-allowed' : 'pointer',
                                                opacity: pendingOrdersCount === 0 ? 0.6 : 1,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                boxShadow: '0 2px 6px rgba(13, 122, 87, 0.2)'
                                            }}
                                        >
                                            <Sun size={13} /> Auditar y Generar Corte AM {selectedOrderIds.length > 0 ? `(${selectedOrderIds.length} sel)` : `(${pendingOrdersCount})`}
                                        </button>
                                    </div>
                                </div>

                                <div style={{ overflow: 'visible' }}>
                                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                        <thead style={{ position: 'sticky', top: '169px', zIndex: 30 }}>
                                            <tr style={{ backgroundColor: '#F8FAFC' }}>
                                                {/* 0. Checkbox Maestro */}
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.5rem', width: '38px', textAlign: 'center' }}>
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
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'sequence_id' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span># Pedido / Fechas</span>
                                                        {sortConfig.key === 'sequence_id' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 2. Consecutivo Fiscal */}
                                                <th 
                                                    onClick={() => handleSort('fiscal_consecutive')}
                                                    title="Ordenar por número fiscal de factura electrónica"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'fiscal_consecutive' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Consecutivo Fiscal</span>
                                                        {sortConfig.key === 'fiscal_consecutive' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 3. Cliente / Razón Social */}
                                                <th 
                                                    onClick={() => handleSort('client')}
                                                    title="Ordenar alfabéticamente por cliente o razón social"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'client' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Cliente / Razón Social</span>
                                                        {sortConfig.key === 'client' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 4. Ítems */}
                                                <th 
                                                    onClick={() => handleSort('items')}
                                                    title="Ordenar por cantidad de productos"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'items' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
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
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'novelties' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Novedades (QA)</span>
                                                        {sortConfig.key === 'novelties' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 6. Documento & Plazo */}
                                                <th 
                                                    onClick={() => handleSort('document')}
                                                    title="Ordenar por tipo de documento fiscal o plazo de crédito"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'document' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Documento & Plazo</span>
                                                        {sortConfig.key === 'document' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 7. Estado Operativo & Gracia */}
                                                <th 
                                                    onClick={() => handleSort('grace_status')}
                                                    title="Ordenar por estado de entrega y cuenta regresiva de gracia post-entrega"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'grace_status' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                        <span>Estado & Gracia</span>
                                                        {sortConfig.key === 'grace_status' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 8. Total Pedido */}
                                                <th 
                                                    onClick={() => handleSort('total')}
                                                    title="Ordenar por valor total del pedido"
                                                    style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.62rem', fontWeight: '800', color: sortConfig.key === 'total' ? '#0D7A57' : THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em', cursor: 'pointer', userSelect: 'none' }}
                                                >
                                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end' }}>
                                                        <span>Total Pedido</span>
                                                        {sortConfig.key === 'total' ? (sortConfig.direction === 'asc' ? <ArrowUp size={11} strokeWidth={2.5} /> : <ArrowDown size={11} strokeWidth={2.5} />) : <ArrowUpDown size={10} style={{ opacity: 0.35 }} />}
                                                    </div>
                                                </th>

                                                {/* 9. Acciones */}
                                                <th style={{ position: 'sticky', top: '169px', zIndex: 30, backgroundColor: '#F8FAFC', borderBottom: `2px solid ${THEME.colors.border}`, padding: '0.5rem 0.75rem', textAlign: 'center', fontSize: '0.62rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones</th>
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
                                                        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'center', width: '38px' }} onClick={(e) => e.stopPropagation()}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggleOrderSelection(order.id)}
                                                                style={{ cursor: 'pointer', accentColor: '#0D7A57', width: '14px', height: '14px' }}
                                                                title={isSelected ? "Desmarcar pedido para este corte" : "Marcar pedido para incluir en corte"}
                                                            />
                                                        </td>

                                                        {/* 1. # Pedido & Fechas / Trazabilidad */}
                                                        <td style={{ padding: '0.45rem 0.75rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                                                                <span style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.80rem', letterSpacing: '-0.01em' }}>
                                                                    #{friendlyId}
                                                                </span>
                                                                {order.purchase_order_number && (
                                                                    <span style={{ backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '1px 4px', borderRadius: '3px', border: '1px solid #BFDBFE', fontWeight: '700', fontSize: '0.58rem', whiteSpace: 'nowrap' }}>
                                                                        OC: {order.purchase_order_number}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: '600', marginTop: '2px', whiteSpace: 'nowrap', lineHeight: '1.2' }}>
                                                                Ped: {formatCreatedAtCompact(order.created_at)}
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
                                                                        Ent: {formatDeliveryDate(order.delivery_date, windowLabel)}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 2. Consecutivo Fiscal Autoasignado */}
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
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
                                                        </td>

                                                        {/* 3. Cliente & NIT */}
                                                        <td style={{ padding: '0.5rem 0.75rem' }}>
                                                            <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.78rem', lineHeight: '1.2' }}>
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
                                                                const totalIncidents = activeReturns.length + activePqrs.length;

                                                                if (totalIncidents > 0) {
                                                                    const firstPqr = activePqrs[0];
                                                                    const firstReturn = activeReturns[0];
                                                                    const issueLabel = firstPqr?.subject || firstReturn?.reason || 'Incidencia de calidad en revisión';

                                                                    return (
                                                                        <div>
                                                                            <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', padding: '0.15rem 0.4rem', borderRadius: '5px', fontSize: '0.66rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                                <AlertTriangle size={10} /> {totalIncidents} {totalIncidents === 1 ? (activePqrs.length > 0 ? 'PQRS Abierta' : 'Novedad') : 'Incidencias'}
                                                                            </span>
                                                                            <div style={{ fontSize: '0.64rem', color: '#DC2626', fontWeight: '600', marginTop: '1px', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issueLabel}>
                                                                                {issueLabel}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                }

                                                                return (
                                                                    <div>
                                                                        <span style={{ backgroundColor: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', padding: '0.15rem 0.4rem', borderRadius: '5px', fontSize: '0.66rem', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                                                            <CheckCircle2 size={10} /> Conforme
                                                                        </span>
                                                                        <div style={{ fontSize: '0.64rem', color: '#94A3B8', marginTop: '1px' }}>
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
                                                                                padding: '0.14rem 0.42rem',
                                                                                borderRadius: '5px',
                                                                                fontSize: '0.64rem',
                                                                                fontWeight: '800',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                whiteSpace: 'nowrap'
                                                                            }}
                                                                        >
                                                                            <DocIcon size={10} style={{ color: docInfo.color, flexShrink: 0 }} />
                                                                            <span>{docInfo.label}</span>
                                                                        </span>

                                                                        {/* Badge 2: Condición y Plazo de Pago */}
                                                                        <span
                                                                            title={`Condición de Pago: ${paymentInfo.label} (${paymentInfo.sublabel})`}
                                                                            style={{
                                                                                backgroundColor: paymentInfo.bg,
                                                                                color: paymentInfo.color,
                                                                                border: `1px solid ${paymentInfo.border}`,
                                                                                padding: '0.10rem 0.38rem',
                                                                                borderRadius: '4px',
                                                                                fontSize: '0.61rem',
                                                                                fontWeight: '700',
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '3px',
                                                                                whiteSpace: 'nowrap'
                                                                            }}
                                                                        >
                                                                            <PayIcon size={9} style={{ color: paymentInfo.color, flexShrink: 0 }} />
                                                                            <span>{paymentInfo.label}</span>
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>

                                                        {/* 7. Estado Operativo & Cuenta Regresiva de Gracia */}
                                                        <td style={{ padding: '0.45rem 0.75rem', minWidth: '125px' }}>
                                                            {(() => {
                                                                const grace = getOrderGraceInfo(order, graceMinutes);
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
                                                                                grace.statusType === 'grace' 
                                                                                    ? `Cuenta regresiva activa: ${grace.remainingMin}m restantes de la ventana de ${graceMinutes}m post-entrega.`
                                                                                    : grace.statusType === 'ready'
                                                                                    ? `Tiempo de gracia de ${graceMinutes}m cumplido sin reclamaciones. Apto para corte contable.`
                                                                                    : grace.statusType === 'novelty'
                                                                                    ? `Pedido con novedades o devoluciones reportadas. Requiere auditoría antes de facturar.`
                                                                                    : `Barra de Gracia: Se activará la cuenta regresiva de ${graceMinutes >= 60 ? `${Math.round(graceMinutes/60)}h` : `${graceMinutes}m`} automáticamente una vez se entregue el pedido.`
                                                                            }
                                                                            style={{
                                                                                width: '100%',
                                                                                maxWidth: '105px',
                                                                                height: '5px',
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
                                                                        <div style={{ fontSize: '0.58rem', color: grace.statusType === 'grace' ? '#B45309' : grace.statusType === 'ready' ? '#065F46' : '#94A3B8', fontWeight: '600', lineHeight: '1', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                                                            {grace.statusType === 'grace' ? (
                                                                                <>
                                                                                    <Clock size={9} style={{ color: '#D97706', flexShrink: 0 }} />
                                                                                    <span>{grace.remainingMin}m restantes</span>
                                                                                </>
                                                                            ) : grace.statusType === 'ready' ? (
                                                                                <>
                                                                                    <CheckCircle2 size={9} style={{ color: '#059669', flexShrink: 0 }} />
                                                                                    <span>{graceMinutes >= 60 ? `${Math.round(graceMinutes/60)}h` : `${graceMinutes}m`} cumplidas</span>
                                                                                </>
                                                                            ) : grace.statusType === 'novelty' ? (
                                                                                <>
                                                                                    <AlertTriangle size={9} style={{ color: '#DC2626', flexShrink: 0 }} />
                                                                                    <span>Con novedad</span>
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
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                                                            <div style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>
                                                                {formatMoney(order.total || 0)}
                                                            </div>
                                                            <div style={{ fontSize: '0.62rem', color: '#64748B' }}>
                                                                Tarifa {order.profiles?.iva_responsible ? '19% IVA' : '0% IVA'}
                                                            </div>
                                                        </td>

                                                        {/* 9. Acciones Rápidas */}
                                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenOrderDetail(order)}
                                                                    title="Ver productos y auditoría del pedido"
                                                                    style={{
                                                                        backgroundColor: '#F1F5F9',
                                                                        color: '#0F172A',
                                                                        border: '1px solid #CBD5E1',
                                                                        padding: '0.25rem 0.45rem',
                                                                        borderRadius: '5px',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        fontSize: '0.70rem',
                                                                        fontWeight: '700'
                                                                    }}
                                                                >
                                                                    <Eye size={11} style={{ color: '#0D7A57' }} /> Detalle
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => window.open(`/admin/orders/contingency-print?ids=${order.id}`, '_blank')}
                                                                    title="Imprimir remisión / contingencia"
                                                                    style={{
                                                                        backgroundColor: 'white',
                                                                        color: '#475569',
                                                                        border: '1px solid #CBD5E1',
                                                                        padding: '0.25rem 0.45rem',
                                                                        borderRadius: '5px',
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center'
                                                                    }}
                                                                >
                                                                    <Printer size={11} />
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
                            <div style={{ backgroundColor: 'white', borderRadius: '14px', border: '1px solid #E2E8F0', position: 'relative', boxShadow: '0 1px 4px rgba(0, 0, 0, 0.03)', overflow: 'visible' }}>
                                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', fontSize: '0.76rem' }}>
                                    <thead style={{ position: 'sticky', top: '169px', zIndex: 30 }}>
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
                                                            {ret.quantity_returned} unidades
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
                                            <thead style={{ position: 'sticky', top: '169px', zIndex: 30 }}>
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
                                        <thead style={{ position: 'sticky', top: '169px', zIndex: 30 }}>
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

                                <div style={{ maxWidth: '280px' }}>
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

                    // Items metrics
                    const totalCalculatedItemsPrice = orderDetailItems.reduce((acc, it) => acc + (Number(it.quantity || 0) * Number(it.unit_price || 0)), 0);

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
                                                    <div style={{ fontWeight: '900', color: '#065F46', fontSize: '1.15rem', fontVariantNumeric: 'tabular-nums', marginTop: '1px' }}>
                                                        {formatMoney(orderTotal)}
                                                    </div>
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
                                        {orderDetailReturns.length > 0 && (
                                            <span style={{ backgroundColor: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA', padding: '2px 7px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: '800', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <AlertTriangle size={11} /> {orderDetailReturns.length} devoluciones reportadas
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
                                                        const badges = resolveProductCharacteristicsBadges(item);
                                                        const structuredSpec = formatStructuredSpecification(item);
                                                        const presentation = formatItemQuantityPresentation(item);
                                                        const isLast = idx === orderDetailItems.length - 1;

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
                                                                    {item.nickname && item.nickname !== prodName && (
                                                                        <div style={{ fontSize: '0.65rem', color: '#64748B', marginTop: '1px' }}>
                                                                            {item.nickname}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem' }}>
                                                                    {badges.length > 0 ? (
                                                                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                                                            {badges.map((b, bi) => (
                                                                                <span key={bi} style={{ backgroundColor: b.backgroundColor, color: b.color, border: `1px solid ${b.borderColor || 'transparent'}`, padding: '1px 5px', borderRadius: '4px', fontSize: '0.64rem', fontWeight: '700' }}>
                                                                                    {b.text}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ) : structuredSpec ? (
                                                                        <span style={{ fontSize: '0.69rem', color: '#334155', fontWeight: '600' }}>
                                                                            {structuredSpec}
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{ fontSize: '0.66rem', color: '#94A3B8' }}>Estándar</span>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem', textAlign: 'right' }}>
                                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>
                                                                        {presentation.primary}
                                                                    </div>
                                                                    {presentation.secondary && (
                                                                        <div style={{ fontSize: '0.64rem', color: '#0D7A57', fontWeight: '700', marginTop: '1px' }}>
                                                                            {presentation.secondary}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums', fontSize: '0.76rem' }}>
                                                                    {formatMoney(item.unit_price || 0)}
                                                                </td>
                                                                <td style={{ padding: '0.50rem 0.75rem', textAlign: 'right', fontWeight: '900', color: '#0F172A', fontVariantNumeric: 'tabular-nums', fontSize: '0.80rem' }}>
                                                                    {formatMoney(itemTotal)}
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
                                        {/* Total fijado de manera discreta y elegante en la esquina inferior */}
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

                                        <button 
                                            type="button"
                                            onClick={() => window.open(`/admin/orders/contingency-print?ids=${selectedOrderDetail.id}`, '_blank')}
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

                            </div>
                        </div>
                    );
                })()}

            </div>
        </main>
    );
}
