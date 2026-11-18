'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ShoppingBag, 
  ShoppingCart, 
  Scale, 
  Package, 
  Truck, 
  BarChart3, 
  RotateCcw,
  Activity,
  ArrowRight,
  Server,
  ShieldAlert,
  Monitor,
  ClipboardCheck,
  Layers,
  Lock,
  Unlock,
  Radio
} from 'lucide-react';
import type { OperationalShiftState } from '@/lib/ops/operationalShift';

interface OpsStats {
    totalStockValue: number;
    pendingAudits: number;
}

export default function OpsHome() {
    const [stats, setStats] = useState<OpsStats>({
        totalStockValue: 0,
        pendingAudits: 0
    });
    const [shift, setShift] = useState<OperationalShiftState | null>(null);
    const [staleOrdersCount, setStaleOrdersCount] = useState<number>(0);
    const [shiftBusy, setShiftBusy] = useState<boolean>(false);
    const [shiftFeedback, setShiftFeedback] = useState<string | null>(null);

    const isMounted = useRef(true);

    const loadShiftState = async () => {
        try {
            const res = await fetch('/api/ops/shifts', { cache: 'no-store' });
            const json = await res.json();
            if (isMounted.current && json?.success && json.shift) {
                setShift(json.shift);
                setStaleOrdersCount(Number(json.stale_orders_count || 0));
            }
        } catch (err) {
            console.error('Error cargando estado del turno operativo:', err);
        }
    };

    const handleShiftAction = async (payload: { action: 'set_mode' | 'close_day' | 'reopen_day'; mode?: 'manual_mirror' | 'digital_native' }) => {
        if (!shift || shiftBusy) return;
        setShiftBusy(true);
        setShiftFeedback(null);
        try {
            const res = await fetch('/api/ops/shifts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...payload,
                    shift_date: shift.shift_date
                })
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                setShiftFeedback(json?.error || 'No se pudo actualizar el turno (requiere permisos de coordinación/admin).');
            } else {
                setShift(json.shift);
                setShiftFeedback(
                    payload.action === 'close_day'
                        ? `Cierre ejecutado: ${json.closed_orders ?? 0} pedidos cerrados y ${json.closed_routes ?? 0} rutas completadas.`
                        : payload.action === 'reopen_day'
                        ? 'Turno reabierto correctamente.'
                        : `Modo actualizado a ${json.shift?.mode === 'digital_native' ? 'Digital Nativo' : 'Espejo Manual'}.`
                );
                await loadShiftState();
            }
        } catch {
            setShiftFeedback('Error de red al comunicar con /api/ops/shifts.');
        } finally {
            if (isMounted.current) setShiftBusy(false);
        }
    };

    useEffect(() => {
        isMounted.current = true;
        
        async function fetchOpsData() {
            try {
                const [stocksRes, matrixRes] = await Promise.all([
                    supabase.from('inventory_stocks').select('quantity, product_id'),
                    supabase.from('commercial_cost_matrix').select('product_id, manual_cost').eq('is_active', true)
                ]);
                
                if (!isMounted.current) return;

                const costMap = new Map<string, number>();
                (matrixRes.data || []).forEach((c: any) => {
                    if (c.manual_cost) costMap.set(c.product_id, Number(c.manual_cost));
                });

                const value = stocksRes.data?.reduce((acc: number, s: any) => {
                    const cost = costMap.get(s.product_id) || 0;
                    return acc + (s.quantity * cost);
                }, 0) || 0;

                const { count } = await supabase
                    .from('inventory_random_tasks')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'pending');

                if (!isMounted.current) return;

                setStats({
                    totalStockValue: Math.round(value),
                    pendingAudits: count || 0
                });
            } catch (err: unknown) {
                console.error('Error fetching ops stats:', err);
            }
        }
        fetchOpsData();
        loadShiftState();
        return () => { 
            isMounted.current = false; 
        };
    }, []);

    return (
        <div style={{ padding: '2rem 1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
            <style dangerouslySetInnerHTML={{__html: `
                @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap');

                .card-op {
                    background: var(--ops-surface);
                    border: 1px solid var(--ops-border);
                    border-radius: 20px;
                    padding: 2.2rem 1.5rem;
                    text-align: center;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 0.8rem;
                    transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.015);
                    position: relative;
                }

                .card-op:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 20px 40px rgba(16, 185, 129, 0.08);
                    border-color: var(--ops-primary);
                }

                .card-op-highlight {
                    border: 1px solid rgba(16, 185, 129, 0.4) !important;
                }
                .card-op-highlight:hover {
                    box-shadow: 0 20px 40px rgba(16, 185, 129, 0.15) !important;
                }

                .card-op-warning {
                    border: 1px solid rgba(245, 158, 11, 0.4) !important;
                }
                .card-op-warning:hover {
                    box-shadow: 0 20px 40px rgba(245, 158, 11, 0.12) !important;
                }

                .op-icon-wrapper {
                    width: 56px;
                    height: 56px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(16, 185, 129, 0.05);
                    color: var(--ops-primary);
                    margin-bottom: 0.5rem;
                    transition: transform 0.3s ease;
                }

                .card-op:hover .op-icon-wrapper {
                    transform: scale(1.1) rotate(-3deg);
                }
            `}} />

            <div style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '2.5rem', fontWeight: '900', color: 'var(--ops-text)', margin: '0 0 0.5rem 0', letterSpacing: '-0.02em' }}>
                    Portal <span style={{ color: 'var(--ops-primary)' }}>Operativo</span>
                </h1>
                <p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--ops-text-muted)', fontSize: '1rem', margin: 0 }}>
                    Consola central de administración física, inventario en piso y despacho de rutas.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
                {/* 1. COMPRAS */}
                <Link href="/ops/compras" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ShoppingBag size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>COMPRAS</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Abastos y Abastecimiento</div>
                    </div>
                </Link>

                {/* 2. RECOGIDA */}
                <Link href="/ops/recogida" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ShoppingCart size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>RECOGIDA</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Zorrito / Selección Manual</div>
                    </div>
                </Link>

                {/* 3. RECEPCIÓN */}
                <Link href="/ops/recepcion" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <Scale size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>RECEPCIÓN</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Control de Calidad y Pesaje</div>
                    </div>
                </Link>

                {/* 4. SUPERVISOR */}
                <Link href="/ops/recepcion/supervisor" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ShieldAlert size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>SUPERVISOR</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Autorizaciones y Cuarentena</div>
                    </div>
                </Link>

                {/* 5. ALISTAMIENTO */}
                <Link href="/ops/picking" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <Package size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>ALISTAMIENTO</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Células de Picking de Pedidos</div>
                    </div>
                </Link>

                {/* 6. TABLERO */}
                <Link href="/ops/picking/dashboard" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <Monitor size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>TABLERO</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Monitoreo de Células en Vivo</div>
                    </div>
                </Link>

                {/* 7. RECTIFICACIÓN */}
                <Link href="/ops/rectificacion" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ClipboardCheck size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>RECTIFICACIÓN</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Checker y Validación LIFO</div>
                    </div>
                </Link>

                {/* 8. TRANSPORTE */}
                <Link href="/ops/driver" style={{ textDecoration: 'none' }}>
                    <div className="card-op card-op-highlight">
                        <div className="op-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--ops-primary)' }}>
                            <Truck size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>TRANSPORTE</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-primary)', fontWeight: 600 }}>Salida a Ruta de Conductores</div>
                    </div>
                </Link>

                {/* 9. DEVOLUCIONES */}
                <Link href="/ops/devoluciones" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <RotateCcw size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>DEVOLUCIONES</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Retornos D+1 (Cols O, O2 y Q)</div>
                    </div>
                </Link>

                {/* 10. PROCESADOS */}
                <Link href="/ops/procesados" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <Layers size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>PROCESADOS</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Transformación Padre a Hijo (Cols Q y R)</div>
                    </div>
                </Link>

                {/* 10. CIERRE DE INVENTARIO */}
                <Link href="/ops/inventory" style={{ textDecoration: 'none' }}>
                    <div className={`card-op ${stats.pendingAudits > 0 ? 'card-op-warning' : ''}`}>
                        <div className="op-icon-wrapper" style={{ 
                            background: stats.pendingAudits > 0 ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.05)', 
                            color: stats.pendingAudits > 0 ? '#F59E0B' : 'var(--ops-primary)' 
                        }}>
                            <BarChart3 size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>CIERRE DE INVENTARIO</div>
                        <div style={{ 
                            fontSize: '0.8rem', 
                            color: stats.pendingAudits > 0 ? '#D97706' : 'var(--ops-text-muted)', 
                            fontWeight: stats.pendingAudits > 0 ? 700 : 'normal' 
                        }}>
                            {stats.pendingAudits > 0 ? `${stats.pendingAudits} CONTEO(S) SOLICITADO(S)` : 'Operaciones de Piso'}
                        </div>
                    </div>
                </Link>
            </div>

            {/* CICLO DE VIDA OPERATIVO: MODO ESPEJO / DIGITAL + CIERRE DEL DÍA */}
            {shift && (
                <div style={{
                    marginTop: '2rem',
                    background: 'var(--ops-surface)',
                    padding: '1.5rem',
                    borderRadius: '20px',
                    border: '1px solid var(--ops-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <Radio size={18} color={shift.status === 'closed' ? '#EF4444' : '#10B981'} />
                            <span style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '0.95rem', color: 'var(--ops-text)' }}>
                                Turno Operativo {shift.shift_date}
                            </span>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                padding: '3px 10px',
                                borderRadius: '999px',
                                backgroundColor: shift.status === 'closed' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                color: shift.status === 'closed' ? '#EF4444' : '#10B981',
                                border: `1px solid ${shift.status === 'closed' ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`
                            }}>
                                {shift.status === 'closed' ? 'CERRADO' : 'ABIERTO'}
                            </span>
                            <span style={{
                                fontSize: '0.72rem',
                                fontWeight: '800',
                                padding: '3px 10px',
                                borderRadius: '999px',
                                backgroundColor: shift.mode === 'digital_native' ? 'rgba(59, 130, 246, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                                color: shift.mode === 'digital_native' ? '#3B82F6' : '#F59E0B',
                                border: `1px solid ${shift.mode === 'digital_native' ? 'rgba(59,130,246,0.25)' : 'rgba(245,158,11,0.25)'}`
                            }}>
                                {shift.mode === 'digital_native' ? 'DIGITAL NATIVO' : 'ESPEJO MANUAL'}
                            </span>
                            {staleOrdersCount > 0 && (
                                <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#F59E0B' }}>
                                    {staleOrdersCount} rezagado(s) de días previos
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                            <button
                                disabled={shiftBusy}
                                onClick={() => handleShiftAction({
                                    action: 'set_mode',
                                    mode: shift.mode === 'manual_mirror' ? 'digital_native' : 'manual_mirror'
                                })}
                                style={{
                                    padding: '0.55rem 0.9rem',
                                    borderRadius: '10px',
                                    border: '1px solid var(--ops-border)',
                                    backgroundColor: 'var(--ops-bg)',
                                    color: 'var(--ops-text)',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    cursor: shiftBusy ? 'wait' : 'pointer'
                                }}
                            >
                                Cambiar a {shift.mode === 'manual_mirror' ? 'Digital Nativo' : 'Espejo Manual'}
                            </button>

                            {shift.status === 'closed' ? (
                                <button
                                    disabled={shiftBusy}
                                    onClick={() => handleShiftAction({ action: 'reopen_day' })}
                                    style={{
                                        padding: '0.55rem 1rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        backgroundColor: '#10B981',
                                        color: '#FFFFFF',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        cursor: shiftBusy ? 'wait' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Unlock size={14} /> Reabrir Turno
                                </button>
                            ) : (
                                <button
                                    disabled={shiftBusy}
                                    onClick={() => handleShiftAction({ action: 'close_day' })}
                                    style={{
                                        padding: '0.55rem 1rem',
                                        borderRadius: '10px',
                                        border: 'none',
                                        backgroundColor: '#0F172A',
                                        color: '#FFFFFF',
                                        fontSize: '0.78rem',
                                        fontWeight: '800',
                                        cursor: shiftBusy ? 'wait' : 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <Lock size={14} /> Cerrar Operación del Día
                                </button>
                            )}
                        </div>
                    </div>
                    {shiftFeedback && (
                        <div style={{ fontSize: '0.78rem', fontWeight: '700', color: 'var(--ops-primary)' }}>
                            {shiftFeedback}
                        </div>
                    )}
                </div>
            )}

            {/* CONNECTED INVENTORY STATUS */}
            <div style={{ 
                marginTop: '3.5rem', 
                background: 'var(--ops-surface)', 
                padding: '2.5rem 2rem', 
                borderRadius: '24px', 
                border: '1px solid var(--ops-border)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1.5rem',
                boxShadow: '0 20px 40px rgba(0, 0, 0, 0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--ops-primary)', display: 'inline-block' }}></div>
                        <h3 style={{ margin: 0, fontSize: '0.75rem', fontWeight: '800', color: 'var(--ops-primary)', textTransform: 'uppercase', letterSpacing: '0.15em' }}>
                            Estado de Bodega y Stock
                        </h3>
                    </div>
                    <div style={{ 
                        fontSize: '0.8rem', 
                        fontWeight: '700', 
                        color: 'var(--ops-primary)', 
                        backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                        padding: '6px 12px', 
                        borderRadius: '10px',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        fontFamily: 'monospace'
                    }}>
                        Valor Inventario: ${stats.totalStockValue.toLocaleString()}
                    </div>
                </div>
                
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '1.25rem', 
                    backgroundColor: 'var(--ops-bg)', 
                    padding: '1.25rem 1.5rem', 
                    borderRadius: '16px',
                    border: '1px solid var(--ops-border)',
                    flexWrap: 'wrap'
                }}>
                    <div style={{ 
                        color: stats.pendingAudits > 0 ? '#F59E0B' : 'var(--ops-primary)', 
                        background: stats.pendingAudits > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        {stats.pendingAudits > 0 ? <Activity size={24} /> : <Server size={24} />}
                    </div>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--ops-text)', marginBottom: '0.25rem' }}>
                            {stats.pendingAudits > 0 ? 'Auditoría a Ciegas Solicitada' : 'Sistema de Stock Sincronizado'}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)', lineHeight: '1.5' }}>
                            {stats.pendingAudits > 0 
                                ? `Se requiere auditoría de piso para ${stats.pendingAudits} conteo(s) pendiente(s) solicitado(s) por compras.` 
                                : 'Todos los flujos están funcionando normalmente. No hay auditorías pendientes.'}
                        </div>
                    </div>
                    {stats.pendingAudits > 0 && (
                        <Link href="/ops/inventory" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.75rem 1.25rem', 
                                borderRadius: '12px', 
                                background: 'var(--ops-text)', 
                                color: 'var(--ops-surface)', 
                                border: 'none', 
                                fontWeight: '700', 
                                fontSize: '0.8rem', 
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s'
                            }}>
                                RESOLVER AHORA <ArrowRight size={16} />
                            </button>
                        </Link>
                    )}
                </div>
            </div>
            
            <div style={{ marginTop: '3rem', textAlign: 'center' }}>
                <Link href="/admin/dashboard" style={{ color: 'var(--ops-text-muted)', textDecoration: 'none', fontSize: '0.85rem', fontWeight: '600', transition: 'color 0.2s' }}>
                    ← Volver a Administración Central
                </Link>
            </div>
        </div>
    );
}
