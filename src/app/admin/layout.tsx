'use client';

import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { THEME } from '@/lib/adminTheme';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { profile, loading } = useAuth();
    const router = useRouter();

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
                </div>
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes spin { to { transform: rotate(360deg); } }
                ` }} />
            </main>
        );
    }

    // Check if user is staff before rendering children
    const staffRoles = ['admin', 'web_admin', 'sys_admin', 'administrativo', 'employee', 'operations'];
    if (!staffRoles.includes(profile.role)) {
        return null;
    }

    return <>{children}</>;
}
