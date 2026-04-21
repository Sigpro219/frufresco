'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../lib/cartContext';
import { useAuth } from '../lib/authContext';

import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/errorUtils';
import { Home, Settings, Package, ShoppingCart, User, LogOut, ChevronDown, Building2 } from 'lucide-react';
import { config } from '@/lib/config';
import { SYNC_METADATA } from '@/lib/sync-status';
import { translations, Locale } from '@/lib/translations';
import { Globe } from 'lucide-react';
 import { useRouter, useSearchParams } from 'next/navigation';

export default function Navbar() {
    const { totalItems } = useCart();
    const { user, profile, signOut, loading } = useAuth();
    const pathname = usePathname();
    // Cart only visible on shopping-context pages (not admin or ops)
    const isShoppingContext = !pathname?.startsWith('/admin') && !pathname?.startsWith('/ops');
    const [b2bEnabled, setB2bEnabled] = useState(false);
    const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
    const [appName, setAppName] = useState(config.brand.name);
    const [lastSyncDate, setLastSyncDate] = useState(SYNC_METADATA.lastSync);
    const [themeConfig, setThemeConfig] = useState<{primary: string, secondary: string} | null>(null);
    const [operationsOpen, setOperationsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const [roles, setRoles] = useState<Role[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    
    const locale = (searchParams.get('lang') === 'en' ? 'en' : 'es') as Locale;
    const t = translations[locale];

    interface Role {
        value: string;
        label: string;
        permissions?: string[];
    }

    useEffect(() => {
        let isMounted = true;
        
        // Chequear configuración al montar
        const checkSettings = async () => {
            try {
                const { data: settings, error } = await supabase
                    .from('app_settings')
                    .select('key, value')
                    .in('key', ['enable_b2b_lead_capture', 'app_logo_url', 'app_name', 'system_roles', 'primary_color', 'secondary_color', 'last_core_sync']);
                    
                if (!isMounted) return;
                
                if (error) {
                    throw error;
                }
                if (settings) {
                    const b2bObj = settings.find((s: {key: string, value: string}) => s.key === 'enable_b2b_lead_capture');
                    if (b2bObj) setB2bEnabled(b2bObj.value === 'true');

                    const logoObj = settings.find((s: {key: string, value: string}) => s.key === 'app_logo_url');
                    if (logoObj?.value) setDynamicLogo(logoObj.value);

                    const nameObj = settings.find((s: {key: string, value: string}) => s.key === 'app_name');
                    if (nameObj?.value) setAppName(nameObj.value);

                    const rolesObj = settings.find((s: {key: string, value: string}) => s.key === 'system_roles');
                    if (rolesObj?.value) {
                        try { setRoles(JSON.parse(rolesObj.value)); } catch(e) { console.error(e); }
                    }

                    const primaryObj = settings.find((s: {key: string, value: string}) => s.key === 'primary_color');
                    const secondaryObj = settings.find((s: {key: string, value: string}) => s.key === 'secondary_color');
                    const syncObj = settings.find((s: {key: string, value: string}) => s.key === 'last_core_sync');
                    if (syncObj?.value) {
                        const dbDate = new Date(syncObj.value).getTime();
                        const codeDate = new Date(SYNC_METADATA.lastSync).getTime();
                        // Mostramos la fecha más reciente (ya sea por actualización de código o de datos)
                        if (!isNaN(dbDate) && dbDate > codeDate) {
                            setLastSyncDate(syncObj.value);
                        } else {
                            setLastSyncDate(SYNC_METADATA.lastSync);
                        }
                    }
                    
                    if (primaryObj?.value || secondaryObj?.value) {
                        setThemeConfig({
                            primary: primaryObj?.value || '#22c55e', // default green
                            secondary: secondaryObj?.value || '#16a34a' // default dark green
                        });
                    }
                }
            } catch (err: unknown) {
                if (!isMounted) return;
                // Settings are non-critical UI enhancements — degrade silently on network errors
                const msg = String((err as Record<string, unknown>)?.message || err || '').toLowerCase();
                const isNetworkError = msg.includes('fetch') || msg.includes('network') || msg.includes('enotfound') || msg.includes('failed');
                if (!isNetworkError) {
                    logError('Navbar checkSettings', err);
                }
                // Network failures just mean we keep the fallback branding — no action needed
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
            document.title = `${appName} | ${locale === 'es' ? 'Proveedor de Alimentos' : 'Food Provider'}`;
        }
    }, [appName, locale]);

    const changeLanguage = (newLang: string) => {
        const params = new URLSearchParams(searchParams.toString());
        if (newLang === 'es') params.delete('lang');
        else params.set('lang', newLang);
        router.push(`${pathname}?${params.toString()}`);
    };

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

    const hasPermission = (moduleKey: string) => {
        if (!roles.length || !profile?.role) return profile?.role === 'admin';
        const userRole = roles.find(r => r.value === profile.role);
        if (!userRole) return profile?.role === 'admin';
        return userRole.permissions?.includes(moduleKey) || profile?.role === 'admin';
    };

    const shouldShowOperations = () => {
        const modules = ['hr', 'inventory', 'commercial', 'transport', 'maintenance', 'command_center'];
        return modules.some(m => hasPermission(m));
    };

    const dropdownLinkStyle = (color: string) => ({
        display: 'block', 
        padding: '10px 16px', 
        color: color, 
        fontWeight: '700',
        textDecoration: 'none',
        transition: 'background-color 0.2s',
        fontSize: '0.9rem'
    });

    return (
        <header 
            style={{
                backgroundColor: 'rgba(251, 250, 245, 0.8)',
                borderBottom: '1px solid rgba(0,0,0,0.05)',
                position: 'sticky',
                top: 0,
                zIndex: 100,
                backdropFilter: 'blur(20px)',
                transition: 'all 0.3s ease',
                ...(themeConfig ? {
                    '--primary': themeConfig.primary,
                    '--secondary': themeConfig.secondary,
                    '--accent': `${themeConfig.primary}1A`
                } as any : {})
            }}
        >
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
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'rgba(5, 150, 105, 0.08)',
                        fontSize: '0.7rem',
                        color: '#065f46',
                        fontWeight: '800',
                        border: '1px solid rgba(5, 150, 105, 0.2)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                    }} title={mounted ? `Última sincronización: ${new Date(lastSyncDate).toLocaleString()}` : 'Cargando...'}>
                        <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            backgroundColor: '#10B981',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}>
                            <div style={{
                                position: 'absolute',
                                width: '100%',
                                height: '100%',
                                borderRadius: '50%',
                                backgroundColor: '#10B981',
                                opacity: 0.6,
                                animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite'
                            }} />
                        </div>
                        <span>V{SYNC_METADATA.version} | {mounted ? new Date(lastSyncDate).toLocaleDateString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '...'}</span>
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
                            <Link href="/" style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-main)'}>{t.navHome}</Link>
                            <Link href="/#catalog" style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-main)'}>{t.navCatalog}</Link>
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
                                >{t.navInstitutional}</Link>
                            )}
                        </>
                    )}

                    {/* B2B Cliente */}
                    {user && profile?.role === 'b2b_client' && (
                        <>
                            <Link href="/b2b/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem' }}>Mi Portal</Link>
                            <Link href="/b2b/orders" style={{ fontWeight: '700', fontSize: '1.05rem' }}>Mis Pedidos</Link>
                            <Link href="/b2b/catalog" style={{ fontWeight: '700', fontSize: '1.05rem' }}>Catálogo Institucional</Link>
                        </>
                    )}

                    {/* Empleado FruFresco (Admin/Employee) */}
                    {user && profile?.role !== 'b2b_client' && profile?.role !== 'b2c_client' && (
                        <>
                            <Link href="/" style={{ fontWeight: '700', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Home size={18} strokeWidth={2.5} /> Inicio
                            </Link>
                            {hasPermission('commercial') && (
                                <Link href="/b2b/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Building2 size={18} strokeWidth={2.5} /> Canal Institucional
                                </Link>
                            )}
                            
                            {/* Dropdown Operaciones */}
                            {shouldShowOperations() && (
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
                                        <div style={{ padding: '4px 16px', fontSize: '0.65rem', fontWeight: '800', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Administración</div>
                                            {hasPermission('dashboard') && (
                                                <Link href="/admin/dashboard" 
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={{ ...dropdownLinkStyle('#334155'), display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <Settings size={14} strokeWidth={2.5} /> Panel Admin
                                                </Link>
                                            )}
                                            <div style={{ borderTop: '1px solid #F3F4F6', margin: '4px 0' }}></div>
                                            {/* Links condicionales basados en permisos */}
                                            {hasPermission('commercial') && (
                                                <Link href="/admin/orders/loading" 
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle('#0891B2')}>
                                                    📋 Pedidos
                                                </Link>
                                            )}
                                            {hasPermission('transport') && (
                                                <Link href="/admin/transport" 
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle('#EA580C')}>
                                                    🚛 Transporte
                                                </Link>
                                            )}
                                            {hasPermission('commercial') && (
                                                <>
                                                    <Link href="/admin/commercial/billing" 
                                                        onClick={() => setOperationsOpen(false)}
                                                        style={dropdownLinkStyle('#6366F1')}>
                                                        💰 Facturación
                                                    </Link>
                                                    <Link href="/admin/commercial"
                                                        onClick={() => setOperationsOpen(false)}
                                                        style={dropdownLinkStyle('#059669')}>
                                                        💼 Comercial
                                                    </Link>
                                                </>
                                            )}
                                            {hasPermission('hr') && (
                                                <Link href="/admin/hr"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle('#8B5CF6')}>
                                                    👥 Talento Humano
                                                </Link>
                                            )}
                                            {hasPermission('inventory') && (
                                                <Link href="/admin/commercial/inventory"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle('#0369A1')}>
                                                    📦 Control de Inventarios
                                                </Link>
                                            )}
                                            {hasPermission('transport') && (
                                                <Link href="/ops/picking/dashboard" 
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle('#D97706')}>
                                                    🚚 Despachos
                                                </Link>
                                            )}
                                            
                                            {hasPermission('dashboard') && (
                                                <Link href="/admin/strategy" 
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={{ ...dropdownLinkStyle('#7C3AED'), borderTop: '1px solid #F3F4F6', fontWeight: '900' }}>
                                                    🧠 Inteligencia & Estrategia
                                                </Link>
                                            )}

                                            {hasPermission('transport') && (
                                                <Link href="/ops" 
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={{ ...dropdownLinkStyle('#10B981'), borderTop: '1px solid #F3F4F6', fontWeight: '900' }}>
                                                    🏭 Portal Operacional
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </nav>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {isShoppingContext && (
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
                    )}

                    {/* Language Toggle */}
                    <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        backgroundColor: 'rgba(0,0,0,0.03)', 
                        padding: '4px', 
                        borderRadius: 'var(--radius-full)',
                        border: '1px solid rgba(0,0,0,0.05)'
                    }}>
                        <button 
                            onClick={() => changeLanguage('es')}
                            style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-full)',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '900',
                                backgroundColor: locale === 'es' ? 'white' : 'transparent',
                                color: locale === 'es' ? 'var(--primary)' : '#94A3B8',
                                boxShadow: locale === 'es' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >ES</button>
                        <button 
                            onClick={() => changeLanguage('en')}
                            style={{
                                padding: '4px 8px',
                                borderRadius: 'var(--radius-full)',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: '900',
                                backgroundColor: locale === 'en' ? 'white' : 'transparent',
                                color: locale === 'en' ? 'var(--primary)' : '#94A3B8',
                                boxShadow: locale === 'en' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >EN</button>
                    </div>

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
                                    <LogOut size={16} /> {t.navSignOut}
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                                <Link href="/register">
                                    <button className="btn" style={{ border: '1px solid var(--border)', backgroundColor: 'transparent', fontWeight: '600' }}>
                                        {t.navRegister}
                                    </button>
                                </Link>
                                <Link href="/login">
                                    <button className="btn btn-primary">
                                        {t.navLogin}
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
                @keyframes ping {
                    75%, 100% {
                        transform: scale(2);
                        opacity: 0;
                    }
                }
            `}</style>
        </header>
    );
}
