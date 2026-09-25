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
    const paramDate = searchParams.get('date');
    const printDocRef = useRef<HTMLDivElement>(null);

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [paperFormat, setPaperFormat] = useState<'oficio' | 'letter'>('oficio');
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<ProductEntry[]>([]);
    const [generatedAt, setGeneratedAt] = useState<string>('');

    useEffect(() => {
        const now = new Date();
        const datePart = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timePart = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        setGeneratedAt(`${datePart} ${timePart}`);
    }, [selectedDate]);

    useEffect(() => {
        fetchReceivingData();
    }, [selectedDate]);

    const fetchReceivingData = async () => {
        setLoading(true);
        try {
            const OPERATIONAL_STATUSES = ['para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'];

            const [ordersRes, tasksRes] = await Promise.all([
                supabase
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
                    `)
                    .eq('delivery_date', selectedDate)
                    .in('status', OPERATIONAL_STATUSES),
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

    // Paginación a 2 Columnas:
    // En Oficio Portrait (330mm) caben ~38 filas por columna (76 productos por hoja).
    // En Carta Portrait (279mm) caben ~31 filas por columna (62 productos por hoja).
    const rowsPerColumn = paperFormat === 'oficio' ? 38 : 31;
    const itemsPerPage = rowsPerColumn * 2;

    const pages = useMemo(() => {
        if (products.length === 0) return [];
        const result: Array<{ left: ProductEntry[]; right: ProductEntry[] }> = [];

        for (let i = 0; i < products.length; i += itemsPerPage) {
            const pageChunk = products.slice(i, i + itemsPerPage);
            const left = pageChunk.slice(0, rowsPerColumn);
            const right = pageChunk.slice(rowsPerColumn, rowsPerColumn * 2);
            result.push({ left, right });
        }
        return result;
    }, [products, itemsPerPage, rowsPerColumn]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles paperSize={paperFormat} />

            <style jsx global>{`
                @media print {
                    @page {
                        size: ${paperFormat === 'oficio' ? 'legal portrait' : 'letter portrait'} !important;
                        margin: 0.8cm 0.9cm !important;
                    }
                    body {
                        background-color: #FFFFFF !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .page-break {
                        page-break-after: always !important;
                        break-after: page !important;
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
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            2 Columnas A-Z
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Selector de Documento Imprimible & Fecha con Persistencia */}
                    <PrintDocumentSwitcher
                        currentDoc="receiving"
                        selectedDate={selectedDate}
                        onDateChange={(newDate) => {
                            setSelectedDate(newDate);
                            const params = new URLSearchParams();
                            params.set('date', newDate);
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
                            <option value="oficio">Oficio (Legal)</option>
                            <option value="letter">Carta (Letter)</option>
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Control_Llegada_${selectedDate}`,
                                    paperSize: paperFormat,
                                    orientation: 'portrait',
                                    margin: '0.8cm 0.9cm'
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
                                className="page-break"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000',
                                    fontFamily: 'Arial, Helvetica, sans-serif',
                                    width: paperFormat === 'oficio' ? '215.9mm' : '215.9mm',
                                    minHeight: paperFormat === 'oficio' ? '330mm' : '279.4mm',
                                    margin: '0 auto',
                                    padding: '0.8cm 0.9cm',
                                    boxSizing: 'border-box',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                                    border: '1px solid #CBD5E1'
                                }}
                            >
                                {/* Header Section emulating INGRESO.pdf */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ width: '90px' }}>
                                            <img
                                                src="/images/frufresco-logo.png"
                                                alt="FruFresco"
                                                style={{ height: '36px', objectFit: 'contain' }}
                                                onError={(e) => {
                                                    // Fallback si la imagen no carga
                                                    (e.target as HTMLElement).style.display = 'none';
                                                }}
                                            />
                                        </div>
                                        <div style={{ textAlign: 'center', flex: 1 }}>
                                            <h2 style={{ margin: 0, fontSize: '12pt', fontWeight: '900', color: '#0D7A57', letterSpacing: '0.05em' }}>
                                                INVESTMENTS CORTES SAS
                                            </h2>
                                        </div>
                                        <div style={{ width: '90px' }} />
                                    </div>

                                    {/* Document Subtitle & Meta Bar */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'baseline',
                                        borderBottom: '1.5px solid #000000',
                                        paddingBottom: '3px',
                                        marginBottom: '6px',
                                        fontSize: '7.2pt',
                                        fontWeight: 'bold',
                                        color: '#000000'
                                    }}>
                                        <div>
                                            CONTROL DE LLEGADA DE PRODUCTOS EN KG - FECHA {selectedDate}
                                        </div>
                                        <div style={{ fontSize: '6.5pt', fontWeight: 'normal', color: '#334155' }}>
                                            GENERADO EL: {generatedAt}
                                        </div>
                                    </div>

                                    {/* Two-Column Side-by-Side Tables */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'start' }}>
                                        {/* Left Table Block */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.6pt' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', color: '#000000', borderTop: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                                                    <th style={{ width: '42%', textAlign: 'left', padding: '2px 4px', border: '1px solid #000000', fontWeight: 'bold' }}>Producto</th>
                                                    <th style={{ width: '14%', textAlign: 'center', padding: '2px 2px', border: '1px solid #000000', fontWeight: 'bold' }}>KG</th>
                                                    <th style={{ width: '16%', textAlign: 'center', padding: '2px 1px', border: '1px solid #000000', fontWeight: 'bold', lineHeight: 1.1 }}>Calidad - Apto<br/><span style={{ fontSize: '5.5pt', fontWeight: 'normal' }}>(SI/NO)</span></th>
                                                    <th style={{ width: '28%', textAlign: 'center', padding: '2px 2px', border: '1px solid #000000', fontWeight: 'bold' }}>Nombre</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {page.left.map((it, idx) => (
                                                    <tr key={it.product_id || idx} style={{ height: '20px' }}>
                                                        <td style={{ textAlign: 'left', padding: '1.5px 4px', border: '1px solid #000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }} title={it.product_name}>
                                                            <span style={{ fontWeight: '600', color: '#000000' }}>{it.product_name}</span>
                                                            {it.accounting_id && (
                                                                <span style={{ fontSize: '5.5pt', color: '#94A3B8', marginLeft: '3px', fontFamily: 'monospace' }}>
                                                                    #{it.accounting_id}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ border: '1px solid #000000' }}></td>
                                                        <td style={{ border: '1px solid #000000' }}></td>
                                                        <td style={{ border: '1px solid #000000' }}></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>

                                        {/* Right Table Block */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.6pt' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', color: '#000000', borderTop: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                                                    <th style={{ width: '42%', textAlign: 'left', padding: '2px 4px', border: '1px solid #000000', fontWeight: 'bold' }}>Producto</th>
                                                    <th style={{ width: '14%', textAlign: 'center', padding: '2px 2px', border: '1px solid #000000', fontWeight: 'bold' }}>KG</th>
                                                    <th style={{ width: '16%', textAlign: 'center', padding: '2px 1px', border: '1px solid #000000', fontWeight: 'bold', lineHeight: 1.1 }}>Calidad - Apto<br/><span style={{ fontSize: '5.5pt', fontWeight: 'normal' }}>(SI/NO)</span></th>
                                                    <th style={{ width: '28%', textAlign: 'center', padding: '2px 2px', border: '1px solid #000000', fontWeight: 'bold' }}>Nombre</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {page.right.map((it, idx) => (
                                                    <tr key={it.product_id || idx} style={{ height: '20px' }}>
                                                        <td style={{ textAlign: 'left', padding: '1.5px 4px', border: '1px solid #000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }} title={it.product_name}>
                                                            <span style={{ fontWeight: '600', color: '#000000' }}>{it.product_name}</span>
                                                            {it.accounting_id && (
                                                                <span style={{ fontSize: '5.5pt', color: '#94A3B8', marginLeft: '3px', fontFamily: 'monospace' }}>
                                                                    #{it.accounting_id}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td style={{ border: '1px solid #000000' }}></td>
                                                        <td style={{ border: '1px solid #000000' }}></td>
                                                        <td style={{ border: '1px solid #000000' }}></td>
                                                    </tr>
                                                ))}
                                                {/* Rellenar filas vacías en la columna derecha si es más corta que la izquierda */}
                                                {Array.from({ length: Math.max(0, page.left.length - page.right.length) }).map((_, emptyIdx) => (
                                                    <tr key={`empty-${emptyIdx}`} style={{ height: '20px' }}>
                                                        <td style={{ border: '1px solid #CBD5E1', backgroundColor: '#FAFAFA' }}></td>
                                                        <td style={{ border: '1px solid #CBD5E1', backgroundColor: '#FAFAFA' }}></td>
                                                        <td style={{ border: '1px solid #CBD5E1', backgroundColor: '#FAFAFA' }}></td>
                                                        <td style={{ border: '1px solid #CBD5E1', backgroundColor: '#FAFAFA' }}></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
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
