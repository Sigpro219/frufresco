'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    ShieldCheck, AlertTriangle, Camera, CheckCircle2, Loader2,
    Package, ArrowLeft, Send, UploadCloud, MessageCircle, FileText,
    Clock, Check, Store, Truck, Phone, User, Calendar, ExternalLink,
    Sparkles, RefreshCw, Scale, Info, ChevronRight, X
} from 'lucide-react';
import Link from 'next/link';

interface OrderItemDto {
    id: string;
    product_id: string;
    name: string;
    accounting_id: number | null;
    quantity: number;
    unit: string;
    category?: string | null;
}

interface OrderDto {
    id: string;
    sequence_id: number | null;
    delivery_date: string | null;
    status: string;
    client_name: string;
    shipping_address?: string | null;
}

const NOVELTY_TYPES = [
    { id: 'averia', label: 'Avería / Producto magullado o golpeado', short: 'Avería Física', icon: AlertTriangle, color: '#DC2626' },
    { id: 'fisiologia', label: 'Fisiología / Sobremaduro o pasado', short: 'Sobremaduro', icon: Sparkles, color: '#D97706' },
    { id: 'fitopatologia', label: 'Fitopatología / Pudrición o moho', short: 'Pudrición / Moho', icon: AlertTriangle, color: '#B91C1C' },
    { id: 'faltante', label: 'Faltante de kilos en pesaje / báscula', short: 'Faltante en Báscula', icon: Scale, color: '#0284C7' },
    { id: 'calibre', label: 'Calibre o especificación no conforme', short: 'Calibre Incorrecto', icon: Package, color: '#7C3AED' },
    { id: 'cadena_frio', label: 'Cadena de frío / Daño térmico o deshidratación', short: 'Daño Térmico', icon: Info, color: '#0891B2' },
    { id: 'otro', label: 'Otro motivo no especificado', short: 'Otro Motivo', icon: FileText, color: '#64748B' }
];

function PqrsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const orderIdParam = searchParams.get('id') || searchParams.get('order_id');

    // Estado de datos
    const [order, setOrder] = useState<OrderDto | null>(null);
    const [orderItems, setOrderItems] = useState<OrderItemDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Formulario de novedad
    const [reportType, setReportType] = useState<'product' | 'general'>('product');
    const [selectedItemId, setSelectedItemId] = useState<string>('');
    const [reasonId, setReasonId] = useState<string>(NOVELTY_TYPES[0].id);
    const [affectedQtyStr, setAffectedQtyStr] = useState<string>('1');
    const [description, setDescription] = useState<string>('');
    const [contactName, setContactName] = useState<string>('');
    const [contactPhone, setContactPhone] = useState<string>('');
    const [resolutionPref, setResolutionPref] = useState<'reposicion' | 'nota_credito'>('reposicion');

    // Fotografía
    const [photoBase64, setPhotoBase64] = useState<string | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // Búsqueda manual si no hay order_id
    const [lookupQuery, setLookupQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    // Envío y ticket
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [ticketResult, setTicketResult] = useState<{
        ticketCode: string;
        productName?: string;
        affectedQty?: number;
        unit?: string;
        resolutionPref: string;
        reason: string;
    } | null>(null);

    // Cargar orden vía API Route Agnóstica (Bypass de RLS seguro con Service Role)
    useEffect(() => {
        const fetchOrderData = async (targetId: string) => {
            setLoading(true);
            setErrorMsg(null);
            try {
                const res = await fetch(`/api/pqrs/order?id=${encodeURIComponent(targetId)}`);
                const json = await res.json();

                if (!res.ok || json.error) {
                    setErrorMsg(json.error || 'No se encontró el pedido especificado.');
                    setOrder(null);
                    setOrderItems([]);
                    return;
                }

                setOrder(json.order);
                setOrderItems(json.items || []);
                if (json.items && json.items.length > 0) {
                    setSelectedItemId(json.items[0].id);
                }
            } catch (err: any) {
                console.error('Error fetching order for PQRS:', err);
                setErrorMsg('Error de conexión al cargar la remisión. Intente de nuevo.');
            } finally {
                setLoading(false);
            }
        };

        if (orderIdParam) {
            fetchOrderData(orderIdParam);
        } else {
            setLoading(false);
        }
    }, [orderIdParam]);

    // Manejo de captura / subida de foto
    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const b64 = event.target?.result as string;
                setPhotoBase64(b64);
                setPhotoPreview(b64);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleClearPhoto = () => {
        setPhotoBase64(null);
        setPhotoPreview(null);
    };

    const selectedProduct = orderItems.find(i => i.id === selectedItemId);
    const selectedReasonObj = NOVELTY_TYPES.find(r => r.id === reasonId) || NOVELTY_TYPES[0];

    // Enviar reclamo a la API segura
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order?.id) return;
        setFormError(null);

        if (reportType === 'product') {
            if (!selectedProduct) {
                setFormError('Por favor selecciona el producto afectado.');
                return;
            }
            const numQty = parseFloat(affectedQtyStr.replace(',', '.'));
            if (isNaN(numQty) || numQty <= 0) {
                setFormError('Ingresa una cantidad válida mayor a cero.');
                return;
            }
            if (numQty > Number(selectedProduct.quantity)) {
                setFormError(`La cantidad afectada no puede superar lo despachado (${selectedProduct.quantity} ${selectedProduct.unit}).`);
                return;
            }
            if (!photoBase64) {
                setFormError('Por protocolo de calidad es obligatorio adjuntar una fotografía clara de la novedad.');
                return;
            }
        }

        if (!description.trim()) {
            setFormError('Por favor ingresa una breve descripción de lo ocurrido para la auditoría técnica.');
            return;
        }

        setSubmitting(true);
        try {
            const numQty = parseFloat(affectedQtyStr.replace(',', '.')) || 0;
            const res = await fetch('/api/pqrs/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: order.id,
                    report_type: reportType,
                    item_id: selectedProduct?.id,
                    product_id: selectedProduct?.product_id,
                    product_name: selectedProduct?.name,
                    reason: selectedReasonObj.label,
                    affected_qty: numQty,
                    unit: selectedProduct?.unit,
                    description: description.trim(),
                    contact_name: contactName.trim(),
                    contact_phone: contactPhone.trim(),
                    resolution_preference: resolutionPref,
                    photo_base64: photoBase64
                })
            });

            const result = await res.json();
            if (!res.ok || result.error) {
                throw new Error(result.error || 'Error al radicar la novedad.');
            }

            setTicketResult({
                ticketCode: result.ticket_code,
                productName: selectedProduct?.name,
                affectedQty: numQty,
                unit: selectedProduct?.unit,
                resolutionPref: result.resolution_preference,
                reason: selectedReasonObj.short
            });

        } catch (err: any) {
            console.error('Error submitting PQRS:', err);
            setFormError(err.message || 'Error al enviar la radicación. Verifique su conexión.');
        } finally {
            setSubmitting(false);
        }
    };

    // Búsqueda manual de pedido si se entra sin QR
    const handleSearchOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        const clean = lookupQuery.trim();
        if (!clean) return;

        setIsSearching(true);
        setErrorMsg(null);
        try {
            const res = await fetch(`/api/pqrs/order?id=${encodeURIComponent(clean)}`);
            const json = await res.json();
            if (res.ok && json.order) {
                setOrder(json.order);
                setOrderItems(json.items || []);
                if (json.items?.length > 0) setSelectedItemId(json.items[0].id);
            } else {
                setErrorMsg(json.error || 'No se encontró ninguna remisión con ese código.');
            }
        } catch (err) {
            setErrorMsg('Error al buscar el pedido.');
        } finally {
            setIsSearching(false);
        }
    };

    // Pantalla de Carga
    if (loading) {
        return (
            <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', textAlign: 'center' }}>
                <div style={{ width: '64px', height: '64px', borderRadius: '16px', backgroundColor: '#FFFFFF', border: '1px solid rgba(226, 232, 240, 0.8)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                    <Loader2 size={32} color="#0D7A57" className="pqrs-spin" />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#1E293B', margin: 0, fontFamily: 'var(--font-outfit), sans-serif' }}>
                    Verificando Protocolo de Calidad FruFresco
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '0.35rem', maxWidth: '300px', lineHeight: 1.45 }}>
                    Cargando la información oficial del despacho y los productos amparados...
                </p>
                <style jsx global>{`
                    .pqrs-spin { animation: pqrsSpin 1s linear infinite; }
                    @keyframes pqrsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
            </div>
        );
    }

    // Pantalla de Éxito / Certificado Digital
    if (ticketResult) {
        const friendlyNum = order?.sequence_id ? `#REM-${order.sequence_id}` : `#${order?.id?.slice(0, 8)}`;
        const waMessage = encodeURIComponent(
            `Hola FruFresco Calidad, acabo de radicar la garantía *${ticketResult.ticketCode}* sobre el pedido *${friendlyNum}*.\n` +
            `• Producto: ${ticketResult.productName || 'Novedad general'}\n` +
            `• Cantidad: ${ticketResult.affectedQty || ''} ${ticketResult.unit || ''}\n` +
            `• Motivo: ${ticketResult.reason}\n` +
            `• Compensación deseada: ${ticketResult.resolutionPref}\n` +
            `¿Me confirman la recepción y el trámite de reposición/ajuste?`
        );

        return (
            <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: 'clamp(1rem, 4vw, 2rem) 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowX: 'hidden', boxSizing: 'border-box' }}>
                <div style={{ width: '100%', maxWidth: '448px', backgroundColor: '#FFFFFF', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 20px 35px -10px rgba(15, 23, 42, 0.12)', overflow: 'hidden', animation: 'pqrsFadeIn 0.3s ease-out' }}>
                    {/* Header Verde Esmeralda */}
                    <div style={{ background: 'linear-gradient(135deg, #0D7A57 0%, #095C41 55%, #043E2C 100%)', color: '#FFFFFF', padding: '1.5rem', textAlign: 'center', position: 'relative' }}>
                        <div style={{ width: '56px', height: '56px', margin: '0 auto 0.75rem', backgroundColor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.22)', borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={32} color="#6EE7B7" strokeWidth={2.4} />
                        </div>
                        <span style={{ display: 'inline-block', padding: '0.25rem 0.75rem', backgroundColor: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '9999px', fontSize: '10px', fontFamily: 'monospace', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: '#D1FAE5' }}>
                            Protocolo Agro-Logístico Certificado
                        </span>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-outfit), sans-serif', margin: '0.5rem 0 0', color: '#FFFFFF' }}>
                            Garantía Radicada Exitosamente
                        </h2>
                        <p style={{ fontSize: '0.78rem', color: 'rgba(209, 250, 229, 0.9)', margin: '0.25rem 0 0' }}>
                            El reclamo ha sido vinculado en tiempo real a la Torre de Control
                        </p>
                    </div>

                    {/* Ficha del Ticket Oficial */}
                    <div style={{ padding: 'clamp(1rem, 4vw, 1.5rem)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '1rem', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block' }}>
                                Radicado Oficial de Calidad
                            </span>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '0.06em', color: '#0D7A57', marginTop: '4px', userSelect: 'all' }}>
                                {ticketResult.ticketCode}
                            </div>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', marginTop: '8px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9999px', fontSize: '11px', fontWeight: 600, color: '#92400E' }}>
                                <Clock size={12} color="#D97706" />
                                Auditoría técnica en curso
                            </div>
                        </div>

                        {/* Resumen */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem', color: '#475569', borderTop: '1px solid #F1F5F9', borderBottom: '1px solid #F1F5F9', padding: '0.85rem 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: '#94A3B8', fontWeight: 500 }}>Remisión amparada:</span>
                                <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1E293B' }}>{friendlyNum}</span>
                            </div>
                            {ticketResult.productName && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: '#94A3B8', fontWeight: 500 }}>Ítem auditado:</span>
                                    <span style={{ fontWeight: 700, color: '#1E293B', textAlign: 'right' }}>{ticketResult.productName}</span>
                                </div>
                            )}
                            {ticketResult.affectedQty && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ color: '#94A3B8', fontWeight: 500 }}>Volumen afectado:</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1E293B' }}>{ticketResult.affectedQty} {ticketResult.unit}</span>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span style={{ color: '#94A3B8', fontWeight: 500 }}>Preferencia:</span>
                                <span style={{ fontWeight: 600, color: '#065F46', backgroundColor: '#ECFDF5', padding: '2px 8px', borderRadius: '6px', border: '1px solid #D1FAE5' }}>
                                    {ticketResult.resolutionPref}
                                </span>
                            </div>
                        </div>

                        {/* Aviso Poka-Yoke de facturación */}
                        <div style={{ backgroundColor: 'rgba(255, 251, 235, 0.85)', border: '1px solid #FDE68A', borderRadius: '12px', padding: '0.75rem', display: 'flex', gap: '10px', fontSize: '12px', color: '#78350F', lineHeight: 1.5 }}>
                            <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <strong>Salvaguarda Contable:</strong> La línea de facturación de este ítem entra en pausa preventiva hasta que el equipo de Calidad formalice la reposición física o la Nota Crédito.
                            </div>
                        </div>

                        {/* Acciones */}
                        <div style={{ paddingTop: '0.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <a
                                href={`https://wa.me/573167022898?text=${waMessage}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ width: '100%', minHeight: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0.75rem 1rem', backgroundColor: '#25D366', color: '#FFFFFF', borderRadius: '12px', fontWeight: 700, fontSize: '0.9rem', textDecoration: 'none', boxSizing: 'border-box', boxShadow: '0 4px 12px rgba(37, 211, 102, 0.2)' }}
                            >
                                <MessageCircle size={18} />
                                Confirmar Trámite por WhatsApp
                            </a>

                            <Link
                                href="/"
                                style={{ width: '100%', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '0.65rem 1rem', backgroundColor: '#F1F5F9', color: '#334155', borderRadius: '12px', fontWeight: 600, fontSize: '0.82rem', textDecoration: 'none', boxSizing: 'border-box' }}
                            >
                                <ArrowLeft size={15} />
                                Finalizar y Salir
                            </Link>
                        </div>
                    </div>
                </div>
                <style jsx global>{`
                    @keyframes pqrsFadeIn { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: scale(1); } }
                `}</style>
            </main>
        );
    }

    // Pantalla de Búsqueda si no hay pedido especificado en URL
    if (!order) {
        return (
            <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: 'clamp(1rem, 4vw, 2rem) 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflowX: 'hidden', boxSizing: 'border-box' }}>
                <div style={{ width: '100%', maxWidth: '448px', backgroundColor: '#FFFFFF', borderRadius: '24px', border: '1px solid #E2E8F0', boxShadow: '0 10px 30px -10px rgba(15, 23, 42, 0.1)', padding: 'clamp(1.25rem, 4vw, 1.5rem)', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxSizing: 'border-box' }}>
                    <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '16px', backgroundColor: '#ECFDF5', border: '1px solid #D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', color: '#0D7A57' }}>
                            <ShieldCheck size={24} />
                        </div>
                        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'var(--font-outfit), sans-serif', color: '#0F172A', margin: 0 }}>
                            Portal Oficial de Garantías
                        </h1>
                        <p style={{ fontSize: '0.82rem', color: '#64748B', lineHeight: 1.5, margin: 0 }}>
                            Escanea el código QR de tu remisión física o ingresa el ID del pedido para radicar novedades de calidad.
                        </p>
                    </div>

                    <form onSubmit={handleSearchOrder} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div style={{ position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="Ej: 1573 o código de remisión"
                                value={lookupQuery}
                                onChange={(e) => setLookupQuery(e.target.value)}
                                className="pqrs-input"
                                style={{ width: '100%', padding: '0.75rem 2.5rem 0.75rem 1rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '12px', fontSize: '16px', fontWeight: 600, color: '#1E293B', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
                            />
                            {lookupQuery && (
                                <button
                                    type="button"
                                    onClick={() => setLookupQuery('')}
                                    aria-label="Limpiar búsqueda"
                                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', minWidth: '36px', minHeight: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isSearching || !lookupQuery.trim()}
                            style={{ width: '100%', minHeight: '46px', padding: '0.75rem 1rem', backgroundColor: '#0D7A57', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: (isSearching || !lookupQuery.trim()) ? 'not-allowed' : 'pointer', opacity: (isSearching || !lookupQuery.trim()) ? 0.55 : 1, boxSizing: 'border-box' }}
                        >
                            {isSearching ? <Loader2 size={16} className="pqrs-spin" /> : <ShieldCheck size={16} />}
                            Consultar Remisión
                        </button>
                    </form>

                    {errorMsg && (
                        <div style={{ padding: '0.75rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', fontSize: '0.8rem', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0 }} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '0.85rem', textAlign: 'center' }}>
                        <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: 0, lineHeight: 1.45 }}>
                            ¿Tienes la hoja física impresa? Busca el código QR rotulado <strong>&quot;Garantía &amp; PQRS&quot;</strong> en la parte inferior para acceder directamente.
                        </p>
                    </div>
                </div>
                <style jsx global>{`
                    .pqrs-spin { animation: pqrsSpin 1s linear infinite; }
                    @keyframes pqrsSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
            </main>
        );
    }

    // =========================================================================
    // Pantalla Principal: Formulario de Radicación de Alto Standing (FruFresco Luxury)
    // =========================================================================
    const friendlyNum = order.sequence_id ? `#REM-${order.sequence_id}` : `#${order.id.slice(0, 8)}`;

    return (
        <main className="pqrs-main" style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', padding: 'clamp(1rem, 3vw, 1.75rem) clamp(0.75rem, 3vw, 1.5rem)', overflowX: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ width: '100%', maxWidth: '520px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                
                {/* 1. Header de Autoridad & Ficha Institucional */}
                <header style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)', padding: 'clamp(1rem, 3.5vw, 1.25rem)', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '0.6rem' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '9999px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0', fontSize: '10px', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#0D7A57' }}>
                            <ShieldCheck size={14} color="#0D7A57" />
                            Garantía Agro-Logística Oficial
                        </div>
                        <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 700, color: '#334155', backgroundColor: '#F1F5F9', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                            {friendlyNum}
                        </span>
                    </div>

                    <h1 style={{ fontSize: 'clamp(1.1rem, 4vw, 1.3rem)', fontWeight: 700, fontFamily: 'var(--font-outfit), sans-serif', color: '#0F172A', margin: 0, lineHeight: 1.25 }}>
                        {order.client_name}
                    </h1>
                    
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem 1rem', fontSize: '0.78rem', color: '#64748B', marginTop: '0.5rem', fontWeight: 500 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Calendar size={14} color="#94A3B8" />
                            <span>Entrega: {order.delivery_date || 'Hoy'}</span>
                        </div>
                        {order.shipping_address && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, maxWidth: '100%' }}>
                                <Truck size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.shipping_address}</span>
                            </div>
                        )}
                    </div>
                </header>

                {/* 2. Formulario de Radicación */}
                <form onSubmit={handleSubmit} style={{ backgroundColor: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)', padding: 'clamp(1rem, 3.5vw, 1.25rem)', display: 'flex', flexDirection: 'column', gap: '1.25rem', boxSizing: 'border-box' }}>
                    
                    {/* Switcher de Tipo de Novedad */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Tipo de Novedad
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', backgroundColor: '#F1F5F9', padding: '4px', borderRadius: '12px' }}>
                            <button
                                type="button"
                                onClick={() => setReportType('product')}
                                style={{
                                    minHeight: '44px',
                                    padding: '0.5rem 0.65rem',
                                    borderRadius: '9px',
                                    border: 'none',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    backgroundColor: reportType === 'product' ? '#FFFFFF' : 'transparent',
                                    color: reportType === 'product' ? '#0D7A57' : '#64748B',
                                    boxShadow: reportType === 'product' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                }}
                            >
                                <Package size={15} />
                                Producto Afectado
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('general')}
                                style={{
                                    minHeight: '44px',
                                    padding: '0.5rem 0.65rem',
                                    borderRadius: '9px',
                                    border: 'none',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    backgroundColor: reportType === 'general' ? '#FFFFFF' : 'transparent',
                                    color: reportType === 'general' ? '#0D7A57' : '#64748B',
                                    boxShadow: reportType === 'general' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                }}
                            >
                                <Truck size={15} />
                                Novedad de Entrega
                            </button>
                        </div>
                    </div>

                    {/* Selector de Producto (si es reporte de producto) */}
                    {reportType === 'product' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Selecciona el Producto Despachado
                                </label>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#94A3B8' }}>
                                    {orderItems.length} ítems en remisión
                                </span>
                            </div>

                            <select
                                value={selectedItemId}
                                onChange={(e) => setSelectedItemId(e.target.value)}
                                className="pqrs-input"
                                style={{ width: '100%', minHeight: '44px', padding: '0.6rem 0.75rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '12px', fontSize: '16px', fontWeight: 600, color: '#1E293B', outline: 'none', boxSizing: 'border-box' }}
                            >
                                {orderItems.map((itm) => (
                                    <option key={itm.id} value={itm.id}>
                                        {itm.accounting_id ? `#${itm.accounting_id} ` : ''}{itm.name} — ({itm.quantity} {itm.unit})
                                    </option>
                                ))}
                            </select>

                            {selectedProduct && (
                                <div style={{ padding: '0.65rem 0.75rem', backgroundColor: '#ECFDF5', border: '1px solid #D1FAE5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.78rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', backgroundColor: '#0D7A57', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: '11px', flexShrink: 0 }}>
                                            {selectedProduct.accounting_id ? `#${selectedProduct.accounting_id}` : 'ITM'}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <span style={{ fontWeight: 700, color: '#1E293B', display: 'block', lineHeight: 1.25 }}>{selectedProduct.name}</span>
                                            <span style={{ fontSize: '11px', color: '#065F46' }}>Despacho oficial de entrega</span>
                                        </div>
                                    </div>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', backgroundColor: '#FFFFFF', padding: '3px 8px', borderRadius: '6px', border: '1px solid #A7F3D0', color: '#0D7A57', flexShrink: 0 }}>
                                        {selectedProduct.quantity} {selectedProduct.unit}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Diagnóstico de Calidad / Motivo */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Diagnóstico de Calidad / Motivo
                        </label>
                        <div className="pqrs-reasons-grid">
                            {NOVELTY_TYPES.map((nt) => {
                                const Icon = nt.icon;
                                const isSelected = reasonId === nt.id;
                                return (
                                    <button
                                        key={nt.id}
                                        type="button"
                                        onClick={() => setReasonId(nt.id)}
                                        style={{
                                            minHeight: '44px',
                                            padding: '0.5rem 0.6rem',
                                            borderRadius: '12px',
                                            textAlign: 'left',
                                            border: isSelected ? '1.5px solid #0D7A57' : '1px solid #E2E8F0',
                                            backgroundColor: isSelected ? 'rgba(13, 122, 87, 0.06)' : '#F8FAFC',
                                            color: isSelected ? '#0D7A57' : '#475569',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            cursor: 'pointer',
                                            minWidth: 0,
                                            transition: 'all 0.15s'
                                        }}
                                    >
                                        <Icon size={14} color={nt.color} style={{ flexShrink: 0 }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nt.short}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Cantidad Afectada (si es producto) */}
                    {reportType === 'product' && selectedProduct && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Cantidad Afectada / Reclamada
                                </label>
                                <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                                    Máximo permitido: {selectedProduct.quantity} {selectedProduct.unit}
                                </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={affectedQtyStr}
                                    onChange={(e) => {
                                        let raw = e.target.value.replace(/[^0-9.,]/g, '');
                                        setAffectedQtyStr(raw);
                                    }}
                                    className="pqrs-input"
                                    style={{ flex: 1, minHeight: '44px', padding: '0.6rem 0.75rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '12px', fontSize: '16px', fontFamily: 'monospace', fontWeight: 700, color: '#1E293B', textAlign: 'right', outline: 'none', boxSizing: 'border-box' }}
                                />
                                <span style={{ minHeight: '44px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 0.75rem', backgroundColor: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: '12px', fontSize: '0.8rem', fontFamily: 'monospace', fontWeight: 700, color: '#334155', minWidth: '54px', boxSizing: 'border-box' }}>
                                    {selectedProduct.unit}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Captura de Evidencia Fotográfica */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Fotografía de Evidencia (Obligatoria)
                        </label>
                        
                        {!photoPreview ? (
                            <label style={{ border: '2px dashed #CBD5E1', backgroundColor: '#F8FAFC', borderRadius: '16px', padding: '1.25rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                                <div style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', marginBottom: '0.5rem' }}>
                                    <Camera size={24} />
                                </div>
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#334155' }}>
                                    Tomar foto o subir desde galería
                                </span>
                                <span style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>
                                    JPG, PNG o WebP de alta resolución
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handlePhotoChange}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        ) : (
                            <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', border: '1px solid #E2E8F0', backgroundColor: '#0F172A' }}>
                                <img
                                    src={photoPreview}
                                    alt="Evidencia cargada"
                                    style={{ width: '100%', height: '180px', objectFit: 'cover', display: 'block' }}
                                />
                                <div style={{ position: 'absolute', bottom: '8px', left: '8px', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.65)', color: '#FFFFFF', fontSize: '11px', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <CheckCircle2 size={13} color="#34D399" />
                                    Evidencia lista para radicación
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClearPhoto}
                                    style={{ position: 'absolute', top: '8px', right: '8px', width: '36px', height: '36px', borderRadius: '50%', border: 'none', backgroundColor: 'rgba(220, 38, 38, 0.92)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                    title="Eliminar foto"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Solución Deseada por el Cliente */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Compensación Deseada
                        </label>
                        <div className="pqrs-two-col">
                            <button
                                type="button"
                                onClick={() => setResolutionPref('reposicion')}
                                style={{
                                    minHeight: '54px',
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: resolutionPref === 'reposicion' ? '1.5px solid #0D7A57' : '1px solid #E2E8F0',
                                    backgroundColor: resolutionPref === 'reposicion' ? 'rgba(13, 122, 87, 0.06)' : '#F8FAFC',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', marginBottom: '3px' }}>
                                    <RefreshCw size={14} color={resolutionPref === 'reposicion' ? '#0D7A57' : '#94A3B8'} />
                                    Reposición Express
                                </div>
                                <p style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.35, margin: 0 }}>
                                    Mercancía de reemplazo en el próximo corte de despacho.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setResolutionPref('nota_credito')}
                                style={{
                                    minHeight: '54px',
                                    padding: '0.75rem',
                                    borderRadius: '12px',
                                    border: resolutionPref === 'nota_credito' ? '1.5px solid #0D7A57' : '1px solid #E2E8F0',
                                    backgroundColor: resolutionPref === 'nota_credito' ? 'rgba(13, 122, 87, 0.06)' : '#F8FAFC',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 700, color: '#1E293B', marginBottom: '3px' }}>
                                    <FileText size={14} color={resolutionPref === 'nota_credito' ? '#0D7A57' : '#94A3B8'} />
                                    Nota Crédito
                                </div>
                                <p style={{ fontSize: '11px', color: '#64748B', lineHeight: 1.35, margin: 0 }}>
                                    Descuento monetario directo aplicado a la factura/remisión.
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* Explicación / Detalle de la Novedad */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Detalle de la Novedad
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Describe brevemente lo ocurrido (ej: Tomate magullado en la base de la canastilla, o faltante de 2 kilos al pesar)..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="pqrs-input"
                            style={{ width: '100%', padding: '0.75rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '12px', fontSize: '16px', color: '#1E293B', lineHeight: 1.5, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                        />
                    </div>

                    {/* Datos de Contacto */}
                    <div className="pqrs-two-col">
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                Nombre de quien reporta
                            </label>
                            <div style={{ position: 'relative' }}>
                                <User size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                <input
                                    type="text"
                                    placeholder="Chef / Almacenista"
                                    value={contactName}
                                    onChange={(e) => setContactName(e.target.value)}
                                    className="pqrs-input"
                                    style={{ width: '100%', minHeight: '44px', padding: '0.55rem 0.75rem 0.55rem 2.25rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '12px', fontSize: '16px', fontWeight: 500, color: '#1E293B', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                Teléfono / WhatsApp
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Phone size={15} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                <input
                                    type="tel"
                                    placeholder="310 000 0000"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    className="pqrs-input"
                                    style={{ width: '100%', minHeight: '44px', padding: '0.55rem 0.75rem 0.55rem 2.25rem', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '12px', fontSize: '16px', fontFamily: 'monospace', fontWeight: 500, color: '#1E293B', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Alerta de Error si ocurre */}
                    {formError && (
                        <div style={{ padding: '0.75rem', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '12px', fontSize: '0.8rem', color: '#B91C1C', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <AlertTriangle size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <span>{formError}</span>
                        </div>
                    )}

                    {/* Botón Primario de Radicación */}
                    <button
                        type="submit"
                        disabled={submitting}
                        style={{ width: '100%', minHeight: '48px', padding: '0.85rem 1rem', background: 'linear-gradient(90deg, #0D7A57 0%, #0A6346 100%)', color: '#FFFFFF', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.55 : 1, boxShadow: '0 8px 20px rgba(13, 122, 87, 0.2)', boxSizing: 'border-box' }}
                    >
                        {submitting ? (
                            <>
                                <Loader2 size={16} className="pqrs-spin" />
                                Radicando Garantía Oficial...
                            </>
                        ) : (
                            <>
                                <Send size={16} />
                                Radicar Garantía de Calidad
                            </>
                        )}
                    </button>

                </form>

                {/* Footer de Respaldo Institucional */}
                <footer style={{ textAlign: 'center', padding: '0.5rem 0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p style={{ fontSize: '11px', color: '#94A3B8', fontWeight: 500, margin: 0 }}>
                        Investments Cortes S.A.S. • Protocolo Oficial de Calidad FruFresco
                    </p>
                    <p style={{ fontSize: '10px', color: '#94A3B8', margin: 0 }}>
                        Línea de soporte al cliente: <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#64748B' }}>+57 316 702 2898</span>
                    </p>
                </footer>

            </div>

            <style jsx global>{`
                .pqrs-reasons-grid {
                    display: grid;
                    grid-template-columns: repeat(3, minmax(0, 1fr));
                    gap: 8px;
                }
                .pqrs-two-col {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 10px;
                }
                .pqrs-input:focus {
                    border-color: #0D7A57 !important;
                    background-color: #FFFFFF !important;
                    box-shadow: 0 0 0 3px rgba(13, 122, 87, 0.12);
                }
                .pqrs-spin {
                    animation: pqrsSpin 1s linear infinite;
                }
                @keyframes pqrsSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @media (max-width: 640px) {
                    .pqrs-reasons-grid {
                        grid-template-columns: repeat(2, minmax(0, 1fr));
                    }
                }
                @media (max-width: 520px) {
                    .pqrs-two-col {
                        grid-template-columns: 1fr;
                    }
                }
            `}</style>
        </main>
    );
}

export default function PqrsPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={32} color="#0D7A57" />
            </div>
        }>
            <PqrsContent />
        </Suspense>
    );
}
