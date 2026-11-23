'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { resolvePhysicalInstruction } from '@/lib/orderUtils';
import { OPERATIONAL_CELLS, getOperationalTargetDate, normalizeOperationalCell } from '@/lib/ops/operationalCells';
import { getOrderSpaceDisplayLabel } from '@/lib/stagingSpaceAllocator';
import { CornerDownRight, CheckCircle2 } from 'lucide-react';

// Types
type PickingItem = {
    id: string; // OrderItem ID
    product_id: string;
    parent_id?: string | null;
    product_name: string;
    quantity: number;
    picked_quantity: number;
    unit_of_measure: string;
    customer_name: string;
    zone_name: string;
    space_label?: string | null;
    available_stock?: number;
    physical_instruction?: string | null;
};

interface SupabaseOrderItem {
    id: string;
    product_id: string;
    quantity: number;
    picked_quantity: number | null;
    unit?: string | null;
    variant_label?: string | null;
    nickname?: string | null;
    selected_options?: Record<string, any> | null;
    products: {
        id: string;
        name: string;
        category?: string | null;
        buying_team?: string | null;
        parent_id?: string | null;
        accounting_id?: string | number | null;
        unit_of_measure: string;
    };
    orders: {
        status: string;
        warehouse_spaces?: number[] | null;
        logistics_data?: Record<string, any> | null;
        profiles: {
            role: string;
            company_name: string | null;
            contact_name: string | null;
        } | null;
    };
}

const supabase = createClient();

export default function PickingTerminal() {
    // State
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);
    const [selectedCell, setSelectedCell] = useState<string | null>(null);
    const [tasks, setTasks] = useState<PickingItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastAction, setLastAction] = useState<string | null>(null);

    // 12 Células reales (buying_team alineado 1:1 con Sábana de Alistamiento)
    const CELLS = OPERATIONAL_CELLS;

    // Load Tasks for Cell
    const loadTasks = useCallback(async (cell: string, signal?: AbortSignal) => {
        setLoading(true);
        try {
            const targetDate = getOperationalTargetDate(20);
            const normalizedTargetCell = normalizeOperationalCell(cell);
            const { data, error } = await fetchAllRows<SupabaseOrderItem>((from, to) =>
                supabase
                    .from('order_items')
                    .select(`
                        id, product_id, quantity, picked_quantity, unit, variant_label, nickname, selected_options,
                        products!inner (id, name, category, unit_of_measure, buying_team, accounting_id, parent_id),
                        orders!inner (
                            status, delivery_date, warehouse_spaces, logistics_data,
                            profiles:profile_id (
                                role,
                                company_name,
                                contact_name
                            )
                        )
                    `)
                    .eq('orders.delivery_date', targetDate)
                    .in('orders.status', ['para_compra', 'approved', 'picking', 'in_preparation'])
                    .range(from, to)
                    .abortSignal(signal as any)
            );

            if (!isMounted.current) return;
            if (error) throw error;

            if (data) {
                const pendingItems = (data as unknown as SupabaseOrderItem[]).filter(item => {
                    const picked = item.picked_quantity || 0;
                    if (picked >= item.quantity) return false;
                    const resolvedCell = normalizeOperationalCell(item.products?.buying_team, item.products?.category);
                    return resolvedCell === normalizedTargetCell;
                });

                const stockLookupIds = Array.from(new Set(
                    pendingItems.flatMap(it => [it.product_id || it.products?.id, it.products?.parent_id]).filter(Boolean) as string[]
                ));
                const stockByProd: Record<string, number> = {};
                if (stockLookupIds.length > 0) {
                    const { data: stockRows } = await supabase
                        .from('inventory_stocks')
                        .select('product_id, quantity')
                        .in('product_id', stockLookupIds);
                    (stockRows || []).forEach((s: any) => {
                        stockByProd[s.product_id] = (stockByProd[s.product_id] || 0) + Number(s.quantity || 0);
                    });
                }
                
                const mapped: PickingItem[] = pendingItems.map(item => {
                    const p = item.orders.profiles;
                    let customerName = 'Cliente';
                    if (p) {
                        customerName = p.role === 'b2b_client' 
                            ? (p.company_name || 'Sin Razón Social') 
                            : (p.contact_name || p.company_name || 'Cliente B2C');
                    }
                    const itemUnit = item.unit || item.products.unit_of_measure;
                    const physicalInst = resolvePhysicalInstruction({
                        quantity: item.quantity,
                        unit: itemUnit,
                        variant_label: item.variant_label,
                        nickname: item.nickname,
                        selected_options: item.selected_options
                    });
                    const variant = item.variant_label || item.nickname || '';
                    const baseLabel = item.products.accounting_id
                        ? `#${item.products.accounting_id} ${item.products.name}`
                        : item.products.name;
                    const dispName = variant ? `${baseLabel} (${variant})` : baseLabel;
                    const pid = item.product_id || item.products.id;
                    const parentId = item.products?.parent_id || null;
                    const childStock = stockByProd[pid] || 0;
                    const availStock = childStock > 0 ? childStock : (parentId ? (stockByProd[parentId] || 0) : 0);

                    return {
                        id: item.id,
                        product_id: pid,
                        parent_id: parentId,
                        product_name: dispName,
                        quantity: item.quantity,
                        picked_quantity: item.picked_quantity || 0,
                        unit_of_measure: itemUnit,
                        customer_name: customerName,
                        zone_name: 'General',
                        space_label: getOrderSpaceDisplayLabel(item.orders),
                        available_stock: availStock,
                        physical_instruction: physicalInst
                    };
                });
                
                if (isMounted.current) {
                    setTasks(mapped.sort((a, b) => a.product_name.localeCompare(b.product_name)));
                }
            }
        } catch (err: unknown) {
            if (!isMounted.current) return;
            if (isAbortError(err)) return;
            console.error('Error loadTasks:', err);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, []);

    // Initial Load
    useEffect(() => {
        if (selectedCell) {
            const controller = new AbortController();
            loadTasks(selectedCell, controller.signal);

            // Realtime Subscription for THIS cell
            const channel = supabase.channel('terminal-changes')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => {
                    if (isMounted.current) loadTasks(selectedCell, controller.signal);
                })
                .subscribe();

            return () => { 
                controller.abort();
                supabase.removeChannel(channel).catch(() => {}); // Prevent floating promise/error
            };
        }
    }, [selectedCell, loadTasks]);

    // Actions
    const handlePick = async (item: PickingItem) => {
        // DT-17 Stock gate when stock is zero
        if ((item.available_stock ?? 0) <= 0) {
            const proceedZero = confirm(
                `ALERTA DT-17 SIN STOCK: ${item.product_name} registra stock 0 en bodega.\n¿Confirmas que encontraste stock físico en piso para picar ${item.quantity} ${item.unit_of_measure}?`
            );
            if (!proceedZero) return;
        }

        // Optimistic Remove
        setTasks(prev => prev.filter(t => t.id !== item.id));
        setLastAction(`Picado: ${item.product_name} (${item.quantity})`);

        // DB Update
        const { error } = await supabase
            .from('order_items')
            .update({ picked_quantity: item.quantity }) // Assume full pick for speed
            .eq('id', item.id);

        if (error) {
            (window as any).showToast?.('Error al guardar. Recarga.', 'error');
            loadTasks(selectedCell!);
            return;
        }

        // Integración de Inventario: Se maneja automáticamente vía trigger de base de datos al actualizar picked_quantity.

        // Auto-clear message
        setTimeout(() => setLastAction(null), 3000);
    };

    // -- VIEW: CELL SELECTION --
    if (!selectedCell) {
        return (
            <div className="min-h-screen bg-black text-white p-6 flex flex-col justify-center">
                <h1 className="text-3xl font-bold mb-8 text-center text-yellow-400 font-mono">
                    TERMINAL DE PICKING<br />
                    <span className="text-white text-xl">Selecciona tu Célula</span>
                </h1>
                <div className="grid grid-cols-2 gap-4">
                    {CELLS.map(cell => (
                        <button
                            key={cell}
                            onClick={() => setSelectedCell(cell)}
                            className="bg-gray-800 hover:bg-gray-700 border-2 border-gray-600 p-8 rounded-xl text-xl font-bold uppercase transition-all active:scale-95"
                        >
                            {cell}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // -- VIEW: TASK LIST --
    return (
        <div className="min-h-screen bg-gray-900 text-white flex flex-col">
            {/* Header */}
            <div className="bg-black p-4 border-b border-gray-800 flex justify-between items-center sticky top-0 z-50">
                <div>
                    <h2 className="text-yellow-400 font-bold text-sm tracking-wider">CÉLULA</h2>
                    <h1 className="text-2xl font-mono">{selectedCell.toUpperCase()}</h1>
                </div>
                <div className="text-right">
                    <div className="text-gray-400 text-xs">PENDIENTES</div>
                    <div className="text-3xl font-bold text-white">{tasks.length}</div>
                </div>
            </div>

            {/* Notification */}
            {lastAction && (
                <div className="bg-green-600 text-white p-2 text-center text-sm font-bold animate-pulse">
                    {lastAction}
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-auto p-4 space-y-3">
                {loading && tasks.length === 0 && <div className="text-center p-10 text-gray-500">Cargando tareas...</div>}

                {!loading && tasks.length === 0 && (
                    <div className="text-center p-20 flex flex-col items-center">
                        <CheckCircle2 className="w-14 h-14 text-green-400 mb-4" />
                        <h3 className="text-2xl font-bold text-green-400">¡Todo Listo!</h3>
                        <p className="text-gray-400">No hay pendientes en {selectedCell}</p>
                        <button onClick={() => setSelectedCell(null)} className="mt-8 text-blue-400 underline">Cambiar Célula</button>
                    </div>
                )}

                {tasks.map(item => (
                    <div key={item.id} className="bg-gray-800 rounded-lg p-4 shadow-lg border-l-4 border-yellow-500 flex justify-between items-center">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-lg font-bold text-white">{item.product_name}</h3>
                                {item.space_label && (
                                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-xs font-black">
                                        ESP {item.space_label}
                                    </span>
                                )}
                                {(item.available_stock ?? 0) <= 0 && (
                                    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold">
                                        SIN STOCK ({item.available_stock ?? 0})
                                    </span>
                                )}
                            </div>
                            {item.physical_instruction && (
                                <div className="text-emerald-400 text-xs font-bold mt-0.5 flex items-center gap-1">
                                    <CornerDownRight size={12} /> {item.physical_instruction}
                                </div>
                            )}
                            <div className="text-gray-400 text-sm mt-1">
                                {item.customer_name}
                            </div>
                        </div>

                        <button
                            onClick={() => handlePick(item)}
                            className="ml-4 bg-yellow-400 hover:bg-yellow-300 text-black font-bold h-14 w-24 rounded-lg flex flex-col items-center justify-center active:scale-90 transition-transform"
                        >
                            <span className="text-xs uppercase opacity-70">CONFIRMAR</span>
                            <span className="text-xl">{item.quantity}</span>
                        </button>
                    </div>
                ))}
            </div>

            <div className="p-4 text-center">
                <button onClick={() => setSelectedCell(null)} className="text-gray-500 text-xs uppercase tracking-widest">
                    Cambiar Célula
                </button>
            </div>
        </div>
    );
}
