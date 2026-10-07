'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
    ShieldCheck, AlertTriangle, Camera, CheckCircle2, Loader2,
    Package, ArrowLeft, Send, UploadCloud, MessageCircle, FileText,
    Clock, Check, Store, Truck, Phone, User, Calendar, ExternalLink
} from 'lucide-react';
import Link from 'next/link';

const NOVELTY_REASONS = [
    "Avería / Producto magullado o golpeado",
    "Fisiología / Sobremaduro o pasado",
    "Fitopatología / Pudrición o moho",
    "Error en montaje / Producto no solicitado en orden",
    "Faltante de kilos en pesaje",
    "Calibre o especificación incorrecta",
    "Cadena de frío / Daño térmico o deshidratación",
    "Error en precio o cobro",
    "Otro motivo"
];

function PqrsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderIdParam = searchParams.get('order_id');

    // State
    const [order, setOrder] = useState<any | null>(null);
    const [orderItems, setOrderItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // B2C / LocalStorage lookup if no orderId
    const [savedIdentity, setSavedIdentity] = useState<{
        name?: string;
        phone?: string;
        email?: string;
        identification?: string;
    } | null>(null);
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [lookupQuery, setLookupQuery] = useState('');
    const [isSearchingOrders, setIsSearchingOrders] = useState(false);

    // Form inputs
    const [reportType, setReportType] = useState<'product' | 'general'>('product');
    const [selectedItemId, setSelectedItemId] = useState('');
    const [reason, setReason] = useState(NOVELTY_REASONS[0]);
    const [affectedQty, setAffectedQty] = useState<number | ''>('');
    const [description, setDescription] = useState('');
    const [contactName, setContactName] = useState('');
    const [contactPhone, setContactPhone] = useState('');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // Submit state
    const [submitting, setSubmitting] = useState(false);
    const [ticketData, setTicketData] = useState<{
        ticketCode: string;
        productName?: string;
        qty?: number | string;
        unit?: string;
        reason?: string;
    } | null>(null);
    const [formError, setFormError] = useState<string | null>(null);

    const notifyError = (msg: string) => {
        setFormError(msg);
        if (typeof window !== 'undefined' && (window as any).showToast) {
            (window as any).showToast(msg, 'error');
        }
        setTimeout(() => {
            setFormError(prev => (prev === msg ? null : prev));
        }, 7000);
    };

    // Check localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const name = localStorage.getItem('checkout_name') || '';
            const phone = localStorage.getItem('checkout_phone') || '';
            const email = localStorage.getItem('checkout_email') || '';
            const id = localStorage.getItem('checkout_identification') || '';

            if (name || phone || email || id) {
                setSavedIdentity({ name, phone, email, identification: id });
                if (name && !contactName) setContactName(name);
                if (phone && !contactPhone) setContactPhone(phone);
            }
        }
    }, []);

    // Load order data
    useEffect(() => {
        const loadOrder = async (targetId: string) => {
            setLoading(true);
            setErrorMsg(null);
            try {
                const { data: orderData, error: orderErr } = await supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, status, delivery_date, total,
                        shipping_address, profile_id, admin_notes, special_notes,
                        profiles (id, company_name, contact_name, nit, phone, contact_phone)
                    `)
                    .eq('id', targetId)
                    .single();

                if (orderErr || !orderData) {
                    setErrorMsg('No se encontró el pedido especificado. Verifica el código escaneado.');
                    setOrder(null);
                    return;
                }

                setOrder(orderData);

                // Fetch items
                const { data: itemsData, error: itemsErr } = await supabase
                    .from('order_items')
                    .select('id, product_id, quantity, unit_price, nickname, variant_label, products(id, name, sku, unit_of_measure)')
                    .eq('order_id', targetId);

                if (!itemsErr && itemsData) {
                    setOrderItems(itemsData);
                    if (itemsData.length > 0) {
                        setSelectedItemId(itemsData[0].id);
                    }
                }

                // Pre-fill contact if empty
                if (!contactName) {
                    setContactName(orderData.profiles?.contact_name || orderData.customer_name || '');
                }
                if (!contactPhone) {
                    setContactPhone(orderData.profiles?.contact_phone || orderData.profiles?.phone || orderData.customer_phone || '');
                }

            } catch (err: any) {
                console.error('Error fetching order for PQRS:', err);
                setErrorMsg('Error al consultar los datos del pedido: ' + err.message);
            } finally {
                setLoading(false);
            }
        };

        if (orderIdParam) {
            loadOrder(orderIdParam);
        } else {
            // If no order_id param, try to load recent orders using localStorage identity
            const fetchRecentOrders = async () => {
                setLoading(true);
                try {
                    const phone = localStorage.getItem('checkout_phone');
                    const email = localStorage.getItem('checkout_email');

                    if (phone || email) {
                        const { data, error } = await supabase
                            .from('orders')
                            .select(`
                                id, sequence_id, status, delivery_date, total,
                                shipping_address, profile_id,
                                profiles:profile_id(id, company_name, contact_name, phone, contact_phone)
                            `)
                            .order('created_at', { ascending: false })
                            .limit(6);

                        if (!error && data) {
                            setRecentOrders(data);
                        }
                    }
                } catch (e) {
                    console.error('Error fetching recent orders:', e);
                } finally {
                    setLoading(false);
                }
            };

            fetchRecentOrders();
        }
    }, [orderIdParam]);

    // Manual lookup handler
    const handleSearchOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        const clean = lookupQuery.trim();
        if (!clean) return;

        setIsSearchingOrders(true);
        setErrorMsg(null);
        try {
            // Check if sequence_id (number) or UUID or phone
            let query = supabase
                .from('orders')
                .select(`
                    id, sequence_id, status, delivery_date, total,
                    shipping_address, profile_id,
                    profiles:profile_id (id, company_name, contact_name, phone, contact_phone)
                `)
                .order('created_at', { ascending: false })
                .limit(5);

            if (/^\d+$/.test(clean)) {
                query = query.eq('sequence_id', parseInt(clean, 10));
            } else if (clean.length > 25) {
                query = query.eq('id', clean);
            }

            const { data, error } = await query;
            if (error || !data || data.length === 0) {
                setErrorMsg('No encontramos pedidos coincidentes con: "' + clean + '".');
                setRecentOrders([]);
            } else {
                setRecentOrders(data);
            }
        } catch (e: any) {
            setErrorMsg('Error en la búsqueda: ' + e.message);
        } finally {
            setIsSearchingOrders(false);
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const selectedItem = orderItems.find(i => i.id === selectedItemId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order?.id) return;

        setFormError(null);

        if (reportType === 'product') {
            if (!selectedItemId) {
                notifyError('Por favor selecciona el producto afectado.');
                return;
            }
            if (!affectedQty || Number(affectedQty) <= 0) {
                notifyError('Por favor especifica la cantidad afectada.');
                return;
            }
            if (selectedItem && Number(affectedQty) > Number(selectedItem.quantity)) {
                notifyError(`La cantidad no puede superar lo despachado (${selectedItem.quantity} ${selectedItem.products?.unit_of_measure || 'unidades'}).`);
                return;
            }
            if (!photoFile) {
                notifyError('Por favor adjunta una fotografía del producto para soportar la garantía técnica de calidad.');
                return;
            }
        }

        if (!description.trim()) {
            notifyError('Por favor ingresa una breve explicación de lo ocurrido.');
            return;
        }

        setSubmitting(true);
        try {
            let uploadedPhotoUrl: string | null = null;

            // 1. Upload photo if selected
            if (photoFile) {
                const fileExt = photoFile.name.split('.').pop() || 'jpg';
                const fileName = `pqrs_${order.id}_${Date.now()}.${fileExt}`;
                const { error: uploadErr } = await supabase.storage
                    .from('delivery-evidence')
                    .upload(fileName, photoFile);

                if (!uploadErr) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('delivery-evidence')
                        .getPublicUrl(fileName);
                    uploadedPhotoUrl = publicUrl;
                } else {
                    const { error: fallbackErr } = await supabase.storage
                        .from('evidence-photos')
                        .upload(fileName, photoFile);
                    if (!fallbackErr) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('evidence-photos')
                            .getPublicUrl(fileName);
                        uploadedPhotoUrl = publicUrl;
                    }
                }
            }

            // 2. Insert into billing_returns if product-specific
            if (reportType === 'product' && selectedItem) {
                await supabase.from('billing_returns').insert({
                    order_id: order.id,
                    product_id: selectedItem.product_id || selectedItem.products?.id,
                    quantity_returned: Number(affectedQty),
                    reason: `[PQRS Móvil] ${reason}: ${description.trim()}`,
                    photo_url: uploadedPhotoUrl,
                    status: 'pending_review'
                });
            }

            // 3. Insert into customer_service_pqrs
            const prodName = selectedItem?.products?.name || (selectedItem?.nickname || 'Producto');
            const friendlyOrderNum = order.sequence_id ? `#REM-${order.sequence_id}` : `#${order.id.slice(0, 8)}`;
            const subject = reportType === 'product'
                ? `[Garantía Móvil] Reclamo en ${prodName} - Pedido ${friendlyOrderNum}`
                : `[Garantía Móvil] Novedad General de Entrega - Pedido ${friendlyOrderNum}`;

            const fullDescription = `Radicado vía Portal Móvil / QR de Remisión.\n` +
                `• Contacto de radicación: ${contactName} (Tel: ${contactPhone})\n` +
                (reportType === 'product'
                    ? `• Producto: ${prodName}\n• Motivo: ${reason}\n• Cantidad: ${affectedQty} ${selectedItem?.products?.unit_of_measure || 'und'}\n• Detalle: ${description.trim()}`
                    : `• Tipo: Novedad de Entrega\n• Motivo: ${reason}\n• Detalle: ${description.trim()}`);

            const { error: pqrErr } = await supabase.from('customer_service_pqrs').insert({
                client_id: order.profiles?.id || order.profile_id || null,
                order_id: order.id,
                type: 'reclamo',
                category: reportType === 'product' ? 'producto' : 'entrega',
                priority: 'normal',
                subject: subject,
                description: fullDescription,
                primary_photo_url: uploadedPhotoUrl,
                status: 'pending'
            });

            if (pqrErr) throw pqrErr;

            const ticketNumber = `PQR-2026-${order.sequence_id || Math.floor(1000 + Math.random() * 9000)}-${Date.now().toString().slice(-4)}`;
            setTicketData({
                ticketCode: ticketNumber,
                productName: reportType === 'product' ? prodName : undefined,
                qty: affectedQty || undefined,
                unit: selectedItem?.products?.unit_of_measure,
                reason: reason
            });

        } catch (err: any) {
            console.error('Error submitting PQRS:', err);
            notifyError('Error al radicar la novedad: ' + (err.message || 'Intente nuevamente.'));
        } finally {
            setSubmitting(false);
        }
    };

    // Render Loading
    if (loading) {
        return (
            <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem' }}>
                <Loader2 size={36} className="animate-spin" color="#0D7A57" />
                <p style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 600 }}>Cargando información del pedido y remisión...</p>
            </div>
        );
    }

    // Success Screen
    if (ticketData) {
        const orderNum = order?.sequence_id ? `#REM-${order.sequence_id}` : `#${order?.id?.slice(0, 8)}`;
        const waText = encodeURIComponent(
            `Hola FruFresco Calidad, acabo de radicar la garantía con radicado *${ticketData.ticketCode}* sobre el pedido *${orderNum}* (${ticketData.productName || 'Novedad general'}). ¿Me confirman el trámite?`
        );

        return (
            <div style={{ maxWidth: '540px', margin: '0 auto', padding: '1.5rem', minHeight: '85vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
                    padding: '2rem 1.5rem',
                    textAlign: 'center'
                }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: '#ECFDF5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 1.25rem',
                        color: '#059669'
                    }}>
                        <CheckCircle2 size={38} strokeWidth={2.3} />
                    </div>

                    <span style={{
                        display: 'inline-block',
                        padding: '3px 10px',
                        backgroundColor: '#F0FDF4',
                        color: '#065F46',
                        border: '1px solid #A7F3D0',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        marginBottom: '0.75rem',
                        letterSpacing: '0.04em'
                    }}>
                        RADICACIÓN EXITOSA
                    </span>

                    <h2 style={{ fontSize: '1.35rem', fontWeight: '900', color: '#0F172A', margin: '0 0 0.5rem', fontFamily: 'var(--font-outfit), sans-serif' }}>
                        Garantía Radicada Correctamente
                    </h2>

                    <div style={{
                        backgroundColor: '#F8FAFC',
                        border: '1px dashed #CBD5E1',
                        borderRadius: '12px',
                        padding: '1rem',
                        margin: '1.25rem 0',
                        textAlign: 'left'
                    }}>
                        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Número de Ticket Oficial</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#0D7A57', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                            {ticketData.ticketCode}
                        </div>
                        <div style={{ height: '1px', backgroundColor: '#E2E8F0', margin: '0.75rem 0' }}></div>
                        <div style={{ fontSize: '0.82rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div><strong>Pedido Asociado:</strong> {orderNum}</div>
                            {ticketData.productName && (
                                <div><strong>Ítem Afectado:</strong> {ticketData.productName} ({ticketData.qty} {ticketData.unit || 'und'})</div>
                            )}
                            <div><strong>Motivo:</strong> {ticketData.reason}</div>
                            <div><strong>Estado Inicial:</strong> <span style={{ color: '#D97706', fontWeight: '700' }}>En Auditoría Técnica</span></div>
                        </div>
                    </div>

                    <div style={{
                        backgroundColor: '#FEF3C7',
                        border: '1px solid #FDE68A',
                        borderRadius: '10px',
                        padding: '0.75rem',
                        fontSize: '0.78rem',
                        color: '#92400E',
                        lineHeight: 1.4,
                        marginBottom: '1.5rem',
                        textAlign: 'left'
                    }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <AlertTriangle size={16} color="#B45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <strong>Bloqueo preventivo de facturación:</strong> Este pedido ha sido puesto en pausa preventiva en el módulo de facturación hasta que Calidad confirme la reposición o ajuste correspondiente.
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <a
                            href={`https://wa.me/573167022898?text=${waText}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '0.75rem 1.25rem',
                                backgroundColor: '#25D366',
                                color: '#FFFFFF',
                                borderRadius: '12px',
                                textDecoration: 'none',
                                fontWeight: '800',
                                fontSize: '0.9rem',
                                boxShadow: '0 4px 12px rgba(37, 211, 102, 0.25)'
                            }}
                        >
                            <MessageCircle size={18} /> Notificar a Calidad por WhatsApp
                        </a>

                        <Link
                            href="/"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: '0.65rem 1rem',
                                backgroundColor: '#F1F5F9',
                                color: '#475569',
                                borderRadius: '12px',
                                textDecoration: 'none',
                                fontWeight: '700',
                                fontSize: '0.85rem'
                            }}
                        >
                            <ArrowLeft size={16} /> Volver al Inicio
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    // Selector Screen: When no specific order is loaded
    if (!order) {
        return (
            <div style={{ maxWidth: '580px', margin: '0 auto', padding: '1.5rem', minHeight: '80vh' }}>
                <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#065F46',
                        padding: '4px 12px',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: '800',
                        marginBottom: '0.75rem'
                    }}>
                        <ShieldCheck size={14} /> GESTIÓN DE CALIDAD Y GARANTÍAS
                    </div>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: '900', color: '#0F172A', margin: '0 0 0.5rem', fontFamily: 'var(--font-outfit), sans-serif' }}>
                        Radicación de Novedades & PQRS
                    </h1>
                    <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0 }}>
                        Ingresa el número de tu pedido o remisión física entregada para solicitar garantía o reporte de mermas.
                    </p>
                </div>

                {/* Search Form */}
                <form onSubmit={handleSearchOrder} style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
                    <input
                        type="text"
                        placeholder="Ej. #2045 o número de celular registrado"
                        value={lookupQuery}
                        onChange={(e) => setLookupQuery(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '0.75rem 1rem',
                            borderRadius: '12px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.9rem',
                            outline: 'none'
                        }}
                    />
                    <button
                        type="submit"
                        disabled={isSearchingOrders}
                        style={{
                            padding: '0.75rem 1.25rem',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: '800',
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        {isSearchingOrders ? <Loader2 size={16} className="animate-spin" /> : 'Buscar'}
                    </button>
                </form>

                {errorMsg && (
                    <div style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '10px',
                        color: '#991B1B',
                        fontSize: '0.82rem',
                        marginBottom: '1.25rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                        {errorMsg}
                    </div>
                )}

                {/* Recent Orders List if available */}
                {recentOrders.length > 0 && (
                    <div style={{ marginTop: '1rem' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
                            Tus Pedidos Recientes
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {recentOrders.map((ord) => {
                                const friendlyNum = ord.sequence_id ? `#REM-${ord.sequence_id}` : `#${ord.id.slice(0, 8)}`;
                                const isDelivered = ['delivered', 'recibido', 'completed', 'shipped', 'en_ruta'].includes(ord.status);

                                return (
                                    <div
                                        key={ord.id}
                                        style={{
                                            backgroundColor: '#FFFFFF',
                                            border: '1px solid #E2E8F0',
                                            borderRadius: '14px',
                                            padding: '1rem',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '0.95rem', fontWeight: '900', color: '#0F172A' }}>{friendlyNum}</span>
                                                <span style={{
                                                    fontSize: '0.68rem',
                                                    fontWeight: '700',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    backgroundColor: isDelivered ? '#ECFDF5' : '#FEF3C7',
                                                    color: isDelivered ? '#065F46' : '#92400E',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {ord.status}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Calendar size={13} /> {ord.delivery_date || 'Fecha por definir'}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                                                {ord.profiles?.company_name || ord.customer_name || 'Cliente'}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => router.push(`/pqrs?order_id=${ord.id}`)}
                                            style={{
                                                backgroundColor: '#0D7A57',
                                                color: '#FFFFFF',
                                                border: 'none',
                                                borderRadius: '10px',
                                                padding: '0.55rem 0.95rem',
                                                fontSize: '0.82rem',
                                                fontWeight: '800',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <ShieldCheck size={15} /> Radicar PQR
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Instructions Box */}
                <div style={{
                    marginTop: '2rem',
                    backgroundColor: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    fontSize: '0.82rem',
                    color: '#475569',
                    lineHeight: 1.5
                }}>
                    <div style={{ fontWeight: '800', color: '#1E293B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Store size={16} color="#0D7A57" /> ¿Recibiste tu pedido con remisión física?
                    </div>
                    Escanea directamente el <strong>código QR</strong> impreso en la parte inferior de la remisión entregada por el transportador. Este abrirá automáticamente la lista de productos de tu pedido sin necesidad de buscarlo manualmente.
                </div>
            </div>
        );
    }

    // Poka-Yoke: Check if order is in valid post-dispatch state
    const isUndelivered = ['draft', 'draft_saved', 'confirmed', 'alisto', 'pending'].includes(order.status);
    const friendlyOrderNum = order.sequence_id ? `#REM-${order.sequence_id}` : `#${order.id.slice(0, 8)}`;
    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';

    return (
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.5rem 1rem', minHeight: '85vh' }}>
            {/* Header */}
            <div style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                padding: '1.25rem',
                marginBottom: '1.25rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            backgroundColor: '#ECFDF5',
                            border: '1px solid #A7F3D0',
                            color: '#065F46',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            textTransform: 'uppercase',
                            marginBottom: '4px'
                        }}>
                            <ShieldCheck size={13} /> Radicación Móvil de Calidad
                        </div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0F172A', margin: 0, fontFamily: 'var(--font-outfit), sans-serif' }}>
                            Remisión {friendlyOrderNum}
                        </h1>
                        <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '2px' }}>
                            <strong>Destinatario:</strong> {clientName}
                        </div>
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '0.78rem', color: '#64748B' }}>
                        <div><strong>Fecha Entrega:</strong> {order.delivery_date}</div>
                        <div style={{ marginTop: '2px' }}>
                            <span style={{
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                backgroundColor: isUndelivered ? '#FEF3C7' : '#ECFDF5',
                                color: isUndelivered ? '#92400E' : '#065F46',
                                textTransform: 'uppercase'
                            }}>
                                {order.status}
                            </span>
                        </div>
                    </div>
                </div>

                {order.shipping_address && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9', fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Truck size={14} color="#94A3B8" /> {order.shipping_address}
                    </div>
                )}
            </div>

            {/* Poka-Yoke Warning if Order has not shipped */}
            {isUndelivered && (
                <div style={{
                    backgroundColor: '#FFFBEB',
                    border: '1.5px solid #FCD34D',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    marginBottom: '1.5rem',
                    color: '#92400E'
                }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <div>
                            <div style={{ fontWeight: '900', fontSize: '0.9rem', marginBottom: '4px' }}>
                                Pedido aún en preparación en planta
                            </div>
                            <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.4 }}>
                                Este pedido se encuentra en estado <strong>{order.status}</strong> y aún no ha sido despachado ni entregado en tus instalaciones. Las reclamaciones de calidad se radican una vez recibido el producto.
                            </p>
                            <p style={{ margin: '0 0 10px', fontSize: '0.82rem', lineHeight: 1.4 }}>
                                Si necesitas solicitar una cancelación o cambio antes de que salga el vehículo de ruta, contáctanos directamente a nuestra mesa de operaciones:
                            </p>
                            <a
                                href={`https://wa.me/573167022898?text=Hola%20FruFresco,%20tengo%20una%20novedad%20sobre%20mi%20pedido%20en%20preparaci%C3%B3n%20${friendlyOrderNum}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    backgroundColor: '#25D366',
                                    color: '#FFFFFF',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    fontWeight: '800',
                                    textDecoration: 'none'
                                }}
                            >
                                <MessageCircle size={15} /> Contactar a Operaciones por WhatsApp
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Form */}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* 1. Report Type Selection */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem'
                }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
                        1. ¿Qué tipo de novedad deseas reportar?
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <button
                            type="button"
                            onClick={() => setReportType('product')}
                            style={{
                                padding: '0.85rem 0.75rem',
                                borderRadius: '12px',
                                border: reportType === 'product' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                backgroundColor: reportType === 'product' ? '#ECFDF5' : '#FFFFFF',
                                color: reportType === 'product' ? '#065F46' : '#475569',
                                fontWeight: '800',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                textAlign: 'center'
                            }}
                        >
                            <Package size={20} color={reportType === 'product' ? '#0D7A57' : '#64748B'} />
                            Producto Específico (Avería / Calidad / Faltante)
                        </button>

                        <button
                            type="button"
                            onClick={() => setReportType('general')}
                            style={{
                                padding: '0.85rem 0.75rem',
                                borderRadius: '12px',
                                border: reportType === 'general' ? '2px solid #0D7A57' : '1px solid #CBD5E1',
                                backgroundColor: reportType === 'general' ? '#ECFDF5' : '#FFFFFF',
                                color: reportType === 'general' ? '#065F46' : '#475569',
                                fontWeight: '800',
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                textAlign: 'center'
                            }}
                        >
                            <Truck size={20} color={reportType === 'general' ? '#0D7A57' : '#64748B'} />
                            Novedad General de Entrega o Transporte
                        </button>
                    </div>
                </div>

                {/* 2. Product Picker (if product report) */}
                {reportType === 'product' && (
                    <div style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        padding: '1.25rem'
                    }}>
                        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                            2. Selecciona el producto afectado
                        </label>
                        <select
                            value={selectedItemId}
                            onChange={(e) => setSelectedItemId(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '10px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.88rem',
                                outline: 'none',
                                backgroundColor: '#F8FAFC',
                                fontWeight: '600',
                                color: '#1E293B'
                            }}
                        >
                            {orderItems.map((itm) => {
                                const pName = itm.products?.name || itm.nickname || 'Producto';
                                const uom = itm.products?.unit_of_measure || 'und';
                                return (
                                    <option key={itm.id} value={itm.id}>
                                        {pName} (Despachado: {itm.quantity} {uom})
                                    </option>
                                );
                            })}
                        </select>

                        {selectedItem && (
                            <div style={{
                                marginTop: '1rem',
                                padding: '0.75rem',
                                backgroundColor: '#F8FAFC',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Cantidad Despachada:</div>
                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>
                                        {selectedItem.quantity} {selectedItem.products?.unit_of_measure || 'unidades'}
                                    </div>
                                </div>

                                <div style={{ width: '150px' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#334155', marginBottom: '3px' }}>
                                        Cant. Afectada: *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        max={selectedItem.quantity}
                                        placeholder={`Máx ${selectedItem.quantity}`}
                                        value={affectedQty}
                                        onChange={(e) => setAffectedQty(e.target.value ? parseFloat(e.target.value) : '')}
                                        style={{
                                            width: '100%',
                                            padding: '0.5rem',
                                            borderRadius: '8px',
                                            border: '1px solid #CBD5E1',
                                            fontSize: '0.9rem',
                                            fontWeight: '700',
                                            color: '#0F172A',
                                            outline: 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. Novelty Reason (Taxonomy) */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem'
                }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                        3. Motivo de inconformidad (RCA)
                    </label>
                    <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.88rem',
                            outline: 'none',
                            backgroundColor: '#F8FAFC',
                            fontWeight: '600',
                            color: '#1E293B'
                        }}
                    >
                        {NOVELTY_REASONS.map((r, i) => (
                            <option key={i} value={r}>{r}</option>
                        ))}
                    </select>
                </div>

                {/* 4. Photo Evidence (Mandatory for Product claims) */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem'
                }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                        4. Evidencia fotográfica {reportType === 'product' ? '(Obligatoria para calidad)' : '(Opcional)'}
                    </label>

                    {photoPreview ? (
                        <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #CBD5E1' }}>
                            <img
                                src={photoPreview}
                                alt="Evidencia de calidad"
                                style={{ width: '100%', maxHeight: '240px', objectFit: 'cover', display: 'block' }}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    setPhotoFile(null);
                                    setPhotoPreview(null);
                                }}
                                style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    backgroundColor: 'rgba(15, 23, 42, 0.75)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    padding: '5px 10px',
                                    fontSize: '0.75rem',
                                    fontWeight: '700',
                                    cursor: 'pointer'
                                }}
                            >
                                Cambiar foto
                            </button>
                        </div>
                    ) : (
                        <label style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '1.5rem',
                            border: '2px dashed #CBD5E1',
                            borderRadius: '12px',
                            backgroundColor: '#F8FAFC',
                            cursor: 'pointer'
                        }}>
                            <Camera size={28} color="#0D7A57" style={{ marginBottom: '6px' }} />
                            <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0F172A' }}>
                                Tomar foto o subir de la galería
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                Fotografía nítida del producto afectado y etiqueta
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoSelect}
                                style={{ display: 'none' }}
                            />
                        </label>
                    )}
                </div>

                {/* 5. Detailed Description */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem'
                }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.5rem', letterSpacing: '0.04em' }}>
                        5. Detalle de lo sucedido
                    </label>
                    <textarea
                        rows={3}
                        placeholder="Describe cómo se recibió el producto (ej: golpeado en la base, sobremaduro en exceso, no coincidió con el pesaje en báscula...)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '10px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.88rem',
                            outline: 'none',
                            resize: 'none'
                        }}
                    />
                </div>

                {/* 6. Contact Information */}
                <div style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '1.25rem'
                }}>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', marginBottom: '0.75rem', letterSpacing: '0.04em' }}>
                        6. Datos de quien radica la novedad
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '3px' }}>
                                Nombre completo:
                            </label>
                            <input
                                type="text"
                                placeholder="Ej. Chef Carlos / Ecónomo"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.75rem', color: '#64748B', marginBottom: '3px' }}>
                                Teléfono / Celular de contacto:
                            </label>
                            <input
                                type="tel"
                                placeholder="Ej. 310 1234567"
                                value={contactPhone}
                                onChange={(e) => setContactPhone(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.65rem',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.85rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* Form Error Banner */}
                {formError && (
                    <div style={{
                        padding: '0.85rem 1rem',
                        borderRadius: '12px',
                        backgroundColor: '#FEF2F2',
                        border: '1.5px solid #FCA5A5',
                        color: '#991B1B',
                        fontSize: '0.86rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)'
                    }}>
                        <AlertTriangle size={18} style={{ flexShrink: 0, color: '#DC2626' }} />
                        <span style={{ flex: 1, lineHeight: 1.4 }}>{formError}</span>
                    </div>
                )}

                {/* Submit Action */}
                <button
                    type="submit"
                    disabled={submitting}
                    style={{
                        padding: '1rem',
                        backgroundColor: '#0D7A57',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '14px',
                        fontSize: '1rem',
                        fontWeight: '900',
                        cursor: submitting ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 14px rgba(13, 122, 87, 0.3)',
                        opacity: submitting ? 0.75 : 1
                    }}
                >
                    {submitting ? (
                        <>
                            <Loader2 size={18} className="animate-spin" /> Registrando Novedad...
                        </>
                    ) : (
                        <>
                            <Send size={18} /> Radicar PQRS & Solicitar Garantía
                        </>
                    )}
                </button>
            </form>
        </div>
    );
}

export default function PqrsPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={32} className="animate-spin" color="#0D7A57" />
            </div>
        }>
            <PqrsContent />
        </Suspense>
    );
}
