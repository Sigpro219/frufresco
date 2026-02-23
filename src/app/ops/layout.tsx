'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';

export default function OpsLayout({ children }: { children: ReactNode }) {
    const [isDarkMode, setIsDarkMode] = useState(true);

    return (
        <div className="ops-theme-wrapper" style={{
            minHeight: '100vh',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            transition: 'background-color 0.3s, color 0.3s',
            backgroundColor: 'var(--ops-bg)',
            color: 'var(--ops-text)'
        }}>
            {/* Simple Top Bar */}
            <header style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: '900', fontSize: '1.2rem', color: 'var(--ops-primary)' }}>LOGISTICS <span style={{ color: '#fff' }}>PRO</span></span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Link href="/">
                        <button style={{
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid var(--ops-primary)',
                            color: 'var(--ops-primary)',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            🏠 Volver al Sitio
                        </button>
                    </Link>
                    <button
                        onClick={() => setIsDarkMode(!isDarkMode)}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title={isDarkMode ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
                    >
                        {isDarkMode ? '☀️' : '🌙'}
                    </button>
                    <div style={{ fontSize: '0.8rem', color: 'var(--ops-text-muted)' }}>
                        V1.0
                    </div>
                </div>
            </header>

            <main style={{ paddingBottom: '90px' }}>
                {children}
            </main>

            {/* Bottom Navigation for Mobile Speed */}
            <nav style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                backgroundColor: 'rgba(31, 41, 55, 0.8)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1px solid var(--ops-border)',
                display: 'flex',
                justifyContent: 'space-around',
                padding: '0.75rem 0',
                paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
                zIndex: 100,
                boxShadow: '0 -4px 20px rgba(0,0,0,0.3)'
            }}>
                <NavItem href="/ops/compras" icon="🛍️" label="COMPRAS" />
                <NavItem href="/ops/recogida" icon="🛒" label="RECOGIDA" />
                <NavItem href="/ops/recepcion" icon="⚖️" label="RECIBO" />
                <NavItem href="/ops/picking" icon="📦" label="ALISTAR" />
                <NavItem href="/ops/picking/dashboard" icon="📺" label="TABLERO" />
                <NavItem href="/ops/driver" icon="🚚" label="DESPACHO" />
                <NavItem href="/ops" icon="🏠" label="INICIO" highlight />
            </nav>
            <style jsx global>{`
                :root {
                    --ops-bg: ${isDarkMode ? '#111827' : '#F3F4F6'};
                    --ops-surface: ${isDarkMode ? '#1F2937' : '#FFFFFF'};
                    --ops-text: ${isDarkMode ? '#F9FAFB' : '#111827'};
                    --ops-text-muted: ${isDarkMode ? '#9CA3AF' : '#6B7280'};
                    --ops-border: ${isDarkMode ? '#374151' : '#E5E7EB'};
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
            `}</style>
        </div>
    );
}

function NavItem({ href, icon, label, highlight = false }: { href: string, icon: string, label: string, highlight?: boolean }) {
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
            <div style={{ fontSize: '1.4rem' }}>{icon}</div>
            <div style={{ fontSize: '0.6rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>{label}</div>
        </Link>
    );
}
