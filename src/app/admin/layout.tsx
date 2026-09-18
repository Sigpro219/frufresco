'use client';

import { useAuth } from '@/lib/authContext';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { THEME } from '@/lib/adminTheme';
import { ShieldAlert } from 'lucide-react';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    useEffect(() => {
        if (!loading && isMounted) {
            // Wait for profile if user is authenticated but profile is not loaded yet
            if (user && !profile) {
                return;
            }
            if (!user && !profile) {
                if (typeof window !== 'undefined' && (window.location.hash.includes('access_token') || window.location.search.includes('code='))) {
                    return;
                }
                const redirectParam = pathname ? `?redirect=${encodeURIComponent(pathname)}` : '';
                window.location.href = `/login${redirectParam}`;
                return;
            }
            if (profile) {
                const isStaff = profile.role && profile.role !== 'b2b_client' && profile.role !== 'b2c_client' && profile.role !== 'client';
                if (!isStaff) {
                    if (profile.role === 'b2b_client') {
                        window.location.href = '/b2b/dashboard';
                    } else {
                        window.location.href = '/login';
                    }
                }
            }
        }
    }, [loading, user, profile, isMounted, pathname]);

    if (!isMounted || loading || !profile) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ 
                        border: `3px solid ${THEME.colors.primary}20`, 
                        borderTop: `3px solid ${THEME.colors.primary}`, 
                        borderRadius: '50%', 
                        width: '36px', 
                        height: '36px', 
                        animation: 'spin 1s linear infinite' 
                    }} />
                    <span style={{ color: THEME.colors.textSecondary, fontSize: '0.85rem', fontWeight: '600' }}>Verificando credenciales...</span>
                    
                    <button 
                        type="button"
                        onClick={() => {
                            if (typeof window !== 'undefined') {
                                localStorage.clear();
                                window.location.href = '/login';
                            }
                        }}
                        style={{
                            marginTop: '0.5rem',
                            backgroundColor: 'transparent',
                            border: '1px solid #CBD5E1',
                            color: '#64748B',
                            borderRadius: '8px',
                            padding: '5px 12px',
                            fontSize: '0.78rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                        }}
                    >
                        ¿Tarda mucho? Iniciar sesión de nuevo
                    </button>
                </div>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { to { transform: rotate(360deg); } }
                ` }} />
            </main>
        );
    }

    // Check if user is staff before rendering children
    const isStaff = profile.role && profile.role !== 'b2b_client' && profile.role !== 'b2c_client' && profile.role !== 'client';
    if (!isStaff) {
        return (
            <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
                <div style={{ textAlign: 'center', padding: '2.5rem', backgroundColor: 'white', borderRadius: '16px', border: '1px solid #E2E8F0', maxWidth: '420px', boxShadow: '0 10px 25px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '56px', height: '56px', borderRadius: '50%', backgroundColor: '#FEE2E2', color: '#EF4444', marginBottom: '1rem' }}>
                        <ShieldAlert size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0F172A', marginBottom: '0.5rem' }}>Acceso Restringido</h2>
                    <p style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5', marginBottom: '1.5rem' }}>
                        Tu cuenta actual no cuenta con permisos administrativos para ingresar a este módulo.
                    </p>
                    <button 
                        type="button"
                        onClick={() => {
                            localStorage.clear();
                            window.location.href = '/login';
                        }} 
                        style={{ padding: '9px 18px', borderRadius: '8px', border: 'none', backgroundColor: THEME.colors.primary, color: 'white', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}
                    >
                        Iniciar con otra cuenta
                    </button>
                </div>
            </main>
        );
    }

    return <>{children}</>;
}
