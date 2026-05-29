'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';
import ActivityLog from '@/components/ActivityLog';
import { ArrowLeft, MapPin, Check, X, Map, CheckCircle2, Navigation } from 'lucide-react';

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
                            id, shipping_address, total,
                            profiles:profile_id (
                                id, company_name, contact_name, role
                            )
                        )
                    `)
                    .eq('route_id', id)
                    .order('sequence_number', { ascending: true });

                if (!isMounted.current) return;
                if (error) throw error;

                if (data) {
                    const mappedStops = (data as any[]).map(stop => {
                        if (stop.orders) {
                            const p = stop.orders.profiles;
                            let name = 'Cliente';
                            if (p) {
                                name = p.role === 'b2b_client' 
                                    ? (p.company_name || 'Sin Razón Social') 
                                    : (p.contact_name || p.company_name || 'Cliente B2C');
                            }
                            stop.orders.customer_name = name;
                        }
                        return stop;
                    });
                    setStops(mappedStops as unknown as RouteStop[]);
                }
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
        <div style={{ padding: '1rem', paddingBottom: '7rem', maxWidth: '600px', margin: '0 auto', minHeight: '100%', backgroundColor: '#090D16', color: 'white' }}>
            <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button 
                        onClick={() => router.push('/ops/driver')} 
                        style={{ 
                            background: 'rgba(255, 255, 255, 0.05)', 
                            border: '1px solid rgba(255, 255, 255, 0.08)', 
                            color: 'white', 
                            padding: '0.6rem', 
                            borderRadius: '12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, letterSpacing: '-0.3px' }}>
                        Ruta en <span style={{ color: '#059669' }}>Curso</span>
                    </h1>
                </div>
                <div style={{ 
                    backgroundColor: 'rgba(5, 150, 105, 0.08)', 
                    color: '#A7F3D0', 
                    border: '1px solid rgba(5, 150, 105, 0.3)',
                    padding: '0.5rem 1rem', 
                    borderRadius: '12px', 
                    fontSize: '0.8rem', 
                    fontWeight: '700' 
                }}>
                    {completedStops} / {stops.length} COMPLETADO
                </div>
            </header>

            {/* Next Stop Hero Card */}
            {nextStop ? (
                <div className="premium-card hero-card" style={{ 
                    padding: '2rem 1.5rem', 
                    marginBottom: '2rem'
                }}>
                    <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: '800', letterSpacing: '2px', marginBottom: '0.6rem' }}>SIGUIENTE DESTINO</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '900', color: 'white', marginBottom: '0.5rem', letterSpacing: '-0.5px' }}>{nextStop.orders?.customer_name}</div>
                    <div style={{ fontSize: '0.9rem', color: '#9CA3AF', marginBottom: '1.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={16} style={{ color: '#059669', flexShrink: 0 }} />
                        <span>{nextStop.orders?.shipping_address}</span>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <button 
                            onClick={() => openGoogleMaps(nextStop.orders?.shipping_address || '')}
                            style={{ 
                                padding: '1rem', 
                                borderRadius: '16px', 
                                border: '1px solid rgba(255, 255, 255, 0.08)', 
                                backgroundColor: 'rgba(255, 255, 255, 0.05)', 
                                color: 'white', 
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                transition: 'all 0.2s ease'
                            }}
                            className="map-btn"
                        >
                            <Map size={18} />
                            <span>NAVEGAR</span>
                        </button>
                        <button 
                            onClick={() => router.push(`/ops/driver/delivery/${nextStop.id}`)}
                            style={{ 
                                padding: '1rem', 
                                borderRadius: '16px', 
                                border: 'none', 
                                backgroundColor: '#059669', 
                                color: 'white', 
                                fontWeight: '800',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 20px rgba(5, 150, 105, 0.25)',
                                transition: 'all 0.2s ease'
                            }}
                            className="deliver-btn"
                        >
                            <CheckCircle2 size={18} />
                            <span>ENTREGAR</span>
                        </button>
                    </div>
                </div>
            ) : (
                <div className="completed-banner" style={{ 
                    borderRadius: '16px', 
                    padding: '2rem', 
                    textAlign: 'center', 
                    marginBottom: '2rem',
                    backgroundColor: 'rgba(5, 150, 105, 0.08)',
                    border: '1px solid rgba(5, 150, 105, 0.3)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                        <CheckCircle2 size={48} style={{ color: '#059669' }} />
                    </div>
                    <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: '800' }}>¡Ruta completada!</h3>
                    <p style={{ color: '#A7F3D0', fontSize: '0.85rem', marginTop: '0.4rem' }}>Todos los pedidos fueron gestionados.</p>
                </div>
            )}

            {/* Shared Activity Log */}
            {plate && (
                <div style={{ marginBottom: '2rem' }}>
                    <ActivityLog plate={plate} />
                </div>
            )}

            {/* List of remaining/visited stops */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h4 style={{ color: '#059669', fontSize: '0.75rem', fontWeight: '800', margin: '0 0 0.5rem 0.5rem', letterSpacing: '0.5px' }}>RECORRIDO TOTAL</h4>
                {stops.map(stop => (
                    <div key={stop.id} style={{ 
                        backgroundColor: 'rgba(30, 41, 59, 0.45)', 
                        borderRadius: '16px', 
                        padding: '1rem 1.2rem', 
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        opacity: stop.status !== 'pending' ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        transition: 'all 0.2s ease'
                    }} className="stop-item-card">
                        <div style={{ 
                            width: '30px', height: '30px', borderRadius: '50%', 
                            backgroundColor: stop.status === 'delivered' ? '#059669' : stop.status === 'failed' ? '#EF4444' : 'rgba(255, 255, 255, 0.05)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: '800', color: 'white', fontSize: '0.8rem',
                            border: `1.5px solid ${stop.status === 'delivered' ? '#059669' : stop.status === 'failed' ? '#EF4444' : 'rgba(255, 255, 255, 0.2)'}`
                        }}>
                            {stop.status === 'delivered' ? <Check size={14} /> : stop.status === 'failed' ? <X size={14} /> : stop.sequence_number}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'white' }}>{stop.orders?.customer_name}</div>
                            <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <MapPin size={12} style={{ color: '#059669' }} />
                                <span>{stop.orders?.shipping_address}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <style jsx>{`
                .premium-card {
                    background: rgba(30, 41, 59, 0.45);
                    backdrop-filter: blur(12px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
                }
                .hero-card {
                    background: linear-gradient(135deg, rgba(30, 41, 59, 0.55) 0%, rgba(9, 13, 22, 0.6) 100%);
                    border-color: rgba(5, 150, 105, 0.2);
                }
                .map-btn:hover {
                    background-color: rgba(255, 255, 255, 0.1) !important;
                }
                .deliver-btn:hover {
                    opacity: 0.9;
                }
                .stop-item-card:hover {
                    transform: translateY(-1px);
                    background-color: rgba(30, 41, 59, 0.55) !important;
                }
            `}</style>
        </div>
    );
}
