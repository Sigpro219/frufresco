'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';

interface LabelInfo {
    name: string;
    sku: string;
    weight: string;
    lote: string;
    vencimiento: string;
}

export default function OrderPrintLabelsPage() {
    const { id } = useParams();
    const router = useRouter();
    const [order, setOrder] = useState<any>(null);
    const [labels, setLabels] = useState<LabelInfo[]>([]);
    const [loading, setLoading] = useState(true);

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
        const fetchOrderAndProcessedItems = async () => {
            try {
                // 1. Fetch Order info
                const { data: orderData } = await supabase
                    .from('orders')
                    .select('id, sequence_id, created_at')
                    .eq('id', id)
                    .single();
                setOrder(orderData);

                // 2. Fetch Order items with products categories
                const { data: itemsData } = await supabase
                    .from('order_items')
                    .select(`
                        id, quantity, nickname,
                        product:products (
                            id, name, sku, category
                        )
                    `)
                    .eq('order_id', id);

                if (itemsData) {
                    const processedItems = itemsData.filter((item: any) => item.product?.category === 'PR');
                    const labelList: LabelInfo[] = [];

                    processedItems.forEach((item: any) => {
                        const qty = item.quantity || 0;
                        const name = item.product?.name || item.nickname || 'Producto Procesado';
                        const sku = item.product?.sku || '';
                        
                        const fullKilos = Math.floor(qty);
                        const remainder = parseFloat((qty - fullKilos).toFixed(3));

                        for (let i = 0; i < fullKilos; i++) {
                            labelList.push({
                                name: name.toUpperCase(),
                                sku,
                                weight: '1 kg',
                                lote: getLoteDate(),
                                vencimiento: getExpirationDate()
                            });
                        }

                        if (remainder > 0) {
                            labelList.push({
                                name: name.toUpperCase(),
                                sku,
                                weight: `${remainder.toString().replace('.', ',')} kg`,
                                lote: getLoteDate(),
                                vencimiento: getExpirationDate()
                            });
                        }
                    });

                    setLabels(labelList);
                }
            } catch (err) {
                console.error('Error fetching labels data:', err);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            fetchOrderAndProcessedItems();
        }
    }, [id]);

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif' }}>
                <h3>Generando etiquetas de procesados...</h3>
            </div>
        );
    }

    if (labels.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'sans-serif', gap: '1rem' }}>
                <h3>No se encontraron productos de la categoría "Procesados" en este pedido.</h3>
                <button 
                    onClick={() => router.back()} 
                    style={{ padding: '8px 16px', backgroundColor: '#334155', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                    Volver
                </button>
            </div>
        );
    }

    return (
        <div style={{ backgroundColor: '#F1F5F9', minHeight: '100vh', padding: '20px 0', boxSizing: 'border-box' }}>
            <style>
                {`
                @media print {
                    body {
                        background: white !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .label-page {
                        page-break-after: always;
                        width: 100mm;
                        height: 50mm;
                        margin: 0 !important;
                        padding: 0 !important;
                        box-sizing: border-box;
                        overflow: hidden;
                    }
                    .label-container {
                        border: none !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                    }
                    @page {
                        size: 100mm 50mm;
                        margin: 0;
                    }
                }
                `}
            </style>

            {/* Control Bar (no-print) */}
            <div className="no-print" style={{ maxWidth: '600px', margin: '0 auto 20px', padding: '15px', backgroundColor: 'white', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'sans-serif' }}>
                <div>
                    <h3 style={{ margin: 0, color: '#1E293B' }}>Etiquetas Térmicas ({labels.length})</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>Pedido ID: #{order?.sequence_id || (typeof id === 'string' ? id.substring(0, 8) : '')}</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        onClick={() => router.back()} 
                        style={{ padding: '8px 16px', backgroundColor: '#F1F5F9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}
                    >
                        Atrás
                    </button>
                    <button 
                        onClick={() => window.print()} 
                        style={{ padding: '8px 16px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        🖨️ Imprimir
                    </button>
                </div>
            </div>

            {/* Printable Labels List */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {labels.map((lbl, idx) => (
                    <div key={idx} className="label-page">
                        <div className="label-container" style={{
                            width: '100mm',
                            height: '50mm',
                            border: '1px solid #CBD5E1',
                            margin: '10px 0',
                            backgroundColor: 'white',
                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                            boxSizing: 'border-box',
                            display: 'flex',
                            fontFamily: 'Arial, sans-serif',
                            color: 'black',
                            padding: '3mm 4mm',
                            overflow: 'hidden'
                        }}>
                            {/* Left Column (Information) */}
                            <div style={{ width: '70mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: '13pt', fontWeight: '900', color: 'black', lineHeight: '1.2', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {lbl.name}
                                    </div>
                                    <div style={{ display: 'flex', gap: '5mm', marginTop: '1.5mm', fontSize: '9.5pt', fontWeight: 'bold' }}>
                                        <div>LOTE: {lbl.lote}</div>
                                        <div>CANTIDAD: {lbl.weight}</div>
                                    </div>
                                    <div style={{ fontSize: '9.5pt', fontWeight: 'bold', marginTop: '1mm' }}>
                                        CONSUMIR ANTES DEL: {lbl.vencimiento}
                                    </div>
                                </div>
                                <div style={{ fontSize: '7.2pt', lineHeight: '1.35', color: '#1E293B', fontWeight: '500' }}>
                                    Único ingrediente.<br />
                                    Consérvese refrigerado de 0°C a 4°C.<br />
                                    Después de abierto consúmase en el menor tiempo posible.<br />
                                    Empacado por Investments Cortes S.A.S.<br />
                                    Bogotá - Colombia.
                                </div>
                            </div>

                            {/* Right Column (Logo & SKU) */}
                            <div style={{ width: '22mm', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', paddingLeft: '2mm', boxSizing: 'border-box' }}>
                                <div style={{ width: '16mm', height: '16mm', position: 'relative' }}>
                                    <img 
                                        src="/logosimbolo.png" 
                                        alt="FruFresco Logo" 
                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                </div>
                                <div style={{ fontSize: '7pt', fontWeight: 'bold', textAlign: 'center', color: '#64748B', wordBreak: 'break-all' }}>
                                    {lbl.sku}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
