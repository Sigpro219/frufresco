'use client';

import React, { Suspense } from 'react';
import StagingSpacesManagement from '@/components/StagingSpacesManagement';
import { THEME } from '@/lib/adminTheme';
import { RefreshCw } from 'lucide-react';

export default function StagingSpacesManagementPage() {
    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '1.25rem 1.5rem 2.5rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                <Suspense fallback={
                    <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.xl, border: `1px solid ${THEME.colors.border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem', color: THEME.colors.primary }} />
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: THEME.colors.textSecondary }}>Cargando Centro de Mando de Bahías...</span>
                    </div>
                }>
                    <StagingSpacesManagement />
                </Suspense>
            </div>
        </main>
    );
}
