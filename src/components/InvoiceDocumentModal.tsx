'use client';

import React from 'react';
import Letterhead from './Letterhead';
import { X, Printer, CheckCircle2, Clock, AlertTriangle, FileText, Truck } from 'lucide-react';

interface OrderItem {
    id?: string;
    product_id?: string;
    quantity: number;
    unit_price?: number;
    unit?: string;
    nickname?: string;
    products?: {
        name?: string;
        name_en?: string;
        unit_of_measure?: string;
        sku?: string;
        base_price?: number;
    };
}

interface InvoiceDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any | null;
    clientProfile: any | null;
}

export default function InvoiceDocumentModal({
    isOpen,
    onClose,
    order,
    clientProfile
}: InvoiceDocumentModalProps) {
    if (!isOpen || !order) return null;

    const orderDate = order.created_at
        ? new Date(order.created_at).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
          })
        : 'Fecha N/A';

    const deliveryDateStr = order.delivery_date
        ? new Date(order.delivery_date).toLocaleDateString('es-CO', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
          })
        : null;

    const refCode = order.sequence_id
        ? `PED-${order.sequence_id}`
        : `PED-${order.id.substring(0, 8).toUpperCase()}`;

    const items: OrderItem[] = order.order_items || [];

    const formatPrice = (val: number | string | null | undefined): string => {
        const num = Math.round(Number(val) || 0);
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    const formatQuantity = (val: number | string | null | undefined): string => {
        const num = Number(val) || 0;
        return num.toString().replace('.', ',');
    };

    const calculatedSubtotal = items.reduce((acc, item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.unit_price || item.products?.base_price || 0);
        return acc + (qty * price);
    }, 0);

    const totalAmount = Number(order.total || order.subtotal || calculatedSubtotal);

    const handlePrint = () => {
        if (typeof window !== 'undefined') {
            window.print();
        }
    };

    const getStatusLabel = (st: string) => {
        const statusMap: Record<string, { label: string; bg: string; color: string }> = {
            'pending_approval': { label: 'PENDIENTE DE APROBACIÓN', bg: '#FEF3C7', color: '#92400E' },
            'pending': { label: 'PENDIENTE', bg: '#FEF3C7', color: '#92400E' },
            'approved': { label: 'APROBADO', bg: '#E0F2FE', color: '#0369A1' },
            'in_preparation': { label: 'EN ENLISTAMIENTO', bg: '#FDE68A', color: '#78350F' },
            'in_transit': { label: 'EN RUTA DE ENTREGA', bg: '#DBEAFE', color: '#1E40AF' },
            'delivered': { label: 'ENTREGADO', bg: '#DCFCE7', color: '#166534' },
            'cancelled': { label: 'CANCELADO', bg: '#FEE2E2', color: '#991B1B' },
        };
        const key = (st || '').toLowerCase();
        return statusMap[key] || { label: (st || 'PENDIENTE').toUpperCase(), bg: '#F1F5F9', color: '#475569' };
    };

    const statusObj = getStatusLabel(order.status);

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            overflowY: 'auto',
            padding: '1.5rem 1rem'
        }}>
            {/* Top Toolbar (Excluded from print) */}
            <div 
                className="no-print" 
                style={{
                    width: '100%',
                    maxWidth: '210mm',
                    backgroundColor: 'white',
                    padding: '0.85rem 1.25rem',
                    borderRadius: '16px',
                    marginBottom: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ 
                        width: '36px', 
                        height: '36px', 
                        borderRadius: '10px', 
                        backgroundColor: '#ECFDF5', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        color: 'var(--primary)'
                    }}>
                        <FileText size={20} strokeWidth={2.2} />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#0F172A' }}>
                            Comprobante B2B {refCode}
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B', fontWeight: '600' }}>
                            {clientProfile?.company_name || 'Cliente Institucional'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button
                        onClick={handlePrint}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            border: 'none',
                            padding: '0.55rem 1.25rem',
                            borderRadius: '10px',
                            fontWeight: '800',
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Printer size={16} strokeWidth={2.2} /> Imprimir / PDF
                    </button>

                    <button
                        onClick={onClose}
                        style={{
                            background: '#F1F5F9',
                            border: 'none',
                            color: '#64748B',
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                        title="Cerrar"
                    >
                        <X size={18} strokeWidth={2.2} />
                    </button>
                </div>
            </div>

            {/* Printable Document Sheet Container */}
            <div className="printable-sheet-wrapper" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <Letterhead 
                    title="COMPROBANTE DE COMPRA B2B" 
                    date={orderDate} 
                    reference={refCode}
                >
                    {/* CLIENT DETAILS BOX */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 1fr',
                        gap: '1.5rem',
                        backgroundColor: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: '12px',
                        padding: '1.25rem',
                        marginBottom: '1.5rem'
                    }}>
                        <div>
                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>
                                DATOS DEL CLIENTE B2B
                            </span>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '1.1rem', fontWeight: '800', color: '#0F172A' }}>
                                {clientProfile?.company_name || order.profile?.company_name || 'Cliente Institucional'}
                            </h3>
                            {clientProfile?.nit && (
                                <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', color: '#475569', fontWeight: '600' }}>
                                    NIT: {clientProfile.nit}
                                </p>
                            )}
                            {(order.delivery_address || clientProfile?.address) && (
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', fontWeight: '500' }}>
                                    📍 Dirección: {order.delivery_address || clientProfile?.address}
                                </p>
                            )}
                        </div>

                        <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                                ESTADO DEL PEDIDO
                            </span>
                            <span style={{
                                display: 'inline-block',
                                backgroundColor: statusObj.bg,
                                color: statusObj.color,
                                padding: '4px 10px',
                                borderRadius: '6px',
                                fontSize: '0.75rem',
                                fontWeight: '800',
                                marginBottom: '8px'
                            }}>
                                {statusObj.label}
                            </span>
                            {deliveryDateStr && (
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#475569', fontWeight: '600' }}>
                                    🚚 Entrega Programada: {deliveryDateStr}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* ITEMS TABLE */}
                    <div style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.88rem',
                            fontFamily: 'var(--font-outfit), sans-serif'
                        }}>
                            <thead>
                                <tr style={{ backgroundColor: '#1E3A8A', color: 'white', textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: '800' }}>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left', borderRadius: '6px 0 0 6px' }}>#</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>SKU</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'left' }}>Producto / Descripción</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'center' }}>Cantidad</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right' }}>Precio Unit.</th>
                                    <th style={{ padding: '0.65rem 0.85rem', textAlign: 'right', borderRadius: '0 6px 6px 0' }}>Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, idx) => {
                                    const pName = item.nickname || item.products?.name || 'Producto';
                                    const sku = item.products?.sku || 'N/A';
                                    const qty = Number(item.quantity || 0);
                                    const unit = item.unit || item.products?.unit_of_measure || 'Kg';
                                    const price = Number(item.unit_price || item.products?.base_price || 0);
                                    const itemSubtotal = qty * price;

                                    return (
                                        <tr key={item.id || idx} style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: idx % 2 === 0 ? 'white' : '#F8FAFC' }}>
                                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#94A3B8' }}>{idx + 1}</td>
                                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: '600', fontFamily: 'monospace', color: '#64748B', fontSize: '0.8rem' }}>{sku}</td>
                                            <td style={{ padding: '0.65rem 0.85rem', fontWeight: '700', color: '#0F172A' }}>{pName}</td>
                                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'center', fontWeight: '800', color: 'var(--primary)' }}>
                                                {formatQuantity(qty)} <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: '600' }}>{unit}</span>
                                            </td>
                                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: '600', color: '#475569' }}>
                                                ${formatPrice(price)}
                                            </td>
                                            <td style={{ padding: '0.65rem 0.85rem', textAlign: 'right', fontWeight: '800', color: '#0F172A' }}>
                                                ${formatPrice(itemSubtotal)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* FINANCIAL SUMMARY TOTALS */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        marginBottom: '2rem'
                    }}>
                        <div style={{
                            width: '280px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '12px',
                            padding: '1rem'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.85rem', color: '#475569' }}>
                                <span>Subtotal Productos:</span>
                                <span style={{ fontWeight: '700' }}>${formatPrice(calculatedSubtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                                <span>Impuestos (IVA):</span>
                                <span style={{ fontWeight: '700' }}>$0</span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                paddingTop: '0.75rem',
                                borderTop: '2px solid #1E3A8A',
                                fontSize: '1.05rem',
                                fontWeight: '900',
                                color: '#0F172A'
                            }}>
                                <span>Total General:</span>
                                <span style={{ color: 'var(--primary)' }}>${formatPrice(totalAmount)}</span>
                            </div>
                        </div>
                    </div>

                    {/* FOOTER NOTE */}
                    <div style={{
                        borderTop: '1px dashed #CBD5E1',
                        paddingTop: '1rem',
                        fontSize: '0.78rem',
                        color: '#64748B',
                        lineHeight: '1.5',
                        textAlign: 'center'
                    }}>
                        <p style={{ margin: 0, fontWeight: '600' }}>
                            Comprobante digital generado desde el Portal B2B de <strong>FruFresco / Investments Cortes S.A.S.</strong>
                        </p>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.72rem', color: '#94A3B8' }}>
                            Para cualquier inquietud relacionada con su entrega o facturación electrónica, comuníquese con su asesor comercial asignado.
                        </p>
                    </div>
                </Letterhead>
            </div>
        </div>
    );
}
