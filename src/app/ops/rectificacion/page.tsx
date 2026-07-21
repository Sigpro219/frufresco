'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { 
  ClipboardCheck, 
  Truck, 
  CheckCircle2, 
  Search, 
  ChevronRight,
  Layers
} from 'lucide-react';

interface RouteItem {
    id: string;
    vehicle_plate: string;
    driver_name?: string;
    status: 'ready_for_rectification' | 'rectifying' | 'rectified' | 'in_transit' | 'completed' | string;
    total_orders: number;
    validated_orders?: number;
    total_kilos: number;
    created_at: string;
    check_mode?: 'digital' | 'paper';
    evidence_url?: string;
}

export default function RectificacionListPage() {
    const [routes, setRoutes] = useState<RouteItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<'all' | 'pending' | 'completed'>('all');

    useEffect(() => {
        fetchRoutes();
    }, []);

    const fetchRoutes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('routes')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data && data.length > 0) {
                const formatted = data.map((r: any) => ({
                    id: r.id,
                    vehicle_plate: r.vehicle_plate || 'SIN PLACA',
                    driver_name: r.driver_name || 'Conductor Asignado',
                    status: r.status || 'ready_for_rectification',
                    total_orders: r.total_orders || 12,
                    validated_orders: r.validated_orders || 0,
                    total_kilos: r.total_kilos || 450,
                    created_at: r.created_at,
                    evidence_url: r.check_evidence_url
                }));
                setRoutes(formatted);
            } else {
                // Mock Routes for Demo Mode
                setRoutes([
                    {
                        id: 'route-nhp287',
                        vehicle_plate: 'NHP287',
                        driver_name: 'GARCIA HENRY',
                        status: 'ready_for_rectification',
                        total_orders: 25,
                        validated_orders: 0,
                        total_kilos: 680,
                        created_at: new Date().toISOString()
                    },
                    {
                        id: 'route-pmw071',
                        vehicle_plate: 'PMW071',
                        driver_name: 'ALARCÓN JORGE',
                        status: 'rectifying',
                        total_orders: 18,
                        validated_orders: 12,
                        total_kilos: 520,
                        created_at: new Date(Date.now() - 3600000).toISOString()
                    },
                    {
                        id: 'route-tzx412',
                        vehicle_plate: 'TZX412',
                        driver_name: 'RODRIGUEZ CARLOS',
                        status: 'rectified',
                        total_orders: 30,
                        validated_orders: 30,
                        total_kilos: 910,
                        created_at: new Date(Date.now() - 7200000).toISOString()
                    }
                ]);
            }
        } catch (e) {
            console.error('Error fetching rectification routes:', e);
        } finally {
            setLoading(false);
        }
    };

    const filteredRoutes = routes.filter(r => {
        const matchesSearch = r.vehicle_plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (r.driver_name && r.driver_name.toLowerCase().includes(searchQuery.toLowerCase()));
        if (!matchesSearch) return false;
        if (activeFilter === 'pending') return r.status !== 'rectified' && r.status !== 'completed';
        if (activeFilter === 'completed') return r.status === 'rectified' || r.status === 'completed';
        return true;
    });

    const stats = {
        total: routes.length,
        ready: routes.filter(r => r.status === 'ready_for_rectification' || r.status === 'rectifying').length,
        completed: routes.filter(r => r.status === 'rectified' || r.status === 'completed').length
    };

    return (
        <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Encabezado Principal */}
            <div style={{ 
                backgroundColor: 'var(--ops-surface)', 
                padding: '1.25rem', 
                borderRadius: '20px', 
                border: '1px solid var(--ops-border)',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--ops-primary)', fontWeight: '800', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                        <ClipboardCheck size={18} />
                        MÓDULO CHECKER DE BODEGA
                    </div>
                    <h1 style={{ margin: '0.2rem 0 0 0', fontSize: '1.6rem', fontWeight: '900', color: 'var(--ops-text)', letterSpacing: '-0.02em' }}>
                        Rectificación de Cargue
                    </h1>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--ops-text-muted)' }}>
                        Verificación previa al despacho. Ordenamiento LIFO y doble modalidad de conteo (App / Planilla Física).
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ padding: '0.6rem 1rem', backgroundColor: 'var(--ops-bg)', borderRadius: '14px', border: '1px solid var(--ops-border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--ops-text-muted)', letterSpacing: '0.05em' }}>CAMIONES</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--ops-text)' }}>{stats.total}</div>
                    </div>
                    <div style={{ padding: '0.6rem 1rem', backgroundColor: 'rgba(245, 158, 11, 0.1)', borderRadius: '14px', border: '1px solid rgba(245, 158, 11, 0.3)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#F59E0B', letterSpacing: '0.05em' }}>POR RECTIFICAR</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#F59E0B' }}>{stats.ready}</div>
                    </div>
                    <div style={{ padding: '0.6rem 1rem', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderRadius: '14px', border: '1px solid rgba(16, 185, 129, 0.3)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: '800', color: '#10B981', letterSpacing: '0.05em' }}>DESPACHADOS</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '900', color: '#10B981' }}>{stats.completed}</div>
                    </div>
                </div>
            </div>

            {/* Barra de Filtros y Búsqueda */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--ops-text-muted)' }} />
                    <input 
                        type="text" 
                        placeholder="Buscar por Placa o Conductor..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.65rem 0.75rem 0.65rem 2.4rem',
                            borderRadius: '12px',
                            border: '1px solid var(--ops-border)',
                            backgroundColor: 'var(--ops-surface)',
                            color: 'var(--ops-text)',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            outline: 'none'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', backgroundColor: 'var(--ops-surface)', padding: '4px', borderRadius: '12px', border: '1px solid var(--ops-border)' }}>
                    <button
                        onClick={() => setActiveFilter('all')}
                        style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeFilter === 'all' ? 'var(--ops-primary)' : 'transparent',
                            color: activeFilter === 'all' ? 'white' : 'var(--ops-text-muted)',
                            fontWeight: '800',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Todos ({routes.length})
                    </button>
                    <button
                        onClick={() => setActiveFilter('pending')}
                        style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeFilter === 'pending' ? '#F59E0B' : 'transparent',
                            color: activeFilter === 'pending' ? 'white' : 'var(--ops-text-muted)',
                            fontWeight: '800',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Pendientes ({stats.ready})
                    </button>
                    <button
                        onClick={() => setActiveFilter('completed')}
                        style={{
                            padding: '0.4rem 0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: activeFilter === 'completed' ? '#10B981' : 'transparent',
                            color: activeFilter === 'completed' ? 'white' : 'var(--ops-text-muted)',
                            fontWeight: '800',
                            fontSize: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        Completados ({stats.completed})
                    </button>
                </div>
            </div>

            {/* Lista de Tarjetas de Camiones */}
            {loading ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ops-text-muted)' }}>
                    Cargando rutas para rectificación...
                </div>
            ) : filteredRoutes.length === 0 ? (
                <div style={{ 
                    padding: '3rem', 
                    textAlign: 'center', 
                    backgroundColor: 'var(--ops-surface)', 
                    borderRadius: '20px', 
                    border: '1px solid var(--ops-border)',
                    color: 'var(--ops-text-muted)' 
                }}>
                    <Truck size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                    <p style={{ margin: 0, fontWeight: '700' }}>No hay camiones pendientes en esta sección.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                    {filteredRoutes.map(route => {
                        const isCompleted = route.status === 'rectified' || route.status === 'completed';
                        const isRectifying = route.status === 'rectifying';
                        const pct = route.total_orders > 0 ? Math.round(((route.validated_orders || 0) / route.total_orders) * 100) : 0;

                        return (
                            <div 
                                key={route.id}
                                style={{
                                    backgroundColor: 'var(--ops-surface)',
                                    borderRadius: '20px',
                                    border: `1px solid ${isCompleted ? '#10B981' : isRectifying ? '#F59E0B' : 'var(--ops-border)'}`,
                                    padding: '1.25rem',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                                    position: 'relative',
                                    overflow: 'hidden'
                                }}
                            >
                                <div>
                                    {/* Badges superiores */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Truck size={18} color="var(--ops-primary)" />
                                            <span style={{ fontSize: '1.2rem', fontWeight: '900', color: 'var(--ops-text)', letterSpacing: '0.02em' }}>
                                                {route.vehicle_plate}
                                            </span>
                                        </div>
                                        <span style={{
                                            fontSize: '0.65rem',
                                            fontWeight: '900',
                                            padding: '4px 8px',
                                            borderRadius: '8px',
                                            backgroundColor: isCompleted ? 'rgba(16, 185, 129, 0.15)' : isRectifying ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                            color: isCompleted ? '#10B981' : isRectifying ? '#F59E0B' : '#6366F1',
                                            border: `1px solid ${isCompleted ? 'rgba(16, 185, 129, 0.3)' : isRectifying ? 'rgba(245, 158, 11, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                                            letterSpacing: '0.05em'
                                        }}>
                                            {isCompleted ? 'DESPACHADO' : isRectifying ? 'EN RECTIFICACIÓN' : 'LISTO PARA RECTIFICAR'}
                                        </span>
                                    </div>

                                    {/* Nombre de Conductor e Info */}
                                    <div style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--ops-text-muted)', marginBottom: '1rem' }}>
                                        👤 {route.driver_name}
                                    </div>

                                    {/* Metadatos */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', backgroundColor: 'var(--ops-bg)', padding: '0.75rem', borderRadius: '12px' }}>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>TOTAL PEDIDOS</div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: 'var(--ops-text)' }}>{route.total_orders} Pedidos</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.65rem', fontWeight: '800', color: 'var(--ops-text-muted)' }}>PESO TOTAL</div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '900', color: 'var(--ops-text)' }}>{route.total_kilos} Kg</div>
                                        </div>
                                    </div>

                                    {/* Barra de Progreso LIFO */}
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: '800', marginBottom: '4px' }}>
                                            <span style={{ color: 'var(--ops-text-muted)' }}>Progreso de Cargue:</span>
                                            <span style={{ color: isCompleted ? '#10B981' : 'var(--ops-primary)' }}>
                                                {route.validated_orders || 0} / {route.total_orders} ({pct}%)
                                            </span>
                                        </div>
                                        <div style={{ height: '8px', width: '100%', backgroundColor: 'var(--ops-border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, backgroundColor: isCompleted ? '#10B981' : 'var(--ops-primary)', borderRadius: '4px', transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Botón de Acción Principal */}
                                <div>
                                    <Link href={`/ops/rectificacion/${route.id}`} style={{ textDecoration: 'none' }}>
                                        <button
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                borderRadius: '12px',
                                                border: 'none',
                                                backgroundColor: isCompleted ? 'rgba(16, 185, 129, 0.15)' : 'var(--ops-primary)',
                                                color: isCompleted ? '#10B981' : 'white',
                                                fontWeight: '800',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                boxShadow: isCompleted ? 'none' : '0 4px 12px rgba(16, 185, 129, 0.25)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {isCompleted ? (
                                                <>
                                                    <CheckCircle2 size={16} /> VER VALIDACIÓN COMPLETA
                                                </>
                                            ) : (
                                                <>
                                                    <Layers size={16} /> RECTIFICAR CARGUE (LIFO) <ChevronRight size={16} />
                                                </>
                                            )}
                                        </button>
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
