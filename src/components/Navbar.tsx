'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useCart } from '../lib/cartContext';
import { useAuth } from '../lib/authContext';

import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/errorUtils';
import { Home, Settings, Package, ShoppingCart, User, LogOut, ChevronDown, Building2 } from 'lucide-react';
import { config } from '@/lib/config';
import { SYNC_METADATA } from '@/lib/sync-status';

export default function Navbar() {
    const { totalItems } = useCart();
    const { user, profile, signOut, loading } = useAuth();
    const [b2bEnabled, setB2bEnabled] = useState(false);
    const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
    const [dynamicLogosymbol, setDynamicLogosymbol] = useState<string | null>(null);
    const [appName, setAppName] = useState(config.brand.name);
    const [operationsOpen, setOperationsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let isMounted = true;
        
        // Chequear configuración al montar
        const checkSettings = async () => {
            try {
                const { data: settings, error } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['enable_b2b_lead_capture', 'app_logo_url', 'app_logosymbol_url', 'app_name']);
                    
                if (!isMounted) return;
                
                if (error) {
                    throw error;
                }
                if (settings) {
                    const b2bObj = settings.find(s => s.key === 'enable_b2b_lead_capture');
                    if (b2bObj) setB2bEnabled(b2bObj.value === 'true');

                    const logoObj = settings.find(s => s.key === 'app_logo_url');
                    if (logoObj?.value) setDynamicLogo(logoObj.value);

                    const symbolObj = settings.find(s => s.key === 'app_logosymbol_url');
                    if (symbolObj?.value) setDynamicLogosymbol(symbolObj.value);

                    const nameObj = settings.find(s => s.key === 'app_name');
                    if (nameObj?.value) setAppName(nameObj.value);
                }
            } catch (err: unknown) {
                if (!isMounted) return;
                logError('Navbar checkSettings', err);
            }
        };
        
        checkSettings().finally(() => {
            if (isMounted) {
                setSettingsLoaded(true);
                setMounted(true);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (appName && typeof document !== 'undefined') {
            document.title = `${appName} | Proveedor de Alimentos`;
        }
    }, [appName]);

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
            backgroundColor: 'rgba(251, 250, 245, 0.8)',
            borderBottom: '1px solid rgba(0,0,0,0.05)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
            backdropFilter: 'blur(20px)',
            transition: 'all 0.3s ease'
        }}>
            <div className="container" style={{
                height: '85px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                {/* LOGO */}
                <Link href="/" style={{ display: 'flex', alignItems: 'center', transition: 'transform 0.3s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <div style={{ 
                        height: '80px', 
                        width: 'auto', 
                        minWidth: '120px', 
                        display: 'flex', 
                        alignItems: 'center',
                        position: 'relative'
                    }}>
                        <img 
                            src={dynamicLogo || "/logo.png"} 
                            alt={appName} 
                            style={{ 
                                height: '80px', 
                                width: 'auto', 
                                filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.05))',
                                opacity: settingsLoaded ? 1 : 0,
                                transition: 'opacity 0.2s ease-in-out'
                            }} 
                            onError={(e) => {
                                (e.currentTarget as HTMLImageElement).src = "/logo.png";
                            }}
                        />
                        {!settingsLoaded && (
                            <div style={{
                                position: 'absolute',
                                left: 0,
                                height: '20px',
                                width: '100px',
                                background: 'linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)',
                                backgroundSize: '200% 100%',
                                animation: 'skeleton-loading 1.5s infinite',
                                borderRadius: '4px'
                            }} />
                        )}
                    </div>
                    {/* Sync Indicator */}
                    <div style={{ 
                        marginLeft: '1rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'rgba(0,0,0,0.03)',
                        fontSize: '0.65rem',
                        color: '#64748b',
                        fontWeight: '600'
                    }} title={mounted ? `Última sincronización CORE: ${new Date(SYNC_METADATA.lastSync).toLocaleString()}` : 'Cargando...'}>
                        <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            backgroundColor: '#10b981', // Verde por defecto indicando que está activo
                            boxShadow: '0 0 8px #10b981'
                        }}></div>
                        <span>SYNC: {mounted ? new Date(SYNC_METADATA.lastSync).toLocaleDateString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '...'}</span>
                    </div>
                </Link>

                {/* NAV LINKS */}
                <nav style={{ 
                    display: 'flex', 
                    gap: '2.5rem', 
                    alignItems: 'center',
                    fontFamily: 'var(--font-outfit), sans-serif'
                }}>
                    {/* B2C (Sin login) o Usuario Genérico */}
                    {!user && (
                        <>
                            <Link href="/" style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-main)'}>Inicio</Link>
                            <Link href="/#catalog" style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-main)'}>Catálogo</Link>
                            {b2bEnabled && (
                                <Link href="/b2b/register" style={{ 
                                    fontWeight: '800', 
                                    fontSize: '1.05rem',
                                    color: 'var(--primary)',
                                    padding: '0.5rem 1rem',
                                    borderRadius: 'var(--radius-full)',
                                    backgroundColor: 'var(--accent)',
                                    transition: 'all 0.3s ease'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                                >Línea Institucional</Link>
                            )}
                        </>
                    )}

                    {/* B2B Cliente */}
                    {user && profile?.role === 'b2b_client' && (
                        <>
                            <Link href="/b2b/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem' }}>Mi Portal</Link>
                            <Link href="/b2b/orders" style={{ fontWeight: '700', fontSize: '1.05rem' }}>Mis Pedidos</Link>
                            <Link href="/b2b/catalog" style={{ fontWeight: '700', fontSize: '1.05rem' }}>Catálogo B2B</Link>
                        </>
                    )}

                    {/* Empleado FruFresco (Admin/Employee) */}
                    {user && (profile?.role === 'admin' || profile?.role === 'employee') && (
                        <>
                            <Link href="/" style={{ fontWeight: '700', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Home size={18} strokeWidth={2.5} /> Inicio
                            </Link>
                            <Link href="/admin/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Settings size={18} strokeWidth={2.5} /> Admin
                            </Link>
                            <Link href="/b2b/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Building2 size={18} strokeWidth={2.5} /> Canal B2B
                            </Link>
                            
                            {/* Dropdown Operaciones */}
                            <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
                                <span 
                                    onClick={() => setOperationsOpen(!operationsOpen)}
                                    style={{ 
                                        fontWeight: '800', 
                                        color: '#334155', 
                                        cursor: 'pointer', 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: '6px',
                                        padding: '8px 12px',
                                        borderRadius: 'var(--radius-md)',
                                        backgroundColor: operationsOpen ? '#F1F5F9' : 'transparent',
                                        transition: 'background-color 0.2s',
                                        fontSize: '1.05rem'
                                    }}
                                >
                                    <Package size={18} strokeWidth={2.5} /> Operaciones <ChevronDown size={16} strokeWidth={3} style={{ transform: operationsOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
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

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <Link href="/checkout">
                        <button className="btn" style={{ 
                            border: '1px solid var(--border)', 
                            backgroundColor: 'white',
                            borderRadius: 'var(--radius-full)',
                            padding: '0.6rem 1.2rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
                            cursor: 'pointer'
                        }}>
                            <ShoppingCart size={20} color="var(--primary)" strokeWidth={2.5} /> 
                            <span style={{ fontWeight: '900', color: 'var(--text-main)', fontSize: '1rem' }}>{totalItems}</span>
                        </button>
                    </Link>

                    {!loading && (
                        user ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    backgroundColor: 'white', 
                                    padding: '0.5rem 1rem', 
                                    borderRadius: 'var(--radius-full)',
                                    border: '1px solid var(--border)',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                                }}>
                                    <User size={16} color="var(--primary)" />
                                    <span style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-main)' }}>
                                        {profile?.company_name || user.email?.split('@')[0]}
                                    </span>
                                </div>
                                <button
                                    onClick={() => signOut()}
                                    className="btn"
                                    style={{ 
                                        padding: '0.6rem 1.2rem', 
                                        fontSize: '0.9rem', 
                                        border: '1px solid #fee2e2', 
                                        backgroundColor: '#fff1f1',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        fontWeight: '800',
                                        borderRadius: 'var(--radius-full)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fecaca'}
                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fff1f1'}
                                >
                                    <LogOut size={16} /> Salir
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
            <style jsx global>{`
                @keyframes skeleton-loading {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `}</style>
        </header>
    );
}
