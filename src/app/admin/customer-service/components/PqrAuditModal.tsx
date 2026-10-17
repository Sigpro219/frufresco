'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { formatMoney } from '@/lib/adminTheme';
import {
    X, Check, AlertTriangle, ShieldCheck, ShieldAlert, FileText, Camera,
    Truck, Store, Warehouse, Layers, User, Building2, HelpCircle,
    ChevronRight, ChevronLeft, Sparkles, Phone, MessageCircle, Link2,
    Unlink, Plus, Trash2, Loader2, Maximize2, DollarSign, Percent,
    PackageMinus, AlertCircle, Edit2, RotateCcw, ExternalLink, Copy,
    Clock, ArrowRight, PackageX, ShoppingBag, Package, Save, HeartHandshake,
    Info
} from 'lucide-react';
import SearchableSelect from '@/components/common/SearchableSelect';
import {
    RCA_CATEGORIES_L1,
    RESPONSIBLE_PARTIES,
    parseRcaFromRecord,
    buildRcaMetadataTag,
    DISPOSICION_SANITARIA_TEMPLATES,
    DefectCategoryL1,
    ImputedEntity,
    cleanHumanResolutionNotes
} from '@/lib/rcaTaxonomy';
import { 
    cleanColombianPhone, 
    PqrAuthorInfo, 
    getPqrAuthorInfo,
    buildPqrWhatsAppMessage,
    buildShortageWhatsAppMessage,
    getShortageTimeoutInfo,
    ShortageTimeoutInfo,
    WHATSAPP_PQR_TEMPLATES,
    WhatsAppPqrTemplateType
} from '../utils';

interface PqrAuditModalProps {
    pqr: any | null;
    isOpen: boolean;
    onClose: () => void;
    onResolved: () => void;
    providersList: { id: string; name: string; nit?: string; phone?: string }[];
    collaboratorsList: { id: string; contact_name: string; role: string; phone?: string; is_active?: boolean }[];
    customTaxonomy: DefectCategoryL1[];
    onOpenTaxonomyModal: () => void;
    onOpenFinancialModal: (mode: 'credit_note' | 'invoice_adjustment') => void;
    novelties: any[];
    showToast: (text: string, type?: 'success' | 'error' | 'warning') => void;
    onZoomPhoto: (url: string) => void;
}

export default function PqrAuditModal({
    pqr,
    isOpen,
    onClose,
    onResolved,
    providersList,
    collaboratorsList,
    customTaxonomy,
    onOpenTaxonomyModal,
    onOpenFinancialModal,
    novelties,
    showToast,
    onZoomPhoto
}: PqrAuditModalProps) {
    const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
    const [actionLoading, setActionLoading] = useState(false);
    const [resolutionNotes, setResolutionNotes] = useState('');
    const [resolutionOption, setResolutionOption] = useState<'opt1' | 'opt2' | 'opt3' | 'opt4'>('opt1');

    // Shortage Proactive Timer & State
    const [shortageCountdown, setShortageCountdown] = useState<ShortageTimeoutInfo>({
        isShortage: false,
        minutesRemaining: 0,
        isExpired: false,
        formattedCountdown: '--:--',
        deadlineText: ''
    });
    const [availableCatalogProducts, setAvailableCatalogProducts] = useState<{ id: string; name: string; sku?: string; unit_of_measure?: string }[]>([]);
    const [substituteModalOpen, setSubstituteModalOpen] = useState(false);
    const [selectedSubstituteProductId, setSelectedSubstituteProductId] = useState('');
    const [substituteTargetItemId, setSubstituteTargetItemId] = useState('');

    // RCA Form State
    const [rcaCategoryL1, setRcaCategoryL1] = useState('dano_mecanico');
    const [rcaSubtypeL2, setRcaSubtypeL2] = useState('aplastamiento_sobreestiba');
    const [rcaResponsible, setRcaResponsible] = useState<'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente'>('transporte');
    const [rcaEvidenceNotes, setRcaEvidenceNotes] = useState('');

    // Imputation Matrix State
    const [imputedTargetType, setImputedTargetType] = useState<'provider' | 'employee' | 'driver' | 'sales_rep' | 'client' | 'none'>('driver');
    const [imputedEntities, setImputedEntities] = useState<ImputedEntity[]>([]);
    const [selectedImputedToAdd, setSelectedImputedToAdd] = useState('');
    const [assignedRouteDriver, setAssignedRouteDriver] = useState<{ id?: string; name: string; plate?: string } | null>(null);

    // Photos State
    const [activePhotoIdx, setActivePhotoIdx] = useState(0);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Order Items & Novelties State
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState('');
    const [noveltyQty, setNoveltyQty] = useState(0);
    const [noveltyType, setNoveltyType] = useState<'faltante' | 'averia'>('faltante');
    const [noveltyReason, setNoveltyReason] = useState('');
    const [hasPhysicalReturn, setHasPhysicalReturn] = useState<boolean>(false);

    // Order Linking State
    const [clientRecentOrders, setClientRecentOrders] = useState<any[]>([]);
    const [linkingOrderId, setLinkingOrderId] = useState<string>('');
    const [isLinkingOrder, setIsLinkingOrder] = useState<boolean>(false);
    const [loadingRecentOrders, setLoadingRecentOrders] = useState<boolean>(false);

    // Phone Editor State
    const [editingPhone, setEditingPhone] = useState(false);
    const [newPhoneInput, setNewPhoneInput] = useState('');
    const [savingPhone, setSavingPhone] = useState(false);

    // WhatsApp Template State
    const [selectedWaTemplate, setSelectedWaTemplate] = useState<WhatsAppPqrTemplateType>('initial');

    // Sanitary Disposal Template State
    const [sanitaryKey, setSanitaryKey] = useState<string>('destruccion_en_sitio');

    // Draft Persistence State
    const [isDraftRestored, setIsDraftRestored] = useState(false);
    const [lastSavedDraftTime, setLastSavedDraftTime] = useState<string | null>(null);
    const isRestoringDraftRef = useRef(false);

    const caseReturns = useMemo(() => {
        if (!pqr?.order_id) return [];
        return novelties.filter(n => n.order_id === pqr.order_id);
    }, [pqr?.order_id, novelties]);

    // Valor nominal total de las novedades físicas declaradas (independiente de la resolución)
    const nominalNoveltiesCoQ = useMemo(() => {
        if (!pqr) return 0;
        if (pqr.order_id && caseReturns.length > 0) {
            return caseReturns.reduce((sum, item) => {
                const oi = orderItems.find(o => o.product_id === item.product_id) || 
                           item.orders?.order_items?.find((o: any) => o.product_id === item.product_id);
                const price = Number(oi?.unit_price || item.unit_price || 0);
                return sum + (price * (Number(item.quantity_returned) || 0));
            }, 0);
        }
        const isTotalRejection = (pqr.subject?.toLowerCase().includes('rechazo total') || pqr.description?.toLowerCase().includes('rechazo total'));
        return isTotalRejection && pqr.orders?.total ? Number(pqr.orders.total) : 0;
    }, [pqr, caseReturns, orderItems]);

    // Calculate CoQ liquidable para imputación / deducción financiera de este caso
    const caseCoQ = useMemo(() => {
        if (!pqr) return 0;

        // Escenario 213: Cierre conforme / rechazado sin costo, o seleccionado Opción 1 de cierre conforme sin impacto económico
        if (
            resolutionOption === 'opt1' ||
            pqr.status === 'rejected' ||
            (pqr.resolution_notes && (
                pqr.resolution_notes.includes('Cerrado conforme sin impacto económico') ||
                pqr.resolution_notes.includes('Rechazo de solicitud') ||
                pqr.resolution_notes.includes('CASO RECHAZADO / ARCHIVADO SIN COSTO')
            ))
        ) {
            return 0;
        }

        return nominalNoveltiesCoQ;
    }, [pqr, resolutionOption, nominalNoveltiesCoQ]);

    // Clear saved case draft helper
    const clearCaseDraft = (pqrId: string) => {
        if (!pqrId) return;
        try {
            localStorage.removeItem(`pqr_audit_draft_${pqrId}`);
        } catch (e) {
            console.error('Error clearing draft:', e);
        }
        setIsDraftRestored(false);
        setLastSavedDraftTime(null);
    };

    // Discard draft and revert to DB values
    const handleDiscardDraft = () => {
        if (!pqr?.id) return;
        clearCaseDraft(pqr.id);

        setCurrentStep(1);
        setResolutionNotes(pqr.resolution_notes || '');
        setSelectedItemId('');
        setNoveltyQty(0);
        setNoveltyReason('');
        setHasPhysicalReturn(false);
        setLinkingOrderId('');

        const rca = parseRcaFromRecord(pqr);
        setRcaCategoryL1(rca.categoryL1 || 'dano_mecanico');
        setRcaSubtypeL2(rca.subtypeL2 || '');
        const currentResp = (rca.responsible !== 'no_definido' ? rca.responsible : 'transporte') as any;
        setRcaResponsible(currentResp);
        setRcaEvidenceNotes(rca.notes || '');
        setImputedTargetType(rca.imputedTargetType || (currentResp === 'proveedor' ? 'provider' : currentResp === 'transporte' ? 'driver' : 'employee'));
        if (rca.imputedEntities && rca.imputedEntities.length > 0) {
            setImputedEntities(rca.imputedEntities);
        } else {
            setImputedEntities([]);
        }
        showToast('Borrador descartado. Se restauraron los datos originales del caso.', 'warning');
    };

    // Initialize modal when PQR changes
    useEffect(() => {
        if (!pqr) return;

        setCurrentStep(1);
        setResolutionNotes(cleanHumanResolutionNotes(pqr.resolution_notes || ''));
        setActivePhotoIdx(0);
        setSelectedItemId('');
        setNoveltyQty(0);
        setNoveltyReason('');
        setAssignedRouteDriver(null);
        setEditingPhone(false);
        setNewPhoneInput('');

        const rca = parseRcaFromRecord(pqr);
        setRcaCategoryL1(rca.categoryL1 || 'dano_mecanico');
        setRcaSubtypeL2(rca.subtypeL2 || '');
        const currentResp = (rca.responsible !== 'no_definido' ? rca.responsible : 'transporte') as any;
        setRcaResponsible(currentResp);
        setRcaEvidenceNotes(rca.notes || '');
        setImputedTargetType(rca.imputedTargetType || (currentResp === 'proveedor' ? 'provider' : currentResp === 'transporte' ? 'driver' : 'employee'));

        if (rca.imputedEntities && rca.imputedEntities.length > 0) {
            setImputedEntities(rca.imputedEntities);
        } else {
            setImputedEntities([]);
        }

        const rawNotes = pqr.resolution_notes || '';
        const anyPhysicalReturnInNovelties = novelties
            .filter(n => n.order_id && n.order_id === pqr.order_id)
            .some(n => n.has_physical_return || (n.notes || '').includes('RETORNO_FISICO: SI'));
        setHasPhysicalReturn(anyPhysicalReturnInNovelties);

        // Pre-hydrate sanitary protocol template if saved in notes
        if (rawNotes.includes('PRODUCTO CONFORME ACEPTADO') || rawNotes.includes('producto_conforme_sin_baja') || rawNotes.includes('Cerrado conforme sin impacto económico')) {
            setSanitaryKey('producto_conforme_sin_baja');
        } else if (rawNotes.includes('DISPOSICIÓN EN SITIO') || rawNotes.includes('disposicion_cliente_sin_retorno')) {
            setSanitaryKey('disposicion_cliente_sin_retorno');
        } else if (rawNotes.includes('BAJA TOTAL') || rawNotes.includes('destruccion_biologica')) {
            setSanitaryKey('destruccion_biologica');
            setHasPhysicalReturn(true);
        } else if (rawNotes.includes('TRANSFORMACIÓN') || rawNotes.includes('transformacion_industrial')) {
            setSanitaryKey('transformacion_industrial');
            setHasPhysicalReturn(true);
        } else if (rawNotes.includes('BANCO DE ALIMENTOS') || rawNotes.includes('donacion_banco_alimentos')) {
            setSanitaryKey('donacion_banco_alimentos');
            setHasPhysicalReturn(true);
        } else if (rawNotes.includes('COMPOSTAJE') || rawNotes.includes('compostaje_agricola')) {
            setSanitaryKey('compostaje_agricola');
            setHasPhysicalReturn(true);
        } else {
            setSanitaryKey(anyPhysicalReturnInNovelties ? 'destruccion_biologica' : 'disposicion_cliente_sin_retorno');
        }

        const isReplacement = rca.isReplacementRejection || 
            (pqr.subject || '').includes('[ALERTA PING-PONG]') || 
            (pqr.description || '').includes('ALERTA CORTE DE BUCLE');

        if (rawNotes.includes('Opción 2') || rawNotes.includes('Reponer D+1')) {
            setResolutionOption('opt2');
        } else if (rawNotes.includes('Opción 3') || rawNotes.includes('Nota Crédito')) {
            setResolutionOption('opt3');
        } else if (rawNotes.includes('Opción 4') || rawNotes.includes('Ajuste de Factura')) {
            setResolutionOption('opt4');
        } else if (rawNotes.includes('Opción 1') || rawNotes.includes('Cerrar Conforme') || rawNotes.includes('Cerrado conforme')) {
            setResolutionOption('opt1');
        } else {
            // Sin sesgo dogmático de rechazo: los reclamos de avería/calidad inician abiertos en Reposición D+1 (opt2)
            setResolutionOption(isReplacement ? 'opt3' : 'opt2');
        }

        // Check for progressive draft saved in localStorage
        const draftKey = `pqr_audit_draft_${pqr.id}`;
        let restoredFromDraft = false;
        try {
            const rawDraft = localStorage.getItem(draftKey);
            if (rawDraft) {
                const draft = JSON.parse(rawDraft);
                if (draft && typeof draft === 'object') {
                    isRestoringDraftRef.current = true;
                    if (draft.currentStep) setCurrentStep(draft.currentStep);
                    if (draft.resolutionNotes !== undefined) setResolutionNotes(draft.resolutionNotes);
                    if (draft.resolutionOption) setResolutionOption(draft.resolutionOption);
                    if (draft.rcaCategoryL1) setRcaCategoryL1(draft.rcaCategoryL1);
                    if (draft.rcaSubtypeL2 !== undefined) setRcaSubtypeL2(draft.rcaSubtypeL2);
                    if (draft.rcaResponsible) setRcaResponsible(draft.rcaResponsible);
                    if (draft.rcaEvidenceNotes !== undefined) setRcaEvidenceNotes(draft.rcaEvidenceNotes);
                    if (draft.imputedTargetType) setImputedTargetType(draft.imputedTargetType);
                    if (Array.isArray(draft.imputedEntities)) setImputedEntities(draft.imputedEntities);
                    if (draft.sanitaryKey) setSanitaryKey(draft.sanitaryKey);
                    if (draft.selectedItemId) setSelectedItemId(draft.selectedItemId);
                    if (draft.noveltyQty !== undefined) setNoveltyQty(draft.noveltyQty);
                    if (draft.noveltyType) setNoveltyType(draft.noveltyType);
                    if (draft.noveltyReason !== undefined) setNoveltyReason(draft.noveltyReason);
                    if (draft.hasPhysicalReturn !== undefined) setHasPhysicalReturn(draft.hasPhysicalReturn);
                    if (draft.linkingOrderId) setLinkingOrderId(draft.linkingOrderId);
                    if (draft.selectedSubstituteProductId) setSelectedSubstituteProductId(draft.selectedSubstituteProductId);
                    if (draft.substituteTargetItemId) setSubstituteTargetItemId(draft.substituteTargetItemId);

                    restoredFromDraft = true;
                    setIsDraftRestored(true);
                    if (draft.updatedAt) {
                        setLastSavedDraftTime(new Date(draft.updatedAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
                    }
                    setTimeout(() => {
                        isRestoringDraftRef.current = false;
                    }, 400);
                }
            }
        } catch (e) {
            console.error('Error restoring draft:', e);
            isRestoringDraftRef.current = false;
        }

        if (!restoredFromDraft) {
            setIsDraftRestored(false);
            setLastSavedDraftTime(null);
        }

        if (pqr.order_id) {
            setLoadingItems(true);
            (async () => {
                try {
                    const { data: items } = await supabase
                        .from('order_items')
                        .select(`*, products(name, sku, unit_of_measure)`)
                        .eq('order_id', pqr.order_id);
                    setOrderItems(items || []);

                    const { data: stopData } = await supabase
                        .from('route_stops')
                        .select('route_id, routes(id, vehicle_plate, driver_id, driver_name)')
                        .eq('order_id', pqr.order_id)
                        .maybeSingle();

                    if (stopData?.routes) {
                        const r = stopData.routes as any;
                        const foundDriver = {
                            id: r.driver_id,
                            name: r.driver_name || 'Conductor Asignado en Ruta',
                            plate: r.vehicle_plate
                        };
                        setAssignedRouteDriver(foundDriver);

                        if (!restoredFromDraft && (!rca.imputedEntities || rca.imputedEntities.length === 0) && currentResp === 'transporte') {
                            setImputedEntities([{
                                id: foundDriver.id || 'driver-route',
                                name: `${foundDriver.name} (${foundDriver.plate || 'Furgón'})`,
                                role: 'transporte',
                                entityType: 'driver',
                                sharePercent: 100,
                                deductionAmount: caseCoQ
                            }]);
                        }
                    }
                } catch (e) {
                    console.error('Error fetching order items or driver:', e);
                } finally {
                    setLoadingItems(false);
                }
            })();
        } else {
            setOrderItems([]);
        }

        if (!restoredFromDraft) setLinkingOrderId('');
        if (pqr.client_id) {
            setLoadingRecentOrders(true);
            (async () => {
                try {
                    const { data: recentOrders } = await supabase
                        .from('orders')
                        .select('id, sequence_id, total, status, created_at, shipping_address, origin_source, admin_notes')
                        .eq('profile_id', pqr.client_id)
                        .order('created_at', { ascending: false })
                        .limit(10);
                    setClientRecentOrders(recentOrders || []);
                } catch (err) {
                    console.error('Error fetching client recent orders:', err);
                } finally {
                    setLoadingRecentOrders(false);
                }
            })();
        } else {
            setClientRecentOrders([]);
        }
    }, [pqr]);

    // Progressive Auto-Save Draft to LocalStorage (Debounced 400ms)
    useEffect(() => {
        if (!pqr?.id || !isOpen || isRestoringDraftRef.current) return;

        const timer = setTimeout(() => {
            try {
                const draftData = {
                    currentStep,
                    resolutionNotes,
                    resolutionOption,
                    rcaCategoryL1,
                    rcaSubtypeL2,
                    rcaResponsible,
                    rcaEvidenceNotes,
                    imputedTargetType,
                    imputedEntities,
                    sanitaryKey,
                    selectedItemId,
                    noveltyQty,
                    noveltyType,
                    noveltyReason,
                    hasPhysicalReturn,
                    linkingOrderId,
                    selectedSubstituteProductId,
                    substituteTargetItemId,
                    updatedAt: new Date().toISOString()
                };
                localStorage.setItem(`pqr_audit_draft_${pqr.id}`, JSON.stringify(draftData));
                setLastSavedDraftTime(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }));
            } catch (err) {
                console.error('Error auto-saving PQR draft:', err);
            }
        }, 400);

        return () => clearTimeout(timer);
    }, [
        pqr?.id,
        isOpen,
        currentStep,
        resolutionNotes,
        resolutionOption,
        rcaCategoryL1,
        rcaSubtypeL2,
        rcaResponsible,
        rcaEvidenceNotes,
        imputedTargetType,
        imputedEntities,
        sanitaryKey,
        selectedItemId,
        noveltyQty,
        noveltyType,
        noveltyReason,
        hasPhysicalReturn,
        linkingOrderId,
        selectedSubstituteProductId,
        substituteTargetItemId
    ]);

    // Shortage live countdown timer and template auto-selection
    useEffect(() => {
        if (!pqr) return;
        const updateTimer = () => {
            const info = getShortageTimeoutInfo(pqr);
            setShortageCountdown(info);
            if (info.isShortage && selectedWaTemplate === 'initial') {
                setSelectedWaTemplate('shortage_substitution');
            }
        };
        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [pqr, selectedWaTemplate]);

    // Load available catalog products for quick substitution
    useEffect(() => {
        if (!isOpen) return;
        (async () => {
            try {
                const { data } = await supabase
                    .from('products')
                    .select('id, name, sku, unit_of_measure')
                    .eq('is_active', true)
                    .order('name');
                setAvailableCatalogProducts(data || []);
            } catch (e) {
                console.error('Error loading products for substitution:', e);
            }
        })();
    }, [isOpen]);

    // Shortage Handlers
    const handleExecuteShortageSubstitute = async () => {
        if (!pqr?.order_id) {
            showToast('Esta PQR no tiene un pedido asociado para sustituir.', 'warning');
            return;
        }
        if (!selectedSubstituteProductId) {
            showToast('Selecciona el producto sustituto del catálogo.', 'warning');
            return;
        }

        const substituteProduct = availableCatalogProducts.find(p => p.id === selectedSubstituteProductId);
        if (!substituteProduct) {
            showToast('Producto sustituto no encontrado.', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const targetItem = substituteTargetItemId 
                ? orderItems.find(i => i.id === substituteTargetItemId)
                : (orderItems[0] || null);

            if (targetItem) {
                await supabase
                    .from('order_items')
                    .update({
                        product_id: substituteProduct.id,
                        nickname: `${substituteProduct.name} [Sustitución HORECA de ${targetItem.products?.name || 'original'}]`,
                        variant_label: `Sustituido en Muelle / Bodega`
                    })
                    .eq('id', targetItem.id);
            }

            const rcaTag = buildRcaMetadataTag({
                categoryL1: 'comercial_cliente',
                subtypeL2: 'producto_agotado_plaza',
                responsible: 'proveedor',
                notes: `Sustitución autorizada: ${substituteProduct.name}`,
                imputedTargetType: 'provider'
            });

            const finalNotes = `[SUSTITUCIÓN HORECA EN BODEGA ACEPTADA POR CLIENTE]\n- Producto Original: ${targetItem?.products?.name || pqr.subject || 'N/A'}\n- Producto Sustituto: ${substituteProduct.name}\n- Alistamiento: Autorizado y empacado de inmediato en muelle para salida en ruta.\n\n${rcaTag}`;

            await supabase
                .from('customer_service_pqrs')
                .update({
                    status: 'resolved',
                    resolution_notes: finalNotes,
                    defect_category_l1: 'comercial_cliente',
                    defect_subtype_l2: 'producto_agotado_plaza',
                    imputed_responsible: 'proveedor',
                    resolved_at: new Date().toISOString()
                })
                .eq('id', pqr.id);

            clearCaseDraft(pqr.id);
            showToast(`Sustitución por "${substituteProduct.name}" aplicada con éxito.`, 'success');
            setSubstituteModalOpen(false);
            onResolved();
            onClose();
        } catch (e: any) {
            showToast('Error al aplicar sustitución: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleExecuteShortageCleanWithdrawal = async (isAutoRelease = false) => {
        setActionLoading(true);
        try {
            const targetItem = substituteTargetItemId 
                ? orderItems.find(i => i.id === substituteTargetItemId)
                : (orderItems[0] || null);

            const qty = targetItem ? Number(targetItem.quantity) || 1 : 1;
            const prodId = targetItem?.product_id;

            if (prodId) {
                await supabase.from('inventory_movements').insert([{
                    product_id: prodId,
                    quantity: qty,
                    type: 'exit',
                    reference_type: 'order_shortage',
                    notes: `[COLUMNA K - ESCASEZ EN PLAZA]: ${isAutoRelease ? 'Auto-liberación por timeout' : 'Retiro limpio acordado con cliente'} | PQR #${pqr.id.substring(0, 8)} | Pedido #${pqr.orders?.sequence_id || 'N/A'}`
                }]);
            }

            if (targetItem) {
                await supabase.from('order_items').delete().eq('id', targetItem.id);
            }

            if (pqr.order_id) {
                const { data: remItems } = await supabase.from('order_items').select('quantity, unit_price').eq('order_id', pqr.order_id);
                const newSubtotal = (remItems || []).reduce((acc: number, it: any) => acc + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);
                await supabase.from('orders').update({
                    subtotal: newSubtotal,
                    total: newSubtotal
                }).eq('id', pqr.order_id);
            }

            const rcaTag = buildRcaMetadataTag({
                categoryL1: 'comercial_cliente',
                subtypeL2: 'producto_agotado_plaza',
                responsible: 'proveedor',
                notes: isAutoRelease ? 'Auto-liberación Poka-Yoke por Timeout' : 'Retiro limpio sin costo',
                imputedTargetType: 'provider'
            });

            const finalNotes = isAutoRelease 
                ? `[AUTO-LIBERACIÓN POKA-YOKE POR TIMEOUT DE SALIDA DE RUTA]\n- Acción: Producto escaso retirado sin cobro de la remisión.\n- Inventario: Asentado en Columna K (Escasez).\n- Logística: Pedido liberado en muelle para proteger franja de entrega.\n\n${rcaTag}`
                : `[RETIRO LIMPIO POR DESABASTECIMIENTO EN PLAZA]\n- Acción: Excluido de la remisión sin cobro.\n- Inventario: Asentado en Columna K.\n\n${rcaTag}`;

            await supabase
                .from('customer_service_pqrs')
                .update({
                    status: 'resolved',
                    resolution_notes: finalNotes,
                    defect_category_l1: 'comercial_cliente',
                    defect_subtype_l2: 'producto_agotado_plaza',
                    imputed_responsible: 'proveedor',
                    resolved_at: new Date().toISOString()
                })
                .eq('id', pqr.id);

            clearCaseDraft(pqr.id);
            showToast(isAutoRelease ? 'Auto-liberación Poka-Yoke ejecutada. Pedido liberado para ruta.' : 'Retiro limpio aplicado (Columna K). Factura depurada.', 'success');
            onResolved();
            onClose();
        } catch (e: any) {
            showToast('Error al procesar retiro limpio: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleExecuteShortageAppendNextOrder = async () => {
        if (!pqr.client_id) {
            showToast('PQR sin cliente identificado.', 'warning');
            return;
        }

        setActionLoading(true);
        try {
            const targetItem = substituteTargetItemId 
                ? orderItems.find(i => i.id === substituteTargetItemId)
                : (orderItems[0] || null);

            const bogotaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
            const [bY, bM, bD] = bogotaToday.split('-').map(Number);
            const tomorrow = new Date(Date.UTC(bY, bM - 1, bD + 1)).toISOString().split('T')[0];
            const { data: futureOrders } = await supabase
                .from('orders')
                .select('*')
                .eq('profile_id', pqr.client_id)
                .gte('delivery_date', tomorrow)
                .in('status', ['draft', 'pending', 'approved'])
                .order('delivery_date', { ascending: true })
                .limit(1);

            let destOrderId = '';
            let destOrderSeq = '';

            if (futureOrders && futureOrders.length > 0) {
                destOrderId = futureOrders[0].id;
                destOrderSeq = `#${futureOrders[0].sequence_id} (${futureOrders[0].delivery_date})`;
            } else {
                const { data: newOrder, error: createErr } = await supabase
                    .from('orders')
                    .insert([{
                        profile_id: pqr.client_id,
                        type: pqr.profiles?.role === 'b2c_client' ? 'B2C' : 'B2B',
                        status: 'approved',
                        delivery_date: tomorrow,
                        delivery_slot: 'AM',
                        origin_source: 'customer_service_shortage_d1',
                        total_weight_kg: Number(targetItem?.quantity) || 0,
                        admin_notes: `[ANEXIÓN D+1 POR QUIEBRE EN PLAZA] Generado por PQR #${pqr.id.substring(0, 8)}. Consolida producto escaso sin desvío de ruta.`
                    }])
                    .select()
                    .single();

                if (createErr || !newOrder) throw new Error('Error al crear orden para D+1: ' + createErr?.message);
                destOrderId = newOrder.id;
                destOrderSeq = `#${newOrder.sequence_id} (D+1 ${tomorrow})`;
            }

            if (targetItem) {
                await supabase.from('order_items').insert([{
                    order_id: destOrderId,
                    product_id: targetItem.product_id,
                    quantity: targetItem.quantity,
                    unit_price: targetItem.unit_price || 0,
                    nickname: targetItem.nickname || targetItem.products?.name,
                    variant_label: `Anexado desde PQR #${pqr.id.substring(0, 8)} (D+1)`
                }]);

                await supabase.from('order_items').delete().eq('id', targetItem.id);
            }

            if (targetItem?.product_id) {
                await supabase.from('inventory_movements').insert([{
                    product_id: targetItem.product_id,
                    quantity: Number(targetItem.quantity) || 1,
                    type: 'exit',
                    reference_type: 'order_shortage',
                    notes: `[COLUMNA K - REPROGRAMADO D+1]: Anexado al siguiente pedido programado ${destOrderSeq} | PQR #${pqr.id.substring(0, 8)}`
                }]);
            }

            if (pqr.order_id) {
                const { data: remItems } = await supabase.from('order_items').select('quantity, unit_price').eq('order_id', pqr.order_id);
                const newSubtotal = (remItems || []).reduce((acc: number, it: any) => acc + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);
                await supabase.from('orders').update({
                    subtotal: newSubtotal,
                    total: newSubtotal
                }).eq('id', pqr.order_id);
            }

            const rcaTag = buildRcaMetadataTag({
                categoryL1: 'comercial_cliente',
                subtypeL2: 'producto_agotado_plaza',
                responsible: 'proveedor',
                notes: `Anexado a próximo pedido ${destOrderSeq} (Cero desvío de ruta)`,
                imputedTargetType: 'provider'
            });

            const finalNotes = `[ANEXADO AL SIGUIENTE PEDIDO HABITUAL D+1]\n- Destino: Pedido ${destOrderSeq}\n- Regla: CERO desvíos vehiculares ni fletes aislados de micro-cantidades.\n- Remisión de Hoy: Depurada sin cobro.\n\n${rcaTag}`;

            await supabase
                .from('customer_service_pqrs')
                .update({
                    status: 'resolved',
                    resolution_notes: finalNotes,
                    defect_category_l1: 'comercial_cliente',
                    defect_subtype_l2: 'producto_agotado_plaza',
                    imputed_responsible: 'proveedor',
                    resolved_at: new Date().toISOString()
                })
                .eq('id', pqr.id);

            clearCaseDraft(pqr.id);
            showToast(`Producto anexado exitosamente al pedido ${destOrderSeq}. Sin desvíos de ruta.`, 'success');
            onResolved();
            onClose();
        } catch (e: any) {
            showToast('Error al anexar a próximo pedido: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    if (!isOpen || !pqr) return null;

    const authorInfo: PqrAuthorInfo = getPqrAuthorInfo(pqr);
    const photos: string[] = [
        ...(pqr.primary_photo_url ? [pqr.primary_photo_url] : []),
        ...(Array.isArray(pqr.additional_photos) ? pqr.additional_photos : [])
    ];

    const currentCatObj = customTaxonomy.find(c => c.code === rcaCategoryL1) || RCA_CATEGORIES_L1[0];
    const availableSubtypes = currentCatObj?.subtypes || [];

    const handleResponsibleAreaChange = (newResp: 'proveedor' | 'bodega' | 'picking' | 'transporte' | 'comercial' | 'cliente') => {
        setRcaResponsible(newResp);
        let newTargetType: 'provider' | 'employee' | 'driver' | 'sales_rep' | 'client' | 'none' = 'employee';
        if (newResp === 'proveedor') newTargetType = 'provider';
        else if (newResp === 'transporte') newTargetType = 'driver';
        else if (newResp === 'comercial') newTargetType = 'sales_rep';
        else if (newResp === 'cliente') newTargetType = 'client';

        setImputedTargetType(newTargetType);

        if (newResp === 'transporte' && assignedRouteDriver) {
            setImputedEntities([{
                id: assignedRouteDriver.id || 'driver-1',
                name: `${assignedRouteDriver.name} (${assignedRouteDriver.plate || 'Furgón'})`,
                role: 'transporte',
                entityType: 'driver',
                sharePercent: 100,
                deductionAmount: caseCoQ
            }]);
        } else if (newResp === 'cliente' && pqr?.profiles) {
            setImputedEntities([{
                id: pqr.client_id,
                name: pqr.profiles.company_name || pqr.profiles.contact_name,
                documentId: pqr.profiles.nit,
                role: 'cliente',
                entityType: 'client',
                sharePercent: 100,
                deductionAmount: 0
            }]);
        } else if (newResp === 'proveedor' && providersList.length > 0) {
            const firstProv = providersList[0];
            setImputedEntities([{
                id: firstProv.id,
                name: firstProv.name,
                documentId: firstProv.nit,
                role: 'proveedor',
                entityType: 'provider',
                sharePercent: 100,
                deductionAmount: caseCoQ
            }]);
        } else {
            const matchingStaff = collaboratorsList.filter(c => {
                if (newResp === 'picking') return (c.role || '').toLowerCase().includes('pick') || (c.role || '').toLowerCase().includes('bodega');
                if (newResp === 'bodega') return (c.role || '').toLowerCase().includes('bodega') || (c.role || '').toLowerCase().includes('operac');
                if (newResp === 'comercial') return (c.role || '').toLowerCase().includes('comer') || (c.role || '').toLowerCase().includes('ventas');
                return true;
            });

            if (matchingStaff.length > 0) {
                setImputedEntities([{
                    id: matchingStaff[0].id,
                    name: matchingStaff[0].contact_name,
                    role: matchingStaff[0].role || newResp,
                    entityType: newResp === 'comercial' ? 'sales_rep' : 'employee',
                    sharePercent: 100,
                    deductionAmount: caseCoQ
                }]);
            } else {
                setImputedEntities([]);
            }
        }
    };



    const calculateEqualSplit = (entities: ImputedEntity[], totalAmount: number): ImputedEntity[] => {
        if (!entities || entities.length === 0) return [];
        const count = entities.length;
        if (count === 1) {
            return [{
                ...entities[0],
                sharePercent: 100,
                deductionAmount: totalAmount
            }];
        }

        const baseAmount = Math.floor(totalAmount / count);
        const remainder = totalAmount - (baseAmount * count);

        return entities.map((item, idx) => {
            const amount = idx === 0 ? (baseAmount + remainder) : baseAmount;
            const pct = totalAmount > 0 
                ? Number(((amount / totalAmount) * 100).toFixed(2))
                : Number((100 / count).toFixed(2));
            return {
                ...item,
                sharePercent: pct,
                deductionAmount: amount
            };
        });
    };

    const handleAddImputedEntity = (entityId: string) => {
        if (!entityId) return;
        let newEntity: ImputedEntity | null = null;
        if (rcaResponsible === 'proveedor') {
            const prov = providersList.find(p => p.id === entityId);
            if (prov) {
                newEntity = {
                    id: prov.id,
                    name: prov.name,
                    documentId: prov.nit,
                    role: 'proveedor',
                    entityType: 'provider',
                    sharePercent: 100,
                    deductionAmount: 0
                };
            }
        } else if (rcaResponsible === 'cliente') {
            if (pqr?.profiles) {
                newEntity = {
                    id: pqr.client_id,
                    name: pqr.profiles.company_name || pqr.profiles.contact_name || 'Cliente',
                    documentId: pqr.profiles.nit,
                    role: 'cliente',
                    entityType: 'client',
                    sharePercent: 100,
                    deductionAmount: 0
                };
            }
        } else {
            const colab = collaboratorsList.find(c => c.id === entityId);
            if (colab) {
                newEntity = {
                    id: colab.id,
                    name: colab.contact_name,
                    role: colab.role || rcaResponsible,
                    entityType: rcaResponsible === 'transporte' ? 'driver' : rcaResponsible === 'comercial' ? 'sales_rep' : 'employee',
                    sharePercent: 100,
                    deductionAmount: 0
                };
            }
        }

        if (!newEntity) return;
        if (imputedEntities.some(e => e.id === newEntity!.id)) {
            showToast('Este colaborador o proveedor ya está asignado.', 'warning');
            return;
        }

        const updated = [...imputedEntities, newEntity];
        const finalized = calculateEqualSplit(updated, nominalNoveltiesCoQ);

        setImputedEntities(finalized);
        setSelectedImputedToAdd('');
    };

    const handleRemoveImputedEntity = (entityId: string) => {
        const remaining = imputedEntities.filter(e => e.id !== entityId);
        if (remaining.length === 0) {
            setImputedEntities([]);
            return;
        }
        const finalized = calculateEqualSplit(remaining, nominalNoveltiesCoQ);
        setImputedEntities(finalized);
    };

    const handleResetEqualSplit = () => {
        if (imputedEntities.length === 0) return;
        const finalized = calculateEqualSplit(imputedEntities, nominalNoveltiesCoQ);
        setImputedEntities(finalized);
        showToast('Reparto equitativo aplicado: cada responsable asume exactamente el mismo valor en COP.', 'success');
    };

    const handleUpdateEntityPercent = (entityId: string, newPercent: number) => {
        const baseAmountToSplit = nominalNoveltiesCoQ;
        if (imputedEntities.length <= 1) {
            const clamped = Math.max(0, Math.min(100, newPercent));
            const updated = imputedEntities.map(e => ({
                ...e,
                sharePercent: clamped,
                deductionAmount: Math.round((baseAmountToSplit * clamped) / 100)
            }));
            setImputedEntities(updated);
            return;
        }

        if (imputedEntities.length === 2) {
            const clamped = Math.max(0, Math.min(100, newPercent));
            const otherPercent = Number((100 - clamped).toFixed(2));
            const amountA = Math.round((baseAmountToSplit * clamped) / 100);
            const amountB = baseAmountToSplit - amountA; // Sum of COP always equals baseAmountToSplit
            const updated = imputedEntities.map(e => {
                const isTarget = e.id === entityId;
                return {
                    ...e,
                    sharePercent: isTarget ? clamped : otherPercent,
                    deductionAmount: isTarget ? amountA : amountB
                };
            });
            setImputedEntities(updated);
            return;
        }

        // 3+ entities: clamp to 100 - otherEntitiesSum
        const otherEntitiesSum = imputedEntities
            .filter(e => e.id !== entityId)
            .reduce((sum, e) => sum + (e.sharePercent || 0), 0);
        const maxAllowed = Math.max(0, Number((100 - otherEntitiesSum).toFixed(2)));
        const clamped = Math.max(0, Math.min(maxAllowed, newPercent));

        const updated = imputedEntities.map(e => {
            if (e.id === entityId) {
                return {
                    ...e,
                    sharePercent: clamped,
                    deductionAmount: Math.round((baseAmountToSplit * clamped) / 100)
                };
            }
            return e;
        });
        setImputedEntities(updated);
    };

    const handleSavePhone = async () => {
        const clean = newPhoneInput.replace(/\D/g, '');
        if (clean.length < 10) {
            showToast('Ingresa un número celular válido de 10 dígitos', 'warning');
            return;
        }
        setSavingPhone(true);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ contact_phone: clean, phone: clean })
                .eq('id', pqr.client_id);
            if (error) throw error;
            showToast('Teléfono guardado exitosamente.', 'success');
            setEditingPhone(false);
            onResolved();
        } catch (err: any) {
            showToast('Error al guardar teléfono: ' + err.message, 'error');
        } finally {
            setSavingPhone(false);
        }
    };

    const handleUploadEvidence = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !pqr) return;

        setUploadingPhoto(true);
        try {
            const fileExt = file.name.split('.').pop() || 'jpg';
            const fileName = `pqr-${pqr.id}-${Date.now()}.${fileExt}`;

            const { error: uploadErr } = await supabase.storage
                .from('product-images')
                .upload(fileName, file, { contentType: file.type, upsert: true });

            if (uploadErr) throw uploadErr;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

            const newPrimary = pqr.primary_photo_url ? pqr.primary_photo_url : publicUrl;
            const newAdditional = pqr.primary_photo_url 
                ? [...(pqr.additional_photos || []), publicUrl]
                : (pqr.additional_photos || []);

            const { error: updateErr } = await supabase
                .from('customer_service_pqrs')
                .update({
                    primary_photo_url: newPrimary,
                    additional_photos: newAdditional
                })
                .eq('id', pqr.id);

            if (updateErr) throw updateErr;

            showToast('Foto de evidencia adjuntada con éxito.', 'success');
            onResolved();
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (err: any) {
            showToast('Error al subir foto: ' + err.message, 'error');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleLinkOrder = async (orderIdToLink: string) => {
        if (!orderIdToLink) return;
        setIsLinkingOrder(true);
        try {
            const { data: orderData, error: ordErr } = await supabase
                .from('orders')
                .select('id, sequence_id, total, created_at, origin_source, admin_notes, shipping_address')
                .eq('id', orderIdToLink)
                .single();
            if (ordErr) throw ordErr;

            const { error: updateErr } = await supabase
                .from('customer_service_pqrs')
                .update({ order_id: orderIdToLink })
                .eq('id', pqr.id);
            if (updateErr) throw updateErr;

            showToast(`Pedido #${orderData.sequence_id} vinculado exitosamente.`, 'success');
            onResolved();
        } catch (e: any) {
            showToast('Error al vincular pedido: ' + e.message, 'error');
        } finally {
            setIsLinkingOrder(false);
        }
    };

    const handleUnlinkOrder = async () => {
        setIsLinkingOrder(true);
        try {
            const { error: updateErr } = await supabase
                .from('customer_service_pqrs')
                .update({ order_id: null })
                .eq('id', pqr.id);
            if (updateErr) throw updateErr;

            showToast('Pedido desvinculado del caso.', 'success');
            onResolved();
        } catch (e: any) {
            showToast('Error al desvincular pedido: ' + e.message, 'error');
        } finally {
            setIsLinkingOrder(false);
        }
    };

    const handleCreateNovelty = async () => {
        if (!pqr.order_id || !selectedItemId || noveltyQty <= 0) {
            showToast('Selecciona un producto e ingresa una cantidad válida.', 'warning');
            return;
        }

        const selItem = orderItems.find(i => i.id === selectedItemId);
        if (!selItem) return;

        setActionLoading(true);
        try {
            const compositeNotes = `[RETORNO_FISICO: ${hasPhysicalReturn ? 'SI' : 'NO'}] ${rcaEvidenceNotes || ''}`.trim();
            const reasonText = `${noveltyType === 'faltante' ? 'Faltante en Báscula' : 'Avería / Calidad'}: ${noveltyReason || pqr.subject || 'Declarado desde PQR'}`;

            // Check if there is already a return for this order and product in pending_review
            const existingReturn = caseReturns.find(r => r.product_id === selItem.product_id && r.status === 'pending_review');

            if (existingReturn) {
                const { error: updErr } = await supabase
                    .from('billing_returns')
                    .update({
                        quantity_returned: noveltyQty,
                        reason: reasonText,
                        notes: compositeNotes
                    })
                    .eq('id', existingReturn.id);
                if (updErr) throw updErr;
                showToast(`Novedad actualizada a ${noveltyQty} ${selItem.products?.unit_of_measure || 'Kg'}.`, 'success');
            } else {
                const payload: any = {
                    order_id: pqr.order_id,
                    product_id: selItem.product_id,
                    quantity_returned: noveltyQty,
                    reason: reasonText,
                    status: 'pending_review',
                    notes: compositeNotes
                };

                const insertRes = await supabase.from('billing_returns').insert([payload]);
                if (insertRes.error) throw insertRes.error;
                showToast('Novedad de producto registrada con éxito.', 'success');
            }

            setSelectedItemId('');
            setNoveltyQty(0);
            setNoveltyReason('');
            setHasPhysicalReturn(false);
            onResolved();
        } catch (e: any) {
            showToast('Error al registrar novedad: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteNovelty = async (returnId: string) => {
        if (!confirm('¿Deseas eliminar esta novedad registrada del pedido?')) return;
        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('billing_returns')
                .delete()
                .eq('id', returnId);
            if (error) throw error;
            showToast('Novedad eliminada.', 'success');
            onResolved();
        } catch (e: any) {
            showToast('Error al eliminar novedad: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    const handleTogglePhysicalReturnCustody = async (newPhysicalReturn: boolean, specificReturnId?: string) => {
        setHasPhysicalReturn(newPhysicalReturn);

        const warehouseKeys = ['destruccion_biologica', 'transformacion_industrial', 'donacion_banco_alimentos', 'compostaje_agricola'];
        let nextKey = sanitaryKey;
        if (!newPhysicalReturn) {
            nextKey = resolutionOption === 'opt1' ? 'producto_conforme_sin_baja' : 'disposicion_cliente_sin_retorno';
        } else if (!warehouseKeys.includes(sanitaryKey)) {
            nextKey = 'destruccion_biologica';
        }

        if (nextKey !== sanitaryKey) {
            setSanitaryKey(nextKey);
            const tmpl = DISPOSICION_SANITARIA_TEMPLATES.find(t => t.id === nextKey);
            if (tmpl) {
                setResolutionNotes(prev => {
                    const regex = /\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\n\[|$)/;
                    if (regex.test(prev)) return prev.replace(regex, tmpl.textTemplate).trim();
                    return prev ? `${prev}\n\n${tmpl.textTemplate}`.trim() : tmpl.textTemplate;
                });
            }
        }

        const targets = specificReturnId
            ? caseReturns.filter((r: any) => r.id === specificReturnId)
            : caseReturns.filter((r: any) => !(r.reason || '').toLowerCase().includes('faltante'));

        if (targets.length > 0) {
            try {
                for (const ret of targets) {
                    const baseNotes = (ret.notes || '').replace(/\[RETORNO_FISICO:\s*(SI|NO)\]\s*/g, '').trim();
                    const updatedNotes = `[RETORNO_FISICO: ${newPhysicalReturn ? 'SI' : 'NO'}] ${baseNotes}`.trim();
                    await supabase
                        .from('billing_returns')
                        .update({ notes: updatedNotes })
                        .eq('id', ret.id);
                }
                onResolved();
            } catch (e) {
                console.error('Error updating physical return custody:', e);
            }
        }
    };

    const handleResolvePqr = async (status: 'resolved' | 'rejected') => {
        if (!resolutionNotes.trim()) {
            showToast('Ingresa una nota de resolución antes de continuar.', 'warning');
            return;
        }

        const totalImputedPercent = Number(imputedEntities.reduce((sum, e) => sum + (e.sharePercent || 0), 0).toFixed(1));
        if (imputedEntities.length > 0 && totalImputedPercent > 100.1) {
            showToast('El total imputado supera el 100%. Ajusta los porcentajes antes de resolver.', 'error');
            return;
        }

        const rcaParsed = parseRcaFromRecord(pqr);
        const isReplacementRejection = rcaParsed.isReplacementRejection || 
            (pqr.subject || '').includes('[ALERTA PING-PONG]') || 
            (pqr.description || '').includes('ALERTA CORTE DE BUCLE');

        if (status === 'resolved' && resolutionOption === 'opt2' && isReplacementRejection) {
            showToast('BLOQUEADO POR REGLA ANTI PING-PONG: Usa Nota Crédito o Ajuste.', 'error');
            return;
        }

        setActionLoading(true);
        try {
            const baseCleanNotes = cleanHumanResolutionNotes(resolutionNotes);
            let conceptBlock = '';
            let redirectUrl = null;

            if (status === 'resolved') {
                if (resolutionOption === 'opt1') {
                    conceptBlock = `[CONCEPTO: Opción 1 - Cerrado conforme sin impacto económico ($0 COP)]`;
                    if (pqr.order_id) {
                        await supabase
                            .from('billing_returns')
                            .update({
                                status: 'rejected',
                                reason: `[CERRADO CONFORME - SIN COSTO] Reclamo aclarado con cliente / desestimado en PQR #${pqr.id.substring(0, 8)}. Se factura 100% original.`,
                                notes: `Desestimado sin costo comercial. PQR #${pqr.id.substring(0, 8)}`
                            })
                            .eq('order_id', pqr.order_id)
                            .eq('status', 'pending_review');
                    }
                } else if (resolutionOption === 'opt2') {
                    if (!pqr.order_id) {
                        showToast('Esta PQR no tiene un pedido asociado para reposición.', 'warning');
                        setActionLoading(false);
                        return;
                    }

                    const { data: originalOrder, error: orderErr } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('id', pqr.order_id)
                        .single();

                    if (orderErr || !originalOrder) throw new Error('No se pudo cargar el pedido original.');

                    const { data: pendingReturns } = await supabase
                        .from('billing_returns')
                        .select('*')
                        .eq('order_id', pqr.order_id)
                        .eq('status', 'pending_review');

                    const { data: originalItems, error: itemsErr } = await supabase
                        .from('order_items')
                        .select('*')
                        .eq('order_id', pqr.order_id);

                    if (itemsErr) throw new Error('No se pudieron cargar los artículos del pedido.');

                    let itemsToReprogram: any[] = [];
                    let isPartial = false;

                    if (pendingReturns && pendingReturns.length > 0) {
                        isPartial = true;
                        pendingReturns.forEach(ret => {
                            const matchedItem = originalItems?.find(item => item.product_id === ret.product_id);
                            if (matchedItem) {
                                itemsToReprogram.push({
                                    product_id: ret.product_id,
                                    quantity: ret.quantity_returned,
                                    unit_price: 0,
                                    nickname: matchedItem.nickname,
                                    selected_options: matchedItem.selected_options,
                                    variant_label: matchedItem.variant_label
                                });
                            }
                        });
                    }

                    if (itemsToReprogram.length === 0) {
                        const confirmTotal = window.confirm(
                            'ATENCIÓN: No hay productos específicos devueltos.\n\n¿Deseas reprogramar el 100% de TODOS los productos del pedido original como reposición de garantía ($0 COP)?'
                        );
                        if (!confirmTotal) {
                            setActionLoading(false);
                            return;
                        }
                        isPartial = false;
                        itemsToReprogram = (originalItems || []).map(item => ({
                            product_id: item.product_id,
                            quantity: item.quantity,
                            unit_price: 0,
                            nickname: item.nickname,
                            selected_options: item.selected_options,
                            variant_label: item.variant_label
                        }));
                    }

                    const bogotaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
                    const [bY, bM, bD] = bogotaToday.split('-').map(Number);
                    const tomorrow = new Date(Date.UTC(bY, bM - 1, bD + 1)).toISOString().split('T')[0];
                    const replacementWeightKg = Number(
                        itemsToReprogram.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0).toFixed(2)
                    );

                    const { data: newOrder, error: newOrderErr } = await supabase
                        .from('orders')
                        .insert([{
                            profile_id: originalOrder.profile_id,
                            type: originalOrder.type,
                            status: 'approved',
                            origin_source: 'customer_service',
                            delivery_date: tomorrow,
                            delivery_slot: originalOrder.delivery_slot || 'AM',
                            shipping_address: originalOrder.shipping_address,
                            latitude: originalOrder.latitude,
                            longitude: originalOrder.longitude,
                            total: 0,
                            subtotal: 0,
                            total_weight_kg: replacementWeightKg,
                            admin_notes: `[REPOSICIÓN DE GARANTÍA $0 COP - ${isPartial ? 'RECHAZO PARCIAL' : 'RECHAZO TOTAL'}] [PEDIDO HIJO DE #${originalOrder.sequence_id} | PARENT_ORDER_ID: ${originalOrder.id} | PQR_ID: ${pqr.id}] Generado por PQR #${pqr.id.substring(0, 8)} del Pedido #${originalOrder.sequence_id}.\n\nNotas: ${baseCleanNotes}`
                        }])
                        .select()
                        .single();

                    if (newOrderErr || !newOrder) throw new Error(`Error creando pedido de reposición: ${newOrderErr?.message}`);

                    const parentChildTag = `[HIJO_REPOSICION_D1: #${newOrder.sequence_id} | ID: ${newOrder.id} | ENTREGA: ${tomorrow}]`;
                    const updatedParentNotes = originalOrder.admin_notes
                        ? `${originalOrder.admin_notes}\n${parentChildTag}`
                        : parentChildTag;
                    await supabase
                        .from('orders')
                        .update({ admin_notes: updatedParentNotes })
                        .eq('id', originalOrder.id);

                    const itemsWithOrderId = itemsToReprogram.map(item => ({ ...item, order_id: newOrder.id }));
                    const { error: insertItemsErr } = await supabase.from('order_items').insert(itemsWithOrderId);
                    if (insertItemsErr) throw new Error(`Error insertando artículos de reposición: ${insertItemsErr.message}`);

                    if (isPartial && pendingReturns) {
                        for (const novelty of pendingReturns) {
                            await supabase
                                .from('billing_returns')
                                .update({ status: 'approved', reason: `${novelty.reason} - Reprogramado en Pedido #${newOrder.sequence_id}` })
                                .eq('id', novelty.id);
                        }
                    }

                    conceptBlock = `[CONCEPTO: Opción 2 - Reponer D+1 ($0 COP) (${isPartial ? 'Rechazo Parcial' : 'Rechazo Total'})]\n-> Pedido Hijo de Reposición generado con folio #${newOrder.sequence_id} (Ampara Pedido Padre #${originalOrder.sequence_id} • Entrega D+1: ${tomorrow})`;
                    redirectUrl = `/admin/orders/${newOrder.id}`;

                } else if (resolutionOption === 'opt3' || resolutionOption === 'opt4') {
                    const prelimConcept = resolutionOption === 'opt3'
                        ? '[CONCEPTO: Opción 3 - Emitir Nota Crédito Financiera]'
                        : '[CONCEPTO: Opción 4 - Ajuste de Factura (Sustracción)]';
                    const prelimRcaTag = buildRcaMetadataTag({
                        categoryL1: rcaCategoryL1,
                        subtypeL2: rcaSubtypeL2,
                        responsible: rcaResponsible,
                        notes: rcaEvidenceNotes || '',
                        isReplacementRejection: isReplacementRejection,
                        imputedTargetType: imputedTargetType,
                        imputedEntities: imputedEntities
                    });
                    const respLabel = RESPONSIBLE_PARTIES[rcaResponsible]?.label || rcaResponsible;
                    const prelimNotes = `${baseCleanNotes}\n\n${prelimConcept}\n\n${prelimRcaTag}\n[RESPONSABLE IMPUTADO: ${respLabel}]`;
                    await supabase
                        .from('customer_service_pqrs')
                        .update({ resolution_notes: prelimNotes })
                        .eq('id', pqr.id);

                    setActionLoading(false);
                    onOpenFinancialModal(resolutionOption === 'opt3' ? 'credit_note' : 'invoice_adjustment');
                    return;
                }
            } else {
                conceptBlock = `[CASO RECHAZADO / ARCHIVADO SIN COSTO]`;
                if (pqr.order_id) {
                    await supabase
                        .from('billing_returns')
                        .update({
                            status: 'rejected',
                            reason: `[RECLAMO RECHAZADO] Caso archivado sin costo en PQR #${pqr.id.substring(0, 8)}. Se factura 100% original.`,
                            notes: `Rechazado por Calidad. PQR #${pqr.id.substring(0, 8)}`
                        })
                        .eq('order_id', pqr.order_id)
                        .eq('status', 'pending_review');
                }
            }

            const isZeroDeductionCase = resolutionOption === 'opt1' || status === 'rejected' || caseCoQ === 0;
            const finalizedImputedEntities = isZeroDeductionCase
                ? imputedEntities.map(e => ({ ...e, deductionAmount: 0 }))
                : imputedEntities;

            const rcaTag = buildRcaMetadataTag({
                categoryL1: rcaCategoryL1,
                subtypeL2: rcaSubtypeL2,
                responsible: rcaResponsible,
                notes: rcaEvidenceNotes || '',
                isReplacementRejection: isReplacementRejection,
                imputedTargetType: imputedTargetType,
                imputedEntities: finalizedImputedEntities
            });
            const respLabel = RESPONSIBLE_PARTIES[rcaResponsible]?.label || rcaResponsible;
            const finalNotes = `${baseCleanNotes}${conceptBlock ? `\n\n${conceptBlock}` : ''}\n\n${rcaTag}\n[RESPONSABLE IMPUTADO: ${respLabel}]`;

            const { error } = await supabase
                .from('customer_service_pqrs')
                .update({
                    status: status,
                    resolution_notes: finalNotes,
                    resolved_at: new Date().toISOString()
                })
                .eq('id', pqr.id);

            if (error) throw error;

            clearCaseDraft(pqr.id);
            showToast(`Caso cerrado exitosamente como ${status === 'resolved' ? 'Resuelto' : 'Rechazado'}.`, 'success');
            onResolved();
            onClose();

            if (redirectUrl) {
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 800);
            }
        } catch (e: any) {
            showToast('Error al procesar resolución: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    // Save audit edits for an already resolved case without re-triggering operations
    const handleSaveAuditUpdate = async () => {
        setActionLoading(true);
        try {
            let cleanNotes = cleanHumanResolutionNotes(resolutionNotes);

            // Re-apply concept tag if not present
            if (resolutionOption === 'opt1' && !cleanNotes.includes('[CONCEPTO:')) {
                cleanNotes = `${cleanNotes}\n\n[CONCEPTO: Cerrado conforme sin impacto económico]`;
            } else if (resolutionOption === 'opt2' && !cleanNotes.includes('[CONCEPTO:')) {
                cleanNotes = `${cleanNotes}\n\n[CONCEPTO: Opción 2 - Reponer D+1 ($0 COP)]`;
            } else if (resolutionOption === 'opt3' && !cleanNotes.includes('[CONCEPTO:')) {
                cleanNotes = `${cleanNotes}\n\n[CONCEPTO: Opción 3 - Nota Crédito]`;
            } else if (resolutionOption === 'opt4' && !cleanNotes.includes('[CONCEPTO:')) {
                cleanNotes = `${cleanNotes}\n\n[CONCEPTO: Opción 4 - Ajuste de Factura]`;
            }

            const rcaParsed = parseRcaFromRecord(pqr);
            const isReplacementRejection = rcaParsed.isReplacementRejection || 
                (pqr.subject || '').includes('[ALERTA PING-PONG]') || 
                (pqr.description || '').includes('ALERTA CORTE DE BUCLE');

            const isZeroDeductionCase = resolutionOption === 'opt1' || pqr.status === 'rejected' || caseCoQ === 0;
            const finalizedImputedEntities = isZeroDeductionCase
                ? imputedEntities.map(e => ({ ...e, deductionAmount: 0 }))
                : imputedEntities;

            const rcaTag = buildRcaMetadataTag({
                categoryL1: rcaCategoryL1,
                subtypeL2: rcaSubtypeL2,
                responsible: rcaResponsible,
                notes: rcaEvidenceNotes || '',
                isReplacementRejection: isReplacementRejection,
                imputedTargetType: imputedTargetType,
                imputedEntities: finalizedImputedEntities
            });
            const respLabel = RESPONSIBLE_PARTIES[rcaResponsible]?.label || rcaResponsible;
            const finalNotes = `${cleanNotes}\n\n${rcaTag}\n[RESPONSABLE IMPUTADO: ${respLabel}]`;

            const { error } = await supabase
                .from('customer_service_pqrs')
                .update({
                    resolution_notes: finalNotes,
                    resolved_at: pqr.resolved_at || new Date().toISOString()
                })
                .eq('id', pqr.id);

            if (error) throw error;

            clearCaseDraft(pqr.id);
            showToast('Auditoría del caso actualizada y guardada exitosamente.', 'success');
            onResolved();
            onClose();
        } catch (e: any) {
            showToast('Error al actualizar auditoría: ' + e.message, 'error');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}>
            <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '1080px',
                maxHeight: '94vh',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden'
            }}>
                {/* 1. Modal Top Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: '#0F172A',
                    color: 'white',
                    borderBottom: '1px solid #1E293B'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            padding: '8px',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#34D399',
                            borderRadius: '8px',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <ShieldAlert size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontFamily: 'monospace',
                                    fontWeight: '800',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: '#064E3B',
                                    color: '#6EE7B7',
                                    border: '1px solid #047857',
                                    textTransform: 'uppercase'
                                }}>
                                    {pqr.type || 'RECLAMO'}
                                </span>
                                <h2 style={{ fontSize: '0.95rem', fontWeight: '800', color: 'white', margin: 0 }}>
                                    Auditoría Técnica PQR #{pqr.id.substring(0, 8)}
                                </h2>
                                {pqr.order_id && (
                                    <span style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#1E293B', color: '#94A3B8', border: '1px solid #334155' }}>
                                        Pedido #{pqr.orders?.sequence_id || 'N/A'}
                                    </span>
                                )}
                            </div>
                            <p style={{ fontSize: '0.72rem', color: '#94A3B8', margin: '2px 0 0 0' }}>
                                {authorInfo.clientDisplayName} {authorInfo.sedeOrBranch ? `• ${authorInfo.sedeOrBranch}` : ''}
                            </p>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {isDraftRestored ? (
                            <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '3px 9px',
                                borderRadius: '6px',
                                backgroundColor: '#78350F',
                                border: '1px solid #B45309',
                                color: '#FDE68A',
                                fontSize: '0.68rem',
                                fontWeight: '700'
                            }}>
                                <Save size={11} />
                                <span>Borrador activo {lastSavedDraftTime ? `(${lastSavedDraftTime})` : ''}</span>
                                <button
                                    type="button"
                                    onClick={handleDiscardDraft}
                                    style={{
                                        marginLeft: '4px',
                                        color: '#FCA5A5',
                                        background: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '0.65rem',
                                        textDecoration: 'underline',
                                        fontWeight: '800'
                                    }}
                                    title="Descartar borrador local y restaurar valores de la base de datos"
                                >
                                    Descartar
                                </button>
                            </div>
                        ) : lastSavedDraftTime ? (
                            <span style={{
                                fontSize: '0.65rem',
                                color: '#94A3B8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                backgroundColor: '#1E293B',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                border: '1px solid #334155'
                            }}>
                                <Check size={11} style={{ color: '#10B981' }} />
                                <span>Autoguardado {lastSavedDraftTime}</span>
                            </span>
                        ) : null}

                        <button
                            type="button"
                            onClick={onClose}
                            style={{
                                padding: '6px',
                                color: '#94A3B8',
                                backgroundColor: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                borderRadius: '6px'
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* 2. Stepper Tabs Header */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    backgroundColor: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    padding: '8px 16px',
                    gap: '8px'
                }}>
                    <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            fontSize: '0.78rem',
                            fontWeight: currentStep === 1 ? '800' : '600',
                            border: currentStep === 1 ? '1px solid #CBD5E1' : '1px solid transparent',
                            backgroundColor: currentStep === 1 ? 'white' : 'transparent',
                            color: currentStep === 1 ? '#0F172A' : '#64748B',
                            cursor: 'pointer',
                            boxShadow: currentStep === 1 ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        <span style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            backgroundColor: currentStep === 1 ? '#0D7A57' : '#E2E8F0',
                            color: currentStep === 1 ? 'white' : '#475569'
                        }}>1</span>
                        <span>Hecho & Evidencias</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            fontSize: '0.78rem',
                            fontWeight: currentStep === 2 ? '800' : '600',
                            border: currentStep === 2 ? '1px solid #CBD5E1' : '1px solid transparent',
                            backgroundColor: currentStep === 2 ? 'white' : 'transparent',
                            color: currentStep === 2 ? '#0F172A' : '#64748B',
                            cursor: 'pointer',
                            boxShadow: currentStep === 2 ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        <span style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            backgroundColor: currentStep === 2 ? '#0D7A57' : '#E2E8F0',
                            color: currentStep === 2 ? 'white' : '#475569'
                        }}>2</span>
                        <span>Decisión Comercial</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            fontSize: '0.78rem',
                            fontWeight: currentStep === 3 ? '800' : '600',
                            border: currentStep === 3 ? '1px solid #CBD5E1' : '1px solid transparent',
                            backgroundColor: currentStep === 3 ? 'white' : 'transparent',
                            color: currentStep === 3 ? '#0F172A' : '#64748B',
                            cursor: 'pointer',
                            boxShadow: currentStep === 3 ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
                        }}
                    >
                        <span style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.7rem',
                            fontWeight: '800',
                            backgroundColor: currentStep === 3 ? '#0D7A57' : '#E2E8F0',
                            color: currentStep === 3 ? 'white' : '#475569'
                        }}>3</span>
                        <span>Causa Raíz & Imputación</span>
                    </button>
                </div>

                {/* 3. Modal Scrollable Content Area */}
                <div style={{ flex: '1', overflowY: 'auto', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* ================= STEP 1: CONTEXT & EVIDENCE ================= */}
                    {currentStep === 1 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Shortage in Plaza Special Protocol Banner & Triad Actions */}
                            {(shortageCountdown.isShortage || rcaSubtypeL2 === 'producto_agotado_plaza') && (
                                <div style={{
                                    backgroundColor: '#FFFBEB',
                                    border: '2px solid #F59E0B',
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.12)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{
                                                padding: '6px',
                                                backgroundColor: '#FEF3C7',
                                                color: '#B45309',
                                                borderRadius: '8px',
                                                border: '1px solid #FDE68A',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                <ShieldAlert size={18} />
                                            </div>
                                            <div>
                                                <span style={{ fontSize: '0.78rem', fontWeight: '900', color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                    PROTOCOLO DE QUIEBRE DE ABASTECIMIENTO EN CORABASTOS (PQRS PROACTIVA)
                                                </span>
                                                <p style={{ fontSize: '0.68rem', color: '#B45309', margin: '2px 0 0 0' }}>
                                                    Producto no disponible en la central mayorista. Consulta activa con el cliente antes de la salida del furgón.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Live Countdown Badge */}
                                        <div style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            backgroundColor: shortageCountdown.isExpired ? '#FEE2E2' : '#FEF3C7',
                                            border: shortageCountdown.isExpired ? '1px solid #FCA5A5' : '1px solid #FCD34D',
                                            color: shortageCountdown.isExpired ? '#991B1B' : '#92400E'
                                        }}>
                                            <Clock size={14} className={shortageCountdown.isExpired ? '' : 'animate-pulse'} />
                                            <span style={{ fontSize: '0.74rem', fontWeight: '800', fontFamily: 'monospace' }}>
                                                {shortageCountdown.isExpired ? 'TIMEOUT EXPIRADO (Auto-Liberación)' : `Auto-Liberación: ${shortageCountdown.formattedCountdown}`}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Decision Triad Buttons */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                        gap: '8px',
                                        paddingTop: '6px'
                                    }}>
                                        {/* Opción A: Sustituir SKU */}
                                        <button
                                            type="button"
                                            onClick={() => setSubstituteModalOpen(true)}
                                            disabled={actionLoading}
                                            style={{
                                                padding: '10px 12px',
                                                backgroundColor: '#0D7A57',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '0.73rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                boxShadow: '0 2px 4px rgba(13, 122, 87, 0.2)'
                                            }}
                                        >
                                            <ShoppingBag size={14} />
                                            <span>Opción A: Sustituir SKU en Bodega</span>
                                        </button>

                                        {/* Opción B: Retiro Limpio / Col K */}
                                        <button
                                            type="button"
                                            onClick={() => handleExecuteShortageCleanWithdrawal(false)}
                                            disabled={actionLoading}
                                            style={{
                                                padding: '10px 12px',
                                                backgroundColor: '#334155',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '0.73rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <PackageMinus size={14} />
                                            <span>Opción B: Retiro Limpio / Col K</span>
                                        </button>

                                        {/* Opción C: Anexar a Próximo Pedido D+1 */}
                                        <button
                                            type="button"
                                            onClick={handleExecuteShortageAppendNextOrder}
                                            disabled={actionLoading}
                                            style={{
                                                padding: '10px 12px',
                                                backgroundColor: '#2563EB',
                                                color: 'white',
                                                border: 'none',
                                                borderRadius: '8px',
                                                fontSize: '0.73rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                        >
                                            <Truck size={14} />
                                            <span>Opción C: Anexar a Próximo Pedido (D+1)</span>
                                        </button>

                                        {/* Auto-Liberación Express */}
                                        {shortageCountdown.isExpired && (
                                            <button
                                                type="button"
                                                onClick={() => handleExecuteShortageCleanWithdrawal(true)}
                                                disabled={actionLoading}
                                                style={{
                                                    padding: '10px 12px',
                                                    backgroundColor: '#DC2626',
                                                    color: 'white',
                                                    border: 'none',
                                                    borderRadius: '8px',
                                                    fontSize: '0.73rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                <RotateCcw size={14} />
                                                <span>Auto-Liberar Despacho Ahora</span>
                                            </button>
                                        )}
                                    </div>

                                    <div style={{ fontSize: '0.68rem', color: '#92400E', fontStyle: 'italic', borderTop: '1px solid #FDE68A', paddingTop: '6px' }}>
                                        * Regla Poka-Yoke: Respuestas tardías se consolidan automáticamente en el siguiente pedido habitual del cliente ($D+1$). Prohibido desviar camiones en ruta para micro-cantidades.
                                    </div>
                                </div>
                            )}

                            {/* 1. Context Row: Radicación & Pedido Asociado (2 balanced columns) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                                {/* Radicación & Asunto */}
                                <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#64748B' }}>
                                            Radicación & Asunto
                                        </span>
                                        <span style={{ fontSize: '0.68rem', color: '#94A3B8', fontFamily: 'monospace' }}>
                                            {new Date(pqr.created_at).toLocaleString('es-CO')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0F172A' }}>{pqr.subject || 'Sin asunto'}</div>
                                    <div style={{ fontSize: '0.74rem', color: '#334155', lineHeight: '1.4', backgroundColor: 'white', padding: '8px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        {pqr.description || 'Sin descripción ingresada.'}
                                    </div>
                                    {authorInfo.isColleagueLogged && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#0D7A57', backgroundColor: '#EAEFEA', padding: '4px 8px', borderRadius: '6px', border: '1px solid #C4D7C4' }}>
                                            <Sparkles size={12} />
                                            <span>Radicado por: <strong>{authorInfo.colleagueName}</strong></span>
                                        </div>
                                    )}
                                </div>

                                {/* Pedido Asociado */}
                                <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Link2 size={15} style={{ color: '#475569' }} />
                                            <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                                Pedido Asociado a la Reclamación
                                            </span>
                                        </div>
                                        {pqr.order_id && (
                                            <button
                                                type="button"
                                                onClick={handleUnlinkOrder}
                                                disabled={isLinkingOrder}
                                                style={{ fontSize: '0.7rem', color: '#DC2626', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '700' }}
                                            >
                                                <Unlink size={12} />
                                                <span>Desvincular</span>
                                            </button>
                                        )}
                                    </div>

                                    {pqr.order_id ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px', backgroundColor: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.74rem' }}>
                                            <div>
                                                <span style={{ color: '#94A3B8', fontSize: '0.66rem', display: 'block' }}>Folio Pedido</span>
                                                <strong style={{ color: '#0F172A', fontSize: '0.85rem' }}>#{pqr.orders?.sequence_id || 'N/A'}</strong>
                                            </div>
                                            <div>
                                                <span style={{ color: '#94A3B8', fontSize: '0.66rem', display: 'block' }}>Total Pedido</span>
                                                <strong style={{ color: '#0F172A', fontSize: '0.85rem' }}>{formatMoney(pqr.orders?.total || 0)}</strong>
                                            </div>
                                            <div>
                                                <span style={{ color: '#94A3B8', fontSize: '0.66rem', display: 'block' }}>Dirección / Sede</span>
                                                <span style={{ color: '#334155', fontWeight: '600' }}>{pqr.orders?.shipping_address || 'Sede Principal'}</span>
                                            </div>
                                            <div>
                                                <span style={{ color: '#94A3B8', fontSize: '0.66rem', display: 'block' }}>Conductor Ruta</span>
                                                <span style={{ color: '#334155', fontWeight: '700' }}>{assignedRouteDriver ? assignedRouteDriver.name : 'No asignado'}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', backgroundColor: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px dashed #CBD5E1' }}>
                                            <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                Este caso no tiene un pedido enlazado. Selecciona un pedido reciente del cliente para habilitar reposiciones:
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <SearchableSelect
                                                        value={linkingOrderId}
                                                        onChange={setLinkingOrderId}
                                                        disabled={loadingRecentOrders || isLinkingOrder}
                                                        placeholder="-- Seleccionar Pedido Reciente --"
                                                        searchPlaceholder="Buscar por #pedido, fecha o valor..."
                                                        clearable
                                                        options={clientRecentOrders.map(o => ({
                                                            value: o.id,
                                                            label: `Pedido #${o.sequence_id}`,
                                                            sublabel: `${new Date(o.created_at).toLocaleDateString('es-CO')} • ${o.shipping_address || 'Sede'}`,
                                                            badge: formatMoney(o.total || 0)
                                                        }))}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleLinkOrder(linkingOrderId)}
                                                    disabled={!linkingOrderId || isLinkingOrder}
                                                    style={{ padding: '6px 12px', backgroundColor: '#0D7A57', color: 'white', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    {isLinkingOrder ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Link2 size={12} />}
                                                    <span>Vincular</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. Main Operational Workspace (2-Column Split Layout: Evidence & WhatsApp SAC on Left, Novelties Management on Right) */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px', alignItems: 'start' }}>
                                {/* LEFT PANEL: Evidence Photo & WhatsApp SAC */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {/* Evidence Photo Gallery */}
                                    <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Camera size={15} style={{ color: '#475569' }} />
                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                                    Evidencia Fotográfica ({photos.length})
                                                </span>
                                            </div>
                                            <div>
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    onChange={handleUploadEvidence}
                                                    accept="image/*"
                                                    style={{ display: 'none' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={uploadingPhoto}
                                                    style={{
                                                        padding: '4px 8px',
                                                        backgroundColor: 'white',
                                                        border: '1px solid #CBD5E1',
                                                        color: '#334155',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
                                                        fontWeight: '700',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                >
                                                    {uploadingPhoto ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={11} />}
                                                    <span>Subir Foto</span>
                                                </button>
                                            </div>
                                        </div>

                                        {photos.length > 0 ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{
                                                    position: 'relative',
                                                    borderRadius: '10px',
                                                    overflow: 'hidden',
                                                    backgroundColor: '#0F172A',
                                                    height: '160px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid #CBD5E1'
                                                }}>
                                                    <img
                                                        src={photos[activePhotoIdx]}
                                                        alt="Evidencia PQR"
                                                        style={{ maxHeight: '160px', width: 'auto', maxWidth: '100%', objectFit: 'contain', cursor: 'pointer' }}
                                                        onClick={() => onZoomPhoto(photos[activePhotoIdx])}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => onZoomPhoto(photos[activePhotoIdx])}
                                                        style={{
                                                            position: 'absolute',
                                                            bottom: '6px',
                                                            right: '6px',
                                                            padding: '4px 8px',
                                                            backgroundColor: 'rgba(15, 23, 42, 0.85)',
                                                            color: 'white',
                                                            borderRadius: '6px',
                                                            fontSize: '0.68rem',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px'
                                                        }}
                                                    >
                                                        <Maximize2 size={11} />
                                                        <span>Ampliar</span>
                                                    </button>
                                                </div>

                                                {photos.length > 1 && (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                                                        {photos.map((url, idx) => (
                                                            <button
                                                                key={idx}
                                                                type="button"
                                                                onClick={() => setActivePhotoIdx(idx)}
                                                                style={{
                                                                    width: '44px',
                                                                    height: '44px',
                                                                    borderRadius: '6px',
                                                                    overflow: 'hidden',
                                                                    padding: 0,
                                                                    border: activePhotoIdx === idx ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                                                    opacity: activePhotoIdx === idx ? 1 : 0.6,
                                                                    cursor: 'pointer',
                                                                    flexShrink: 0
                                                                }}
                                                            >
                                                                <img src={url} alt={`Thumb ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div style={{ padding: '1.25rem 1rem', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px dashed #CBD5E1', color: '#94A3B8', fontSize: '0.72rem' }}>
                                                No se adjuntaron fotografías al radicar. Puedes subir evidencias usando el botón superior.
                                            </div>
                                        )}
                                    </div>

                                    {/* Contacto Comercial & WhatsApp SAC */}
                                    <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                            <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <MessageCircle size={13} style={{ color: '#059669' }} />
                                                <span>Canal WhatsApp SAC</span>
                                            </span>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingPhone(!editingPhone);
                                                    setNewPhoneInput(authorInfo.phoneRaw || '');
                                                }}
                                                style={{ fontSize: '0.7rem', color: '#334155', textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <Edit2 size={11} />
                                                <span>{editingPhone ? 'Cancelar' : (authorInfo.phoneParsed.isValid ? 'Editar celular' : 'Registrar celular')}</span>
                                            </button>
                                        </div>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#0F172A' }}>{authorInfo.clientDisplayName}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.7rem', color: '#64748B', flexWrap: 'wrap' }}>
                                                {authorInfo.nit && <span>NIT: {authorInfo.nit}</span>}
                                                {authorInfo.email && <span>• {authorInfo.email}</span>}
                                            </div>
                                        </div>

                                        {editingPhone && (
                                            <div style={{ display: 'flex', gap: '6px', paddingTop: '2px' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: 3154456827"
                                                    value={newPhoneInput}
                                                    onChange={e => setNewPhoneInput(e.target.value)}
                                                    style={{ flex: '1', padding: '5px 8px', fontSize: '0.72rem', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={handleSavePhone}
                                                    disabled={savingPhone}
                                                    style={{ padding: '5px 10px', backgroundColor: '#0F172A', color: 'white', borderRadius: '6px', fontSize: '0.7rem', fontWeight: '700', border: 'none', cursor: 'pointer' }}
                                                >
                                                    {savingPhone ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : 'Guardar'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Template Selector Pills */}
                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            overflowX: 'auto',
                                            paddingBottom: '2px'
                                        }}>
                                            {WHATSAPP_PQR_TEMPLATES.map(t => (
                                                <button
                                                    key={t.id}
                                                    type="button"
                                                    onClick={() => setSelectedWaTemplate(t.id)}
                                                    style={{
                                                        padding: '3px 7px',
                                                        fontSize: '0.66rem',
                                                        fontWeight: selectedWaTemplate === t.id ? '800' : '600',
                                                        borderRadius: '6px',
                                                        border: selectedWaTemplate === t.id ? '1px solid #0D7A57' : '1px solid #CBD5E1',
                                                        backgroundColor: selectedWaTemplate === t.id ? '#EAEFEA' : 'white',
                                                        color: selectedWaTemplate === t.id ? '#0D7A57' : '#475569',
                                                        cursor: 'pointer',
                                                        whiteSpace: 'nowrap',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    title={t.description}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Message Preview Box */}
                                        <div style={{
                                            backgroundColor: '#F0FDF4',
                                            border: '1px solid #BBF7D0',
                                            borderRadius: '8px',
                                            padding: '7px 9px',
                                            fontSize: '0.7rem',
                                            color: '#166534',
                                            lineHeight: '1.35',
                                            whiteSpace: 'pre-wrap',
                                            maxHeight: '85px',
                                            overflowY: 'auto'
                                        }}>
                                            {buildPqrWhatsAppMessage(pqr, selectedWaTemplate)}
                                        </div>

                                        {/* Buttons Bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            {authorInfo.phoneParsed.isValid ? (
                                                <a
                                                    href={`https://wa.me/${authorInfo.phoneParsed.waNumber}?text=${encodeURIComponent(buildPqrWhatsAppMessage(pqr, selectedWaTemplate))}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        padding: '6px 12px',
                                                        backgroundColor: '#059669',
                                                        color: 'white',
                                                        borderRadius: '8px',
                                                        fontSize: '0.72rem',
                                                        fontWeight: '800',
                                                        textDecoration: 'none',
                                                        boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)',
                                                        transition: 'background-color 0.15s'
                                                    }}
                                                >
                                                    <MessageCircle size={13} />
                                                    <span>Abrir WhatsApp ({authorInfo.phoneParsed.display})</span>
                                                </a>
                                            ) : (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: '#B45309', backgroundColor: '#FEF3C7', padding: '4px 8px', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                                                    <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                                                    <span>Sin número celular válido</span>
                                                </span>
                                            )}

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const msg = buildPqrWhatsAppMessage(pqr, selectedWaTemplate);
                                                    navigator.clipboard.writeText(msg);
                                                    showToast('Mensaje de WhatsApp copiado al portapapeles.', 'success');
                                                }}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '5px 9px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: '700',
                                                    color: '#334155',
                                                    backgroundColor: 'white',
                                                    border: '1px solid #CBD5E1',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Copiar texto del mensaje"
                                            >
                                                <Copy size={11} />
                                                <span>Copiar</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT PANEL: Declaración & Gestión de Novedades de Línea */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {pqr.order_id ? (
                                        <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                                    Declaración de Novedades de Línea (Faltante / Avería)
                                                </span>
                                                <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                    {orderItems.length} productos en pedido
                                                </span>
                                            </div>

                                            {/* Formulario de Adición / Modificación */}
                                            <div style={{ backgroundColor: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div>
                                                    <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '3px' }}>Producto del Pedido</label>
                                                    <SearchableSelect
                                                        value={selectedItemId}
                                                        onChange={setSelectedItemId}
                                                        placeholder="-- Seleccionar Producto del Pedido --"
                                                        searchPlaceholder="Buscar producto por nombre o SKU..."
                                                        clearable
                                                        options={orderItems.map(item => ({
                                                            value: item.id,
                                                            label: item.products?.name || item.nickname || 'Ítem sin nombre',
                                                            sublabel: `Pedido: ${item.quantity} ${item.products?.unit_of_measure || 'ud'} • Precio: ${formatMoney(item.unit_price)}`,
                                                            badge: item.products?.sku || `${item.quantity} ${item.products?.unit_of_measure || 'ud'}`
                                                        }))}
                                                    />
                                                </div>

                                                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', alignItems: 'end' }}>
                                                    <div>
                                                        <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '3px' }}>Tipo de Novedad</label>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', height: '32px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoveltyType('faltante')}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '700',
                                                                    borderRadius: '6px',
                                                                    border: noveltyType === 'faltante' ? '1px solid #0D7A57' : '1px solid #CBD5E1',
                                                                    backgroundColor: noveltyType === 'faltante' ? '#ECFDF5' : '#FFFFFF',
                                                                    color: noveltyType === 'faltante' ? '#065F46' : '#64748B',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <PackageX size={13} />
                                                                <span>Faltante</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNoveltyType('averia')}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '4px',
                                                                    fontSize: '0.7rem',
                                                                    fontWeight: '700',
                                                                    borderRadius: '6px',
                                                                    border: noveltyType === 'averia' ? '1px solid #B45309' : '1px solid #CBD5E1',
                                                                    backgroundColor: noveltyType === 'averia' ? '#FFFBEB' : '#FFFFFF',
                                                                    color: noveltyType === 'averia' ? '#B45309' : '#64748B',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <AlertTriangle size={13} />
                                                                <span>Avería</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#64748B', display: 'block', marginBottom: '3px' }}>Cantidad Afectada</label>
                                                        <div style={{ display: 'flex', gap: '6px' }}>
                                                            <input
                                                                type="number"
                                                                min="0.1"
                                                                step="0.1"
                                                                placeholder="Cant."
                                                                value={noveltyQty || ''}
                                                                onChange={e => setNoveltyQty(parseFloat(e.target.value) || 0)}
                                                                style={{ width: '100%', padding: '6px 8px', fontSize: '0.72rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px' }}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={handleCreateNovelty}
                                                                disabled={actionLoading || !selectedItemId || noveltyQty <= 0}
                                                                style={{ padding: '6px 12px', backgroundColor: '#0F172A', color: 'white', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}
                                                            >
                                                                {actionLoading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={12} />}
                                                                <span>Agregar</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {noveltyType === 'averia' && (
                                                    <div style={{ paddingTop: '4px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <label style={{ fontSize: '0.68rem', fontWeight: '700', color: '#475569' }}>
                                                            Custodia Física del Producto Afectado:
                                                        </label>
                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTogglePhysicalReturnCustody(false)}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '5px',
                                                                    padding: '6px 8px',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: '700',
                                                                    borderRadius: '6px',
                                                                    border: !hasPhysicalReturn ? '1.5px solid #0D7A57' : '1px solid #CBD5E1',
                                                                    backgroundColor: !hasPhysicalReturn ? '#ECFDF5' : '#FFFFFF',
                                                                    color: !hasPhysicalReturn ? '#065F46' : '#64748B',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <Store size={13} />
                                                                <span>Se queda en Cliente (Sin Retorno)</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleTogglePhysicalReturnCustody(true)}
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '5px',
                                                                    padding: '6px 8px',
                                                                    fontSize: '0.68rem',
                                                                    fontWeight: '700',
                                                                    borderRadius: '6px',
                                                                    border: hasPhysicalReturn ? '1.5px solid #3730A3' : '1px solid #CBD5E1',
                                                                    backgroundColor: hasPhysicalReturn ? '#E0E7FF' : '#FFFFFF',
                                                                    color: hasPhysicalReturn ? '#3730A3' : '#64748B',
                                                                    cursor: 'pointer'
                                                                }}
                                                            >
                                                                <Truck size={13} />
                                                                <span>Devuelto en Camión (A Bodega)</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Registered Novelties Full-Width Table / List */}
                                            <div style={{ backgroundColor: 'white', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '6px', borderBottom: '1px solid #E2E8F0' }}>
                                                    <span style={{ fontSize: '0.68rem', fontWeight: '800', textTransform: 'uppercase', color: '#0D7A57' }}>
                                                        Novedades Declaradas en este Pedido ({caseReturns.length})
                                                    </span>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: '900', color: '#047857' }}>
                                                        Impacto Total: {formatMoney(nominalNoveltiesCoQ)}
                                                    </span>
                                                </div>

                                                {caseReturns.length === 0 ? (
                                                    <div style={{ padding: '1rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.72rem' }}>
                                                        No hay novedades registradas aún en este pedido. Selecciona un producto arriba para agregarlo.
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        {caseReturns.map((ret: any) => {
                                                            const oi = orderItems.find(o => o.product_id === ret.product_id) || 
                                                                       ret.orders?.order_items?.find((o: any) => o.product_id === ret.product_id);
                                                            const unitPrice = Number(oi?.unit_price || ret.unit_price || 0);
                                                            const subtotal = unitPrice * (Number(ret.quantity_returned) || 0);
                                                            const pName = ret.products?.name || oi?.products?.name || 'Producto';
                                                            const uom = ret.products?.unit_of_measure || oi?.products?.unit_of_measure || 'Kg';
                                                            const isPhysical = ret.has_physical_return || (ret.notes || '').includes('RETORNO_FISICO: SI');
                                                            const isFaltante = (ret.reason || '').toLowerCase().includes('faltante');

                                                            return (
                                                                <div
                                                                    key={ret.id}
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'space-between',
                                                                        backgroundColor: '#F8FAFC',
                                                                        border: '1px solid #E2E8F0',
                                                                        borderRadius: '8px',
                                                                        padding: '8px 10px',
                                                                        fontSize: '0.72rem'
                                                                    }}
                                                                >
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                                                        <div style={{
                                                                            width: '24px',
                                                                            height: '24px',
                                                                            borderRadius: '50%',
                                                                            backgroundColor: isFaltante ? '#ECFDF5' : '#FFFBEB',
                                                                            color: isFaltante ? '#065F46' : '#B45309',
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'center',
                                                                            flexShrink: 0
                                                                        }}>
                                                                            {isFaltante ? <PackageX size={13} /> : <AlertTriangle size={13} />}
                                                                        </div>
                                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                                            <strong style={{ color: '#0F172A', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pName}</strong>
                                                                            <div style={{ fontSize: '0.66rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                                <span><strong>{ret.quantity_returned} {uom}</strong> @ {formatMoney(unitPrice)}/{uom}</span>
                                                                                <span style={{
                                                                                    fontSize: '0.62rem',
                                                                                    fontWeight: '700',
                                                                                    padding: '1px 6px',
                                                                                    borderRadius: '4px',
                                                                                    backgroundColor: isFaltante ? '#D1FAE5' : '#FEF3C7',
                                                                                    color: isFaltante ? '#065F46' : '#92400E'
                                                                                }}>
                                                                                    {isFaltante ? 'Faltante' : 'Avería'}
                                                                                </span>
                                                                                {!isFaltante && (
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => handleTogglePhysicalReturnCustody(!isPhysical, ret.id)}
                                                                                        title="Haz clic para cambiar si el producto se quedó con el cliente o fue devuelto en el camión a bodega"
                                                                                        style={{
                                                                                            fontSize: '0.62rem',
                                                                                            fontWeight: '700',
                                                                                            padding: '1px 7px',
                                                                                            borderRadius: '4px',
                                                                                            backgroundColor: isPhysical ? '#E0E7FF' : '#ECFDF5',
                                                                                            color: isPhysical ? '#3730A3' : '#065F46',
                                                                                            border: isPhysical ? '1px solid #C7D2FE' : '1px solid #A7F3D0',
                                                                                            cursor: 'pointer',
                                                                                            display: 'inline-flex',
                                                                                            alignItems: 'center',
                                                                                            gap: '4px'
                                                                                        }}
                                                                                    >
                                                                                        {isPhysical ? <Truck size={10} /> : <Store size={10} />}
                                                                                        <span>{isPhysical ? 'Devuelto en Camión (A Bodega)' : 'En Sede Cliente (Sin Retorno)'}</span>
                                                                                    </button>
                                                                                )}
                                                                                <span style={{
                                                                                    fontSize: '0.62rem',
                                                                                    fontWeight: '700',
                                                                                    padding: '1px 6px',
                                                                                    borderRadius: '4px',
                                                                                    backgroundColor: ret.status === 'approved' ? '#D1FAE5' : ret.status === 'rejected' ? '#F1F5F9' : '#FEF3C7',
                                                                                    color: ret.status === 'approved' ? '#065F46' : ret.status === 'rejected' ? '#475569' : '#92400E'
                                                                                }}>
                                                                                    {ret.status === 'approved' ? 'Aprobada' : ret.status === 'rejected' ? 'Sin Costo' : 'Pendiente'}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                                                        <strong style={{ color: '#047857', fontSize: '0.78rem' }}>
                                                                            {formatMoney(subtotal)}
                                                                        </strong>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleDeleteNovelty(ret.id)}
                                                                            disabled={actionLoading}
                                                                            style={{
                                                                                border: 'none',
                                                                                background: 'transparent',
                                                                                color: '#DC2626',
                                                                                cursor: 'pointer',
                                                                                padding: '4px',
                                                                                borderRadius: '4px'
                                                                            }}
                                                                            title="Eliminar esta novedad"
                                                                        >
                                                                            <Trash2 size={14} />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '2rem 1.5rem', textAlign: 'center', backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '12px', color: '#64748B', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                            <Package size={24} style={{ color: '#94A3B8' }} />
                                            <strong style={{ color: '#334155' }}>Sin Pedido Vinculado</strong>
                                            <span>Vincula un pedido en la tarjeta superior para habilitar la declaración de faltantes y averías de producto.</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ================= STEP 2: DECISIÓN COMERCIAL & CAPA ================= */}
                    {currentStep === 2 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {pqr.status === 'resolved' && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 14px',
                                    backgroundColor: '#ECFDF5',
                                    border: '1px solid #A7F3D0',
                                    borderRadius: '10px',
                                    fontSize: '0.74rem',
                                    color: '#065F46'
                                }}>
                                    <ShieldCheck size={16} style={{ color: '#059669', flexShrink: 0 }} />
                                    <span>
                                        <strong>Modo Rectificación / Caso Resuelto:</strong> Puedes actualizar la causa raíz (RCA), la imputabilidad a funcionarios, el protocolo sanitario y las observaciones sin duplicar pedidos ni alterar registros contables cerrados.
                                    </span>
                                </div>
                            )}

                            {/* 4 Commercial Resolution Action Cards */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                    1. Concepto de Resolución Comercial
                                </span>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
                                    {/* Opt 1: Conforme */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setResolutionOption('opt1');
                                            if (!hasPhysicalReturn) {
                                                setSanitaryKey('producto_conforme_sin_baja');
                                                const tmpl = DISPOSICION_SANITARIA_TEMPLATES.find(t => t.id === 'producto_conforme_sin_baja');
                                                if (tmpl) {
                                                    setResolutionNotes(prev => {
                                                        const regex = /\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\n\[|$)/;
                                                        if (regex.test(prev)) return prev.replace(regex, tmpl.textTemplate).trim();
                                                        return prev ? `${prev}\n\n${tmpl.textTemplate}`.trim() : tmpl.textTemplate;
                                                    });
                                                }
                                            }
                                        }}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            textAlign: 'left',
                                            backgroundColor: resolutionOption === 'opt1' ? '#EAEFEA' : 'white',
                                            border: resolutionOption === 'opt1' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#1A231E', fontSize: '0.75rem', marginBottom: '4px' }}>
                                            <ShieldCheck size={16} style={{ color: resolutionOption === 'opt1' ? '#0D7A57' : '#64748B' }} />
                                            <span>Opción 1: Cerrar Conforme (Sin Costo)</span>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: '#64748B', margin: 0, lineHeight: '1.3' }}>
                                            El reclamo no procede o fue aclarado con el cliente. Se cobra el 100% de la factura original y <strong>no aplica deducción de nómina al colaborador ($0 COP)</strong>.
                                        </p>
                                    </button>

                                    {/* Opt 2: Reposición D+1 $0 COP */}
                                    {(() => {
                                        const isPingPongBlocked = parseRcaFromRecord(pqr).isReplacementRejection;
                                        const bogotaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
                                        const [bY, bM, bD] = bogotaToday.split('-').map(Number);
                                        const d1DateStr = new Date(Date.UTC(bY, bM - 1, bD + 1)).toISOString().split('T')[0];
                                        return (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (isPingPongBlocked) {
                                                        showToast('BLOQUEADO POR REGLA ANTI PING-PONG: Este pedido ya es una reposición de garantía. Usa Nota Crédito o Ajuste de Factura.', 'warning');
                                                        return;
                                                    }
                                                    setResolutionOption('opt2');
                                                    if (sanitaryKey === 'producto_conforme_sin_baja') {
                                                        const nextKey = hasPhysicalReturn ? 'destruccion_biologica' : 'disposicion_cliente_sin_retorno';
                                                        setSanitaryKey(nextKey);
                                                        const tmpl = DISPOSICION_SANITARIA_TEMPLATES.find(t => t.id === nextKey);
                                                        if (tmpl) {
                                                            setResolutionNotes(prev => {
                                                                const regex = /\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\n\[|$)/;
                                                                if (regex.test(prev)) return prev.replace(regex, tmpl.textTemplate).trim();
                                                                return prev ? `${prev}\n\n${tmpl.textTemplate}`.trim() : tmpl.textTemplate;
                                                            });
                                                        }
                                                    }
                                                }}
                                                style={{
                                                    padding: '12px 14px',
                                                    borderRadius: '12px',
                                                    textAlign: 'left',
                                                    backgroundColor: isPingPongBlocked ? '#FEF2F2' : resolutionOption === 'opt2' ? '#EAEFEA' : 'white',
                                                    border: isPingPongBlocked ? '1px dashed #FCA5A5' : resolutionOption === 'opt2' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                                    cursor: isPingPongBlocked ? 'not-allowed' : 'pointer',
                                                    opacity: isPingPongBlocked ? 0.75 : 1
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', fontWeight: '800', color: isPingPongBlocked ? '#991B1B' : '#1A231E', fontSize: '0.75rem', marginBottom: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Truck size={16} style={{ color: isPingPongBlocked ? '#DC2626' : resolutionOption === 'opt2' ? '#0D7A57' : '#64748B' }} />
                                                        <span>Opción 2: Reponer Físicamente D+1 ($0 COP)</span>
                                                    </div>
                                                    {isPingPongBlocked && (
                                                        <span style={{ fontSize: '0.62rem', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#FEE2E2', color: '#991B1B', fontWeight: '800' }}>
                                                            Anti Ping-Pong
                                                        </span>
                                                    )}
                                                </div>
                                                <p style={{ fontSize: '0.7rem', color: isPingPongBlocked ? '#991B1B' : '#64748B', margin: 0, lineHeight: '1.3' }}>
                                                    {isPingPongBlocked
                                                        ? 'Bloqueado: El pedido origen ya es una reposición ($0 COP). Liquida con Nota Crédito o Ajuste.'
                                                        : <>Genera pedido de reposición valorizado en <strong>$0 COP</strong> para entrega <strong>D+1 ({d1DateStr})</strong> en estado <strong>Aprobado</strong> para Picking.</>}
                                                </p>
                                            </button>
                                        );
                                    })()}

                                    {/* Opt 3: Nota Crédito Financiera */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setResolutionOption('opt3');
                                            if (sanitaryKey === 'producto_conforme_sin_baja') {
                                                const nextKey = hasPhysicalReturn ? 'destruccion_biologica' : 'disposicion_cliente_sin_retorno';
                                                setSanitaryKey(nextKey);
                                                const tmpl = DISPOSICION_SANITARIA_TEMPLATES.find(t => t.id === nextKey);
                                                if (tmpl) {
                                                    setResolutionNotes(prev => {
                                                        const regex = /\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\n\[|$)/;
                                                        if (regex.test(prev)) return prev.replace(regex, tmpl.textTemplate).trim();
                                                        return prev ? `${prev}\n\n${tmpl.textTemplate}`.trim() : tmpl.textTemplate;
                                                    });
                                                }
                                            }
                                        }}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            textAlign: 'left',
                                            backgroundColor: resolutionOption === 'opt3' ? '#EAEFEA' : 'white',
                                            border: resolutionOption === 'opt3' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#1A231E', fontSize: '0.75rem', marginBottom: '4px' }}>
                                            <DollarSign size={16} style={{ color: resolutionOption === 'opt3' ? '#0D7A57' : '#64748B' }} />
                                            <span>Opción 3: Emitir Nota Crédito Financiera</span>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: '#64748B', margin: 0, lineHeight: '1.3' }}>
                                            Liquida la devolución en World Office como Nota Crédito con referencia fiscal e IVA.
                                        </p>
                                    </button>

                                    {/* Opt 4: Ajustar Factura */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setResolutionOption('opt4');
                                            if (sanitaryKey === 'producto_conforme_sin_baja') {
                                                const nextKey = hasPhysicalReturn ? 'destruccion_biologica' : 'disposicion_cliente_sin_retorno';
                                                setSanitaryKey(nextKey);
                                                const tmpl = DISPOSICION_SANITARIA_TEMPLATES.find(t => t.id === nextKey);
                                                if (tmpl) {
                                                    setResolutionNotes(prev => {
                                                        const regex = /\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\n\[|$)/;
                                                        if (regex.test(prev)) return prev.replace(regex, tmpl.textTemplate).trim();
                                                        return prev ? `${prev}\n\n${tmpl.textTemplate}`.trim() : tmpl.textTemplate;
                                                    });
                                                }
                                            }
                                        }}
                                        style={{
                                            padding: '12px 14px',
                                            borderRadius: '12px',
                                            textAlign: 'left',
                                            backgroundColor: resolutionOption === 'opt4' ? '#EAEFEA' : 'white',
                                            border: resolutionOption === 'opt4' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '800', color: '#1A231E', fontSize: '0.75rem', marginBottom: '4px' }}>
                                            <Percent size={16} style={{ color: resolutionOption === 'opt4' ? '#0D7A57' : '#64748B' }} />
                                            <span>Opción 4: Ajustar Factura (Sustracción)</span>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: '#64748B', margin: 0, lineHeight: '1.3' }}>
                                            Resta la cantidad devuelta de los ítems para que la factura nazca por el valor neto exacto.
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Sanitary Disposal Template Filtered by Physical Custody */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', display: 'block' }}>
                                            2. Custodia Física del Producto & Protocolo Invima (Res. 2674/2013)
                                        </label>
                                        <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                            El protocolo sanitario depende de si el producto se quedó donde el cliente o regresó en el furgón a FruFresco.
                                        </span>
                                    </div>
                                    <div style={{ display: 'inline-flex', backgroundColor: '#E2E8F0', padding: '3px', borderRadius: '8px', gap: '4px' }}>
                                        <button
                                            type="button"
                                            onClick={() => handleTogglePhysicalReturnCustody(false)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.68rem',
                                                fontWeight: '800',
                                                border: 'none',
                                                cursor: 'pointer',
                                                backgroundColor: !hasPhysicalReturn ? '#FFFFFF' : 'transparent',
                                                color: !hasPhysicalReturn ? '#0D7A57' : '#475569',
                                                boxShadow: !hasPhysicalReturn ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                            }}
                                        >
                                            <Store size={12} />
                                            <span>Se queda en Cliente (Sin Retorno)</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleTogglePhysicalReturnCustody(true)}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px',
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.68rem',
                                                fontWeight: '800',
                                                border: 'none',
                                                cursor: 'pointer',
                                                backgroundColor: hasPhysicalReturn ? '#FFFFFF' : 'transparent',
                                                color: hasPhysicalReturn ? '#3730A3' : '#475569',
                                                boxShadow: hasPhysicalReturn ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                            }}
                                        >
                                            <Truck size={12} />
                                            <span>Devuelto en Camión (En Bodega FruFresco)</span>
                                        </button>
                                    </div>
                                </div>

                                <SearchableSelect
                                    value={sanitaryKey}
                                    onChange={k => {
                                        setSanitaryKey(k);
                                        const tmpl = DISPOSICION_SANITARIA_TEMPLATES.find(t => t.id === k);
                                        if (tmpl) {
                                            setResolutionNotes(prev => {
                                                const regex = /\[DISPOSICIÓN SANITARIA:[\s\S]*?(?=\n\n\[|$)/;
                                                if (regex.test(prev)) {
                                                    return prev.replace(regex, tmpl.textTemplate).trim();
                                                }
                                                return prev ? `${prev}\n\n${tmpl.textTemplate}`.trim() : tmpl.textTemplate;
                                            });
                                        }
                                    }}
                                    wrapOptions={true}
                                    placeholder="Seleccionar Protocolo Invima..."
                                    searchPlaceholder="Buscar protocolo sanitario..."
                                    options={DISPOSICION_SANITARIA_TEMPLATES
                                        .filter(tmpl => {
                                            const isClientSiteOption = tmpl.id === 'producto_conforme_sin_baja' || tmpl.id === 'disposicion_cliente_sin_retorno';
                                            return hasPhysicalReturn ? !isClientSiteOption : isClientSiteOption;
                                        })
                                        .map(tmpl => {
                                            const IconComp = tmpl.id === 'producto_conforme_sin_baja' ? ShieldCheck :
                                                             tmpl.id === 'disposicion_cliente_sin_retorno' ? Store :
                                                             tmpl.id === 'destruccion_biologica' ? Trash2 :
                                                             tmpl.id === 'transformacion_industrial' ? Layers :
                                                             tmpl.id === 'donacion_banco_alimentos' ? HeartHandshake : Sparkles;
                                            return {
                                                value: tmpl.id,
                                                label: tmpl.title,
                                                sublabel: tmpl.summary || tmpl.textTemplate,
                                                badge: tmpl.id === 'producto_conforme_sin_baja' ? 'Cliente se queda con él (Sin Baja)' : tmpl.id === 'disposicion_cliente_sin_retorno' ? 'Cliente descarta en sitio' : 'En Bodega FruFresco',
                                                icon: <IconComp size={15} style={{ color: tmpl.id === 'producto_conforme_sin_baja' ? '#1D4ED8' : tmpl.id === 'disposicion_cliente_sin_retorno' ? '#0D7A57' : '#3730A3' }} />
                                            };
                                        })}
                                />

                                {!hasPhysicalReturn && sanitaryKey === 'producto_conforme_sin_baja' && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        backgroundColor: '#EFF6FF',
                                        border: '1px solid #BFDBFE',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        color: '#1E40AF'
                                    }}>
                                        <ShieldCheck size={14} style={{ color: '#2563EB', flexShrink: 0 }} />
                                        <span>
                                            <strong>Sin Retorno — Cliente Aprovecha el Producto:</strong> El producto permanece en las instalaciones del cliente y es aprovechado normalmente sin requerir destrucción ni retorno a FruFresco.
                                        </span>
                                    </div>
                                )}

                                {!hasPhysicalReturn && sanitaryKey === 'disposicion_cliente_sin_retorno' && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        backgroundColor: '#ECFDF5',
                                        border: '1px solid #A7F3D0',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        color: '#065F46'
                                    }}>
                                        <Check size={14} style={{ color: '#059669', flexShrink: 0 }} />
                                        <span>
                                            <strong>Sin Retorno — Baja en Sitio por el Cliente:</strong> El producto averiado nunca regresa a FruFresco. El cliente asume el descarte físico en su cocina para proteger la ruta contra contaminación cruzada.
                                        </span>
                                    </div>
                                )}

                                {hasPhysicalReturn && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '8px 12px',
                                        backgroundColor: '#EEF2FF',
                                        border: '1px solid #C7D2FE',
                                        borderRadius: '8px',
                                        fontSize: '0.72rem',
                                        color: '#3730A3'
                                    }}>
                                        <Truck size={14} style={{ color: '#4338CA', flexShrink: 0 }} />
                                        <span>
                                            <strong>Con Retorno Físico a Bodega FruFresco:</strong> El cliente devolvió físicamente el producto con el conductor. La mercancía ingresa a cuarentena en muelle para ejecutar la disposición seleccionada arriba.
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Final Resolution Notes Textarea */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                    3. Dictamen Final de Auditoría & Plan de Acción (CAPA)
                                </label>
                                <textarea
                                    rows={4}
                                    value={resolutionNotes}
                                    onChange={e => setResolutionNotes(e.target.value)}
                                    placeholder="Conclusiones finales de cierre, acuerdos con el cliente o transportador..."
                                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.75rem', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', lineHeight: '1.4' }}
                                />
                            </div>
                        </div>
                    )}

                    {/* ================= STEP 3: RCA & IMPUTABILITY ================= */}
                    {currentStep === 3 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Macrocausa L1 & Subtype L2 Selection */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                        1. Diagnóstico de Causa Raíz (RCA)
                                    </span>
                                    <button
                                        type="button"
                                        onClick={onOpenTaxonomyModal}
                                        style={{ fontSize: '0.72rem', color: '#0D7A57', fontWeight: '700', textDecoration: 'underline', background: 'transparent', border: 'none', cursor: 'pointer' }}
                                    >
                                        Personalizar Taxonomía
                                    </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                                            Macrocausa (Nivel 1)
                                        </label>
                                        <SearchableSelect
                                            value={rcaCategoryL1}
                                            onChange={catCode => {
                                                setRcaCategoryL1(catCode);
                                                const found = customTaxonomy.find(c => c.code === catCode);
                                                if (found && found.subtypes.length > 0) {
                                                    setRcaSubtypeL2(found.subtypes[0].code);
                                                    handleResponsibleAreaChange(found.subtypes[0].typicalResponsible);
                                                }
                                            }}
                                            placeholder="Seleccionar Macrocausa (L1)..."
                                            searchPlaceholder="Buscar macrocausa..."
                                            options={customTaxonomy.map(cat => ({
                                                value: cat.code,
                                                label: cat.label,
                                                badge: `${cat.subtypes.length} subtipos`
                                            }))}
                                        />
                                    </div>

                                    <div>
                                        <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#334155', display: 'block', marginBottom: '4px' }}>
                                            Subtipo Específico (Nivel 2)
                                        </label>
                                        <SearchableSelect
                                            value={rcaSubtypeL2}
                                            onChange={subCode => {
                                                setRcaSubtypeL2(subCode);
                                                const subObj = availableSubtypes.find(s => s.code === subCode);
                                                if (subObj) {
                                                    handleResponsibleAreaChange(subObj.typicalResponsible);
                                                }
                                            }}
                                            placeholder="Seleccionar Subtipo (L2)..."
                                            searchPlaceholder="Buscar subtipo o falla específica..."
                                            options={availableSubtypes.map(sub => ({
                                                value: sub.code,
                                                label: sub.label,
                                                badge: sub.typicalResponsible ? `Área: ${sub.typicalResponsible}` : undefined
                                            }))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Responsible Area Grid (6 Cards) */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                    2. Área Responsable Imputada
                                </span>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                                    {(Object.entries(RESPONSIBLE_PARTIES) as [any, any][]).map(([code, item]) => {
                                        const isSelected = rcaResponsible === code;
                                        return (
                                            <button
                                                key={code}
                                                type="button"
                                                onClick={() => handleResponsibleAreaChange(code)}
                                                style={{
                                                    padding: '10px 8px',
                                                    borderRadius: '10px',
                                                    textAlign: 'center',
                                                    fontSize: '0.75rem',
                                                    fontWeight: isSelected ? '800' : '600',
                                                    backgroundColor: isSelected ? '#0D7A57' : 'white',
                                                    color: isSelected ? 'white' : '#334155',
                                                    border: isSelected ? '1px solid #065F46' : '1px solid #CBD5E1',
                                                    cursor: 'pointer',
                                                    boxShadow: isSelected ? '0 2px 4px rgba(13, 122, 87, 0.2)' : 'none'
                                                }}
                                            >
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Nominal Imputation Matrix & Payroll Recovery Policy */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569', display: 'block' }}>
                                            3. Matriz de Imputabilidad Nominal & Descuento
                                        </span>
                                        <p style={{ fontSize: '0.68rem', color: '#64748B', margin: '2px 0 0 0' }}>
                                            Política de Responsabilidad: Asigna a los funcionarios, proveedores o cliente para trazabilidad y deducción en nómina / fletes / nota débito.
                                        </p>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        {imputedEntities.length > 0 && (() => {
                                            const totalPct = Number(imputedEntities.reduce((sum, e) => sum + (e.sharePercent || 0), 0).toFixed(1));
                                            const isComplete = totalPct >= 99.9 && totalPct <= 100.1;
                                            const isOver = totalPct > 100.1;
                                            return (
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '6px 12px',
                                                    borderRadius: '8px',
                                                    border: isComplete ? '1px solid #A7F3D0' : isOver ? '1px solid #FECACA' : '1px solid #FDE68A',
                                                    backgroundColor: isComplete ? '#ECFDF5' : isOver ? '#FEF2F2' : '#FFFBEB',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    color: isComplete ? '#065F46' : isOver ? '#991B1B' : '#92400E'
                                                }}>
                                                    <span>Total Imputado: {isComplete ? '100%' : `${totalPct}%`}</span>
                                                    {isComplete ? (
                                                        <Check size={13} style={{ color: '#059669' }} />
                                                    ) : isOver ? (
                                                        <AlertTriangle size={13} style={{ color: '#DC2626' }} />
                                                    ) : (
                                                        <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>(Resta {Number((100 - totalPct).toFixed(1))}%)</span>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#F8FAFC', padding: '6px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#475569', fontWeight: '600' }}>Valor Novedad:</span>
                                            <span style={{ fontSize: '0.82rem', fontWeight: '800', color: '#1E293B' }}>{formatMoney(nominalNoveltiesCoQ)}</span>
                                        </div>

                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            backgroundColor: resolutionOption === 'opt1' ? '#EFF6FF' : '#FFF1F2',
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: resolutionOption === 'opt1' ? '1px solid #BFDBFE' : '1px solid #FECDD3'
                                        }}>
                                            <span style={{ fontSize: '0.7rem', color: resolutionOption === 'opt1' ? '#1E40AF' : '#9F1239', fontWeight: '700' }}>Impacto a Cobrar:</span>
                                            <span style={{ fontSize: '0.85rem', fontWeight: '900', color: resolutionOption === 'opt1' ? '#1D4ED8' : '#BE123C' }}>
                                                {resolutionOption === 'opt1' ? '$0 COP (Exonerado)' : formatMoney(nominalNoveltiesCoQ)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{
                                    padding: '8px 12px',
                                    backgroundColor: resolutionOption === 'opt1' ? '#EFF6FF' : '#FFF1F2',
                                    border: resolutionOption === 'opt1' ? '1px solid #BFDBFE' : '1px solid #FECDD3',
                                    borderRadius: '8px',
                                    fontSize: '0.72rem',
                                    color: resolutionOption === 'opt1' ? '#1E40AF' : '#9F1239',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    lineHeight: '1.4'
                                }}>
                                    {resolutionOption === 'opt1' ? (
                                        <ShieldCheck size={16} style={{ flexShrink: 0, color: '#2563EB' }} />
                                    ) : (
                                        <ShieldAlert size={16} style={{ flexShrink: 0, color: '#E11D48' }} />
                                    )}
                                    {resolutionOption === 'opt1' ? (
                                        <span>
                                            <strong>Trazabilidad Formativa ISO 9001 (Opción 1 — Cerrar Conforme):</strong> En el Paso 2 determinaste cerrar el caso sin impacto económico. La asignación de funcionario o área se registra exclusivamente con fines estadísticos y formativos: <strong>la deducción en nómina es estrictamente $0 COP (Exonerado)</strong>.
                                        </span>
                                    ) : (
                                        <span>
                                            <strong>Imputación Patrimonial Activa ({resolutionOption === 'opt2' ? 'Opción 2: Reposición D+1' : resolutionOption === 'opt3' ? 'Opción 3: Nota Crédito' : 'Opción 4: Ajuste de Factura'}):</strong> En el Paso 2 aprobaste reconocer la novedad por <strong>{formatMoney(nominalNoveltiesCoQ)}</strong>. La cuota asignada abajo se cargará a nómina / estado de cuenta del responsable.
                                        </span>
                                    )}
                                </div>

                                {/* Selector to Add Entity */}
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ flex: '1', minWidth: 0 }}>
                                        <SearchableSelect
                                            value={selectedImputedToAdd}
                                            onChange={setSelectedImputedToAdd}
                                            placeholder={`-- Seleccionar ${rcaResponsible === 'proveedor' ? 'Proveedor' : rcaResponsible === 'cliente' ? 'Cliente' : 'Funcionario'} para Imputar --`}
                                            searchPlaceholder={rcaResponsible === 'proveedor' ? "Buscar proveedor por nombre o NIT..." : rcaResponsible === 'cliente' ? "Buscar cliente..." : "Buscar funcionario por nombre o cargo..."}
                                            clearable
                                            options={rcaResponsible === 'proveedor' ? (
                                                providersList.map(prov => ({
                                                    value: prov.id,
                                                    label: prov.name,
                                                    sublabel: prov.nit ? `NIT: ${prov.nit}` : undefined,
                                                    badge: 'Proveedor'
                                                }))
                                            ) : rcaResponsible === 'cliente' ? (
                                                pqr?.profiles ? [{
                                                    value: pqr.client_id,
                                                    label: pqr.profiles.company_name || pqr.profiles.contact_name || 'Cliente de la PQR',
                                                    sublabel: pqr.profiles.nit ? `NIT: ${pqr.profiles.nit}` : undefined,
                                                    badge: 'Cliente'
                                                }] : []
                                            ) : (
                                                collaboratorsList.map(colab => ({
                                                    value: colab.id,
                                                    label: colab.contact_name,
                                                    sublabel: colab.phone || undefined,
                                                    badge: colab.role || 'Operativo'
                                                }))
                                            )}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleAddImputedEntity(selectedImputedToAdd)}
                                        disabled={!selectedImputedToAdd}
                                        style={{ padding: '8px 14px', backgroundColor: '#0F172A', color: 'white', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '700', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', flexShrink: 0, height: '34px' }}
                                    >
                                        <Plus size={13} />
                                        <span>Agregar</span>
                                    </button>
                                </div>

                                {/* Imputed Entities List with % Split Sliders */}
                                {imputedEntities.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {imputedEntities.length > 1 && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '2px' }}>
                                                <button
                                                    type="button"
                                                    onClick={handleResetEqualSplit}
                                                    style={{
                                                        padding: '4px 10px',
                                                        backgroundColor: '#ECFDF5',
                                                        border: '1px solid #A7F3D0',
                                                        borderRadius: '6px',
                                                        fontSize: '0.68rem',
                                                        fontWeight: '700',
                                                        color: '#065F46',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}
                                                    title="Dividir el dinero y porcentaje en partes iguales exactas"
                                                >
                                                    <RotateCcw size={11} />
                                                    <span>Dividir en Partes Iguales ({imputedEntities.length})</span>
                                                </button>
                                            </div>
                                        )}
                                        {imputedEntities.map(entity => (
                                            <div
                                                key={entity.id}
                                                style={{
                                                    backgroundColor: 'white',
                                                    padding: '10px 14px',
                                                    borderRadius: '10px',
                                                    border: '1px solid #E2E8F0',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    flexWrap: 'wrap',
                                                    gap: '10px'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <strong style={{ color: '#0F172A', fontSize: '0.78rem' }}>{entity.name}</strong>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: '800', textTransform: 'uppercase', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                                            {entity.role}
                                                        </span>
                                                    </div>
                                                    {entity.documentId && <span style={{ fontSize: '0.68rem', color: '#94A3B8' }}>Doc: {entity.documentId}</span>}
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                    {/* % Split Slider */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input
                                                            type="range"
                                                            min="0"
                                                            max="100"
                                                            step="0.5"
                                                            value={entity.sharePercent || 0}
                                                            onChange={e => handleUpdateEntityPercent(entity.id, parseFloat(e.target.value))}
                                                            style={{ width: '90px', accentColor: '#0D7A57', cursor: 'pointer' }}
                                                        />
                                                        <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '0.75rem', color: '#334155', minWidth: '42px', textAlign: 'right' }}>
                                                            {Number(entity.sharePercent || 0).toFixed(1)}%
                                                        </span>
                                                    </div>

                                                    {/* Calculated COP Deduction */}
                                                    <div style={{ textAlign: 'right', minWidth: '95px' }}>
                                                        <span style={{ fontSize: '0.65rem', color: '#94A3B8', display: 'block' }}>Cuota Imputada</span>
                                                        <strong style={{ fontSize: '0.82rem', color: resolutionOption === 'opt1' ? '#059669' : '#BE123C' }}>
                                                            {resolutionOption === 'opt1' ? (
                                                                <>
                                                                    $0 COP <span style={{ fontSize: '0.65rem', fontWeight: '600' }}>(Exonerado)</span>
                                                                </>
                                                            ) : (
                                                                formatMoney(entity.deductionAmount !== undefined && entity.deductionAmount > 0 
                                                                    ? entity.deductionAmount 
                                                                    : Math.round((nominalNoveltiesCoQ * (entity.sharePercent || 0)) / 100))
                                                            )}
                                                        </strong>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveImputedEntity(entity.id)}
                                                        style={{ padding: '6px', color: '#94A3B8', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: 'white', borderRadius: '10px', border: '1px dashed #CBD5E1', color: '#94A3B8', fontSize: '0.75rem' }}>
                                        No hay funcionarios o proveedores imputados nominalmente. Agrega al menos uno usando el selector superior.
                                    </div>
                                )}
                            </div>

                            {/* Technical Evidence Notes Textarea */}
                            <div style={{ padding: '12px 14px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: '800', textTransform: 'uppercase', color: '#475569' }}>
                                    4. Justificación Técnica & Hallazgos de Inspección
                                </label>
                                <textarea
                                    rows={3}
                                    value={rcaEvidenceNotes}
                                    onChange={e => setRcaEvidenceNotes(e.target.value)}
                                    placeholder="Detalla los hallazgos técnicos (ej: Temperatura en termógrafo al arribo: 14°C, daño por aplastamiento en 3 canastillas inferiores)..."
                                    style={{ width: '100%', padding: '8px 10px', fontSize: '0.75rem', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', lineHeight: '1.4' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. Modal Footer Navigation */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem 1.5rem',
                    backgroundColor: '#F8FAFC',
                    borderTop: '1px solid #E2E8F0'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>
                            Paso {currentStep} de 3
                        </span>
                        {pqr.status === 'resolved' && (
                            <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#DCFCE7', color: '#166534', fontWeight: '700' }}>
                                Caso Previamente Resuelto
                            </span>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {currentStep > 1 && (
                            <button
                                type="button"
                                onClick={() => setCurrentStep((currentStep - 1) as any)}
                                style={{
                                    padding: '8px 14px',
                                    backgroundColor: 'white',
                                    border: '1px solid #CBD5E1',
                                    color: '#334155',
                                    borderRadius: '10px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <ChevronLeft size={14} />
                                <span>Anterior</span>
                            </button>
                        )}

                        {currentStep < 3 ? (
                            <button
                                type="button"
                                onClick={() => setCurrentStep((currentStep + 1) as any)}
                                style={{
                                    padding: '8px 18px',
                                    backgroundColor: '#0F172A',
                                    color: 'white',
                                    borderRadius: '10px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>Siguiente</span>
                                <ChevronRight size={14} />
                            </button>
                        ) : pqr.status === 'resolved' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={handleSaveAuditUpdate}
                                    disabled={actionLoading}
                                    style={{
                                        padding: '8px 18px',
                                        backgroundColor: '#059669',
                                        color: 'white',
                                        borderRadius: '10px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 6px rgba(5, 150, 105, 0.3)'
                                    }}
                                >
                                    {actionLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                                    <span>Guardar Cambios de Auditoría</span>
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => handleResolvePqr('resolved')}
                                    disabled={actionLoading}
                                    style={{
                                        padding: '8px 18px',
                                        backgroundColor: '#0D7A57',
                                        color: 'white',
                                        borderRadius: '10px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: '0 2px 6px rgba(13, 122, 87, 0.3)'
                                    }}
                                >
                                    {actionLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                                    <span>
                                        {resolutionOption === 'opt1'
                                            ? 'Confirmar Cierre Conforme ($0 COP)'
                                            : resolutionOption === 'opt2'
                                            ? 'Confirmar Reposición D+1 ($0 COP)'
                                            : resolutionOption === 'opt3'
                                            ? 'Continuar a Emisión de Nota Crédito'
                                            : 'Continuar a Ajuste de Factura'}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Dialog de Selección de Sustituto */}
            {substituteModalOpen && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 10000,
                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '1rem'
                }}>
                    <div style={{
                        width: '100%',
                        maxWidth: '520px',
                        backgroundColor: 'white',
                        borderRadius: '16px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{
                            padding: '1rem 1.25rem',
                            backgroundColor: '#0F172A',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ShoppingBag size={18} style={{ color: '#34D399' }} />
                                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', margin: 0 }}>
                                    Seleccionar SKU Sustituto en Bodega
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSubstituteModalOpen(false)}
                                style={{ background: 'transparent', border: 'none', color: '#94A3B8', cursor: 'pointer' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    Producto a Reemplazar en Pedido #{pqr.orders?.sequence_id || ''}
                                </label>
                                <SearchableSelect
                                    value={substituteTargetItemId}
                                    onChange={setSubstituteTargetItemId}
                                    placeholder="-- Todos los productos / Primer ítem del pedido --"
                                    searchPlaceholder="Buscar ítem del pedido..."
                                    clearable
                                    options={[
                                        { value: '', label: 'Todos los productos / Primer ítem del pedido' },
                                        ...orderItems.map(item => ({
                                            value: item.id,
                                            label: item.products?.name || item.nickname || 'Ítem',
                                            badge: `${item.quantity} ${item.products?.unit_of_measure || 'kg'}`
                                        }))
                                    ]}
                                />
                            </div>

                            <div>
                                <label style={{ fontSize: '0.72rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>
                                    SKU Sustituto Disponible en Catálogo
                                </label>
                                <SearchableSelect
                                    value={selectedSubstituteProductId}
                                    onChange={setSelectedSubstituteProductId}
                                    placeholder="-- Selecciona el producto equivalente disponible --"
                                    searchPlaceholder="Buscar SKU o nombre en catálogo..."
                                    clearable
                                    options={availableCatalogProducts.map(prod => ({
                                        value: prod.id,
                                        label: prod.name,
                                        sublabel: prod.sku ? `SKU: ${prod.sku}` : undefined,
                                        badge: prod.unit_of_measure || 'kg'
                                    }))}
                                />
                            </div>

                            <p style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#64748B', margin: 0, backgroundColor: '#F0FDF4', padding: '8px 10px', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                                <Sparkles size={14} style={{ color: '#16A34A', flexShrink: 0 }} />
                                <span>Al confirmar, el sistema actualiza la línea del pedido en caliente, notifica a la cuadrilla de alistamiento y emite la remisión con el producto sustituto conforme.</span>
                            </p>
                        </div>

                        <div style={{ padding: '0.75rem 1.25rem', backgroundColor: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setSubstituteModalOpen(false)}
                                style={{ padding: '8px 14px', backgroundColor: 'white', border: '1px solid #CBD5E1', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleExecuteShortageSubstitute}
                                disabled={actionLoading || !selectedSubstituteProductId}
                                style={{
                                    padding: '8px 18px',
                                    backgroundColor: '#0D7A57',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                {actionLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                                <span>Confirmar Sustitución</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
