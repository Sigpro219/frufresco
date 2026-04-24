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
    UserSquare2
} from 'lucide-react';
import Link from 'next/link';

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
            icon: <Wallet size={32} />,
            color: '#0891B2',
            link: '/admin/procurement/treasury',
            features: ['Control Bancario', 'Autorización Delta', 'Asignación de Fondos']
        },
        {
            id: 'cash-ops',
            title: 'Caja & Gastos de Contado',
            description: 'Operación central de efectivo: Compra de productos (SKU) y legalización de gastos operativos.',
            icon: <Coins size={32} />,
            color: '#0891B2',
            link: '/admin/procurement/cash',
            features: ['Compra de Producto (SKU)', 'Servicios & Viáticos', 'Conciliación de Caja']
        }
    ];

    return (
        <main style={{ minHeight: '100vh', backgroundColor: '#F8FAFC', fontFamily: 'Outfit, sans-serif', color: '#1E293B' }}>
            
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                
                {/* Header */}
                <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: '900', color: '#0F172A', letterSpacing: '-0.025em', margin: 0 }}>
                            Módulo de <span style={{ color: '#0891B2' }}>Compras 360</span>
                        </h1>
                        <p style={{ color: '#64748B', fontSize: '1.1rem', marginTop: '0.5rem', fontWeight: '500' }}>
                            Control financiero integral, abastecimiento y gestión de tesorería.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <Link href="/admin/procurement/providers" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: '18px', backgroundColor: 'white', 
                                color: '#0F172A', border: '1px solid #E2E8F0', fontWeight: '800', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s',
                                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                            }}>
                                <UserSquare2 size={18} color="#0891B2" /> Maestro de Proveedores
                            </button>
                        </Link>
                        <Link href="/admin/procurement/export" style={{ textDecoration: 'none' }}>
                            <button style={{ 
                                padding: '0.9rem 1.8rem', borderRadius: '18px', backgroundColor: 'white', 
                                color: '#475569', border: '1px solid #E2E8F0', fontWeight: '800', cursor: 'pointer', 
                                display: 'flex', alignItems: 'center', gap: '0.6rem', transition: 'all 0.2s',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                                <FileSpreadsheet size={18} color="#10B981" /> Exportar WorldOffice
                            </button>
                        </Link>
                    </div>
                </header>

                {/* Stats Dashboard */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    {[
                        { label: 'Presupuesto Total', value: '$0.00', icon: '💰', color: '#0F172A' },
                        { label: 'Egresos Hoy', value: '$0.00', icon: '📉', color: '#EF4444' },
                        { label: 'Cajas Activas', value: '3', icon: '🏪', color: '#10B981' },
                        { label: 'Proveedores', value: '124', icon: '🤝', color: '#0891B2' }
                    ].map((stat, i) => (
                        <div key={i} style={{ 
                            backgroundColor: 'white', padding: '1.5rem', borderRadius: '20px', border: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', gap: '1.2rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                        }}>
                            <div style={{ fontSize: '1.8rem', backgroundColor: '#F8FAFC', width: '55px', height: '55px', borderRadius: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {stat.icon}
                            </div>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05rem' }}>{stat.label}</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: '900', color: stat.color }}>{stat.value}</div>
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
                                    backgroundColor: 'white', borderRadius: '28px', padding: '2.5rem', border: '1px solid #E2E8F0',
                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.03)', 
                                    display: 'flex', flexDirection: 'column', height: '100%',
                                    transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                    position: 'relative', overflow: 'hidden', cursor: 'pointer'
                                }}
                                onMouseOver={e => {
                                    e.currentTarget.style.transform = 'translateY(-5px)';
                                    e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0,0,0,0.08)';
                                }}
                                onMouseOut={e => {
                                    e.currentTarget.style.transform = 'translateY(0)';
                                    e.currentTarget.style.boxShadow = '0 10px 25px -5px rgba(0,0,0,0.03)';
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                    <div style={{ 
                                        width: '64px', height: '64px', borderRadius: '18px', 
                                        backgroundColor: '#F0F9FF', color: '#0891B2', 
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {module.icon}
                                    </div>
                                    <ArrowRight size={24} color="#CBD5E1" />
                                </div>
                                
                                <h2 style={{ margin: 0, fontWeight: '900', color: '#0F172A', fontSize: '1.8rem', marginBottom: '0.8rem' }}>{module.title}</h2>
                                <p style={{ color: '#64748B', fontSize: '1.1rem', lineHeight: '1.6', fontWeight: '500', marginBottom: '1.5rem', flex: 1 }}>{module.description}</p>
                                
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', padding: '1.2rem', backgroundColor: '#F8FAFC', borderRadius: '18px' }}>
                                    {module.features.map((f, idx) => (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <ShieldCheck size={14} color="#0891B2" />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569' }}>{f}</span>
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
