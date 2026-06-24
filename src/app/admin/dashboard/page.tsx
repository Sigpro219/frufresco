'use client';

import { useAuth, checkUserPermission } from '@/lib/authContext';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getFriendlyOrderId } from '@/lib/orderUtils';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';
import { 
    RefreshCw, 
    Coins, 
    Clock, 
    TrendingUp, 
    Tag, 
    ShoppingBag, 
    ShieldCheck, 
    Layers, 
    Users, 
    Store, 
    Settings, 
    Radio, 
    ArrowRight 
} from 'lucide-react';

export default function AdminDashboard() {
    const { profile } = useAuth();
    const [roles, setRoles] = useState<any[]>([]);

    useEffect(() => {
        const fetchRoles = async () => {
            const { data, error } = await supabase
                .from('app_settings')
                .select('key, value')
                .eq('key', 'system_roles')
                .maybeSingle();
            if (!error && data?.value) {
                try {
                    setRoles(JSON.parse(data.value));
                } catch (e) {
                    console.error('Error parsing system_roles in admin dashboard:', e);
                }
            }
        };
        fetchRoles();
    }, []);

    const hasPermission = (permission: string) => {
        return checkUserPermission(profile, permission, roles);
    };

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
            .select(`
                id, total, status, created_at, sequence_id,
                profiles:profile_id(id, company_name, contact_name, role)
            `)
            .in('type', ['b2c', 'b2c_wompi']) // Incluimos ambos subtipos de B2C
            .order('created_at', { ascending: false })
            .limit(5);

        if (recOrders) {
            const mappedOrders = (recOrders as any[]).map(order => {
                const p = order.profiles;
                let name = 'Cliente Línea Hogar';
                if (p) {
                    name = p.role === 'b2b_client' 
                        ? (p.company_name || 'Sin Razón Social') 
                        : (p.contact_name || p.company_name || 'Cliente B2C');
                }
                return {
                    ...order,
                    customer_name: name
                };
            });
            setRecentOrders(mappedOrders as unknown as RecentOrder[]);
        } else {
            setRecentOrders([]);
        }
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
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background }}>
            <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '2rem' }}>
                <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, letterSpacing: '-0.02em' }}>
                            Panel Admin
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '0.95rem', marginTop: '0.25rem', fontWeight: '500' }}>
                            Resumen operativo de <span style={{ color: THEME.colors.primary, fontWeight: '600' }}>FruFresco</span> en tiempo real.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        {profile?.role === 'sys_admin' && (
                            <Link href="/admin/command-center" style={{ textDecoration: 'none' }}>
                                <button
                                    style={{
                                        padding: '0.6rem 1.2rem',
                                        borderRadius: THEME.radius.md,
                                        backgroundColor: THEME.colors.primaryLight,
                                        border: `1px solid ${THEME.colors.primary}20`,
                                        fontWeight: '700',
                                        color: THEME.colors.primary,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '0.85rem',
                                        boxShadow: THEME.shadow.sm,
                                        transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                        e.currentTarget.style.color = 'white';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = THEME.colors.primaryLight;
                                        e.currentTarget.style.color = THEME.colors.primary;
                                    }}
                                >
                                    <Radio size={14} strokeWidth={2} /> Delta Command
                                </button>
                            </Link>
                        )}
                        <button
                            onClick={fetchDashboardData}
                            style={{ 
                                padding: '0.6rem 1.2rem', 
                                borderRadius: THEME.radius.md, 
                                backgroundColor: THEME.colors.surface, 
                                border: `1px solid ${THEME.colors.border}`, 
                                fontWeight: '600', 
                                color: THEME.colors.textMain,
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '6px',
                                fontSize: '0.85rem',
                                boxShadow: THEME.shadow.sm,
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = '#F9FAFB';
                                e.currentTarget.style.borderColor = THEME.colors.borderActive;
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = THEME.colors.surface;
                                e.currentTarget.style.borderColor = THEME.colors.border;
                            }}
                        >
                            <RefreshCw size={14} strokeWidth={1.5} /> Sincronizar
                        </button>
                    </div>
                </header>

                {/* KPIs Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                    <KPICard 
                        title="Ventas Hoy" 
                        value={formatMoney(stats.todaySales)} 
                        icon={<Coins size={20} strokeWidth={1.5} />} 
                        color={THEME.colors.primary} 
                    />
                    <KPICard 
                        title="Pedidos Pendientes" 
                        value={formatNumber(stats.pendingOrders)} 
                        icon={<Clock size={20} strokeWidth={1.5} />} 
                        color={THEME.colors.textSecondary} 
                    />
                    <KPICard 
                        title="Leads Nuevos" 
                        value={formatNumber(stats.newLeads)} 
                        icon={<TrendingUp size={20} strokeWidth={1.5} />} 
                        color={THEME.colors.primary} 
                    />
                    <KPICard 
                        title="Ticket Promedio" 
                        value={formatMoney(stats.avgTicket)} 
                        icon={<Tag size={20} strokeWidth={1.5} />} 
                        color={THEME.colors.textSecondary} 
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr 340px', gap: '1.5rem', marginBottom: '2rem', alignItems: 'start' }}>
                    {/* COLUMNA 1: PORTAL DE COMPRAS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ 
                            background: 'linear-gradient(135deg, #111827 0%, #1E2B25 100%)', // Deep organic slate
                            borderRadius: THEME.radius.lg, 
                            padding: '2rem', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '1.25rem', 
                            boxShadow: THEME.shadow.md,
                            position: 'relative',
                            overflow: 'hidden',
                            border: `1px solid ${THEME.colors.border}`,
                            height: '100%',
                            justifyContent: 'center'
                        }}>
                            <div style={{ position: 'absolute', bottom: '-10px', right: '-10px', opacity: 0.04, color: 'white' }}>
                                <ShoppingBag size={140} strokeWidth={1} />
                            </div>
                            <div style={{ position: 'relative', zIndex: 1 }}>
                                <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: 'white', margin: 0 }}>Portal de Compras</h2>
                                <p style={{ fontSize: '0.85rem', color: '#A3B899', margin: '0.25rem 0 0 0', fontWeight: '500' }}>Canal exclusivo para Clientes Institucionales</p>
                            </div>
                            <Link href="/b2b/dashboard" style={{ textDecoration: 'none', position: 'relative', zIndex: 1 }}>
                                <button style={{ 
                                    width: '100%', 
                                    padding: '0.85rem', 
                                    borderRadius: THEME.radius.md, 
                                    backgroundColor: THEME.colors.primary, 
                                    color: 'white', 
                                    border: 'none', 
                                    fontWeight: '700', 
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease-in-out',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 12px rgba(13, 122, 87, 0.2)'
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.backgroundColor = THEME.colors.primaryHover;
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.backgroundColor = THEME.colors.primary;
                                    e.currentTarget.style.transform = 'translateY(0)';
                                }}
                                >
                                    ABRIR PORTAL B2B <ArrowRight size={16} strokeWidth={1.5} />
                                </button>
                            </Link>
                        </div>
                    </div>
 
                    {/* COLUMNA 2: GESTIÓN DE MAESTROS, GOBERNANZA Y AJUSTES */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        {hasPermission('admin.products.catalog') && (
                            <AdminCard title="Catálogo Web" href="/admin/products" icon={<ShoppingBag size={22} strokeWidth={1.5} />} desc="Precios B2C" />
                        )}
                        {hasPermission('admin.products.master') && (
                            <AdminCard title="Maestro SKU" href="/admin/master/products" icon={<Layers size={22} strokeWidth={1.5} />} desc="Definición Técnica" />
                        )}
                        {hasPermission('admin.clients') && (
                            <AdminCard title="Clientes" href="/admin/clients" icon={<Users size={22} strokeWidth={1.5} />} desc="CRM Base" />
                        )}
                        {hasPermission('admin.procurement.providers') && (
                            <AdminCard title="Proveedores" href="/admin/procurement/providers" icon={<Store size={22} strokeWidth={1.5} />} desc="Maestro Compras" />
                        )}
                        <AdminCard title="Gobernanza" href="/admin/audit" icon={<ShieldCheck size={22} strokeWidth={1.5} />} desc="Auditoría" />
                        {hasPermission('admin.dashboard.settings') && (
                            <AdminCard title="Ajustes" href="/admin/settings" icon={<Settings size={22} strokeWidth={1.5} />} desc="Configuración" />
                        )}
                    </div>
 
                    {/* COLUMNA 3: RADAR (Fija a la derecha) */}
                    <div style={{ 
                        backgroundColor: THEME.colors.surface, 
                        borderRadius: THEME.radius.lg, 
                        border: `1px solid ${THEME.colors.border}`, 
                        padding: '1.25rem', 
                        boxShadow: THEME.shadow.sm, 
                        height: '100%' 
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                            <h2 style={{ fontSize: '1.05rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Radio size={16} strokeWidth={1.5} style={{ color: THEME.colors.primary }} /> Radar de Ventas Hogar
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', color: '#10B981', fontWeight: '700' }}>
                                <span className="pulse-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981', display: 'inline-block' }}></span>
                                VIVO
                            </div>
                        </div>
                        <style>{`
                            @keyframes pulse {
                                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                                70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
                            }
                            .pulse-dot {
                                animation: pulse 2s infinite;
                            }
                        `}</style>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {recentOrders.length === 0 && <p style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem' }}>No hay ventas B2C recientes.</p>}
                            {recentOrders.map(order => (
                                <div key={order.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: `1px solid ${THEME.colors.border}` }}>
                                    <div style={{ minWidth: 0, paddingRight: '0.5rem' }}>
                                        <div style={{ fontWeight: '700', fontSize: '0.85rem', color: THEME.colors.textMain }}>Pedido #{getFriendlyOrderId(order)}</div>
                                         <div style={{ fontSize: '0.75rem', color: THEME.colors.textSecondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {order.profiles?.company_name || order.customer_name || 'Cliente Línea Hogar'} • {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                         </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.9rem' }}>{formatMoney(order.total)}</div>
                                        <div style={{
                                            fontSize: '0.6rem',
                                            padding: '1px 6px',
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

interface KPICardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
}

function KPICard({ title, value, icon, color }: KPICardProps) {
    return (
        <div style={{ 
            backgroundColor: THEME.colors.surface, 
            padding: '1.25rem', 
            borderRadius: THEME.radius.lg, 
            border: `1px solid ${THEME.colors.border}`, 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem', 
            boxShadow: THEME.shadow.sm,
            transition: 'all 0.2s ease',
            minWidth: 0
        }}
        onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = THEME.shadow.lg;
            e.currentTarget.style.borderColor = THEME.colors.borderActive;
        }}
        onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = THEME.shadow.sm;
            e.currentTarget.style.borderColor = THEME.colors.border;
        }}
        >
            <div style={{ 
                fontSize: '1.25rem', 
                backgroundColor: `${color}15`, 
                width: '42px', 
                height: '42px', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: color,
                flexShrink: 0
            }}>
                {icon}
            </div>
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px', whiteSpace: 'nowrap' }}>{title}</div>
                <div style={{ fontSize: '1.35rem', fontWeight: '800', color: THEME.colors.textMain, lineHeight: '1.2', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            </div>
        </div>
    );
}

interface AdminCardProps {
    title: string;
    href: string;
    icon: React.ReactNode;
    desc?: string;
    style?: React.CSSProperties;
}

function AdminCard({ title, href, icon, desc, style }: AdminCardProps) {
    return (
        <Link href={href} style={{ textDecoration: 'none', ...style }}>
            <div style={{
                backgroundColor: THEME.colors.surface,
                padding: '1.25rem',
                borderRadius: THEME.radius.lg,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                border: `1px solid ${THEME.colors.border}`,
                transition: 'all 0.2s ease',
                boxShadow: THEME.shadow.sm,
                textAlign: 'center',
                height: '100%'
            }}
                onMouseEnter={e => {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = THEME.shadow.lg;
                    e.currentTarget.style.borderColor = THEME.colors.primary;
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = THEME.shadow.sm;
                    e.currentTarget.style.borderColor = THEME.colors.border;
                }}
            >
                <div style={{ color: THEME.colors.primary, marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {icon}
                </div>
                <div>
                    <div style={{ fontWeight: '800', color: THEME.colors.textMain, fontSize: '0.9rem', letterSpacing: '-0.01em' }}>{title}</div>
                    {desc && <div style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '600', textTransform: 'uppercase', marginTop: '2px' }}>{desc}</div>}
                </div>
            </div>
        </Link>
    );
}
