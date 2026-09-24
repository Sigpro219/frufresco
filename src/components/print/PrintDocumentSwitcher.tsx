'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, ChevronDown } from 'lucide-react';

export type PrintDocumentKey = 
    | 'alistamiento' 
    | 'purchases' 
    | 'receiving' 
    | 'labels' 
    | 'manifest'
    | 'contingency';

export interface PrintDocumentOption {
    key: PrintDocumentKey;
    label: string;
    shortLabel: string;
    paperFormat: string;
    path: string;
    description: string;
}

export const PRINT_DOCUMENTS: PrintDocumentOption[] = [
    {
        key: 'alistamiento',
        label: 'Sábana Maestra de Alistamiento',
        shortLabel: 'Sábana Alistamiento (Oficio)',
        paperFormat: 'Oficio (Legal Landscape)',
        path: '/admin/orders/alistamiento-print',
        description: 'Matriz industrial por bahías de muelle y células de trabajo'
    },
    {
        key: 'purchases',
        label: 'Planilla de Compras (Corabastos)',
        shortLabel: 'Compras Corabastos (Carta)',
        paperFormat: 'Carta (Portrait)',
        path: '/admin/procurement/purchases-print',
        description: 'Consolidado de abastecimiento agrupado por sublistas de plaza'
    },
    {
        key: 'receiving',
        label: 'Planilla de Recepción en Bodega',
        shortLabel: 'Recepción Bodega (Carta)',
        paperFormat: 'Carta (Portrait)',
        path: '/admin/procurement/receiving-print',
        description: 'Control de pesaje y cotejo de mercancía recibida en muelle'
    },
    {
        key: 'labels',
        label: 'Rótulos Térmicos de Canastilla (QR)',
        shortLabel: 'Rótulos Canastilla (100×50)',
        paperFormat: '100mm × 50mm (Rollo)',
        path: '/admin/orders/print-labels',
        description: 'Etiquetas térmicas con código QR, ID amigable y bahía'
    },
    {
        key: 'manifest',
        label: 'Manifiesto de Ruta & Control de Canastillas',
        shortLabel: 'Manifiesto de Ruta & Canastillas (Oficio)',
        paperFormat: 'Oficio (Portrait)',
        path: '/admin/orders/contingency-print?mode=dispatch',
        description: 'Control de salida en portería, paradas, conductor y balance de canastillas'
    },
    {
        key: 'contingency',
        label: 'Kit de Contingencia & Remisiones',
        shortLabel: 'Kit Contingencia (Carta)',
        paperFormat: 'Carta (Portrait)',
        path: '/admin/orders/contingency-print',
        description: 'Juego físico de respaldo ante caídas de red o fallas eléctricas'
    }
];

/**
 * Obtiene la fecha en zona horaria Colombia (America/Bogota) con offset en días
 */
export function getBogotaDate(offsetDays: number = 0): string {
    const now = new Date();
    const bogotaDateStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
    const [y, m, d] = bogotaDateStr.split('-').map(Number);
    const target = new Date(y, m - 1, d + offsetDays);
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

interface PrintDocumentSwitcherProps {
    currentDoc: PrintDocumentKey;
    selectedDate: string;
    onDateChange?: (newDate: string) => void;
    orderIds?: string;
    variant?: 'light' | 'dark';
    showShortcuts?: boolean;
}

export default function PrintDocumentSwitcher({
    currentDoc,
    selectedDate,
    onDateChange,
    orderIds,
    variant = 'light',
    showShortcuts = true
}: PrintDocumentSwitcherProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const activeOrderIds = orderIds || searchParams?.get('orderIds') || searchParams?.get('ids') || '';

    const yesterdayStr = getBogotaDate(-1);
    const todayStr = getBogotaDate(0);
    const tomorrowStr = getBogotaDate(1);

    const isYesterday = selectedDate === yesterdayStr;
    const isToday = selectedDate === todayStr;
    const isTomorrow = selectedDate === tomorrowStr;

    // Cambiar de documento manteniendo la fecha y los orderIds
    const handleSelectDocument = (newDocKey: string) => {
        if (newDocKey === currentDoc) return;
        const targetDoc = PRINT_DOCUMENTS.find(d => d.key === newDocKey);
        if (!targetDoc) return;

        const params = new URLSearchParams();
        if (selectedDate) params.set('date', selectedDate);
        if (activeOrderIds) params.set('orderIds', activeOrderIds);

        const [basePath, targetQuery] = targetDoc.path.split('?');
        if (targetQuery) {
            const extraParams = new URLSearchParams(targetQuery);
            extraParams.forEach((val, key) => params.set(key, val));
        }

        router.push(`${basePath}?${params.toString()}`);
    };

    // Cambiar fecha
    const handleApplyDate = (newDateStr: string) => {
        if (!newDateStr) return;
        if (onDateChange) {
            onDateChange(newDateStr);
        }
        
        // Sincronizar URL manteniendo documento activo
        const currentDocObj = PRINT_DOCUMENTS.find(d => d.key === currentDoc);
        if (currentDocObj) {
            const params = new URLSearchParams();
            params.set('date', newDateStr);
            if (activeOrderIds) params.set('orderIds', activeOrderIds);

            const [basePath, targetQuery] = currentDocObj.path.split('?');
            if (targetQuery) {
                const extraParams = new URLSearchParams(targetQuery);
                extraParams.forEach((val, key) => params.set(key, val));
            }

            router.replace(`${basePath}?${params.toString()}`);
        }
    };

    const isDark = variant === 'dark';
    const containerBg = isDark ? '#1E293B' : '#F8FAFC';
    const borderColor = isDark ? '#334155' : '#CBD5E1';
    const textColor = isDark ? '#F1F5F9' : '#0F172A';
    const labelColor = isDark ? '#94A3B8' : '#475569';
    const activeShortcutBg = '#0D7A57';
    const inactiveShortcutBg = isDark ? '#334155' : '#FFFFFF';
    const shortcutBorder = isDark ? '#475569' : '#CBD5E1';

    return (
        <div 
            className="no-print" 
            style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '6px', 
                flexWrap: 'nowrap' 
            }}
        >
            {/* 1. Selector de Documento Imprimible */}
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: containerBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                padding: '2px 8px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                <FileText size={13} color="#0D7A57" />
                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: labelColor }}>
                    Doc:
                </span>
                <select
                    value={currentDoc}
                    onChange={(e) => handleSelectDocument(e.target.value)}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.76rem',
                        fontWeight: '800',
                        color: textColor,
                        outline: 'none',
                        cursor: 'pointer'
                    }}
                    title="Alterna entre los 5 documentos imprimibles oficiales conservando la fecha"
                >
                    {PRINT_DOCUMENTS.map((doc) => (
                        <option 
                            key={doc.key} 
                            value={doc.key} 
                            style={{ backgroundColor: isDark ? '#1E293B' : '#FFFFFF', color: isDark ? '#F1F5F9' : '#0F172A' }}
                        >
                            {doc.shortLabel}
                        </option>
                    ))}
                </select>
            </div>

            {/* 2. Selector de Fecha */}
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: containerBg,
                border: `1px solid ${borderColor}`,
                borderRadius: '6px',
                padding: '2px 8px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}>
                <span style={{ fontSize: '0.72rem', fontWeight: '800', color: labelColor }}>
                    Fecha:
                </span>
                <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => handleApplyDate(e.target.value)}
                    style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '0.76rem',
                        fontWeight: '800',
                        color: textColor,
                        outline: 'none',
                        cursor: 'pointer'
                    }}
                    title="Cambia la fecha de la tanda operacional"
                />
            </div>

            {/* 3. Atajos Rápidos: Ayer, Hoy, Mañana */}
            {showShortcuts && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <button
                        type="button"
                        onClick={() => handleApplyDate(yesterdayStr)}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.7rem',
                            fontWeight: isYesterday ? '800' : '600',
                            borderRadius: '4px',
                            border: `1px solid ${isYesterday ? '#0D7A57' : shortcutBorder}`,
                            backgroundColor: isYesterday ? activeShortcutBg : inactiveShortcutBg,
                            color: isYesterday ? '#FFFFFF' : labelColor,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        title={`Auditar tanda de ayer (${yesterdayStr})`}
                    >
                        Ayer
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyDate(todayStr)}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.7rem',
                            fontWeight: isToday ? '800' : '600',
                            borderRadius: '4px',
                            border: `1px solid ${isToday ? '#0D7A57' : shortcutBorder}`,
                            backgroundColor: isToday ? activeShortcutBg : inactiveShortcutBg,
                            color: isToday ? '#FFFFFF' : labelColor,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        title={`Tanda de hoy (${todayStr})`}
                    >
                        Hoy
                    </button>
                    <button
                        type="button"
                        onClick={() => handleApplyDate(tomorrowStr)}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.7rem',
                            fontWeight: isTomorrow ? '800' : '600',
                            borderRadius: '4px',
                            border: `1px solid ${isTomorrow ? '#0D7A57' : shortcutBorder}`,
                            backgroundColor: isTomorrow ? activeShortcutBg : inactiveShortcutBg,
                            color: isTomorrow ? '#FFFFFF' : labelColor,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                        title={`Tanda de mañana (${tomorrowStr})`}
                    >
                        Mañana
                    </button>
                </div>
            )}
        </div>
    );
}
