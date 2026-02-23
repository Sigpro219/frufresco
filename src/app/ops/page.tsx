'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

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
        <div style={{ padding: '2rem 1rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '900', marginBottom: '0.5rem' }}>Portal <span style={{ color: '#10B981' }}>Operativo</span></h1>
            <p style={{ color: 'var(--ops-text-muted)', marginBottom: '2rem' }}>Bienvenido al sistema de administración de Logistics Pro.</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <Link href="/ops/compras" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛍️</div>
                        <div style={{ fontWeight: '800' }}>COMPRAS</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '0.5rem' }}>Abastos</div>
                    </div>
                </Link>

                <Link href="/ops/recogida" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛒</div>
                        <div style={{ fontWeight: '800' }}>RECOGIDA</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '0.5rem' }}>Zorrito / Manual</div>
                    </div>
                </Link>

                <Link href="/ops/recepcion" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚖️</div>
                        <div style={{ fontWeight: '800' }}>RECEPCIÓN</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '0.5rem' }}>Control y Pesaje</div>
                    </div>
                </Link>

                <Link href="/ops/picking" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📦</div>
                        <div style={{ fontWeight: '800' }}>ALISTAMIENTO</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '0.5rem' }}>Capitán de Célula</div>
                    </div>
                </Link>

                <Link href="/ops/driver" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem', border: '2px solid var(--ops-primary)' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🚚</div>
                        <div style={{ fontWeight: '800' }}>DESPACHO</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ops-primary)', marginTop: '0.5rem' }}>Salida a Ruta</div>
                    </div>
                </Link>

                <Link href="/ops/inventory" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem', border: stats.pendingAudits > 0 ? '2px solid #F59E0B' : undefined }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📊</div>
                        <div style={{ fontWeight: '800' }}>CIERRE DE INVENTARIO</div>
                        <div style={{ fontSize: '0.7rem', color: stats.pendingAudits > 0 ? '#B45309' : 'var(--ops-text-muted)', marginTop: '0.5rem', fontWeight: stats.pendingAudits > 0 ? '700' : 'normal' }}>
                            {stats.pendingAudits > 0 ? `⚠️ ${stats.pendingAudits} AUDITORÍA(S)` : 'Operaciones de Piso'}
                        </div>
                    </div>
                </Link>

                <Link href="/ops/inventory" style={{ textDecoration: 'none' }}>
                    <div className="card-op" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📥</div>
                        <div style={{ fontWeight: '800' }}>DEVOLUCIONES</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--ops-text-muted)', marginTop: '0.5rem' }}>Retornos de Ruta</div>
                    </div>
                </Link>
            </div>

            {/* CONNECTED INVENTORY STATUS */}
            <div style={{ marginTop: '3rem', backgroundColor: '#F0F9FF', padding: '2rem', borderRadius: '24px', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '0.8rem', fontWeight: '900', color: '#0369A1', textTransform: 'uppercase', letterSpacing: '1px' }}>🏢 Estado de Bodega</h3>
                    <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#0EA5E9', backgroundColor: 'white', padding: '4px 8px', borderRadius: '8px' }}>Valor: ${stats.totalStockValue.toLocaleString()}</div>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'white', padding: '1rem', borderRadius: '16px' }}>
                    <div style={{ fontSize: '1.8rem' }}>🎲</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#1E293B' }}>{stats.pendingAudits > 0 ? 'Auditoría a Ciegas Pendiente' : 'Inventario Sincronizado'}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {stats.pendingAudits > 0 
                                ? `El área comercial ha solicitado ${stats.pendingAudits} conteo(s).` 
                                : 'No hay solicitudes de auditoría pendientes por completar.'}
                        </div>
                    </div>
                    {stats.pendingAudits > 0 && (
                        <Link href="/ops/inventory">
                            <button style={{ padding: '0.6rem 1rem', borderRadius: '10px', background: '#0F172A', color: 'white', border: 'none', fontWeight: '800', fontSize: '0.75rem', cursor: 'pointer' }}>IR AHORA</button>
                        </Link>
                    )}
                </div>
            </div>
            
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                <Link href="/admin/dashboard" style={{ color: 'var(--ops-text-muted)', textDecoration: 'none', fontSize: '0.8rem', fontWeight: '700' }}>← Volver a Administración Central</Link>
            </div>
        </div>
    );
}
