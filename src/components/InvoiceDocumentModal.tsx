'use client';

import React, { useRef } from 'react';
import Letterhead from './Letterhead';
import { X, Printer, CheckCircle2, Clock, AlertTriangle, FileText, Truck } from 'lucide-react';
import { printViaNewWindow } from '@/components/print';

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
    const printDocRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        if (printDocRef.current) {
            printViaNewWindow({
                element: printDocRef.current,
                title: `Comprobante_${refCode}`,
                paperSize: 'letter',
                orientation: 'portrait',
                margin: '1.0cm 1.2cm'
            });
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
            <div ref={printDocRef} className="printable-sheet-wrapper" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <Letterhead>
                    {/* Watermark in Background */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-30deg)',
                        width: '400px',
                        height: '400px',
                        backgroundImage: `url(/logo-investments.png)`,
                        backgroundRepeat: 'no-repeat',
                        backgroundPosition: 'center',
                        backgroundSize: 'contain',
                        opacity: 0.03,
                        pointerEvents: 'none',
                        zIndex: 0
                    }} />

                    {/* Metadata columns: Client Info (Left) & Document Info (Right) */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', position: 'relative', zIndex: 1, backgroundColor: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                        <div style={{ width: '55%' }}>
                            <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>
                                DATOS DEL CLIENTE B2B:
                            </div>
                            <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#0F172A', marginBottom: '1px', lineHeight: '1.2' }}>
                                {clientProfile?.company_name || order.profile?.company_name || 'Cliente Institucional'}
                            </div>
                            <div style={{ fontSize: '0.70rem', color: '#475569', lineHeight: '1.35' }}>
                                {(clientProfile?.nit || order.profile?.nit) && (
                                    <div>NIT: {clientProfile?.nit || order.profile?.nit}</div>
                                )}
                                {(order.delivery_address || clientProfile?.address) && (
                                    <div>Dirección: {order.delivery_address || clientProfile?.address}</div>
                                )}
                            </div>
                        </div>

                        <div style={{ width: '45%', textAlign: 'right' }}>
                            <div style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: '800', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '2px' }}>
                                COMPROBANTE DE COMPRA B2B
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: '900', color: '#0D7A57', marginBottom: '1px', fontFamily: 'monospace' }}>
                                {refCode}
                            </div>
                            <div style={{ fontSize: '0.70rem', color: '#475569', lineHeight: '1.35' }}>
                                <div>Fecha Pedido: {orderDate}</div>
                                <div style={{ marginTop: '2px' }}>
                                    Estado: <span style={{
                                        fontWeight: '800',
                                        backgroundColor: statusObj.bg,
                                        color: statusObj.color,
                                        padding: '1px 6px',
                                        borderRadius: '3px',
                                        fontSize: '0.65rem',
                                        display: 'inline-block'
                                    }}>{statusObj.label}</span>
                                </div>
                                {deliveryDateStr && (
                                    <div style={{ marginTop: '1px' }}>Entrega: {deliveryDateStr}</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ITEMS TABLE - Standard Compact */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '0.85rem', position: 'relative', zIndex: 1 }}>
                        <thead>
                            <tr>
                                <th style={{ width: '5%', textAlign: 'center' }}>#</th>
                                <th style={{ width: '14%' }}>SKU</th>
                                <th style={{ width: '45%' }}>Producto / Descripción</th>
                                <th style={{ width: '12%', textAlign: 'center' }}>Cant.</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>Valor Unit.</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>Total</th>
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
                                    <tr key={item.id || idx}>
                                        <td style={{ textAlign: 'center', color: '#94A3B8', fontWeight: '700' }}>
                                            {String(idx + 1).padStart(2, '0')}
                                        </td>
                                        <td style={{ fontFamily: 'monospace', color: '#64748B' }}>
                                            {sku}
                                        </td>
                                        <td style={{ fontWeight: '700', color: '#0F172A' }}>
                                            {pName}
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: '800', color: '#0F172A' }}>
                                            {formatQuantity(qty)} <span style={{ fontSize: '0.62rem', color: '#64748B', fontWeight: '600' }}>{unit}</span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: '600', color: '#334155' }}>
                                            ${formatPrice(price)}
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: '800', color: '#0F172A' }}>
                                            ${formatPrice(itemSubtotal)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* FINANCIAL SUMMARY TOTALS - Aligned to Right */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.85rem', position: 'relative', zIndex: 1 }}>
                        <div style={{ width: '240px', backgroundColor: '#F8FAFC', padding: '6px 10px', borderRadius: '5px', border: '1px solid #E2E8F0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: '0.70rem', color: '#475569' }}>
                                <span>Subtotal:</span>
                                <span style={{ fontWeight: '700', color: '#0F172A' }}>${formatPrice(calculatedSubtotal)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: '0.70rem', color: '#475569' }}>
                                <span>Impuestos (IVA 0%):</span>
                                <span style={{ fontWeight: '700', color: '#0F172A' }}>$0</span>
                            </div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                borderTop: '1.5px solid #0F172A',
                                marginTop: '3px',
                                paddingTop: '3px',
                                fontSize: '0.85rem',
                                fontWeight: '900'
                            }}>
                                <span style={{ color: '#0F172A' }}>TOTAL</span>
                                <span style={{ color: '#0D7A57' }}>${formatPrice(totalAmount)}</span>
                            </div>
                        </div>
                    </div>
                </Letterhead>
            </div>
        </div>
    );
}
