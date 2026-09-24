'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft, Tag, Package, Sparkles, Scale, Building2, Calendar, Truck, Clock } from 'lucide-react';
import { PrintDocumentSwitcher } from '@/components/print';

interface OrderItemData {
    id: string;
    order_id: string;
    quantity: number;
    unit?: string;
    nickname?: string;
    variant_label?: string;
    product?: {
        id: string;
        name: string;
        sku?: string;
        requires_label?: boolean;
        accounting_id?: number | string | null;
        unit_of_measure?: string;
    } | null;
}

interface OrderData {
    id: string;
    sequence_id?: number;
    created_at: string;
    delivery_date: string;
    delivery_slot?: string;
    total: number;
    total_weight_kg: number;
    shipping_address?: string;
    warehouse_spaces?: number[];
    profiles?: {
        id?: string;
        company_name?: string;
        contact_name?: string;
        nit?: string;
        address?: string;
        phone?: string;
        contact_phone?: string;
    } | null;
    order_items?: OrderItemData[];
}

interface CrateLabelInfo {
    orderId: string;
    orderSequenceId: string;
    friendlyOrderId: string;
    clientName: string;
    branchName: string;
    shippingAddress: string;
    nit: string;
    deliveryDate: string;
    deliverySlot: string;
    bahiaLabel: string;
    totalWeightKg: number;
    crateNumber: number;
    totalCrates: number;
    qrPayload: string;
}

interface ProductLabelInfo {
    name: string;
    weight: string;
    lote: string;
    vencimiento: string;
    orderSequenceId: string;
    accountingId: string;
    clientName: string;
}

export default function BulkOrderPrintLabelsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(true);

    // Operational Label Settings
    const [labelType, setLabelType] = useState<'crate' | 'product'>('crate');
    const [cratesMode, setCratesMode] = useState<'auto' | 'single' | 'custom'>('auto');
    const [customMultiplier, setCustomMultiplier] = useState<number>(2);
    const [productFilterMode, setProductFilterMode] = useState<'requires_label' | 'all'>('all');

    // Date formatting helpers
    const getLoteDate = () => {
        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = String(now.getFullYear()).substring(2);
        return `${day}-${month}-${year}`;
    };

    const getExpirationDate = () => {
        const now = new Date();
        now.setDate(now.getDate() + 7);
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        return `${day}-${month}-${year}`;
    };

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const p = searchParams.get('date');
        if (p) return p;
        const now = new Date();
        return now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    });

    useEffect(() => {
        const fetchBulkLabelsData = async () => {
            // Unify query params: accept orderIds, ids or date
            const rawParam = searchParams.get('orderIds') || searchParams.get('ids') || '';
            const ids = rawParam.split(',').map(s => s.trim()).filter(Boolean);

            setLoading(true);
            try {
                // 1. Fetch orders with client profile
                let ordersQuery = supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, created_at, delivery_date, delivery_slot, total, total_weight_kg, 
                        shipping_address, warehouse_spaces, profile_id,
                        profiles:profile_id(id, company_name, contact_name, nit, address, phone, contact_phone)
                    `)
                    .order('created_at', { ascending: true });

                if (ids.length > 0) {
                    ordersQuery = ordersQuery.in('id', ids).neq('status', 'cancelled');
                } else {
                    const OPERATIONAL_STATUSES = ['para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'];
                    ordersQuery = ordersQuery.eq('delivery_date', selectedDate).in('status', OPERATIONAL_STATUSES);
                }

                const { data: ordersData, error: ordersErr } = await ordersQuery;

                if (ordersErr) {
                    console.error('Error fetching orders for labels:', ordersErr);
                    setLoading(false);
                    return;
                }

                const resolvedIds = (ordersData || []).map((o: any) => o.id);
                if (resolvedIds.length === 0) {
                    setOrders([]);
                    setLoading(false);
                    return;
                }

                // 2. Fetch order items with products
                const { data: itemsData, error: itemsErr } = await supabase
                    .from('order_items')
                    .select(`
                        id, order_id, quantity, unit, nickname, variant_label,
                        product:products (
                            id, name, sku, requires_label, accounting_id, unit_of_measure
                        )
                    `)
                    .in('order_id', resolvedIds);

                if (itemsErr) {
                    console.error('Error fetching order items for labels:', itemsErr);
                }

                const itemsByOrder: Record<string, OrderItemData[]> = {};
                (itemsData || []).forEach((item: any) => {
                    if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
                    itemsByOrder[item.order_id].push(item);
                });

                const compiledOrders: OrderData[] = (ordersData || []).map((o: any) => ({
                    ...o,
                    profiles: Array.isArray(o.profiles) ? o.profiles[0] : o.profiles,
                    order_items: itemsByOrder[o.id] || []
                }));

                setOrders(compiledOrders);
            } catch (err) {
                console.error('Error in fetchBulkLabelsData:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchBulkLabelsData();
    }, [searchParams, selectedDate]);

    // Generate Crate Labels (Mode 1: Dispatch & Warehouse Logistics)
    const crateLabels = useMemo<CrateLabelInfo[]>(() => {
        const list: CrateLabelInfo[] = [];

        orders.forEach(order => {
            const rawCompany = (order.profiles?.company_name || order.profiles?.contact_name || 'CLIENTE INSTITUCIONAL').trim();
            let clientName = rawCompany;
            let branchName = '';

            if (rawCompany.includes('-')) {
                const parts = rawCompany.split('-');
                clientName = parts[0].trim();
                branchName = parts.slice(1).join('-').trim();
            }

            const address = order.shipping_address || order.profiles?.address || 'Dirección Registrada';
            const friendlyId = getFriendlyOrderId(order);
            const spaces = order.warehouse_spaces || [];
            const bahiaLabel = spaces.length > 0 ? formatSpaceLabel(spaces) : 'S/A';
            const weight = Number(order.total_weight_kg) || 0;

            // Calculate number of crates
            // Avg 12.5 kg per crate per FruFresco standard
            const estCrates = Math.max(1, Math.ceil(weight / 12.5));
            const totalLabelsForThisOrder = cratesMode === 'single'
                ? 1
                : cratesMode === 'auto'
                    ? estCrates
                    : Math.max(1, customMultiplier);

            for (let i = 1; i <= totalLabelsForThisOrder; i++) {
                // Structured QR payload for warehouse barcode scanner / driver app
                const qrPayload = `FRUFRESCO:${order.id}:${order.sequence_id || 0}:${i}/${totalLabelsForThisOrder}:${order.delivery_date}`;

                list.push({
                    orderId: order.id,
                    orderSequenceId: String(order.sequence_id || '0'),
                    friendlyOrderId: friendlyId,
                    clientName,
                    branchName,
                    shippingAddress: address,
                    nit: order.profiles?.nit || '',
                    deliveryDate: order.delivery_date,
                    deliverySlot: order.delivery_slot || 'AM',
                    bahiaLabel,
                    totalWeightKg: weight,
                    crateNumber: i,
                    totalCrates: totalLabelsForThisOrder,
                    qrPayload
                });
            }
        });

        return list;
    }, [orders, cratesMode, customMultiplier]);

    // Generate Product Labels (Mode 2: Packaged / Portioned Items)
    const productLabels = useMemo<ProductLabelInfo[]>(() => {
        const list: ProductLabelInfo[] = [];

        orders.forEach(order => {
            const orderSeq = getFriendlyOrderId(order);
            const clientName = order.profiles?.company_name || order.profiles?.contact_name || 'Cliente';
            const items = order.order_items || [];

            const filtered = productFilterMode === 'requires_label'
                ? items.filter(it => it.product?.requires_label === true)
                : items;

            filtered.forEach(item => {
                const qty = Number(item.quantity) || 1;
                const name = (item.product?.name || item.nickname || 'PRODUCTO FRESCO').toUpperCase();
                const accountingId = String(item.product?.accounting_id || item.product?.sku || '');

                const fullUnits = Math.max(1, Math.floor(qty));
                const remainder = parseFloat((qty - fullUnits).toFixed(2));

                const unitLabel = (item.unit || item.product?.unit_of_measure || 'Kg').toUpperCase();

                // Generate labels
                for (let i = 0; i < fullUnits; i++) {
                    list.push({
                        name,
                        weight: `1 ${unitLabel}`,
                        lote: getLoteDate(),
                        vencimiento: getExpirationDate(),
                        orderSequenceId: orderSeq,
                        accountingId,
                        clientName
                    });
                }

                if (remainder > 0) {
                    list.push({
                        name,
                        weight: `${remainder.toString().replace('.', ',')} ${unitLabel}`,
                        lote: getLoteDate(),
                        vencimiento: getExpirationDate(),
                        orderSequenceId: orderSeq,
                        accountingId,
                        clientName
                    });
                }
            });
        });

        return list;
    }, [orders, productFilterMode]);

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid #E2E8F0', borderTop: '3px solid #0D7A57', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <h3 style={{ marginTop: '1rem', color: '#1E293B', fontWeight: '800' }}>Compilando Rótulos Térmicos...</h3>
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '0 0 3rem', boxSizing: 'border-box' }}>
            {/* Strict CSS Print Rules Calibrated for Zebra / Xprinter 100mm x 50mm Thermal Continuous Rolls */}
            <style>
                {`
                @media print {
                    @page {
                        size: 100mm 50mm;
                        margin: 0 !important;
                    }
                    html, body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100mm !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .label-page {
                        page-break-after: always !important;
                        break-after: page !important;
                        width: 100mm !important;
                        height: 49.5mm !important; /* 49.5mm eliminates the browser subpixel rounding bug that causes blank labels! */
                        max-height: 49.5mm !important;
                        margin: 0 !important;
                        padding: 2mm 3mm !important;
                        box-sizing: border-box !important;
                        overflow: hidden !important;
                        background: white !important;
                    }
                    .label-page:last-child {
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                    }
                    .label-container {
                        border: 1.5px solid #000000 !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                        width: 100% !important;
                        height: 100% !important;
                        box-sizing: border-box !important;
                        color: #000000 !important;
                    }
                }
                `}
            </style>

            {/* Barra de Control Superior (No Imprimible) - 100% Sticky */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 9999,
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #CBD5E1',
                padding: '0.35rem 1rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            color: '#334155'
                        }}
                    >
                        <ArrowLeft size={13} /> Volver
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <h1 style={{ margin: 0, fontSize: '0.88rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
                            <Tag size={16} color="#0D7A57" />
                            Rótulos Térmicos
                        </h1>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            {orders.length} ped.
                        </span>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#475569', backgroundColor: '#F1F5F9', padding: '1px 6px', borderRadius: '12px', border: '1px solid #E2E8F0', whiteSpace: 'nowrap' }}>
                            100×50mm
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {/* Selector de Documento Imprimible & Fecha con Persistencia */}
                    <PrintDocumentSwitcher
                        currentDoc="labels"
                        selectedDate={selectedDate}
                        onDateChange={(newDate) => {
                            setSelectedDate(newDate);
                            const params = new URLSearchParams();
                            params.set('date', newDate);
                            const rawParam = searchParams.get('orderIds') || searchParams.get('ids') || '';
                            if (rawParam) params.set('orderIds', rawParam);
                            router.replace(`/admin/orders/print-labels?${params.toString()}`);
                        }}
                        orderIds={searchParams.get('orderIds') || searchParams.get('ids') || undefined}
                        variant="light"
                    />

                    {/* Selector de Tipo de Rótulo */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '2px 8px' }}>
                        <select
                            value={labelType}
                            onChange={(e) => setLabelType(e.target.value as 'crate' | 'product')}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.76rem', fontWeight: '700', color: '#0F172A', outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="crate">Canastilla / Despacho (QR)</option>
                            <option value="product">Etiquetas Producto</option>
                        </select>
                    </div>

                    {/* Modo de Canastillas (solo visible si labelType === 'crate') */}
                    {labelType === 'crate' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '2px 8px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#475569' }}>Cálculo:</span>
                            <select
                                value={cratesMode}
                                onChange={(e) => setCratesMode(e.target.value as any)}
                                style={{ border: 'none', background: 'transparent', fontSize: '0.76rem', fontWeight: '800', color: '#0D7A57', outline: 'none', cursor: 'pointer' }}
                            >
                                <option value="auto">Auto (~12.5 kg)</option>
                                <option value="single">1 por Pedido</option>
                                <option value="custom">Fijo ({customMultiplier} por Ped.)</option>
                            </select>
                        </div>
                    )}

                    {/* Filtro de Producto (solo visible si labelType === 'product') */}
                    {labelType === 'product' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '2px 8px' }}>
                            <select
                                value={productFilterMode}
                                onChange={(e) => setProductFilterMode(e.target.value as any)}
                                style={{ border: 'none', background: 'transparent', fontSize: '0.76rem', fontWeight: '800', color: '#0D7A57', outline: 'none', cursor: 'pointer' }}
                            >
                                <option value="all">Todos los Productos</option>
                                <option value="requires_label">Solo "Requiere Etiqueta"</option>
                            </select>
                        </div>
                    )}

                    {/* Botón Imprimir Rótulos */}
                    <button
                        onClick={() => window.print()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 12px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: '800',
                            boxShadow: '0 1px 4px rgba(13, 122, 87, 0.25)',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <Printer size={14} /> Imprimir ({labelType === 'crate' ? crateLabels.length : productLabels.length} Rót.)
                    </button>
                </div>
            </div>

            {/* Printable Labels Canvas */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '0.75rem auto' }}>
                {orders.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem 2rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #CBD5E1', maxWidth: '650px', margin: '2rem auto', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <Tag size={40} color="#64748B" style={{ margin: '0 auto 1rem' }} />
                        <h3 style={{ margin: '0 0 0.5rem', fontWeight: '800', fontSize: '1.1rem', color: '#0F172A' }}>No hay pedidos para generar rótulos en esta fecha</h3>
                        <p style={{ margin: 0, color: '#64748B', fontSize: '0.85rem' }}>Selecciona otra fecha con pedidos operacionales o utiliza el selector de fecha superior.</p>
                    </div>
                ) : labelType === 'crate' ? (
                    /* ======================================================== */
                    /* MODE 1: CRATE / DISPATCH LOGISTICS LABELS (100mm x 50mm) */
                    /* ======================================================== */
                    crateLabels.map((lbl, idx) => (
                        <div key={`crate-${idx}`} className="label-page">
                            <div className="label-container" style={{
                                width: '100mm',
                                height: '49.5mm',
                                border: '1.5px solid #000000',
                                margin: '8px 0',
                                backgroundColor: '#FFFFFF',
                                boxSizing: 'border-box',
                                display: 'flex',
                                fontFamily: 'Arial, Helvetica, sans-serif',
                                color: '#000000',
                                padding: '2mm 3mm',
                                overflow: 'hidden',
                                justifyContent: 'space-between'
                            }}>
                                {/* Left Section: Dispatch Information (70mm) */}
                                <div style={{ width: '71mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingRight: '1.5mm' }}>
                                    {/* Brand Header & Slot */}
                                    <div style={{ borderBottom: '1px solid #000000', paddingBottom: '1mm', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: '7.5pt', fontWeight: '900', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                                            FRUFRESCO LOGÍSTICA &bull; DESPACHO
                                        </div>
                                        <div style={{ fontSize: '7pt', fontWeight: '800' }}>
                                            {lbl.deliveryDate} &bull; <span style={{ textDecoration: 'underline' }}>{lbl.deliverySlot}</span>
                                        </div>
                                    </div>

                                    {/* Client & Branch (High Visibility in Dark Warehouses) */}
                                    <div style={{ marginTop: '1mm' }}>
                                        <div style={{ 
                                            fontSize: '11.5pt', 
                                            fontWeight: '900', 
                                            lineHeight: '1.15', 
                                            color: '#000000',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            overflow: 'hidden',
                                            textTransform: 'uppercase'
                                        }}>
                                            {lbl.clientName}
                                        </div>
                                        {lbl.branchName && (
                                            <div style={{ fontSize: '8.5pt', fontWeight: '800', marginTop: '0.5mm', color: '#000000' }}>
                                                {lbl.branchName.toUpperCase()}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '6.8pt', fontWeight: '600', color: '#111827', marginTop: '0.5mm', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {lbl.shippingAddress}
                                        </div>
                                    </div>

                                    {/* Operational Bottom Metrics & Check Box */}
                                    <div style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        justifyContent: 'space-between', 
                                        borderTop: '1px solid #000000', 
                                        paddingTop: '1mm',
                                        marginTop: '1mm'
                                    }}>
                                        {/* Bahia Muelle */}
                                        <div style={{ 
                                            border: '1.5px solid #000000', 
                                            padding: '1px 5px', 
                                            borderRadius: '3px',
                                            fontSize: '8.5pt',
                                            fontWeight: '900'
                                        }}>
                                            BAHÍA: #{lbl.bahiaLabel}
                                        </div>

                                        {/* Total Weight */}
                                        <div style={{ fontSize: '8pt', fontWeight: '800' }}>
                                            PESO: <strong>{lbl.totalWeightKg.toFixed(1).replace('.', ',')} kg</strong>
                                        </div>

                                        {/* Crate Counter Checkbox */}
                                        <div style={{ 
                                            border: '1.5px solid #000000', 
                                            padding: '1px 5px', 
                                            borderRadius: '3px',
                                            fontSize: '8pt',
                                            fontWeight: '900'
                                        }}>
                                            CANASTILLA: [ {lbl.crateNumber} / {lbl.totalCrates} ]
                                        </div>
                                    </div>
                                </div>

                                {/* Right Section: High-Contrast QR Code & Order ID (23mm) */}
                                <div style={{ 
                                    width: '23mm', 
                                    borderLeft: '1px solid #000000', 
                                    paddingLeft: '2mm', 
                                    display: 'flex', 
                                    flexDirection: 'column', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between'
                                }}>
                                    {/* Friendly Order Badge */}
                                    <div style={{ 
                                        fontSize: '7.5pt', 
                                        fontWeight: '900', 
                                        textAlign: 'center',
                                        border: '1px solid #000000',
                                        borderRadius: '3px',
                                        padding: '1px 3px',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}>
                                        #{lbl.friendlyOrderId}
                                    </div>

                                    {/* High-Resolution Scannable QR Code */}
                                    <div style={{ padding: '1mm 0' }}>
                                        <QRCodeSVG 
                                            value={lbl.qrPayload} 
                                            size={65} 
                                            level="M" 
                                            fgColor="#000000"
                                            bgColor="#FFFFFF"
                                        />
                                    </div>

                                    {/* Scan Instruction */}
                                    <div style={{ fontSize: '5.5pt', fontWeight: '800', textAlign: 'center', letterSpacing: '0.02em' }}>
                                        ESCANEAR EN MUELLE
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    /* ======================================================== */
                    /* MODE 2: BROMATOLOGICAL ITEM LABELS (100mm x 50mm)        */
                    /* ======================================================== */
                    productLabels.map((lbl, idx) => (
                        <div key={`prod-${idx}`} className="label-page">
                            <div className="label-container" style={{
                                width: '100mm',
                                height: '49.5mm',
                                border: '1.5px solid #000000',
                                margin: '8px 0',
                                backgroundColor: '#FFFFFF',
                                boxSizing: 'border-box',
                                display: 'flex',
                                fontFamily: 'Arial, Helvetica, sans-serif',
                                color: '#000000',
                                padding: '2.5mm 3.5mm',
                                overflow: 'hidden'
                            }}>
                                {/* Left Column: Information */}
                                <div style={{ width: '70mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                    <div>
                                        <div style={{ fontSize: '11.5pt', fontWeight: '900', color: '#000000', lineHeight: '1.15', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {lbl.name}
                                        </div>
                                        <div style={{ display: 'flex', gap: '5mm', marginTop: '1.5mm', fontSize: '9pt', fontWeight: 'bold' }}>
                                            <div>LOTE: {lbl.lote}</div>
                                            <div>CANTIDAD: {lbl.weight}</div>
                                        </div>
                                        <div style={{ fontSize: '9pt', fontWeight: 'bold', marginTop: '0.5mm' }}>
                                            VENCE: {lbl.vencimiento}
                                        </div>
                                        <div style={{ fontSize: '7.5pt', fontWeight: '700', marginTop: '0.5mm', color: '#111827' }}>
                                            CLIENTE: {lbl.clientName}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '6.8pt', lineHeight: '1.25', color: '#111827', fontWeight: '600' }}>
                                        Único ingrediente &bull; Consérvese refrigerado de 0°C a 4°C.<br />
                                        Empacado por Investments Cortés S.A.S. &bull; Bogotá, Colombia.
                                    </div>
                                </div>

                                {/* Right Column: Logo & Codes */}
                                <div style={{ width: '24mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '2mm', boxSizing: 'border-box', borderLeft: '1px solid #000000' }}>
                                    <div style={{ width: '18mm', height: '18mm', position: 'relative' }}>
                                        <img 
                                            src="/logo-investments.png" 
                                            alt="Investments Cortés Logo" 
                                            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(100%) contrast(1.5)' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', width: '100%' }}>
                                        <div style={{ fontSize: '7.5pt', fontWeight: 'bold', textAlign: 'center', color: '#000000', wordBreak: 'break-all' }}>
                                            ID: {lbl.accountingId || 'N/A'}
                                        </div>
                                        <div style={{ fontSize: '7pt', fontWeight: '900', color: '#000000', border: '1px solid #000000', padding: '1px 3px', borderRadius: '3px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
                                            #{lbl.orderSequenceId}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
