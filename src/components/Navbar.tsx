'use client';
import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '../lib/cartContext';
import { useAuth } from '../lib/authContext';
import { supabase } from '@/lib/supabase';
import { logError } from '@/lib/errorUtils';
import { Home, Settings, Package, ShoppingCart, User, LogOut, ChevronDown, Building2, ClipboardList, Truck, DollarSign, ShoppingBag, Briefcase, Users, Archive, Brain, Factory, Menu, X as XIcon } from 'lucide-react';
import { THEME } from '@/lib/adminTheme';
import { config } from '@/lib/config';
import { SYNC_METADATA } from '@/lib/sync-status';
import { translations, Locale } from '@/lib/translations';

export default function Navbar() {
    const { totalItems, totalPrice } = useCart();
    const { user, profile, signOut, loading } = useAuth();
    const pathname = usePathname();
    // Cart only visible on shopping-context pages (not admin or ops)
    const isShoppingContext = !pathname?.startsWith('/admin') && !pathname?.startsWith('/ops');
    const [b2bEnabled, setB2bEnabled] = useState(false);
    const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
    const [appName, setAppName] = useState(config.brand.name);
    const [lastSyncDate, setLastSyncDate] = useState(process.env.NEXT_PUBLIC_BUILD_TIME || SYNC_METADATA.lastSync);
    const [themeConfig, setThemeConfig] = useState<{primary: string, secondary: string} | null>(null);
    const [operationsOpen, setOperationsOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
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
                        const baseCodeDate = process.env.NEXT_PUBLIC_BUILD_TIME || SYNC_METADATA.lastSync;
                        const codeDate = new Date(baseCodeDate).getTime();
                        // Mostramos la fecha más reciente (ya sea por actualización de código o de datos)
                        if (!isNaN(dbDate) && dbDate > codeDate) {
                            setLastSyncDate(syncObj.value);
                        } else {
                            setLastSyncDate(baseCodeDate);
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

    // Persistent Language Logic
    useEffect(() => {
        const savedLang = localStorage.getItem('frufresco_lang');
        const urlLang = searchParams.get('lang');
        
        // If there's a saved preference but no URL param, sync URL to preference
        if (savedLang && !urlLang && savedLang === 'en') {
            const params = new URLSearchParams(window.location.search);
            params.set('lang', 'en');
            router.replace(`${pathname}?${params.toString()}`);
        }
    }, [pathname, router, searchParams]);

    const changeLanguage = (newLang: string) => {
        localStorage.setItem('frufresco_lang', newLang);
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

    const dropdownLinkStyle = {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 16px',
        color: THEME.colors.textMain,
        fontWeight: '500',
        textDecoration: 'none',
        transition: 'background-color 0.15s',
        fontSize: '0.875rem',
        fontFamily: THEME.typography.fontFamilySecondary,
        borderRadius: '0',
    };

    const dropdownIconStyle = {
        color: THEME.colors.primary,
        flexShrink: 0,
    };

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
                <Link href={`/${locale === 'en' ? '?lang=en' : ''}`} style={{ display: 'flex', alignItems: 'center', transition: 'transform 0.3s ease' }}
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
                        <span>V{process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA.substring(0, 6).toUpperCase() : SYNC_METADATA.version} | {mounted ? new Date(lastSyncDate).toLocaleDateString([], {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'}) : '...'}</span>
                    </div>
                </Link>

                {/* NAV LINKS */}
                <nav className="nav-desktop" style={{ 
                    display: 'flex', 
                    gap: '2.5rem', 
                    alignItems: 'center',
                    fontFamily: 'var(--font-outfit), sans-serif'
                }}>
                    {/* B2C (Sin login) o Usuario Genérico */}
                    {mounted && !user && (
                        <>
                            <Link href={`/${locale === 'en' ? '?lang=en' : ''}`} style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-main)'}>{t.navHome}</Link>
                            <Link href={`/#catalog${locale === 'en' ? '?lang=en' : ''}`} style={{ fontWeight: '700', fontSize: '1.05rem', color: 'var(--text-main)', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--primary)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-main)'}>{t.navCatalog}</Link>
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
                    {mounted && user && profile?.role === 'b2b_client' && (
                        <>
                            <Link href="/b2b/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem' }}>Mi Portal</Link>
                            <Link href="/b2b/orders" style={{ fontWeight: '700', fontSize: '1.05rem' }}>Mis Pedidos</Link>
                            <Link href="/b2b/catalog" style={{ fontWeight: '700', fontSize: '1.05rem' }}>Catálogo Institucional</Link>
                        </>
                    )}

                    {/* Empleado FruFresco (Admin/Employee) */}
                    {mounted && user && profile?.role !== 'b2b_client' && profile?.role !== 'b2c_client' && (
                        <>
                            <Link href="/" style={{ fontWeight: '700', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Home size={18} strokeWidth={2.5} /> {t.navHome}
                            </Link>
                            {hasPermission('commercial') && (
                                <Link href="/b2b/dashboard" style={{ fontWeight: '800', color: 'var(--primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Building2 size={18} strokeWidth={2.5} /> {t.navInstitutional}
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
                                        <Package size={18} strokeWidth={2.5} /> {t.navOperations} <ChevronDown size={16} strokeWidth={3} style={{ transform: operationsOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
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
                                            minWidth: '280px',
                                            zIndex: 1000,
                                            padding: '8px 0'
                                        }}>
                                        {/* Section label */}
                                        <div style={{ padding: '6px 16px 4px', fontSize: '0.6rem', fontWeight: '700', color: THEME.colors.textSecondary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: THEME.typography.fontFamilySecondary }}>{t.navAdministration}</div>

                                            {hasPermission('dashboard') && (
                                                <Link href="/admin/dashboard"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <Settings size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navAdmin}
                                                </Link>
                                            )}

                                            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, margin: '4px 0' }} />

                                            {hasPermission('commercial') && (
                                                <Link href="/admin/orders/loading"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <ClipboardList size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navOrders}
                                                </Link>
                                            )}
                                            {hasPermission('transport') && (
                                                <Link href="/admin/transport"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <Truck size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navTransport}
                                                </Link>
                                            )}
                                            {hasPermission('commercial') && (
                                                <>
                                                    <Link href="/admin/commercial/billing"
                                                        onClick={() => setOperationsOpen(false)}
                                                        style={dropdownLinkStyle}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <DollarSign size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navBilling}
                                                    </Link>
                                                    <Link href="/admin/procurement"
                                                        onClick={() => setOperationsOpen(false)}
                                                        style={dropdownLinkStyle}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <ShoppingBag size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navProcurement}
                                                    </Link>
                                                    <Link href="/admin/commercial"
                                                        onClick={() => setOperationsOpen(false)}
                                                        style={dropdownLinkStyle}
                                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                        <Briefcase size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navCommercial}
                                                    </Link>
                                                </>
                                            )}
                                            {hasPermission('hr') && (
                                                <Link href="/admin/hr"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <Users size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navHR}
                                                </Link>
                                            )}
                                            {hasPermission('inventory') && (
                                                <Link href="/admin/commercial/inventory"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <Archive size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navInventory}
                                                </Link>
                                            )}

                                            <div style={{ borderTop: `1px solid ${THEME.colors.border}`, margin: '4px 0' }} />

                                            {hasPermission('dashboard') && (
                                                <Link href="/admin/strategy"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <Brain size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navStrategy}
                                                </Link>
                                            )}
                                            {hasPermission('transport') && (
                                                <Link href="/ops"
                                                    onClick={() => setOperationsOpen(false)}
                                                    style={dropdownLinkStyle}
                                                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = THEME.colors.background}
                                                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                                                    <Factory size={15} strokeWidth={1.5} style={dropdownIconStyle} /> {t.navOpsPortal}
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </nav>

                {/* HAMBURGER BUTTON — mobile only */}
                <button
                    className="nav-hamburger"
                    onClick={() => setMobileOpen(o => !o)}
                    aria-label="Menú"
                    style={{
                        display: 'none',
                        background: 'none',
                        border: `1px solid ${THEME.colors.border}`,
                        borderRadius: THEME.radius.md,
                        padding: '8px',
                        cursor: 'pointer',
                        color: THEME.colors.textMain,
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {mobileOpen ? <XIcon size={22} strokeWidth={1.5} /> : <Menu size={22} strokeWidth={1.5} />}
                </button>

                <div className="nav-right-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {isShoppingContext && (
                    <div className="cart-container" style={{ position: 'relative' }}>
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
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}>
                                <ShoppingCart size={20} color="var(--primary)" strokeWidth={2.5} /> 
                                <span style={{ fontWeight: '900', color: 'var(--text-main)', fontSize: '1rem' }}>{mounted ? totalItems : 0}</span>
                            </button>
                        </Link>
                        {mounted && totalItems > 0 && (
                            <div className="cart-tooltip">
                                <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Total Estimado</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: '900', color: 'var(--primary)' }}>
                                    ${mounted ? totalPrice.toLocaleString() : '0'}
                                </div>
                            </div>
                        )}
                    </div>
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

                    {mounted && !loading && (
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
                .cart-container:hover .cart-tooltip {
                    opacity: 1;
                    transform: translateY(0);
                    pointer-events: auto;
                }
                .cart-tooltip {
                    position: absolute;
                    top: calc(100% + 14px);
                    right: 0;
                    background: white;
                    border: 1px solid rgba(0,0,0,0.06);
                    border-radius: 16px;
                    padding: 1rem 1.2rem;
                    box-shadow: 0 20px 40px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.05);
                    opacity: 0;
                    transform: translateY(10px);
                    pointer-events: none;
                    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    min-width: 150px;
                    text-align: right;
                    z-index: 110;
                }
                .cart-tooltip::after {
                    content: '';
                    position: absolute;
                    top: -6px;
                    right: 28px;
                    width: 12px;
                    height: 12px;
                    background: white;
                    border-left: 1px solid rgba(0,0,0,0.06);
                    border-top: 1px solid rgba(0,0,0,0.06);
                    transform: rotate(45deg);
                }
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

                /* ── Responsive ── */
                @media (max-width: 768px) {
                    .nav-desktop { display: none !important; }
                    .nav-hamburger { display: flex !important; }
                    .nav-right-actions { display: none !important; }
                }
                @media (min-width: 769px) {
                    .nav-mobile-menu { display: none !important; }
                }

                /* Mobile menu items */
                .mobile-nav-link {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px 20px;
                    color: #1A231E;
                    font-size: 0.95rem;
                    font-weight: 500;
                    text-decoration: none;
                    border-bottom: 1px solid #E5E7EB;
                    transition: background 0.15s;
                    font-family: var(--font-inter), sans-serif;
                }
                .mobile-nav-link:hover { background: #F4F7F6; }
                .mobile-nav-section {
                    font-size: 0.6rem;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #64748B;
                    padding: 14px 20px 6px;
                    font-family: var(--font-inter), sans-serif;
                }
            `}</style>
            {/* ── MOBILE MENU PANEL ── */}
            {mobileOpen && (
                <div
                    className="nav-mobile-menu"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        backgroundColor: 'white',
                        borderBottom: `1px solid ${THEME.colors.border}`,
                        boxShadow: THEME.shadow.lg,
                        zIndex: 200,
                        maxHeight: 'calc(100vh - 85px)',
                        overflowY: 'auto',
                    }}
                >
                    {/* User info */}
                    {mounted && user && (
                        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${THEME.colors.border}`, backgroundColor: THEME.colors.background }}>
                            <User size={16} color={THEME.colors.primary} />
                            <span style={{ fontWeight: '600', fontSize: '0.9rem', color: THEME.colors.textMain }}>{profile?.company_name || user.email?.split('@')[0]}</span>
                        </div>
                    )}

                    {/* Navigation links for admin/employee */}
                    {mounted && user && profile?.role !== 'b2b_client' && profile?.role !== 'b2c_client' && (
                        <>
                            <div className="mobile-nav-section">{t.navAdministration}</div>
                            {hasPermission('dashboard') && (
                                <Link href="/admin/dashboard" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <Settings size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navAdmin}
                                </Link>
                            )}
                            {hasPermission('commercial') && (
                                <Link href="/admin/orders/loading" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <ClipboardList size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navOrders}
                                </Link>
                            )}
                            {hasPermission('transport') && (
                                <Link href="/admin/transport" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <Truck size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navTransport}
                                </Link>
                            )}
                            {hasPermission('commercial') && (
                                <>
                                    <Link href="/admin/commercial/billing" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                        <DollarSign size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navBilling}
                                    </Link>
                                    <Link href="/admin/procurement" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                        <ShoppingBag size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navProcurement}
                                    </Link>
                                    <Link href="/admin/commercial" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                        <Briefcase size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navCommercial}
                                    </Link>
                                </>
                            )}
                            {hasPermission('hr') && (
                                <Link href="/admin/hr" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <Users size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navHR}
                                </Link>
                            )}
                            {hasPermission('inventory') && (
                                <Link href="/admin/commercial/inventory" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <Archive size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navInventory}
                                </Link>
                            )}
                            {hasPermission('dashboard') && (
                                <Link href="/admin/strategy" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <Brain size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navStrategy}
                                </Link>
                            )}
                            {hasPermission('transport') && (
                                <Link href="/ops" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                    <Factory size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navOpsPortal}
                                </Link>
                            )}
                        </>
                    )}

                    {/* B2B client links */}
                    {mounted && user && profile?.role === 'b2b_client' && (
                        <>
                            <Link href="/b2b/dashboard" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                <Home size={16} strokeWidth={1.5} color={THEME.colors.primary} /> Mi Portal
                            </Link>
                            <Link href="/b2b/orders" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                <ShoppingCart size={16} strokeWidth={1.5} color={THEME.colors.primary} /> Mis Pedidos
                            </Link>
                        </>
                    )}

                    {/* Guest links */}
                    {mounted && !user && (
                        <>
                            <Link href="/" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                <Home size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navHome}
                            </Link>
                            <Link href="/#catalog" className="mobile-nav-link" onClick={() => setMobileOpen(false)}>
                                <Package size={16} strokeWidth={1.5} color={THEME.colors.primary} /> {t.navCatalog}
                            </Link>
                        </>
                    )}

                    {/* Auth actions */}
                    <div style={{ padding: '16px 20px', display: 'flex', gap: '12px', borderTop: `2px solid ${THEME.colors.border}` }}>
                        {mounted && user ? (
                            <button
                                onClick={() => { signOut(); setMobileOpen(false); }}
                                style={{ flex: 1, padding: '10px', border: '1px solid #fee2e2', backgroundColor: '#fff1f1', color: '#ef4444', borderRadius: THEME.radius.md, fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                <LogOut size={16} /> {t.navSignOut}
                            </button>
                        ) : (
                            <>
                                <Link href="/login" style={{ flex: 1 }} onClick={() => setMobileOpen(false)}>
                                    <button style={{ width: '100%', padding: '10px', border: `1px solid ${THEME.colors.border}`, backgroundColor: 'white', color: THEME.colors.textMain, borderRadius: THEME.radius.md, fontWeight: '600', cursor: 'pointer' }}>{t.navLogin}</button>
                                </Link>
                                <Link href="/register" style={{ flex: 1 }} onClick={() => setMobileOpen(false)}>
                                    <button style={{ width: '100%', padding: '10px', border: 'none', backgroundColor: THEME.colors.primary, color: 'white', borderRadius: THEME.radius.md, fontWeight: '700', cursor: 'pointer' }}>{t.navRegister}</button>
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </header>
    );
}
