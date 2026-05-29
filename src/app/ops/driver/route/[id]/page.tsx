'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Package, Check, Navigation, Info } from 'lucide-react';

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
                        id, shipping_address,
                        profiles:profile_id (
                            id, company_name, contact_name, role
                        ),
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
        <div style={{ padding: '1rem', paddingBottom: '9rem', maxWidth: '600px', margin: '0 auto', minHeight: '100%', backgroundColor: '#090D16' }}>
            <header style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
                    <button 
                        onClick={() => router.back()} 
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
                    <h1 style={{ fontSize: '1.4rem', fontWeight: '900', margin: 0, color: 'white', letterSpacing: '-0.3px' }}>
                        Validación de <span style={{ color: '#059669' }}>Cargue</span>
                    </h1>
                </div>
                
                <div style={{ 
                    backgroundColor: 'rgba(30, 58, 138, 0.25)', 
                    color: '#93C5FD', 
                    padding: '1rem', 
                    borderRadius: '16px', 
                    fontSize: '0.85rem', 
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    display: 'flex', 
                    gap: '12px', 
                    alignItems: 'center', 
                    marginBottom: '1rem',
                    lineHeight: '1.4'
                }}>
                    <Info size={24} style={{ color: '#93C5FD', flexShrink: 0 }} />
                    <div>
                        <div style={{ fontWeight: '800', color: 'white', marginBottom: '2px' }}>LÓGICA DE CARGUE (LIFO)</div>
                        <div style={{ opacity: 0.85 }}>Carga primero lo que entregarás al final para que quede al fondo del camión.</div>
                    </div>
                </div>

                <div style={{ 
                    backgroundColor: 'rgba(5, 150, 105, 0.08)', 
                    color: '#A7F3D0', 
                    border: '1px solid rgba(5, 150, 105, 0.3)',
                    padding: '0.6rem 1rem', 
                    borderRadius: '12px', 
                    fontSize: '0.8rem', 
                    fontWeight: '700',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <Package size={14} />
                    <span>{loadedStops.size} / {totalOrders} PEDIDOS VALIDADOS</span>
                </div>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sortedStops.map(stop => (
                    <div 
                        key={stop.id} 
                        onClick={() => toggleStop(stop.id)}
                        className={`stop-card ${loadedStops.has(stop.id) ? 'loaded' : ''}`}
                        style={{ 
                            borderRadius: '16px', 
                            padding: '1.5rem', 
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            cursor: 'pointer'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ 
                                    width: '30px', height: '30px', borderRadius: '50%', 
                                    backgroundColor: loadedStops.has(stop.id) ? '#059669' : 'rgba(0,0,0,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: `1.5px solid ${loadedStops.has(stop.id) ? '#059669' : 'rgba(255,255,255,0.2)'}`,
                                    color: 'white'
                                }}>
                                    {loadedStops.has(stop.id) && <Check size={16} />}
                                </div>
                                <div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: '800', color: 'white' }}>{stop.orders?.customer_name}</div>
                                    <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '2px' }}>Parada #{stop.sequence_number} de la ruta</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'rgba(9, 13, 22, 0.4)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <div style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '800', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mercancía a Cargar</div>
                            {stop.orders?.order_items.map(item => (
                                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                    <span style={{ color: '#E2E8F0' }}>{item.products.name}</span>
                                    <span style={{ fontWeight: '800', color: '#059669' }}>{item.picked_quantity} {item.products.unit_of_measure}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ 
                position: 'fixed', 
                bottom: '80px', 
                left: '1rem', 
                right: '1rem', 
                padding: '1rem', 
                backgroundColor: 'rgba(9, 13, 22, 0.95)', 
                backdropFilter: 'blur(20px)', 
                borderRadius: '20px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                zIndex: 101, 
                boxShadow: '0 -10px 30px rgba(0,0,0,0.6)'
            }}>
                <button 
                    onClick={handleConfirmLoading}
                    disabled={saving || !allLoaded}
                    style={{ 
                        width: '100%', 
                        padding: '1.1rem', 
                        borderRadius: '16px', 
                        border: 'none', 
                        backgroundColor: allLoaded ? '#059669' : 'rgba(255, 255, 255, 0.05)', 
                        color: allLoaded ? 'white' : '#9CA3AF', 
                        fontWeight: '800', 
                        fontSize: '1.1rem',
                        boxShadow: allLoaded ? '0 4px 20px rgba(5, 150, 105, 0.3)' : 'none',
                        transition: 'all 0.3s ease',
                        cursor: allLoaded ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}>
                    {saving ? 'PROCESANDO...' : allLoaded ? (
                        <>
                            <span>CONFIRMAR Y SALIR A RUTA</span>
                            <Navigation size={18} style={{ transform: 'rotate(45deg)' }} />
                        </>
                    ) : `FALTAN ${totalOrders - loadedStops.size} PEDIDOS`}
                </button>
            </div>

            <style jsx>{`
                .stop-card {
                    background: rgba(30, 41, 59, 0.45);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                }
                .stop-card.loaded {
                    background: rgba(5, 150, 105, 0.05);
                    border: 1px solid rgba(5, 150, 105, 0.3);
                }
                .stop-card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
                }
            `}</style>
        </div>
    );
}
