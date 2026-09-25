'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, Download, Filter, ShoppingBag, FileSpreadsheet } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import Letterhead from '@/components/Letterhead';
import { printViaNewWindow, PrintDocumentSwitcher } from '@/components/print';
import * as XLSX from 'xlsx';
import { formatStructuredSpecification } from '@/lib/orderUtils';
import { calculateProcurementNetting, NettingOrderItem } from '@/lib/procurement/procurementNettingEngine';



interface PurchaseItem {
    id: string;
    product_id: string;
    accounting_id?: number | string | null;
    product_name: string;
    variant_label?: string; // Especificación canónica / característica con la que nació el pedido
    parent_id?: string;
    parent_name?: string;
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
    const rawOrderIds = searchParams.get('orderIds') || searchParams.get('ids') || '';
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
        if (paramDate && paramDate !== selectedDate) {
            setSelectedDate(paramDate);
        }
    }, [paramDate]);

    useEffect(() => {
        fetchPurchasesData();
    }, [selectedDate, rawOrderIds]);

    const fetchPurchasesData = async () => {
        setLoading(true);
        try {
            // Cargar inventario disponible completo (paginado para superar límite de 1000 de Supabase)
            let allStocks: Array<{ product_id: string; quantity: number }> = [];
            let fromStock = 0;
            const stepStock = 1000;
            let hasMoreStock = true;

            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id, delivery_date, status,
                    order_items(
                        id, order_id, product_id, quantity, unit, selected_options, variant_label,
                        products(id, name, unit_of_measure, purchase_sublist, weight_kg, parent_id, min_inventory_level, accounting_id)
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

            while (hasMoreStock) {
                const { data, error } = await supabase
                    .from('inventory_stocks')
                    .select('product_id, quantity')
                    .eq('status', 'available')
                    .range(fromStock, fromStock + stepStock - 1);
                if (error || !data || data.length === 0) {
                    hasMoreStock = false;
                } else {
                    allStocks = allStocks.concat(data);
                    if (data.length < stepStock) hasMoreStock = false;
                    else fromStock += stepStock;
                }
            }

            const ordersWithItems = ordersRes.data || [];
            const rawTasks = tasksRes.data || [];

            // Stock map
            const stockMap: Record<string, number> = {};
            allStocks.forEach((s: any) => {
                stockMap[s.product_id] = (stockMap[s.product_id] || 0) + (Number(s.quantity) || 0);
            });

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

            // 2. Ejecutar Motor Canónico de Neteo (Sin merma plana; Meta Neta de Neteo exacta)
            const compiledNetting = calculateProcurementNetting({
                items: itemsForNetting,
                stocks: stockMap,
                options: { mermaFactor: 0.0, applySafetyStock: true }
            });

            const compiled: PurchaseItem[] = compiledNetting.map(row => {
                // En la planilla de compras, la columna 'Stock INV' refleja la existencia real en bodega del SKU correspondiente
                const productStock = Number(stockMap[row.product_id] || 0);

                return {
                    id: row.key,
                    product_id: row.product_id,
                    accounting_id: row.accounting_id,
                    product_name: row.product_name,
                    variant_label: row.canonical_spec || undefined,
                    parent_id: row.parent_id || undefined,
                    parent_name: row.parent_name,
                    sublist: row.sublist,
                    unit: row.unit,
                    demanda_neta: row.raw_demand_kg,
                    stock_bodega: productStock,
                    a_comprar: row.net_to_buy,
                    con_merma: row.suggested_with_merma
                };
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

    // Export to Excel (10 Standard Columns - Stock and UM before Producto)
    const exportToExcel = () => {
        const rows = items.map((it, idx) => ({
            '#': idx + 1,
            'Sublista / Pabellón': it.sublist,
            'ID Producto': it.product_id,
            'ID Contable': it.accounting_id ? `#${it.accounting_id}` : '',
            'Stock en Bodega (INV)': it.stock_bodega,
            'Unidad Medida': it.unit,
            'Producto / Calibre': it.product_name + (it.variant_label ? ` (${it.variant_label})` : ''),
            'Producto Matriz (Padre)': it.parent_name,
            'Demanda Total': it.demanda_neta,
            'Precio Pactado ($/UM)': '',
            'Puesto / Proveedor Abastos': ''
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Compras Abastos');

        // Column widths
        worksheet['!cols'] = [
            { wch: 4 },  // #
            { wch: 22 }, // Sublista
            { wch: 15 }, // ID Producto
            { wch: 12 }, // ID Contable
            { wch: 16 }, // Stock INV
            { wch: 8 },  // UM
            { wch: 32 }, // Producto
            { wch: 25 }, // Matriz
            { wch: 16 }, // Demanda
            { wch: 16 }, // Precio
            { wch: 28 }  // Puesto / Proveedor
        ];

        const filename = `compras_${selectedDate}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles paperSize="oficio" />

            {/* Print Settings (Inyección DOM Nativa Directa para Hoja Oficio) */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    @page {
                        size: legal portrait !important;
                        margin: 0.8cm 1.0cm !important;
                    }
                    body {
                        background-color: #FFFFFF !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
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
            ` }} />

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
                            <ShoppingBag size={16} color="#0D7A57" />
                            Compras Corabastos
                        </h1>
                        <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#0D7A57', backgroundColor: '#ECFDF5', padding: '1px 6px', borderRadius: '12px', border: '1px solid #A7F3D0', whiteSpace: 'nowrap' }}>
                            {items.length} prod.
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {/* Selector de Documento Imprimible & Fecha con Persistencia */}
                    <PrintDocumentSwitcher
                        currentDoc="purchases"
                        selectedDate={selectedDate}
                        orderIds={rawOrderIds}
                        onDateChange={(newDate) => {
                            setSelectedDate(newDate);
                            const params = new URLSearchParams();
                            params.set('date', newDate);
                            if (rawOrderIds) params.set('orderIds', rawOrderIds);
                            router.replace(`/admin/procurement/purchases-print?${params.toString()}`);
                        }}
                    />

                    {/* Sublist Filter */}
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

                    {/* Download Excel */}
                    <button
                        onClick={exportToExcel}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 10px',
                            backgroundColor: '#0F766E',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.76rem',
                            fontWeight: '700',
                            whiteSpace: 'nowrap'
                        }}
                        title="Descargar consolidado en formato Excel con 10 columnas estándar"
                    >
                        <FileSpreadsheet size={14} /> Excel (10 cols)
                    </button>

                    {/* Print */}
                    <button
                        onClick={() => {
                            if (printDocRef.current) {
                                printViaNewWindow({
                                    element: printDocRef.current,
                                    title: `Planilla_Compras_${selectedDate}`,
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
                        <Printer size={14} /> Imprimir Planillas
                    </button>
                </div>
            </div>

            {/* Document Body */}
            <div ref={printDocRef} style={{ maxWidth: '850px', margin: '0.75rem auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando datos de compras y stock en bodega...</p>
                    </div>
                ) : filteredSublists.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', maxWidth: '650px', margin: '2rem auto' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No hay requerimientos de compras para esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha de entrega para generar las planillas.</p>
                    </div>
                ) : (
                    filteredSublists.map((sublistName) => {
                        const sublistItems = groupedBySublist[sublistName] || [];

                        // Paginación dinámica ponderada por altura visual:
                        // - Fila simple (sin variant_label): 1.0 unidad (~6 mm por fila a 8.5pt)
                        // - Fila con variant_label (tag de calibre, 2 líneas): 1.6 unidades (~9.6 mm)
                        // Hoja oficio: 330 mm – márgenes (18 mm) – encabezado+banner (~55 mm) – pie (~15 mm)
                        //   → área útil ≈ 242 mm → ~38 filas simples por página.
                        // Última página reserva espacio para tfoot + firmas (~4 u).
                        const MAX_ROW_UNITS = 38;
                        const FOOTER_RESERVE = 4; // unidades reservadas para tfoot + firmas en última página
                        const sublistPages: Array<{ items: PurchaseItem[]; usedUnits: number }> = [];
                        let currentPage: PurchaseItem[] = [];
                        let currentUnits = 0;

                        sublistItems.forEach((item, itemGlobalIdx) => {
                            const rowWeight = item.variant_label ? 1.6 : 1.0;
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

                        const totalKilosNetos = sublistItems.reduce((s, it) => s + it.demanda_neta, 0);
                        const seenProductPids = new Set<string>();
                        const totalStockBodega = sublistItems.reduce((s, it) => {
                            if (!seenProductPids.has(it.product_id)) {
                                seenProductPids.add(it.product_id);
                                return s + it.stock_bodega;
                            }
                            return s;
                        }, 0);
                        const totalAComprar = sublistItems.reduce((s, it) => s + it.a_comprar, 0);

                        return sublistPages.map(({ items: pageItems, usedUnits: pageUsedUnits }, pageIdx) => {
                            const isLastPage = pageIdx === sublistPages.length - 1;
                            const pageSubtitle = `NEGOCIACIÓN EN PLAZA · CENTRAL CORABASTOS${sublistPages.length > 1 ? ` · HOJA ${pageIdx + 1} DE ${sublistPages.length}` : ''}`;
                            const planRef = `PLC-${selectedDate.replace(/-/g, '')}`;

                            return (
                                <Letterhead
                                    key={`${sublistName}-page-${pageIdx}`}
                                    title="Planilla de Compras Corabastos"
                                    subtitle={pageSubtitle}
                                    date={selectedDate}
                                    reference={planRef}
                                    badge={sublistName}
                                    badgeVariant="dark"
                                    className="page-break"
                                    paperSize="oficio"
                                    showWatermark={false}
                                >
                                    {/* Sublist summary banner */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        backgroundColor: '#F8FAFC',
                                        padding: '3px 8px',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '4px',
                                        fontSize: '7pt',
                                        marginBottom: '6px'
                                    }}>
                                        <div>
                                            <strong style={{ color: '#0F172A' }}>Instrucciones para Plaza:</strong> Negocie precio pactado por kilo/bulto y anote el número de puesto en Corabastos.
                                        </div>
                                        <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A', fontSize: '7.2pt' }}>
                                            {sublistItems.length} Productos &bull; Stock Bodega: {totalStockBodega.toLocaleString('es-CO')} &bull; Demanda Total: {totalKilosNetos.toLocaleString('es-CO')}
                                        </div>
                                    </div>

                                    {/* Items Table (7 Columnas: #, Stock INV, UM, Producto / Calibre, Demanda, Precio, Proveedor) */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '3.5%', textAlign: 'center', fontSize: '8.2pt' }}>#</th>
                                                <th style={{ width: '10%', textAlign: 'right', fontSize: '8.2pt', backgroundColor: '#1E293B' }}>Stock INV</th>
                                                <th style={{ width: '6.5%', textAlign: 'center', fontSize: '8.2pt' }}>UM</th>
                                                <th style={{ width: '35%', fontSize: '8.2pt' }}>Producto / Calibre Especificado</th>
                                                <th style={{ width: '11%', textAlign: 'right', fontSize: '8.2pt', backgroundColor: '#0D7A57' }}>Demanda</th>
                                                <th style={{ width: '10%', textAlign: 'center', fontSize: '8.2pt' }}>Precio $/UM</th>
                                                <th style={{ width: '24%', textAlign: 'center', fontSize: '8.2pt' }}>Puesto / Proveedor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                // Calcular agrupación de celdas (rowSpan) para ítems consecutivos del mismo SKU en esta página
                                                const itemSpans: Array<{ isFirst: boolean; span: number }> = [];
                                                for (let i = 0; i < pageItems.length; i++) {
                                                    const currentPid = pageItems[i].product_id;
                                                    if (i > 0 && pageItems[i - 1].product_id === currentPid) {
                                                        itemSpans.push({ isFirst: false, span: 0 });
                                                    } else {
                                                        let count = 1;
                                                        while (i + count < pageItems.length && pageItems[i + count].product_id === currentPid) {
                                                            count++;
                                                        }
                                                        itemSpans.push({ isFirst: true, span: count });
                                                    }
                                                }

                                                return pageItems.map((it, itemIdx) => {
                                                    const prevPagesCount = sublistPages.slice(0, pageIdx).reduce((s, p) => s + p.items.length, 0);
                                                    const globalIdx = prevPagesCount + itemIdx + 1;
                                                    const spanInfo = itemSpans[itemIdx];
                                                    const bg = itemIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';

                                                    return (
                                                        <tr key={it.id || itemIdx} style={{ backgroundColor: bg }}>
                                                            {/* 1. Indice Consecutivo */}
                                                            <td style={{ textAlign: 'center', fontSize: '7.8pt', fontWeight: 'bold', color: '#64748B' }}>
                                                                {globalIdx}
                                                            </td>

                                                            {/* 2 & 3. Stock INV y UM (Unificados verticalmente por SKU cuando hay variantes) */}
                                                            {spanInfo.isFirst && (
                                                                <>
                                                                    <td
                                                                        rowSpan={spanInfo.span}
                                                                        style={{
                                                                            textAlign: 'right',
                                                                            fontSize: '7.8pt',
                                                                            fontWeight: '700',
                                                                            fontVariantNumeric: 'tabular-nums',
                                                                            color: it.stock_bodega > 0 ? '#0F172A' : '#94A3B8',
                                                                            backgroundColor: spanInfo.span > 1 ? '#F8FAFC' : undefined,
                                                                            verticalAlign: 'middle',
                                                                            borderRight: spanInfo.span > 1 ? '1px solid #E2E8F0' : undefined,
                                                                            padding: '2px 4px'
                                                                        }}
                                                                    >
                                                                        {it.stock_bodega > 0 ? it.stock_bodega.toLocaleString('es-CO') : '-'}
                                                                    </td>
                                                                    <td
                                                                        rowSpan={spanInfo.span}
                                                                        style={{
                                                                            textAlign: 'center',
                                                                            fontSize: '7.5pt',
                                                                            fontWeight: '600',
                                                                            color: '#334155',
                                                                            backgroundColor: spanInfo.span > 1 ? '#F8FAFC' : undefined,
                                                                            verticalAlign: 'middle',
                                                                            borderRight: spanInfo.span > 1 ? '1px solid #E2E8F0' : undefined,
                                                                            padding: '2px 3px'
                                                                        }}
                                                                    >
                                                                        {it.unit}
                                                                    </td>
                                                                </>
                                                            )}

                                                            {/* 4. Producto / Calibre Especificado */}
                                                            <td style={{ wordBreak: 'break-word', overflowWrap: 'break-word', paddingRight: '6px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap' }}>
                                                                    <span style={{ fontWeight: '800', color: '#0F172A', fontSize: '8.2pt', lineHeight: 1.2 }}>
                                                                        {it.product_name}
                                                                    </span>
                                                                    {it.accounting_id !== undefined && it.accounting_id !== null && (
                                                                        <span style={{ 
                                                                            fontSize: '6.8pt', 
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
                                                                    <div style={{ fontSize: '6.8pt', color: '#475569', marginTop: '1.5px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                                                        <span style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '3px', padding: '1px 5px', fontWeight: '700', color: '#1E293B' }}>
                                                                            {it.variant_label}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </td>

                                                            {/* 5. Demanda Neta */}
                                                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                                <span style={{
                                                                    display: 'inline-block',
                                                                    backgroundColor: it.demanda_neta > 0 ? '#ECFDF5' : '#F8FAFC',
                                                                    border: it.demanda_neta > 0 ? '1px solid #A7F3D0' : '1px solid #E2E8F0',
                                                                    borderRadius: '4px',
                                                                    padding: '1px 5px',
                                                                    fontWeight: '900',
                                                                    color: it.demanda_neta > 0 ? '#065F46' : '#94A3B8',
                                                                    fontSize: '8pt',
                                                                    fontVariantNumeric: 'tabular-nums'
                                                                }}>
                                                                    {it.demanda_neta > 0 ? it.demanda_neta.toLocaleString('es-CO') : '0'}
                                                                </span>
                                                            </td>

                                                            {/* 6. Precio Pactado ($/UM) */}
                                                            <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '2px 4px' }}>
                                                                <div style={{
                                                                    borderBottom: '1px dashed #94A3B8',
                                                                    height: '18px',
                                                                    display: 'flex',
                                                                    alignItems: 'flex-end',
                                                                    justifyContent: 'flex-start',
                                                                    paddingLeft: '3px',
                                                                    fontSize: '6.8pt',
                                                                    color: '#64748B',
                                                                    fontWeight: '600'
                                                                }}>
                                                                    $
                                                                </div>
                                                            </td>

                                                            {/* 7. Puesto / Proveedor */}
                                                            <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '2px 6px' }}>
                                                                <div style={{
                                                                    borderBottom: '1px dashed #94A3B8',
                                                                    height: '18px'
                                                                }}></div>
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                        {isLastPage && (
                                            <tfoot>
                                                <tr style={{ backgroundColor: '#F1F5F9', fontWeight: '900' }}>
                                                    <td style={{ textAlign: 'center', padding: '3px 4px', border: '1px solid #CBD5E1', color: '#64748B', fontSize: '7.8pt' }}>
                                                        &Sigma;
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '3px 4px', border: '1px solid #CBD5E1', color: '#0F172A', fontSize: '8pt', fontVariantNumeric: 'tabular-nums' }}>
                                                        {totalStockBodega.toLocaleString('es-CO')}
                                                    </td>
                                                    <td style={{ textAlign: 'center', padding: '3px 4px', border: '1px solid #CBD5E1', color: '#94A3B8' }}>
                                                        -
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '3px 6px', border: '1px solid #CBD5E1', color: '#0F172A', fontSize: '8pt' }}>
                                                        TOTAL {sublistName}:
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '3px 4px', border: '1px solid #CBD5E1', color: '#065F46', fontSize: '8.2pt', fontWeight: '900', fontVariantNumeric: 'tabular-nums' }}>
                                                        {totalKilosNetos.toLocaleString('es-CO')}
                                                    </td>
                                                    <td colSpan={2} style={{ textAlign: 'center', padding: '3px 4px', border: '1px solid #CBD5E1', color: '#94A3B8' }}>
                                                        -
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>

                                    {/* Signatures footer on last page */}
                                    {isLastPage && (
                                        <div style={{
                                            marginTop: 'auto',
                                            paddingTop: '8px',
                                            borderTop: '1px solid #CBD5E1',
                                            display: 'grid',
                                            gridTemplateColumns: '1fr 1fr 1fr',
                                            gap: '12px',
                                            fontSize: '6.8pt'
                                        }}>
                                            <div>
                                                <strong style={{ color: '#0F172A' }}>Comprador en Corabastos:</strong>
                                                <div style={{ borderBottom: '1px solid #0F172A', height: '18px', width: '90%', marginTop: '4px' }}></div>
                                                <div style={{ fontSize: '6pt', color: '#64748B', marginTop: '2px' }}>Firma y responsable de negociación</div>
                                            </div>
                                            <div>
                                                <strong style={{ color: '#0F172A' }}>Conductor / Camión Recolector:</strong>
                                                <div style={{ borderBottom: '1px solid #0F172A', height: '18px', width: '90%', marginTop: '4px' }}></div>
                                                <div style={{ fontSize: '6pt', color: '#64748B', marginTop: '2px' }}>Cargue verificado en plaza</div>
                                            </div>
                                            <div>
                                                <strong style={{ color: '#0F172A' }}>Recepción en Bodega Central:</strong>
                                                <div style={{ borderBottom: '1px solid #0F172A', height: '18px', width: '90%', marginTop: '4px' }}></div>
                                                <div style={{ fontSize: '6pt', color: '#64748B', marginTop: '2px' }}>Recibido y pesaje a ciegas</div>
                                            </div>
                                        </div>
                                    )}
                                </Letterhead>
                            );
                        });
                    })
                )}
            </div>
        </div>
    );
}
