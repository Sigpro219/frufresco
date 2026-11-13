'use client';

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import {
    DirectPdfDocKey,
} from './savePdfDirect';
import { printViaNewWindow, PrintViaNewWindowOptions } from './printViaNewWindow';

interface DirectPdfSaveButtonProps {
    docType: DirectPdfDocKey;
    selectedDate?: string;
    suggestedName?: string;
    containerRef?: React.RefObject<HTMLElement | null>;
    label?: string;
    paperSize?: PrintViaNewWindowOptions['paperSize'];
    orientation?: 'portrait' | 'landscape';
    margin?: string;
}

export default function DirectPdfSaveButton({
    docType,
    selectedDate,
    suggestedName,
    containerRef,
    label = 'Guardar PDF',
    paperSize,
    orientation,
    margin,
}: DirectPdfSaveButtonProps) {
    const [saving, setSaving] = useState(false);
    const [progressText, setProgressText] = useState<string | null>(null);

    const handleSavePdf = async () => {
        if (saving) return;
        setSaving(true);
        setProgressText('Abriendo PDF vectorial...');
        try {
            const title = suggestedName || `${docType}_${selectedDate || 'documento'}`;
            const targetEl = containerRef?.current || (document.querySelector('.print-container') as HTMLElement | null);
            if (!targetEl) {
                window.print();
                return;
            }
            printViaNewWindow({
                element: targetEl,
                title,
                ...(paperSize ? { paperSize } : {}),
                ...(orientation ? { orientation } : {}),
                ...(margin ? { margin } : {}),
            });
        } catch (err: any) {
            console.error('[DirectPdfSaveButton] Error abriendo vista PDF vectorial:', err);
            alert(err?.message || 'Error al abrir la vista PDF.');
        } finally {
            setSaving(false);
            setProgressText(null);
        }
    };

    return (
        <button
            type="button"
            onClick={handleSavePdf}
            disabled={saving}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                backgroundColor: saving ? '#E0F2FE' : '#FFFFFF',
                color: '#0369A1',
                border: '1px solid #0284C7',
                borderRadius: '6px',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: '0.76rem',
                fontWeight: '800',
                boxShadow: '0 1px 3px rgba(2, 132, 199, 0.12)',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
            }}
            title="Guardar documento directamente como archivo PDF preguntando carpeta de destino (sin pasar por impresora)"
        >
            {saving ? (
                <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>{progressText || 'Guardando...'}</span>
                </>
            ) : (
                <>
                    <Download size={14} />
                    <span>{label}</span>
                </>
            )}
        </button>
    );
}
