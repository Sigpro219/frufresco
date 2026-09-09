'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, Download, Calendar, Filter, ShoppingBag, FileSpreadsheet } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import UniversalLetterhead from '@/components/print/UniversalLetterhead';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { printViaNewWindow } from '@/components/print';
import * as XLSX from 'xlsx';

interface PurchaseItem {
    id: string;
    product_id: string;
    product_name: string;
    variant_label?: string;
    parent_id?: string;
    parent_name?: string;
    sku?: string;
    sublist: string;
    unit: string;
    demanda_neta: number;
    stock_bodega: number;
    a_comprar: number;
    con_merma: number;
}

export default function PurchasesPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const paramDate = searchParams.get('date');

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [selectedSublist, setSelectedSublist] = useState<string>('ALL');
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        fetchPurchasesData();
    }, [selectedDate]);

    const fetchPurchasesData = async () => {
        setLoading(true);
        try {
            // 1. Fetch procurement tasks for this date
            const { data: tasksData, error: tErr } = await supabase
                .from('procurement_tasks')
                .select('*')
                .eq('delivery_date', selectedDate);

            if (tErr) throw tErr;

            let rawTasks = tasksData || [];

            // If no procurement_tasks generated yet, fallback directly to active order_items for that date
            if (rawTasks.length === 0) {
                const { data: ordersWithItems, error: oErr } = await supabase
                    .from('orders')
                    .select('id, delivery_date, order_items(id, product_id, quantity, unit, nickname, variant_label)')
                    .eq('delivery_date', selectedDate)
                    .neq('status', 'cancelled');

                if (!oErr && ordersWithItems) {
                    const taskMap: Record<string, any> = {};
                    ordersWithItems.forEach((ord: any) => {
                        (ord.order_items || []).forEach((it: any) => {
                            const pId = it.product_id;
                            if (!pId) return;
                            if (!taskMap[pId]) {
                                taskMap[pId] = {
                                    id: it.id,
                                    product_id: pId,
                                    total_requested: 0,
                                    variant_label: it.variant_label,
                                    unit: it.unit
                                };
                            }
                            taskMap[pId].total_requested += Number(it.quantity) || 0;
                        });
                    });
                    rawTasks = Object.values(taskMap);
                }
            }

            if (rawTasks.length === 0) {
                setItems([]);
                setLoading(false);
                return;
            }

            // 2. Fetch product details & inventory stocks in parallel
            const productIds = Array.from(new Set(rawTasks.map((t: any) => t.product_id).filter(Boolean)));
            const [prodsRes, stocksRes] = await Promise.all([
                supabase
                    .from('products')
                    .select('id, name, sku, unit_of_measure, purchase_sublist, parent_id, min_inventory_level')
                    .in('id', productIds),
                supabase
                    .from('inventory_stocks')
                    .select('product_id, quantity')
                    .eq('status', 'available')
            ]);

            const products = prodsRes.data || [];
            const stocks = stocksRes.data || [];

            // Stock map
            const stockMap: Record<string, number> = {};
            stocks.forEach((s: any) => {
                stockMap[s.product_id] = (stockMap[s.product_id] || 0) + (Number(s.quantity) || 0);
            });

            // Product map
            const prodMap: Record<string, any> = {};
            products.forEach((p: any) => {
                prodMap[p.id] = p;
            });

            // Parent names map
            const parentIds = Array.from(new Set(products.map((p: any) => p.parent_id).filter(Boolean)));
            const parentMap: Record<string, string> = {};
            if (parentIds.length > 0) {
                const { data: parentProds } = await supabase
                    .from('products')
                    .select('id, name')
                    .in('id', parentIds);
                (parentProds || []).forEach((p: any) => {
                    parentMap[p.id] = p.name;
                });
            }

            // Build compiled purchase items with Netting
            const compiled: PurchaseItem[] = rawTasks.map((t: any) => {
                const p = prodMap[t.product_id];
                const pName = p?.name || 'Producto Desconocido';
                const parentName = p?.parent_id ? (parentMap[p.parent_id] || pName) : pName;
                const sublist = (p?.purchase_sublist || 'GENERAL CORABASTOS').toUpperCase().trim();
                const unit = p?.unit_of_measure || t.unit || 'KG';
                const requested = Number(t.total_requested) || 0;
                const stock = stockMap[t.product_id] || 0;
                const toBuy = Math.max(0, requested - stock);
                const withMerma = Math.round(toBuy * 1.05 * 10) / 10; // +5% de merma redondeado a 1 decimal

                return {
                    id: t.id,
                    product_id: t.product_id,
                    product_name: pName,
                    variant_label: t.variant_label,
                    parent_id: p?.parent_id,
                    parent_name: parentName,
                    sku: p?.sku || '',
                    sublist,
                    unit,
                    demanda_neta: requested,
                    stock_bodega: stock,
                    a_comprar: toBuy,
                    con_merma: withMerma
                };
            });

            // Sort: by sublist first, then parent name, then variant
            compiled.sort((a, b) => {
                if (a.sublist !== b.sublist) return a.sublist.localeCompare(b.sublist);
                if (a.parent_name !== b.parent_name) return (a.parent_name || '').localeCompare(b.parent_name || '');
                return a.product_name.localeCompare(b.product_name);
            });

            setItems(compiled);

        } catch (err) {
            console.error('Error cargando compras:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group items by sublist
    const groupedBySublist = useMemo(() => {
        const map: Record<string, PurchaseItem[]> = {};
        items.forEach(it => {
            if (!map[it.sublist]) map[it.sublist] = [];
            map[it.sublist].push(it);
        });
        return map;
    }, [items]);

    const availableSublists = useMemo(() => Object.keys(groupedBySublist).sort(), [groupedBySublist]);

    const filteredSublists = useMemo(() => {
        if (selectedSublist === 'ALL') return availableSublists;
        return availableSublists.filter(s => s === selectedSublist);
    }, [availableSublists, selectedSublist]);

    // Export to Excel (11 Standard Columns)
    const exportToExcel = () => {
        const rows = items.map((it, idx) => ({
            '#': idx + 1,
            'Sublista / Pabellón': it.sublist,
            'ID Producto': it.product_id,
            'SKU': it.sku,
            'Producto / Calibre': it.product_name + (it.variant_label ? ` (${it.variant_label})` : ''),
            'Producto Matriz (Padre)': it.parent_name,
            'Unidad Medida': it.unit,
            'Demanda Neta (KG/UN)': it.demanda_neta,
            'Stock en Bodega (INV)': it.stock_bodega,
            'A Comprar (+Merma Sugerida)': it.con_merma,
            'Puesto / Proveedor Abastos': ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Compras Abastos');

        // Column widths
        worksheet['!cols'] = [
            { wch: 4 },  // #
            { wch: 22 }, // Sublista
            { wch: 15 }, // ID
            { wch: 10 }, // SKU
            { wch: 30 }, // Producto
            { wch: 25 }, // Matriz
            { wch: 8 },  // UM
            { wch: 16 }, // Demanda
            { wch: 16 }, // Stock
            { wch: 20 }, // A comprar
            { wch: 24 }  // Puesto
        ];

        const filename = `compras_${selectedDate}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles />

            {/* Print Settings */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: letter portrait !important;
                        margin: 0.8cm !important;
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
                    .avoid-break {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                }
            `}</style>

            {/* Control Bar (No Print) */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: '0.85rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <button
                        onClick={() => router.back()}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            backgroundColor: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            color: '#334155'
                        }}
                    >
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <ShoppingBag size={20} color="#0D7A57" />
                            Planillas de Compras por Sublista (Corabastos)
                        </h1>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {items.length} productos a negociar &bull; Salto de página estricto por Sublista &bull; Formato Golden Print
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Date */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }}>
                        <Calendar size={14} color="#64748B" />
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Fecha:</span>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', outline: 'none' }}
                        />
                    </div>

                    {/* Sublist Filter */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }}>
                        <Filter size={14} color="#64748B" />
                        <select
                            value={selectedSublist}
                            onChange={(e) => setSelectedSublist(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', outline: 'none' }}
                        >
                            <option value="ALL">Todas las Sublistas ({availableSublists.length})</option>
                            {availableSublists.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    {/* Download Excel */}
                    <button
                        onClick={exportToExcel}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            backgroundColor: '#0F766E',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: '700'
                        }}
                    >
                        <FileSpreadsheet size={16} /> Descargar Excel (11 cols)
                    </button>

                    {/* Print */}
                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Planilla_Compras_${selectedDate}`,
                                    paperSize: 'letter',
                                    orientation: 'portrait',
                                    margin: '1.0cm 1.2cm'
                                });
                            }
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 18px',
                            backgroundColor: '#0D7A57',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '800',
                            boxShadow: '0 2px 8px rgba(13, 122, 87, 0.3)'
                        }}
                    >
                        <Printer size={16} /> Imprimir Planillas
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '1.5rem auto', padding: '0 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando datos de compras y stock en bodega...</p>
                    </div>
                ) : filteredSublists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No hay requerimientos de compras para esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha de entrega para generar las planillas.</p>
                    </div>
                ) : (
                    filteredSublists.map((sublistName) => {
                        const sublistItems = groupedBySublist[sublistName] || [];
                        const totalKilosNetos = sublistItems.reduce((s, it) => s + it.demanda_neta, 0);
                        const totalAComprar = sublistItems.reduce((s, it) => s + it.con_merma, 0);

                        return (
                            <div
                                key={sublistName}
                                className="page-break"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    padding: '14px 18px',
                                    marginBottom: '20px',
                                    borderRadius: '8px',
                                    border: '1px solid #E2E8F0',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)'
                                }}
                            >
                                <UniversalLetterhead
                                    brand={INVESTMENTS_CORTES_BRAND}
                                    paperSize="letter"
                                    meta={{
                                        title: 'PLANILLA DE COMPRAS CORABASTOS',
                                        subtitle: `SUBLISTA: ${sublistName} · NEGOCIACIÓN EN PLAZA`,
                                        date: selectedDate,
                                        reference: `SUBLISTA: ${sublistName}`,
                                        badge: sublistName,
                                        badgeVariant: 'dark'
                                    }}
                                >
                                    {/* Sublist summary banner */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        backgroundColor: '#F8FAFC',
                                        padding: '4px 8px',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '4px',
                                        fontSize: '0.66rem',
                                        marginBottom: '6px'
                                    }}>
                                        <div>
                                            <strong>Instrucciones:</strong> Negocie bulto/kilo con proveedores habituales. Anote el precio pactado y el puesto exacto.
                                        </div>
                                        <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A' }}>
                                            {sublistItems.length} SKUs &bull; Demanda: {totalKilosNetos.toLocaleString('es-CO')} &bull; Meta +Merma: {totalAComprar.toLocaleString('es-CO')}
                                        </div>
                                    </div>

                                    {/* Items Table */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                                                <th style={{ width: '22px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>#</th>
                                                <th style={{ textAlign: 'left', padding: '3px 6px', border: '1px solid #0F172A' }}>Producto / Calibre Especificado</th>
                                                <th style={{ width: '32px', textAlign: 'center', padding: '3px 2px', border: '1px solid #0F172A' }}>UM</th>
                                                <th style={{ width: '55px', textAlign: 'right', padding: '3px 4px', border: '1px solid #0F172A' }}>Demanda</th>
                                                <th style={{ width: '50px', textAlign: 'right', padding: '3px 4px', border: '1px solid #0F172A', backgroundColor: '#1E293B' }}>Stock INV</th>
                                                <th style={{ width: '65px', textAlign: 'right', padding: '3px 4px', border: '1px solid #0F172A', backgroundColor: '#0D7A57' }}>+Merma (5%)</th>
                                                <th style={{ width: '75px', textAlign: 'center', padding: '3px 4px', border: '1px solid #0F172A' }}>Precio $/Kg</th>
                                                <th style={{ width: '100px', textAlign: 'center', padding: '3px 4px', border: '1px solid #0F172A' }}>Puesto / Proveedor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sublistItems.map((it, idx) => {
                                                const bg = idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                                                return (
                                                    <tr key={it.id || idx} style={{ backgroundColor: bg }}>
                                                        <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', fontWeight: '700', color: '#64748B' }}>
                                                            {idx + 1}
                                                        </td>
                                                        <td style={{ textAlign: 'left', padding: '2.5px 6px', border: '1px solid #E2E8F0' }}>
                                                            <strong style={{ color: '#0F172A' }}>{it.product_name}</strong>
                                                            {it.variant_label && <span style={{ fontSize: '0.60rem', color: '#475569', marginLeft: '4px' }}>({it.variant_label})</span>}
                                                            {it.sku && <span style={{ fontSize: '0.56rem', color: '#94A3B8', marginLeft: '4px' }}>[{it.sku}]</span>}
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', color: '#475569' }}>
                                                            {it.unit}
                                                        </td>
                                                        <td style={{ textAlign: 'right', padding: '2.5px 4px', border: '1px solid #E2E8F0', fontWeight: '700', color: '#475569' }}>
                                                            {it.demanda_neta.toLocaleString('es-CO')}
                                                        </td>
                                                        <td style={{ textAlign: 'right', padding: '2.5px 4px', border: '1px solid #E2E8F0', color: '#64748B' }}>
                                                            {it.stock_bodega > 0 ? it.stock_bodega.toLocaleString('es-CO') : '-'}
                                                        </td>
                                                        <td style={{ textAlign: 'right', padding: '2.5px 4px', border: '1px solid #E2E8F0', fontWeight: '900', color: '#0D7A57', backgroundColor: '#F0FDF4' }}>
                                                            {it.con_merma.toLocaleString('es-CO')}
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '2.5px 4px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                            $ ________
                                                        </td>
                                                        <td style={{ textAlign: 'center', padding: '2.5px 4px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8' }}>
                                                            ________________
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Sublist Total */}
                                            <tr style={{ backgroundColor: '#F1F5F9', fontWeight: '900' }}>
                                                <td colSpan={3} style={{ textAlign: 'right', padding: '4px 6px', border: '1px solid #CBD5E1', color: '#0F172A' }}>
                                                    TOTAL {sublistName}:
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 4px', border: '1px solid #CBD5E1' }}>
                                                    {totalKilosNetos.toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 4px', border: '1px solid #CBD5E1', color: '#64748B' }}>
                                                    {sublistItems.reduce((s, it) => s + it.stock_bodega, 0).toLocaleString('es-CO')}
                                                </td>
                                                <td style={{ textAlign: 'right', padding: '4px 4px', border: '1px solid #CBD5E1', color: '#0D7A57' }}>
                                                    {totalAComprar.toLocaleString('es-CO')}
                                                </td>
                                                <td colSpan={2} style={{ textAlign: 'center', padding: '4px 4px', border: '1px solid #CBD5E1' }}>
                                                    -
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    {/* Signatures footer */}
                                    <div style={{
                                        marginTop: '12px',
                                        paddingTop: '6px',
                                        borderTop: '1px solid #CBD5E1',
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr',
                                        gap: '12px',
                                        fontSize: '0.62rem'
                                    }}>
                                        <div>
                                            <strong>Comprador en Corabastos:</strong> ___________________________
                                            <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Firma y responsable de negociación</div>
                                        </div>
                                        <div>
                                            <strong>Conductor / Camión Recolector:</strong> ___________________________
                                            <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Cargue verificado en plaza</div>
                                        </div>
                                        <div>
                                            <strong>Recepción en Bodega Central:</strong> ___________________________
                                            <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Recibido y pesaje a ciegas</div>
                                        </div>
                                    </div>
                                </UniversalLetterhead>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
