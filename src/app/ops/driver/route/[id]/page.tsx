'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';

interface RouteStop {
    id: string;
    sequence_number: number;
    status: string;
    orders: {
        id: string;
        customer_name: string;
        shipping_address: string;
        order_items: {
            id: string;
            products: { name: string; unit_of_measure: string };
            quantity: number;
            picked_quantity: number;
        }[];
    } | null;
}

export default function LoadVerificationPage() {
    const { id } = useParams();
    const router = useRouter();
    const [stops, setStops] = useState<RouteStop[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [loadedStops, setLoadedStops] = useState<Set<string>>(new Set());
    const isMounted = useRef(true);

    const toggleStop = (id: string) => {
        setLoadedStops(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const fetchRouteData = useCallback(async () => {
        try {
            setLoading(true);

            // Handle Mock Route ID for Demo Mode
            if (typeof id === 'string' && id.startsWith('mock')) {
                const mockStops: RouteStop[] = [
                    {
                        id: 's1', sequence_number: 1, status: 'pending',
                        orders: {
                            id: 'o1', customer_name: 'Restaurante El Sabor (Mock)', shipping_address: 'Calle Falsa 123',
                            order_items: [
                                { id: 'oi1', products: { name: 'Papa Sabanera', unit_of_measure: 'KG' }, quantity: 50, picked_quantity: 50 },
                                { id: 'oi2', products: { name: 'Cebolla Cabezona', unit_of_measure: 'KG' }, quantity: 20, picked_quantity: 20 }
                            ]
                        }
                    },
                    {
                        id: 's2', sequence_number: 2, status: 'pending',
                        orders: {
                            id: 'o2', customer_name: 'Piqueteadero Central (Mock)', shipping_address: 'Av Siempre Viva 742',
                            order_items: [
                                { id: 'oi3', products: { name: 'Tomate Chonto', unit_of_measure: 'KG' }, quantity: 30, picked_quantity: 30 }
                            ]
                        }
                    },
                    {
                        id: 's3', sequence_number: 3, status: 'pending',
                        orders: {
                            id: 'o3', customer_name: 'Frutería Express (Mock)', shipping_address: 'Carrera 15 #123',
                            order_items: [
                                { id: 'oi4', products: { name: 'Limón Tahití', unit_of_measure: 'KG' }, quantity: 15, picked_quantity: 15 }
                            ]
                        }
                    }
                ];
                setStops(mockStops);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('route_stops')
                .select(`
                    id, sequence_number, status,
                    orders:order_id (
                        id, customer_name, shipping_address,
                        order_items (
                            id, quantity, picked_quantity,
                            products (name, unit_of_measure)
                        )
                    )
                `)
                .eq('route_id', id)
                .order('sequence_number', { ascending: true });

            if (!isMounted.current) return;
            if (error) throw error;
            setStops((data as unknown as RouteStop[]) || []);
        } catch (err: unknown) {
            if (!isMounted.current) return;
            
            const error = err as { message?: string, code?: string, name?: string };

            if (isAbortError(err)) return;
            
            console.error('Error fetching route data:', error.message || error);
        } finally {
            if (isMounted.current) setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        isMounted.current = true;
        if (id) fetchRouteData();
        return () => { isMounted.current = false; };
    }, [id, fetchRouteData]);

    const handleConfirmLoading = async () => {
        if (loadedStops.size < stops.length) {
            alert('Por favor valida todos los pedidos antes de iniciar.');
            return;
        }

        try {
            setSaving(true);
            // Handle Mock Route ID for Demo Mode
            if (typeof id === 'string' && id.startsWith('mock')) {
                router.push(`/ops/driver/route-map/${id}`);
                return;
            }

            // Update route status to 'in_transit'
            const { error: routeErr } = await supabase
                .from('routes')
                .update({ status: 'in_transit', start_time: new Date().toISOString() })
                .eq('id', id);
            
            if (routeErr) throw routeErr;

            router.push(`/ops/driver/route-map/${id}`);
        } catch (err) {
            console.error('Error confirming load:', err);
            alert('Error al confirmar cargue');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Validando carga...</div>;

    const totalOrders = stops.length;
    // LIFO Logic: Sort reverse sequence for packing
    const sortedStops = [...stops].sort((a, b) => b.sequence_number - a.sequence_number);
    const allLoaded = loadedStops.size === stops.length;
    
    return (
        <div style={{ padding: '1rem', paddingBottom: '9rem', maxWidth: '600px', margin: '0 auto' }}>
            <header style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.8rem' }}>
                    <button onClick={() => router.back()} style={{ background: '#1F2937', border: 'none', color: 'white', padding: '0.5rem', borderRadius: '10px' }}>←</button>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0 }}>Validación de <span style={{ color: '#10B981' }}>Cargue</span></h1>
                </div>
                
                <div style={{ 
                    backgroundColor: '#1E3A8A', color: '#93C5FD', padding: '1rem', 
                    borderRadius: '16px', fontSize: '0.85rem', border: '1px solid #3B82F6',
                    display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '1rem'
                }}>
                    <span style={{ fontSize: '1.5rem' }}>📦</span>
                    <div>
                        <div style={{ fontWeight: '900', color: 'white' }}>LÓGICA DE CARGUE (LIFO)</div>
                        <div style={{ opacity: 0.8 }}>Carga primero lo que entregarás al final para que quede al fondo del camión.</div>
                    </div>
                </div>

                <div style={{ backgroundColor: '#064E3B', color: '#A7F3D0', padding: '0.5rem 1rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    📦 {loadedStops.size} / {totalOrders} PEDIDOS VALIDADOS
                </div>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sortedStops.map(stop => (
                    <div 
                        key={stop.id} 
                        onClick={() => toggleStop(stop.id)}
                        style={{ 
                            backgroundColor: loadedStops.has(stop.id) ? 'rgba(16, 185, 129, 0.1)' : '#1F2937', 
                            borderRadius: '24px', 
                            padding: '1.5rem', 
                            border: `2px solid ${loadedStops.has(stop.id) ? '#10B981' : '#374151'}`,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ 
                                    width: '32px', height: '32px', borderRadius: '10px', 
                                    backgroundColor: loadedStops.has(stop.id) ? '#10B981' : '#111827',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `2px solid ${loadedStops.has(stop.id) ? '#10B981' : '#4B5563'}`,
                                    color: 'white', fontSize: '1.2rem'
                                }}>
                                    {loadedStops.has(stop.id) ? '✓' : ''}
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{stop.orders?.customer_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>Parada #{stop.sequence_number} de la ruta</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '16px', padding: '1rem' }}>
                            <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: '900', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Mercancía a Cargar</div>
                            {stop.orders?.order_items.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span style={{ color: '#E5E7EB' }}>{item.products.name}</span>
                                    <span style={{ fontWeight: '900', color: '#10B981' }}>{item.picked_quantity} {item.products.unit_of_measure}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ 
                position: 'fixed', 
                bottom: '80px', // Raised to sit above global nav bar
                left: '1rem', 
                right: '1rem', 
                padding: '1rem', 
                backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                backdropFilter: 'blur(20px)', 
                borderRadius: '24px',
                border: '1px solid #374151',
                zIndex: 101, // Above nav bar (which is 100)
                boxShadow: '0 -10px 25px rgba(0,0,0,0.5)'
            }}>
                <button 
                    onClick={handleConfirmLoading}
                    disabled={saving || !allLoaded}
                    style={{ 
                        width: '100%', 
                        padding: '1.2rem', 
                        borderRadius: '24px', 
                        border: 'none', 
                        backgroundColor: allLoaded ? '#10B981' : '#374151', 
                        color: 'white', 
                        fontWeight: '900', 
                        fontSize: '1.1rem',
                        boxShadow: allLoaded ? '0 10px 25px -5px rgba(16, 185, 129, 0.5)' : 'none',
                        transition: 'all 0.3s ease',
                        opacity: saving ? 0.7 : 1
                    }}>
                    {saving ? 'PROCESANDO...' : allLoaded ? 'CONFIRMAR Y SALIR A RUTA 🚀' : `FALTAN ${totalOrders - loadedStops.size} PEDIDOS`}
                </button>
            </div>
        </div>
    );
}
