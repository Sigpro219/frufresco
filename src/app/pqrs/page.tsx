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
            <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200/80 shadow-md flex items-center justify-center mb-4">
                    <Loader2 className="w-8 h-8 text-[#0D7A57] animate-spin" />
                </div>
                <h3 className="text-base font-bold text-slate-800 tracking-tight font-['Space_Grotesk']">
                    Verificando Protocolo de Calidad FruFresco
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Cargando la información oficial del despacho y los productos amparados...
                </p>
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
            <main className="min-h-screen bg-[#F8FAFC] py-8 px-4 flex flex-col items-center justify-center">
                <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
                    {/* Header Verde Esmeralda */}
                    <div className="bg-gradient-to-br from-[#0D7A57] via-[#095C41] to-[#043E2C] text-white p-6 text-center relative">
                        <div className="w-14 h-14 mx-auto bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl flex items-center justify-center mb-3 shadow-inner">
                            <CheckCircle2 className="w-8 h-8 text-emerald-300" strokeWidth={2.4} />
                        </div>
                        <span className="inline-block px-3 py-1 bg-white/15 border border-white/25 rounded-full text-[10px] font-mono tracking-widest uppercase font-bold text-emerald-100">
                            Protocolo Agro-Logístico Certificado
                        </span>
                        <h2 className="text-xl font-bold font-['Space_Grotesk'] tracking-tight mt-2 text-white">
                            Garantía Radicada Exitosamente
                        </h2>
                        <p className="text-xs text-emerald-100/90 mt-1 font-['Inter']">
                            El reclamo ha sido vinculado en tiempo real a la Torre de Control
                        </p>
                    </div>

                    {/* Ficha del Ticket Oficial */}
                    <div className="p-6 space-y-4">
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-center">
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-['Space_Grotesk']">
                                Radicado Oficial de Calidad
                            </span>
                            <div className="text-2xl font-black font-mono tracking-wider text-[#0D7A57] mt-0.5 select-all">
                                {ticketResult.ticketCode}
                            </div>
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 mt-2 bg-amber-50 border border-amber-200 rounded-full text-[11px] font-semibold text-amber-800">
                                <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
                                Auditoría técnica en curso
                            </div>
                        </div>

                        {/* Resumen */}
                        <div className="space-y-2.5 text-xs text-slate-600 border-t border-b border-slate-100 py-3.5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-medium">Remisión amparada:</span>
                                <span className="font-mono font-bold text-slate-800">{friendlyNum}</span>
                            </div>
                            {ticketResult.productName && (
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-medium">Ítem auditado:</span>
                                    <span className="font-bold text-slate-800 text-right">{ticketResult.productName}</span>
                                </div>
                            )}
                            {ticketResult.affectedQty && (
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-400 font-medium">Volumen afectado:</span>
                                    <span className="font-mono font-bold text-slate-800">{ticketResult.affectedQty} {ticketResult.unit}</span>
                                </div>
                            )}
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-medium">Preferencia:</span>
                                <span className="font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                                    {ticketResult.resolutionPref}
                                </span>
                            </div>
                        </div>

                        {/* Aviso Poka-Yoke de facturación */}
                        <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex gap-2.5 text-[11px] text-amber-900 leading-relaxed">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                                <strong>Salvaguarda Contable:</strong> La línea de facturación de este ítem entra en pausa preventiva hasta que el equipo de Calidad formalice la reposición física o la Nota Crédito.
                            </div>
                        </div>

                        {/* Acciones */}
                        <div className="pt-2 space-y-2.5">
                            <a
                                href={`https://wa.me/573167022898?text=${waMessage}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#25D366] hover:bg-[#1EBE5D] text-white rounded-xl font-bold text-sm shadow-md shadow-emerald-500/10 transition-all"
                            >
                                <MessageCircle className="w-4 h-4" />
                                Confirmar Trámite por WhatsApp
                            </a>

                            <Link
                                href="/"
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition-colors"
                            >
                                <ArrowLeft className="w-3.5 h-3.5" />
                                Finalizar y Salir
                            </Link>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    // Pantalla de Búsqueda si no hay pedido especificado en URL
    if (!order) {
        return (
            <main className="min-h-screen bg-[#F8FAFC] py-8 px-4 flex flex-col items-center justify-center">
                <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-lg p-6 space-y-6">
                    <div className="text-center space-y-2">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto text-[#0D7A57]">
                            <ShieldCheck className="w-6 h-6" />
                        </div>
                        <h1 className="text-xl font-bold font-['Space_Grotesk'] text-slate-900 tracking-tight">
                            Portal Oficial de Garantías
                        </h1>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Escanea el código QR de tu remisión física o ingresa el ID del pedido para radicar novedades de calidad.
                        </p>
                    </div>

                    <form onSubmit={handleSearchOrder} className="space-y-3">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Ej: 1573 o código de remisión"
                                value={lookupQuery}
                                onChange={(e) => setLookupQuery(e.target.value)}
                                className="w-full pl-4 pr-10 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D7A57] focus:bg-white transition-all font-mono"
                            />
                            {lookupQuery && (
                                <button
                                    type="button"
                                    onClick={() => setLookupQuery('')}
                                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={isSearching || !lookupQuery.trim()}
                            className="w-full py-3 px-4 bg-[#0D7A57] hover:bg-[#0B6849] disabled:opacity-50 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                            {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            Consultar Remisión
                        </button>
                    </form>

                    {errorMsg && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                            {errorMsg}
                        </div>
                    )}

                    <div className="border-t border-slate-100 pt-4 text-center">
                        <p className="text-[11px] text-slate-400">
                            ¿Tienes la hoja física impresa? Busca el código QR rotulado <strong>"Garantía & PQRS"</strong> en la parte inferior para acceder directamente.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    // =========================================================================
    // Pantalla Principal: Formulario de Radicación de Alto Standing (FruFresco Luxury)
    // =========================================================================
    const friendlyNum = order.sequence_id ? `#REM-${order.sequence_id}` : `#${order.id.slice(0, 8)}`;

    return (
        <main className="min-h-screen bg-[#F8FAFC] py-6 px-4 sm:px-6">
            <div className="w-full max-w-lg mx-auto space-y-4">
                
                {/* 1. Header de Autoridad & Ficha Institucional */}
                <header className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                    
                    <div className="flex items-center justify-between gap-3 mb-2.5">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/70 text-[10px] font-extrabold tracking-wider uppercase text-[#0D7A57]">
                            <ShieldCheck className="w-3.5 h-3.5 text-[#0D7A57]" />
                            Garantía Agro-Logística Oficial
                        </div>
                        <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {friendlyNum}
                        </span>
                    </div>

                    <h1 className="text-lg sm:text-xl font-bold font-['Space_Grotesk'] text-slate-900 tracking-tight">
                        {order.client_name}
                    </h1>
                    
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-2 font-medium">
                        <div className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Entrega: {order.delivery_date || 'Hoy'}</span>
                        </div>
                        {order.shipping_address && (
                            <div className="flex items-center gap-1 truncate max-w-xs">
                                <Truck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className="truncate">{order.shipping_address}</span>
                            </div>
                        )}
                    </div>
                </header>

                {/* 2. Formulario de Radicación */}
                <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 sm:p-5 space-y-5">
                    
                    {/* Switcher de Tipo de Novedad */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 font-['Space_Grotesk']">
                            Tipo de Novedad
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-slate-100/80 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setReportType('product')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                    reportType === 'product'
                                        ? 'bg-white text-[#0D7A57] shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Package className="w-3.5 h-3.5" />
                                Producto Afectado
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('general')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                    reportType === 'general'
                                        ? 'bg-white text-[#0D7A57] shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Truck className="w-3.5 h-3.5" />
                                Novedad de Entrega
                            </button>
                        </div>
                    </div>

                    {/* Selector de Producto (si es reporte de producto) */}
                    {reportType === 'product' && (
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-['Space_Grotesk']">
                                    Selecciona el Producto Despachado
                                </label>
                                <span className="text-[11px] font-mono text-slate-400">
                                    {orderItems.length} ítems en remisión
                                </span>
                            </div>

                            <div className="relative">
                                <select
                                    value={selectedItemId}
                                    onChange={(e) => setSelectedItemId(e.target.value)}
                                    className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0D7A57] focus:bg-white"
                                >
                                    {orderItems.map((itm) => (
                                        <option key={itm.id} value={itm.id}>
                                            {itm.accounting_id ? `#${itm.accounting_id} ` : ''}{itm.name} — ({itm.quantity} {itm.unit})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {selectedProduct && (
                                <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-xl flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 rounded-lg bg-[#0D7A57] text-white flex items-center justify-center font-mono font-bold text-[11px]">
                                            {selectedProduct.accounting_id ? `#${selectedProduct.accounting_id}` : 'ITM'}
                                        </div>
                                        <div>
                                            <span className="font-bold text-slate-800 block leading-tight">{selectedProduct.name}</span>
                                            <span className="text-[11px] text-emerald-800">Despacho oficial de entrega</span>
                                        </div>
                                    </div>
                                    <span className="font-mono font-bold text-xs bg-white px-2 py-0.5 rounded border border-emerald-200 text-[#0D7A57]">
                                        {selectedProduct.quantity} {selectedProduct.unit}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Diagnóstico de Calidad / Motivo */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-['Space_Grotesk']">
                            Diagnóstico de Calidad / Motivo
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                            {NOVELTY_TYPES.map((nt) => {
                                const Icon = nt.icon;
                                const isSelected = reasonId === nt.id;
                                return (
                                    <button
                                        key={nt.id}
                                        type="button"
                                        onClick={() => setReasonId(nt.id)}
                                        className={`p-2 rounded-xl text-left border text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                                            isSelected
                                                ? 'bg-[#0D7A57]/5 border-[#0D7A57] text-[#0D7A57] ring-1 ring-[#0D7A57]'
                                                : 'bg-slate-50 border-slate-200/80 text-slate-600 hover:bg-slate-100/70'
                                        }`}
                                    >
                                        <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: nt.color }} />
                                        <span className="truncate">{nt.short}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Cantidad Afectada (si es producto) */}
                    {reportType === 'product' && selectedProduct && (
                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider font-['Space_Grotesk']">
                                    Cantidad Afectada / Reclamada
                                </label>
                                <span className="text-[11px] text-slate-400">
                                    Máximo permitido: {selectedProduct.quantity} {selectedProduct.unit}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={affectedQtyStr}
                                        onChange={(e) => {
                                            let raw = e.target.value.replace(/[^0-9.,]/g, '');
                                            setAffectedQtyStr(raw);
                                        }}
                                        className="w-full py-2.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0D7A57] focus:bg-white text-right"
                                    />
                                </div>
                                <span className="px-3 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-700 min-w-[50px] text-center">
                                    {selectedProduct.unit}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Captura de Evidencia Fotográfica */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-['Space_Grotesk']">
                            Fotografía de Evidencia (Obligatoria)
                        </label>
                        
                        {!photoPreview ? (
                            <label className="border-2 border-dashed border-slate-200 hover:border-[#0D7A57] bg-slate-50 hover:bg-emerald-50/30 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center cursor-pointer transition-all group">
                                <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-slate-200 flex items-center justify-center text-slate-500 group-hover:text-[#0D7A57] group-hover:scale-105 transition-all mb-2">
                                    <Camera className="w-6 h-6" />
                                </div>
                                <span className="text-xs font-bold text-slate-700 group-hover:text-[#0D7A57]">
                                    Tomar foto o subir desde galería
                                </span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                    JPG, PNG o WebP de alta resolución
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handlePhotoChange}
                                    className="hidden"
                                />
                            </label>
                        ) : (
                            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 group">
                                <img
                                    src={photoPreview}
                                    alt="Evidencia cargada"
                                    className="w-full h-44 object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                                />
                                <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white text-[10px] font-mono flex items-center gap-1.5">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                    Evidencia lista para radicación
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClearPhoto}
                                    className="absolute top-2 right-2 p-1.5 rounded-full bg-red-600/90 text-white hover:bg-red-700 transition-colors shadow-sm"
                                    title="Eliminar foto"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Solución Deseada por el Cliente */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-['Space_Grotesk']">
                            Compensación Deseada
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setResolutionPref('reposicion')}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    resolutionPref === 'reposicion'
                                        ? 'bg-[#0D7A57]/5 border-[#0D7A57] ring-1 ring-[#0D7A57]'
                                        : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/50'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-0.5">
                                    <RefreshCw className={`w-3.5 h-3.5 ${resolutionPref === 'reposicion' ? 'text-[#0D7A57]' : 'text-slate-400'}`} />
                                    Reposición Express
                                </div>
                                <p className="text-[10px] text-slate-500 leading-snug">
                                    Mercancía de reemplazo en el próximo corte de despacho.
                                </p>
                            </button>

                            <button
                                type="button"
                                onClick={() => setResolutionPref('nota_credito')}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                    resolutionPref === 'nota_credito'
                                        ? 'bg-[#0D7A57]/5 border-[#0D7A57] ring-1 ring-[#0D7A57]'
                                        : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100/50'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 mb-0.5">
                                    <FileText className={`w-3.5 h-3.5 ${resolutionPref === 'nota_credito' ? 'text-[#0D7A57]' : 'text-slate-400'}`} />
                                    Nota Crédito
                                </div>
                                <p className="text-[10px] text-slate-500 leading-snug">
                                    Descuento monetario directo aplicado a la factura/remisión.
                                </p>
                            </button>
                        </div>
                    </div>

                    {/* Explicación / Detalle de la Novedad */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider font-['Space_Grotesk']">
                            Detalle de la Novedad
                        </label>
                        <textarea
                            rows={3}
                            placeholder="Describe brevemente lo ocurrido (ej: Tomate magullado en la base de la canastilla, o faltante de 2 kilos al pesar)..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0D7A57] focus:bg-white leading-relaxed"
                        />
                    </div>

                    {/* Datos de Contacto */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                Nombre de quien reporta
                            </label>
                            <div className="relative">
                                <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="text"
                                    placeholder="Chef / Almacenista"
                                    value={contactName}
                                    onChange={(e) => setContactName(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0D7A57]"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[11px] font-bold text-slate-600 mb-1">
                                Teléfono / WhatsApp
                            </label>
                            <div className="relative">
                                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                                <input
                                    type="tel"
                                    placeholder="310 000 0000"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#0D7A57]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Alerta de Error si ocurre */}
                    {formError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 animate-in fade-in">
                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <span>{formError}</span>
                        </div>
                    )}

                    {/* Botón Primario de Radicación */}
                    <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3.5 px-4 bg-gradient-to-r from-[#0D7A57] to-[#0A6346] hover:from-[#0B6849] hover:to-[#08523A] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/10 transition-all disabled:opacity-50"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Radicando Garantía Oficial...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Radicar Garantía de Calidad
                            </>
                        )}
                    </button>

                </form>

                {/* Footer de Respaldo Institucional */}
                <footer className="text-center py-2 space-y-1">
                    <p className="text-[11px] text-slate-400 font-medium">
                        Investments Cortes S.A.S. • Protocolo Oficial de Calidad FruFresco
                    </p>
                    <p className="text-[10px] text-slate-400">
                        Línea de soporte al cliente: <span className="font-mono font-bold text-slate-500">+57 316 702 2898</span>
                    </p>
                </footer>

            </div>
        </main>
    );
}

export default function PqrsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-[#0D7A57] animate-spin" />
            </div>
        }>
            <PqrsContent />
        </Suspense>
    );
}
