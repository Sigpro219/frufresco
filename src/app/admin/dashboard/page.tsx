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
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#111827', margin: 0, letterSpacing: '-0.02em' }}>Centro de Comando</h1>
                        <p style={{ color: '#6B7280', fontSize: '1.05rem', marginTop: '0.4rem', fontWeight: '500' }}>Resumen operativo de <strong style={{ color: 'var(--primary)' }}>FruFresco</strong> en tiempo real.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button
                            onClick={fetchDashboardData}
                            style={{ 
                                padding: '0.75rem 1.4rem', 
                                borderRadius: '12px', 
                                backgroundColor: 'white', 
                                border: '1px solid #E5E7EB', 
                                fontWeight: '700', 
                                color: '#374151',
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#F9FAFB'}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                        >
                            🔄 Sincronizar
                        </button>
                    </div>
                </header>

                {/* KPIs Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
                    <KPICard title="Ventas Hoy" value={`$${stats.todaySales.toLocaleString()}`} icon="💰" color="#10B981" />
                    <KPICard title="Pedidos Pendientes" value={stats.pendingOrders.toString()} icon="⏳" color="#F59E0B" />
                    <KPICard title="Leads Nuevos" value={stats.newLeads.toString()} icon="📈" color="#6366F1" />
                    <KPICard title="Ticket Promedio" value={`$${Math.round(stats.avgTicket).toLocaleString()}`} icon="🎟️" color="#4F46E5" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 340px', gap: '2rem', marginBottom: '3rem', alignItems: 'start' }}>
                    {/* COLUMNA 1: OPERACIONES CLAVE */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div style={{ 
                            background: 'linear-gradient(135deg, #4C1D95 0%, #7C3AED 100%)', 
                            borderRadius: '24px', 
                            padding: '2.5rem 2rem', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '1.5rem', 
                            boxShadow: '0 20px 25px -5px rgba(124, 58, 237, 0.2)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <div style={{ position: 'absolute', top: '-10%', right: '-5%', fontSize: '8rem', opacity: 0.1, color: 'white' }}>🛒</div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: 'white', margin: 0 }}>Portal de Compras</h2>
                                <p style={{ fontSize: '0.95rem', color: '#DDD6FE', margin: '0.4rem 0 0 0', fontWeight: '500' }}>Canal exclusivo para Clientes Institucionales</p>
                            </div>
                            <Link href="/b2b/dashboard" style={{ textDecoration: 'none', position: 'relative', zIndex: 1 }}>
                                <button style={{ 
                                    width: '100%', 
                                    padding: '1.1rem', 
                                    borderRadius: '14px', 
                                    backgroundColor: 'white', 
                                    color: '#7C3AED', 
                                    border: 'none', 
                                    fontWeight: '900', 
                                    fontSize: '1rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                    boxShadow: '0 10px 15px rgba(0,0,0,0.1)'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'scale(1.02) translateY(-2px)';
                                    e.currentTarget.style.boxShadow = '0 15px 30px rgba(0,0,0,0.2)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'scale(1) translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 15px rgba(0,0,0,0.1)';
                                }}
                                >
                                    ABRIR PORTAL B2B →
                                </button>
                            </Link>
                        </div>

                        <div style={{ backgroundColor: 'white', borderRadius: '24px', padding: '1.5rem', border: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.03)' }}>
                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ width: '45px', height: '45px', backgroundColor: '#F3F4F6', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🕵️‍♂️</div>
                                <div>
                                    <h2 style={{ fontSize: '1.05rem', fontWeight: '900', color: '#111827', margin: 0 }}>Gobernanza</h2>
                                    <p style={{ fontSize: '0.75rem', color: '#6B7280', margin: 0, fontWeight: '600' }}>Auditoría y Trazabilidad</p>
                                </div>
                            </div>
                            <Link href="/admin/audit" style={{ textDecoration: 'none' }}>
                                <button style={{ 
                                    padding: '0.6rem 1rem', 
                                    borderRadius: '10px', 
                                    backgroundColor: '#111827', 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '800', 
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}>GESTIONAR</button>
                            </Link>
                        </div>
                    </div>

                    {/* COLUMNA 2: GESTIÓN DE MAESTROS */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <AdminCard title="Catálogo Web" href="/admin/products" icon="🛍️" color="white" textColor="#1E3A8A" desc="Precios B2C" />
                        <AdminCard title="Maestro SKU" href="/admin/master/products" icon="🏗️" color="white" textColor="#4F46E5" desc="Definición Técnica" />
                        <AdminCard title="Clientes" href="/admin/clients" icon="👥" color="white" textColor="#475569" desc="CRM Base" />
                        <AdminCard title="Ajustes" href="/admin/settings" icon="⚙️" color="white" textColor="#64748B" desc="Configuración" />
                        
                        {profile?.role === 'admin' && (
                            <Link href="/admin/command-center" style={{ gridColumn: 'span 2', textDecoration: 'none' }}>
                                <div style={{ 
                                    backgroundColor: '#0F172A', 
                                    padding: '1.5rem', 
                                    borderRadius: '20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    border: '1px solid #1E293B',
                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)',
                                    backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)',
                                    backgroundSize: '20px 20px',
                                    transition: 'all 0.3s'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.transform = 'translateY(-3px)';
                                    e.currentTarget.style.borderColor = '#334155';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.borderColor = '#1E293B';
                                }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ fontSize: '2rem' }}>🛰️</div>
                                        <div>
                                            <div style={{ fontWeight: '900', color: '#D4AF37', fontSize: '1rem', letterSpacing: '0.05em' }}>DELTA COMMAND CENTER</div>
                                            <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: '700', textTransform: 'uppercase' }}>Infraestructura & Datos</div>
                                        </div>
                                    </div>
                                    <div style={{ color: '#D4AF37', fontWeight: '900' }}>→</div>
                                </div>
                            </Link>
                        )}
                    </div>

                    {/* COLUMNA 3: RADAR (Fija a la derecha) */}
                    <div style={{ backgroundColor: 'white', borderRadius: '24px', border: '1px solid #E5E7EB', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', height: '100%' }}>
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
        <div style={{ 
            backgroundColor: 'white', 
            padding: '1.5rem', 
            borderRadius: '20px', 
            border: '1px solid #E5E7EB', 
            borderTop: `4px solid ${color}`,
            display: 'flex', 
            alignItems: 'center', 
            gap: '1.2rem', 
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
            transition: 'transform 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
            <div style={{ 
                fontSize: '1.8rem', 
                backgroundColor: `${color}10`, 
                width: '54px', 
                height: '54px', 
                borderRadius: '14px', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: color
            }}>
                {icon}
            </div>
            <div>
                <div style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{title}</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '900', color: '#111827', lineHeight: '1', letterSpacing: '-0.02em' }}>{value}</div>
            </div>
        </div>
    );
}

function AdminCard({ title, href, icon, color, textColor, desc }: { title: string, href: string, icon: string, color: string, textColor: string, desc?: string }) {
    return (
        <Link href={href} style={{ textDecoration: 'none' }}>
            <div style={{
                backgroundColor: color,
                padding: '1.5rem',
                borderRadius: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                border: '1px solid #E5E7EB',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                textAlign: 'center'
            }}
                onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-5px)';
                    e.currentTarget.style.boxShadow = '0 12px 20px rgba(0,0,0,0.06)';
                    e.currentTarget.style.borderColor = textColor + '40';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.02)';
                    e.currentTarget.style.borderColor = '#E5E7EB';
                }}
            >
                <div style={{ fontSize: '2.2rem', marginBottom: '4px' }}>{icon}</div>
                <div>
                    <div style={{ fontWeight: '900', color: '#111827', fontSize: '0.95rem', letterSpacing: '-0.01em' }}>{title}</div>
                    {desc && <div style={{ fontSize: '0.7rem', color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', marginTop: '2px' }}>{desc}</div>}
                </div>
            </div>
        </Link>
    );
}
