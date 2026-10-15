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

    const bg = darkMode ? state.colors.darkBg : state.colors.bg;
    const border = darkMode ? state.colors.darkBorder : state.colors.border;
    const text = darkMode ? state.colors.darkText : state.colors.text;

    const renderReasonIcon = (size = 12) => {
        if (state.reason === 'recurring_pqr') {
            return <ShieldAlert size={size} strokeWidth={2.2} style={{ flexShrink: 0 }} />;
        }
        if (state.reason === 'low_consumption') {
            return <TrendingDown size={size} strokeWidth={2.2} style={{ flexShrink: 0 }} />;
        }
        return <Sparkles size={size} strokeWidth={2.2} style={{ flexShrink: 0 }} />;
    };

    const renderDirectiveIcon = (key: SpecialAttentionDirective['key']) => {
        switch (key) {
            case 'selection':
                return <CheckCircle2 size={12} strokeWidth={2} color={state.colors.border} style={{ flexShrink: 0 }} />;
            case 'weight':
                return <Scale size={12} strokeWidth={2} color={state.colors.border} style={{ flexShrink: 0 }} />;
            case 'specs':
                return <SlidersHorizontal size={12} strokeWidth={2} color={state.colors.border} style={{ flexShrink: 0 }} />;
            case 'crates':
                return <PackageCheck size={12} strokeWidth={2} color={state.colors.border} style={{ flexShrink: 0 }} />;
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
                userSelect: 'none'
            }}
        >
            {variant === 'print-stamp' ? (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px',
                        padding: '0.5px 4px',
                        borderRadius: '3px',
                        fontSize: '6.2pt',
                        fontWeight: 900,
                        backgroundColor: state.colors.bg,
                        color: state.colors.text,
                        border: `1.2px solid ${state.colors.border}`,
                        letterSpacing: '0.02em',
                        lineHeight: 1.1,
                        marginRight: '4px',
                        flexShrink: 0
                    }}
                >
                    [{state.printStamp}]
                </span>
            ) : (
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: compact ? '2px 6px' : '2px 8px',
                        borderRadius: '999px',
                        fontSize: compact ? '0.66rem' : '0.70rem',
                        fontWeight: 800,
                        backgroundColor: bg,
                        color: text,
                        border: `1px solid ${border}`,
                        lineHeight: 1.2,
                        whiteSpace: 'nowrap',
                        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
                        boxShadow: open ? `0 0 0 2px ${border}33` : 'none'
                    }}
                >
                    {renderReasonIcon(compact ? 11 : 12)}
                    <span>{compact ? state.progressLabel : `${state.shortTag} · ${state.progressLabel}`}</span>
                </span>
            )}

            {/* Floating Tooltip / Popover (Hidden when printing) */}
            {open && (
                <div
                    className="no-print"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 9999,
                        width: '270px',
                        backgroundColor: '#0F172A',
                        color: '#F8FAFC',
                        borderRadius: '10px',
                        padding: '10px 12px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.45), 0 4px 10px -2px rgba(0, 0, 0, 0.3)',
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
                        gap: '6px',
                        marginBottom: '4px'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '0.74rem',
                            fontWeight: 800,
                            color: state.colors.darkText
                        }}>
                            {renderReasonIcon(13)}
                            <span>{state.title}</span>
                        </div>
                        <span style={{
                            fontSize: '0.64rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '999px',
                            backgroundColor: state.colors.darkBg,
                            color: state.colors.darkText,
                            border: `1px solid ${state.colors.border}`
                        }}>
                            Ciclo {state.progressLabel}
                        </span>
                    </div>

                    {/* Subtitle / Reason */}
                    <div style={{
                        fontSize: '0.68rem',
                        color: '#CBD5E1',
                        lineHeight: 1.35,
                        marginBottom: '8px'
                    }}>
                        {state.subtitle}
                    </div>

                    {/* 4 Operational Care Directives */}
                    <div style={{
                        borderTop: '1px solid rgba(255, 255, 255, 0.12)',
                        paddingTop: '6px'
                    }}>
                        <div style={{
                            fontSize: '0.60rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: '#94A3B8',
                            marginBottom: '5px'
                        }}>
                            Especial cuidado en operación:
                        </div>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '5px'
                        }}>
                            {state.directives.map((d) => (
                                <div
                                    key={d.key}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        padding: '4px 6px',
                                        borderRadius: '6px',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        color: '#F1F5F9'
                                    }}
                                    title={d.detail}
                                >
                                    {renderDirectiveIcon(d.key)}
                                    <span>{d.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </span>
    );
}
