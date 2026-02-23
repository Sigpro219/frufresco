'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isAbortError } from '@/lib/errorUtils';

// Types
type PickingItem = {
    id: string; // OrderItem ID
    product_name: string;
    quantity: number;
    picked_quantity: number;
    unit_of_measure: string;
    customer_name: string;
    zone_name: string;
};

interface SupabaseOrderItem {
    id: string;
    quantity: number;
    picked_quantity: number | null;
    products: {
        name: string;
        unit_of_measure: string;
    };
    orders: {
        customer_name: string;
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

    // Categories (Cells)
    const CELLS = ['Frutas', 'Verduras', 'Hortalizas', 'Tubérculos', 'Lácteos', 'Despensa'];

    // Load Tasks for Cell
    const loadTasks = useCallback(async (cell: string, signal?: AbortSignal) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('order_items')
                .select(`
                    id, quantity, picked_quantity,
                    products!inner (name, unit_of_measure),
                    orders!inner (customer_name, status)
                `)
                .eq('products.category', cell)
                .in('orders.status', ['approved', 'processing'])
                .abortSignal(signal as any);

            if (!isMounted.current) return;
            if (error) throw error;

            if (data) {
                const pendingItems = (data as unknown as SupabaseOrderItem[]).filter(item => {
                    const picked = item.picked_quantity || 0;
                    return picked < item.quantity;
                });
                
                const mapped: PickingItem[] = pendingItems.map(item => ({
                    id: item.id,
                    product_name: item.products.name,
                    quantity: item.quantity,
                    picked_quantity: item.picked_quantity || 0,
                    unit_of_measure: item.products.unit_of_measure,
                    customer_name: item.orders.customer_name,
                    zone_name: 'General'
                }));
                
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
        // Optimistic Remove
        setTasks(prev => prev.filter(t => t.id !== item.id));
        setLastAction(`Picado: ${item.product_name} (${item.quantity})`);

        // DB Update
        const { error } = await supabase
            .from('order_items')
            .update({ picked_quantity: item.quantity }) // Assume full pick for speed
            .eq('id', item.id);

        if (error) {
            alert('Error al guardar. Recarga.');
            loadTasks(selectedCell!);
        }

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
                        <div className="text-6xl mb-4">🎉</div>
                        <h3 className="text-2xl font-bold text-green-400">¡Todo Listo!</h3>
                        <p className="text-gray-400">No hay pendientes en {selectedCell}</p>
                        <button onClick={() => setSelectedCell(null)} className="mt-8 text-blue-400 underline">Cambiar Célula</button>
                    </div>
                )}

                {tasks.map(item => (
                    <div key={item.id} className="bg-gray-800 rounded-lg p-4 shadow-lg border-l-4 border-yellow-500 flex justify-between items-center">
                        <div className="flex-1">
                            <h3 className="text-lg font-bold text-white">{item.product_name}</h3>
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
