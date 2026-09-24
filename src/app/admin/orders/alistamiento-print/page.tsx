'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId, formatStructuredSpecification } from '@/lib/orderUtils';
import { formatSpaceLabel } from '@/lib/stagingSpaceAllocator';
import { Printer, ArrowLeft, Filter, Calendar, Layers, CheckSquare, Download, Columns } from 'lucide-react';
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
    selected_options?: Record<string, any> | null;
    product?: {
        id: string;
        name: string;
        sku?: string;
        accounting_id?: number | string | null;
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
    accountingId?: number | string | null;
    unit: string;
    displayName: string;
    totalKg: number;
    inventoryKg: number | null;
    orderDemand: Record<string, { kgQuantity: number; displayQty: string; unit: string; note?: string }>;
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
 * Normaliza cualquier cantidad y unidad estrictamente a KILOGRAMOS (KG).
 * - Libras (1 lb = 0.5 kg) -> 4 lb = 2KG, 3 lb = 1.5KG
 * - Gramos (1000g = 1 kg, 500g = 0.5 kg, 250g = 0.25 kg)
 * - Mantiene unidades discretas (UN, CJ, DOC) intactas.
 */
function normalizeToKg(quantity: number, rawUnit?: string, productUom?: string): { kgQty: number; displayQty: string; unitStr: string; subNote?: string } {
    const cleanUnit = (rawUnit || productUom || 'KG').trim().toLowerCase();

    // 1. Libras (1 lb = 0.5 kg)
    if (cleanUnit.includes('libra') || cleanUnit === 'lb' || cleanUnit === 'lbs') {
        const kg = quantity * 0.5;
        return {
            kgQty: kg,
            displayQty: kg % 1 === 0 ? kg.toString() : Number(kg.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'KG',
            subNote: `${quantity} lb`
        };
    }

    // 2. 1000 Gramos (1000 G = 1 kg)
    if (/^1000\s*(g|gr|gramos)$/i.test(cleanUnit)) {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'KG'
        };
    }

    // 3. 500 Gramos / Paquete 500 gramos (500 G = 0.5 kg)
    if (/500\s*(g|gr|gramos)/i.test(cleanUnit)) {
        const kg = quantity * 0.5;
        return {
            kgQty: kg,
            displayQty: kg % 1 === 0 ? kg.toString() : Number(kg.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'KG'
        };
    }

    // 4. 250 Gramos (250 G = 0.25 kg)
    if (/250\s*(g|gr|gramos)/i.test(cleanUnit)) {
        const kg = quantity * 0.25;
        return {
            kgQty: kg,
            displayQty: kg % 1 === 0 ? kg.toString() : Number(kg.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'KG'
        };
    }

    // 5. Gramos genéricos (ej. "200 g")
    if (/^(\d+)\s*(g|gr|gramos)$/i.test(cleanUnit)) {
        const match = cleanUnit.match(/^(\d+)\s*(g|gr|gramos)$/i);
        const grams = parseFloat(match![1]);
        const kg = (quantity * grams) / 1000;
        return {
            kgQty: kg,
            displayQty: kg % 1 === 0 ? kg.toString() : Number(kg.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'KG'
        };
    }

    // 6. Unidades discretas (Unidad, Caja, Docena)
    if (cleanUnit.includes('unidad') || cleanUnit === 'un' || cleanUnit === 'und') {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'UN'
        };
    }
    if (cleanUnit.includes('caja')) {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'CJ'
        };
    }
    if (cleanUnit.includes('docena')) {
        return {
            kgQty: quantity,
            displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
            unitStr: 'DOC'
        };
    }

    // 7. Por defecto: Kilos
    return {
        kgQty: quantity,
        displayQty: quantity % 1 === 0 ? quantity.toString() : Number(quantity.toFixed(2)).toLocaleString('es-CO'),
        unitStr: 'KG'
    };
}

/**
 * Filtro Poka-Yoke de Notas:
 * Elimina basura de importación técnica de empaques (ej: "1000 gr 1000 gr", "kg kg", "50 und 50 und")
 * y suprime el "efecto espejo" (repetir el nombre del producto en la nota de su propia columna).
 * Conserva únicamente especificaciones operativas/culinarias reales (maduro, biche, pintón, tajadas, etc.)
 */
function filterMeaningfulNote(rawNote?: string, productName?: string): string {
    if (!rawNote) return '';
    const trimmed = rawNote.trim();

    // 1. Eliminar cadenas técnicas de empaque repetidas
    if (/^(\d+\s*(g|gr|kg|und|lb)\s*)+$/i.test(trimmed)) return '';
    if (/^(kg\s*)+$/i.test(trimmed)) return '';
    if (/^(x\s*kg\s*)+$/i.test(trimmed)) return '';
    if (/^(bca\s*x\s*kg\s*)+$/i.test(trimmed)) return '';
    if (/^(\d+\s*und\s*)+$/i.test(trimmed)) return '';
    if (/1000\s*gr\s*1000\s*gr/i.test(trimmed)) return '';

    // 2. Desduplicar palabras consecutivas
    const clean = trimmed.replace(/\b(\w+)\s+\1\b/gi, '$1').trim();

    // 3. Suprimir si la nota es idéntica o está contenida en el nombre del producto
    const pNorm = (productName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const nNorm = clean.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (pNorm === nNorm || (pNorm.length > 3 && pNorm.includes(nNorm))) {
        return '';
    }

    return clean;
}

/**
 * Normaliza la sucursal y el cliente para visualización inmediata en piso de bodega.
 * Elimina duplicidades de nombres y destaca la sede operativa sin confusiones.
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
                parentName: ''
            };
        }
        if (shipping.toUpperCase().includes('GIRARDOT') || shipping.toUpperCase().includes('RICAURTE')) {
            return {
                branchName: 'COLSUBSIDIO - RICAURTE / GIRARDOT',
                parentName: ''
            };
        }
        if (contact && !contact.toUpperCase().includes('COLSUBSIDIO')) {
            return {
                branchName: `COLSUBSIDIO - ${contact.toUpperCase()}`,
                parentName: ''
            };
        }
        return {
            branchName: 'COLSUBSIDIO',
            parentName: ''
        };
    }

    // 2. Puerto Peñalisa: SIEMPRE limpio como PUERTO PEÑALISA (o Fundación si aplica)
    if (company.toUpperCase().includes('PENALISA') || company.toUpperCase().includes('PEÑALISA')) {
        if (company.toUpperCase().includes('FUNDACION') || company.toUpperCase().includes('FUNDACIÓN')) {
            return {
                branchName: 'PUERTO PEÑALISA (FUNDACIÓN)',
                parentName: ''
            };
        }
        if (company.toUpperCase().includes('MONJE')) {
            return {
                branchName: 'PUERTO PEÑALISA (MONJE)',
                parentName: ''
            };
        }
        if (company.toUpperCase().includes('SEDE')) {
            return {
                branchName: 'PUERTO PEÑALISA (SEDE)',
                parentName: ''
            };
        }
        return {
            branchName: 'PUERTO PEÑALISA',
            parentName: ''
        };
    }

    // 3. Aldimark: Eliminar doble "ALDIMARK"
    if (company.toUpperCase().includes('ALDIMARK')) {
        if (company.includes('-')) {
            const parts = company.split('-').slice(1).join(' - ').trim();
            const cleanBranch = parts.replace(/^ALDIMARK[- ]*/i, '').trim();
            return {
                branchName: `ALDIMARK - ${cleanBranch.toUpperCase()}`,
                parentName: ''
            };
        }
        if (contact && !contact.toUpperCase().includes('ALDIMARK') && !contact.toUpperCase().includes('BOBADILLA')) {
            return {
                branchName: `ALDIMARK - ${contact.toUpperCase()}`,
                parentName: ''
            };
        }
        return {
            branchName: 'ALDIMARK',
            parentName: ''
        };
    }

    // 4. Yanuba
    if (company.toUpperCase().includes('YANUBA') || company.toUpperCase().includes('MILSEN')) {
        if (company.toUpperCase().includes('150') || company.toUpperCase().includes('CEDRITOS')) {
            return {
                branchName: 'YANUBA - 150 CEDRITOS',
                parentName: ''
            };
        }
        if (company.toUpperCase().includes('122') || company.toUpperCase().includes('SANTA')) {
            return {
                branchName: 'YANUBA - 122 SANTA BÁRBARA',
                parentName: ''
            };
        }
        return {
            branchName: 'YANUBA',
            parentName: ''
        };
    }

    // 5. Club del Comercio
    if (company.toUpperCase().includes('CLUB DEL COMERCIO')) {
        if (company.includes('-')) {
            const branch = company.split('-').slice(1).join(' - ').trim().replace(/^CLUB DEL COMERCIO DE BOGOT[AÁ][- ]*/i, '');
            return {
                branchName: branch ? `CLUB DEL COMERCIO - ${branch.toUpperCase()}` : 'CLUB DEL COMERCIO',
                parentName: ''
            };
        }
        return {
            branchName: 'CLUB DEL COMERCIO',
            parentName: ''
        };
    }

    // 6. CESNE
    if (company.toUpperCase().includes('CESNE') || company.toUpperCase().includes('SUBOFICIALES')) {
        if (shipping.toUpperCase().includes('PONTEVEDRA') || shipping.toUpperCase().includes('80')) {
            return {
                branchName: 'CESNE - PONTEVEDRA',
                parentName: ''
            };
        }
        if (shipping.toUpperCase().includes('63')) {
            return {
                branchName: 'CESNE - CALLE 63',
                parentName: ''
            };
        }
        return {
            branchName: 'CESNE',
            parentName: ''
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
    const [maxColsPerPage, setMaxColsPerPage] = useState<number>(10);
    const [orders, setOrders] = useState<OrderInfo[]>([]);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [generationTime, setGenerationTime] = useState<string>('');
    const [inventoryMap, setInventoryMap] = useState<Record<string, number>>({});
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
                        id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options,
                        products(id, name, sku, accounting_id, unit_of_measure, buying_team, category)
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
                        selected_options: it.selected_options ?? null,
                        product: it.products ? {
                            id: it.products.id,
                            name: it.products.name,
                            sku: it.products.sku,
                            accounting_id: it.products.accounting_id,
                            unit_of_measure: it.products.unit_of_measure,
                            buying_team: it.products.buying_team,
                            category: it.products.category
                        } : undefined
                    });
                });
            });

            // Ordenar pedidos por número de bahía física en suelo
            parsedOrders.sort((a, b) => a.first_space - b.first_space);

            // Fetch existencias de inventario en paralelo
            const { data: stockRows } = await supabase
                .from('inventory_stocks')
                .select('product_id, quantity')
                .eq('status', 'available');

            const newInventoryMap: Record<string, number> = {};
            (stockRows || []).forEach((row: { product_id: string; quantity: number }) => {
                newInventoryMap[row.product_id] = (newInventoryMap[row.product_id] ?? 0) + row.quantity;
            });
            setInventoryMap(newInventoryMap);

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
            
            // displayName = solo nombre limpio; el prefijo INV[kg] se añade al renderizar el <th>
            const displayName = pName;
            
            // Normalizar a Kilogramos
            const norm = normalizeToKg(it.quantity, it.unit, it.product?.unit_of_measure);
            // Especificación Culinaria/Operativa Estructurada (e.g. "12 und de 2 kg; Maduro")
            // Si no está estructurada la característica tipo, DEBE APARECER VACÍO (cero ruido visual)
            const combinedNote = formatStructuredSpecification(it) || '';

            if (!groups[cell].productsMap.has(pId)) {
                groups[cell].productsMap.set(pId, {
                    id: pId,
                    name: pName,
                    accountingId: it.product?.accounting_id,
                    unit: norm.unitStr,
                    displayName,
                    totalKg: 0,
                    inventoryKg: inventoryMap[pId] ?? null,
                    orderDemand: {}
                });
            }

            const prodRec = groups[cell].productsMap.get(pId)!;
            prodRec.totalKg += norm.kgQty;

            if (!prodRec.orderDemand[it.order_id]) {
                prodRec.orderDemand[it.order_id] = {
                    kgQuantity: norm.kgQty,
                    displayQty: norm.displayQty,
                    unit: norm.unitStr,
                    note: combinedNote
                };
            } else {
                prodRec.orderDemand[it.order_id].kgQuantity += norm.kgQty;
                const totalKgOrder = prodRec.orderDemand[it.order_id].kgQuantity;
                prodRec.orderDemand[it.order_id].displayQty = totalKgOrder % 1 === 0 
                    ? totalKgOrder.toString() 
                    : Number(totalKgOrder.toFixed(2)).toLocaleString('es-CO');

                if (combinedNote && !prodRec.orderDemand[it.order_id].note?.includes(combinedNote)) {
                    prodRec.orderDemand[it.order_id].note = `${prodRec.orderDemand[it.order_id].note || ''} ${combinedNote}`.trim();
                }
            }
        });

        // Guardar pedidos activos globales para la célula
        Object.keys(groups).forEach(cell => {
            const prodMap = groups[cell].productsMap;
            const relevantOrderIds = new Set<string>();
            prodMap.forEach(prod => {
                Object.keys(prod.orderDemand).forEach(oId => {
                    if (prod.orderDemand[oId].kgQuantity > 0) {
                        relevantOrderIds.add(oId);
                    }
                });
            });
            groups[cell].activeOrders = orders.filter(o => relevantOrderIds.has(o.id));
        });

        return groups;
    }, [items, orders, inventoryMap]);

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
            sheetTotalKg: number;
        }> = [];

        filteredCellNames.forEach(cellName => {
            const cellData = cellGroups[cellName];
            if (!cellData) return;

            const productsList = Array.from(cellData.productsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
            const allActiveOrders = cellData.activeOrders;

            // Capacidad de columnas optimizada para Oficio Landscape (10 por defecto, configurable)
            const maxCols = maxColsPerPage;
            const totalChunks = Math.ceil(productsList.length / maxCols) || 1;
            // Reparto balanceado anti-huérfanas: si son 13 productos reparte como 7 y 6, no 10 y 3
            const productsPerChunk = Math.ceil(productsList.length / totalChunks);

            for (let i = 0; i < totalChunks; i++) {
                const startIdx = i * productsPerChunk;
                const endIdx = Math.min((i + 1) * productsPerChunk, productsList.length);
                const chunkProducts = productsList.slice(startIdx, endIdx);
                if (chunkProducts.length === 0) continue;

                // FILTRO POKA-YOKE: Eliminar completamente las filas vacías
                // Solo incluir clientes que tengan pedido > 0 en alguno de los productos de ESTA hoja
                const chunkActiveOrders = allActiveOrders.filter(ord => {
                    return chunkProducts.some(prod => (prod.orderDemand[ord.id]?.kgQuantity || 0) > 0);
                });

                // Calcular Gran Total de Kilos de la Hoja
                let sheetTotalKg = 0;
                chunkProducts.forEach(prod => {
                    chunkActiveOrders.forEach(ord => {
                        sheetTotalKg += (prod.orderDemand[ord.id]?.kgQuantity || 0);
                    });
                });

                // Si la hoja tiene pedidos reales, añadirla a la impresión
                if (chunkActiveOrders.length > 0) {
                    sheets.push({
                        cellName,
                        chunkIdx: i,
                        totalChunksForCell: totalChunks,
                        chunkProducts,
                        activeOrdersInCell: chunkActiveOrders,
                        sheetTotalKg: Number(sheetTotalKg.toFixed(1))
                    });
                }
            }
        });

        return sheets;
    }, [filteredCellNames, cellGroups, maxColsPerPage]);

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#F1F5F9', paddingBottom: '3rem' }}>
            <GoldenPrintStyles />

            {/* Estilos Oficiales Tamaño Oficio (Legal Landscape) y Optimización B&W Industrial */}
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

            {/* Barra de Control Superior (No Imprimible) - 100% Sticky */}
            <div className="no-print" style={{
                position: 'sticky',
                top: 0,
                zIndex: 9999,
                backgroundColor: '#FFFFFF',
                borderBottom: '1.5px solid #CBD5E1',
                padding: '0.85rem 1.5rem',
                boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
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
                            {orders.length} pedidos &bull; Matriz Industrial (ID Contable &bull; Normalizado KG &bull; Control Poka-Yoke)
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

                    {/* Selector de Densidad de Columnas (Optimización de Hojas) */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '8px', padding: '4px 10px' }} title="Ajusta cuántas columnas de producto caben por hoja para optimizar el gasto de papel">
                        <Columns size={14} color="#0D7A57" />
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>Columnas:</span>
                        <select
                            value={maxColsPerPage}
                            onChange={(e) => setMaxColsPerPage(Number(e.target.value))}
                            style={{ border: 'none', background: 'transparent', fontSize: '0.8rem', fontWeight: '800', color: '#0D7A57', outline: 'none', cursor: 'pointer' }}
                        >
                            <option value={8}>8 cols (Expandido)</option>
                            <option value={10}>10 cols (Estándar)</option>
                            <option value={12}>12 cols (Compacto)</option>
                        </select>
                    </div>

                    {/* Botón Descargar PDF Oficio */}
                    <button
                        onClick={() => {
                            printViaNewWindow({
                                element: printDocRef.current,
                                title: `Sabana_Alistamiento_Oficio_${selectedDate}`,
                                paperSize: 'legal',
                                orientation: 'landscape',
                                margin: '0.8cm 1.0cm'
                            });
                        }}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 18px',
                            backgroundColor: '#FFFFFF',
                            color: '#0369A1',
                            border: '1.5px solid #0284C7',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: '800',
                            boxShadow: '0 2px 8px rgba(2, 132, 199, 0.15)'
                        }}
                        title="Abre la vista limpia oficial para guardar como archivo PDF en formato Oficio"
                    >
                        <Download size={16} /> Descargar PDF
                    </button>

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
                        const { cellName, chunkIdx, totalChunksForCell, chunkProducts, activeOrdersInCell, sheetTotalKg } = sheet;

                        return (
                            <div
                                key={`${cellName}-sheet-${chunkIdx}`}
                                className="print-sheet page-break"
                                style={{
                                    backgroundColor: '#FFFFFF',
                                    padding: '12px 14px',
                                    marginBottom: '20px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.05)'
                                }}
                            >
                                {/* Encabezado Institucional de la Hoja (Compactado para ahorrar espacio vertical) */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                                    {/* Logo a la izquierda */}
                                    <div style={{ width: '110px', display: 'flex', alignItems: 'center' }}>
                                        <img
                                            src="/logo.png"
                                            alt="FruFresco"
                                            style={{ height: '34px', width: 'auto', objectFit: 'contain' }}
                                        />
                                    </div>

                                    {/* Título Central */}
                                    <div style={{ textAlign: 'center', flex: 1 }}>
                                        <div style={{ fontSize: '11.5pt', fontWeight: 900, color: '#0D7A57', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                            INVESTMENTS CORTES SAS
                                        </div>
                                        <div style={{ fontSize: '6.5pt', color: '#475569', fontWeight: 600, marginTop: '1px' }}>
                                            GENERADO EL: {generationTime}
                                        </div>
                                        <div style={{ fontSize: '9.2pt', fontWeight: 900, color: '#0D7A57', marginTop: '1px', textTransform: 'uppercase' }}>
                                            FECHA {formatDisplayDate(selectedDate)} - {cellName}. Página: {chunkIdx + 1} de {totalChunksForCell}
                                        </div>
                                    </div>

                                    {/* Tag de formato y control a la derecha */}
                                    <div style={{ width: '110px', textAlign: 'right' }}>
                                        <span style={{ fontSize: '6pt', fontWeight: 800, border: '1px solid #CBD5E1', padding: '2px 5px', borderRadius: '4px', color: '#64748B', textTransform: 'uppercase' }}>
                                            FORMATO OFICIO
                                        </span>
                                    </div>
                                </div>

                                {/* Tabla Matriz Industrial (Filas = Clientes/Bahías, Columnas = Productos) */}
                                <table style={{
                                    width: '100%',
                                    borderCollapse: 'collapse',
                                    fontSize: '7pt',
                                    border: '1.5px solid #000000',
                                    backgroundColor: '#FFFFFF',
                                    color: '#000000'
                                }}>
                                    <thead>
                                        {/* Fila 1: Encabezados de Columna con ACCOUNTING ID Destacado */}
                                        <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1.5px solid #000000' }}>
                                            <th style={{ width: '38px', padding: '4px 2px', textAlign: 'center', fontWeight: 900, border: '1px solid #000000', color: '#000000', fontSize: '7.2pt' }}>
                                                LUGAR
                                            </th>
                                            <th style={{ width: '180px', padding: '4px 6px', textAlign: 'left', fontWeight: 900, border: '1px solid #000000', color: '#000000', fontSize: '7.2pt' }}>
                                                SUCURSAL / CLIENTE ({activeOrdersInCell.length})
                                            </th>
                                            <th style={{ width: '24px', padding: '4px 1px', textAlign: 'center', fontWeight: 900, border: '1px solid #000000', color: '#000000', fontSize: '7.2pt' }}>
                                                TIPO
                                            </th>
                                            {chunkProducts.map((prod) => {
                                                // null = sin registro en inventory_stocks → tratar como 0
                                                const invKg = prod.inventoryKg ?? 0;
                                                const invStr = invKg % 1 === 0 ? String(invKg) : invKg.toFixed(1);
                                                const invColor = invKg === 0 ? '#B91C1C' : '#15803D';
                                                return (
                                                    <th
                                                        key={prod.id}
                                                        style={{
                                                            padding: '3px 2px',
                                                            textAlign: 'center',
                                                            fontWeight: 800,
                                                            border: '1px solid #000000',
                                                            color: '#000000',
                                                            fontSize: '6.8pt',
                                                            lineHeight: '1.2'
                                                        }}
                                                    >
                                                        <span style={{ color: invColor, fontWeight: 900 }}>INV[{invStr}]</span>
                                                        {' '}{prod.displayName}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                    </thead>

                                    <tbody>
                                        {activeOrdersInCell.map((ord, oIdx) => {
                                            const rowBg = oIdx % 2 === 0 ? '#FFFFFF' : '#F9FAFB';

                                            return (
                                                <tr key={ord.id} style={{ backgroundColor: rowBg, minHeight: '25px' }}>
                                                    {/* Bahía / Lugar en suelo (Numeración clara y centrada) */}
                                                    <td style={{ textAlign: 'center', padding: '2.5px 1px', border: '1px solid #94A3B8', fontWeight: 900, fontSize: '8pt', color: '#000000' }}>
                                                        {ord.space_label}
                                                    </td>

                                                    {/* Sucursal del Cliente (Estricto: solo nombre de sucursal) */}
                                                    <td style={{ textAlign: 'left', padding: '2.5px 6px', border: '1px solid #94A3B8', color: '#000000', maxWidth: '180px' }} title={ord.branch_name}>
                                                        <div style={{ fontWeight: 800, fontSize: '7.1pt', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#000000' }}>
                                                            {ord.branch_name}
                                                        </div>
                                                    </td>

                                                    {/* Tipo (I = Institucional, H = Hogar) */}
                                                    <td style={{ textAlign: 'center', padding: '2.5px 1px', border: '1px solid #94A3B8', fontWeight: 800, fontSize: '7.2pt', color: '#000000' }}>
                                                        {ord.client_type}
                                                    </td>

                                                    {/* Columnas de Productos (NORMALIZADO A KG + CASILLA CHECK LEAN) */}
                                                    {chunkProducts.map((prod) => {
                                                        const demand = prod.orderDemand[ord.id];
                                                        if (demand && demand.kgQuantity > 0) {
                                                            return (
                                                                <td
                                                                    key={prod.id}
                                                                    style={{
                                                                        textAlign: 'center',
                                                                        padding: '2px 2px',
                                                                        border: '1px solid #94A3B8',
                                                                        color: '#000000',
                                                                        position: 'relative'
                                                                    }}
                                                                >
                                                                    {/* Casilla de marcación física con bolígrafo para el alistador [ ] */}
                                                                    <div style={{ position: 'absolute', top: '1px', right: '2px', fontSize: '5.5pt', color: '#94A3B8', fontWeight: 400 }}>
                                                                        [  ]
                                                                    </div>

                                                                    {/* Cantidad Prominente en KG */}
                                                                    <div style={{ fontWeight: 900, fontSize: '7.8pt', marginTop: '1px' }}>
                                                                        {demand.displayQty}{demand.unit}
                                                                    </div>

                                                                    {/* Especificación Culinaria/Operativa Limpia */}
                                                                    {demand.note && (
                                                                        <div style={{ fontSize: '5.5pt', color: '#334155', lineHeight: '1.05', marginTop: '1px', fontWeight: 600 }}>
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
                                                                    padding: '2px 2px',
                                                                    textAlign: 'center'
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </tr>
                                            );
                                        })}
                                    </tbody>

                                    {/* Fila de Totales por Producto + GRAN TOTAL DE HOJA POKA-YOKE */}
                                    <tfoot>
                                        <tr style={{ backgroundColor: '#F1F5F9', borderTop: '1.5px solid #000000', fontWeight: 900 }}>
                                            <td colSpan={3} style={{ textAlign: 'left', padding: '3px 6px', border: '1px solid #000000', fontSize: '7.2pt', color: '#000000', letterSpacing: '0.02em' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>PRODUCTOS ({chunkProducts.length})</span>
                                                    <span style={{ fontWeight: 900, color: '#0D7A57', backgroundColor: '#E2E8F0', padding: '2px 5px', borderRadius: '4px' }}>
                                                        TOTAL HOJA: {sheetTotalKg.toLocaleString('es-CO')} KG
                                                    </span>
                                                </div>
                                            </td>
                                            {chunkProducts.map((prod) => {
                                                const colSum = activeOrdersInCell.reduce((sum, ord) => sum + (prod.orderDemand[ord.id]?.kgQuantity || 0), 0);
                                                const sumStr = colSum > 0 
                                                    ? (colSum % 1 === 0 ? colSum.toString() : Number(colSum.toFixed(2)).toLocaleString('es-CO')) + prod.unit 
                                                    : '-';

                                                return (
                                                    <td
                                                        key={prod.id}
                                                        style={{
                                                            textAlign: 'center',
                                                            padding: '3px 1px',
                                                            border: '1px solid #000000',
                                                            fontSize: '7.2pt',
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

                                {/* Pie de Página con Control Relativo por Célula */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '6.5pt', color: '#475569', fontWeight: '600' }}>
                                    <div>
                                        CÉLULA: <strong style={{ color: '#0F172A' }}>{cellName}</strong> &bull; Hoja {chunkIdx + 1} de {totalChunksForCell}
                                    </div>
                                    <div>
                                        Pág. Global {sheetGlobalIdx + 1} de {printableSheets.length}
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
