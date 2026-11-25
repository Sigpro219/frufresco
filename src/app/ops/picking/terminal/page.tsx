'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchAllRows } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { resolvePhysicalInstruction } from '@/lib/orderUtils';
import { OPERATIONAL_CELLS, getOperationalTargetDate, normalizeOperationalCell } from '@/lib/ops/operationalCells';
import { getOrderSpaceDisplayLabel } from '@/lib/stagingSpaceAllocator';
import { isSandboxMode } from '@/lib/sandboxGuard';
import { CornerDownRight, CheckCircle2, Scale } from 'lucide-react';

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
    const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

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
                    const { data: stockRows, error: stockError } = await supabase
                        .from('inventory_stocks')
                        .select('product_id, quantity')
                        .in('product_id', stockLookupIds);
                    if (stockError) throw stockError;
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
    const handleWeightInputChange = (itemId: string, rawValue: string) => {
        const normalized = rawValue.replace(',', '.');
        if (normalized !== '' && !/^\d*(\.\d*)?$/.test(normalized)) {
            return;
        }
        setWeightInputs(prev => ({ ...prev, [itemId]: normalized }));
    };

    const handlePick = async (item: PickingItem, customPickedQty?: number) => {
        if (savingId === item.id) return;

        const targetQty = customPickedQty !== undefined ? customPickedQty : item.quantity;

        if (!Number.isFinite(targetQty)) {
            (window as any).showToast?.('Ingresa una pesada numérica válida.', 'error');
            return;
        }

        // Validación anti-dedo (Escenario 488 §2): <= 0 o > +25% sobre item.quantity exige confirmación explícita
        if (targetQty <= 0) {
            const confirmZeroOrLess = window.confirm(
                `ALERTA ANTI-DEDO: Vas a registrar ${targetQty} ${item.unit_of_measure} (<= 0) para ${item.product_name} (pedido: ${item.quantity}).\n¿Confirmas guardar este valor?`
            );
            if (!confirmZeroOrLess) return;
        } else if (item.quantity > 0 && targetQty > item.quantity * 1.25) {
            const pctOver = (((targetQty - item.quantity) / item.quantity) * 100).toFixed(1);
            const confirmOverweight = window.confirm(
                `ALERTA ANTI-DEDO (+${pctOver}%): Vas a registrar ${targetQty} ${item.unit_of_measure} frente a ${item.quantity} ${item.unit_of_measure} pedidos para ${item.product_name}.\n¿Confirmas que esta pesada real es correcta?`
            );
            if (!confirmOverweight) return;
        }

        // DT-17 Stock gate when stock is zero
        if (targetQty > 0 && (item.available_stock ?? 0) <= 0) {
            const proceedZero = window.confirm(
                `ALERTA DT-17 SIN STOCK: ${item.product_name} registra stock 0 en bodega.\n¿Confirmas que encontraste stock físico en piso para picar ${targetQty} ${item.unit_of_measure}?`
            );
            if (!proceedZero) return;
        }

        setSavingId(item.id);
        try {
            // DB Update on order_items.picked_quantity
            const { error: orderItemError } = await supabase
                .from('order_items')
                .update({ picked_quantity: targetQty })
                .eq('id', item.id);

            if (orderItemError) throw orderItemError;

            // Sincronización de excedente en inventory_movements (sin trigger en BD sobre picked_quantity)
            if (targetQty > item.quantity) {
                const deltaOverweight = Number((targetQty - item.quantity).toFixed(2));
                if (deltaOverweight > 0) {
                    const { data: warehouseData, error: warehouseError } = await supabase
                        .from('warehouses')
                        .select('id')
                        .limit(1)
                        .maybeSingle();

                    if (warehouseError) throw warehouseError;
                    if (!warehouseData?.id) {
                        throw new Error('No se encontró una bodega activa para registrar el excedente de pesada.');
                    }

                    const isSandbox = isSandboxMode();
                    const targetDate = getOperationalTargetDate(20);
                    const refType = isSandbox ? 'sandbox_waste_weighing' : 'waste_weighing';
                    const noteTag = `[EXCEDENTE BÁSCULA - TERMINAL PICKING] ${item.product_name} (+${deltaOverweight} ${item.unit_of_measure}) | Item #${item.id}`;

                    const { error: delMovErr } = await supabase
                        .from('inventory_movements')
                        .delete()
                        .eq('reference_id', item.id)
                        .in('reference_type', ['waste_weighing', 'sandbox_waste_weighing', 'additional_sale', 'sandbox_additional_sale']);

                    if (delMovErr) throw delMovErr;

                    const { error: insMovErr } = await supabase
                        .from('inventory_movements')
                        .insert([{
                            product_id: item.product_id,
                            warehouse_id: warehouseData.id,
                            quantity: -deltaOverweight,
                            type: 'exit',
                            status_to: 'available',
                            notes: noteTag,
                            reference_type: refType,
                            reference_id: item.id,
                            created_at: `${targetDate}T12:00:00.000Z`
                        }]);

                    if (insMovErr) throw insMovErr;
                }
            }

            if (targetQty >= item.quantity) {
                setTasks(prev => prev.filter(t => t.id !== item.id));
            } else {
                setTasks(prev => prev.map(t => t.id === item.id ? { ...t, picked_quantity: targetQty } : t));
            }
            setWeightInputs(prev => {
                const next = { ...prev };
                delete next[item.id];
                return next;
            });
            setLastAction(`Picado: ${item.product_name} (${targetQty} ${item.unit_of_measure})`);
            setTimeout(() => {
                if (isMounted.current) setLastAction(null);
            }, 3000);
        } catch (err) {
            console.error('Error guardando pesada en terminal de picking:', err);
            (window as any).showToast?.('Error al guardar pesada. Recarga e intenta de nuevo.', 'error');
            if (selectedCell) loadTasks(selectedCell);
        } finally {
            if (isMounted.current) setSavingId(null);
        }
    };

    const handleWeighSubmit = (item: PickingItem) => {
        const raw = (weightInputs[item.id] ?? '').trim();
        if (!raw) {
            (window as any).showToast?.('Ingresa la pesada real antes de guardar.', 'error');
            return;
        }
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) {
            (window as any).showToast?.('Valor numérico inválido.', 'error');
            return;
        }
        void handlePick(item, parsed);
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

                {tasks.map(item => {
                    const weightValue = weightInputs[item.id] ?? '';
                    const isSaving = savingId === item.id;
                    return (
                    <div key={item.id} className="bg-gray-800 rounded-lg p-4 shadow-lg border-l-4 border-yellow-500 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
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
                                {item.customer_name} · Pedido: <span className="text-gray-200 font-semibold">{item.quantity} {item.unit_of_measure}</span>
                                {item.picked_quantity > 0 && (
                                    <span className="ml-2 text-amber-300 font-semibold">(Picado previo: {item.picked_quantity})</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 self-end sm:self-center">
                            <div className="flex items-center bg-gray-900 border border-gray-600 rounded-lg overflow-hidden h-14">
                                <div className="pl-2.5 pr-1 text-gray-400 flex items-center" title="Pesada real">
                                    <Scale className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={weightValue}
                                    onChange={(e) => handleWeightInputChange(item.id, e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleWeighSubmit(item);
                                        }
                                    }}
                                    placeholder={String(item.quantity)}
                                    disabled={isSaving}
                                    aria-label={`Pesada real para ${item.product_name}`}
                                    className="w-20 bg-transparent text-white text-center font-mono text-lg font-bold focus:outline-none placeholder:text-gray-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => handleWeighSubmit(item)}
                                    disabled={isSaving || !weightValue.trim()}
                                    className="h-full px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-bold uppercase tracking-wide transition-colors"
                                >
                                    Pesar
                                </button>
                            </div>

                            <button
                                type="button"
                                onClick={() => handlePick(item)}
                                disabled={isSaving}
                                className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-black font-bold h-14 w-24 rounded-lg flex flex-col items-center justify-center active:scale-90 transition-transform"
                            >
                                <span className="text-xs uppercase opacity-80">100%</span>
                                <span className="text-xl">{item.quantity}</span>
                            </button>
                        </div>
                    </div>
                    );
                })}
            </div>

            <div className="p-4 text-center">
                <button onClick={() => setSelectedCell(null)} className="text-gray-500 text-xs uppercase tracking-widest">
                    Cambiar Célula
                </button>
            </div>
        </div>
    );
}
