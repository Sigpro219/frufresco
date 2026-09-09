'use client';

import React from 'react';
import { UniversalLetterhead, INVESTMENTS_CORTES_BRAND, DocumentMetaConfig, PaperSize } from './print';

interface LetterheadProps {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    date?: string;
    reference?: string;
    badge?: string;
    badgeVariant?: 'dark' | 'light' | 'emerald' | 'amber';
    espacioNum?: string | number;
    showWatermark?: boolean;
    showFooter?: boolean;
    footerText?: React.ReactNode;
    className?: string;
    hideTopAccent?: boolean;
    paperSize?: PaperSize;
}

/**
 * Letterhead Oficial FruFresco (Investments Cortés S.A.S.)
 * Fachada institucional sobre el motor UniversalLetterhead
 */
export default function Letterhead({
    children,
    title,
    subtitle,
    date,
    reference,
    badge,
    badgeVariant = 'dark',
    espacioNum,
    showWatermark = true,
    showFooter = true,
    footerText,
    className = '',
    hideTopAccent = false,
    paperSize = 'letter'
}: LetterheadProps) {
    const meta: DocumentMetaConfig = {
        title,
        subtitle,
        date,
        reference,
        badge,
        badgeVariant,
        operationalTag: espacioNum !== undefined && espacioNum !== null && espacioNum !== '' ? {
            label: 'Bahía de Piso',
            value: `ESPACIO ${espacioNum}`
        } : undefined
    };

    return (
        <UniversalLetterhead
            brand={INVESTMENTS_CORTES_BRAND}
            meta={meta}
            paperSize={paperSize}
            showWatermark={showWatermark}
            showFooter={showFooter}
            footerCustomText={footerText}
            className={className}
            hideTopAccent={hideTopAccent}
        >
            {children}
        </UniversalLetterhead>
    );
}
