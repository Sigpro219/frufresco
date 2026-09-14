'use client';

import React from 'react';
import StagingSpacesManagement from '@/components/StagingSpacesManagement';
import { THEME } from '@/lib/adminTheme';

export default function StagingSpacesManagementPage() {
    return (
        <main style={{ minHeight: '100vh', backgroundColor: THEME.colors.background, padding: '1.25rem 1.5rem 2.5rem', fontFamily: THEME.typography?.fontFamilyMain || 'var(--font-outfit), sans-serif' }}>
            <div style={{ maxWidth: '1600px', margin: '0 auto' }}>
                <StagingSpacesManagement />
            </div>
        </main>
    );
}
