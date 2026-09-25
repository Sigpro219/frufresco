'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, ClipboardList, Layers, Sparkles, Truck } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import { printViaNewWindow, PrintDocumentSwitcher, getBogotaDate } from '@/components/print';

interface ProductItem {
    id: string;
    name: string;
    sku?: string;
    unit_of_measure?: string;
    inventory_group?: string;
    category?: string;
    accounting_id?: number | string | null;
    current_stock?: number;
}

// Orden canónico oficial de los 6 folios del documento INVENTARIO.pdf
const CANONICAL_GROUP_ORDER = [
    'INVENTARIO DE HORTALIZAS',
    'INVENTARIO DE VERDURAS',
    'INVENTARIO DE ABARROTES, FRUTOS SECOS, LACTEOS Y CARNES FRIAS',
    'INVENTARIO DE FRUTAS Y OTROS',
    'INVENTARIO DE PAPAS, PLATANO, TOMATE Y AGUACATES',
    'INVENTARIO DE FRESAS Y MORAS'
];

export default function PhysicalCountPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const paramDate = searchParams.get('date');
    const printDocRef = useRef<HTMLDivElement>(null);

    const [selectedDate, setSelectedDate] = useState<string>(() => paramDate || getBogotaDate(0));
    const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
    const [stockFilter, setStockFilter] = useState<'all' | 'with_stock'>('all'); // 'all' = Todo el catálogo | 'with_stock' = Solo con existencias
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [generatedAt, setGeneratedAt] = useState<string>('');

    useEffect(() => {
        const now = new Date();
        const datePart = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const timePart = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        setGeneratedAt(`${datePart} ${timePart}`);
    }, [selectedDate]);

    useEffect(() => {
        fetchProducts();
    }, []);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const [prodRes, stockRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, sku, unit_of_measure, inventory_group, category, accounting_id')
                    .eq('is_active', true)
                    .order('name', { ascending: true }),
                supabase
                    .from('inventory_stocks')
                    .select('product_id, quantity')
                    .gt('quantity', 0)
            ]);

            if (prodRes.error) throw prodRes.error;

            const stockMap = new Map<string, number>();
            (stockRes.data || []).forEach((st: any) => {
                stockMap.set(st.product_id, Number(st.quantity) || 0);
            });

            const enriched = (prodRes.data || []).map((p: any) => ({
                ...p,
                current_stock: stockMap.get(p.id) || 0
            }));

            setProducts(enriched);
        } catch (err) {
            console.error('Error cargando catálogo de inventario:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filtrar por existencias si está activo
    const visibleProducts = useMemo(() => {
        if (stockFilter === 'with_stock') {
            return products.filter(p => (p.current_stock || 0) > 0);
        }
        return products;
    }, [products, stockFilter]);

    // Agrupar productos por inventory_group
    const grouped = useMemo(() => {
        const map: Record<string, ProductItem[]> = {};
        visibleProducts.forEach(p => {
            const rawGroup = (p.inventory_group || 'INVENTARIO GENERAL / OTROS').toUpperCase().trim();
            if (!map[rawGroup]) map[rawGroup] = [];
            map[rawGroup].push(p);
        });
        return map;
    }, [visibleProducts]);

    // Ordenar grupos según el orden canónico oficial de INVENTARIO.pdf
    const sortedGroups = useMemo(() => {
        const available = Object.keys(grouped);
        const ordered: string[] = [];

        CANONICAL_GROUP_ORDER.forEach(cg => {
            if (grouped[cg] && grouped[cg].length > 0) {
                ordered.push(cg);
            }
        });

        available.forEach(g => {
            if (!ordered.includes(g) && grouped[g] && grouped[g].length > 0) {
                ordered.push(g);
            }
        });

        return ordered;
    }, [grouped]);

    const filteredGroups = useMemo(() => {
        if (selectedGroup === 'ALL') return sortedGroups;
        return sortedGroups.filter(g => g === selectedGroup);
    }, [sortedGroups, selectedGroup]);

    const totalVisiblePages = filteredGroups.length;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles paperSize="letter" />

            <style jsx global>{`
                @media print {
                    @page {
                        size: letter portrait !important;
                        margin: 0.5cm 0.6cm !important;
                    }
                    body {
                        background-color: #FFFFFF !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .letterhead-container {
                        width: 100% !important;
                        max-width: 100% !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        border: none !important;
                        box-shadow: none !important;
                        min-height: calc(100vh - 4px) !important;
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
                }
            `}</style>

            {/* Control Bar (No Print) - Exacto al estilo de receiving-print */}
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
                            <ClipboardList size={16} color="#0D7A57" />
                            Inventario de Bodega por Sublistas (INVENTARIO.pdf)
                        </h1>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            6 Folios Carta
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Selector de Documento Imprimible & Fecha con Persistencia */}
                    <PrintDocumentSwitcher
                        currentDoc="inventory"
                        selectedDate={selectedDate}
                        orderIds={searchParams.get('orderIds') || searchParams.get('ids') || ''}
                        onDateChange={(newDate) => {
                            setSelectedDate(newDate);
                            const rawOrderIds = searchParams.get('orderIds') || searchParams.get('ids') || '';
                            const params = new URLSearchParams();
                            params.set('date', newDate);
                            if (rawOrderIds) params.set('orderIds', rawOrderIds);
                            router.replace(`/admin/inventory/physical-count-print?${params.toString()}`);
                        }}
                    />

                    {/* Filtro de Folio/Grupo */}
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            border: '1px solid #CBD5E1',
                            fontSize: '0.74rem',
                            fontWeight: '700',
                            color: '#0F172A',
                            backgroundColor: '#F8FAFC',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="ALL">Todos los 6 Folios ({sortedGroups.length})</option>
                        {sortedGroups.map(g => (
                            <option key={g} value={g}>{g} ({grouped[g]?.length || 0})</option>
                        ))}
                    </select>

                    {/* Toggle Catálogo Completo vs Existencias */}
                    <div style={{ display: 'inline-flex', backgroundColor: '#F1F5F9', padding: '2px', borderRadius: '6px', border: '1px solid #CBD5E1' }}>
                        <button
                            onClick={() => setStockFilter('all')}
                            style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                fontSize: '0.70rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                backgroundColor: stockFilter === 'all' ? '#0D7A57' : 'transparent',
                                color: stockFilter === 'all' ? '#FFFFFF' : '#64748B'
                            }}
                        >
                            Ciego ({products.length})
                        </button>
                        <button
                            onClick={() => setStockFilter('with_stock')}
                            style={{
                                padding: '3px 8px',
                                borderRadius: '4px',
                                border: 'none',
                                fontSize: '0.70rem',
                                fontWeight: '800',
                                cursor: 'pointer',
                                backgroundColor: stockFilter === 'with_stock' ? '#0D7A57' : 'transparent',
                                color: stockFilter === 'with_stock' ? '#FFFFFF' : '#64748B'
                            }}
                        >
                            Existencias ({products.filter(p => (p.current_stock || 0) > 0).length})
                        </button>
                    </div>

                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `INVENTARIO_${selectedDate}`,
                                    paperSize: 'letter',
                                    orientation: 'portrait',
                                    margin: '0.5cm 0.6cm'
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
                        <Printer size={14} /> Imprimir Inventario (Carta)
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0.75rem auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando catálogo de inventario...</p>
                    </div>
                ) : filteredGroups.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', maxWidth: '650px', margin: '2rem auto' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No hay productos para mostrar en este grupo.</p>
                    </div>
                ) : (
                    filteredGroups.map((groupName, gIdx) => {
                        const items = grouped[groupName] || [];
                        const totalItems = items.length;

                        // División matemática en 2 columnas balanceadas
                        const midPoint = Math.ceil(totalItems / 2);
                        const col1Items = items.slice(0, midPoint);
                        const col2Items = items.slice(midPoint);
                        const rowCount = midPoint;

                        return (
                            <div
                                key={groupName}
                                className="letterhead-container page-break"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000',
                                    fontFamily: 'Arial, Helvetica, sans-serif',
                                    width: '100%',
                                    maxWidth: '215.9mm',
                                    minHeight: '279.4mm',
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
                                {/* Header Section emulating INGRESO.pdf / INVENTARIO.pdf */}
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
                                            INVENTARIO DE BODEGA - {groupName} - FECHA {selectedDate} ({totalItems} REFERENCIAS)
                                        </div>
                                        <div style={{ fontSize: '6.2pt', fontWeight: 'normal', color: '#334155', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                            GENERADO EL: {generatedAt}
                                        </div>
                                    </div>

                                    {/* Two-Column Side-by-Side Tables */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', alignItems: 'start' }}>
                                        {/* Left Column Table */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.5pt' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', color: '#000000', borderTop: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                                                    <th style={{ width: '75%', textAlign: 'left', padding: '1.5px 4px', border: '1px solid #000000', fontWeight: 'bold' }}>Producto</th>
                                                    <th style={{ width: '25%', textAlign: 'center', padding: '1.5px 2px', border: '1px solid #000000', fontWeight: 'bold' }}>KG</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: rowCount }).map((_, idx) => {
                                                    const it = col1Items[idx];
                                                    const itemNum = idx + 1;
                                                    return (
                                                        <tr key={it ? it.id : `empty-left-${idx}`} style={{ height: '17px', borderBottom: '1px solid #000000' }}>
                                                            <td style={{ textAlign: 'left', padding: '1px 3px', border: '1px solid #000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={it ? it.name : ''}>
                                                                {it ? (
                                                                    <>
                                                                        <span style={{ fontWeight: '600', color: '#000000' }}>{itemNum} - {it.name}</span>
                                                                        {it.accounting_id && (
                                                                            <span style={{ fontSize: '5.5pt', color: '#94A3B8', marginLeft: '3px', fontFamily: 'monospace' }}>
                                                                                #{it.accounting_id}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                ) : null}
                                                            </td>
                                                            <td style={{ border: '1px solid #000000', textAlign: 'center', backgroundColor: '#FFFFFF' }}></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>

                                        {/* Right Column Table */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '6.5pt' }}>
                                            <thead>
                                                <tr style={{ backgroundColor: '#F8FAFC', color: '#000000', borderTop: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                                                    <th style={{ width: '75%', textAlign: 'left', padding: '1.5px 4px', border: '1px solid #000000', fontWeight: 'bold' }}>Producto</th>
                                                    <th style={{ width: '25%', textAlign: 'center', padding: '1.5px 2px', border: '1px solid #000000', fontWeight: 'bold' }}>KG</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {Array.from({ length: rowCount }).map((_, idx) => {
                                                    const it = col2Items[idx];
                                                    const itemNum = midPoint + idx + 1;
                                                    return (
                                                        <tr key={it ? it.id : `empty-right-${idx}`} style={{ height: '17px', borderBottom: '1px solid #000000' }}>
                                                            <td style={{ textAlign: 'left', padding: '1px 3px', border: '1px solid #000000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }} title={it ? it.name : ''}>
                                                                {it ? (
                                                                    <>
                                                                        <span style={{ fontWeight: '600', color: '#000000' }}>{itemNum} - {it.name}</span>
                                                                        {it.accounting_id && (
                                                                            <span style={{ fontSize: '5.5pt', color: '#94A3B8', marginLeft: '3px', fontFamily: 'monospace' }}>
                                                                                #{it.accounting_id}
                                                                            </span>
                                                                        )}
                                                                    </>
                                                                ) : null}
                                                            </td>
                                                            <td style={{ border: '1px solid #000000', textAlign: 'center', backgroundColor: '#FFFFFF' }}></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {/* Footer Paginator matching INVENTARIO.pdf / receiving-print */}
                                <div style={{
                                    marginTop: 'auto',
                                    paddingTop: '6px',
                                    borderTop: '1px solid #000000',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    fontSize: '6.2pt',
                                    color: '#64748B'
                                }}>
                                    <div>
                                        <strong>FRUFRESCO OPERACIONES</strong> &bull; Sistema de Gestión Logística &bull; {groupName}
                                    </div>
                                    <div style={{ fontWeight: 'bold', color: '#000000', fontSize: '6.8pt' }}>
                                        Pág. {gIdx + 1}/{totalVisiblePages}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
