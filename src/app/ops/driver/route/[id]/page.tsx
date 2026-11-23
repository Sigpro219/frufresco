'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { isAbortError } from '@/lib/errorUtils';
import { useParams, useRouter } from 'next/navigation';
import { getOrderSpaceDisplayLabel } from '@/lib/stagingSpaceAllocator';
import { fetchActiveShiftClient } from '@/lib/ops/operationalShift';
import { useMobileGpsTracker } from '@/components/telemetry/MobileGpsTracker';
import { ArrowLeft, Package, Check, Navigation, Info, Lock, Zap, ShieldAlert } from 'lucide-react';

interface RouteStop {
    id: string;
    sequence_number: number;
    status: string;
    orders: {
        id: string;
        customer_name: string;
        shipping_address: string;
        warehouse_spaces: number[] | null;
        logistics_data?: Record<string, any> | null;
        crates_count?: number | null;
        order_items: {
            id: string;
            products: { name: string; unit_of_measure: string; accounting_id?: number | string | null };
            quantity: number;
            picked_quantity: number;
            unit?: string | null;
            variant_label?: string | null;
            nickname?: string | null;
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
    const [routeStatus, setRouteStatus] = useState<string>('loading');
    const [routePlate, setRoutePlate] = useState<string>('');
    const [hasHardwareGps, setHasHardwareGps] = useState<boolean>(true);
    const [isCertified, setIsCertified] = useState<boolean>(false);
    const [canBypass, setCanBypass] = useState<boolean>(false);
    const isMounted = useRef(true);

    useMobileGpsTracker({
        plate: routePlate,
        enabled: Boolean(routePlate) && !hasHardwareGps && routeStatus !== 'completed'
    });

    const toggleStop = (id: string) => {
        const stop = stops.find(s => s.id === id);
        if (!stop) return;

        const items = stop.orders?.order_items || [];
        const hasStartedPicking = items.some(item => (item.picked_quantity || 0) > 0);
        const hasPendingItems = items.some(item => (item.picked_quantity || 0) === 0);

        // Si el muelle ya certificó la ruta (incluso por Planilla Papel donde picked_quantity puede ser 0), permitir el cargue
        if (items.length > 0 && !hasStartedPicking && !isCertified && routeStatus !== 'rectified') {
            alert(`ERROR DE CARGUE: El pedido de ${stop.orders?.customer_name} no ha sido alistado en bodega ni certificado en muelle.`);
            return;
        }

        // Warn if partially unpicked (only when not certified by paper sheet)
        if (hasPendingItems && !loadedStops.has(id) && !isCertified && routeStatus !== 'rectified') {
            if (!confirm(`ALERTA: El pedido de ${stop.orders?.customer_name} tiene artículos sin alistar (0 Kg). ¿Confirmas que deseas cargarlo de todas formas?`)) {
                return;
            }
        }

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

            // 1. Fetch Route Header Info
            const { data: routeInfo } = await supabase
                .from('routes')
                .select('id, status, is_certified_complete, vehicle_plate')
                .eq('id', id)
                .maybeSingle();

            if (routeInfo) {
                setRouteStatus(routeInfo.status || 'loading');
                setIsCertified(Boolean(routeInfo.is_certified_complete || routeInfo.status === 'rectified'));
                if (routeInfo.vehicle_plate) {
                    setRoutePlate(routeInfo.vehicle_plate);
                    const { data: fv } = await supabase
                        .from('fleet_vehicles')
                        .select('gps_imei')
                        .ilike('plate', routeInfo.vehicle_plate)
                        .maybeSingle();
                    setHasHardwareGps(Boolean(fv?.gps_imei));
                }
            }

            // 2. Check Sandbox Bypass permissions (Strictly disabled in Production)
            const isSandboxEnv = process.env.NEXT_PUBLIC_SANDBOX_MODE === 'true';
            let isAdmin = false;
            if (isSandboxEnv) {
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session?.user?.id) {
                        const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
                        if (prof?.role === 'admin' || prof?.role === 'sys_admin' || prof?.role === 'logistic_admin') {
                            isAdmin = true;
                        }
                    }
                } catch (_) {}
            }
            setCanBypass(isSandboxEnv && isAdmin);

            // 3. Fetch Route Stops
            const { data, error } = await supabase
                .from('route_stops')
                .select(`
                    id, sequence_number, status,
                    orders:order_id (
                        id, shipping_address, warehouse_spaces, logistics_data, crates_count,
                        profiles:profile_id (
                            id, company_name, contact_name, role
                        ),
                        order_items (
                            id, quantity, picked_quantity, unit, variant_label, nickname,
                            products (name, unit_of_measure, accounting_id)
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

    const handleConfirmLoading = async (isBypass: boolean = false) => {
        if (!isBypass && loadedStops.size < stops.length) {
            alert('Por favor valida todos los pedidos antes de iniciar.');
            return;
        }

        if (!isBypass && !isCertified && routeStatus !== 'rectified') {
            alert('VETO DE DESPACHO: La ruta no ha sido certificada ni precintada en muelle de salida (/ops/rectificacion).');
            return;
        }

        if (isBypass) {
            if (!confirm('MODO PRUEBAS / SANDBOX:\n¿Deseas forzar el inicio de la ruta sin esperar la certificación física en muelle? Esta acción quedará registrada en auditoría.')) {
                return;
            }
        }

        try {
            setSaving(true);

            // Update route status to 'in_transit'
            const updatePayload: Record<string, any> = {
                status: 'in_transit',
                start_time: new Date().toISOString()
            };
            if (isBypass) {
                updatePayload.is_certified_complete = true;
            }

            const { error: routeErr } = await supabase
                .from('routes')
                .update(updatePayload)
                .eq('id', id);
            
            if (routeErr) throw routeErr;

            if (isBypass) {
                try {
                    await supabase.from('audit_logs').insert([{
                        action: 'TEST_MODE_BYPASS_RECTIFICATION',
                        module: 'TRANSPORT',
                        collaborator_name: 'Sandbox Admin',
                        details: {
                            route_id: String(id),
                            notes: 'Inicio de ruta forzado por bypass en modo sandbox'
                        }
                    }]);
                } catch (_) {}
            }

            // Regla Anti-Contagio RED-16 (Escenario 477 §1):
            // Solo en digital_native actualizamos orders.status -> 'shipped' (seguro para planillas manuales; nunca 'in_transit').
            const activeShift = await fetchActiveShiftClient();
            const isMirrorMode = activeShift?.mode === 'manual_mirror';
            const orderIds = stops.map(s => s.orders?.id).filter(Boolean);
            if (!isMirrorMode && orderIds.length > 0) {
                const { error: ordersErr } = await supabase
                    .from('orders')
                    .update({ status: 'shipped' })
                    .in('id', orderIds);
                if (ordersErr) {
                    throw ordersErr;
                }
            }

            router.push(`/ops/driver/route-map/${id}`);
        } catch (err) {
            console.error('Error confirming load:', err);
            (window as any).showToast?.('Error al confirmar cargue', 'error');
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
        <div style={{ padding: '1rem', paddingBottom: '9rem', maxWidth: '600px', margin: '0 auto', minHeight: '100vh', backgroundColor: '#090D16' }}>
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
                
                {!isCertified && routeStatus !== 'rectified' && (
                    <div style={{ 
                        backgroundColor: 'rgba(239, 68, 68, 0.15)', 
                        color: '#FCA5A5', 
                        padding: '0.9rem 1.2rem', 
                        borderRadius: '16px', 
                        fontSize: '0.85rem', 
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        display: 'flex', 
                        gap: '12px', 
                        alignItems: 'center', 
                        marginBottom: '1rem',
                        lineHeight: '1.4'
                    }}>
                        <Lock size={22} style={{ color: '#EF4444', flexShrink: 0 }} />
                        <div>
                            <div style={{ fontWeight: '800', color: '#F87171', marginBottom: '2px' }}>VETO DE DESPACHO EN MUELLE</div>
                            <div style={{ opacity: 0.9 }}>Ruta pendiente de rectificación física y precinto numerado de seguridad (/ops/rectificacion).</div>
                        </div>
                    </div>
                )}

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
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                                        {stop.orders?.warehouse_spaces && stop.orders.warehouse_spaces.length > 0 && (
                                            <div style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '4px',
                                                fontSize: '0.7rem', 
                                                color: '#10B981', 
                                                fontWeight: '800',
                                                backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                                                padding: '2px 8px', 
                                                borderRadius: '6px'
                                            }}>
                                                UBICACIÓN: ESP {getOrderSpaceDisplayLabel(stop.orders) || stop.orders.warehouse_spaces.join(', ')}
                                            </div>
                                        )}
                                        {stop.orders?.crates_count !== undefined && stop.orders.crates_count !== null && (
                                            <div style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '4px',
                                                fontSize: '0.7rem', 
                                                color: '#F59E0B', 
                                                fontWeight: '800',
                                                backgroundColor: 'rgba(245, 158, 11, 0.1)', 
                                                padding: '2px 8px', 
                                                borderRadius: '6px'
                                            }}>
                                                CANASTILLAS: {stop.orders.crates_count}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ backgroundColor: 'rgba(9, 13, 22, 0.4)', borderRadius: '12px', padding: '1rem', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                            <div style={{ fontSize: '0.65rem', color: '#9CA3AF', fontWeight: '800', marginBottom: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mercancía a Cargar</div>
                            {stop.orders?.order_items.map(item => {
                                const variant = item.variant_label || item.nickname || '';
                                const baseTitle = item.products.accounting_id
                                    ? `#${item.products.accounting_id} ${item.products.name}`
                                    : item.products.name;
                                const displayTitle = variant ? `${baseTitle} (${variant})` : baseTitle;
                                const displayUnit = item.unit || item.products.unit_of_measure;
                                return (
                                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                        <span style={{ color: '#E2E8F0' }}>{displayTitle}</span>
                                        <span style={{ fontWeight: '800', color: item.picked_quantity > 0 ? '#059669' : '#9CA3AF' }}>
                                            {item.picked_quantity || 0} / {item.quantity} {displayUnit}
                                        </span>
                                    </div>
                                );
                            })}
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
                {canBypass && (!isCertified && routeStatus !== 'rectified') && (
                    <button 
                        onClick={() => handleConfirmLoading(true)}
                        disabled={saving}
                        style={{ 
                            width: '100%', 
                            padding: '0.75rem', 
                            borderRadius: '12px', 
                            border: '1px dashed #F59E0B', 
                            backgroundColor: 'rgba(245, 158, 11, 0.15)', 
                            color: '#FBBF24', 
                            fontWeight: '800', 
                            fontSize: '0.85rem',
                            marginBottom: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}
                    >
                        <Zap size={16} />
                        <span>FORZAR INICIO DE RUTA (BYPASS MODO PRUEBAS)</span>
                    </button>
                )}

                <button 
                    onClick={() => handleConfirmLoading(false)}
                    disabled={saving || !allLoaded || (!isCertified && routeStatus !== 'rectified')}
                    style={{ 
                        width: '100%', 
                        padding: '1.1rem', 
                        borderRadius: '16px', 
                        border: 'none', 
                        backgroundColor: (!isCertified && routeStatus !== 'rectified')
                            ? 'rgba(239, 68, 68, 0.15)'
                            : allLoaded ? '#059669' : 'rgba(255, 255, 255, 0.05)', 
                        color: (!isCertified && routeStatus !== 'rectified')
                            ? '#FCA5A5'
                            : allLoaded ? 'white' : '#9CA3AF', 
                        fontWeight: '800', 
                        fontSize: '1.05rem',
                        boxShadow: (allLoaded && (isCertified || routeStatus === 'rectified')) ? '0 4px 20px rgba(5, 150, 105, 0.3)' : 'none',
                        transition: 'all 0.3s ease',
                        cursor: (allLoaded && (isCertified || routeStatus === 'rectified')) ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                    }}>
                    {saving ? 'PROCESANDO...' : (!isCertified && routeStatus !== 'rectified') ? (
                        <>
                            <Lock size={18} />
                            <span>BLOQUEADO: ESPERANDO PRECINTO DE RECTIFICACIÓN</span>
                        </>
                    ) : allLoaded ? (
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
