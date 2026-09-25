'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, Filter, Truck } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import UniversalLetterhead from '@/components/print/UniversalLetterhead';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { printViaNewWindow, PrintDocumentSwitcher } from '@/components/print';
import { calculateProcurementNetting, NettingOrderItem, resolvePurchaseUnit } from '@/lib/procurement/procurementNettingEngine';

interface ReceivingItem {
    id: string;
    product_id: string;
    accounting_id?: number | string | null;
    product_name: string;
    variant_label?: string;
    sublist: string;
    unit: string;
    ordered_qty: number;
}

const MAX_ROW_UNITS = 36;
const FOOTER_RESERVE = 0;

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

    const [selectedSublist, setSelectedSublist] = useState<string>('ALL');
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<ReceivingItem[]>([]);

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
                            nickname,
                            variant_label,
                            selected_options,
                            products (
                                id,
                                name,
                                unit_of_measure,
                                purchase_sublist,
                                weight_kg,
                                parent_id,
                                min_inventory_level,
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

            // Recopilar items para el motor canónico de neteo
            const itemsForNetting: NettingOrderItem[] = [];
            ordersWithItems.forEach((ord: any) => {
                (ord.order_items || []).forEach((it: any) => {
                    itemsForNetting.push(it);
                });
            });

            // Tareas huérfanas en procurement_tasks (si las hubiera sin order_items directos)
            if (rawTasks.length > 0) {
                const seenPids = new Set(itemsForNetting.map(i => i.product_id));
                const orphanTasks = rawTasks.filter((t: any) => !seenPids.has(t.product_id));

                if (orphanTasks.length > 0) {
                    const orphanIds = Array.from(new Set(orphanTasks.map((t: any) => t.product_id).filter(Boolean)));
                    const { data: orphanProds } = await supabase
                        .from('products')
                        .select('id, name, unit_of_measure, purchase_sublist, parent_id, weight_kg, min_inventory_level, accounting_id')
                        .in('id', orphanIds);

                    const orphanProdMap: Record<string, any> = {};
                    (orphanProds || []).forEach((p: any) => { orphanProdMap[p.id] = p; });

                    orphanTasks.forEach((t: any) => {
                        const p = orphanProdMap[t.product_id];
                        itemsForNetting.push({
                            product_id: t.product_id,
                            product_name: p?.name,
                            quantity: Number(t.total_requested) || 0,
                            unit: t.unit,
                            variant_label: t.variant_label,
                            accounting_id: p?.accounting_id,
                            products: p
                        });
                    });
                }
            }

            if (itemsForNetting.length === 0) {
                setItems([]);
                setLoading(false);
                return;
            }

            // Ejecutar Motor Canónico de Neteo SDD (Consolidación pura de compra)
            const compiledNetting = calculateProcurementNetting({
                items: itemsForNetting,
                stocks: {},
                options: { mermaFactor: 0.0, applySafetyStock: false }
            });

            const parsed: ReceivingItem[] = compiledNetting.map(row => {
                return {
                    id: row.key,
                    product_id: row.product_id,
                    accounting_id: row.accounting_id,
                    product_name: row.product_name,
                    variant_label: row.canonical_spec || undefined,
                    sublist: (row.sublist || 'GENERAL CORABASTOS').toUpperCase().trim(),
                    unit: row.unit || 'KG',
                    ordered_qty: row.raw_demand_kg
                };
            });

            parsed.sort((a, b) => {
                if (a.sublist !== b.sublist) return a.sublist.localeCompare(b.sublist);
                return a.product_name.localeCompare(b.product_name);
            });

            setItems(parsed);
        } catch (err) {
            console.error('Error cargando datos de ingreso a muelle:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group by sublist
    const grouped = useMemo(() => {
        const map: Record<string, ReceivingItem[]> = {};
        items.forEach(it => {
            if (!map[it.sublist]) map[it.sublist] = [];
            map[it.sublist].push(it);
        });
        return map;
    }, [items]);

    const availableSublists = useMemo(() => Object.keys(grouped).sort(), [grouped]);

    const filteredSublists = useMemo(() => {
        if (selectedSublist === 'ALL') return availableSublists;
        return availableSublists.filter(s => s === selectedSublist);
    }, [availableSublists, selectedSublist]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles paperSize="oficio" />

            <style jsx global>{`
                @media print {
                    @page {
                        size: legal portrait !important;
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
                            Recepción en Bodega
                        </h1>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            Control Muelle
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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

                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '6px', padding: '2px 8px' }}>
                        <Filter size={13} color="#64748B" />
                        <select
                            value={selectedSublist}
                            onChange={(e) => setSelectedSublist(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.76rem', fontWeight: '700', color: '#0F172A', outline: 'none', cursor: 'pointer' }}
                        >
                            <option value="ALL">Sublistas ({availableSublists.length})</option>
                            {availableSublists.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Ingreso_Muelle_${selectedDate}`,
                                    paperSize: 'oficio',
                                    orientation: 'portrait',
                                    margin: '0.8cm 1.0cm'
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
                        <Printer size={14} /> Imprimir Planillas Muelle
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0.75rem auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando datos de recepción nocturna...</p>
                    </div>
                ) : filteredSublists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', maxWidth: '650px', margin: '2rem auto' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No hay mercancía programada para recepción en esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha de entrega en el panel superior.</p>
                    </div>
                ) : filteredSublists.map((sublistName) => {
                    const sublistItems = grouped[sublistName] || [];

                    // Paginación limpia por sublista
                    const sublistPages: Array<{ items: ReceivingItem[]; usedUnits: number }> = [];
                    let currentPage: ReceivingItem[] = [];
                    let currentUnits = 0;

                    sublistItems.forEach((item, itemGlobalIdx) => {
                        const rowWeight = item.variant_label ? 1.4 : 1.0;
                        const isLastItem = itemGlobalIdx === sublistItems.length - 1;
                        const budgetForPage = isLastItem || currentPage.length === 0
                            ? MAX_ROW_UNITS - FOOTER_RESERVE
                            : MAX_ROW_UNITS;

                        if (currentUnits + rowWeight > budgetForPage && currentPage.length > 0) {
                            sublistPages.push({ items: currentPage, usedUnits: currentUnits });
                            currentPage = [];
                            currentUnits = 0;
                        }
                        currentPage.push(item);
                        currentUnits += rowWeight;
                    });
                    if (currentPage.length > 0) sublistPages.push({ items: currentPage, usedUnits: currentUnits });
                    if (sublistPages.length === 0) sublistPages.push({ items: [], usedUnits: 0 });

                    return sublistPages.map(({ items: pageItems }, pageIdx) => {
                        const isLastPage = pageIdx === sublistPages.length - 1;
                        const pageSubtitle = `CONTROL DE PESAJE Y COTEJO EN PLATAFORMA DE MUELLE${sublistPages.length > 1 ? ` · HOJA ${pageIdx + 1} DE ${sublistPages.length}` : ''}`;
                        const recRef = `REC-${selectedDate.replace(/-/g, '')}`;

                        return (
                            <UniversalLetterhead
                                key={`${sublistName}-page-${pageIdx}`}
                                className="page-break"
                                brand={INVESTMENTS_CORTES_BRAND}
                                paperSize="oficio"
                                meta={{
                                    title: 'INGRESO DE MERCANCÍA & CONTROL DE MUELLE (02:00 AM)',
                                    subtitle: pageSubtitle,
                                    date: selectedDate,
                                    reference: recRef,
                                    badge: sublistName,
                                    badgeVariant: 'dark'
                                }}
                            >
                                    {/* Protocol & Summary banner */}
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
                                            <strong style={{ color: '#0F172A' }}>Protocolo de Muelle:</strong> Pese camión o estibas por separado. Reste la tara de canastillas plásticas (1.8 kg c/u) y empaques. Verifique madurez y temperatura.
                                        </div>
                                        <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A', fontSize: '0.68rem' }}>
                                            {sublistItems.length} Productos a Recibir
                                        </div>
                                    </div>

                                    {/* Table (8 Columnas Canónicas: #, Producto / Calibre, UM, Canastillas, Peso Bruto, Tara, Neto Real, Calidad) */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.66rem' }}>
                                        <thead>
                                            <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                                                <th style={{ width: '3.5%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A' }}>#</th>
                                                <th style={{ width: '38%', textAlign: 'left', padding: '3.5px 6px', border: '1px solid #0F172A' }}>Producto / Calibre Especificado</th>
                                                <th style={{ width: '6.5%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A' }}>UM</th>
                                                <th style={{ width: '10%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A' }}>Canastillas</th>
                                                <th style={{ width: '12%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A', backgroundColor: '#1E293B' }}>Peso Bruto (Kg)</th>
                                                <th style={{ width: '10%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A', backgroundColor: '#334155' }}>Tara (Kg)</th>
                                                <th style={{ width: '10%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A', backgroundColor: '#0D7A57' }}>Neto Real (Kg)</th>
                                                <th style={{ width: '10%', textAlign: 'center', padding: '3.5px 2px', border: '1px solid #0F172A' }}>Calidad</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pageItems.map((it, itemIdx) => {
                                                const prevPagesCount = sublistPages.slice(0, pageIdx).reduce((s, p) => s + p.items.length, 0);
                                                const globalIdx = prevPagesCount + itemIdx + 1;
                                                const bg = itemIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

                                                return (
                                                    <tr key={it.id || itemIdx} style={{ backgroundColor: bg }}>
                                                        {/* 1. Indice Consecutivo */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #E2E8F0', fontWeight: '700', color: '#64748B' }}>
                                                            {globalIdx}
                                                        </td>

                                                        {/* 2. Producto / Calibre Especificado + Accounting ID Discreto */}
                                                        <td style={{ textAlign: 'left', padding: '3px 6px', border: '1px solid #E2E8F0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap' }}>
                                                                <strong style={{ color: '#0F172A', fontSize: '0.68rem', lineHeight: 1.2 }}>
                                                                    {it.product_name}
                                                                </strong>
                                                                {it.accounting_id !== undefined && it.accounting_id !== null && (
                                                                    <span style={{ 
                                                                        fontSize: '0.58rem', 
                                                                        color: '#94A3B8', 
                                                                        fontWeight: '600', 
                                                                        fontFamily: 'monospace',
                                                                        letterSpacing: '0.02em',
                                                                        userSelect: 'none'
                                                                    }}>
                                                                        #{it.accounting_id}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {it.variant_label && (
                                                                <div style={{ fontSize: '0.58rem', color: '#475569', marginTop: '1.5px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                    <span style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '3px', padding: '1px 4px', fontWeight: '700', color: '#1E293B' }}>
                                                                        {it.variant_label}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* 3. Unidad Maestra de Compra (UM) */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #E2E8F0', fontWeight: '600', color: '#334155' }}>
                                                            {it.unit}
                                                        </td>

                                                        {/* 4. Canastillas */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8', color: '#94A3B8' }}>
                                                            [ _____ ]
                                                        </td>

                                                        {/* 5. Peso Bruto (Kg) */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8', color: '#94A3B8' }}>
                                                            [ _____ ]
                                                        </td>

                                                        {/* 6. Tara (Kg) */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8', color: '#94A3B8' }}>
                                                            [ _____ ]
                                                        </td>

                                                        {/* 7. Neto Real (Kg) */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1', borderBottom: '1px dashed #94A3B8', fontWeight: 'bold', color: '#0F172A' }}>
                                                            [ _____ ]
                                                        </td>

                                                        {/* 8. Calidad */}
                                                        <td style={{ textAlign: 'center', padding: '3px 2px', border: '1px solid #E2E8F0', fontSize: '0.58rem', color: '#475569' }}>
                                                            [ ] Aprob&nbsp;&nbsp;[ ] Rech
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </UniversalLetterhead>
                        );
                    });
                })}
            </div>
        </div>
    );
}
