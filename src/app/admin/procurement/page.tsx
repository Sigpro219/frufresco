'use client';

import { useState, useEffect } from 'react';
import { 
    Wallet, 
    ShoppingCart, 
    Receipt, 
    ArrowRight, 
    TrendingUp, 
    Banknote, 
    Users, 
    Calculator,
    ChevronRight,
    ArrowUpRight,
    ArrowDownLeft,
    Clock,
    FileSpreadsheet,
    ShieldCheck,
    Truck,
    Building2,
    Coins,
    UserSquare2,
    Store,
    Handshake,
    TrendingDown
} from 'lucide-react';
import Link from 'next/link';
import { THEME, formatNumber, formatMoney } from '@/lib/adminTheme';

export default function ProcurementHub() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return null;

    const modules = [
        {
            id: 'treasury',
            title: 'Tesorería & Crédito',
            description: 'Gestión de bancos, presupuestos inteligentes y pagos a proveedores de crédito.',
            icon: <Wallet size={32} strokeWidth={1.5} />,
            color: THEME.colors.primary,
            link: '/admin/procurement/treasury',
            features: ['Control Bancario', 'Autorización Delta', 'Asignación de Fondos']
        },
        {
            id: 'cash-ops',
            title: 'Caja & Gastos de Contado',
            description: 'Operación central de efectivo: Compra de productos (SKU) y legalización de gastos operativos.',
            icon: <Coins size={32} strokeWidth={1.5} />,
            color: THEME.colors.primary,
            link: '/admin/procurement/cash',
            features: ['Compra de Producto (SKU)', 'Servicios & Viáticos', 'Conciliación de Caja']
        }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif', color: THEME.colors.textMain }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: THEME.colors.textMain, letterSpacing: '-0.025em', margin: 0 }}>
                            Módulo de <span style={{ color: THEME.colors.primary }}>Compras 360</span>
                        </h1>
                        <p style={{ color: THEME.colors.textSecondary, fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: '500' }}>
                            Control financiero integral, abastecimiento y gestión de tesorería.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin/procurement/providers" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.surface, 
                                color: THEME.colors.textMain, border: `1px solid ${THEME.colors.border}`, fontWeight: '800', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}>
                                <UserSquare2 size={18} strokeWidth={1.5} color={THEME.colors.primary} /> Maestro de Proveedores
                            </button>
                        </Link>
                        <Link href="/admin/procurement/export" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: THEME.radius.lg, backgroundColor: THEME.colors.surface, 
                                color: THEME.colors.textSecondary, border: `1px solid ${THEME.colors.border}`, fontWeight: '800', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s',
                                boxShadow: THEME.shadow.sm
                            }}>
                                <FileSpreadsheet size={18} strokeWidth={1.5} color={THEME.colors.primary} /> Exportar WorldOffice
                            </button>
                        </Link>
                    </div>
                </header>

                {/* Stats Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {[
                        { label: 'Presupuesto Total', value: formatMoney(0), icon: <Coins size={18} strokeWidth={1.5} />, color: THEME.colors.primary },
                        { label: 'Egresos Hoy', value: formatMoney(0), icon: <TrendingDown size={18} strokeWidth={1.5} />, color: THEME.colors.textSecondary },
                        { label: 'Cajas Activas', value: formatNumber(3), icon: <Store size={18} strokeWidth={1.5} />, color: THEME.colors.primary },
                        { label: 'Proveedores', value: formatNumber(124), icon: <Handshake size={18} strokeWidth={1.5} />, color: THEME.colors.primary }
                    ].map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: THEME.colors.surface, padding: '1.2rem', borderRadius: THEME.radius.lg, border: `1px solid ${THEME.colors.border}`,
                            display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: THEME.shadow.sm,
                            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = THEME.shadow.lg;
                            e.currentTarget.style.borderColor = THEME.colors.borderActive;
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = THEME.shadow.sm;
                            e.currentTarget.style.borderColor = THEME.colors.border;
                        }}
                        >
                            <div style={{ backgroundColor: THEME.colors.primaryLight, width: '44px', height: '44px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: stat.color, flexShrink: 0 }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.65rem', fontWeight: '800', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: '700', color: THEME.colors.textMain }}>{stat.value}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Modules Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem' }}>
                    {modules.map((module) => (
                        <Link key={module.id} href={module.link} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <div 
                                style={{ 
                                    backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, padding: '2rem', border: `1px solid ${THEME.colors.border}`,
                                    boxShadow: THEME.shadow.sm, 
                                    display: 'flex', flexDirection: 'column', height: '100%',
                                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative', overflow: 'hidden', cursor: 'pointer'
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.transform = 'translateY(-1px)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.lg;
                                    e.currentTarget.style.borderColor = THEME.colors.borderActive;
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = THEME.shadow.sm;
                                    e.currentTarget.style.borderColor = THEME.colors.border;
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div style={{ 
                                        width: '64px', height: '64px', borderRadius: '50%', 
                                        backgroundColor: THEME.colors.primaryLight, color: THEME.colors.primary, 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {module.icon}
                                    </div>
                                    <ArrowRight size={20} strokeWidth={1.5} color={THEME.colors.textSecondary} />
                                </div>
                                
                                <h2 style={{ margin: 0, fontWeight: '800', color: THEME.colors.textMain, fontSize: '1.5rem', marginBottom: '0.8rem', letterSpacing: '-0.02em' }}>{module.title}</h2>
                                <p style={{ color: THEME.colors.textSecondary, fontSize: '1rem', lineHeight: '1.6', fontWeight: '500', marginBottom: '1.5rem', flex: 1 }}>{module.description}</p>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', padding: '1rem', backgroundColor: THEME.colors.background, borderRadius: THEME.radius.md }}>
                                    {module.features.map((f, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ShieldCheck size={14} strokeWidth={1.5} color={THEME.colors.primary} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: THEME.colors.textSecondary }}>{f}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

            </div>
        </main>
    );
}
