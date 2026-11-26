'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Printer, ArrowLeft, Download, Filter, ShoppingBag, FileSpreadsheet } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import Letterhead from '@/components/Letterhead';
import { printViaNewWindow, PrintDocumentSwitcher, DirectPdfSaveButton } from '@/components/print';
import { acquireSaveFileHandle, isSavePickerAborted, saveWorkbookWithPicker } from '@/lib/fileSavePicker';
import { formatStructuredSpecification } from '@/lib/orderUtils';
import { calculateProcurementNetting, NettingOrderItem } from '@/lib/procurement/procurementNettingEngine';
import { compareFamilyProducts } from '@/lib/productHierarchyUtils';
import { exportRelacionDocumentosWithPicker } from '@/lib/exportRelacionDocumentosExcel';
import { resolveInitialInventory, type InventorySourceKind } from '@/lib/inventory/resolveInitialInventory';



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
    row_type?: 'family' | 'child' | 'standalone';
    family_id?: string;
    is_stock_only?: boolean;
}

const CrossedOutCell = () => (
    <div style={{
        position: 'relative',
        height: '22px',
        backgroundColor: '#F8FAFC',
        border: '1px solid #CBD5E1',
        borderRadius: '3px',
        overflow: 'hidden',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact'
    }}>
        <svg width="100%" height="100%" viewBox="0 0 100 24" preserveAspectRatio="none" style={{ display: 'block' }}>
            <line x1="0" y1="0" x2="100" y2="24" stroke="#64748B" strokeWidth="1.25" />
            <line x1="100" y1="0" x2="0" y2="24" stroke="#64748B" strokeWidth="1.25" />
        </svg>
    </div>
);

export default function PurchasesPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const rawOrderIds = searchParams.get('orderIds') || searchParams.get('ids') || '';
    const paramDate = searchParams.get('date');

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    });

    const [selectedSublist, setSelectedSublist] = useState<string>('ALL');
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<PurchaseItem[]>([]);
    const [invSourceMeta, setInvSourceMeta] = useState<{ sourceDate: string | null; sourceKind: InventorySourceKind }>({ sourceDate: null, sourceKind: 'none' });
    const [isExportingRelacion, setIsExportingRelacion] = useState(false);
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
            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id, delivery_date, status,
                    order_items(
                        id, order_id, product_id, quantity, unit, selected_options, variant_label,
                        products(id, name, unit_of_measure, purchase_sublist, weight_kg, parent_id, min_inventory_level, accounting_id)
                    )
                `)
                .range(0, 4999);

            if (rawOrderIds) {
                const ids = rawOrderIds.split(',').map(id => id.trim()).filter(Boolean);
                if (ids.length > 0) {
                    ordersQuery = ordersQuery.in('id', ids).neq('status', 'cancelled');
                } else {
                    ordersQuery = ordersQuery.eq('delivery_date', selectedDate).neq('status', 'cancelled');
                }
            } else {
                const OPERATIONAL_STATUSES = ['pending_approval', 'pending', 'recibido', 'para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'];
                ordersQuery = ordersQuery.eq('delivery_date', selectedDate).in('status', OPERATIONAL_STATUSES);
            }

            const [ordersRes, tasksRes, catalogRes] = await Promise.all([
                ordersQuery,
                supabase
                    .from('procurement_tasks')
                    .select('*')
                    .eq('delivery_date', selectedDate),
                supabase
                    .from('products')
                    .select('id, name, unit_of_measure, purchase_sublist, parent_id, accounting_id')
                    .eq('is_active', true)
                    .range(0, 2999)
            ]);

            // Motor Canónico Único de Inventario Inicial (SPEC.md Escenario 457: < selectedDate, cero fallback a calculatedStock/inventory_stocks)
            const resolvedInv = await resolveInitialInventory({
                supabase,
                targetDate: selectedDate,
            });
            const stockMap = resolvedInv.stockMap;
            setInvSourceMeta({ sourceDate: resolvedInv.sourceDate, sourceKind: resolvedInv.sourceKind });

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

            // 2. Ejecutar Motor Canónico de Neteo (Sin merma plana; Meta Neta de Neteo exacta)
            const compiledNetting = calculateProcurementNetting({
                items: itemsForNetting,
                stocks: stockMap,
                options: { mermaFactor: 0.0, applySafetyStock: true }
            });

            const catalogList = catalogRes.data || [];
            const catalogById: Record<string, any> = {};
            const childrenByFamilyId: Record<string, any[]> = {};
            catalogList.forEach((p: any) => {
                catalogById[p.id] = p;
                const famId = p.parent_id || p.id;
                if (!childrenByFamilyId[famId]) childrenByFamilyId[famId] = [];
                childrenByFamilyId[famId].push(p);
            });

            const baseCompiled: PurchaseItem[] = compiledNetting.map(row => {
                const productStock = Number(stockMap[row.product_id] || 0);
                const catProd = catalogById[row.product_id];
                const famId = catProd?.parent_id || row.parent_id || row.product_id;
                const famProd = catalogById[famId];

                return {
                    id: row.key,
                    product_id: row.product_id,
                    accounting_id: row.accounting_id,
                    product_name: row.product_name,
                    variant_label: row.canonical_spec || undefined,
                    parent_id: famId,
                    parent_name: famProd?.name || row.parent_name,
                    sublist: row.sublist,
                    unit: row.unit,
                    demanda_neta: row.raw_demand_kg,
                    stock_bodega: productStock,
                    a_comprar: row.net_to_buy,
                    con_merma: row.suggested_with_merma,
                    family_id: famId
                };
            });

            // Escenario 495: Agrupar por sublista -> familia (Padre consolidado + hijos con demanda o stock)
            const bySublistMap: Record<string, PurchaseItem[]> = {};
            baseCompiled.forEach(it => {
                if (!bySublistMap[it.sublist]) bySublistMap[it.sublist] = [];
                bySublistMap[it.sublist].push(it);
            });

            const compiled: PurchaseItem[] = [];
            Object.keys(bySublistMap).sort().forEach(sublistKey => {
                const sublistRows = bySublistMap[sublistKey];
                const byFamily: Record<string, PurchaseItem[]> = {};
                sublistRows.forEach(it => {
                    const fId = it.family_id || it.product_id;
                    if (!byFamily[fId]) byFamily[fId] = [];
                    byFamily[fId].push(it);
                });

                const familyGroups = Object.entries(byFamily).map(([famId, famDemandedRows]) => {
                    const famProd = catalogById[famId];
                    const famName = famProd?.name || famDemandedRows[0]?.parent_name || famDemandedRows[0]?.product_name || '';
                    return { famId, famName, famProd, famDemandedRows };
                });

                familyGroups.sort((a, b) => a.famName.localeCompare(b.famName, 'es', { sensitivity: 'base' }));

                familyGroups.forEach(({ famId, famName, famProd, famDemandedRows }) => {
                    const catalogMembers = childrenByFamilyId[famId] || [];
                    const demandedPids = new Set(famDemandedRows.map(r => r.product_id));
                    const stockOnlyMembers = catalogMembers.filter(m => !demandedPids.has(m.id) && Number(stockMap[m.id] || 0) > 0);

                    const isHierarchicalFamily = catalogMembers.length >= 2 && (
                        demandedPids.size >= 2 ||
                        stockOnlyMembers.length > 0 ||
                        famDemandedRows.some(r => r.product_id !== famId)
                    );

                    if (!isHierarchicalFamily) {
                        famDemandedRows.sort((a, b) => compareFamilyProducts(
                            { name: a.product_name, familyKey: famName },
                            { name: b.product_name, familyKey: famName }
                        ));
                        famDemandedRows.forEach(r => compiled.push({ ...r, row_type: 'standalone' }));
                        return;
                    }

                    const childRows: PurchaseItem[] = [
                        ...famDemandedRows.map(r => ({ ...r, row_type: 'child' as const, is_stock_only: false })),
                        ...stockOnlyMembers.map(m => ({
                            id: `stock-only-${sublistKey}-${m.id}`,
                            product_id: m.id,
                            accounting_id: m.accounting_id,
                            product_name: m.name,
                            parent_id: famId,
                            parent_name: famName,
                            family_id: famId,
                            sublist: sublistKey,
                            unit: (m.unit_of_measure || 'KG').toUpperCase(),
                            demanda_neta: 0,
                            stock_bodega: Number(stockMap[m.id] || 0),
                            a_comprar: 0,
                            con_merma: 0,
                            row_type: 'child' as const,
                            is_stock_only: true
                        }))
                    ];

                    childRows.sort((a, b) => {
                        const aIsBase = a.product_id === famId ? 0 : 1;
                        const bIsBase = b.product_id === famId ? 0 : 1;
                        if (aIsBase !== bIsBase) return aIsBase - bIsBase;
                        const aStockOnly = a.is_stock_only ? 1 : 0;
                        const bStockOnly = b.is_stock_only ? 1 : 0;
                        if (aStockOnly !== bStockOnly) return aStockOnly - bStockOnly;
                        return compareFamilyProducts(
                            { name: a.product_name, familyKey: famName },
                            { name: b.product_name, familyKey: famName }
                        );
                    });

                    const seenFamilyPids = new Set<string>();
                    const familyTotalStock = childRows.reduce((sum, r) => {
                        if (seenFamilyPids.has(r.product_id)) return sum;
                        seenFamilyPids.add(r.product_id);
                        return sum + (r.stock_bodega || 0);
                    }, 0);
                    const familyTotalDemand = childRows.reduce((sum, r) => sum + (r.demanda_neta || 0), 0);

                    compiled.push({
                        id: `family-${sublistKey}-${famId}`,
                        product_id: famId,
                        accounting_id: famProd?.accounting_id ?? famDemandedRows[0]?.accounting_id,
                        product_name: famName,
                        parent_id: famId,
                        parent_name: famName,
                        family_id: famId,
                        sublist: sublistKey,
                        unit: (famProd?.unit_of_measure || childRows[0]?.unit || 'KG').toUpperCase(),
                        demanda_neta: Number(familyTotalDemand.toFixed(2)),
                        stock_bodega: Number(familyTotalStock.toFixed(2)),
                        a_comprar: Math.max(0, Number((familyTotalDemand - familyTotalStock).toFixed(2))),
                        con_merma: Math.max(0, Number((familyTotalDemand - familyTotalStock).toFixed(2))),
                        row_type: 'family'
                    });
                    childRows.forEach(c => compiled.push(c));
                });
            });

            setItems(compiled);

        } catch (err) {
            console.error('Error cargando compras:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group items by sublist (preservando orden jerárquico Padre -> Hijos)
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
    const exportToExcel = async () => {
        const pickerFilename = `compras_${selectedDate}.xlsx`;
        let fileHandle: any = null;
        try {
            fileHandle = await acquireSaveFileHandle({
                suggestedName: pickerFilename,
                description: 'Libro de Microsoft Excel (.xlsx)',
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                extension: '.xlsx',
            });
        } catch (err) {
            if (isSavePickerAborted(err)) return;
        }
        const XLSX = await import('xlsx');
        const rows = items.map((it, idx) => ({
            '#': idx + 1,
            'Sublista / Pabellón': it.sublist,
            'Tipo Registro': it.row_type === 'family' ? 'Familia' : it.row_type === 'child' ? '↳ Presentación' : 'Individual',
            'ID Producto': it.product_id,
            'ID Contable': it.accounting_id ? `#${it.accounting_id}` : '',
            'Stock en Bodega (INV)': it.stock_bodega,
            'Unidad Medida': it.unit,
            'Producto / Calibre': it.row_type === 'family'
                ? `${it.product_name} (Consolidado)`
                : `${it.row_type === 'child' ? '↳ ' : ''}${it.product_name}${it.variant_label ? ` (${it.variant_label})` : ''}`,
            'Producto Matriz (Padre)': it.parent_name,
            'Demanda Total': it.is_stock_only ? 0 : it.demanda_neta,
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

        const finalFilename = `compras_${selectedDate}.xlsx`;
        await saveWorkbookWithPicker(XLSX, workbook, finalFilename, fileHandle);
    };

    // Export Relación de Documentos (.xlsx) - Clona formato operacional histórico
    const handleExportRelacionDocumentos = async () => {
        setIsExportingRelacion(true);
        try {
            await exportRelacionDocumentosWithPicker({ selectedDate });
        } catch (err) {
            console.error('[PurchasesPrintPage] Error exportando relación de documentos:', err);
            alert('Ocurrió un error al exportar la relación de documentos.');
        } finally {
            setIsExportingRelacion(false);
        }
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
                    .purchases-table td {
                        border-bottom: 1px solid #64748B !important;
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

                    <DirectPdfSaveButton docType="purchases" selectedDate={selectedDate} containerRef={printDocRef} paperSize="oficio" orientation="portrait" margin="0.8cm 1.0cm" />

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
                        // Paginación dinámica calibrada para hoja Oficio sin cabecera institucional
                        // Área útil: ~280 mm → ~45 filas simples por página a ~6.0 mm
                        const MAX_ROW_UNITS = 45;
                        const FOOTER_RESERVE = 2.0; // unidades reservadas para tfoot y firmas simplificadas
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

                        const countableItems = sublistItems.filter(it => it.row_type !== 'family');
                        const totalKilosNetos = countableItems.reduce((s, it) => s + it.demanda_neta, 0);
                        const seenProductPids = new Set<string>();
                        const totalStockBodega = countableItems.reduce((s, it) => {
                            if (!seenProductPids.has(it.product_id)) {
                                seenProductPids.add(it.product_id);
                                return s + it.stock_bodega;
                            }
                            return s;
                        }, 0);
                        const totalAComprar = countableItems.reduce((s, it) => s + it.a_comprar, 0);

                        return sublistPages.map(({ items: pageItems, usedUnits: pageUsedUnits }, pageIdx) => {
                            const isLastPage = pageIdx === sublistPages.length - 1;
                            const baseInvLabel = invSourceMeta.sourceKind === 'official_closing'
                                ? `BASE INV: CIERRE OFICIAL ${invSourceMeta.sourceDate}`
                                : invSourceMeta.sourceKind === 'partial_closing'
                                    ? `BASE INV: CIERRE PARCIAL (${invSourceMeta.sourceDate})`
                                    : invSourceMeta.sourceDate
                                        ? `BASE INV: CONTEO SIN CIERRE (${invSourceMeta.sourceDate})`
                                        : 'BASE INV: SIN CIERRE PREVIO (0)';
                            const pageSubtitle = `NEGOCIACIÓN EN PLAZA · CENTRAL CORABASTOS · ${baseInvLabel}${sublistPages.length > 1 ? ` · HOJA ${pageIdx + 1} DE ${sublistPages.length}` : ''}`;
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
                                    showHeader={false}
                                    showFooter={false}
                                >
                                    {/* Sublist summary banner */}
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'flex-end',
                                        alignItems: 'center',
                                        backgroundColor: '#F8FAFC',
                                        padding: '3px 8px',
                                        border: '1px solid #CBD5E1',
                                        borderRadius: '4px',
                                        fontSize: '7.2pt',
                                        marginBottom: '6px'
                                    }}>
                                        <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A' }}>
                                            {countableItems.length} Productos &bull; Stock Bodega: {totalStockBodega.toLocaleString('es-CO')} &bull; Demanda Total: {totalKilosNetos.toLocaleString('es-CO')}
                                        </div>
                                    </div>

                                    {/* Items Table (6 Columnas: Stock INV, UM, Producto / Calibre, Demanda, Precio, Proveedor) */}
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '10%', textAlign: 'right', fontSize: '8.2pt', backgroundColor: '#1E293B' }}>Stock INV</th>
                                                <th style={{ width: '6.5%', textAlign: 'center', fontSize: '8.2pt' }}>UM</th>
                                                <th style={{ width: '38.5%', fontSize: '8.2pt' }}>Producto / Calibre Especificado</th>
                                                <th style={{ width: '11%', textAlign: 'right', fontSize: '8.2pt', backgroundColor: '#0D7A57' }}>Demanda</th>
                                                <th style={{ width: '10%', textAlign: 'center', fontSize: '8.2pt' }}>Precio $/UM</th>
                                                <th style={{ width: '24%', textAlign: 'center', fontSize: '8.2pt' }}>Puesto / Proveedor</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(() => {
                                                // Calcular agrupación de celdas (rowSpan) para ítems consecutivos del mismo SKU (excluyendo filas Familia)
                                                const itemSpans: Array<{ isFirst: boolean; span: number }> = [];
                                                for (let i = 0; i < pageItems.length; i++) {
                                                    const curr = pageItems[i];
                                                    const prev = i > 0 ? pageItems[i - 1] : null;
                                                    if (
                                                        prev &&
                                                        curr.row_type !== 'family' &&
                                                        prev.row_type !== 'family' &&
                                                        prev.product_id === curr.product_id
                                                    ) {
                                                        itemSpans.push({ isFirst: false, span: 0 });
                                                    } else {
                                                        let count = 1;
                                                        if (curr.row_type !== 'family') {
                                                            while (
                                                                i + count < pageItems.length &&
                                                                pageItems[i + count].row_type !== 'family' &&
                                                                pageItems[i + count].product_id === curr.product_id
                                                            ) {
                                                                count++;
                                                            }
                                                        }
                                                        itemSpans.push({ isFirst: true, span: count });
                                                    }
                                                }

                                                return pageItems.map((it, itemIdx) => {
                                                    const spanInfo = itemSpans[itemIdx];
                                                    const isFamilyRow = it.row_type === 'family';
                                                    const isChildRow = it.row_type === 'child';
                                                    const isStockOnlyChild = Boolean(it.is_stock_only);
                                                    const bg = isFamilyRow
                                                        ? '#FEF9C3'
                                                        : (itemIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC');

                                                    return (
                                                        <tr
                                                            key={it.id || itemIdx}
                                                            style={{
                                                                backgroundColor: bg,
                                                                borderTop: isFamilyRow ? '1.5px solid #1E293B' : undefined,
                                                                borderBottom: isFamilyRow ? '1.5px solid #475569' : '1px solid #CBD5E1',
                                                                WebkitPrintColorAdjust: 'exact',
                                                                printColorAdjust: 'exact'
                                                            }}
                                                        >
                                                            {/* 1. Stock INV */}
                                                            <td
                                                                style={{
                                                                    textAlign: 'right',
                                                                    fontSize: isFamilyRow ? '8.2pt' : '7.8pt',
                                                                    fontWeight: isFamilyRow || (spanInfo.isFirst && it.stock_bodega > 0) ? '900' : '600',
                                                                    fontVariantNumeric: 'tabular-nums',
                                                                    color: isFamilyRow || (spanInfo.isFirst && it.stock_bodega > 0) ? '#0F172A' : '#64748B',
                                                                    verticalAlign: 'middle',
                                                                    padding: '3px 4px'
                                                                }}
                                                            >
                                                                {isFamilyRow
                                                                    ? (it.stock_bodega > 0 ? it.stock_bodega.toLocaleString('es-CO') : '-')
                                                                    : spanInfo.isFirst
                                                                        ? (it.stock_bodega > 0 ? it.stock_bodega.toLocaleString('es-CO') : '-')
                                                                        : (it.stock_bodega > 0
                                                                            ? <span style={{ fontSize: '8pt', color: '#475569' }} title="Mismo stock de la fila superior">↑</span>
                                                                            : '-')
                                                                }
                                                            </td>

                                                            {/* 2. UM */}
                                                            <td
                                                                style={{
                                                                    textAlign: 'center',
                                                                    fontSize: '7.5pt',
                                                                    fontWeight: isFamilyRow ? '800' : '600',
                                                                    color: '#334155',
                                                                    verticalAlign: 'middle',
                                                                    padding: '3px 3px'
                                                                }}
                                                            >
                                                                {it.unit || 'KG'}
                                                            </td>

                                                            {/* 3. Producto / Calibre Especificado */}
                                                            <td style={{
                                                                wordBreak: 'break-word',
                                                                overflowWrap: 'break-word',
                                                                padding: isChildRow ? '3px 6px 3px 14px' : '3px 6px 3px 4px'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexWrap: 'wrap' }}>
                                                                    {isChildRow && (
                                                                        <span style={{ color: '#64748B', fontWeight: '700', fontSize: '8pt' }}>↳</span>
                                                                    )}
                                                                    <span style={{
                                                                        fontWeight: isChildRow ? '500' : '900',
                                                                        color: '#0F172A',
                                                                        fontSize: isFamilyRow ? '8.5pt' : (isChildRow ? '8pt' : '8.3pt'),
                                                                        lineHeight: 1.25
                                                                    }}>
                                                                        {it.product_name}
                                                                    </span>
                                                                    {it.accounting_id !== undefined && it.accounting_id !== null && (
                                                                        <span style={{ 
                                                                            fontSize: '6.8pt', 
                                                                            color: isFamilyRow ? '#475569' : '#94A3B8', 
                                                                            fontWeight: '600', 
                                                                            fontFamily: 'monospace',
                                                                            letterSpacing: '0.02em',
                                                                            userSelect: 'none'
                                                                        }}>
                                                                            #{it.accounting_id}
                                                                        </span>
                                                                    )}
                                                                    {isFamilyRow && (
                                                                        <span style={{
                                                                            fontSize: '6pt',
                                                                            fontWeight: '800',
                                                                            color: '#1E293B',
                                                                            border: '1px solid #475569',
                                                                            borderRadius: '3px',
                                                                            padding: '0 4px',
                                                                            letterSpacing: '0.04em'
                                                                        }}>
                                                                            FAMILIA
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {it.variant_label && (
                                                                    <div style={{ fontSize: '6.8pt', color: '#475569', marginTop: '1.5px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', paddingLeft: isChildRow ? '14px' : undefined }}>
                                                                        <span style={{ backgroundColor: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: '3px', padding: '1px 5px', fontWeight: '700', color: '#1E293B' }}>
                                                                            {it.variant_label}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                            </td>

                                                            {/* 4. Demanda Neta */}
                                                            <td style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '3px 4px', verticalAlign: 'middle' }}>
                                                                {isStockOnlyChild ? (
                                                                    <CrossedOutCell />
                                                                ) : (
                                                                    <span style={{
                                                                        display: 'inline-block',
                                                                        backgroundColor: isFamilyRow ? '#DCFCE7' : (it.demanda_neta > 0 ? '#ECFDF5' : '#F8FAFC'),
                                                                        border: isFamilyRow ? '1.5px solid #15803D' : (it.demanda_neta > 0 ? '1px solid #A7F3D0' : '1px solid #E2E8F0'),
                                                                        borderRadius: '4px',
                                                                        padding: '1px 5px',
                                                                        fontWeight: '900',
                                                                        color: it.demanda_neta > 0 ? '#065F46' : '#94A3B8',
                                                                        fontSize: isFamilyRow ? '8.3pt' : '8pt',
                                                                        fontVariantNumeric: 'tabular-nums'
                                                                    }}>
                                                                        {it.demanda_neta > 0 ? it.demanda_neta.toLocaleString('es-CO') : '0'}
                                                                    </span>
                                                                )}
                                                            </td>

                                                            {/* 5. Precio Pactado ($/UM) */}
                                                            <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '3px 4px' }}>
                                                                {isStockOnlyChild ? (
                                                                    <CrossedOutCell />
                                                                ) : (
                                                                    <div style={{
                                                                        borderBottom: '1px dashed #94A3B8',
                                                                        height: '20px',
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
                                                                )}
                                                            </td>

                                                            {/* 6. Puesto / Proveedor */}
                                                            <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '3px 6px' }}>
                                                                {isStockOnlyChild ? (
                                                                    <CrossedOutCell />
                                                                ) : (
                                                                    <div style={{
                                                                        borderBottom: '1px dashed #94A3B8',
                                                                        height: '20px'
                                                                    }}></div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                        {isLastPage && (
                                            <tfoot>
                                                <tr style={{ backgroundColor: '#F1F5F9', fontWeight: '900' }}>
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

                                    {/* Simplified Footer */}
                                    {isLastPage ? (
                                        <div style={{
                                            marginTop: 'auto',
                                            paddingTop: '6px',
                                            borderTop: '1px solid #CBD5E1',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            fontSize: '6.8pt',
                                            color: '#334155'
                                        }}>
                                            <div style={{ display: 'flex', gap: '24px' }}>
                                                <span><strong>Comprador Plaza:</strong> _____________________________</span>
                                                <span><strong>Conductor / Cargue:</strong> _____________________________</span>
                                                <span><strong>Recibido Bodega:</strong> _____________________________</span>
                                            </div>
                                            <div style={{ fontSize: '6.2pt', color: '#94A3B8', fontWeight: '700' }}>
                                                FruFresco &bull; Control Operativo
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            marginTop: 'auto',
                                            paddingTop: '4px',
                                            textAlign: 'right',
                                            fontSize: '6.5pt',
                                            fontWeight: '700',
                                            color: '#94A3B8'
                                        }}>
                                            Continúa en la siguiente hoja &bull; Pág. {pageIdx + 1} de {sublistPages.length}
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
