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
  ShieldAlert
} from 'lucide-react';

interface OpsStats {
    totalStockValue: number;
    pendingAudits: number;
}

export default function OpsHome() {
    const [stats, setStats] = useState<OpsStats>({
        totalStockValue: 0,
        pendingAudits: 0
    });

    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        
        async function fetchOpsData() {
            try {
                const { data: stocks } = await supabase.from('inventory_stocks').select('quantity, product_id');
                const { data: products } = await supabase.from('products').select('id, base_price');
                
                if (!isMounted.current) return;

                const value = stocks?.reduce((acc, s) => {
                    const price = products?.find(p => p.id === s.product_id)?.base_price || 0;
                    return acc + (s.quantity * price);
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
                <Link href="/ops/compras" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ShoppingBag size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>COMPRAS</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Abastos y Abastecimiento</div>
                    </div>
                </Link>

                <Link href="/ops/recogida" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ShoppingCart size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>RECOGIDA</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Zorrito / Selección Manual</div>
                    </div>
                </Link>

                <Link href="/ops/recepcion" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <Scale size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>RECEPCIÓN</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Control de Calidad y Pesaje</div>
                    </div>
                </Link>

                <Link href="/ops/recepcion/supervisor" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <ShieldAlert size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>SUPERVISOR</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Autorizaciones y Cuarentena</div>
                    </div>
                </Link>

                <Link href="/ops/picking" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <Package size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>ALISTAMIENTO</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Células de Picking de Pedidos</div>
                    </div>
                </Link>

                <Link href="/ops/driver" style={{ textDecoration: 'none' }}>
                    <div className="card-op card-op-highlight">
                        <div className="op-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--ops-primary)' }}>
                            <Truck size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>DESPACHO</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-primary)', fontWeight: 600 }}>Salida a Ruta de Conductores</div>
                    </div>
                </Link>

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
                            {stats.pendingAudits > 0 ? `⚠️ ${stats.pendingAudits} CONTEO(S) SOLICITADO(S)` : 'Operaciones de Piso'}
                        </div>
                    </div>
                </Link>

                <Link href="/ops/inventory" style={{ textDecoration: 'none' }}>
                    <div className="card-op">
                        <div className="op-icon-wrapper">
                            <RotateCcw size={24} strokeWidth={1.5} />
                        </div>
                        <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: '800', fontSize: '1.1rem', color: 'var(--ops-text)' }}>DEVOLUCIONES</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>Retornos e Inconsistencias de Ruta</div>
                    </div>
                </Link>
            </div>

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
