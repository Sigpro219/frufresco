'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { Printer, ShieldAlert } from 'lucide-react';

interface OrderItem {
    id: string;
    quantity: number;
    unit?: string;
    unit_price?: number;
    nickname?: string;
    variant_label?: string;
    products?: {
        id?: string;
        name: string;
        sku?: string;
        unit_of_measure?: string;
        weight_kg?: number;
    };
}

interface OrderData {
    id: string;
    sequence_id?: number;
    created_at: string;
    delivery_date: string;
    delivery_slot?: string;
    total: number;
    subtotal?: number;
    tax?: number;
    shipping_address?: string;
    customer_name?: string;
    customer_phone?: string;
    admin_notes?: string;
    special_notes?: string;
    profiles?: {
        id?: string;
        company_name?: string;
        contact_name?: string;
        contact_phone?: string;
        address?: string;
        nit?: string;
        role?: string;
    };
    order_items: OrderItem[];
}

export default function ContingencyPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const rawOrderIds = searchParams.get('orderIds') || '';
    const mode = searchParams.get('mode') || 'all'; // 'all' | 'picking' | 'remissions' | 'dispatch' | 'purchases'

    const [orders, setOrders] = useState<OrderData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrdersData = async () => {
            if (!rawOrderIds) {
                setLoading(false);
                return;
            }

            const ids = rawOrderIds.split(',').map(id => id.trim()).filter(Boolean);
            if (ids.length === 0) {
                setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, created_at, delivery_date, delivery_slot, total, subtotal, tax,
                        shipping_address, admin_notes, special_notes,
                        profiles:profiles(id, company_name, contact_name, contact_phone, address, nit, role),
                        order_items(id, quantity, unit, unit_price, nickname, variant_label, products(id, name, sku, unit_of_measure, weight_kg))
                    `)
                    .in('id', ids)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error('Error cargando pedidos para contingencia:', error);
                } else {
                    setOrders((data as any) || []);
                }
            } catch (err) {
                console.error('Excepción cargando datos de contingencia:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrdersData();
    }, [rawOrderIds]);

    // Consolidado de compras Corabastos
    const consolidatedPurchases = useMemo(() => {
        const map = new Map<string, { name: string; sku: string; unit: string; totalQty: number; ordersCount: number }>();
        orders.forEach(order => {
            (order.order_items || []).forEach(item => {
                const prodName = item.products?.name || item.nickname || 'Producto Sin Nombre';
                const sku = item.products?.sku || 'N/A';
                const unit = item.unit || item.products?.unit_of_measure || 'Kg';
                const qty = Number(item.quantity || 0);

                const key = `${prodName}_${unit}`.toLowerCase();
                if (!map.has(key)) {
                    map.set(key, { name: prodName, sku, unit, totalQty: 0, ordersCount: 0 });
                }
                const record = map.get(key)!;
                record.totalQty += qty;
                record.ordersCount += 1;
            });
        });
        return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
    }, [orders]);

    const formatMoney = (amount: number) => {
        return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount || 0);
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0F172A', marginBottom: '8px' }}>
                    Generando Kit de Contingencia de Piso...
                </div>
                <div style={{ color: '#64748B', fontSize: '0.9rem' }}>
                    Compilando planillas de báscula, remisiones y manifiestos de despacho.
                </div>
            </div>
        );
    }

    if (orders.length === 0) {
        return (
            <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
                <ShieldAlert size={48} color="#DC2626" style={{ margin: '0 auto 1rem' }} />
                <h2>No se seleccionaron pedidos para el Kit de Contingencia</h2>
                <p style={{ color: '#64748B' }}>Por favor regresa a la mesa de cargue y selecciona al menos un pedido.</p>
                <button onClick={() => router.back()} style={{ marginTop: '1rem', padding: '10px 20px', backgroundColor: '#0D7A57', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Volver al Cargue
                </button>
            </div>
        );
    }

    const showAll = mode === 'all';
    const showPurchases = showAll || mode === 'purchases';
    const showPicking = showAll || mode === 'picking';
    const showRemissions = showAll || mode === 'remissions';
    const showDispatch = showAll || mode === 'dispatch';

    return (
        <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '20px 0', color: '#000', fontFamily: 'Arial, Helvetica, sans-serif' }}>
            {/* CSS Print Rules */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .no-print { display: none !important; }
                    body { background: white !important; padding: 0 !important; margin: 0 !important; color: black !important; }
                    .page-break { page-break-after: always; break-after: page; }
                    .avoid-break { page-break-inside: avoid; break-inside: avoid; }
                    .print-sheet {
                        box-shadow: none !important;
                        border: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                    }
                }
                @page {
                    size: letter portrait;
                    margin: 8mm;
                }
            ` }} />

            {/* Top Control Bar (Non-printable) */}
            <div className="no-print" style={{
                maxWidth: '900px',
                margin: '0 auto 20px',
                padding: '16px 24px',
                backgroundColor: 'white',
                borderRadius: '16px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid #E2E8F0'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ backgroundColor: '#FEF3C7', color: '#92400E', fontSize: '0.75rem', fontWeight: '900', padding: '3px 8px', borderRadius: '6px', border: '1px solid #FCD34D' }}>
                            KIT DE PISO / CONTINGENCIA
                        </span>
                        <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '900', color: '#0F172A' }}>
                            Documentación Manual de Emergencia
                        </h2>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                        {orders.length} pedidos seleccionados &bull; Modo: <strong>{mode.toUpperCase()}</strong> &bull; Optimizado para trabajar en planta sin red ni luz
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{ padding: '10px 18px', backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem' }}
                    >
                        Volver
                    </button>
                    <button
                        onClick={() => window.print()}
                        style={{
                            padding: '10px 22px',
                            backgroundColor: '#0D7A57',
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            fontWeight: '900',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.3)',
                            fontSize: '0.9rem'
                        }}
                    >
                        <Printer size={18} /> Imprimir Kit ({orders.length} Pedidos)
                    </button>
                </div>
            </div>

            {/* Printable Container */}
            <div style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* ========================================================= */}
                {/* 1. PLANILLA DE COMPRAS CORABASTOS (FÍSICA DE PISO)        */}
                {/* ========================================================= */}
                {showPurchases && (
                    <div className="print-sheet page-break" style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '18pt', fontWeight: '900', textTransform: 'uppercase' }}>
                                    Planilla Maestra de Compras (Corabastos)
                                </h1>
                                <div style={{ fontSize: '9pt', color: '#333', marginTop: '2px' }}>
                                    INVESTMENTS CORTES S.A.S. &bull; FruFresco &bull; Operación de Contingencia
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '9pt' }}>
                                <div><strong>Fecha Despacho:</strong> {orders[0]?.delivery_date || new Date().toISOString().split('T')[0]}</div>
                                <div><strong>Total SKUs Consolidados:</strong> {consolidatedPurchases.length}</div>
                                <div><strong>Pedidos Amparados:</strong> {orders.length}</div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: '#F1F5F9', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '4px', fontSize: '8pt', marginBottom: '12px' }}>
                            <strong>Instrucciones para el Comprador en Corabastos:</strong> Registre a mano el precio final negociado por bulto/kilo, los kilos efectivamente comprados en plaza y el puesto/bodega de procedencia.
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#E2E8F0', borderBottom: '1.5px solid #000', textAlign: 'left' }}>
                                    <th style={{ padding: '6px', width: '5%' }}>#</th>
                                    <th style={{ padding: '6px', width: '38%' }}>Producto / Descripción</th>
                                    <th style={{ padding: '6px', width: '8%', textAlign: 'center' }}>Und</th>
                                    <th style={{ padding: '6px', width: '12%', textAlign: 'right' }}>Demanda Neta</th>
                                    <th style={{ padding: '6px', width: '13%', textAlign: 'right' }}>+Merma (5%)</th>
                                    <th style={{ padding: '6px', width: '12%' }}>Precio $/Kg</th>
                                    <th style={{ padding: '6px', width: '12%' }}>Comprado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {consolidatedPurchases.map((p, idx) => {
                                    const withMerma = (p.totalQty * 1.05).toFixed(1);
                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #CBD5E1' }}>
                                            <td style={{ padding: '5px 6px', fontWeight: 'bold' }}>{idx + 1}</td>
                                            <td style={{ padding: '5px 6px' }}>
                                                <strong>{p.name}</strong> {p.sku !== 'N/A' && <span style={{ fontSize: '7.5pt', color: '#666' }}>({p.sku})</span>}
                                            </td>
                                            <td style={{ padding: '5px 6px', textAlign: 'center' }}>{p.unit}</td>
                                            <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 'bold' }}>
                                                {p.totalQty.toLocaleString('es-CO')}
                                            </td>
                                            <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '900', color: '#000' }}>
                                                {withMerma}
                                            </td>
                                            <td style={{ padding: '5px 6px', borderBottom: '1px dashed #94A3B8' }}>$ ________</td>
                                            <td style={{ padding: '5px 6px', borderBottom: '1px dashed #94A3B8' }}>________</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: '25px', display: 'flex', justifyContent: 'space-between', fontSize: '9pt', paddingTop: '15px', borderTop: '1px solid #CBD5E1' }}>
                            <div>Firma Comprador en Corabastos: ___________________________</div>
                            <div>Firma Recibido en Bodega: ___________________________</div>
                        </div>
                    </div>
                )}


                {/* ========================================================= */}
                {/* 2. HOJAS DE PICKING DE BODEGA Y PESAJE EN BÁSCULA         */}
                {/* ========================================================= */}
                {showPicking && orders.map((order, orderIdx) => {
                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                    const orderNum = getFriendlyOrderId(order);
                    return (
                        <div key={`picking-${order.id}`} className="print-sheet page-break" style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h1 style={{ margin: 0, fontSize: '16pt', fontWeight: '900' }}>
                                            HOJA DE PICKING & PESAJE EN BÁSCULA
                                        </h1>
                                        <span style={{ fontSize: '8pt', border: '1px solid #000', padding: '2px 6px', fontWeight: 'bold' }}>
                                            PEDIDO #{orderNum}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '11pt', fontWeight: '900', color: '#000', marginTop: '4px' }}>
                                        CLIENTE: {clientName.toUpperCase()}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', fontSize: '8.5pt' }}>
                                    <div><strong>Fecha Entrega:</strong> {order.delivery_date}</div>
                                    <div><strong>Franja:</strong> {order.delivery_slot || 'AM'}</div>
                                    <div><strong>Dirección:</strong> {order.shipping_address || order.profiles?.address || 'Bogotá'}</div>
                                    <div><strong>Contacto:</strong> {order.profiles?.contact_phone || order.customer_phone || 'N/A'}</div>
                                </div>
                            </div>

                            {order.admin_notes && (
                                <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', padding: '6px 10px', borderRadius: '4px', fontSize: '8pt', marginBottom: '10px' }}>
                                    <strong>Notas / Instrucciones Especiales:</strong> {order.admin_notes}
                                </div>
                            )}

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9pt' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#000', color: '#FFF', textAlign: 'left' }}>
                                        <th style={{ padding: '5px', width: '5%', textAlign: 'center' }}>[✓]</th>
                                        <th style={{ padding: '5px', width: '42%' }}>Producto / Requisito</th>
                                        <th style={{ padding: '5px', width: '12%', textAlign: 'right' }}>Cant. Pedida</th>
                                        <th style={{ padding: '5px', width: '8%', textAlign: 'center' }}>Und</th>
                                        <th style={{ padding: '5px', width: '15%', textAlign: 'center', backgroundColor: '#333' }}>Peso Real Báscula</th>
                                        <th style={{ padding: '5px', width: '18%', textAlign: 'center' }}>Lote / Novedad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(order.order_items || []).map((itm, itmIdx) => {
                                        const pName = itm.nickname || itm.products?.name || 'Producto';
                                        const unit = itm.unit || itm.products?.unit_of_measure || 'Kg';
                                        return (
                                            <tr key={itmIdx} style={{ borderBottom: '1px solid #CBD5E1', backgroundColor: itmIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                                <td style={{ padding: '6px', textAlign: 'center', fontSize: '12pt' }}>
                                                    &#9633;
                                                </td>
                                                <td style={{ padding: '6px' }}>
                                                    <strong>{pName}</strong>
                                                    {itm.variant_label && <div style={{ fontSize: '7.5pt', color: '#475569' }}>Esp: {itm.variant_label}</div>}
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'right', fontWeight: 'bold' }}>
                                                    {Number(itm.quantity || 0).toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'center' }}>{unit}</td>
                                                <td style={{ padding: '6px', textAlign: 'center', borderLeft: '1px solid #CBD5E1', borderRight: '1px solid #CBD5E1', fontWeight: 'bold' }}>
                                                    ______ kg
                                                </td>
                                                <td style={{ padding: '6px', textAlign: 'center', color: '#64748B' }}>
                                                    ________________
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div style={{ marginTop: '20px', borderTop: '1px solid #000', paddingTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', fontSize: '8pt' }}>
                                <div>
                                    <div><strong>Alistador / Pesador:</strong></div>
                                    <div style={{ marginTop: '15px' }}>Firma: ___________________________</div>
                                </div>
                                <div>
                                    <div><strong>Auditor de Calidad:</strong></div>
                                    <div style={{ marginTop: '15px' }}>Firma: ___________________________</div>
                                </div>
                                <div>
                                    <div><strong>Total Canastillas Usadas:</strong></div>
                                    <div style={{ marginTop: '15px' }}>[ _____ ] Canastillas Plásticas</div>
                                </div>
                            </div>
                        </div>
                    );
                })}


                {/* ========================================================= */}
                {/* ========================================================= */}
                {/* 3. REMISIONES DE ENTREGA FÍSICAS DE CONTINGENCIA          */}
                {/*    (Regla de Duplicado Consecutivo: Original + Copia)     */}
                {/* ========================================================= */}
                {showRemissions && orders.flatMap((order, orderIdx) => {
                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                    const orderNum = getFriendlyOrderId(order);
                    const subtotal = order.subtotal || order.total || 0;
                    const isHogar = order.profiles?.role === 'hogar' || order.profiles?.role === 'b2c';
                    const isReposicion = (order.admin_notes || '').toLowerCase().includes('reposici') || (order.special_notes || '').toLowerCase().includes('reposici');
                    const remissionPrefix = isReposicion ? 'REPOSICIÓN' : (isHogar ? 'REMISION H' : 'REMISION I');
                    const espacioNum = order.sequence_id ? `${order.sequence_id}` : `${orderIdx + 1}`;
                    const itemsCount = (order.order_items || []).length;

                    // Cada pedido genera 2 hojas consecutivas: Original y Copia
                    return [
                        { copyType: 'ORIGINAL - CLIENTE', isCopy: false },
                        { copyType: 'COPIA - TRANSPORTADOR / CONTABILIDAD', isCopy: true }
                    ].map((copyInfo, copyIdx) => (
                        <div key={`remission-${order.id}-copy-${copyIdx}`} className="print-sheet page-break" style={{ backgroundColor: 'white', padding: '24px', borderRadius: '8px', border: '1px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', position: 'relative' }}>
                            {/* Top Badge Original / Copia */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', borderBottom: '1px solid #E2E8F0', paddingBottom: '4px' }}>
                                <span style={{
                                    fontSize: '8pt',
                                    fontWeight: '900',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    backgroundColor: copyInfo.isCopy ? '#F1F5F9' : '#0F172A',
                                    color: copyInfo.isCopy ? '#0F172A' : '#FFFFFF',
                                    border: '1px solid #0F172A',
                                    letterSpacing: '0.5px'
                                }}>
                                    {copyInfo.copyType}
                                </span>
                                <span style={{ fontSize: '7.5pt', color: '#64748B' }}>
                                    Documento Operativo de Piso &bull; FruFresco Logística
                                </span>
                            </div>

                            {/* Header Corporativo con ESPACIO */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontSize: '13pt', fontWeight: '900', letterSpacing: '-0.3px' }}>
                                        INVESTMENTS CORTES SAS
                                    </div>
                                    <div style={{ fontSize: '8pt', color: '#334155', marginTop: '1px' }}>
                                        NIT 901.393.217-5 &bull; Bogotá D.C.
                                    </div>
                                    <div style={{ fontSize: '10.5pt', fontWeight: '800', marginTop: '4px', color: '#0F172A' }}>
                                        {remissionPrefix} #{orderNum}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ border: '2px solid #000', padding: '4px 10px', borderRadius: '6px', textAlign: 'center', backgroundColor: '#F8FAFC' }}>
                                        <div style={{ fontSize: '7pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748B' }}>Bahía de Piso</div>
                                        <div style={{ fontSize: '12pt', fontWeight: '900' }}>ESPACIO {espacioNum}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Poka-Yoke Banner Reposición si aplica */}
                            {isReposicion && (
                                <div style={{ backgroundColor: '#FEF2F2', border: '1.5px solid #EF4444', padding: '6px 10px', borderRadius: '6px', marginBottom: '10px', fontSize: '7.5pt', color: '#991B1B', fontWeight: 'bold' }}>
                                    RECUERDE: Los productos en este documento NO TIENEN COBRO, dado que corresponden a una reposición de calidad autorizada por Servicio al Cliente.
                                </div>
                            )}

                            {/* Client & Route Box */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '10px', backgroundColor: '#F8FAFC', padding: '8px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '8pt', marginBottom: '12px' }}>
                                <div>
                                    <div><strong>CLIENTE:</strong> {clientName}</div>
                                    <div><strong>NIT / C.C.:</strong> {order.profiles?.nit || 'N/A'}</div>
                                    <div><strong>DIRECCIÓN:</strong> {order.shipping_address || order.profiles?.address || 'Bogotá'}</div>
                                    <div><strong>TELÉFONO:</strong> {order.profiles?.contact_phone || order.customer_phone || 'N/A'}</div>
                                </div>
                                <div>
                                    <div><strong>FECHA DESPACHO:</strong> {order.delivery_date}</div>
                                    <div><strong>FRANJA:</strong> {order.delivery_slot || 'AM (05:00 - 08:00)'}</div>
                                    <div><strong>LÍNEAS:</strong> {itemsCount} productos solicitados</div>
                                    {order.special_notes && <div><strong>OBS:</strong> {order.special_notes}</div>}
                                </div>
                            </div>

                            {/* Products Table con columna KG-UN recibe */}
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', marginBottom: '12px' }}>
                                <thead>
                                    <tr style={{ backgroundColor: '#E2E8F0', borderBottom: '1.5px solid #000', textAlign: 'left' }}>
                                        <th style={{ padding: '4px', width: '4%', textAlign: 'center' }}>P</th>
                                        <th style={{ padding: '4px', width: '40%' }}>Descripción del Producto</th>
                                        <th style={{ padding: '4px', width: '10%', textAlign: 'right' }}>Cant.</th>
                                        <th style={{ padding: '4px', width: '7%', textAlign: 'center' }}>UM</th>
                                        <th style={{ padding: '4px', width: '13%', textAlign: 'right' }}>Valor/UM</th>
                                        <th style={{ padding: '4px', width: '12%', textAlign: 'right' }}>Total</th>
                                        <th style={{ padding: '4px', width: '14%', textAlign: 'center', backgroundColor: '#1E293B', color: '#FFF' }}>KG-UN recibe</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(order.order_items || []).map((itm, idx) => {
                                        const pName = itm.nickname || itm.products?.name || 'Producto';
                                        const unit = itm.unit || itm.products?.unit_of_measure || 'KG';
                                        const qty = Number(itm.quantity || 0);
                                        const price = isReposicion ? 0 : Number(itm.unit_price || 0);
                                        const lineTotal = qty * price;
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #CBD5E1' }}>
                                                <td style={{ padding: '4px', textAlign: 'center', fontSize: '10pt' }}>&#9633;</td>
                                                <td style={{ padding: '4px' }}>
                                                    <strong>{pName}</strong>
                                                    {itm.variant_label && <span style={{ fontSize: '7pt', color: '#64748B' }}> ({itm.variant_label})</span>}
                                                </td>
                                                <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{qty.toLocaleString('es-CO')}</td>
                                                <td style={{ padding: '4px', textAlign: 'center' }}>{unit}</td>
                                                <td style={{ padding: '4px', textAlign: 'right' }}>{price > 0 ? formatMoney(price) : '$0'}</td>
                                                <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold' }}>{lineTotal > 0 ? formatMoney(lineTotal) : '$0'}</td>
                                                <td style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #CBD5E1', borderRight: '1px solid #CBD5E1', fontWeight: 'bold' }}>
                                                    __________
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Summary & Canastillas Control */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                                <div style={{ width: '55%', fontSize: '7.5pt', color: '#334155' }}>
                                    <div style={{ fontWeight: 'bold', color: '#000', marginBottom: '2px' }}>Balance de Canastillas Plásticas:</div>
                                    <div style={{ display: 'flex', gap: '15px', border: '1px dashed #94A3B8', padding: '5px 8px', borderRadius: '4px', backgroundColor: '#F8FAFC' }}>
                                        <div>Canastillas Entregadas: <strong>[ _____ ]</strong></div>
                                        <div>Canastillas Recogidas: <strong>[ _____ ]</strong></div>
                                    </div>
                                    <div style={{ marginTop: '3px', fontSize: '7pt', color: '#64748B' }}>
                                        * Las canastillas son activos en comodato de FruFresco. Entregue al conductor la misma cantidad recibida.
                                    </div>
                                </div>

                                <div style={{ width: '38%', backgroundColor: '#F8FAFC', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '8pt' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                        <span>SUBTOTAL:</span>
                                        <span style={{ fontWeight: 'bold' }}>{isReposicion ? '$0' : formatMoney(subtotal)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                                        <span>IVA:</span>
                                        <span>{isReposicion ? '$0' : formatMoney(order.tax || 0)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #000', paddingTop: '3px', fontSize: '9.5pt', fontWeight: '900' }}>
                                        <span>TOTAL:</span>
                                        <span>{isReposicion ? '$0' : formatMoney(order.total || subtotal)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Signatures Block */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', border: '1px solid #000', padding: '8px 12px', borderRadius: '6px', fontSize: '7.5pt', marginBottom: '12px' }}>
                                <div>
                                    <div style={{ fontWeight: '900', marginBottom: '2px' }}>FIRMA Y CÉDULA DE QUIEN RECIBE:</div>
                                    <div style={{ marginTop: '22px', borderBottom: '1px solid #000', width: '90%' }}></div>
                                    <div style={{ marginTop: '3px' }}>Nombre Legible: ____________________________________</div>
                                    <div style={{ marginTop: '3px' }}>C.C. / Cargo: _______________________________________</div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: '900', marginBottom: '2px' }}>SELLO / NOVEDADES EN SITIO:</div>
                                    <div style={{ height: '48px', border: '1px dashed #CBD5E1', borderRadius: '4px', padding: '4px', color: '#94A3B8', fontSize: '7pt' }}>
                                        Sello del establecimiento o detalle de faltantes/devoluciones anotados por el cliente.
                                    </div>
                                </div>
                            </div>

                            {/* Corporate Footer */}
                            <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '6px', textAlign: 'center', fontSize: '7pt', color: '#64748B' }}>
                                <div style={{ fontWeight: 'bold', color: '#334155' }}>
                                    Más que su proveedor, somos el puente que impulsa el campo. Gracias por crecer con nosotros.
                                </div>
                                <div style={{ marginTop: '2px', display: 'flex', justifyContent: 'center', gap: '15px' }}>
                                    <span><strong>Gestión Pedidos:</strong> 310 5564160 &bull; pedidos@frufresco.com</span>
                                    <span><strong>Servicio al Cliente:</strong> 301 5421761 &bull; info@frufresco.com</span>
                                    <span><strong>Línea Hogar:</strong> www.frufresco.com</span>
                                </div>
                            </div>
                        </div>
                    ));
                })}


                {/* ========================================================= */}
                {/* 4. MANIFIESTO DE RUTA & CONTROL DE CANASTILLAS            */}
                {/* ========================================================= */}
                {showDispatch && (
                    <div className="print-sheet page-break" style={{ backgroundColor: 'white', padding: '25px', borderRadius: '12px', border: '1px solid #CBD5E1', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '15px' }}>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '16pt', fontWeight: '900' }}>
                                    MANIFIESTO DE RUTA & CONTROL DE CANASTILLAS
                                </h1>
                                <div style={{ fontSize: '8.5pt', color: '#475569' }}>
                                    Despacho de Contingencia &bull; Salida de Bodega &bull; Puerta y Vigilancia
                                </div>
                            </div>
                            <div style={{ textAlign: 'right', fontSize: '8.5pt' }}>
                                <div><strong>Fecha:</strong> {orders[0]?.delivery_date || new Date().toISOString().split('T')[0]}</div>
                                <div><strong>Total Paradas:</strong> {orders.length}</div>
                            </div>
                        </div>

                        {/* Driver & Vehicle Box */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', backgroundColor: '#F1F5F9', padding: '8px 12px', borderRadius: '6px', fontSize: '9pt', marginBottom: '15px' }}>
                            <div><strong>Conductor Asignado:</strong> ______________________</div>
                            <div><strong>Placa del Vehículo:</strong> ______________________</div>
                            <div><strong>Hora de Salida Bodega:</strong> ______:______ AM</div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#000', color: '#FFF', textAlign: 'left' }}>
                                    <th style={{ padding: '6px', width: '5%', textAlign: 'center' }}>#</th>
                                    <th style={{ padding: '6px', width: '10%' }}>Pedido</th>
                                    <th style={{ padding: '6px', width: '30%' }}>Cliente / Razón Social</th>
                                    <th style={{ padding: '6px', width: '25%' }}>Dirección de Entrega</th>
                                    <th style={{ padding: '6px', width: '10%', textAlign: 'center' }}>Canastillas Entregadas</th>
                                    <th style={{ padding: '6px', width: '10%', textAlign: 'center' }}>Canastillas Recogidas</th>
                                    <th style={{ padding: '6px', width: '10%', textAlign: 'center' }}>Firma Cliente</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order, idx) => {
                                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                                    const orderNum = getFriendlyOrderId(order);
                                    return (
                                        <tr key={idx} style={{ borderBottom: '1px solid #CBD5E1', backgroundColor: idx % 2 === 0 ? '#FFF' : '#F8FAFC' }}>
                                            <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                                            <td style={{ padding: '6px', fontWeight: '900' }}>#{orderNum}</td>
                                            <td style={{ padding: '6px' }}>
                                                <strong>{clientName}</strong>
                                                <div style={{ fontSize: '7.5pt', color: '#64748B' }}>Tel: {order.profiles?.contact_phone || order.customer_phone || 'N/A'}</div>
                                            </td>
                                            <td style={{ padding: '6px', fontSize: '8pt' }}>{order.shipping_address || order.profiles?.address || 'Bogotá'}</td>
                                            <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold', borderLeft: '1px solid #CBD5E1' }}>
                                                [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]
                                            </td>
                                            <td style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold', borderLeft: '1px solid #CBD5E1' }}>
                                                [ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ]
                                            </td>
                                            <td style={{ padding: '6px', textAlign: 'center', borderLeft: '1px solid #CBD5E1', color: '#94A3B8' }}>
                                                ________________
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt', paddingTop: '15px', borderTop: '1px solid #CBD5E1' }}>
                            <div>Firma del Conductor: ___________________________</div>
                            <div>Firma Despachador en Planta: ___________________________</div>
                            <div>Firma Vigilancia en Puerta: ___________________________</div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
