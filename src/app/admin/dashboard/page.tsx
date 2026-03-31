'use client';

import { useAuth } from '@/lib/authContext';
import Navbar from '@/components/Navbar';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';

export default function AdminDashboard() {
    const { profile } = useAuth();
    const [stats, setStats] = useState({
        todaySales: 0,
        pendingOrders: 0,
        newLeads: 0,
        avgTicket: 0
    });
    const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

    interface RecentOrder {
        id: string;
        total: number;
        status: string;
        created_at: string;
        sequence_id?: number;
        customer_name?: string;
        profiles?: {
            company_name: string;
        };
    }

    const fetchDashboardData = useCallback(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 1. Hoy: Ventas
        const { data: ordersToday } = await supabase
            .from('orders')
            .select('total')
            .gte('created_at', today.toISOString());

        const todaySales = ordersToday?.reduce((acc: number, curr: { total: number }) => acc + (curr.total || 0), 0) || 0;

        // 2. Pedidos Pendientes
        const { count: pendingOrders } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['draft', 'pending_approval']);

        // 3. Nuevos Leads
        const { count: newLeads } = await supabase
            .from('leads')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'new');

        // 4. Ticket Promedio
        const { data: allOrders } = await supabase
            .from('orders')
            .select('total');

        const avgTicket = allOrders && allOrders.length > 0
            ? allOrders.reduce((acc: number, curr: { total: number }) => acc + (curr.total || 0), 0) / allOrders.length
            : 0;

        setStats({
            todaySales,
            pendingOrders: pendingOrders || 0,
            newLeads: newLeads || 0,
            avgTicket
        });

        // 5. Actividad Reciente (TODOS LOS B2C: Manual y Web)
        const { data: recOrders } = await supabase
            .from('orders')
            .select('id, total, status, created_at, sequence_id, customer_name, profiles(company_name)')
            .in('type', ['b2c', 'b2c_wompi']) // Incluimos ambos subtipos de B2C
            .order('created_at', { ascending: false })
            .limit(5);

        setRecentOrders((recOrders as unknown as RecentOrder[]) || []);
    }, []); // Removed unused profile dependencies to avoid unnecessary re-creation

    // 1. Carga Inicial
    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // 2. Radar en Tiempo Real (Suscripción a órdenes B2C)
    useEffect(() => {
        const channel = supabase
            .channel('dashboard-b2c-radar')
            .on('postgres_changes', 
                { 
                    event: '*', 
                    schema: 'public', 
                    table: 'orders' 
                }, 
                (payload: any) => {
                    console.log('🛍️ Radar detectó movimiento:', payload.eventType);
                    fetchDashboardData(); 
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchDashboardData]);

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F3F4F6' }}>
            <Navbar />

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '3rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', marginBottom: '0.5rem' }}>Centro de Comando</h1>
                        <p style={{ color: '#4B5563', fontSize: '1.1rem' }}>Resumen operativo de Logistics Pro en tiempo real.</p>

                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={fetchDashboardData}
                            style={{ padding: '0.8rem 1.5rem', borderRadius: '12px', backgroundColor: 'white', border: '1px solid #E5E7EB', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            🔄 Sincronizar
                        </button>
                    </div>
                </header>

                {/* KPIs Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                    <KPICard title="Ventas Hoy" value={`$${stats.todaySales.toLocaleString()}`} icon="💰" color="#1E3A8A" />
                    <KPICard title="Órdenes Pendientes" value={stats.pendingOrders.toString()} icon="⏳" color="#334155" />
                    <KPICard title="Nuevos Leads Institucionales" value={stats.newLeads.toString()} icon="📈" color="#475569" />
                    <KPICard title="Ticket Promedio" value={`$${Math.round(stats.avgTicket).toLocaleString()}`} icon="🎟️" color="#1E40AF" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', marginBottom: '3rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {/* Canal de Ventas - Destacado */}
                        <div style={{ backgroundColor: '#F5F3FF', borderRadius: '24px', padding: '2rem', border: '2px solid #DDD6FE', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 10px 15px -3px rgba(124, 58, 237, 0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ fontSize: '2.5rem' }}>🛒</div>
                                <div>
                                    <h2 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#4C1D95', margin: 0 }}>Portal de Compras Institucional</h2>
                                    <p style={{ fontSize: '0.85rem', color: '#6D28D9', margin: 0, fontWeight: '600' }}>Vista Cliente / Toma de Pedidos</p>
                                </div>
                            </div>
                            <Link href="/b2b/dashboard" style={{ textDecoration: 'none' }}>
                                <button style={{ 
                                    width: '100%', 
                                    padding: '1rem', 
                                    borderRadius: '12px', 
                                    backgroundColor: '#7C3AED', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s',
                                    boxShadow: '0 4px 6px -1px rgba(124, 58, 237, 0.4)'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.backgroundColor = '#6D28D9';
                                    e.currentTarget.style.transform = 'translateY(-2px)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.backgroundColor = '#7C3AED';
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                                >
                                    IR AL PORTAL CLIENTES →
                                </button>
                            </Link>
                        </div>

                        {/* Módulo de Auditoría - Nuevo */}
                        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '1.5rem 2rem', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ fontSize: '1.8rem' }}>🕵️‍♂️</div>
                                <div>
                                    <h2 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza y Auditoría</h2>
                                    <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0, fontWeight: '600' }}>Trazabilidad de movimientos</p>
                                </div>
                            </div>
                            <Link href="/admin/audit">
                                <button style={{ 
                                    padding: '0.6rem 1.2rem', 
                                    borderRadius: '10px', 
                                    backgroundColor: '#F3F4F6', 
                                    color: '#4B5563', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}>GESTIONAR</button>
                            </Link>
                        </div>
                    </div>

                    {/* Accesos Rápidos - Gestión */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
                        <AdminCard title="Catálogo Hogar" href="/admin/products" icon="🛍️" color="white" textColor="#1E3A8A" />
                        <AdminCard title="Maestros SKU" href="/admin/master/products" icon="🏗️" color="white" textColor="#4F46E5" />
                        <AdminCard title="Clientes" href="/admin/clients" icon="👥" color="white" textColor="#475569" />
                        <AdminCard title="Ajustes" href="/admin/settings" icon="⚙️" color="white" textColor="#64748B" />
                        {profile?.role === 'admin' && (
                            <div style={{ gridColumn: 'span 2' }}>
                                <AdminCard title="DELTA Command Center" href="/admin/command-center" icon="🛰️" color="#111827" textColor="#D4AF37" />
                            </div>
                        )}
                    </div>

                    {/* Radar de Ventas B2C (Actividad Reciente) */}
                    <div style={{ backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E5E7EB', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#111827', margin: 0 }}>🛍️ Radar de Ventas Hogar</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#10B981', fontWeight: '700' }}>
                                <span className="pulse-dot" style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
                                VIVO
                            </div>
                        </div>
                        <style>{`
                            @keyframes pulse {
                                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                                70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
                                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                            }
                            .pulse-dot {
                                animation: pulse 2s infinite;
                            }
                        `}</style>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {recentOrders.length === 0 && <p style={{ color: '#6B7280', fontSize: '0.9rem' }}>No hay ventas B2C recientes.</p>}
                            {recentOrders.map(order => (
                                <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '1rem', borderBottom: '1px solid #F3F4F6' }}>
                                    <div>
                                        <div style={{ fontWeight: '700', fontSize: '0.95rem' }}>Pedido #{getFriendlyOrderId(order)}</div>
                                         <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                                            {order.profiles?.company_name || order.customer_name || 'Cliente Línea Hogar'} • {new Date(order.created_at).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: '800', color: '#111827' }}>${order.total?.toLocaleString()}</div>
                                        <div style={{
                                            fontSize: '0.65rem',
                                            padding: '2px 8px',
                                            borderRadius: '9999px',
                                            backgroundColor: order.status === 'delivered' ? '#DCFCE7' :
                                                order.status === 'cancelled' ? '#FEE2E2' :
                                                    order.status === 'pending_approval' ? '#FEF3C7' :
                                                        order.status === 'approved' ? '#DBEAFE' :
                                                            order.status === 'dispatched' ? '#E0F2FE' : '#F1F5F9',
                                            color: order.status === 'delivered' ? '#15803D' :
                                                order.status === 'cancelled' ? '#BE123C' :
                                                    order.status === 'pending_approval' ? '#B45309' :
                                                        order.status === 'approved' ? '#1E40AF' :
                                                            order.status === 'dispatched' ? '#0369A1' : '#64748B',
                                            fontWeight: '800',
                                            textTransform: 'uppercase',
                                            display: 'inline-block',
                                            border: '1px solid currentColor',
                                            opacity: 0.9
                                        }}>
                                            {order.status === 'draft' ? 'Borrador' :
                                                order.status === 'pending_approval' ? 'Pendiente' :
                                                    order.status === 'approved' ? 'Aprobado' :
                                                        order.status === 'processing' ? 'Procesando' :
                                                            order.status === 'dispatched' ? 'Despachado' :
                                                                order.status === 'delivered' ? 'Entregado' :
                                                                    order.status === 'cancelled' ? 'Cancelado' : order.status}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

function KPICard({ title, value, icon, color }: { title: string, value: string, icon: string, color: string }) {
    return (
        <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '16px', border: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '2rem', backgroundColor: `${color}15`, width: '48px', height: '48px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.85rem', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' }}>{title}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#111827' }}>{value}</div>
            </div>
        </div>
    );
}

function AdminCard({ title, href, icon, color, textColor }: { title: string, href: string, icon: string, color: string, textColor: string }) {
    return (
        <Link href={href} style={{ textDecoration: 'none' }}>
            <div style={{
                backgroundColor: color,
                padding: '1.5rem',
                borderRadius: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                border: '1px solid rgba(0,0,0,0.05)',
                transition: 'transform 0.2s'
            }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-3px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >
                <div style={{ fontSize: '2rem' }}>{icon}</div>
                <div style={{ fontWeight: '800', color: textColor, fontSize: '1rem' }}>{title}</div>
            </div>
        </Link>
    );
}
