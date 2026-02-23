'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

type BoardRow = {
    id: string; // Order ID
    customer_name: string;
    zone_name: string;
    total_items: number;
    picked_items: number;
    status: 'pending' | 'picking' | 'ready' | 'loading' | 'delayed';
    updated_at: string;
};

export default function AirportBoard() {
    const supabase = createClient();
    const [rows, setRows] = useState<BoardRow[]>([]);
    const [currentTime, setCurrentTime] = useState(new Date());

    // Mock Zones map (in real app, fetch from DB)
    const ZONE_MAP: Record<string, string> = {
        '0': 'CENTRO',
        '1': 'NORTE',
        '2': 'SUR',
        '3': 'ORIENTE',
        '4': 'OCCIDENTE'
    };

    // Load Data
    const fetchBoardData = async () => {
        // Fetch active orders
        const { data: orders } = await supabase
            .from('orders')
            .select(`
                id, customer_name, status, updated_at,
                profiles:customer_name(delivery_zone_id),
                order_items(id, quantity, picked_quantity)
            `)
            .in('status', ['approved', 'processing'])
            .order('updated_at', { ascending: false });

        if (orders) {
            const boardRows: BoardRow[] = orders.map((o: any) => {
                const total = o.order_items.reduce((acc: number, i: any) => acc + (i.quantity || 0), 0);
                const picked = o.order_items.reduce((acc: number, i: any) => acc + (i.picked_quantity || 0), 0);
                const percent = total > 0 ? (picked / total) : 0;

                let status: BoardRow['status'] = 'pending';
                if (percent > 0 && percent < 1) status = 'picking';
                if (percent === 1) status = 'ready';
                if (percent < 1 && new Date(o.updated_at).getTime() < Date.now() - 3600000) status = 'delayed'; // 1hr no move

                // Get Zone Name safely
                const zoneId = o.profiles?.[0]?.delivery_zone_id?.toString() || '0';

                return {
                    id: o.id,
                    customer_name: o.customer_name,
                    zone_name: ZONE_MAP[zoneId] || 'GEN',
                    total_items: total,
                    picked_items: picked,
                    status,
                    updated_at: o.updated_at
                };
            });
            // Sort: READY first, then PICKING, then PENDING
            // Actually Airport style: Time based usually, but here Priority based
            setRows(boardRows.sort((a, b) => {
                if (a.status === 'ready' && b.status !== 'ready') return -1;
                if (a.status === 'picking' && b.status === 'pending') return -1;
                return 0;
            }));
        }
    };

    useEffect(() => {
        fetchBoardData();

        // Clock
        const messageInterval = setInterval(() => setCurrentTime(new Date()), 1000);

        // Realtime Subscription
        const channel = supabase.channel('airport-board')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchBoardData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchBoardData)
            .subscribe();

        return () => {
            clearInterval(messageInterval);
            supabase.removeChannel(channel);
        };
    }, []);

    // Helper for Status Color
    const getStatusColor = (s: string) => {
        switch (s) {
            case 'ready': return 'text-green-500 animate-pulse';
            case 'picking': return 'text-yellow-400';
            case 'delayed': return 'text-red-500 blink';
            default: return 'text-white';
        }
    };

    return (
        <div className="min-h-screen bg-black text-white font-mono p-4 overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-end border-b-4 border-white pb-2 mb-4">
                <div>
                    <h1 className="text-4xl md:text-6xl font-bold uppercase tracking-widest text-white">
                        VUELOS / FLIGHTS
                    </h1>
                    <div className="text-xl text-yellow-500 mt-2">OPERACIÓN EN VIVO</div>
                </div>
                <div className="text-right">
                    <div className="text-3xl md:text-5xl font-bold text-yellow-400">
                        {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="text-gray-400">{currentTime.toLocaleDateString()}</div>
                </div>
            </div>

            {/* Board Table */}
            <div className="flex-1 overflow-auto relative">
                <table className="w-full text-left border-collapse">
                    <thead className="text-xl md:text-2xl text-gray-500 uppercase border-b border-gray-700 sticky top-0 bg-black z-10">
                        <tr>
                            <th className="py-2 pl-4">DESTINO (CLIENTE)</th>
                            <th className="py-2">RUTA</th>
                            <th className="py-2 text-center">PROGRESO</th>
                            <th className="py-2 text-right pr-8">ESTADO</th>
                        </tr>
                    </thead>
                    <tbody className="text-xl md:text-3xl font-bold">
                        {rows.map((row, idx) => (
                            <tr key={row.id} className={`${idx % 2 === 0 ? 'bg-gray-900' : 'bg-black'} border-b border-gray-800 h-16 md:h-20`}>
                                <td className="pl-4 text-yellow-300 truncate max-w-xs md:max-w-md">
                                    {row.customer_name.toUpperCase().substring(0, 20)}
                                </td>
                                <td className="text-white">
                                    {row.zone_name}
                                </td>
                                <td className="text-center">
                                    <span className="text-white">{row.picked_items}</span>
                                    <span className="text-gray-600 mx-1">/</span>
                                    <span className="text-gray-400">{row.total_items}</span>
                                </td>
                                <td className={`text-right pr-8 uppercase tracking-wider ${getStatusColor(row.status)}`}>
                                    {row.status === 'ready' ? 'LISTO' : row.status === 'picking' ? 'EMBARCANDO' : 'ESPERA'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {rows.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-4xl text-gray-600 animate-pulse">
                        ESPERANDO DATOS...
                    </div>
                )}
            </div>

            {/* Footer Ticker */}
            <div className="bg-yellow-500 text-black p-2 mt-4 font-bold text-xl overflow-hidden whitespace-nowrap">
                <div className="animate-marquee inline-block">
                    *** OPERACIÓN FLUIDA *** NO OLVIDAR EQUIPO DE PROTECCIÓN *** RUTAS NORTE SALIENDO A LAS 14:00 *** REPORTE CUALQUIER NOVEDAD AL SUPERVISOR ***
                </div>
            </div>

            <style jsx>{`
                .animate-marquee {
                    animation: marquee 20s linear infinite;
                }
                @keyframes marquee {
                    0% { transform: translateX(100%); }
                    100% { transform: translateX(-100%); }
                }
            `}</style>
        </div>
    );
}
