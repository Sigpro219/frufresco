'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId, formatStructuredSpecification, getOrderReplacementInfo } from '@/lib/orderUtils';
import { useParams } from 'next/navigation';
import { ADMIN_EDIT_CUTOFF_HOUR } from '@/lib/constants';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { 
    ArrowLeft, 
    Calendar, 
    Clock, 
    MapPin, 
    Phone, 
    User, 
    Save, 
    Edit2, 
    Trash2, 
    Plus, 
    Search, 
    Lock, 
    ShieldCheck, 
    CheckCircle2, 
    AlertTriangle,
    Sparkles,
    Truck,
    PackageOpen,
    Printer,
    ExternalLink,
    FileText,
    RotateCcw
} from 'lucide-react';
import { normalizeAddress } from '@/lib/orderDuplicates';

export default function OrderDetailPage() {
    const { id } = useParams();

    // Data States
    const [order, setOrder] = useState<Order | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [userEmail, setUserEmail] = useState('');
    const [duplicateSiblings, setDuplicateSiblings] = useState<any[]>([]);
    const [resolvedParentOrder, setResolvedParentOrder] = useState<{ id: string; sequence_id: number; delivery_date?: string } | null>(null);
    const [resolvedChildOrders, setResolvedChildOrders] = useState<Array<{ id: string; sequence_id: number; delivery_date?: string }>>([]);

    interface Order {
        id: string;
        sequence_id?: number;
        created_at: string;
        total: number;
        status: string;
        delivery_date: string;
        delivery_slot: string;
        shipping_address: string;
        latitude?: number;
        longitude?: number;
        admin_notes: string;
        total_weight_kg: number;
        document_url?: string;
        logistics_data?: any;
        profile?: {
            id?: string;
            company_name: string;
            contact_name: string;
            contact_phone: string;
            address: string;
            nit?: string;
            latitude?: number;
            longitude?: number;
            delivery_restrictions?: string;
            logistics_data?: any;
        };
    }

    interface OrderItem {
        id: string | null; // Changed to allow null for new items
        order_id: string;
        product_id: string;
        quantity: number;
        unit_price: number;
        nickname?: string;
        product?: {
            id: string;
            name: string;
            unit_of_measure: string;
            image_url: string;
            base_price?: number;
            options_config?: any;
            weight_kg?: number;
            requires_label?: boolean;
        };
        selected_options?: any;
        variant_label?: any;
    }

    // UI States
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit States
    const [editForm, setEditForm] = useState<Partial<Order>>({});
    const [editItems, setEditItems] = useState<OrderItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);

    // VARIANT MODAL STATES
    const [selectedProductForModal, setSelectedProductForModal] = useState<any>(null);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [modalQuantity, setModalQuantity] = useState(1);

    const fetchCurrentUser = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && user.email) setUserEmail(user.email);
    };

    const fetchOrderDetails = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Order
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .select(`
                    *,
                    profile:profiles!profile_id (
                        id, company_name, contact_name, contact_phone, address, nit, latitude, longitude, delivery_restrictions, logistics_data
                    )
                `)
                .eq('id', id)
                .single();

            if (orderError) throw orderError;
            setOrder(orderData);
            if (orderData) {
                setEditForm(orderData);
            }


            // 2. Fetch Items
            const { data: itemsData, error: itemsError } = await supabase
                .from('order_items')
                .select(`
                    *,
                    product:products (
                        id, name, unit_of_measure, image_url, variants, weight_kg, requires_label
                    )
                `)
                .eq('order_id', id);

            if (itemsError) throw itemsError;
            setItems(itemsData || []);
            setEditItems(itemsData || []);

            // 3. Update Weight if it's 0 but items exist (Initial logic)
            if (orderData && (!orderData.total_weight_kg || orderData.total_weight_kg === 0) && itemsData?.length) {
                const autoWeight = (itemsData as any[]).reduce((acc: number, item: any) => {
                    const w = item.product?.weight_kg || 0;
                    return acc + (item.quantity * w);
                }, 0);
                if (autoWeight > 0) {
                    setEditForm(prev => ({ ...prev, total_weight_kg: autoWeight }));
                }
            }

            // 4. Duplicate Detection (Same client, delivery_date and sede)
            if (orderData && orderData.delivery_date && orderData.status !== 'cancelled') {
                const dateStr = String(orderData.delivery_date).split('T')[0];
                let dupQuery = supabase
                    .from('orders')
                    .select('id, sequence_id, created_at, total, total_weight_kg, status, shipping_address, delivery_date')
                    .eq('delivery_date', dateStr)
                    .neq('id', orderData.id)
                    .neq('status', 'cancelled');

                if (orderData.profile_id) {
                    dupQuery = dupQuery.eq('profile_id', orderData.profile_id);
                }

                const { data: siblingData } = await dupQuery;
                if (siblingData && siblingData.length > 0) {
                    const myNormAddr = normalizeAddress(orderData.shipping_address || orderData.profile?.address || '');
                    const matching = siblingData.filter(s => {
                        const sNorm = normalizeAddress(s.shipping_address || '');
                        return sNorm === myNormAddr;
                    });
                    setDuplicateSiblings(matching);
                } else {
                    setDuplicateSiblings([]);
                }
            }

            // 5. Bidirectional Replacement Lineage (Parent <-> Child D+1)
            if (orderData) {
                const rep = getOrderReplacementInfo(orderData);
                if (rep.isReplacement && rep.parentSequenceId) {
                    if (rep.parentOrderId) {
                        const { data: pOrd } = await supabase
                            .from('orders')
                            .select('id, sequence_id, delivery_date')
                            .eq('id', rep.parentOrderId)
                            .maybeSingle();
                        if (pOrd) setResolvedParentOrder(pOrd);
                    } else {
                        const { data: pOrd } = await supabase
                            .from('orders')
                            .select('id, sequence_id, delivery_date')
                            .eq('sequence_id', Number(rep.parentSequenceId))
                            .maybeSingle();
                        if (pOrd) setResolvedParentOrder(pOrd);
                    }
                } else {
                    setResolvedParentOrder(null);
                }

                // Resolve Child Replacement Orders if this is a Parent Order
                const childrenMap = new Map<string, { id: string; sequence_id: number; delivery_date?: string }>();
                if (rep.childReplacementOrderId && rep.childReplacementSequenceId) {
                    childrenMap.set(rep.childReplacementOrderId, {
                        id: rep.childReplacementOrderId,
                        sequence_id: Number(rep.childReplacementSequenceId),
                        delivery_date: rep.childReplacementDeliveryDate || undefined
                    });
                }
                if (orderData.sequence_id) {
                    const { data: childMatches } = await supabase
                        .from('orders')
                        .select('id, sequence_id, delivery_date, admin_notes')
                        .ilike('admin_notes', `%Pedido #${orderData.sequence_id}%`)
                        .neq('id', orderData.id);
                    if (childMatches) {
                        for (const c of childMatches) {
                            if (c.id && c.sequence_id) {
                                childrenMap.set(c.id, { id: c.id, sequence_id: c.sequence_id, delivery_date: c.delivery_date });
                            }
                        }
                    }
                }
                setResolvedChildOrders(Array.from(childrenMap.values()));
            }

        } catch (e) {
            console.error(e);
            alert('Error cargando el pedido.');
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) {
            fetchOrderDetails();
            fetchCurrentUser();
        }
    }, [id, fetchOrderDetails]); // Added fetchOrderDetails to dependencies

    // --- PERMISSIONS LOGIC (BOGOTA AWARE) ---
    const checkIsEditable = useCallback(async () => {
        if (!order) return false;

        // 0. Locked statuses
        if (['picking', 'shipped', 'in_transit', 'delivered', 'cancelled'].includes(order.status)) {
            return false;
        }

        // 1. Check Global Switch
        const { data: settings } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'enable_cutoff_rules')
            .single();
        
        const cutoffEnabled = settings?.value !== 'false';
        if (!cutoffEnabled) return true;

        // 2. Bogota Time logic
        const now = new Date();
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const bogotaNow = new Date(utc + (3600000 * -5));
        
        const deliveryDate = new Date(order.delivery_date + 'T00:00:00');
        const cutoffDate = new Date(deliveryDate);
        cutoffDate.setDate(deliveryDate.getDate() - 1);
        cutoffDate.setHours(ADMIN_EDIT_CUTOFF_HOUR, 0, 0, 0);

        // If it's already the delivery day or past 8 PM of the day before
        return bogotaNow.getTime() < cutoffDate.getTime();
    }, [order]);

    const [isEditable, setIsEditable] = useState(false);

    useEffect(() => {
        if (order) {
            checkIsEditable().then(setIsEditable);
        }
    }, [order, checkIsEditable]); // Added checkIsEditable to dependencies

    // --- EDIT LOGIC ---

    const handleEditToggle = () => {
        if (isEditing) {
            // Cancel
            if (order) {
                const resetForm: Partial<Order> = { ...order };
                setEditForm(resetForm);
                setEditItems(items);
            }
            setIsEditing(false);
        } else {
            setIsEditing(true);
        }
    };

    const handleItemChange = (index: number, field: string, value: any) => {
        const newItems = [...editItems];
        newItems[index] = { ...newItems[index], [field]: value };
        setEditItems(newItems);
        
        // Auto Update Weight
        if (field === 'quantity') {
            recalculateWeight(newItems);
        }
    };

    const handleRemoveItem = (index: number) => {
        const newItems = [...editItems];
        newItems.splice(index, 1);
        setEditItems(newItems);
        recalculateWeight(newItems);
    };

    const recalculateWeight = (currentItems: OrderItem[]) => {
        const total = currentItems.reduce((acc, item) => {
            const unit = ((item as any).unit || item.product?.unit_of_measure || '').toLowerCase().trim();
            const isKgUnit = ['kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos', 'kg.'].includes(unit);
            const isLibraUnit = ['libra', 'libras', 'lb', 'lbs', '500g'].includes(unit);
            
            let weightFactor = 1.0;
            if (isKgUnit) {
                weightFactor = 1.0;
            } else if (isLibraUnit) {
                weightFactor = 0.5;
            } else if (item.product?.weight_kg && Number(item.product.weight_kg) > 0) {
                weightFactor = Number(item.product.weight_kg);
            } else {
                weightFactor = 1.0;
            }
            return acc + (item.quantity * weightFactor);
        }, 0);
        setEditForm(prev => ({ ...prev, total_weight_kg: Number(total.toFixed(3)) }));
    };

    // --- PRODUCT SEARCH & VARIANT LOGIC ---

    const handleSearch = async (term: string) => {
        setSearchTerm(term);
        if (term.length < 2) {
            setSearchResults([]);
            return;
        }
        // Select options_config, variants, and pricing_model_prices
        const { data } = await supabase
            .from('products')
            .select('id, name, image_url, unit_of_measure, options_config, variants, pricing_model_prices(price, model_id)')
            .eq('is_active', true)
            .ilike('name', `%${term}%`)
            .limit(5);
        setSearchResults(data || []);
    };

    const handleProductResultClick = (product: any) => {
        // 1. Check if it has variants
        if (product.variants && product.variants.length > 0) {
            // Open Modal
            setSelectedProductForModal(product);
            setSelectedOptions({});
            setModalQuantity(1);
        } else {
            // Add Directly
            addProductToEditList(product, 1, null, null);
        }
        setSearchTerm('');
        setSearchResults([]);
    };

    const handleConfirmModal = () => {
        if (!selectedProductForModal) return;

        // Construct Variant Label (e.g. "Verde, Grande")
        const variantLabel = Object.values(selectedOptions).join(', ');

        addProductToEditList(
            selectedProductForModal,
            modalQuantity,
            selectedOptions,
            variantLabel
        );

        setSelectedProductForModal(null);
    };

    const addProductToEditList = (product: any, qty: number, options: any, label: any) => {
        const modelPrice = product.pricing_model_prices?.find((pmp: any) => pmp.model_id === 'd90a91e5-827c-473d-9d4f-3e28c7c91e15')?.price
            || product.pricing_model_prices?.[0]?.price
            || 0;
        const price = Number(modelPrice) || 0;

        const newItem: OrderItem = {
            id: null, // New items don't have an ID yet
            order_id: id as string, // Ensure id is string
            product_id: product.id,
            quantity: qty,
            unit_price: price, // Use Correct Price
            product: product, // For display
            selected_options: options, // Store options json
            variant_label: label || null,
            nickname: label || null,
        };

        // Append
        const updatedList = [...editItems, newItem];
        setEditItems(updatedList);
        recalculateWeight(updatedList);
    };

    // --- SAVE CHANGES ---

    const handleSaveChanges = async () => {
        setSaving(true);
        try {
            const newTotal = editItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

            // Sync Items
            const originalIds = items.map(i => i.id).filter((item_id): item_id is string => item_id !== null);
            const currentIds = editItems.map(i => i.id).filter((item_id): item_id is string => item_id !== null);
            const toDelete = originalIds.filter(id => !currentIds.includes(id));

            const upsertPayload = editItems.map(item => ({
                ...(item.id ? { id: item.id } : {}),
                order_id: id as string,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                nickname: item.nickname || item.variant_label || null,
                variant_label: item.variant_label || item.nickname || null
            }));

            const { data: { user: authUser } } = await supabase.auth.getUser();

            // Llamada segura al backend para actualización atómica sin bloqueo de RLS
            const response = await fetch('/api/orders/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: id,
                    updates: {
                        delivery_date: editForm.delivery_date,
                        delivery_slot: editForm.delivery_slot,
                        shipping_address: editForm.shipping_address,
                        admin_notes: editForm.admin_notes !== undefined ? editForm.admin_notes : order?.admin_notes,
                        total: newTotal,
                        total_weight_kg: editForm.total_weight_kg,
                        status: editForm.status
                    },
                    idsToDelete: toDelete,
                    itemsToUpsert: upsertPayload,
                    auditLog: {
                        changed_by: authUser?.id || null,
                        reason: `Edición manual en detalle de orden por ${userEmail || 'Usuario'}`
                    }
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Error al persistir cambios');
            }

            alert(`Cambios guardados exitosamente por ${userEmail || 'Usuario'}`);

            setIsEditing(false);
            fetchOrderDetails();

        } catch (e: any) {
            console.error(e);
            alert('Error guardando cambios: ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    const updateStatus = async (newStatus: string) => {
        try {
            await supabase.from('orders').update({ status: newStatus }).eq('id', id as string);
            setOrder(prev => prev ? { ...prev, status: newStatus } : null);
        } catch (e) { console.error(e); }
    };

    // --- RENDER HELPERS ---

    const formatVariantLabel = (options: Record<string, string> | null | undefined) => {
        if (!options) return '';
        return Object.values(options).join(', ');
    };

    const getDisplayStatus = (status: string) => {
        const map: any = {
            'pending_approval': 'POR APROBAR',
            'para_compra': 'PARA COMPRA',
            'approved': 'APROBADO',
            'picking': 'EN ALISTAMIENTO',
            'shipped': 'EN TRANSPORTE',
            'in_transit': 'EN TRÁNSITO',
            'delivered': 'ENTREGADO',
            'cancelled': 'CANCELADO'
        };
        return map[status] || status.toUpperCase();
    };
    const getStatusBadgeStyle = (status: string) => {
        switch (status) {
            case 'pending_approval':
                return { bg: '#FFFBEB', text: '#B45309', border: '#FDE68A', dot: '#F59E0B' };
            case 'para_compra':
                return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#3B82F6' };
            case 'approved':
                return { bg: '#ECFDF5', text: '#047857', border: '#A7F3D0', dot: '#10B981' };
            case 'picking':
            case 'shipped':
            case 'in_transit':
                return { bg: '#EFF6FF', text: '#1E40AF', border: '#93C5FD', dot: '#2563EB' };
            case 'delivered':
                return { bg: '#DCFCE7', text: '#166534', border: '#86EFAC', dot: '#16A34A' };
            case 'cancelled':
                return { bg: '#FEF2F2', text: '#991B1B', border: '#FECACA', dot: '#EF4444' };
            default:
                return { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1', dot: '#64748B' };
        }
    };

    if (loading || !order) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.9rem', fontWeight: '700' }}>
                Cargando expediente del pedido...
            </div>
        );
    }

    const totalToDisplay = isEditing
        ? editItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0)
        : order.total;

    const repInfo = getOrderReplacementInfo(order);
    const statusStyle = getStatusBadgeStyle(order.status);

    // Branch Schedule & Restrictions extraction
    const logData = order.profile?.logistics_data || order.logistics_data || {};
    const win0 = Array.isArray(logData?.windows) && logData.windows.length > 0 ? logData.windows[0] : null;
    const branchWindowLabel = `${win0?.startTime || logData?.start_time || '06:30'} - ${win0?.endTime || logData?.end_time || '11:00'}`;
    const branchRestrictionsText = (typeof order.profile?.delivery_restrictions === 'string' && order.profile.delivery_restrictions.trim() !== '')
        ? order.profile.delivery_restrictions.trim()
        : (typeof logData?.special_notes === 'string' && logData.special_notes.trim() !== ''
            ? logData.special_notes.trim()
            : 'Horario Estándar de Recepción');

    // Clean human notes without internal bracket tags for structured display
    const rawAdminNotes = order.admin_notes || '';
    const swapLineMatch = rawAdminNotes.match(/\[TRUEQUE\s*\/\s*AJUSTE DE CANASTA:\s*([^\]]+)\]/i);
    const cleanHumanNotes = rawAdminNotes
        .replace(/\[REPOSICIÓN DE GARANTÍA[^\]]*\]/gi, '')
        .replace(/\[PEDIDO HIJO DE[^\]]*\]/gi, '')
        .replace(/\[HIJO_REPOSICION_D1:[^\]]*\]/gi, '')
        .replace(/\[TRUEQUE\s*\/\s*AJUSTE DE CANASTA:[^\]]*\]/gi, '')
        .replace(/Programado para \d{4}-\d{2}-\d{2}[^\n]*\./gi, '')
        .replace(/^\s*Notas:\s*/gim, '')
        .trim();

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', paddingBottom: '4rem' }}>
            <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '1.5rem 2rem' }}>
                {/* 1. TOP NAVIGATION BAR */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '12px' }}>
                    <Link
                        href="/admin/orders/loading"
                        style={{
                            color: '#475569',
                            backgroundColor: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '10px',
                            padding: '7px 14px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
                        }}
                    >
                        <ArrowLeft size={15} strokeWidth={2} /> Volver al Listado de Pedidos
                    </Link>
                    {(repInfo.isReplacement || resolvedChildOrders.length > 0) && (
                        <Link
                            href="/admin/customer-service"
                            style={{
                                color: '#065F46',
                                backgroundColor: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                borderRadius: '10px',
                                padding: '7px 14px',
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                fontSize: '0.8rem',
                                fontWeight: 800
                            }}
                        >
                            <ShieldCheck size={15} /> Volver a Consola de Calidad (SAC)
                        </Link>
                    )}
                </div>

                {/* 2. LINEAGE & AUDIT BANNERS (FRUFRESCO EMERALD & SLATE PRECISION) */}
                {repInfo.isReplacement && (
                    <div style={{
                        marginBottom: '1.25rem',
                        padding: '1rem 1.25rem',
                        backgroundColor: '#F0FDF4',
                        border: '1px solid #86EFAC',
                        borderLeft: '5px solid #0D7A57',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap',
                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.06)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{
                                width: '38px',
                                height: '38px',
                                borderRadius: '10px',
                                backgroundColor: '#0D7A57',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                color: '#FFFFFF'
                            }}>
                                <RotateCcw size={18} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', color: '#064E3B', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                        Pedido Hijo de Reposición por Garantía de Calidad ($0 COP)
                                    </span>
                                    <span style={{
                                        backgroundColor: '#059669',
                                        color: '#FFFFFF',
                                        fontSize: '0.65rem',
                                        fontWeight: '800',
                                        padding: '2px 8px',
                                        borderRadius: '6px',
                                        textTransform: 'uppercase'
                                    }}>
                                        Sin Cobro en Remisión
                                    </span>
                                    {swapLineMatch && (
                                        <span style={{
                                            backgroundColor: '#FEF3C7',
                                            color: '#92400E',
                                            border: '1px solid #FDE68A',
                                            fontSize: '0.65rem',
                                            fontWeight: '800',
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            textTransform: 'uppercase'
                                        }}>
                                            Trueque / Cambio Autorizado
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#065F46', marginTop: '3px', fontWeight: '600' }}>
                                    Ampara el Pedido Padre <strong>{repInfo.parentSequenceId ? `#${repInfo.parentSequenceId}` : 'original'}</strong>
                                    {repInfo.sourcePqrId ? ` • Caso PQR #${repInfo.sourcePqrId.substring(0, 8)}` : ''}
                                    {` • Despacho programado: ${order.delivery_date} (${branchWindowLabel})`}
                                </div>
                                {swapLineMatch && (
                                    <div style={{ fontSize: '0.73rem', color: '#047857', marginTop: '3px', fontWeight: '700' }}>
                                        Ajuste de canasta: {swapLineMatch[1]}
                                    </div>
                                )}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                            {(resolvedParentOrder?.id || repInfo.parentOrderId) && (
                                <Link
                                    href={`/admin/orders/${resolvedParentOrder?.id || repInfo.parentOrderId}`}
                                    style={{
                                        backgroundColor: '#0D7A57',
                                        color: '#FFFFFF',
                                        border: '1px solid #065F46',
                                        borderRadius: '9px',
                                        padding: '7px 13px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <ExternalLink size={13} />
                                    Ver Pedido Padre #{repInfo.parentSequenceId || resolvedParentOrder?.sequence_id}
                                </Link>
                            )}
                            <Link
                                href="/admin/customer-service"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    color: '#065F46',
                                    border: '1px solid #86EFAC',
                                    borderRadius: '9px',
                                    padding: '7px 13px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <ShieldCheck size={13} />
                                Consola SAC
                            </Link>
                        </div>
                    </div>
                )}

                {!repInfo.isReplacement && resolvedChildOrders.length > 0 && (
                    <div style={{
                        marginBottom: '1.25rem',
                        padding: '1rem 1.25rem',
                        backgroundColor: '#F0FDF4',
                        border: '1px solid #86EFAC',
                        borderLeft: '5px solid #059669',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px',
                        flexWrap: 'wrap'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                backgroundColor: '#D1FAE5',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                color: '#059669'
                            }}>
                                <RotateCcw size={18} />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#065F46', textTransform: 'uppercase' }}>
                                    Trazabilidad de Garantía: Pedido Padre con Reposición Física ($0 COP)
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px', fontWeight: '600' }}>
                                    Este pedido generó {resolvedChildOrders.length === 1 ? 'el Pedido Hijo de Reposición' : 'los Pedidos Hijos de Reposición'} {resolvedChildOrders.map(c => `#${c.sequence_id}`).join(', ')} sin costo adicional.
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                            {resolvedChildOrders.map(child => (
                                <Link
                                    key={child.id}
                                    href={`/admin/orders/${child.id}`}
                                    style={{
                                        backgroundColor: '#0D7A57',
                                        color: '#FFFFFF',
                                        border: '1px solid #065F46',
                                        borderRadius: '9px',
                                        padding: '7px 13px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <ExternalLink size={13} />
                                    Ver Pedido Hijo #{child.sequence_id}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {(() => {
                    const cnMatch = rawAdminNotes.match(/\[NOTA_CREDITO_PQR\s*#([a-zA-Z0-9-]+)\s*\|\s*NC:\s*([^\s|]+)\s*\|\s*FACTURA_REF:\s*([^\s|]+)\s*\|\s*VALOR:\s*([^\]]+)\]/i);
                    const adjMatch = rawAdminNotes.match(/\[AJUSTE FACTURA PQR\s*#([a-zA-Z0-9-]+)\]:\s*([^\n]+)/i);
                    if (!cnMatch && !adjMatch) return null;

                    if (cnMatch) {
                        const [, pqrShort, ncNum, fvRef, valStr] = cnMatch;
                        return (
                            <div style={{
                                marginBottom: '1.25rem',
                                padding: '1rem 1.25rem',
                                backgroundColor: '#FAF5FF',
                                border: '1px solid #C4B5FD',
                                borderLeft: '5px solid #7C3AED',
                                borderRadius: '14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '16px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                    <div style={{
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '10px',
                                        backgroundColor: '#EDE9FE',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        color: '#7C3AED'
                                    }}>
                                        <FileText size={18} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#4C1D95' }}>
                                            TRAZABILIDAD CONTABLE SAC: Nota Crédito Emitida ({ncNum})
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#5B21B6', marginTop: '2px', fontWeight: '700' }}>
                                            Factura de Referencia: {fvRef} · Saldo Acreditado a Favor del Cliente: {valStr} · Caso PQR #{pqrShort}
                                        </div>
                                    </div>
                                </div>
                                <Link
                                    href="/admin/customer-service"
                                    style={{
                                        backgroundColor: '#7C3AED',
                                        color: '#FFFFFF',
                                        borderRadius: '8px',
                                        padding: '7px 13px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        textDecoration: 'none',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <ShieldCheck size={13} />
                                    Ver en Consola SAC
                                </Link>
                            </div>
                        );
                    }

                    return (
                        <div style={{
                            marginBottom: '1.25rem',
                            padding: '1rem 1.25rem',
                            backgroundColor: '#FFFBEB',
                            border: '1px solid #FDE68A',
                            borderLeft: '5px solid #D97706',
                            borderRadius: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '16px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    backgroundColor: '#FEF3C7',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    color: '#D97706'
                                }}>
                                    <FileText size={18} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#92400E' }}>
                                        TRAZABILIDAD CONTABLE SAC: Factura Ajustada por PQR #{adjMatch?.[1]}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#B45309', marginTop: '2px', fontWeight: '700' }}>
                                        {adjMatch?.[2]}
                                    </div>
                                </div>
                            </div>
                            <Link
                                href="/admin/customer-service"
                                style={{
                                    backgroundColor: '#D97706',
                                    color: '#FFFFFF',
                                    borderRadius: '8px',
                                    padding: '7px 13px',
                                    fontSize: '0.75rem',
                                    fontWeight: '800',
                                    textDecoration: 'none',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <ShieldCheck size={13} />
                                Ver en Consola SAC
                            </Link>
                        </div>
                    );
                })()}

                {duplicateSiblings.length > 0 && (
                    <div style={{
                        marginBottom: '1.25rem',
                        padding: '1rem 1.25rem',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #F87171',
                        borderLeft: '5px solid #DC2626',
                        borderRadius: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                backgroundColor: '#FEE2E2',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}>
                                <AlertTriangle size={20} color="#DC2626" />
                            </div>
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '900', color: '#991B1B' }}>
                                    ALERTA OPERATIVA: Posible Pedido Duplicado
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#B91C1C', marginTop: '2px', fontWeight: '600' }}>
                                    Este pedido coincide en cliente, fecha de entrega y sede con {duplicateSiblings.map(s => `#${getFriendlyOrderId(s)}`).join(', ')}.
                                </div>
                                <div style={{ fontSize: '0.73rem', color: '#7F1D1D', marginTop: '2px' }}>
                                    Sede: {order.shipping_address || order.profile?.address} · Entrega: {order.delivery_date}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                            {duplicateSiblings.map(s => (
                                <Link
                                    key={s.id}
                                    href={`/admin/orders/${s.id}`}
                                    style={{
                                        backgroundColor: '#FFFFFF',
                                        color: '#B91C1C',
                                        border: '1px solid #F87171',
                                        borderRadius: '8px',
                                        padding: '7px 13px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        textDecoration: 'none',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <ExternalLink size={13} />
                                    Abrir Pedido #{getFriendlyOrderId(s)}
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* 3. UNIFIED EXECUTIVE HEADER CARD */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem 1.5rem',
                    marginBottom: '1.5rem',
                    boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.05)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '1.85rem',
                                    fontWeight: '900',
                                    color: '#0F172A',
                                    letterSpacing: '-0.02em'
                                }}>
                                    #{getFriendlyOrderId(order)}
                                </span>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '5px 12px',
                                    borderRadius: '999px',
                                    fontSize: '0.72rem',
                                    fontWeight: '900',
                                    backgroundColor: statusStyle.bg,
                                    color: statusStyle.text,
                                    border: `1px solid ${statusStyle.border}`,
                                    letterSpacing: '0.03em'
                                }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: statusStyle.dot }} />
                                    {getDisplayStatus(order.status)}
                                </span>
                                {order.sequence_id && (
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: '800',
                                        color: '#64748B',
                                        backgroundColor: '#F1F5F9',
                                        border: '1px solid #E2E8F0',
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        fontFamily: 'monospace'
                                    }}>
                                        Folio #{order.sequence_id}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', flexWrap: 'wrap', fontSize: '0.8rem', color: '#475569' }}>
                                <span style={{ fontWeight: '800', color: '#0F172A' }}>
                                    {order.profile?.company_name || 'Cliente Institucional'}
                                </span>
                                {order.profile?.contact_name && (
                                    <span>• {order.profile.contact_name}</span>
                                )}
                                <span>• Creado el {new Date(order.created_at).toLocaleString('es-CO')}</span>
                            </div>
                        </div>

                        {/* Actions Bar */}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {(() => {
                                const processedItemsCount = items.filter(item => item.product?.requires_label).length;
                                if (processedItemsCount > 0 && !isEditing) {
                                    return (
                                        <Link
                                            href={`/admin/orders/print-labels?ids=${order.id}`}
                                            target="_blank"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                backgroundColor: '#ECFDF5',
                                                color: '#065F46',
                                                border: '1px solid #A7F3D0',
                                                borderRadius: '10px',
                                                padding: '8px 14px',
                                                fontWeight: '800',
                                                fontSize: '0.78rem',
                                                textDecoration: 'none'
                                            }}
                                        >
                                            <Printer size={14} /> Etiquetas ({processedItemsCount})
                                        </Link>
                                    );
                                }
                                return null;
                            })()}

                            {order.document_url && !isEditing && (
                                <a
                                    href={order.document_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#EFF6FF',
                                        color: '#1D4ED8',
                                        border: '1px solid #BFDBFE',
                                        borderRadius: '10px',
                                        padding: '8px 14px',
                                        fontWeight: '800',
                                        fontSize: '0.78rem',
                                        textDecoration: 'none'
                                    }}
                                >
                                    <FileText size={14} /> Ver Anexo <ExternalLink size={11} />
                                </a>
                            )}

                            {!isEditing && (
                                <Link
                                    href={`/admin/orders/contingency-print?mode=remissions&orderIds=${order.id}`}
                                    target="_blank"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        backgroundColor: '#FFFFFF',
                                        color: '#0F172A',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '10px',
                                        padding: '8px 14px',
                                        fontWeight: '800',
                                        fontSize: '0.78rem',
                                        textDecoration: 'none',
                                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
                                    }}
                                    title="Imprimir remisión de entrega oficial para este pedido"
                                >
                                    <Printer size={14} /> Imprimir Remisión <ExternalLink size={11} />
                                </Link>
                            )}

                            {isEditable ? (
                                <button
                                    onClick={handleEditToggle}
                                    disabled={saving}
                                    style={{
                                        backgroundColor: isEditing ? '#EF4444' : '#0D7A57',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '10px',
                                        padding: '8px 16px',
                                        fontWeight: '800',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        boxShadow: isEditing ? 'none' : '0 2px 6px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    {isEditing ? 'Cancelar Edición' : <><Edit2 size={14} /> Editar Pedido</>}
                                </button>
                            ) : (
                                <div style={{
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    backgroundColor: '#F1F5F9',
                                    color: '#64748B',
                                    fontWeight: '800',
                                    fontSize: '0.76rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    border: '1px solid #E2E8F0'
                                }} title="La ventana de edición ha cerrado para este pedido.">
                                    <Lock size={13} /> Edición Cerrada
                                </div>
                            )}

                            {!isEditing && getDisplayStatus(order.status) === 'EN TRANSPORTE' && (
                                <button
                                    onClick={() => updateStatus('delivered')}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '10px',
                                        border: 'none',
                                        backgroundColor: '#10B981',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px'
                                    }}
                                >
                                    <CheckCircle2 size={14} /> Marcar Entregado
                                </button>
                            )}

                            {isEditing && (
                                <select
                                    value={editForm.status}
                                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                    style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #CBD5E1', fontWeight: '800', fontSize: '0.78rem', color: '#0F172A' }}
                                >
                                    <option value="pending_approval">POR APROBAR</option>
                                    <option value="para_compra">PARA COMPRA</option>
                                    <option value="approved">APROBADO</option>
                                    <option value="shipped">EN TRANSPORTE</option>
                                    <option value="delivered">ENTREGADO</option>
                                    <option value="cancelled">CANCELADO</option>
                                </select>
                            )}
                        </div>
                    </div>

                    {/* KPI Strip inside Header Card */}
                    <div style={{
                        marginTop: '1.15rem',
                        paddingTop: '1rem',
                        borderTop: '1px solid #F1F5F9',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(195px, 1fr))',
                        gap: '12px'
                    }}>
                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '9px 12px' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Calendar size={12} style={{ color: '#0D7A57' }} /> Fecha de Entrega
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0F172A', marginTop: '2px', fontFamily: 'monospace' }}>
                                {order.delivery_date}
                            </div>
                        </div>

                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '9px 12px' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Clock size={12} style={{ color: '#0D7A57' }} /> Horario Recepción Sucursal
                            </div>
                            <div style={{ fontSize: '0.88rem', fontWeight: '900', color: '#065F46', marginTop: '2px' }}>
                                {branchWindowLabel}
                            </div>
                            <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={branchRestrictionsText}>
                                {branchRestrictionsText}
                            </div>
                        </div>

                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '9px 12px' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Truck size={12} style={{ color: '#0D7A57' }} /> Aforo & Peso Total
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: '900', color: '#0F172A', marginTop: '2px', fontFamily: 'monospace' }}>
                                {formatNumber(order.total_weight_kg, 1)} kg <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B' }}>({items.length} {items.length === 1 ? 'línea' : 'líneas'})</span>
                            </div>
                        </div>

                        <div style={{
                            backgroundColor: repInfo.isReplacement ? '#ECFDF5' : '#F8FAFC',
                            border: repInfo.isReplacement ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                            borderRadius: '10px',
                            padding: '9px 12px'
                        }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: repInfo.isReplacement ? '#065F46' : '#64748B', textTransform: 'uppercase' }}>
                                Total Facturado en Remisión
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0D7A57', marginTop: '1px', fontFamily: 'monospace' }}>
                                {formatMoney(totalToDisplay)} {repInfo.isReplacement && <span style={{ fontSize: '0.68rem', fontWeight: '800' }}>(Garantía $0)</span>}
                            </div>
                        </div>
                    </div>
                </div>

                {isEditing && (
                    <div style={{ backgroundColor: '#FFFBEB', padding: '0.85rem 1.25rem', borderRadius: '12px', marginBottom: '1.25rem', border: '1px solid #FCD34D', color: '#92400E', fontWeight: '800', fontSize: '0.82rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}><AlertTriangle size={16} /> Modo Edición Activo. Recuerda guardar los cambios al finalizar.</span>
                    </div>
                )}

                {/* 4. MAIN 2-COLUMN WORKSPACE */}
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.85fr) minmax(320px, 1fr)', gap: '1.5rem', alignItems: 'start' }}>

                    {/* LEFT: PRODUCTS TABLE */}
                    <div>
                        <div style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{
                                padding: '0.9rem 1.25rem',
                                borderBottom: '1px solid #E2E8F0',
                                backgroundColor: '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '900', fontSize: '0.82rem', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                    <PackageOpen size={16} style={{ color: '#0D7A57' }} />
                                    <span>Canasta de Productos del Pedido</span>
                                </div>
                                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#475569', backgroundColor: '#E2E8F0', padding: '2px 9px', borderRadius: '999px' }}>
                                    {(isEditing ? editItems : items).length} {(isEditing ? editItems : items).length === 1 ? 'Producto' : 'Productos'}
                                </span>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid #E2E8F0', fontSize: '0.68rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        <th style={{ padding: '10px 16px', textAlign: 'left', width: '58px' }}>Ítem</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Descripción & Especificación</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Tarifa Unit.</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'right' }}>Cantidad</th>
                                        <th style={{ padding: '10px 16px', textAlign: 'right' }}>Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(isEditing ? editItems : items).map((item, i) => {
                                        const label = item.nickname;
                                        const hasValidImg = Boolean(
                                            item.product?.image_url &&
                                            item.product.image_url.trim() !== '' &&
                                            !item.product.image_url.includes('via.placeholder.com')
                                        );

                                        return (
                                            <tr key={i} style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: i % 2 === 1 ? '#FAFDFB' : '#FFFFFF' }}>
                                                <td style={{ padding: '12px 16px', width: '58px' }}>
                                                    {hasValidImg ? (
                                                        <img
                                                            src={item.product!.image_url}
                                                            alt={item.product?.name || 'Producto'}
                                                            loading="lazy"
                                                            style={{ width: '48px', height: '48px', borderRadius: '10px', objectFit: 'cover', border: '1px solid #E2E8F0' }}
                                                        />
                                                    ) : (
                                                        <div style={{
                                                            width: '48px',
                                                            height: '48px',
                                                            borderRadius: '10px',
                                                            backgroundColor: '#ECFDF5',
                                                            border: '1px solid #A7F3D0',
                                                            color: '#0D7A57',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: '900',
                                                            fontSize: '0.85rem'
                                                        }}>
                                                            {(item.product?.name || 'PR').substring(0, 2).toUpperCase()}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px' }}>
                                                    <div style={{ fontWeight: '800', color: '#0F172A', fontSize: '0.88rem' }}>
                                                        {item.product?.name || 'Producto'}
                                                        {(() => {
                                                            const spec = formatStructuredSpecification({
                                                                quantity: item.quantity,
                                                                unit: item.product?.unit_of_measure,
                                                                variant_label: item.variant_label,
                                                                nickname: item.nickname,
                                                                selected_options: item.selected_options
                                                            });
                                                            if (spec) return null;
                                                            if (label && label !== item.product?.name && !/^\d+\s*,\s*\d+/.test(label)) {
                                                                return (
                                                                    <span style={{ fontSize: '0.7rem', backgroundColor: '#FEF3C7', padding: '2px 7px', borderRadius: '5px', marginLeft: '8px', color: '#B45309', fontWeight: '700' }}>
                                                                        {label}
                                                                    </span>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                    <div style={{ fontSize: '0.73rem', color: '#64748B', marginTop: '2px', fontWeight: '600' }}>
                                                        Unidad de despacho: {item.product?.unit_of_measure || 'Kg'}
                                                        {repInfo.isReplacement && item.unit_price === 0 && (
                                                            <span style={{ marginLeft: '8px', color: '#059669', fontWeight: '800' }}>
                                                                • Garantía sin costo ($0 COP)
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'right', fontFamily: 'monospace', fontSize: '0.82rem', fontWeight: '700', color: '#475569', whiteSpace: 'nowrap' }}>
                                                    {formatMoney(item.unit_price)} / {item.product?.unit_of_measure || 'Kg'}
                                                </td>
                                                <td style={{ padding: '12px', textAlign: 'right' }}>
                                                    {isEditing ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.5"
                                                                value={item.quantity === 0 ? '' : item.quantity}
                                                                onFocus={e => e.currentTarget.select()}
                                                                onChange={(e) => {
                                                                    const raw = e.target.value.replace(/^0+(?=\d)/, '');
                                                                    if (raw !== e.target.value) e.target.value = raw;
                                                                    handleItemChange(i, 'quantity', raw === '' ? 0 : parseFloat(raw));
                                                                }}
                                                                style={{ width: '68px', padding: '5px 8px', border: '1px solid #CBD5E1', borderRadius: '6px', fontWeight: '800', textAlign: 'right' }}
                                                            />
                                                            <button onClick={() => handleRemoveItem(i)} style={{ border: 'none', background: '#FEF2F2', color: '#DC2626', padding: '5px', borderRadius: '6px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                                                            <div style={{ fontWeight: '900', color: '#0F172A', fontSize: '0.92rem', fontFamily: 'monospace' }}>
                                                                {formatNumber(item.quantity, 1)} {item.product?.unit_of_measure || 'Kg'}
                                                            </div>
                                                            {(() => {
                                                                const spec = formatStructuredSpecification({
                                                                    quantity: item.quantity,
                                                                    unit: item.product?.unit_of_measure,
                                                                    variant_label: item.variant_label,
                                                                    nickname: item.nickname,
                                                                    selected_options: item.selected_options
                                                                });
                                                                if (!spec) return null;
                                                                return (
                                                                    <span style={{
                                                                        fontSize: '0.68rem',
                                                                        color: '#047857',
                                                                        fontWeight: '800',
                                                                        backgroundColor: '#D1FAE5',
                                                                        border: '1px solid #6EE7B7',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '4px',
                                                                        whiteSpace: 'nowrap'
                                                                    }}>
                                                                        {spec}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'monospace', fontWeight: '900', fontSize: '0.9rem', color: item.unit_price === 0 ? '#059669' : '#0F172A' }}>
                                                    {formatMoney(item.unit_price * item.quantity)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ backgroundColor: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                                        <td colSpan={4} style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '800', fontSize: '0.8rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                            Total Facturado del Pedido
                                        </td>
                                        <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: '900', fontSize: '1.15rem', color: '#0D7A57', fontFamily: 'monospace' }}>
                                            {formatMoney(totalToDisplay)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>

                            {/* SEARCH ADD PRODUCT */}
                            {isEditing && (
                                <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '800', marginBottom: '0.4rem', color: '#475569', textTransform: 'uppercase' }}>Agregar Producto a la Canasta</div>
                                    <input
                                        placeholder="Buscar producto por nombre..."
                                        value={searchTerm}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem' }}
                                    />
                                    {searchResults.length > 0 && (
                                        <div style={{ marginTop: '0.5rem', backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', maxHeight: '160px', overflowY: 'auto' }}>
                                            {searchResults.map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => handleProductResultClick(p)}
                                                    style={{ padding: '8px 12px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '0.85rem', color: '#0F172A' }}>{p.name}</div>
                                                        {p.options_config && p.options_config.length > 0 && <span style={{ fontSize: '0.7rem', color: '#D97706' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Sparkles size={12} strokeWidth={1.5} /> Variantes</span></span>}
                                                    </div>
                                                    <span style={{ fontWeight: '900', color: '#0D7A57' }}>+ Agregar</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* SAVE BUTTON FOR EDITING */}
                        {isEditing && (
                            <div style={{ marginTop: '1.25rem' }}>
                                <button
                                    onClick={handleSaveChanges}
                                    disabled={saving}
                                    style={{
                                        width: '100%', padding: '0.9rem', backgroundColor: '#0D7A57', color: 'white',
                                        border: 'none', borderRadius: '12px', fontSize: '0.95rem', fontWeight: '800',
                                        cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 10px rgba(13, 122, 87, 0.25)'
                                    }}
                                >
                                    {saving ? 'Guardando...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Save size={15} /> Guardar Cambios del Pedido</span>}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* RIGHT: LOGISTICS, CLIENT & AUDIT NOTES */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                        {/* CARD 1: CLIENT & BRANCH */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '1.25rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.75rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.85rem' }}>
                                <User size={14} style={{ color: '#0D7A57' }} />
                                <span>Cliente & Sede Destino</span>
                            </div>
                            {order.profile ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ fontWeight: '900', fontSize: '0.95rem', color: '#0F172A', lineHeight: '1.3' }}>
                                        {order.profile.company_name}
                                    </div>
                                    {order.profile.nit && (
                                        <div style={{ fontSize: '0.73rem', fontWeight: '700', color: '#64748B', fontFamily: 'monospace' }}>
                                            NIT: {order.profile.nit}
                                        </div>
                                    )}
                                    {order.profile.contact_name && (
                                        <div style={{ color: '#334155', fontSize: '0.82rem', fontWeight: '600' }}>
                                            Contacto: <strong>{order.profile.contact_name}</strong>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.8rem', color: '#065F46', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '2px' }}>
                                        <Phone size={13} /> {order.profile.contact_phone || 'Sin teléfono registrado'}
                                    </div>
                                </div>
                            ) : (
                                <div style={{ color: '#64748B', fontStyle: 'italic', fontSize: '0.85rem' }}>Invitado / Sin Perfil</div>
                            )}
                        </div>

                        {/* CARD 2: LOGISTICS & RECEIVING WINDOW */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '1.25rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.75rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    <MapPin size={14} style={{ color: '#0D7A57' }} />
                                    <span>Logística & Ventana de Entrega</span>
                                </div>
                                {isEditing && <Edit2 size={13} style={{ color: '#0D7A57' }} />}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '3px' }}>
                                        Fecha Programada y Ventana de Sucursal
                                    </div>
                                    {isEditing ? (
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                            <input
                                                type="date"
                                                value={editForm.delivery_date}
                                                onChange={e => setEditForm({ ...editForm, delivery_date: e.target.value })}
                                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem', fontWeight: '700' }}
                                            />
                                            <select
                                                value={editForm.delivery_slot || 'AM'}
                                                onChange={e => setEditForm({ ...editForm, delivery_slot: e.target.value })}
                                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.8rem', fontWeight: '700' }}
                                            >
                                                <option value="AM">Mañana ({branchWindowLabel})</option>
                                                <option value="PM">Tarde</option>
                                            </select>
                                        </div>
                                    ) : (
                                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '8px 10px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                <span style={{ fontWeight: '900', fontSize: '0.88rem', color: '#0F172A', fontFamily: 'monospace' }}>
                                                    {order.delivery_date}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    color: '#065F46',
                                                    backgroundColor: '#DCFCE7',
                                                    border: '1px solid #86EFAC',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px'
                                                }}>
                                                    {branchWindowLabel}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '4px', fontWeight: '600' }}>
                                                {branchRestrictionsText}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#64748B', textTransform: 'uppercase', marginBottom: '3px' }}>
                                        Dirección Física de Descargue
                                    </div>
                                    {isEditing ? (
                                        <input
                                            type="text"
                                            value={editForm.shipping_address || ''}
                                            onChange={e => setEditForm({ ...editForm, shipping_address: e.target.value })}
                                            style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem' }}
                                        />
                                    ) : (
                                        <>
                                            <div style={{ fontWeight: '800', fontSize: '0.85rem', color: '#0F172A' }}>
                                                {order.shipping_address || order.profile?.address || 'Misma del cliente'}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '800',
                                                    fontFamily: 'monospace',
                                                    padding: '2px 7px',
                                                    borderRadius: '5px',
                                                    backgroundColor: (order.latitude || order.profile?.latitude) ? '#F0FDF4' : '#FFF1F2',
                                                    color: (order.latitude || order.profile?.latitude) ? '#15803D' : '#E11D48',
                                                    border: `1px solid ${(order.latitude || order.profile?.latitude) ? '#BBF7D0' : '#FFE4E6'}`
                                                }}>
                                                    LAT: {order.latitude ? order.latitude.toFixed(6) : (order.profile?.latitude ? order.profile.latitude.toFixed(6) : '--')}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '800',
                                                    fontFamily: 'monospace',
                                                    padding: '2px 7px',
                                                    borderRadius: '5px',
                                                    backgroundColor: (order.longitude || order.profile?.longitude) ? '#F0FDF4' : '#FFF1F2',
                                                    color: (order.longitude || order.profile?.longitude) ? '#15803D' : '#E11D48',
                                                    border: `1px solid ${(order.longitude || order.profile?.longitude) ? '#BBF7D0' : '#FFE4E6'}`
                                                }}>
                                                    LON: {order.longitude ? order.longitude.toFixed(6) : (order.profile?.longitude ? order.profile.longitude.toFixed(6) : '--')}
                                                </span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {isEditing && (
                                    <div>
                                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: '3px', fontWeight: '800', textTransform: 'uppercase' }}>
                                            Peso de Carga (kg)
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={editForm.total_weight_kg === 0 ? '' : editForm.total_weight_kg}
                                                onFocus={e => e.currentTarget.select()}
                                                onChange={e => setEditForm({ ...editForm, total_weight_kg: parseFloat(e.target.value) || 0 })}
                                                style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontWeight: '900', color: '#0D7A57' }}
                                            />
                                            <span style={{ fontWeight: '800', color: '#64748B', fontSize: '0.8rem' }}>kg</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* CARD 3: OBSERVACIONES & TRAZABILIDAD DEL PEDIDO */}
                        <div style={{ backgroundColor: '#FFFFFF', padding: '1.25rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px -4px rgba(15, 23, 42, 0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '0.75rem', fontWeight: '900', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem' }}>
                                <FileText size={14} style={{ color: '#0D7A57' }} />
                                <span>Dictamen & Observaciones Operativas</span>
                            </div>
                            {isEditing ? (
                                <div>
                                    <textarea
                                        value={editForm.admin_notes || ''}
                                        onChange={e => setEditForm({ ...editForm, admin_notes: e.target.value })}
                                        placeholder="Escribe notas operativas, referencias de entrega o instrucciones especiales..."
                                        rows={4}
                                        style={{
                                            width: '100%',
                                            padding: '0.75rem',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.82rem',
                                            lineHeight: '1.45',
                                            fontFamily: 'inherit',
                                            resize: 'vertical',
                                            outline: 'none',
                                            backgroundColor: '#FFFFFF',
                                            color: '#0F172A',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                    <p style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '4px' }}>
                                        * Visible en remisión de entrega, app de conductores y servicio al cliente.
                                    </p>
                                </div>
                            ) : (
                                cleanHumanNotes ? (
                                    <div style={{
                                        backgroundColor: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderLeft: '3px solid #0D7A57',
                                        borderRadius: '8px',
                                        padding: '0.75rem 0.9rem',
                                        color: '#1E293B',
                                        fontSize: '0.8rem',
                                        lineHeight: '1.45',
                                        whiteSpace: 'pre-wrap',
                                        fontWeight: '600'
                                    }}>
                                        {cleanHumanNotes}
                                    </div>
                                ) : (
                                    <div style={{ color: '#94A3B8', fontSize: '0.8rem', fontStyle: 'italic' }}>
                                        Sin observaciones adicionales registradas para este pedido.
                                    </div>
                                )
                            )}
                        </div>

                    </div>
                </div>
            </div>

            {/* --- VARIANT SELECTION MODAL --- */}
            {selectedProductForModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000, backdropFilter: 'blur(3px)'
                }} onClick={() => setSelectedProductForModal(null)}>

                    <div
                        style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '16px', width: '90%', maxWidth: '400px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', textAlign: 'center' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {selectedProductForModal.image_url && (
                             <img
                                 src={selectedProductForModal.image_url}
                                 alt={selectedProductForModal.name}
                                 style={{ width: '80px', height: '80px', borderRadius: '12px', objectFit: 'cover', marginBottom: '1rem', boxShadow: '0 4px 6px rgba(0,0,0,0.05)' }}
                             />
                        )}
                        <h3 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.5rem' }}>{selectedProductForModal.name}</h3>
                        <p style={{ color: '#6B7280', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Personaliza tu producto:</p>

                        {/* RENDER OPTIONS */}
                        {selectedProductForModal.options_config && selectedProductForModal.options_config
                            .map((opt: any) => {
                                const isRipeness = (opt.name || '').toLowerCase().includes('maduraci');
                                const values = isRipeness
                                    ? (opt.values || []).filter((v: string) => {
                                        const clean = (v.includes('|') ? v.split('|')[0] : v).trim().toLowerCase();
                                        return clean !== 'maduro' && clean !== 'madura';
                                    })
                                    : (opt.values || []);
                                return { ...opt, values };
                            })
                            .filter((opt: any) => opt.values && opt.values.length > 0)
                            .map((opt: any) => (
                            <div key={opt.name} style={{ marginBottom: '1rem', textAlign: 'left' }}>
                                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#4B5563', marginBottom: '0.3rem', textTransform: 'uppercase' }}>
                                    {opt.name}
                                </label>
                                <select
                                    value={selectedOptions[opt.name] || ''}
                                    onChange={(e) => setSelectedOptions((prev: any) => ({ ...prev, [opt.name]: e.target.value }))}
                                    style={{ width: '100%', padding: '0.7rem', border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '0.95rem', backgroundColor: '#F9FAFB' }}
                                >
                                    <option value="">Seleccionar {opt.name}...</option>
                                    {opt.values?.map((val: string) => (
                                        <option key={val} value={val}>{val}</option>
                                    ))}
                                </select>
                            </div>
                        ))}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '2rem 0' }}>
                            <button
                                onClick={() => setModalQuantity(Math.max(1, modalQuantity - 1))}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid #D1D5DB', backgroundColor: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                            >−</button>
                            <span style={{ fontSize: '1.4rem', fontWeight: '800', minWidth: '60px' }}>
                                {modalQuantity} {selectedProductForModal.unit_of_measure}
                            </span>
                            <button
                                onClick={() => setModalQuantity(modalQuantity + 1)}
                                style={{ width: '40px', height: '40px', borderRadius: '50%', border: 'none', backgroundColor: '#10B981', color: 'white', fontSize: '1.2rem', cursor: 'pointer' }}
                            >+</button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedProductForModal(null)}
                                style={{ padding: '0.8rem', borderRadius: '8px', border: '1px solid #D1D5DB', backgroundColor: 'white', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirmModal}
                                style={{ padding: '0.8rem', borderRadius: '8px', backgroundColor: '#111827', color: 'white', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                            >
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
