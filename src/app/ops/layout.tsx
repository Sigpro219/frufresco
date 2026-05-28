'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
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
    const [isDarkMode, setIsDarkMode] = useState(true);
    const [dynamicLogosymbol, setDynamicLogosymbol] = useState<string | null>(null);
    const [appShortName, setAppShortName] = useState('FRUFRESCO');

    useEffect(() => {
        let isMounted = true;
        const fetchLogosymbol = async () => {
            const { data, error } = await supabase
                .from('app_settings')
                .select('key, value')
                .in('key', ['app_logosymbol_url', 'app_short_name']);
            
            if (isMounted && !error && data) {
                const logo = data.find(s => s.key === 'app_logosymbol_url')?.value;
                if (logo) setDynamicLogosymbol(logo);

                const shortName = data.find(s => s.key === 'app_short_name')?.value;
                if (shortName) setAppShortName(shortName.toUpperCase());
            }
        };
        fetchLogosymbol();
        return () => { isMounted = false; };
    }, []);

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
                padding: '0.65rem 0',
                paddingBottom: 'calc(0.65rem + env(safe-area-inset-bottom, 0px))',
                zIndex: 100,
                boxShadow: '0 -4px 30px rgba(0,0,0,0.15)'
            }}>
                <NavItem href="/ops/compras" icon={ShoppingBag} label="COMPRAS" />
                <NavItem href="/ops/recogida" icon={ShoppingCart} label="RECOGIDA" />
                <NavItem href="/ops/recepcion" icon={Scale} label="RECIBO" />
                <NavItem href="/ops/picking" icon={Package} label="ALISTAR" />
                <NavItem href="/ops/picking/dashboard" icon={Monitor} label="TABLERO" />
                <NavItem href="/ops/driver" icon={Truck} label="DESPACHO" />
                <NavItem href="/ops" icon={Home} label="INICIO" highlight />
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

function NavItem({ href, icon: Icon, label, highlight = false }: { href: string, icon: any, label: string, highlight?: boolean }) {
    return (
        <Link href={href} style={{ 
            textAlign: 'center', 
            textDecoration: 'none', 
            color: highlight ? 'var(--ops-primary)' : 'var(--ops-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
            flex: 1
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} strokeWidth={1.8} />
            </div>
            <div style={{ fontSize: '0.55rem', fontWeight: 'bold', letterSpacing: '0.05em', marginTop: '2px' }}>{label}</div>
        </Link>
    );
}
