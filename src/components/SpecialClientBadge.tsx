'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
    Sparkles,
    ShieldAlert,
    TrendingDown,
    CheckCircle2,
    Scale,
    SlidersHorizontal,
    PackageCheck
} from 'lucide-react';
import { SpecialAttentionState, SpecialAttentionDirective } from '@/lib/specialClientAttention';

interface SpecialClientBadgeProps {
    state?: SpecialAttentionState | null;
    darkMode?: boolean;
    compact?: boolean;
    variant?: 'pill' | 'print-stamp';
}

export default function SpecialClientBadge({
    state,
    darkMode = false,
    compact = false,
    variant = 'pill'
}: SpecialClientBadgeProps) {
    const [open, setOpen] = useState(false);
    const wrapRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (!open) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    if (!state || !state.active) return null;

    // En documentos impresos (print-stamp), renderizar micro-etiqueta tipográfica ultra-compacta
    // sin popover flotante que tape filas de la tabla en la vista previa de impresión.
    if (variant === 'print-stamp') {
        return (
            <span
                title={`${state.title} (${state.progressLabel}) — ${state.subtitle}`}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    padding: '0.5px 3.5px',
                    borderRadius: '2px',
                    fontSize: '5.5pt',
                    fontWeight: 900,
                    backgroundColor: state.colors.bg,
                    color: state.colors.text,
                    border: `1px solid ${state.colors.border}`,
                    letterSpacing: '0.03em',
                    lineHeight: 1.05,
                    marginLeft: '4px',
                    verticalAlign: 'middle',
                    flexShrink: 0,
                    whiteSpace: 'nowrap'
                }}
            >
                {state.printStamp}
            </span>
        );
    }

    const bg = darkMode ? state.colors.darkBg : state.colors.bg;
    const border = darkMode ? state.colors.darkBorder : state.colors.border;
    const text = darkMode ? state.colors.darkText : state.colors.text;

    const renderReasonIcon = (size = 10) => {
        if (state.reason === 'recurring_pqr') {
            return <ShieldAlert size={size} strokeWidth={2.4} style={{ flexShrink: 0 }} />;
        }
        if (state.reason === 'low_consumption') {
            return <TrendingDown size={size} strokeWidth={2.4} style={{ flexShrink: 0 }} />;
        }
        return <Sparkles size={size} strokeWidth={2.4} style={{ flexShrink: 0 }} />;
    };

    const renderDirectiveIcon = (key: SpecialAttentionDirective['key']) => {
        switch (key) {
            case 'selection':
                return <CheckCircle2 size={11} strokeWidth={2.2} color={state.colors.border} style={{ flexShrink: 0 }} />;
            case 'weight':
                return <Scale size={11} strokeWidth={2.2} color={state.colors.border} style={{ flexShrink: 0 }} />;
            case 'specs':
                return <SlidersHorizontal size={11} strokeWidth={2.2} color={state.colors.border} style={{ flexShrink: 0 }} />;
            case 'crates':
                return <PackageCheck size={11} strokeWidth={2.2} color={state.colors.border} style={{ flexShrink: 0 }} />;
        }
    };

    return (
        <span
            ref={wrapRef}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onClick={(e) => {
                e.stopPropagation();
                setOpen(prev => !prev);
            }}
            style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                verticalAlign: 'middle',
                cursor: 'pointer',
                userSelect: 'none',
                flexShrink: 0
            }}
        >
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px',
                    height: '17px',
                    padding: compact ? '0 4px' : '0 5px',
                    borderRadius: '4px',
                    fontSize: '0.62rem',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '0.02em',
                    backgroundColor: bg,
                    color: text,
                    border: `1px solid ${border}`,
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                    transition: 'box-shadow 0.12s ease',
                    boxShadow: open ? `0 0 0 2px ${border}33` : 'none'
                }}
            >
                {renderReasonIcon(10)}
                <span>{compact ? state.progressLabel : `${state.shortTag} ${state.progressLabel}`}</span>
            </span>

            {/* Compact Swiss-Precision Tooltip (Hidden when printing) */}
            {open && (
                <div
                    className="no-print"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 5px)',
                        left: 0,
                        zIndex: 9999,
                        width: '220px',
                        backgroundColor: '#0F172A',
                        color: '#F8FAFC',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        boxShadow: '0 8px 20px -4px rgba(0, 0, 0, 0.45)',
                        border: `1px solid ${state.colors.border}`,
                        textAlign: 'left',
                        fontWeight: 'normal',
                        whiteSpace: 'normal',
                        pointerEvents: 'auto'
                    }}
                >
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '4px',
                        marginBottom: '3px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.69rem',
                            fontWeight: 800,
                            color: state.colors.darkText
                        }}>
                            {renderReasonIcon(11)}
                            <span>{state.title}</span>
                        </div>
                        <span style={{
                            fontSize: '0.60rem',
                            fontWeight: 800,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: state.colors.darkBg,
                            color: state.colors.darkText,
                            border: `1px solid ${state.colors.border}`,
                            whiteSpace: 'nowrap'
                        }}>
                            {state.progressLabel}
                        </span>
                    </div>

                    {/* Subtitle / Reason */}
                    <div style={{
                        fontSize: '0.63rem',
                        color: '#CBD5E1',
                        lineHeight: 1.3,
                        marginBottom: '6px'
                    }}>
                        {state.subtitle}
                    </div>

                    {/* 4 Operational Care Directives (Compact 2x2 Grid) */}
                    <div style={{
                        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                        paddingTop: '5px',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '4px'
                    }}>
                        {state.directives.map((d) => (
                            <div
                                key={d.key}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    padding: '2.5px 5px',
                                    borderRadius: '4px',
                                    fontSize: '0.60rem',
                                    fontWeight: 700,
                                    color: '#F1F5F9',
                                    whiteSpace: 'nowrap'
                                }}
                                title={d.detail}
                            >
                                {renderDirectiveIcon(d.key)}
                                <span>{d.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </span>
    );
}
