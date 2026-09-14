'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { Printer, ArrowLeft, Filter, Calendar, Layers } from 'lucide-react';
import GoldenPrintStyles from '@/components/print/GoldenPrintStyles';
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
    shipping_address?: string;
    warehouse_spaces?: number[];
    client_name: string;
    branch_name: string;
    client_type: 'I' | 'H';
    order_num: string;
    space_label: string;
    first_space: number;
}

interface ProductInCell {
    id: string;
    name: string;
    sku: string;
    unit: string;
    displayName: string;
    totalQty: number;
    orderDemand: Record<string, { quantity: number; unit: string; note?: string }>;
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

/**
 * Normaliza la sucursal y el cliente para visualización inmediata en piso de bodega.
 * Si es una entidad multisede (Colsubsidio, Aldimark, Yanuba, Peñalisa), destaca la sucursal/sede
 * en lugar de truncar la razón social matriz.
 */
function extractBranchAndClient(orderRaw: any): { branchName: string; parentName: string } {
    const profile = orderRaw.profiles || {};
    const company = (profile.company_name || '').trim();
    const contact = (profile.contact_name || '').trim();
    const shipping = (orderRaw.shipping_address || '').trim();
    const customer = (orderRaw.customer_name || '').trim();

    // 1. Colsubsidio
    if (company.toUpperCase().includes('COLSUBSIDIO')) {
        if (company.includes('-')) {
            const branch = company.split('-').slice(1).join(' - ').trim();
            return {
                branchName: `COLSUBSIDIO - ${branch.toUpperCase()}`,
                parentName: 'Colsubsidio'
            };
        }
        if (shipping.toUpperCase().includes('GIRARDOT') || shipping.toUpperCase().includes('RICAURTE')) {
            return {
                branchName: 'COLSUBSIDIO - RICAURTE / GIRARDOT',
                parentName: 'Colsubsidio'
            };
        }
        if (shipping.toUpperCase().includes('CHAPINERO')) {
            return {
                branchName: 'COLSUBSIDIO - CHAPINERO',
                parentName: 'Colsubsidio'
            };
        }
        if (contact && !contact.toUpperCase().includes('COLSUBSIDIO')) {
            return {
                branchName: `COLSUBSIDIO - ${contact.toUpperCase()}`,
                parentName: 'Colsubsidio'
            };
        }
        return {
            branchName: 'COLSUBSIDIO - SEDE PRINCIPAL',
            parentName: 'Colsubsidio'
        };
    }

    // 2. Aldimark
    if (company.toUpperCase().includes('ALDIMARK')) {
        if (company.includes('-')) {
            const branch = company.split('-').slice(1).join(' - ').replace(/^ALDIMARK[- ]*/i, '').trim();
            return {
                branchName: `ALDIMARK - ${branch.toUpperCase()}`,
                parentName: 'Aldimark'
            };
        }
        if (contact && !contact.toUpperCase().includes('ALDIMARK') && !contact.toUpperCase().includes('BOBADILLA')) {
            return {
                branchName: `ALDIMARK - ${contact.toUpperCase()}`,
                parentName: 'Aldimark'
            };
        }
        return {
            branchName: 'ALDIMARK - SEDE PRINCIPAL',
            parentName: 'Aldimark'
        };
    }

    // 3. Yanuba
    if (company.toUpperCase().includes('YANUBA') || company.toUpperCase().includes('MILSEN')) {
        if (company.toUpperCase().includes('150') || company.toUpperCase().includes('CEDRITOS')) {
            return {
                branchName: 'YANUBA - 150 CEDRITOS',
                parentName: 'Yanuba / Milsen SAS'
            };
        }
        if (company.toUpperCase().includes('122') || company.toUpperCase().includes('SANTA')) {
            return {
                branchName: 'YANUBA - 122 SANTA BÁRBARA',
                parentName: 'Yanuba'
            };
        }
        return {
            branchName: 'YANUBA',
            parentName: 'Milsen SAS'
        };
    }

    // 4. Puerto Peñalisa
    if (company.toUpperCase().includes('PUERTO PENALISA') || company.toUpperCase().includes('PUERTO PEÑALISA')) {
        if (shipping.toUpperCase().includes('USAQUÉN') || shipping.toUpperCase().includes('USAQUEN')) {
            return {
                branchName: 'PUERTO PEÑALISA - USAQUÉN',
                parentName: 'Corp. Club Puerto Peñalisa'
            };
        }
        if (shipping.toUpperCase().includes('TEUSAQUILLO')) {
            return {
                branchName: 'PUERTO PEÑALISA - TEUSAQUILLO',
                parentName: 'Corp. Club Puerto Peñalisa'
            };
        }
        if (shipping.toUpperCase().includes('PUENTE ARANDA')) {
            return {
                branchName: 'PUERTO PEÑALISA - PUENTE ARANDA',
                parentName: 'Corp. Club Puerto Peñalisa'
            };
        }
        if (shipping.toUpperCase().includes('RICAURTE')) {
            return {
                branchName: 'PUERTO PEÑALISA - RICAURTE',
                parentName: 'Fundación Puerto Peñalisa'
            };
        }
        if (company.includes('-')) {
            const branch = company.split('-').slice(1).join(' - ').trim();
            return {
                branchName: `PUERTO PEÑALISA - ${branch.toUpperCase()}`,
                parentName: 'Corp. Club Puerto Peñalisa'
            };
        }
        return {
            branchName: 'PUERTO PEÑALISA',
            parentName: 'Corp. Club Puerto Peñalisa'
        };
    }

    // 5. Club del Comercio
    if (company.toUpperCase().includes('CLUB DEL COMERCIO')) {
        if (shipping.toUpperCase().includes('SUBA') || shipping.toUpperCase().includes('150')) {
            return {
                branchName: 'CLUB DEL COMERCIO - SUBA',
                parentName: 'Club del Comercio'
            };
        }
        if (shipping.toUpperCase().includes('CL 62') || shipping.toUpperCase().includes('SEDE')) {
            return {
                branchName: 'CLUB DEL COMERCIO - SEDE PRINCIPAL',
                parentName: 'Club del Comercio'
            };
        }
        return {
            branchName: 'CLUB DEL COMERCIO',
            parentName: 'Club del Comercio'
        };
    }

    // 6. CESNE
    if (company.toUpperCase().includes('CESNE') || company.toUpperCase().includes('SUBOFICIALES')) {
        if (shipping.toUpperCase().includes('PONTEVEDRA') || shipping.toUpperCase().includes('80')) {
            return {
                branchName: 'CESNE - PONTEVEDRA',
                parentName: 'Policía Nacional'
            };
        }
        if (shipping.toUpperCase().includes('63')) {
            return {
                branchName: 'CESNE - CALLE 63',
                parentName: 'Policía Nacional'
            };
        }
        return {
            branchName: 'CESNE - POLICÍA NACIONAL',
            parentName: 'Centro Social de Suboficiales'
        };
    }

    // 7. General con guión: "MATRIZ - SUCURSAL"
    if (company.includes('-')) {
        const parts = company.split('-').map(s => s.trim());
        const main = parts[0].replace(/\s+S\.?A\.?S\.?/gi, '').trim();
        const branch = parts.slice(1).join(' - ').trim();
        return {
            branchName: branch.toUpperCase(),
            parentName: main.toUpperCase()
        };
    }

    const fallback = company || contact || customer || 'CLIENTE';
    return {
        branchName: fallback.toUpperCase().replace(/\s+S\.?A\.?S\.?/gi, ' SAS'),
        parentName: ''
    };
}

/**
 * Normaliza cantidades y unidades para evitar concatenaciones ambiguas como "241000 G"
 * Convierte "1000 G" o "1000 gr" a "KG", y añade espacios si la unidad comienza con dígito.
 */
function formatQuantityAndUnit(quantity: number, rawUnit?: string): string {
    const cleanUnit = (rawUnit || 'KG').trim().toUpperCase();

    // 1000 gramos es exactamente 1 Kilogramo
    if (/^1000\s*(G|GR|GRAMOS)$/i.test(cleanUnit)) {
        const qtyStr = quantity % 1 === 0 ? quantity.toString() : quantity.toLocaleString('es-CO');
        return `${qtyStr}KG`;
    }

    // 500 gramos es 1 Libra
    if (/^500\s*(G|GR|GRAMOS)$/i.test(cleanUnit)) {
        const qtyStr = quantity % 1 === 0 ? quantity.toString() : quantity.toLocaleString('es-CO');
        return `${qtyStr}LB`;
    }

    const qtyStr = quantity % 1 === 0 ? quantity.toString() : quantity.toLocaleString('es-CO');

    // Si la unidad empieza con dígito (ej: "250 GR", "7000 GR"), separar con espacio legible
    if (/^\d/.test(cleanUnit)) {
        return `${qtyStr} (${cleanUnit})`;
    }

    return `${qtyStr}${cleanUnit}`;
}

export default function AlistamientoSabanaPrintPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const paramDate = searchParams.get('date');
    const paramOrderIds = searchParams.get('orderIds');

    const getTomorrowDateStr = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().split('T')[0];
    };

    const [selectedDate, setSelectedDate] = useState<string>(() => {
        if (paramDate) return paramDate;
        return getTomorrowDateStr();
    });

    const [selectedCellFilter, setSelectedCellFilter] = useState<string>('ALL');
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [generationTime, setGenerationTime] = useState<string>('');
    const printDocRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const now = new Date();
        setGenerationTime(now.toLocaleString('es-CO', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: true
        }));
    }, []);

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
                    id, sequence_id, delivery_date, delivery_slot, shipping_address, warehouse_spaces, status, profile_id, type,
                    profiles:profile_id(id, company_name, contact_name, address, role),
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
                const { branchName, parentName } = extractBranchAndClient(o);

                const isB2B = (o.type?.toLowerCase().includes('b2b') ?? false) || 
                              o.profiles?.role === 'b2b_client' || 
                              o.profiles?.role === 'b2b';
                const clientType: 'I' | 'H' = isB2B ? 'I' : 'H';

                const spaceLabel = (o.warehouse_spaces && o.warehouse_spaces.length > 0)
                    ? formatSpaceLabel(o.warehouse_spaces)
                    : (o.sequence_id ? `${o.sequence_id}` : `${idx + 1}`);

                const firstSpace = (o.warehouse_spaces && o.warehouse_spaces.length > 0)
                    ? o.warehouse_spaces[0]
                    : (o.sequence_id ?? 999);

                const orderNum = getFriendlyOrderId(o);

                parsedOrders.push({
                    id: o.id,
                    sequence_id: o.sequence_id,
                    delivery_date: o.delivery_date,
                    delivery_slot: o.delivery_slot,
                    shipping_address: o.shipping_address,
                    warehouse_spaces: o.warehouse_spaces,
                    client_name: parentName,
                    branch_name: branchName,
                    client_type: clientType,
                    order_num: orderNum,
                    space_label: spaceLabel,
                    first_space: firstSpace
                });

                (o.order_items || []).forEach((it: any) => {
                    parsedItems.push({
                        id: it.id,
                        order_id: o.id,
                        product_id: it.product_id || it.products?.id,
                        quantity: Number(it.quantity) || 0,
                        unit: (it.unit || it.products?.unit_of_measure || 'KG').toUpperCase(),
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

            // Ordenar pedidos por número de bahía física en suelo
            parsedOrders.sort((a, b) => a.first_space - b.first_space);

            setOrders(parsedOrders);
            setItems(parsedItems);

        } catch (err) {
            console.error('Error cargando alistamiento:', err);
        } finally {
            setLoading(false);
        }
    };

    // Agrupamiento por Célula (buying_team)
    const cellGroups = useMemo(() => {
        const groups: Record<string, {
            cellName: string;
            productsMap: Map<string, ProductInCell>;
            activeOrders: OrderInfo[];
        }> = {};

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
            const pName = it.product?.name || it.nickname || 'Producto';
            const sku = it.product?.sku ? `IN(${it.product.sku}) ` : '';
            const displayName = `${sku}${pName}`;
            const unit = (it.unit || it.product?.unit_of_measure || 'KG').toUpperCase();
            const note = (it.variant_label || it.nickname || '').trim();

            if (!groups[cell].productsMap.has(pId)) {
                groups[cell].productsMap.set(pId, {
                    id: pId,
                    name: pName,
                    sku: it.product?.sku || '',
                    unit,
                    displayName,
                    totalQty: 0,
                    orderDemand: {}
                });
            }

            const prodRec = groups[cell].productsMap.get(pId)!;
            prodRec.totalQty += it.quantity;

            if (!prodRec.orderDemand[it.order_id]) {
                prodRec.orderDemand[it.order_id] = { quantity: it.quantity, unit, note };
            } else {
                prodRec.orderDemand[it.order_id].quantity += it.quantity;
                if (note && !prodRec.orderDemand[it.order_id].note?.includes(note)) {
                    prodRec.orderDemand[it.order_id].note = `${prodRec.orderDemand[it.order_id].note || ''} ${note}`.trim();
                }
            }
        });

        // Guardar pedidos activos globales para la célula
        Object.keys(groups).forEach(cell => {
            const prodMap = groups[cell].productsMap;
            const relevantOrderIds = new Set<string>();
            prodMap.forEach(prod => {
                Object.keys(prod.orderDemand).forEach(oId => {
                    if (prod.orderDemand[oId].quantity > 0) {
                        relevantOrderIds.add(oId);
                    }
                });
            });
            groups[cell].activeOrders = orders.filter(o => relevantOrderIds.has(o.id));
        });

        return groups;
    }, [items, orders]);

    const availableCellNames = useMemo(() => {
        return Object.keys(cellGroups).sort();
    }, [cellGroups]);

    const filteredCellNames = useMemo(() => {
        if (selectedCellFilter === 'ALL') {
            return availableCellNames;
        }
        return availableCellNames.filter(c => c === selectedCellFilter);
    }, [availableCellNames, selectedCellFilter]);

    // Formatear fecha para el encabezado
    const formatDisplayDate = (dStr: string) => {
        try {
            const [y, m, d] = dStr.split('-');
            return `${d}/${m}/${y}`;
        } catch {
            return dStr;
        }
    };

    // Estructurar la lista global de hojas (Sheets) para el conteo de páginas total
    // FILTRANDO CERO FILAS VACÍAS: Cada hoja contiene ÚNICAMENTE los clientes con demanda > 0 en los productos de esa hoja
    const printableSheets = useMemo(() => {
        const sheets: Array<{
            cellName: string;
            chunkIdx: number;
            totalChunksForCell: number;
            chunkProducts: ProductInCell[];
            activeOrdersInCell: OrderInfo[];
        }> = [];

        filteredCellNames.forEach(cellName => {
            const cellData = cellGroups[cellName];
            if (!cellData) return;

            const productsList = Array.from(cellData.productsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            const allActiveOrders = cellData.activeOrders;

            // En Oficio Landscape caben 6 productos con ancho holgado (o 7 si la célula tiene exactamente 7)
            const chunkSize = productsList.length === 7 ? 7 : 6;
            const totalChunks = Math.ceil(productsList.length / chunkSize) || 1;

            for (let i = 0; i < totalChunks; i++) {
                const chunkProducts = productsList.slice(i * chunkSize, (i + 1) * chunkSize);

                // FILTRO POKA-YOKE: Eliminar completamente las filas vacías
                // Solo incluir clientes que tengan pedido > 0 en alguno de los productos de ESTA hoja
                const chunkActiveOrders = allActiveOrders.filter(ord => {
                    return chunkProducts.some(prod => (prod.orderDemand[ord.id]?.quantity || 0) > 0);
                });

                // Si la hoja tiene pedidos reales, añadirla a la impresión
                if (chunkActiveOrders.length > 0) {
                    sheets.push({
                        cellName,
                        chunkIdx: i,
                        totalChunksForCell: totalChunks,
                        chunkProducts,
                        activeOrdersInCell: chunkActiveOrders
                    });
                }
            }
        });

        return sheets;
    }, [filteredCellNames, cellGroups]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles />

            {/* Estilos Oficiales Tamaño Oficio (Legal Landscape) y Optimización B&W */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: legal landscape !important;
                        margin: 0.8cm 1.0cm !important;
                    }
                    html, body {
                        background-color: #FFFFFF !important;
                        color: #000000 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                    .print-sheet {
                        page-break-after: always !important;
                        break-after: page !important;
                        border: none !important;
                        box-shadow: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                    }
                    table {
                        page-break-inside: auto !important;
                    }
                    tr {
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                    }
                    thead {
                        display: table-header-group !important;
                    }
                    tfoot {
                        display: table-row-group !important;
                    }
                }
            `}</style>

            {/* Barra de Control Superior (No Imprimible) */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backgroundColor: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: '0.85rem 1.5rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
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
                            fontWeight: '700',
                            color: '#334155'
                        }}
                    >
                        <ArrowLeft size={16} /> Volver
                    </button>

                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '900', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Layers size={20} color="#0D7A57" />
                            Sábana Maestra de Alistamiento &bull; Tamaño Oficio (Legal)
                        </h1>
                        <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                            {orders.length} pedidos &bull; Matriz ALISTAMIENTO.pdf (Sucursal prominente &bull; Sin filas vacías &bull; B&W)
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Selector de Fecha */}
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

                    {/* Filtro de Célula */}
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

                    {/* Botón de Impresión en Oficio */}
                    <button
                        onClick={() => {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: `Sábana de Alistamiento (Oficio) - ${selectedDate}`,
                                paperSize: 'legal',
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
                        <Printer size={16} /> Imprimir Sábana Oficio ({printableSheets.length} Pág.)
                    </button>
                </div>
            </div>

            {/* Contenedor del Documento (Proporción Oficio Landscape: 14in x 8.5in) */}
            <div ref={printDocRef} style={{ maxWidth: '1350px', margin: '1.5rem auto', padding: '0 1rem' }}>
                {loading ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#64748B' }}>
                        <p style={{ fontWeight: '700' }}>Cargando matriz de alistamiento nocturno...</p>
                    </div>
                ) : printableSheets.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', backgroundColor: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <p style={{ fontSize: '1rem', fontWeight: '800', color: '#0F172A' }}>No se encontraron órdenes ni productos para esta fecha.</p>
                        <p style={{ fontSize: '0.82rem', color: '#64748B' }}>Selecciona otra fecha en el panel superior o verifica que los pedidos estén confirmados.</p>
                    </div>
                ) : (
                    printableSheets.map((sheet, sheetGlobalIdx) => {
                        const { cellName, chunkIdx, totalChunksForCell, chunkProducts, activeOrdersInCell } = sheet;

                        return (
                            <div
                                key={`${cellName}-sheet-${chunkIdx}`}
                                className="print-sheet page-break"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    padding: '16px 20px',
                                    marginBottom: '28px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
                                }}
                            >
                                {/* Encabezado Institucional de la Hoja (Idéntico a ALISTAMIENTO.pdf) */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                    {/* Logo a la izquierda */}
                                    <div style={{ width: '130px', display: 'flex', alignItems: 'center' }}>
                                        <img
                                            src="/logo.png"
                                            alt="FruFresco"
                                            style={{ height: '42px', width: 'auto', objectFit: 'contain' }}
                                        />
                                    </div>

                                    {/* Título Central */}
                                    <div style={{ textAlign: 'center', flex: 1 }}>
                                        <div style={{ fontSize: '13.5pt', fontWeight: 900, color: '#0D7A57', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                            INVESTMENTS CORTES SAS
                                        </div>
                                        <div style={{ fontSize: '6.8pt', color: '#475569', fontWeight: 600, marginTop: '1px' }}>
                                            GENERADO EL: {generationTime}
                                        </div>
                                        <div style={{ fontSize: '10.5pt', fontWeight: 900, color: '#0D7A57', marginTop: '2px', textTransform: 'uppercase' }}>
                                            FECHA {formatDisplayDate(selectedDate)} - {cellName}. Página: {chunkIdx + 1} de {totalChunksForCell}
                                        </div>
                                    </div>

                                    {/* Tag de formato a la derecha */}
                                    <div style={{ width: '130px', textAlign: 'right' }}>
                                        <span style={{ fontSize: '6.5pt', fontWeight: 800, border: '1px solid #CBD5E1', padding: '2px 6px', borderRadius: '4px', color: '#64748B', textTransform: 'uppercase' }}>
                                            FORMATO OFICIO
                                        </span>
                                    </div>
                                </div>

                                {/* Tabla Matriz (Filas = Clientes/Bahías, Columnas = Productos) */}
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '7.2pt',
                                    border: '1.5px solid #000000',
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000'
                                }}>
                                    <thead>
                                        {/* Fila 1: Encabezados de Columna (Fondo claro / Texto negro) */}
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1.5px solid #000000' }}>
                                            <th style={{ width: '60px', padding: '5px 3px', textAlign: 'center', fontWeight: 900, border: '1px solid #000000', color: '#000000', fontSize: '7.5pt' }}>
                                                LUGAR
                                            </th>
                                            <th style={{ width: '230px', padding: '5px 6px', textAlign: 'left', fontWeight: 900, border: '1px solid #000000', color: '#000000', fontSize: '7.5pt' }}>
                                                SUCURSAL / CLIENTE ({activeOrdersInCell.length})
                                            </th>
                                            <th style={{ width: '38px', padding: '5px 2px', textAlign: 'center', fontWeight: 900, border: '1px solid #000000', color: '#000000', fontSize: '7.5pt' }}>
                                                TIPO
                                            </th>
                                            {chunkProducts.map((prod) => (
                                                <th
                                                    key={prod.id}
                                                    style={{
                                                        padding: '5px 4px',
                                                        textAlign: 'center',
                                                        fontWeight: 800,
                                                        border: '1px solid #000000',
                                                        color: '#000000',
                                                        fontSize: '7.2pt',
                                                        lineHeight: '1.2'
                                                    }}
                                                >
                                                    {prod.displayName}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {activeOrdersInCell.map((ord, oIdx) => {
                                            const rowBg = oIdx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';

                                            return (
                                                <tr key={ord.id} style={{ backgroundColor: rowBg }}>
                                                    {/* Bahía / Lugar en suelo */}
                                                    <td style={{ textAlign: 'center', padding: '3.5px 2px', border: '1px solid #CBD5E1', fontWeight: 900, fontSize: '7.6pt', color: '#000000' }}>
                                                        {ord.space_label}
                                                    </td>

                                                    {/* Sucursal y Nombre del Cliente */}
                                                    <td style={{ textAlign: 'left', padding: '3.5px 6px', border: '1px solid #CBD5E1', color: '#000000', maxWidth: '230px' }} title={`${ord.branch_name} ${ord.client_name ? `(${ord.client_name})` : ''}`}>
                                                        <div style={{ fontWeight: 800, fontSize: '7.3pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#000000' }}>
                                                            {ord.branch_name}
                                                        </div>
                                                        {ord.client_name && ord.client_name !== ord.branch_name && (
                                                            <div style={{ fontSize: '5.8pt', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {ord.client_name}
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Tipo (I = Institucional, H = Hogar) */}
                                                    <td style={{ textAlign: 'center', padding: '3.5px 2px', border: '1px solid #CBD5E1', fontWeight: 800, fontSize: '7.5pt', color: '#000000' }}>
                                                        {ord.client_type}
                                                    </td>

                                                    {/* Columnas de Productos */}
                                                    {chunkProducts.map((prod) => {
                                                        const demand = prod.orderDemand[ord.id];
                                                        if (demand && demand.quantity > 0) {
                                                            const formattedQty = formatQuantityAndUnit(demand.quantity, demand.unit);

                                                            return (
                                                                <td
                                                                    key={prod.id}
                                                                    style={{
                                                                        textAlign: 'center',
                                                                        padding: '3px 2px',
                                                                        border: '1px solid #CBD5E1',
                                                                        color: '#000000'
                                                                    }}
                                                                >
                                                                    <div style={{ fontWeight: 900, fontSize: '7.8pt' }}>
                                                                        {formattedQty}
                                                                    </div>
                                                                    {demand.note && (
                                                                        <div style={{ fontSize: '5.8pt', color: '#334155', lineHeight: '1.1', marginTop: '1px' }}>
                                                                            {demand.note}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td
                                                                key={prod.id}
                                                                style={{
                                                                    border: '1px solid #E2E8F0',
                                                                    padding: '3px 2px',
                                                                    textAlign: 'center'
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* Fila de Totales por Producto */}
                                    <tfoot>
                                        <tr style={{ backgroundColor: '#F1F5F9', borderTop: '1.5px solid #000000', fontWeight: 900 }}>
                                            <td colSpan={3} style={{ textAlign: 'center', padding: '5px 6px', border: '1px solid #000000', fontSize: '7.5pt', color: '#000000', letterSpacing: '0.04em' }}>
                                                PRODUCTOS ({chunkProducts.length})
                                            </td>
                                            {chunkProducts.map((prod) => {
                                                const colSum = activeOrdersInCell.reduce((sum, ord) => sum + (prod.orderDemand[ord.id]?.quantity || 0), 0);
                                                const sumStr = colSum > 0 ? formatQuantityAndUnit(colSum, prod.unit) : '-';

                                                return (
                                                    <td
                                                        key={prod.id}
                                                        style={{
                                                            textAlign: 'center',
                                                            padding: '5px 2px',
                                                            border: '1px solid #000000',
                                                            fontSize: '7.5pt',
                                                            color: '#000000',
                                                            fontWeight: 900
                                                        }}
                                                    >
                                                        {sumStr}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tfoot>
                                </table>

                                {/* Pie de Página con Numeración */}
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', marginTop: '8px', fontSize: '7pt', color: '#475569', fontWeight: '600' }}>
                                    Pág. {sheetGlobalIdx + 1} / {printableSheets.length}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
