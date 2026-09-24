'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSearchParams, useRouter } from 'next/navigation';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, ArrowLeft, Tag, Package, Sparkles, Scale, Building2, Calendar, Truck, Clock } from 'lucide-react';

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

    useEffect(() => {
        const fetchBulkLabelsData = async () => {
            // Unify query params: accept orderIds, ids or date
            const rawParam = searchParams.get('orderIds') || searchParams.get('ids') || '';
            const dateParam = searchParams.get('date') || '';
            const ids = rawParam.split(',').map(s => s.trim()).filter(Boolean);

            if (ids.length === 0 && !dateParam) {
                setLoading(false);
                return;
            }

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
                    ordersQuery = ordersQuery.in('id', ids);
                } else if (dateParam) {
                    ordersQuery = ordersQuery.eq('delivery_date', dateParam).neq('status', 'cancelled');
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
    }, [searchParams]);

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

    if (orders.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', gap: '1rem', padding: '2rem', textAlign: 'center' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444' }}>
                    <Tag size={28} />
                </div>
                <h2 style={{ margin: 0, color: '#0F172A', fontWeight: '900' }}>No se seleccionaron pedidos para impresión</h2>
                <p style={{ margin: 0, color: '#64748B', maxWidth: '420px', fontSize: '0.9rem' }}>
                    Regresa a la mesa de Cargue de Pedidos o al Asistente de Despacho y selecciona al menos un pedido para imprimir sus rótulos.
                </p>
                <button 
                    onClick={() => router.back()} 
                    style={{ marginTop: '0.5rem', padding: '10px 20px', backgroundColor: '#0F172A', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '800', fontSize: '0.9rem' }}
                >
                    Volver al Cargue
                </button>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#0F172A', minHeight: '100vh', padding: '20px 0', boxSizing: 'border-box' }}>
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

            {/* Non-Printable Configuration & Action Toolbar */}
            <div className="no-print" style={{ 
                maxWidth: '920px', 
                margin: '0 auto 20px', 
                padding: '16px 20px', 
                backgroundColor: '#1E293B', 
                borderRadius: '16px', 
                border: '1px solid #334155',
                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: 'white'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <button
                            onClick={() => router.back()}
                            style={{ 
                                padding: '8px 12px', 
                                backgroundColor: '#334155', 
                                color: '#CBD5E1', 
                                border: 'none', 
                                borderRadius: '8px', 
                                cursor: 'pointer', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                fontWeight: '700',
                                fontSize: '0.8rem'
                            }}
                        >
                            <ArrowLeft size={14} /> Volver
                        </button>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', letterSpacing: '-0.01em' }}>
                                    Impresión Térmica de Rótulos
                                </h2>
                                <span style={{ fontSize: '0.7rem', backgroundColor: '#0D7A57', color: '#ECFDF5', padding: '2px 8px', borderRadius: '6px', fontWeight: '900' }}>
                                    100mm × 50mm
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#94A3B8' }}>
                                {orders.length} pedidos seleccionados &bull; {labelType === 'crate' ? crateLabels.length : productLabels.length} etiquetas listas para imprimir
                            </p>
                        </div>
                    </div>

                    {/* Print Action Button */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button 
                            onClick={() => window.print()} 
                            style={{ 
                                padding: '10px 22px', 
                                backgroundColor: '#10B981', 
                                color: '#064E3B', 
                                border: 'none', 
                                borderRadius: '10px', 
                                cursor: 'pointer', 
                                fontWeight: '900', 
                                fontSize: '0.92rem', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)'
                            }}
                        >
                            <Printer size={18} strokeWidth={2.5} /> 
                            <span>IMPRIMIR RÓTULOS (Ctrl + P)</span>
                        </button>
                    </div>
                </div>

                {/* Sub-toolbar: Mode and Crate Controls */}
                <div style={{ 
                    marginTop: '14px', 
                    paddingTop: '12px', 
                    borderTop: '1px solid #334155', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    flexWrap: 'wrap', 
                    gap: '12px' 
                }}>
                    {/* Mode Selector */}
                    <div style={{ display: 'flex', backgroundColor: '#0F172A', padding: '3px', borderRadius: '10px', border: '1px solid #334155' }}>
                        <button
                            type="button"
                            onClick={() => setLabelType('crate')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                backgroundColor: labelType === 'crate' ? '#10B981' : 'transparent',
                                color: labelType === 'crate' ? '#064E3B' : '#94A3B8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Tag size={13} /> Rótulos de Canastilla / Despacho (con QR)
                        </button>
                        <button
                            type="button"
                            onClick={() => setLabelType('product')}
                            style={{
                                padding: '6px 14px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                backgroundColor: labelType === 'product' ? '#10B981' : 'transparent',
                                color: labelType === 'product' ? '#064E3B' : '#94A3B8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Package size={13} /> Etiquetas de Producto (Bromatológicas)
                        </button>
                    </div>

                    {/* Multiplier / Filter Options */}
                    {labelType === 'crate' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#CBD5E1' }}>
                            <span style={{ fontWeight: '700' }}>Canastillas por Pedido:</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    onClick={() => setCratesMode('auto')}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #334155',
                                        backgroundColor: cratesMode === 'auto' ? '#0D7A57' : '#1E293B',
                                        color: cratesMode === 'auto' ? 'white' : '#94A3B8',
                                        fontWeight: '700',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer'
                                    }}
                                    title="Calcula automáticamente 1 etiqueta cada 12.5 kg de carga"
                                >
                                    Auto (~12.5 kg)
                                </button>
                                <button
                                    onClick={() => setCratesMode('single')}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #334155',
                                        backgroundColor: cratesMode === 'single' ? '#0D7A57' : '#1E293B',
                                        color: cratesMode === 'single' ? 'white' : '#94A3B8',
                                        fontWeight: '700',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer'
                                    }}
                                    title="1 solo rótulo por pedido"
                                >
                                    1 por Pedido
                                </button>
                                <button
                                    onClick={() => setCratesMode('custom')}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #334155',
                                        backgroundColor: cratesMode === 'custom' ? '#0D7A57' : '#1E293B',
                                        color: cratesMode === 'custom' ? 'white' : '#94A3B8',
                                        fontWeight: '700',
                                        fontSize: '0.72rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Fijo ({customMultiplier})
                                </button>
                            </div>
                            {cratesMode === 'custom' && (
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={customMultiplier}
                                    onChange={e => setCustomMultiplier(Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ width: '45px', padding: '3px 6px', borderRadius: '4px', border: '1px solid #475569', backgroundColor: '#0F172A', color: 'white', fontSize: '0.75rem', fontWeight: 'bold' }}
                                />
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#CBD5E1' }}>
                            <span style={{ fontWeight: '700' }}>Filtro de Productos:</span>
                            <button
                                onClick={() => setProductFilterMode(prev => prev === 'all' ? 'requires_label' : 'all')}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #334155',
                                    backgroundColor: productFilterMode === 'all' ? '#0D7A57' : '#1E293B',
                                    color: productFilterMode === 'all' ? 'white' : '#94A3B8',
                                    fontWeight: '700',
                                    fontSize: '0.72rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {productFilterMode === 'all' ? 'Todos los Productos del Pedido' : 'Solo ítems con Flag "Requiere Etiqueta"'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Printable Labels Canvas */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {labelType === 'crate' ? (
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
