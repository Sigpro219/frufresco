'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { useParams } from 'next/navigation';
import Letterhead from '@/components/Letterhead';
import { printViaNewWindow } from '@/components/print';

export default function BillingPrintPage() {
    const { id } = useParams();
    const [cut, setCut] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchPrintData = async () => {
            try {
                // 1. Fetch Cut Info
                const { data: cutData } = await supabase.from('billing_cuts').select('*').eq('id', id).single();
                setCut(cutData);

                // 2. Fetch Orders and Items
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select(`
                        id, sequence_id, created_at, total, document_type, remission_with_prices,
                        profiles(company_name, contact_name, contact_phone, address, document_type, remission_with_prices),
                        order_items(quantity, unit_price, nickname, products(name, sku, unit_of_measure))
                    `)
                    .eq('billing_cut_id', id);
                
                setOrders(ordersData || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchPrintData();
    }, [id]);

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Generando documentos oficiales...</div>;

    return (
        <div style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', padding: '1.5rem 1rem' }}>
            <style>
                {`
                @media print {
                    .no-print { display: none !important; }
                    .page-break { page-break-after: always; break-after: page; }
                    body { background: white !important; padding: 0 !important; }
                }
                `}
            </style>

            <div className="no-print" style={{ maxWidth: '850px', margin: '0 auto 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: '1rem 1.5rem', borderRadius: '10px', border: '1px solid #CBD5E1', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: '#0F172A', fontWeight: 900 }}>
                        Vista de Impresión &bull; Corte #{cut?.cut_number}
                    </h2>
                    <p style={{ margin: '2px 0 0', fontSize: '0.80rem', color: '#64748B' }}>
                        {orders.length} documentos listos para emisión en papel membreteado oficial
                    </p>
                </div>
                <button 
                    onClick={() => {
                        if (printDocRef.current) {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: `Corte_Facturacion_${cut?.cut_number || id}`,
                                paperSize: 'letter',
                                orientation: 'portrait',
                                margin: '1.0cm 1.2cm'
                            });
                        }
                    }} 
                    style={{ 
                        padding: '0.65rem 1.4rem', 
                        backgroundColor: '#0D7A57', 
                        color: '#fff', 
                        borderRadius: '8px', 
                        cursor: 'pointer', 
                        border: 'none', 
                        fontWeight: '700', 
                        fontSize: '0.85rem',
                        display: 'inline-flex', 
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 4px 12px rgba(13, 122, 87, 0.25)'
                    }}
                >
                    <Printer size={16} /> Imprimir Todo el Corte
                </button>
            </div>

            <div ref={printDocRef}>
            {orders.map((order) => {
                const docType = order.document_type || order.profiles?.document_type || 'invoice';
                const showPrices = docType === 'invoice' ? true : (order.remission_with_prices ?? order.profiles?.remission_with_prices ?? true);
                const titleText = docType === 'invoice' ? 'FACTURA DE VENTA' : 'REMISIÓN DE ENTREGA';
                const footerSender = docType === 'invoice' ? 'Investments Cortes S.A.S. • Facturación' : 'Investments Cortes S.A.S. • Despachos';

                return (
                    <Letterhead 
                        key={order.id} 
                        title={titleText}
                        date={new Date(order.created_at).toLocaleDateString()}
                        reference={`#${getFriendlyOrderId(order)}`}
                        className="page-break"
                    >
                        <div style={{ padding: '0.35rem 0' }}>
                            {/* Info Cliente */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '8px', marginBottom: '0.65rem', padding: '6px 10px', backgroundColor: '#F8FAFC', borderRadius: '5px', border: '1px solid #E2E8F0', fontSize: '0.68rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.58rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Cliente / Razón Social</div>
                                    <div style={{ fontWeight: 'bold', color: '#0F172A', fontSize: '0.78rem' }}>{order.profiles?.company_name}</div>
                                    <div style={{ color: '#475569' }}>{order.profiles?.contact_name}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.58rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Destino / Entrega</div>
                                    <div style={{ fontWeight: 'bold', color: '#0F172A' }}>{order.profiles?.address}</div>
                                    <div style={{ color: '#475569' }}>Tel: {order.profiles?.contact_phone || 'N/A'}</div>
                                </div>
                            </div>

                            {/* Detalle Productos */}
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '15%' }}>REF / SKU</th>
                                        <th style={{ width: '45%' }}>PRODUCTO</th>
                                        <th style={{ width: '12%' }} className="text-right">CANT</th>
                                        {showPrices && <th style={{ width: '14%' }} className="text-right">VALOR UNIT.</th>}
                                        {showPrices && <th style={{ width: '14%' }} className="text-right">TOTAL</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.order_items?.map((item: any, i: number) => (
                                        <tr key={i}>
                                            <td style={{ fontFamily: 'monospace', color: '#64748B' }}>{item.products?.sku || '---'}</td>
                                            <td><strong>{item.nickname || item.products?.name}</strong></td>
                                            <td className="text-right" style={{ fontWeight: 'bold' }}>{item.quantity}</td>
                                            {showPrices && <td className="text-right">${item.unit_price?.toLocaleString('es-CO')}</td>}
                                            {showPrices && <td className="text-right" style={{ fontWeight: 'bold' }}>${(item.quantity * item.unit_price)?.toLocaleString('es-CO')}</td>}
                                        </tr>
                                    ))}
                                </tbody>
                                {showPrices && (
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #0F172A' }}>
                                            <td colSpan={4} className="text-right" style={{ fontWeight: 800, fontSize: '0.74rem' }}>VALOR TOTAL:</td>
                                            <td className="text-right" style={{ fontWeight: 900, color: '#0D7A57', fontSize: '0.82rem' }}>
                                                ${order.total?.toLocaleString('es-CO')}
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>

                            {/* Firmas de Entrega */}
                            <div style={{ marginTop: '1.2rem', paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', fontSize: '0.66rem' }}>
                                <div>
                                    <div style={{ borderBottom: '1px solid #0F172A', width: '200px', height: '22px' }}></div>
                                    <div style={{ marginTop: '4px', fontWeight: 'bold' }}>{footerSender}</div>
                                    <div style={{ color: '#64748B' }}>Despachado y Verificado en Báscula</div>
                                </div>
                                <div>
                                    <div style={{ borderBottom: '1px solid #0F172A', width: '200px', height: '22px' }}></div>
                                    <div style={{ marginTop: '4px', fontWeight: 'bold' }}>Recibido a Conformidad Cliente</div>
                                    <div style={{ color: '#64748B' }}>Firma, Cédula y Sello de Recepción</div>
                                </div>
                            </div>
                        </div>
                    </Letterhead>
                );
            })}
            </div>
        </div>
    );
}
