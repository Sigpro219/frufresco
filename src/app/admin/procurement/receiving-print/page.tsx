'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, Truck, Calendar } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import { printViaNewWindow, PrintDocumentSwitcher } from '@/components/print';

interface ProductEntry {
    product_id: string;
    product_name: string;
    accounting_id?: number | string | null;
    unit: string;
    sublist: string;
}

export default function ReceivingPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const rawOrderIds = searchParams.get('orderIds') || searchParams.get('ids') || '';
    const paramDate = searchParams.get('date');
    const printDocRef = useRef<HTMLDivElement>(null);

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [paperFormat, setPaperFormat] = useState<'oficio' | 'letter'>('oficio');
    const [rowsPerPage, setRowsPerPage] = useState<number>(46);
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<ProductEntry[]>([]);
    const [generatedAt, setGeneratedAt] = useState<string>('');

    // Sincronizar filas por defecto al cambiar formato de papel (Carta: 36, Oficio: 46)
    useEffect(() => {
        setRowsPerPage(paperFormat === 'oficio' ? 46 : 36);
    }, [paperFormat]);

    // Altura calculada para ocupar toda la hoja armónicamente sin desbordar ni dejar huecos:
    // Área vertical útil estimada para el cuerpo de la tabla (descontando cabecera y pie):
    // Carta (279.4mm): ~234mm útiles | Oficio (330mm): ~285mm útiles
    const availableTbodyHeightMm = paperFormat === 'oficio' ? 285 : 234;
    const rowHeightMm = Math.min(8.5, Math.max(5.0, availableTbodyHeightMm / rowsPerPage));
    const rowHeightPx = Math.round(rowHeightMm * 3.78);

    useEffect(() => {
        const now = new Date();
        const datePart = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timePart = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        setGeneratedAt(`${datePart} ${timePart}`);
    }, [selectedDate]);

    useEffect(() => {
        if (paramDate && paramDate !== selectedDate) {
            setSelectedDate(paramDate);
        }
    }, [paramDate]);

    useEffect(() => {
        fetchReceivingData();
    }, [selectedDate, rawOrderIds]);

    const fetchReceivingData = async () => {
        setLoading(true);
        try {
            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id,
                    delivery_date,
                    status,
                    order_items (
                        id,
                        product_id,
                        quantity,
                        unit,
                        products (
                            id,
                            name,
                            unit_of_measure,
                            purchase_sublist,
                            weight_kg,
                            accounting_id
                        )
                    )
                `);

            if (rawOrderIds) {
                const ids = rawOrderIds.split(',').map(id => id.trim()).filter(Boolean);
                if (ids.length > 0) {
                    ordersQuery = ordersQuery.in('id', ids).neq('status', 'cancelled');
                } else {
                    ordersQuery = ordersQuery.eq('delivery_date', selectedDate).neq('status', 'cancelled');
                }
            } else {
                const OPERATIONAL_STATUSES = ['pending_approval', 'para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'];
                ordersQuery = ordersQuery.eq('delivery_date', selectedDate).in('status', OPERATIONAL_STATUSES);
            }

            const [ordersRes, tasksRes] = await Promise.all([
                ordersQuery,
                supabase
                    .from('procurement_tasks')
                    .select('*')
                    .eq('delivery_date', selectedDate)
            ]);

            const ordersWithItems = ordersRes.data || [];
            const rawTasks = tasksRes.data || [];

            const productMap = new Map<string, ProductEntry>();

            ordersWithItems.forEach((ord: any) => {
                (ord.order_items || []).forEach((it: any) => {
                    const prod = it.products;
                    if (!prod || !prod.name) return;
                    const pId = prod.id || it.product_id;
                    if (!productMap.has(pId)) {
                        productMap.set(pId, {
                            product_id: pId,
                            product_name: prod.name.trim(),
                            accounting_id: prod.accounting_id,
                            unit: prod.unit_of_measure || it.unit || 'KG',
                            sublist: (prod.purchase_sublist || 'GENERAL').toUpperCase().trim()
                        });
                    }
                });
            });

            // Tareas huérfanas en procurement_tasks si las hubiera
            if (rawTasks.length > 0) {
                const orphanTasks = rawTasks.filter((t: any) => t.product_id && !productMap.has(t.product_id));
                if (orphanTasks.length > 0) {
                    const orphanIds = Array.from(new Set(orphanTasks.map((t: any) => t.product_id).filter(Boolean)));
                    const { data: orphanProds } = await supabase
                        .from('products')
                        .select('id, name, unit_of_measure, purchase_sublist, accounting_id')
                        .in('id', orphanIds);

                    (orphanProds || []).forEach((prod: any) => {
                        if (prod && prod.name && !productMap.has(prod.id)) {
                            productMap.set(prod.id, {
                                product_id: prod.id,
                                product_name: prod.name.trim(),
                                accounting_id: prod.accounting_id,
                                unit: prod.unit_of_measure || 'KG',
                                sublist: (prod.purchase_sublist || 'GENERAL').toUpperCase().trim()
                            });
                        }
                    });
                }
            }

            // Ordenamiento estrictamente alfabético de la A a la Z para conteo a ciegas
            const sorted = Array.from(productMap.values()).sort((a, b) =>
                a.product_name.localeCompare(b.product_name, 'es', { sensitivity: 'base' })
            );

            setProducts(sorted);
        } catch (err) {
            console.error('Error cargando datos de ingreso a muelle:', err);
        } finally {
            setLoading(false);
        }
    };

    // Paginación reactiva basada en el parámetro configurable rowsPerPage:
    const pages = useMemo(() => {
        if (products.length === 0) return [];
        const result: ProductEntry[][] = [];

        for (let i = 0; i < products.length; i += rowsPerPage) {
            result.push(products.slice(i, i + rowsPerPage));
        }
        return result;
    }, [products, rowsPerPage]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles paperSize={paperFormat} />

            <style jsx global>{`
                @media print {
                    @page {
                        size: ${paperFormat === 'oficio' ? 'legal portrait' : 'letter portrait'} !important;
                        margin: 0.5cm 0.6cm !important;
                    }
                    body {
                        background-color: #FFFFFF !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    .letterhead-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        padding: 0.5cm 0.6cm !important;
                        margin: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        min-height: calc(100vh - 2px) !important;
                        height: auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .page-break {
                        page-break-after: always !important;
                        break-after: page !important;
                    }
                    .page-break:last-child {
                        page-break-after: avoid !important;
                        break-after: avoid !important;
                    }
                    tr {
                        height: ${rowHeightPx}px !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    td {
                        height: ${rowHeightPx}px !important;
                    }
                }
            `}</style>

            {/* Control Bar (No Print) */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
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
                            <Truck size={16} color="#0D7A57" />
                            Control de Llegada (Conteo a Ciegas)
                        </h1>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 7px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            {rowsPerPage} SKUs/hoja · {pages.length} {pages.length === 1 ? 'hoja' : 'hojas'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Selector de Documento Imprimible & Fecha con Persistencia */}
                    <PrintDocumentSwitcher
                        currentDoc="receiving"
                        selectedDate={selectedDate}
                        orderIds={rawOrderIds}
                        onDateChange={(newDate) => {
                            setSelectedDate(newDate);
                            const params = new URLSearchParams();
                            params.set('date', newDate);
                            if (rawOrderIds) params.set('orderIds', rawOrderIds);
                            router.replace(`/admin/procurement/receiving-print?${params.toString()}`);
                        }}
                    />

                    {/* Selector de Tamaño de Papel */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '2px 8px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748B' }}>Formato:</span>
                        <select
                            value={paperFormat}
                            onChange={(e) => setPaperFormat(e.target.value as any)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.76rem', fontWeight: '700', color: '#0F172A', outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="oficio">Oficio (Legal) - Predeterminado</option>
                            <option value="letter">Carta (Letter)</option>
                        </select>
                    </div>

                    {/* Parametrizador Dinámico de Filas por Hoja (Ocupar toda la hoja) */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '2px 6px' }} title="Ajusta la cantidad de productos por hoja para ocupar toda la página">
                        <span style={{ fontSize: '0.70rem', fontWeight: '700', color: '#64748B' }}>Filas/Hoja:</span>
                        <button
                            type="button"
                            onClick={() => setRowsPerPage(prev => Math.max(15, prev - 1))}
                            style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '3px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', color: '#334155' }}
                            title="Menos filas (filas más altas que ocupan más hoja)"
                        >-</button>
                        <input
                            type="number"
                            value={rowsPerPage}
                            min={15}
                            max={65}
                            onChange={(e) => {
                                const val = parseInt(e.target.value, 10);
                                if (!isNaN(val) && val >= 15 && val <= 65) {
                                    setRowsPerPage(val);
                                }
                            }}
                            style={{ width: '32px', textAlign: 'center', border: 'none', background: 'transparent', fontWeight: '800', fontSize: '0.76rem', color: '#0F172A', outline: 'none' }}
                        />
                        <button
                            type="button"
                            onClick={() => setRowsPerPage(prev => Math.min(65, prev + 1))}
                            style={{ border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '3px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.8rem', color: '#334155' }}
                            title="Más filas (más productos por hoja)"
                        >+</button>
                        <span style={{ fontSize: '0.64rem', color: '#64748B', marginLeft: '1px' }}>
                            (~{rowHeightPx}px)
                        </span>
                    </div>

                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Control_Llegada_${selectedDate}`,
                                    paperSize: paperFormat,
                                    orientation: 'portrait',
                                    margin: '0.5cm 0.6cm',
                                    extraStyles: `
                                        @page {
                                            size: ${paperFormat === 'oficio' ? 'legal portrait' : 'letter portrait'} !important;
                                            margin: 0.5cm 0.6cm !important;
                                        }
                                        .letterhead-container {
                                            padding: 0.5cm 0.6cm !important;
                                            page-break-inside: avoid !important;
                                            break-inside: avoid !important;
                                            page-break-after: always !important;
                                            break-after: page !important;
                                            min-height: calc(100vh - 2px) !important;
                                            height: auto !important;
                                            box-sizing: border-box !important;
                                        }
                                        .letterhead-container:last-child {
                                            page-break-after: avoid !important;
                                            break-after: avoid !important;
                                        }
                                        table {
                                            width: 100% !important;
                                            border-collapse: collapse !important;
                                            margin-top: 2px !important;
                                            margin-bottom: 2px !important;
                                        }
                                        tr {
                                            page-break-inside: avoid !important;
                                            break-inside: avoid !important;
                                            height: ${rowHeightPx}px !important;
                                        }
                                        th {
                                            padding: 3px 6px !important;
                                            font-size: 7.2pt !important;
                                            background-color: #0F172A !important;
                                            color: #FFFFFF !important;
                                        }
                                        td {
                                            padding: 2px 6px !important;
                                            font-size: 7.5pt !important;
                                            height: ${rowHeightPx}px !important;
                                            border: 1px solid #CBD5E1 !important;
                                        }
                                    `
                                });
                            }
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
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
                        <Printer size={14} /> Imprimir Control de Llegada
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0.75rem auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando listado de productos para recepción...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', maxWidth: '650px', margin: '2rem auto' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No hay productos programados para ingreso en esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha de entrega en el panel superior.</p>
                    </div>
                ) : (
                    pages.map((page, pageIdx) => {
                        const totalPages = pages.length;

                        return (
                            <div
                                key={`page-${pageIdx}`}
                                className="letterhead-container page-break"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000',
                                    fontFamily: 'Arial, Helvetica, sans-serif',
                                    width: '100%',
                                    maxWidth: '215.9mm',
                                    minHeight: paperFormat === 'oficio' ? '330mm' : '279.4mm',
                                    margin: '0 auto',
                                    padding: '0.5cm 0.6cm',
                                    boxSizing: 'border-box',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                                    border: '1px solid #CBD5E1'
                                }}
                            >
                                {/* Header Section emulating INGRESO.pdf */}
                                <div style={{ width: '100%', boxSizing: 'border-box' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', width: '100%' }}>
                                        <div style={{ width: '100px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                                            <img
                                                src="/logo.png"
                                                alt="FruFresco Logo"
                                                style={{ height: '30px', maxWidth: '95px', objectFit: 'contain', display: 'block' }}
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    if (target.src.indexOf('/logosimbolo.png') === -1) {
                                                        target.src = '/logosimbolo.png';
                                                    }
                                                }}
                                            />
                                        </div>
                                        <div style={{ textAlign: 'center', flex: 1, minWidth: 0, padding: '0 4px' }}>
                                            <h2 style={{ margin: 0, fontSize: '11pt', fontWeight: '900', color: '#0D7A57', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                                                INVESTMENTS CORTES SAS
                                            </h2>
                                        </div>
                                        <div style={{ width: '100px', flexShrink: 0 }} />
                                    </div>

                                    {/* Document Subtitle & Meta Bar */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        borderBottom: '1.5px solid #000000',
                                        paddingBottom: '2px',
                                        marginBottom: '4px',
                                        fontSize: '6.8pt',
                                        fontWeight: 'bold',
                                        color: '#000000',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}>
                                        <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            CONTROL DE LLEGADA DE PRODUCTOS EN KG - FECHA {selectedDate}
                                        </div>
                                        <div style={{ fontSize: '6.2pt', fontWeight: 'normal', color: '#334155', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                            GENERADO EL: {generatedAt}
                                        </div>
                                    </div>

                                    {/* Single Full-Width Table */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#F8FAFC', color: '#000000', borderTop: '1px solid #CBD5E1', borderBottom: '1.5px solid #0F172A' }}>
                                                <th style={{ width: '36%', textAlign: 'left', padding: '3px 6px', border: '1px solid #CBD5E1', fontWeight: 'bold', fontSize: '7.2pt' }}>Producto</th>
                                                <th style={{ width: '14%', textAlign: 'center', padding: '3px 4px', border: '1px solid #CBD5E1', fontWeight: 'bold', fontSize: '7.0pt' }}>Hora Llegada</th>
                                                <th style={{ width: '26%', textAlign: 'center', padding: '3px 6px', border: '1px solid #CBD5E1', fontWeight: 'bold', fontSize: '7.2pt' }}>Nombre Proveedor</th>
                                                <th style={{ width: '12%', textAlign: 'center', padding: '3px 4px', border: '1px solid #CBD5E1', fontWeight: 'bold', fontSize: '7.2pt' }}>KG</th>
                                                <th style={{ width: '12%', textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1', fontWeight: 'bold', fontSize: '7.0pt', lineHeight: 1.15 }}>Calidad<br/><span style={{ fontSize: '6.0pt', fontWeight: '700', color: '#FFFFFF', letterSpacing: '0.02em' }}>(SI/NO)</span></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {page.map((it, idx) => (
                                                <tr key={it.product_id || idx} style={{ height: `${rowHeightPx}px` }}>
                                                    <td style={{ textAlign: 'left', padding: '2px 6px', border: '1px solid #CBD5E1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', height: `${rowHeightPx}px`, boxSizing: 'border-box' }} title={it.product_name}>
                                                        <span style={{ fontWeight: '600', color: '#000000' }}>{it.product_name}</span>
                                                    </td>
                                                    <td style={{ border: '1px solid #CBD5E1', height: `${rowHeightPx}px`, boxSizing: 'border-box' }}></td>
                                                    <td style={{ border: '1px solid #CBD5E1', height: `${rowHeightPx}px`, boxSizing: 'border-box' }}></td>
                                                    <td style={{ border: '1px solid #CBD5E1', height: `${rowHeightPx}px`, boxSizing: 'border-box' }}></td>
                                                    <td style={{ border: '1px solid #CBD5E1', height: `${rowHeightPx}px`, boxSizing: 'border-box' }}></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Clean Bottom Page Number */}
                                <div style={{ textAlign: 'center', fontSize: '6.5pt', color: '#64748B', paddingTop: '6px' }}>
                                    Pág. {pageIdx + 1}/{totalPages}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
