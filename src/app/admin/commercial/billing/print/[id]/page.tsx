
'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { useParams } from 'next/navigation';

export default function BillingPrintPage() {
    const { id } = useParams();
    const [cut, setCut] = useState<any>(null);
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

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
                        id, sequence_id, created_at, total,
                        profiles(company_name, contact_name, contact_phone, address),
                        order_items(quantity, unit_price, products(name, sku, unit_of_measure))
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

    if (loading) return <div>Generando documentos...</div>;

    return (
        <div style={{ padding: '20px', backgroundColor: 'white', minHeight: '100vh', color: 'black' }}>
            <style>
                {`
                @media print {
                    .no-print { display: none; }
                    .page-break { page-break-after: always; }
                    body { background: white; padding: 0; }
                }
                `}
            </style>

            <div className="no-print" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                <h2 style={{ margin: 0 }}>Vista de Impresión - Corte #{cut?.cut_number}</h2>
                <button onClick={() => window.print()} style={{ padding: '10px 20px', background: '#000', color: '#fff', borderRadius: '5px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}>
                    🖨️ Imprimir Todo
                </button>
            </div>

            {orders.map((order, index) => (
                <div key={order.id} className="page-break" style={{ padding: '40px', border: '1px solid #000', marginBottom: '40px', position: 'relative' }}>
                    {/* Header Documento */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>REMISION DE ENTREGA</h1>
                            <p style={{ margin: '5px 0' }}>Frubana Express Colombia</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>#{getFriendlyOrderId(order)}</div>
                            <p style={{ margin: 0 }}>{new Date(order.created_at).toLocaleDateString()}</p>
                        </div>
                    </div>

                    {/* Info Cliente */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px', padding: '15px', backgroundColor: '#f9f9f9', borderRadius: '5px' }}>
                        <div>
                            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Cliente</div>
                            <div style={{ fontWeight: 'bold' }}>{order.profiles?.company_name}</div>
                            <div>{order.profiles?.contact_name}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Destino / Observaciones</div>
                            <div style={{ fontWeight: 'bold' }}>{order.profiles?.address}</div>
                            <div>Tel: {order.profiles?.contact_phone}</div>
                        </div>
                    </div>

                    {/* Detalle Productos */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #000' }}>
                                <th style={{ textAlign: 'left', padding: '10px 5px' }}>REF</th>
                                <th style={{ textAlign: 'left', padding: '10px 5px' }}>PRODUCTO</th>
                                <th style={{ textAlign: 'right', padding: '10px 5px' }}>CANT</th>
                                <th style={{ textAlign: 'right', padding: '10px 5px' }}>UNI</th>
                                <th style={{ textAlign: 'right', padding: '10px 5px' }}>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.order_items.map((item: any, i: number) => (
                                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '10px 5px' }}>{item.products.sku}</td>
                                    <td style={{ padding: '10px 5px' }}>{item.products.name}</td>
                                    <td style={{ padding: '10px 5px', textAlign: 'right' }}>{item.quantity}</td>
                                    <td style={{ padding: '10px 5px', textAlign: 'right' }}>${item.unit_price?.toLocaleString()}</td>
                                    <td style={{ padding: '10px 5px', textAlign: 'right' }}>${(item.quantity * item.unit_price)?.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={4} style={{ textAlign: 'right', padding: '20px 5px', fontWeight: 'bold' }}>VALOR TOTAL</td>
                                <td style={{ textAlign: 'right', padding: '20px 5px', fontWeight: 'bold', fontSize: '18px' }}>${order.total?.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Firma */}
                    <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ borderTop: '1px solid #000', width: '250px', paddingTop: '10px', textAlign: 'center' }}>
                            Frubana Despachos
                        </div>
                        <div style={{ borderTop: '1px solid #000', width: '250px', paddingTop: '10px', textAlign: 'center' }}>
                            Recibe Conforme (Firma y Sello)
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
