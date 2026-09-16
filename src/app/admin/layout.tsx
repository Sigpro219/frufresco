'use client';

import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { THEME } from '@/lib/adminTheme';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, profile, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading) {
            // Wait for profile if user is authenticated but profile is not loaded yet
            if (user && !profile) {
                return;
            }
            if (!user && !profile) {
                if (typeof window !== 'undefined' && (window.location.hash.includes('access_token') || window.location.search.includes('code='))) {
                    return;
                }
                router.push('/');
                return;
            }
            if (profile) {
                const isStaff = profile.role && profile.role !== 'b2b_client' && profile.role !== 'b2c_client';
                if (!isStaff) {
                    if (profile.role === 'b2b_client') {
                        router.push('/b2b/dashboard');
                    } else {
                        router.push('/');
                    }
                }
            }
        }
    }, [loading, user, profile, router]);

    if (loading || !profile) {
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
    const isStaff = profile.role && profile.role !== 'b2b_client' && profile.role !== 'b2c_client';
    if (!isStaff) {
        return null;
    }

    return <>{children}</>;
}
