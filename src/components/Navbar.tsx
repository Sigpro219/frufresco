'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCart } from '../lib/cartContext';
import { useAuth } from '../lib/authContext';

import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/errorUtils';

export default function Navbar() {
    const { totalItems } = useCart();
    const { user, profile, signOut, loading } = useAuth();
    const [b2bEnabled, setB2bEnabled] = useState(false);
    const [operationsOpen, setOperationsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let isMounted = true;
        
        // Chequear configuración al montar
        const checkSettings = async () => {
            try {
                const { data, error } = await supabase
                    .from('app_settings')
                    .select('value')
                    .eq('key', 'enable_b2b_lead_capture')
                    .single();
                    
                if (!isMounted) return;
                
                if (error) {
                    throw error;
                }
                if (data) {
                    setB2bEnabled(data.value === 'true');
                }
            } catch (err: unknown) {
                if (!isMounted) return;
                logError('Navbar checkSettings', err);
            }
        };
        
        checkSettings();

        return () => {
            isMounted = false;
        };
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOperationsOpen(false);
            }
        };

        if (operationsOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [operationsOpen]);

    return (
        <header style={{
            backgroundColor: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
            position: 'sticky',
            top: 0,
            zIndex: 100
        }}>
            <div className="container" style={{
                height: '80px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                {/* LOGO */}
                <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: '900', color: 'var(--primary)' }}>Logistics <span style={{ color: '#111827' }}>Pro</span></span>
                </Link>

                {/* NAV LINKS */}
                <nav style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
                    {/* B2C (Sin login) o Usuario Genérico */}
                    {!user && (
                        <>
                            <Link href="/" style={{ fontWeight: '500' }}>Inicio</Link>
                            <Link href="/#catalog" style={{ fontWeight: '500' }}>Catálogo</Link>
                            {b2bEnabled && (
                                <Link href="/b2b/register" style={{ fontWeight: '500', color: 'var(--secondary)' }}>Línea Institucional</Link>
                            )}
                        </>
                    )}

                    {/* B2B Cliente */}
                    {user && profile?.role === 'b2b_client' && (
                        <>
                            <Link href="/b2b/dashboard" style={{ fontWeight: '600', color: 'var(--primary)' }}>Mi Portal</Link>
                            <Link href="/b2b/orders" style={{ fontWeight: '500' }}>Mis Pedidos</Link>
                            <Link href="/b2b/catalog" style={{ fontWeight: '500' }}>Catálogo B2B</Link>
                        </>
                    )}

                    {/* Empleado FruFresco (Admin/Employee) */}
                    {user && (profile?.role === 'admin' || profile?.role === 'employee') && (
                        <>
                            <Link href="/" style={{ fontWeight: '500' }}>🏠 Inicio</Link>
                            <Link href="/admin/dashboard" style={{ fontWeight: '600', color: 'var(--primary)' }}>⚙️ Admin</Link>
                            
                            {/* Dropdown Operaciones */}
                            <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
                                <span 
                                    onClick={() => setOperationsOpen(!operationsOpen)}
                                    style={{ 
                                        fontWeight: '600', 
                                        color: '#334155', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '4px',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        backgroundColor: operationsOpen ? '#F1F5F9' : 'transparent',
                                        transition: 'background-color 0.2s'
                                    }}
                                >
                                    📦 Operaciones {operationsOpen ? '▴' : '▾'}
                                </span>
                                {operationsOpen && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        marginTop: '4px',
                                        backgroundColor: 'white',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                        minWidth: '200px',
                                        zIndex: 1000,
                                        padding: '8px 0'
                                    }}>
                                        <Link href="/admin/orders/loading" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#0891B2', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            📋 Pedidos
                                        </Link>
                                        <Link href="/admin/transport" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#EA580C', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            🚛 Transporte
                                        </Link>
                                        <Link href="/admin/commercial/billing" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#6366F1', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            💰 Facturación
                                        </Link>
                                        <Link href="/admin/commercial"
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#059669', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            💼 Comercial
                                        </Link>
                                        <Link href="/admin/hr"
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#8B5CF6', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            👥 Talento Humano
                                        </Link>
                                        <Link href="/admin/commercial/inventory"
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#0369A1', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            📦 Control de Inventarios
                                        </Link>
                                        <Link href="/ops/picking/dashboard" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#D97706', 
                                                fontWeight: '600',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            🚚 Despachos
                                        </Link>
                                        <Link href="/admin/strategy" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#7C3AED', 
                                                fontWeight: '900',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s',
                                                borderTop: '1px solid #F3F4F6'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F3F4F6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            🧠 Inteligencia & Estrategia
                                        </Link>

                                        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }}></div>
                                        <div style={{ padding: '4px 16px', fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Segmentos y Canales</div>
                                        <Link href="/admin/clients" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#334155', 
                                                fontWeight: '700',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#F1F5F9'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            👥 Gestión de Clientes
                                        </Link>
                                        <Link href="/b2b/dashboard" 
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#7C3AED', 
                                                fontWeight: '900',
                                                textDecoration: 'none',
                                                backgroundColor: '#F5F3FF',
                                                transition: 'background-color 0.2s',
                                                margin: '4px 8px',
                                                borderRadius: '6px'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#EDE9FE'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#F5F3FF'}>
                                            🛒 Portal Compras B2B
                                        </Link>
                                        <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }}></div>
                                        <Link href="/ops"
                                            onClick={() => setOperationsOpen(false)}
                                            style={{ 
                                                display: 'block', 
                                                padding: '10px 16px', 
                                                color: '#10B981', 
                                                fontWeight: '800',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.2s'
                                            }} 
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ECFDF5'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                            🚀 Portal Operativo
                                        </Link>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </nav>

                {/* ACTIONS */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <Link href="/checkout">
                        <button className="btn" style={{ border: '1px solid var(--border)', backgroundColor: 'transparent' }}>
                            🛒 <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>{totalItems}</span>
                        </button>
                    </Link>

                    {!loading && (
                        user ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                                    {profile?.company_name || user.email?.split('@')[0]}
                                </span>
                                <button
                                    onClick={() => signOut()}
                                    className="btn"
                                    style={{ 
                                        padding: '0.5rem 1rem', 
                                        fontSize: '0.85rem', 
                                        border: '1px solid var(--border)', 
                                        backgroundColor: 'transparent',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    Salir
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <Link href="/register">
                                    <button className="btn" style={{ border: '1px solid var(--border)', backgroundColor: 'transparent', fontWeight: '600' }}>
                                        Registrarse
                                    </button>
                                </Link>
                                <Link href="/login">
                                    <button className="btn btn-primary">
                                        Ingresar
                                    </button>
                                </Link>
                            </div>
                        )
                    )}
                </div>
            </div>
        </header>
    );
}
