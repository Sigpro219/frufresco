'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth, checkUserPermission } from '@/lib/authContext';
import { 
  ShoppingBag, 
  ShoppingCart, 
  Scale, 
  Package, 
  Monitor, 
  Truck, 
  Home,
  Sun,
  Moon
} from 'lucide-react';

export default function OpsLayout({ children }: { children: ReactNode }) {
    const { profile, loading } = useAuth();
    const router = useRouter();
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [dynamicLogosymbol, setDynamicLogosymbol] = useState<string | null>(null);
    const [appShortName, setAppShortName] = useState('FRUFRESCO');
    const [roles, setRoles] = useState<any[]>([]);

    useEffect(() => {
        if (!loading) {
            if (!profile) {
                router.push('/');
            } else {
                const staffRoles = ['admin', 'web_admin', 'sys_admin', 'administrativo', 'employee', 'operations'];
                if (!staffRoles.includes(profile.role)) {
                    if (profile.role === 'b2b_client') {
                        router.push('/b2b/dashboard');
                    } else {
                        router.push('/');
                    }
                }
            }
        }
    }, [loading, profile, router]);

    useEffect(() => {
        let isMounted = true;
        const fetchLogosymbol = async () => {
            const { data, error } = await supabase
                .from('app_settings')
                .select('key, value')
                .in('key', ['app_logosymbol_url', 'app_short_name', 'system_roles']);
            
            if (isMounted && !error && data) {
                const logo = data.find(s => s.key === 'app_logosymbol_url')?.value;
                if (logo) setDynamicLogosymbol(logo);

                const shortName = data.find(s => s.key === 'app_short_name')?.value;
                if (shortName) setAppShortName(shortName.toUpperCase());

                const rolesObj = data.find(s => s.key === 'system_roles')?.value;
                if (rolesObj) {
                    try {
                        setRoles(JSON.parse(rolesObj));
                    } catch (e) {
                        console.error('Error parsing system_roles in OpsLayout:', e);
                    }
                }
            }
        };
        fetchLogosymbol();
        return () => { isMounted = false; };
    }, []);

    if (loading || !profile) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a111c', color: '#F9FAFB' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                        border: '3px solid rgba(16, 185, 129, 0.2)', 
                        borderTop: '3px solid #10B981', 
                        borderRadius: '50%', 
                        width: '36px', 
                        height: '36px', 
                        animation: 'spin 1s linear infinite' 
                    }} />
                    <span style={{ color: '#8295a5', fontSize: '0.85rem', fontWeight: '600' }}>Verificando credenciales...</span>
                </div>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { to { transform: rotate(360deg); } }
                ` }} />
            </main>
        );
    }

    // Check if user is staff before rendering operations content
    const staffRoles = ['admin', 'web_admin', 'sys_admin', 'administrativo', 'employee', 'operations'];
    if (!staffRoles.includes(profile.role)) {
        return null;
    }

    const hasPermission = (moduleKey: string) => {
        return checkUserPermission(profile, moduleKey, roles);
    };

    return (
        <div className="ops-theme-wrapper" style={{
            minHeight: '100vh',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            transition: 'background-color 0.3s, color 0.3s',
            backgroundColor: 'var(--ops-bg)',
            color: 'var(--ops-text)'
        }}>
            {/* Simple Top Bar */}
            <header id="ops-main-header" style={{
                backgroundColor: 'var(--ops-surface)',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--ops-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                position: 'sticky',
                top: 0,
                zIndex: 100
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{
                        backgroundColor: 'white',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 10px rgba(255,255,255,0.1)',
                        padding: '3px',
                        flexShrink: 0
                    }}>
                        <img 
                            src={dynamicLogosymbol || "/logosimbolo.png"} 
                            alt={appShortName} 
                            style={{ height: '100%', width: 'auto', objectFit: 'contain' }} 
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logosimbolo.png"; }}
                        />
                    </div>
                     <span style={{ fontWeight: '800', fontSize: '0.95rem', letterSpacing: '0.03em', color: 'var(--ops-text)' }}>
                        {appShortName} <span style={{ color: 'var(--ops-primary)' }}>OPS</span>
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Link href="/">
                        <button style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid var(--ops-primary)',
                            color: 'var(--ops-primary)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <Home size={14} /> <span className="desktop-text">Volver al Sitio</span><span className="mobile-text">Volver</span>
                        </button>
                    </Link>
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--ops-text)'
                        }}
                        title={isDarkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                    >
                        {isDarkMode ? <Sun size={18} style={{ color: '#F59E0B' }} /> : <Moon size={18} style={{ color: 'var(--ops-primary)' }} />}
                    </button>
                    <div className="hide-mobile" style={{ fontSize: '0.75rem', color: 'var(--ops-text-muted)' }}>
                        V1.0
                    </div>
                </div>
            </header>

            <main style={{ paddingBottom: '90px' }}>
                {children}
            </main>

            {/* Bottom Navigation for Mobile Speed */}
            <nav id="ops-main-footer" style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'var(--ops-surface)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1px solid var(--ops-border)',
                display: 'flex',
                justifyContent: 'space-around',
                padding: '0.4rem 0',
                paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))',
                zIndex: 100,
                boxShadow: '0 -4px 30px rgba(0,0,0,0.15)'
            }}>
                {hasPermission('ops.compras') && <NavItem href="/ops/compras" icon={ShoppingBag} label="COMPRAS" />}
                {hasPermission('ops.recogida') && <NavItem href="/ops/recogida" icon={ShoppingCart} label="RECOGIDA" />}
                {hasPermission('ops.recepcion') && <NavItem href="/ops/recepcion" icon={Scale} label="RECIBO" />}
                {hasPermission('ops.picking.terminal') && <NavItem href="/ops/picking" icon={Package} label="ALISTAR" />}
                {hasPermission('ops.picking.dashboard') && <NavItem href="/ops/picking/dashboard" icon={Monitor} label="TABLERO" />}
                {hasPermission('ops.driver') && <NavItem href="/ops/driver" icon={Truck} label="DESPACHO" />}
                <NavItem href="/ops" icon={Home} label="INICIO" />
            </nav>
            <style jsx global>{`
                :root {
                    --ops-bg: ${isDarkMode ? '#0a111c' : '#F3F4F6'};
                    --ops-surface: ${isDarkMode ? '#121d2d' : '#FFFFFF'};
                    --ops-text: ${isDarkMode ? '#F9FAFB' : '#111827'};
                    --ops-text-muted: ${isDarkMode ? '#8295a5' : '#6B7280'};
                    --ops-border: ${isDarkMode ? '#22354c' : '#E5E7EB'};
                    --ops-primary: #10B981;
                }
                body {
                    margin: 0;
                    padding: 0;
                    overscroll-behavior: none;
                    background-color: var(--ops-bg);
                    color: var(--ops-text);
                    transition: background-color 0.3s, color 0.3s;
                }
                /* Sleek Custom Scrollbar for Ops Portal */
                ::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                ::-webkit-scrollbar-track {
                    background: var(--ops-bg);
                }
                ::-webkit-scrollbar-thumb {
                    background: var(--ops-border);
                    border-radius: 4px;
                    transition: background 0.2s;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: var(--ops-text-muted);
                }
                .btn-op {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 1rem;
                    border-radius: 12px;
                    border: none;
                    font-weight: 800;
                    font-size: 1rem;
                    cursor: pointer;
                    transition: transform 0.1s active;
                }
                .btn-op:active {
                    transform: scale(0.96);
                }
                .card-op {
                    background-color: var(--ops-surface);
                    border: 1px solid var(--ops-border);
                    border-radius: 16px;
                    padding: 1rem;
                    margin-bottom: 1rem;
                    color: var(--ops-text);
                }
                
                /* EFECO MACBOOK DOCK TRANSITIONS */
                .ops-nav-item {
                    transform-origin: bottom center;
                }
                .ops-nav-item:hover {
                    transform: scale(1.28) translateY(-6px) !important;
                }
                .ops-nav-item:hover .icon-wrapper {
                    color: var(--ops-primary) !important;
                }
                
                @media (max-width: 480px) {
                    .desktop-text { display: none !important; }
                    .mobile-text { display: inline !important; }
                    .hide-mobile { display: none !important; }
                }
                @media (min-width: 481px) {
                    .desktop-text { display: inline !important; }
                    .mobile-text { display: none !important; }
                }
            `}</style>
        </div>
    );
}

function NavItem({ href, icon: Icon, label }: { href: string, icon: any, label: string }) {
    const pathname = usePathname();
    const isActive = href === '/ops' ? pathname === '/ops' : pathname.startsWith(href);
    
    return (
        <Link href={href} className="ops-nav-item" style={{ 
            textAlign: 'center', 
            textDecoration: 'none', 
            color: isActive ? 'var(--ops-primary)' : 'var(--ops-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            flex: 1,
            position: 'relative',
            transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.2s',
            transformOrigin: 'bottom center',
            paddingBottom: '0px'
        }}>
            <div className="icon-wrapper" style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                transition: 'all 0.25s ease-in-out',
                backgroundColor: isActive ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                padding: isActive ? '6px 16px' : '6px 12px',
                borderRadius: '12px',
                boxShadow: isActive ? '0 2px 10px rgba(16, 185, 129, 0.15), inset 0 0 0 1px rgba(16, 185, 129, 0.25)' : 'none'
            }}>
                <Icon size={isActive ? 22 : 20} strokeWidth={isActive ? 2.2 : 1.8} style={{
                    filter: isActive ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.45))' : 'none',
                    transition: 'all 0.2s',
                    color: isActive ? 'var(--ops-primary)' : 'inherit'
                }} />
            </div>
            <div style={{ 
                fontSize: '0.55rem', 
                fontWeight: isActive ? '900' : '700', 
                letterSpacing: '0.06em', 
                marginTop: '1px',
                color: isActive ? 'var(--ops-primary)' : 'var(--ops-text-muted)',
                transition: 'color 0.2s',
                textShadow: isActive ? '0 0 8px rgba(16, 185, 129, 0.2)' : 'none'
            }}>{label}</div>
        </Link>
    );
}
