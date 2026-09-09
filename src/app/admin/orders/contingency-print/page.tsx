'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { Printer, ShieldAlert, ArrowLeft } from 'lucide-react';
import Letterhead from '@/components/Letterhead';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { printViaNewWindow } from '@/components/print';

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
    warehouse_spaces?: number[];
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
    const printDocRef = useRef<HTMLDivElement>(null);

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
                        shipping_address, admin_notes, special_notes, warehouse_spaces,
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
                        onClick={() => {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: `Kit de Contingencia - ${orders.length} Pedidos (${mode.toUpperCase()})`,
                                paperSize: 'letter',
                                orientation: 'portrait'
                            });
                        }}
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

            {/* Printable Container (Attached ref for clean new-window printing) */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* ========================================================= */}
                {/* 1. PLANILLA DE COMPRAS CORABASTOS (FÍSICA DE PISO)        */}
                {/* ========================================================= */}
                {showPurchases && (
                    <Letterhead
                        title="Planilla Maestra de Compras (Corabastos)"
                        subtitle="INVESTMENTS CORTES S.A.S. · Central de Abastos Corabastos · Operación de Contingencia"
                        date={orders[0]?.delivery_date || new Date().toISOString().split('T')[0]}
                        reference={`SKUs: ${consolidatedPurchases.length}`}
                        badge="COMPRAS CORABASTOS"
                        badgeVariant="dark"
                        className="page-break"
                    >
                        <div style={{ backgroundColor: '#F8FAFC', padding: '4px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.64rem', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                            <span><strong>Instrucciones para Plaza:</strong> Registre el precio pactado por kilo/bulto y el puesto o bodega en Corabastos.</span>
                            <span><strong>Pedidos amparados:</strong> {orders.length}</span>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                                    <th style={{ width: '40%' }}>Producto / Descripción</th>
                                    <th style={{ width: '7%', textAlign: 'center' }}>Und</th>
                                    <th style={{ width: '12%', textAlign: 'right' }}>Demanda Neta</th>
                                    <th style={{ width: '13%', textAlign: 'right' }}>+Merma (5%)</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>Precio $/Kg</th>
                                    <th style={{ width: '12%', textAlign: 'center' }}>Comprado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {consolidatedPurchases.map((p, idx) => {
                                    const withMerma = (p.totalQty * 1.05).toFixed(1);
                                    return (
                                        <tr key={idx}>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                                            <td>
                                                <strong>{p.name}</strong> {p.sku !== 'N/A' && <span style={{ fontSize: '0.60rem', color: '#64748B' }}>({p.sku})</span>}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>{p.unit}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                {p.totalQty.toLocaleString('es-CO')}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: '900', color: '#0F172A' }}>
                                                {withMerma}
                                            </td>
                                            <td style={{ textAlign: 'center', borderBottom: '1px dashed #CBD5E1' }}>$ ________</td>
                                            <td style={{ textAlign: 'center', borderBottom: '1px dashed #CBD5E1' }}>________</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                            <div>Firma Comprador en Corabastos: ___________________________</div>
                            <div>Firma Recibido en Bodega Central: ___________________________</div>
                        </div>
                    </Letterhead>
                )}


                {/* ========================================================= */}
                {/* 2. HOJAS DE PICKING DE BODEGA Y PESAJE EN BÁSCULA         */}
                {/* ========================================================= */}
                {showPicking && orders.map((order, orderIdx) => {
                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                    const orderNum = getFriendlyOrderId(order);
                    const espacioNum = (order.warehouse_spaces && order.warehouse_spaces.length > 0)
                        ? formatSpaceLabel(order.warehouse_spaces)
                        : (order.sequence_id ? `${order.sequence_id}` : `${orderIdx + 1}`);

                    return (
                        <Letterhead
                            key={`picking-${order.id}`}
                            title="Hoja de Picking & Pesaje en Báscula"
                            subtitle={`CLIENTE: ${clientName.toUpperCase()}`}
                            date={order.delivery_date}
                            reference={`PEDIDO #${orderNum}`}
                            espacioNum={espacioNum}
                            badge="BÁSCULA Y ALISTAMIENTO"
                            badgeVariant="amber"
                            className="page-break"
                        >
                            {/* Metadata cliente compacta */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', backgroundColor: '#F8FAFC', padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.66rem', marginBottom: '5px' }}>
                                <div>
                                    <div><strong>Dirección:</strong> {order.shipping_address || order.profiles?.address || 'Bogotá'}</div>
                                    <div><strong>Contacto:</strong> {order.profiles?.contact_phone || order.customer_phone || 'N/A'}</div>
                                </div>
                                <div>
                                    <div><strong>Franja Horaria:</strong> {order.delivery_slot || 'AM (05:00 - 08:00)'}</div>
                                    <div><strong>Líneas Solicitadas:</strong> {(order.order_items || []).length} ítems</div>
                                </div>
                            </div>

                            {order.admin_notes && (
                                <div style={{ backgroundColor: '#FEF3C7', border: '1px solid #FCD34D', padding: '3px 8px', borderRadius: '4px', fontSize: '0.64rem', marginBottom: '5px', color: '#92400E' }}>
                                    <strong>Instrucciones Especiales:</strong> {order.admin_notes}
                                </div>
                            )}

                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '4%', textAlign: 'center' }}>[✓]</th>
                                        <th style={{ width: '46%' }}>Producto / Especificación</th>
                                        <th style={{ width: '12%', textAlign: 'right' }}>Cant. Pedida</th>
                                        <th style={{ width: '8%', textAlign: 'center' }}>Und</th>
                                        <th style={{ width: '15%', textAlign: 'center', backgroundColor: '#1E293B' }}>Peso Real Báscula</th>
                                        <th style={{ width: '15%', textAlign: 'center' }}>Lote / Novedad</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(order.order_items || []).map((itm, itmIdx) => {
                                        const pName = itm.nickname || itm.products?.name || 'Producto';
                                        const unit = itm.unit || itm.products?.unit_of_measure || 'Kg';
                                        return (
                                            <tr key={itmIdx}>
                                                <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>&#9633;</td>
                                                <td>
                                                    <strong>{pName}</strong>
                                                    {itm.variant_label && <span style={{ fontSize: '0.60rem', color: '#475569' }}> ({itm.variant_label})</span>}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                                    {Number(itm.quantity || 0).toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>{unit}</td>
                                                <td style={{ textAlign: 'center', borderLeft: '1px solid #E2E8F0', borderRight: '1px solid #E2E8F0', fontWeight: 'bold', backgroundColor: '#FFFFFF' }}>
                                                    ______ kg
                                                </td>
                                                <td style={{ textAlign: 'center', color: '#64748B' }}>
                                                    ________________
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div style={{ marginTop: 'auto', borderTop: '1px solid #E2E8F0', paddingTop: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', fontSize: '0.64rem' }}>
                                <div>
                                    <div><strong>Alistador / Pesador:</strong></div>
                                    <div style={{ marginTop: '8px' }}>Firma: ___________________________</div>
                                </div>
                                <div>
                                    <div><strong>Auditor de Calidad:</strong></div>
                                    <div style={{ marginTop: '8px' }}>Firma: ___________________________</div>
                                </div>
                                <div>
                                    <div><strong>Total Canastillas Usadas:</strong></div>
                                    <div style={{ marginTop: '8px' }}>[ _____ ] Canastillas Plásticas</div>
                                </div>
                            </div>
                        </Letterhead>
                    );
                })}


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
                    const espacioNum = (order.warehouse_spaces && order.warehouse_spaces.length > 0)
                        ? formatSpaceLabel(order.warehouse_spaces)
                        : (order.sequence_id ? `${order.sequence_id}` : `${orderIdx + 1}`);
                    const itemsCount = (order.order_items || []).length;

                    // Cada pedido genera 2 hojas consecutivas: Original y Copia
                    return [
                        { copyType: 'ORIGINAL - CLIENTE', isCopy: false },
                        { copyType: 'COPIA - TRANSPORTADOR / CONTABILIDAD', isCopy: true }
                    ].map((copyInfo, copyIdx) => (
                        <Letterhead
                            key={`remission-${order.id}-copy-${copyIdx}`}
                            title={`${remissionPrefix} #${orderNum}`}
                            subtitle={`CLIENTE: ${clientName.toUpperCase()}`}
                            date={order.delivery_date}
                            reference={`ORDEN: ${orderNum}`}
                            badge={copyInfo.copyType}
                            badgeVariant={copyInfo.isCopy ? 'light' : 'dark'}
                            espacioNum={espacioNum}
                            className="page-break"
                        >
                            {/* Poka-Yoke Banner Reposición si aplica */}
                            {isReposicion && (
                                <div style={{ backgroundColor: '#FEF2F2', border: '1.2px solid #EF4444', padding: '4px 8px', borderRadius: '4px', marginBottom: '5px', fontSize: '0.64rem', color: '#991B1B', fontWeight: 'bold' }}>
                                    RECUERDE: Los productos en este documento NO TIENEN COBRO (Reposición de Calidad autorizada por Servicio al Cliente).
                                </div>
                            )}

                            {/* Client & Route Micro-Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '8px', backgroundColor: '#F8FAFC', padding: '5px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.66rem', marginBottom: '5px' }}>
                                <div>
                                    <div><strong>CLIENTE:</strong> {clientName}</div>
                                    <div><strong>NIT / C.C.:</strong> {order.profiles?.nit || 'N/A'}</div>
                                    <div><strong>DIRECCIÓN:</strong> {order.shipping_address || order.profiles?.address || 'Bogotá'}</div>
                                    <div><strong>TELÉFONO:</strong> {order.profiles?.contact_phone || order.customer_phone || 'N/A'}</div>
                                </div>
                                <div>
                                    <div><strong>FECHA DESPACHO:</strong> {order.delivery_date}</div>
                                    <div><strong>FRANJA HORARIA:</strong> {order.delivery_slot || 'AM (05:00 - 08:00)'}</div>
                                    <div><strong>LÍNEAS DE PEDIDO:</strong> {itemsCount} productos solicitados</div>
                                    {order.special_notes && <div><strong>OBSERVACIÓN:</strong> {order.special_notes}</div>}
                                </div>
                            </div>

                            {/* Products Table con columna KG-UN recibe compacta */}
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '4%', textAlign: 'center' }}>P</th>
                                        <th style={{ width: '42%' }}>Descripción del Producto</th>
                                        <th style={{ width: '9%', textAlign: 'right' }}>Cant.</th>
                                        <th style={{ width: '7%', textAlign: 'center' }}>UM</th>
                                        <th style={{ width: '12%', textAlign: 'right' }}>Valor/UM</th>
                                        <th style={{ width: '12%', textAlign: 'right' }}>Total</th>
                                        <th style={{ width: '14%', textAlign: 'center', backgroundColor: '#1E293B', color: '#FFFFFF' }}>KG-UN recibe</th>
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
                                            <tr key={idx}>
                                                <td style={{ textAlign: 'center', fontSize: '0.75rem' }}>&#9633;</td>
                                                <td>
                                                    <strong>{pName}</strong>
                                                    {itm.variant_label && <span style={{ fontSize: '0.60rem', color: '#64748B' }}> ({itm.variant_label})</span>}
                                                </td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{qty.toLocaleString('es-CO')}</td>
                                                <td style={{ textAlign: 'center' }}>{unit}</td>
                                                <td style={{ textAlign: 'right' }}>{price > 0 ? formatMoney(price) : '$0'}</td>
                                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>{lineTotal > 0 ? formatMoney(lineTotal) : '$0'}</td>
                                                <td style={{ textAlign: 'center', borderLeft: '1px solid #CBD5E1', borderRight: '1px solid #CBD5E1', fontWeight: 'bold', backgroundColor: '#FFFFFF' }}>
                                                    __________
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            {/* Summary & Canastillas Control Compact */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                                <div style={{ width: '56%', fontSize: '0.64rem', color: '#334155' }}>
                                    <div style={{ fontWeight: 'bold', color: '#0F172A', marginBottom: '2px' }}>Control de Canastillas Plásticas:</div>
                                    <div style={{ display: 'flex', gap: '10px', border: '1px dashed #94A3B8', padding: '3px 6px', borderRadius: '4px', backgroundColor: '#F8FAFC' }}>
                                        <div>Entregadas: <strong>[ _____ ]</strong></div>
                                        <div>Recogidas: <strong>[ _____ ]</strong></div>
                                    </div>
                                    <div style={{ marginTop: '2px', fontSize: '0.56rem', color: '#64748B' }}>
                                        * Activos en comodato propiedad exclusiva de FruFresco. Retorne al conductor igual cantidad recibida.
                                    </div>
                                </div>

                                <div style={{ width: '38%', backgroundColor: '#F8FAFC', padding: '3px 8px', border: '1px solid #E2E8F0', borderRadius: '4px', fontSize: '0.68rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                                        <span>Subtotal:</span>
                                        <span style={{ fontWeight: 'bold' }}>{isReposicion ? '$0' : formatMoney(subtotal)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1px' }}>
                                        <span>IVA:</span>
                                        <span>{isReposicion ? '$0' : formatMoney(order.tax || 0)}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1.5px solid #0F172A', paddingTop: '2px', fontSize: '0.82rem', fontWeight: '900' }}>
                                        <span>TOTAL:</span>
                                        <span style={{ color: '#0D7A57' }}>{isReposicion ? '$0' : formatMoney(order.total || subtotal)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Signatures Block Compact */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', border: '1px solid #0F172A', padding: '5px 8px', borderRadius: '4px', fontSize: '0.62rem', marginTop: 'auto' }}>
                                <div>
                                    <div style={{ fontWeight: '900', marginBottom: '2px' }}>FIRMA Y CÉDULA DE QUIEN RECIBE A CONFORMIDAD:</div>
                                    <div style={{ marginTop: '12px', borderBottom: '1px solid #0F172A', width: '85%' }}></div>
                                    <div style={{ marginTop: '2px' }}>Nombre Legible: ____________________________________</div>
                                    <div style={{ marginTop: '2px' }}>C.C. / Cargo: _______________________________________</div>
                                </div>
                                <div>
                                    <div style={{ fontWeight: '900', marginBottom: '2px' }}>SELLO / NOVEDADES EN SITIO:</div>
                                    <div style={{ height: '32px', border: '1px dashed #CBD5E1', borderRadius: '3px', padding: '2px', color: '#94A3B8', fontSize: '0.56rem' }}>
                                        Sello húmedo del establecimiento o relación de devoluciones/faltantes firmados.
                                    </div>
                                </div>
                            </div>
                        </Letterhead>
                    ));
                })}


                {/* ========================================================= */}
                {/* 4. MANIFIESTO DE RUTA & CONTROL DE CANASTILLAS            */}
                {/* ========================================================= */}
                {showDispatch && (
                    <Letterhead
                        title="Manifiesto de Ruta & Control de Canastillas"
                        subtitle="DESPACHO DE CONTINGENCIA · SALIDA DE PLANTA Y VIGILANCIA EN PORTERÍA"
                        date={orders[0]?.delivery_date || new Date().toISOString().split('T')[0]}
                        reference={`TOTAL PARADAS: ${orders.length}`}
                        badge="DESPACHO & VIGILANCIA"
                        badgeVariant="emerald"
                        className="page-break"
                    >
                        {/* Driver & Vehicle Box */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', backgroundColor: '#F8FAFC', padding: '5px 8px', borderRadius: '4px', border: '1px solid #E2E8F0', fontSize: '0.68rem', marginBottom: '6px' }}>
                            <div><strong>Conductor Asignado:</strong> ______________________</div>
                            <div><strong>Placa del Vehículo:</strong> ______________________</div>
                            <div><strong>Hora Salida Planta:</strong> ______:______ AM</div>
                        </div>

                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '4%', textAlign: 'center' }}>#</th>
                                    <th style={{ width: '10%' }}>Pedido</th>
                                    <th style={{ width: '30%' }}>Cliente / Razón Social</th>
                                    <th style={{ width: '26%' }}>Dirección de Entrega</th>
                                    <th style={{ width: '10%', textAlign: 'center' }}>Canastillas Salida</th>
                                    <th style={{ width: '10%', textAlign: 'center' }}>Canastillas Retorno</th>
                                    <th style={{ width: '10%', textAlign: 'center' }}>Firma Cliente</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.map((order, idx) => {
                                    const clientName = order.profiles?.company_name || order.profiles?.contact_name || order.customer_name || 'Cliente';
                                    const orderNum = getFriendlyOrderId(order);
                                    return (
                                        <tr key={idx}>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{idx + 1}</td>
                                            <td style={{ fontWeight: '900' }}>#{orderNum}</td>
                                            <td>
                                                <strong>{clientName}</strong>
                                                <div style={{ fontSize: '0.58rem', color: '#64748B' }}>Tel: {order.profiles?.contact_phone || order.customer_phone || 'N/A'}</div>
                                            </td>
                                            <td>{order.shipping_address || order.profiles?.address || 'Bogotá'}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>[ &nbsp;&nbsp;&nbsp;&nbsp; ]</td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>[ &nbsp;&nbsp;&nbsp;&nbsp; ]</td>
                                            <td style={{ textAlign: 'center', color: '#94A3B8' }}>________________</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                            <div>Firma del Conductor: ___________________________</div>
                            <div>Firma Despachador en Planta: ___________________________</div>
                            <div>Firma Vigilancia en Portería: ___________________________</div>
                        </div>
                    </Letterhead>
                )}

            </div>
        </div>
    );
}
