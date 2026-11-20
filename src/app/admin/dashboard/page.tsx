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
    ArrowRight,
    Scale,
    Truck
} from 'lucide-react';

const areOptionsMatching = (itemOpts: any, varOpts: any) => {
    if (!itemOpts || !varOpts) return false;
    const varKeys = Object.keys(varOpts);
    if (varKeys.length === 0) return false;
    return varKeys.every(k => {
        const itemKey = Object.keys(itemOpts).find(ik => ik.toLowerCase() === k.toLowerCase());
        if (!itemKey) return false;
        const itemVal = itemOpts[itemKey];
        const varVal = varOpts[k];
        if (itemVal === undefined || varVal === undefined) return false;
        const cleanItemVal = String(itemVal).split('|')[0].toLowerCase().trim();
        const cleanVarVal = String(varVal).split('|')[0].toLowerCase().trim();
        return cleanItemVal === cleanVarVal;
    });
};

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
        todayDispatchTotal: 0,
        todayOrdersCount: 0,
        todayWeightKg: 0,
        pendingApprovalCount: 0,
        unpricedOrdersCount: 0,
        pendingPqrsCount: 0
    });

    const fetchDashboardData = useCallback(async () => {
        const todayBogota = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

        // 1. Despacho Hoy (delivery_date = hoy Bogotá, excluyendo cancelados)
        const { data: ordersToday } = await supabase
            .from('orders')
            .select('total, total_weight_kg')
            .eq('delivery_date', todayBogota)
            .neq('status', 'cancelled');

        const todayDispatchTotal = ordersToday?.reduce((acc: number, curr: { total: number }) => acc + (Number(curr.total) || 0), 0) || 0;
        const todayWeightKg = ordersToday?.reduce((acc: number, curr: { total_weight_kg?: number }) => acc + (Number(curr.total_weight_kg) || 0), 0) || 0;
        const todayOrdersCount = ordersToday?.length || 0;

        // 2. Por Aprobar en Turno (delivery_date >= hoy Bogotá)
        const { count: pendingApprovalCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .in('status', ['draft', 'pending_approval'])
            .gte('delivery_date', todayBogota);

        // 3. Bloqueos Activos: Pedidos en $0 pendientes de tarifa + PQRS pendientes
        const { count: unpricedOrdersCount } = await supabase
            .from('orders')
            .select('*', { count: 'exact', head: true })
            .neq('status', 'cancelled')
            .gte('delivery_date', todayBogota)
            .eq('logistics_data->>off_agreement_priced', 'false');

        const { count: pendingPqrsCount } = await supabase
            .from('customer_service_pqrs')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        setStats({
            todayDispatchTotal,
            todayOrdersCount,
            todayWeightKg,
            pendingApprovalCount: pendingApprovalCount || 0,
            unpricedOrdersCount: unpricedOrdersCount || 0,
            pendingPqrsCount: pendingPqrsCount || 0
        });
    }, []);

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
                    console.log('️ Radar detectó movimiento:', payload.eventType);
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
                        {((profile as any)?.role === 'sys_admin' || (profile as any)?.role === 'admin' || (profile as any)?.email === 'admin@frufresco.com') && (
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

                {/* KPIs Operativos del Turno (SpaceX Raptor 3: 0 grasa histórica) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                    <KPICard 
                        title={`Despacho Hoy (${stats.todayOrdersCount} ped · ${Math.round(stats.todayWeightKg)} kg)`}
                        value={formatMoney(stats.todayDispatchTotal)} 
                        icon={<Coins size={20} strokeWidth={1.5} />} 
                        color={THEME.colors.primary} 
                    />
                    <KPICard 
                        title="Por Aprobar (Turno)" 
                        value={formatNumber(stats.pendingApprovalCount)} 
                        icon={<Clock size={20} strokeWidth={1.5} />} 
                        color={THEME.colors.textSecondary} 
                    />
                    <KPICard 
                        title="Bloqueos Activos ($0 · PQRS)" 
                        value={`${stats.unpricedOrdersCount} en $0 · ${stats.pendingPqrsCount} PQRS`} 
                        icon={<Tag size={20} strokeWidth={1.5} />} 
                        color={(stats.unpricedOrdersCount > 0 || stats.pendingPqrsCount > 0) ? '#DC2626' : THEME.colors.primary} 
                    />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 340px) 1fr', gap: '1.5rem', marginBottom: '2rem', alignItems: 'stretch' }}>
                    {/* COLUMNA 1: PORTAL DE COMPRAS */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
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
 
                    {/* COLUMNA 2: GESTIÓN DE MAESTROS, GOBERNANZA Y AJUSTES (Grid 3x2) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '1rem' }}>
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
                        {hasPermission('admin.dashboard.audit') && (
                            <AdminCard title="Gobernanza" href="/admin/audit" icon={<ShieldCheck size={22} strokeWidth={1.5} />} desc="Auditoría" />
                        )}
                        {hasPermission('admin.dashboard.settings') && (
                            <AdminCard title="Ajustes" href="/admin/settings" icon={<Settings size={22} strokeWidth={1.5} />} desc="Configuración" />
                        )}
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
