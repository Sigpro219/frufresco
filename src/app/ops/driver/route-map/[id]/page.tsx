'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';
import ActivityLog from '@/components/ActivityLog';

interface RouteStop {
    id: string;
    sequence_number: number;
    status: 'pending' | 'arrived' | 'delivered' | 'failed';
    orders: {
        id: string;
        customer_name: string;
        shipping_address: string;
        total: number;
    } | null;
}

export default function RouteExecutionPage() {
    const { id } = useParams();
    const router = useRouter();
    const [stops, setStops] = useState<RouteStop[]>([]);
    const [loading, setLoading] = useState(true);
    const [plate, setPlate] = useState<string>('');
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;

        const fetchStops = async () => {
            try {
                setLoading(true);

                // Handle Mock Route ID for Demo Mode
                if (typeof id === 'string' && id.startsWith('mock')) {
                    setPlate('FXX-002');
                    const mockStops: RouteStop[] = [
                        {
                            id: 'ms1', sequence_number: 1, status: 'pending',
                            orders: { id: 'mo1', customer_name: 'Minimercado La 80 (Mock)', shipping_address: 'Carrera 80 #45-12', total: 156000 }
                        },
                        {
                            id: 'ms2', sequence_number: 2, status: 'pending',
                            orders: { id: 'mo2', customer_name: 'Restaurante Central (Mock)', shipping_address: 'Calle 50 #10-20', total: 890000 }
                        },
                        {
                            id: 'ms3', sequence_number: 3, status: 'pending',
                            orders: { id: 'mo3', customer_name: 'Panadería El Girasol (Mock)', shipping_address: 'Transversal 5 #8-15', total: 45000 }
                        }
                    ];
                    setStops(mockStops);
                    setLoading(false);
                    return;
                }

                const { data: routeInfo } = await supabase.from('routes').select('vehicle_plate').eq('id', id).single();
                if (routeInfo) setPlate(routeInfo.vehicle_plate);

                const { data, error } = await supabase
                    .from('route_stops')
                    .select(`
                        id, sequence_number, status,
                        orders:order_id (
                            id, customer_name, shipping_address, total
                        )
                    `)
                    .eq('route_id', id)
                    .order('sequence_number', { ascending: true });

                if (!isMounted.current) return;
                if (error) throw error;
                setStops((data as unknown as RouteStop[]) || []);
            } catch (err: unknown) {
                if (!isMounted.current) return;
                
                const error = err as { message?: string; code?: string; name?: string; details?: string; hint?: string };

                if (isAbortError(err)) return;

                console.error('Error fetching stops:', error.message || error);
            } finally {
                if (isMounted.current) setLoading(false);
            }
        };

        if (id) fetchStops();

        return () => { isMounted.current = false; };
    }, [id]);

    if (loading) return <div style={{ padding: '2rem', textAlign: 'center', color: '#9CA3AF' }}>Cargando mapa de ruta...</div>;

    const nextStop = stops.find(s => s.status === 'pending');
    const completedStops = stops.filter(s => s.status === 'delivered' || s.status === 'failed').length;

    const openGoogleMaps = (address: string) => {
        const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
        window.open(url, '_blank');
    };

    return (
        <div style={{ padding: '1rem', paddingBottom: '7rem', maxWidth: '600px', margin: '0 auto' }}>
            <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0 }}>Ruta en <span style={{ color: '#3B82F6' }}>Curso</span></h1>
                <div style={{ backgroundColor: '#1E3A8A', color: '#93C5FD', padding: '0.4rem 0.8rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {completedStops} / {stops.length} COMPLETADO
                </div>
            </header>

            {/* Next Stop Hero Card */}
            {nextStop ? (
                <div style={{ 
                    backgroundColor: '#1E3A8A', 
                    borderRadius: '24px', 
                    padding: '2rem 1.5rem', 
                    marginBottom: '2rem',
                    boxShadow: '0 20px 25px -5px rgba(30, 58, 138, 0.3)',
                    border: '1px solid #3B82F6'
                }}>
                    <div style={{ fontSize: '0.7rem', color: '#93C5FD', fontWeight: '900', letterSpacing: '2px', marginBottom: '0.5rem' }}>SIGUIENTE DESTINO</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'white', marginBottom: '0.5rem' }}>{nextStop.orders?.customer_name}</div>
                    <div style={{ fontSize: '0.9rem', color: '#BFDBFE', marginBottom: '1.5rem' }}>📍 {nextStop.orders?.shipping_address}</div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <button 
                            onClick={() => openGoogleMaps(nextStop.orders?.shipping_address || '')}
                            style={{ 
                                padding: '1rem', borderRadius: '15px', border: 'none', 
                                backgroundColor: '#2563EB', color: 'white', fontWeight: '800' 
                            }}>
                            NAVEGAR 🗺️
                        </button>
                        <button 
                            onClick={() => router.push(`/ops/driver/delivery/${nextStop.id}`)}
                            style={{ 
                                padding: '1rem', borderRadius: '15px', border: 'none', 
                                backgroundColor: '#10B981', color: 'white', fontWeight: '800' 
                            }}>
                            ENTREGAR ✅
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ backgroundColor: '#064E3B', borderRadius: '24px', padding: '2rem', textAlign: 'center', marginBottom: '2rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏁</div>
                    <h3 style={{ margin: 0, color: 'white' }}>¡Ruta completada!</h3>
                    <p style={{ color: '#A7F3D0', fontSize: '0.85rem' }}>Todos los pedidos fueron gestionados.</p>
                </div>
            )}

            {/* Shared Activity Log */}
            {plate && <ActivityLog plate={plate} />}

            {/* List of remaining/visited stops */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ color: '#9CA3AF', fontSize: '0.8rem', margin: '0 0 0.5rem 0.5rem' }}>RECORRIDO TOTAL</h4>
                {stops.map(stop => (
                    <div key={stop.id} style={{ 
                        backgroundColor: '#1F2937', 
                        borderRadius: '16px', 
                        padding: '1rem', 
                        border: '1px solid #374151',
                        opacity: stop.status !== 'pending' ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem'
                    }}>
                        <div style={{ 
                            width: '30px', height: '30px', borderRadius: '50%', 
                            backgroundColor: stop.status === 'delivered' ? '#10B981' : stop.status === 'failed' ? '#EF4444' : '#374151',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: '900', color: 'white', fontSize: '0.8rem'
                        }}>
                            {stop.status === 'delivered' ? '✓' : stop.status === 'failed' ? '✗' : stop.sequence_number}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'white' }}>{stop.orders?.customer_name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#9CA3AF' }}>{stop.orders?.shipping_address}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
