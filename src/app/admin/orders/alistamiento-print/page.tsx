'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { Printer, ArrowLeft, Filter, Calendar, Layers, CheckCircle2 } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
import UniversalLetterhead from '@/components/print/UniversalLetterhead';
import { INVESTMENTS_CORTES_BRAND } from '@/components/print/presets';
import { printViaNewWindow } from '@/components/print';

interface OrderItem {
    id: string;
    order_id: string;
    product_id: string;
    quantity: number;
    unit?: string;
    nickname?: string;
    variant_label?: string;
    product?: {
        id: string;
        name: string;
        sku?: string;
        unit_of_measure?: string;
        buying_team?: string | null;
        category?: string | null;
    };
}

interface OrderInfo {
    id: string;
    sequence_id?: number;
    delivery_date: string;
    delivery_slot?: string;
    warehouse_spaces?: number[];
    client_name: string;
    client_short: string;
    order_num: string;
    space_label: string;
}

const KNOWN_CELLS = [
    '1. ALISTA SECO PAPAS',
    '2. ALISTA SECO PLATANOS',
    '3. ALISTA SECO TOMATE',
    '5. HIERBAS Y VEGETALES',
    '6. FRUTAS Y OTROS',
    '7. FRESAS Y MORA',
    '8. AGUACATES',
    '10. PROCESADOS',
    '11. LACTEOS CARNES FRIAS',
    '12. HORTALIZAS SELECCIONADAS',
    '14. FRUTA BAJA DEMANDA',
    '15. LECHUGA BATAVIA'
];

export default function AlistamientoSabanaPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const paramDate = searchParams.get('date');
    const paramOrderIds = searchParams.get('orderIds');

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        const now = new Date();
        return now.toISOString().split('T')[0];
    });

    const [selectedCellFilter, setSelectedCellFilter] = useState<string>('ALL');
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const printDocRef = useRef<HTMLDivElement>(null);

    // Fetch data
    useEffect(() => {
        fetchOrdersAndItems();
    }, [selectedDate, paramOrderIds]);

    const fetchOrdersAndItems = async () => {
        setLoading(true);
        try {
            let orderQuery = supabase
                .from('orders')
                .select(`
                    id, sequence_id, delivery_date, delivery_slot, warehouse_spaces, status, profile_id,
                    profiles:profile_id(id, company_name, contact_name),
                    order_items(
                        id, order_id, product_id, quantity, unit, nickname, variant_label,
                        products(id, name, sku, unit_of_measure, buying_team, category)
                    )
                `)
                .neq('status', 'cancelled');

            if (paramOrderIds) {
                const ids = paramOrderIds.split(',').map(s => s.trim()).filter(Boolean);
                orderQuery = orderQuery.in('id', ids);
            } else {
                orderQuery = orderQuery.eq('delivery_date', selectedDate);
            }

            const { data: rawOrders, error: oErr } = await orderQuery.order('created_at', { ascending: true });
            if (oErr) throw oErr;

            const parsedOrders: OrderInfo[] = [];
            const parsedItems: OrderItem[] = [];

            (rawOrders || []).forEach((o: any, idx: number) => {
                const clientName = o.profiles?.company_name || o.profiles?.contact_name || 'Cliente';
                const clientShort = clientName
                    .toUpperCase()
                    .replace('RESTAURANTE', '')
                    .replace('CORPORACION', '')
                    .replace('HOTEL', '')
                    .trim()
                    .slice(0, 16);

                const spaceLabel = (o.warehouse_spaces && o.warehouse_spaces.length > 0)
                    ? formatSpaceLabel(o.warehouse_spaces)
                    : (o.sequence_id ? `${o.sequence_id}` : `${idx + 1}`);

                const orderNum = getFriendlyOrderId(o);

                parsedOrders.push({
                    id: o.id,
                    sequence_id: o.sequence_id,
                    delivery_date: o.delivery_date,
                    delivery_slot: o.delivery_slot,
                    warehouse_spaces: o.warehouse_spaces,
                    client_name: clientName,
                    client_short: clientShort,
                    order_num: orderNum,
                    space_label: spaceLabel
                });

                (o.order_items || []).forEach((it: any) => {
                    parsedItems.push({
                        id: it.id,
                        order_id: o.id,
                        product_id: it.product_id || it.products?.id,
                        quantity: Number(it.quantity) || 0,
                        unit: it.unit || it.products?.unit_of_measure || 'KG',
                        nickname: it.nickname,
                        variant_label: it.variant_label,
                        product: it.products ? {
                            id: it.products.id,
                            name: it.products.name,
                            sku: it.products.sku,
                            unit_of_measure: it.products.unit_of_measure,
                            buying_team: it.products.buying_team,
                            category: it.products.category
                        } : undefined
                    });
                });
            });

            // Sort orders numerically by first warehouse space for logical floor layout!
            parsedOrders.sort((a, b) => {
                const spaceA = a.warehouse_spaces?.[0] ?? a.sequence_id ?? 999;
                const spaceB = b.warehouse_spaces?.[0] ?? b.sequence_id ?? 999;
                return spaceA - spaceB;
            });

            setOrders(parsedOrders);
            setItems(parsedItems);

        } catch (err) {
            console.error('Error cargando alistamiento:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group items by Cell (buying_team)
    const cellGroups = useMemo(() => {
        const groups: Record<string, {
            cellName: string;
            productsMap: Map<string, {
                id: string;
                name: string;
                sku: string;
                unit: string;
                totalQty: number;
                quantitiesByOrder: Record<string, number>;
            }>;
            activeOrders: OrderInfo[];
        }> = {};

        // Helper to normalize buying team
        const normalizeCell = (raw?: string | null) => {
            if (!raw || !raw.trim()) return 'SIN ASIGNAR';
            const clean = raw.trim();
            const matched = KNOWN_CELLS.find(k => k.toLowerCase() === clean.toLowerCase());
            return matched || clean;
        };

        items.forEach(it => {
            const cell = normalizeCell(it.product?.buying_team);
            if (!groups[cell]) {
                groups[cell] = {
                    cellName: cell,
                    productsMap: new Map(),
                    activeOrders: []
                };
            }

            const pId = it.product_id || it.product?.name || 'misc';
            const pName = it.nickname || it.product?.name || 'Producto';
            const sku = it.product?.sku || '';
            const unit = it.unit || it.product?.unit_of_measure || 'KG';

            if (!groups[cell].productsMap.has(pId)) {
                groups[cell].productsMap.set(pId, {
                    id: pId,
                    name: pName,
                    sku,
                    unit,
                    totalQty: 0,
                    quantitiesByOrder: {}
                });
            }

            const prodRec = groups[cell].productsMap.get(pId)!;
            prodRec.totalQty += it.quantity;
            prodRec.quantitiesByOrder[it.order_id] = (prodRec.quantitiesByOrder[it.order_id] || 0) + it.quantity;
        });

        // Determine which orders actually have items in each cell
        Object.keys(groups).forEach(cell => {
            const prodMap = groups[cell].productsMap;
            const relevantOrderIds = new Set<string>();
            prodMap.forEach(prod => {
                Object.keys(prod.quantitiesByOrder).forEach(oId => relevantOrderIds.add(oId));
            });
            groups[cell].activeOrders = orders.filter(o => relevantOrderIds.has(o.id));
        });

        return groups;
    }, [items, orders]);

    // Available cells for selector
    const availableCellNames = useMemo(() => {
        return Object.keys(cellGroups).sort();
    }, [cellGroups]);

    // Active cells to render
    const filteredCellNames = useMemo(() => {
        if (selectedCellFilter === 'ALL') {
            return availableCellNames;
        }
        return availableCellNames.filter(c => c === selectedCellFilter);
    }, [availableCellNames, selectedCellFilter]);

    // Chunker for horizontal layout: max 10 clients per sheet
    const MAX_CLIENTS_PER_PAGE = 10;

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles />

            {/* Custom Landscape CSS for print */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: letter landscape !important;
                        margin: 0.8cm !important;
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
                            <Layers size={20} color="#0D7A57" />
                            Sábana Maestra de Alistamiento por Células (ALISTAMIENTO.pdf)
                        </h1>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {orders.length} pedidos &bull; {items.length} líneas de picking &bull; Formato Apaisado (Landscape) con Bahías
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Date Input */}
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

                    {/* Cell Filter */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }}>
                        <Filter size={14} color="#64748B" />
                        <select
                            value={selectedCellFilter}
                            onChange={(e) => setSelectedCellFilter(e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '700', color: '#0F172A', outline: 'none' }}
                        >
                            <option value="ALL">Todas las Células ({availableCellNames.length})</option>
                            {availableCellNames.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>

                    {/* Print Button */}
                    <button
                        onClick={() => {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: `Sábana de Alistamiento - ${selectedDate}`,
                                paperSize: 'letter',
                                orientation: 'landscape',
                                margin: '0.8cm 1.0cm'
                            });
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 20px',
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
                        <Printer size={16} /> Imprimir Sábana (Ventana Limpia)
                    </button>
                </div>
            </div>

            {/* Document Body (Landscape View - Wrapped with ref) */}
            <div ref={printDocRef} style={{ maxWidth: '1100px', margin: '1.5rem auto', padding: '0 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando matriz de alistamiento nocturno...</p>
                    </div>
                ) : filteredCellNames.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No se encontraron órdenes ni productos para esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha en el panel superior o verifica pedidos con estado activo.</p>
                    </div>
                ) : (
                    filteredCellNames.map((cellName) => {
                        const cellData = cellGroups[cellName];
                        const activeOrders = cellData.activeOrders;
                        const productsList = Array.from(cellData.productsMap.values()).sort((a, b) => a.name.localeCompare(b.name));

                        // Chunk active orders into pages of MAX_CLIENTS_PER_PAGE
                        const pagesCount = Math.ceil(activeOrders.length / MAX_CLIENTS_PER_PAGE) || 1;
                        const chunks: OrderInfo[][] = [];
                        for (let i = 0; i < pagesCount; i++) {
                            chunks.push(activeOrders.slice(i * MAX_CLIENTS_PER_PAGE, (i + 1) * MAX_CLIENTS_PER_PAGE));
                        }

                        return chunks.map((chunkOrders, chunkIdx) => {
                            return (
                                <div
                                    key={`${cellName}-page-${chunkIdx}`}
                                    className="page-break"
                                    style={{
                                        backgroundColor: '#FFFFFF',
                                        padding: '12px 16px',
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
                                            title: 'SÁBANA MAESTRA DE ALISTAMIENTO',
                                            subtitle: `CÉLULA: ${cellName.toUpperCase()} · PESAJE EN PISO`,
                                            date: selectedDate,
                                            reference: `FOLIO ${chunkIdx + 1}/${pagesCount}`,
                                            badge: cellName.toUpperCase(),
                                            badgeVariant: 'dark'
                                        }}
                                    >
                                        {/* Sub-header with Cell Summary */}
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
                                                <strong>Instrucciones de Pesaje:</strong> Pese y empaque cada producto en canastilla. Escriba el peso real báscula en la casilla y traslade la canastilla al <strong>LUGAR</strong> indicado en la cabecera.
                                            </div>
                                            <div style={{ whiteSpace: 'nowrap', fontWeight: '800', color: '#0F172A' }}>
                                                {productsList.length} SKUs &bull; Clientes: {chunkOrders.length}/{activeOrders.length}
                                            </div>
                                        </div>

                                        {/* Cross-Tab Matrix Table */}
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.64rem' }}>
                                            <thead>
                                                {/* Header Row 1: Space / Bahía numbers in soil */}
                                                <tr style={{ backgroundColor: '#0F172A', color: '#FFFFFF' }}>
                                                    <th colSpan={3} style={{ textAlign: 'left', padding: '3px 6px', fontSize: '0.68rem', fontWeight: '900', border: '1px solid #0F172A' }}>
                                                        ESPECIFICACIÓN DEL PRODUCTO
                                                    </th>
                                                    <th style={{ textAlign: 'center', padding: '3px 4px', fontSize: '0.62rem', fontWeight: '800', border: '1px solid #0F172A', width: '50px', backgroundColor: '#1E293B' }}>
                                                        DEMANDA
                                                    </th>

                                                    {/* Client Space LUGAR columns */}
                                                    {chunkOrders.map((ord) => (
                                                        <th
                                                            key={ord.id}
                                                            style={{
                                                                textAlign: 'center',
                                                                padding: '2px 4px',
                                                                fontSize: '0.72rem',
                                                                fontWeight: '900',
                                                                backgroundColor: '#0D7A57',
                                                                color: '#FFFFFF',
                                                                border: '1px solid #0A6044',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                        >
                                                            LUGAR [{ord.space_label}]
                                                        </th>
                                                    ))}

                                                    <th style={{ textAlign: 'center', padding: '3px 4px', fontSize: '0.62rem', fontWeight: '900', border: '1px solid #0F172A', width: '60px', backgroundColor: '#334155' }}>
                                                        TOTAL PESADO
                                                    </th>
                                                </tr>

                                                {/* Header Row 2: Client names & Order IDs */}
                                                <tr style={{ backgroundColor: '#F1F5F9', color: '#334155' }}>
                                                    <th style={{ width: '22px', textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1' }}>#</th>
                                                    <th style={{ textAlign: 'left', padding: '3px 6px', border: '1px solid #CBD5E1' }}>Producto Matriz</th>
                                                    <th style={{ width: '32px', textAlign: 'center', padding: '3px 2px', border: '1px solid #CBD5E1' }}>UM</th>
                                                    <th style={{ textAlign: 'right', padding: '3px 4px', border: '1px solid #CBD5E1', fontWeight: '800' }}>Total</th>

                                                    {chunkOrders.map((ord) => (
                                                        <th
                                                            key={ord.id}
                                                            style={{
                                                                textAlign: 'center',
                                                                padding: '3px 4px',
                                                                fontSize: '0.58rem',
                                                                fontWeight: '800',
                                                                border: '1px solid #CBD5E1',
                                                                maxWidth: '75px',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                whiteSpace: 'nowrap'
                                                            }}
                                                            title={ord.client_name}
                                                        >
                                                            {ord.client_short}
                                                            <div style={{ fontSize: '0.52rem', fontWeight: 'normal', color: '#64748B' }}>#{ord.order_num}</div>
                                                        </th>
                                                    ))}

                                                    <th style={{ textAlign: 'center', padding: '3px 4px', border: '1px solid #CBD5E1', fontWeight: '800' }}>Báscula</th>
                                                </tr>
                                            </thead>

                                            <tbody>
                                                {productsList.map((prod, pIdx) => {
                                                    const bg = pIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
                                                    return (
                                                        <tr key={prod.id} style={{ backgroundColor: bg }}>
                                                            <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', fontWeight: '700', color: '#64748B' }}>
                                                                {pIdx + 1}
                                                            </td>
                                                            <td style={{ textAlign: 'left', padding: '2.5px 6px', border: '1px solid #E2E8F0' }}>
                                                                <strong style={{ color: '#0F172A' }}>{prod.name}</strong>
                                                                {prod.sku && <span style={{ fontSize: '0.56rem', color: '#64748B', marginLeft: '4px' }}>({prod.sku})</span>}
                                                            </td>
                                                            <td style={{ textAlign: 'center', padding: '2.5px 2px', border: '1px solid #E2E8F0', color: '#475569' }}>
                                                                {prod.unit}
                                                            </td>
                                                            <td style={{ textAlign: 'right', padding: '2.5px 5px', border: '1px solid #E2E8F0', fontWeight: '900', color: '#0F172A' }}>
                                                                {prod.totalQty.toLocaleString('es-CO')}
                                                            </td>

                                                            {/* Cells for each client */}
                                                            {chunkOrders.map((ord) => {
                                                                const qty = prod.quantitiesByOrder[ord.id];
                                                                if (qty && qty > 0) {
                                                                    return (
                                                                        <td
                                                                            key={ord.id}
                                                                            style={{
                                                                                textAlign: 'center',
                                                                                padding: '2.5px 2px',
                                                                                border: '1px solid #CBD5E1',
                                                                                backgroundColor: '#FEF9C3' // yellow tint for active orders to catch eye
                                                                            }}
                                                                        >
                                                                            <div style={{ fontWeight: '900', fontSize: '0.68rem', color: '#0F172A' }}>
                                                                                {qty.toLocaleString('es-CO')}
                                                                            </div>
                                                                            <div style={{ fontSize: '0.50rem', color: '#92400E', borderTop: '0.5px dashed #CA8A04', marginTop: '1px', paddingTop: '1px' }}>
                                                                                [ _____ ]
                                                                            </div>
                                                                        </td>
                                                                    );
                                                                }
                                                                return (
                                                                    <td
                                                                        key={ord.id}
                                                                        style={{
                                                                            textAlign: 'center',
                                                                            padding: '2.5px 2px',
                                                                            border: '1px solid #E2E8F0',
                                                                            color: '#CBD5E1',
                                                                            fontSize: '0.6rem'
                                                                        }}
                                                                    >
                                                                        -
                                                                    </td>
                                                                );
                                                            })}

                                                            {/* Real Scale column */}
                                                            <td style={{ textAlign: 'center', padding: '2.5px 4px', border: '1px solid #CBD5E1', borderLeft: '2px solid #0F172A' }}>
                                                                ________
                                                            </td>
                                                        </tr>
                                                    );
                                                })}

                                                {/* Summary Totals Row */}
                                                <tr style={{ backgroundColor: '#F1F5F9', fontWeight: '900' }}>
                                                    <td colSpan={3} style={{ textAlign: 'right', padding: '4px 6px', border: '1px solid #CBD5E1', color: '#0F172A' }}>
                                                        TOTAL CÉLULA:
                                                    </td>
                                                    <td style={{ textAlign: 'right', padding: '4px 5px', border: '1px solid #CBD5E1', color: '#0D7A57' }}>
                                                        {productsList.reduce((s, p) => s + p.totalQty, 0).toLocaleString('es-CO')}
                                                    </td>

                                                    {chunkOrders.map((ord) => {
                                                        const clientCellTotal = productsList.reduce((sum, p) => sum + (p.quantitiesByOrder[ord.id] || 0), 0);
                                                        return (
                                                            <td
                                                                key={ord.id}
                                                                style={{
                                                                    textAlign: 'center',
                                                                    padding: '4px 2px',
                                                                    border: '1px solid #CBD5E1',
                                                                    color: '#0F172A',
                                                                    fontSize: '0.62rem'
                                                                }}
                                                            >
                                                                {clientCellTotal > 0 ? clientCellTotal.toLocaleString('es-CO') : '-'}
                                                            </td>
                                                        );
                                                    })}

                                                    <td style={{ textAlign: 'center', padding: '4px 2px', border: '1px solid #CBD5E1' }}>
                                                        kg / und
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Signatures & Auditor footer */}
                                        <div style={{
                                            marginTop: '10px',
                                            paddingTop: '6px',
                                            borderTop: '1px solid #CBD5E1',
                                            display: 'grid',
                                            gridTemplateColumns: '1.2fr 1.2fr 1fr',
                                            gap: '12px',
                                            fontSize: '0.62rem'
                                        }}>
                                            <div>
                                                <strong>Líder de Célula:</strong> ___________________________
                                                <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Firma y responsable de pesaje en báscula</div>
                                            </div>
                                            <div>
                                                <strong>Auditor de Calidad / Despacho:</strong> ___________________________
                                                <div style={{ fontSize: '0.54rem', color: '#64748B', marginTop: '2px' }}>Verificación aleatoria de canastillas en bahías</div>
                                            </div>
                                            <div style={{ textAlign: 'right', fontWeight: 'bold', color: '#0F172A' }}>
                                                Hora Inicio: ____:____ &bull; Fin: ____:____
                                            </div>
                                        </div>
                                    </UniversalLetterhead>
                                </div>
                            );
                        });
                    })
                )}
            </div>
        </div>
    );
}
