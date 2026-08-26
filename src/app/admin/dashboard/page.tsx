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
        todaySales: 0,
        pendingOrders: 0,
        newLeads: 0,
        avgTicket: 0
    });
    const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

    const [salesDistribution, setSalesDistribution] = useState({
        unitsRevenue: 0,
        unitsVolume: 0,
        bulkRevenue: 0,
        bulkVolume: 0
    });
    const [avgLogisticsWeight, setAvgLogisticsWeight] = useState(0);
    const [topVariants, setTopVariants] = useState<any[]>([]);
    const [loadingKPIs, setLoadingKPIs] = useState(true);

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

        // 6. Inteligencia de Ventas KPIs (Este Mes)
        setLoadingKPIs(true);
        try {
            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);

            const { data: monthOrders } = await supabase
                .from('orders')
                .select('id, total, total_weight_kg, created_at')
                .gte('created_at', startOfMonth.toISOString());

            if (monthOrders && monthOrders.length > 0) {
                // Calculate Avg Logistics Weight
                const totalWeight = monthOrders.reduce((acc, curr) => acc + (curr.total_weight_kg || 0), 0);
                setAvgLogisticsWeight(totalWeight / monthOrders.length);

                // Fetch order items
                const orderIds = monthOrders.map(o => o.id);
                const { data: items } = await supabase
                    .from('order_items')
                    .select(`
                        id, order_id, product_id, quantity, unit_price, unit, selected_options,
                        products:product_id(name, base_price)
                    `)
                    .in('order_id', orderIds);

                if (items && items.length > 0) {
                    // Fetch product variants
                    const { data: variantsData } = await supabase
                        .from('product_variants')
                        .select('product_id, sku, options, price_adjustment_percent');

                    let unitsRev = 0;
                    let unitsVol = 0;
                    let bulkRev = 0;
                    let bulkVol = 0;

                    const variantMargins: Record<string, { sku: string; label: string; margin: number; count: number }> = {};

                    items.forEach((item: any) => {
                        const rev = (item.quantity || 0) * (item.unit_price || 0);
                        const vol = item.quantity || 0;
                        const unitLower = (item.unit || '').toLowerCase();

                        // 1. Classification (Units vs Bulk)
                        const isBulk = ['libra', 'libras', 'kg', 'kilo', 'kilos', 'lb', 'lbs'].includes(unitLower);
                        if (isBulk) {
                            bulkRev += rev;
                            bulkVol += vol;
                        } else {
                            unitsRev += rev;
                            unitsVol += vol;
                        }

                        // 2. Variant Margin calculation
                        if (variantsData && variantsData.length > 0 && item.selected_options) {
                            const productVariants = variantsData.filter(v => v.product_id === item.product_id);
                            const matchedVariant = productVariants.find(v => areOptionsMatching(item.selected_options, v.options));

                            if (matchedVariant && matchedVariant.price_adjustment_percent > 0) {
                                const pct = matchedVariant.price_adjustment_percent;
                                const extraMargin = rev * (pct / (100 + pct));
                                const prodName = item.products?.name || 'Producto';
                                
                                // Format readable label for variant
                                const optValues = Object.values(matchedVariant.options)
                                    .map((val: any) => String(val).split('|')[0].charAt(0).toUpperCase() + String(val).split('|')[0].slice(1))
                                    .join(', ');
                                const label = `${prodName} (${optValues || matchedVariant.sku})`;
                                const key = matchedVariant.sku || label;

                                if (!variantMargins[key]) {
                                    variantMargins[key] = {
                                        sku: matchedVariant.sku || 'N/A',
                                        label,
                                        margin: 0,
                                        count: 0
                                    };
                                }
                                variantMargins[key].margin += extraMargin;
                                variantMargins[key].count += vol;
                            }
                        }
                    });

                    setSalesDistribution({
                        unitsRevenue: unitsRev,
                        unitsVolume: unitsVol,
                        bulkRevenue: bulkRev,
                        bulkVolume: bulkVol
                    });

                    // Top 5 Variants
                    const sortedVariants = Object.values(variantMargins)
                        .sort((a, b) => b.margin - a.margin)
                        .slice(0, 5);
                    setTopVariants(sortedVariants);
                } else {
                    setSalesDistribution({
                        unitsRevenue: 0,
                        unitsVolume: 0,
                        bulkRevenue: 0,
                        bulkVolume: 0
                    });
                    setTopVariants([]);
                }
            } else {
                setAvgLogisticsWeight(0);
                setSalesDistribution({
                    unitsRevenue: 0,
                    unitsVolume: 0,
                    bulkRevenue: 0,
                    bulkVolume: 0
                });
                setTopVariants([]);
            }
        } catch (err) {
            console.error('Error fetching Sales Intelligence KPIs:', err);
        } finally {
            setLoadingKPIs(false);
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
                        {(profile?.role === 'sys_admin' || profile?.role === 'admin' || profile?.email === 'admin@frufresco.com' || profile?.is_verified_dev) && (
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

                {/* Inteligencia de Ventas (NUEVO) */}
                <div style={{ marginBottom: '2.5rem' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: THEME.colors.textMain, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', letterSpacing: '-0.02em' }}>
                        <TrendingUp size={20} strokeWidth={2} style={{ color: THEME.colors.primary }} /> Inteligencia de Ventas (Este Mes)
                    </h2>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.5rem' }}>
                        {/* Card 1: Distribución Unidades vs Libras */}
                        <div style={{
                            backgroundColor: THEME.colors.surface,
                            padding: '1.5rem',
                            borderRadius: THEME.radius.lg,
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            minHeight: '220px',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = THEME.shadow.md;
                            e.currentTarget.style.borderColor = THEME.colors.primary;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = THEME.shadow.sm;
                            e.currentTarget.style.borderColor = THEME.colors.border;
                        }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>
                                    Distribución de Presentación
                                </h3>
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Participación</span>
                            </div>
                            
                            {loadingKPIs ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', backgroundColor: '#F3F4F6', animation: 'pulse 1.5s infinite' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flex: 1 }}>
                                    {/* Donut Chart SVG */}
                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <svg width="110" height="110" viewBox="0 0 80 80" style={{ transform: 'rotate(-90deg)' }}>
                                            <circle cx="40" cy="40" r="30" fill="transparent" stroke="#F59E0B" strokeWidth="9" />
                                            <circle cx="40" cy="40" r="30" fill="transparent" stroke={THEME.colors.primary} strokeWidth="9"
                                                strokeDasharray="188.5"
                                                strokeDashoffset={188.5 * (1 - (salesDistribution.unitsRevenue / ((salesDistribution.unitsRevenue + salesDistribution.bulkRevenue) || 1)))}
                                                strokeLinecap="round"
                                                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                                            />
                                        </svg>
                                        <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontSize: '1.1rem', fontWeight: '850', color: THEME.colors.textMain }}>
                                                {((salesDistribution.unitsRevenue / ((salesDistribution.unitsRevenue + salesDistribution.bulkRevenue) || 1)) * 100).toFixed(0)}%
                                            </span>
                                            <span style={{ fontSize: '0.6rem', color: THEME.colors.textSecondary, fontWeight: '700', textTransform: 'uppercase' }}>Unidades</span>
                                        </div>
                                    </div>
                                    
                                    {/* Legends & Details */}
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: THEME.colors.primary }} />
                                                Unidades/Empaque
                                            </div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '850', color: THEME.colors.textMain, marginLeft: '14px' }}>
                                                {formatMoney(salesDistribution.unitsRevenue)}
                                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '500', marginLeft: '6px' }}>
                                                    ({formatNumber(salesDistribution.unitsVolume)} und)
                                                </span>
                                            </div>
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: '700', color: THEME.colors.textMain }}>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#F59E0B' }} />
                                                Granel/Volumen
                                            </div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: '850', color: THEME.colors.textMain, marginLeft: '14px' }}>
                                                {formatMoney(salesDistribution.bulkRevenue)}
                                                <span style={{ fontSize: '0.7rem', color: THEME.colors.textSecondary, fontWeight: '500', marginLeft: '6px' }}>
                                                    ({formatNumber(salesDistribution.bulkVolume)} lb)
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Card 2: Carga Logística Promedio */}
                        <div style={{
                            backgroundColor: THEME.colors.surface,
                            padding: '1.5rem',
                            borderRadius: THEME.radius.lg,
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            minHeight: '220px',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = THEME.shadow.md;
                            e.currentTarget.style.borderColor = THEME.colors.primary;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = THEME.shadow.sm;
                            e.currentTarget.style.borderColor = THEME.colors.border;
                        }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    Despacho Logístico
                                </h3>
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Carga Promedio</span>
                            </div>

                            {loadingKPIs ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', justifyContent: 'center' }}>
                                    <div style={{ height: '24px', width: '60%', backgroundColor: '#F3F4F6', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    <div style={{ height: '40px', width: '100%', backgroundColor: '#F3F4F6', borderRadius: '8px', animation: 'pulse 1.5s infinite' }} />
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1, justifyContent: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                        <span style={{ fontSize: '1.8rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.03em' }}>
                                            {avgLogisticsWeight.toFixed(1)}
                                        </span>
                                        <span style={{ fontSize: '0.95rem', fontWeight: '700', color: THEME.colors.textSecondary }}>kg / pedido</span>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: THEME.colors.textSecondary, margin: 0, fontWeight: '500', lineHeight: '1.3' }}>
                                        Peso promedio despachado en órdenes de clientes durante este mes.
                                    </p>
                                    
                                    {/* Stylized Truck Loading Visualizer */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem', backgroundColor: '#F9FAFB', padding: '0.75rem', borderRadius: THEME.radius.md, border: `1px solid ${THEME.colors.border}` }}>
                                        <Truck size={22} style={{ color: THEME.colors.primary, flexShrink: 0 }} />
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: '4px', textTransform: 'uppercase' }}>
                                                <span>Cubicaje Camión (Cap: 300kg)</span>
                                                <span>{Math.min((avgLogisticsWeight / 300) * 100, 100).toFixed(0)}%</span>
                                            </div>
                                            <div style={{ height: '8px', width: '100%', backgroundColor: '#E5E7EB', borderRadius: '9999px', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%',
                                                    width: `${Math.min((avgLogisticsWeight / 300) * 100, 100)}%`,
                                                    backgroundColor: THEME.colors.primary,
                                                    borderRadius: '9999px',
                                                    transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)'
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Card 3: Top Variantes con Mayor Margen Extra */}
                        <div style={{
                            backgroundColor: THEME.colors.surface,
                            padding: '1.5rem',
                            borderRadius: THEME.radius.lg,
                            border: `1px solid ${THEME.colors.border}`,
                            boxShadow: THEME.shadow.sm,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            minHeight: '220px',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = THEME.shadow.md;
                            e.currentTarget.style.borderColor = THEME.colors.primary;
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = THEME.shadow.sm;
                            e.currentTarget.style.borderColor = THEME.colors.border;
                        }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: '800', color: THEME.colors.textMain, margin: 0 }}>
                                    Top Variantes con Mayor Margen
                                </h3>
                                <span style={{ fontSize: '0.7rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Ajuste %</span>
                            </div>

                            {loadingKPIs ? (
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', justifyContent: 'center' }}>
                                    {[1, 2, 3].map(i => (
                                        <div key={i} style={{ height: '24px', width: '100%', backgroundColor: '#F3F4F6', borderRadius: '4px', animation: 'pulse 1.5s infinite' }} />
                                    ))}
                                </div>
                            ) : topVariants.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: THEME.colors.textSecondary, fontWeight: '500' }}>
                                    No hay variaciones vendidas con margen extra este mes.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, justifyContent: 'center' }}>
                                    {topVariants.map((item, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.35rem 0', borderBottom: idx < topVariants.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                                <span style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: '800',
                                                    width: '18px',
                                                    height: '18px',
                                                    borderRadius: '50%',
                                                    backgroundColor: idx === 0 ? '#FEF3C7' : '#F1F5F9',
                                                    color: idx === 0 ? '#D97706' : '#64748B',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    flexShrink: 0
                                                }}>{idx + 1}</span>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textMain, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {item.label}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.8rem', fontWeight: '850', color: '#10B981', flexShrink: 0 }}>
                                                +{formatMoney(item.margin)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
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
