'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
    HelpCircle, 
    Target, 
    Calculator, 
    AlertCircle, 
    Activity, 
    Info 
} from 'lucide-react';
import { THEME } from '@/lib/adminTheme';

interface ProcessTooltipProps {
    title: string;
    formula?: string;
    description: string;
    worldClassTarget?: string;
    consequence?: string;
    align?: 'left' | 'right' | 'center';
}

export default function ProcessTooltip({
    title,
    formula,
    description,
    worldClassTarget,
    consequence,
    align = 'center'
}: ProcessTooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [placement, setPlacement] = useState<'top' | 'bottom'>('bottom');
    const [horizontalAlign, setHorizontalAlign] = useState<'left' | 'right' | 'center'>(align);
    const containerRef = useRef<HTMLDivElement>(null);

    const calculatePosition = useCallback(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;

        // If space above is tight (< 280px), open downwards so it doesn't get clipped by viewport top
        if (spaceAbove < 280) {
            setPlacement('bottom');
        } else if (spaceBelow < 280) {
            setPlacement('top');
        } else {
            // Default downward for upper HUD cards
            setPlacement('bottom');
        }

        // Check horizontal boundary clipping
        const tooltipHalfWidth = 145; // half of 290px
        const screenWidth = window.innerWidth;

        if (rect.left + tooltipHalfWidth > screenWidth - 20) {
            setHorizontalAlign('right');
        } else if (rect.left - tooltipHalfWidth < 20) {
            setHorizontalAlign('left');
        } else {
            setHorizontalAlign(align);
        }
    }, [align]);

    const handleOpen = () => {
        calculatePosition();
        setIsVisible(true);
    };

    const handleClose = () => {
        setIsVisible(false);
    };

    const handleToggle = () => {
        if (!isVisible) {
            calculatePosition();
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    };

    useEffect(() => {
        if (!isVisible) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsVisible(false);
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsVisible(false);
        };

        const handleScrollOrResize = () => {
            calculatePosition();
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        window.addEventListener('resize', handleScrollOrResize);
        window.addEventListener('scroll', handleScrollOrResize, true);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', handleScrollOrResize);
            window.removeEventListener('scroll', handleScrollOrResize, true);
        };
    }, [isVisible, calculatePosition]);

    const verticalStyles = placement === 'bottom'
        ? { top: 'calc(100% + 8px)', bottom: 'auto' }
        : { bottom: 'calc(100% + 8px)', top: 'auto' };

    const horizontalStyles = 
        horizontalAlign === 'left'
            ? { left: 0, right: 'auto', transform: 'none' }
            : horizontalAlign === 'right'
            ? { right: 0, left: 'auto', transform: 'none' }
            : { left: '50%', right: 'auto', transform: 'translateX(-50%)' };

    return (
        <div 
            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle' }} 
            ref={containerRef}
        >
            <button
                type="button"
                onClick={handleToggle}
                onMouseEnter={handleOpen}
                onMouseLeave={handleClose}
                onFocus={handleOpen}
                onBlur={handleClose}
                style={{
                    background: isVisible ? '#E2E8F0' : 'transparent',
                    border: 'none',
                    padding: '3px',
                    color: isVisible ? '#0F172A' : '#94A3B8',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    transition: 'all 0.15s ease-in-out'
                }}
                aria-label={`Información sobre ${title}`}
            >
                <HelpCircle size={14} />
            </button>

            {isVisible && (
                <div 
                    style={{
                        position: 'absolute',
                        ...verticalStyles,
                        ...horizontalStyles,
                        zIndex: 9999,
                        width: '290px',
                        maxWidth: 'calc(100vw - 32px)',
                        padding: '12px 14px',
                        backgroundColor: '#0F172A',
                        color: 'white',
                        fontSize: '0.75rem',
                        borderRadius: '12px',
                        boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                        border: '1px solid #334155',
                        lineHeight: '1.45',
                        pointerEvents: 'auto'
                    }}
                    role="tooltip"
                >
                    {/* Header */}
                    <div style={{ 
                        fontWeight: '800', 
                        fontSize: '0.8rem', 
                        color: '#34D399', 
                        marginBottom: '6px', 
                        borderBottom: '1px solid #1E293B', 
                        paddingBottom: '6px', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        gap: '8px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Info size={14} color="#34D399" style={{ flexShrink: 0 }} />
                            <span>{title}</span>
                        </div>
                        <span style={{ 
                            fontSize: '0.58rem', 
                            fontWeight: '800',
                            textTransform: 'uppercase', 
                            fontFamily: 'monospace', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            backgroundColor: '#1E293B', 
                            color: '#94A3B8',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            flexShrink: 0
                        }}>
                            <Activity size={10} color="#94A3B8" />
                            INDICADOR LEAN
                        </span>
                    </div>

                    {/* Formula */}
                    {formula && (
                        <div style={{ 
                            margin: '6px 0', 
                            padding: '7px 9px', 
                            backgroundColor: '#020617', 
                            borderRadius: '8px', 
                            border: '1px solid #1E293B', 
                            fontSize: '0.68rem',
                            color: '#6EE7B7',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '3px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#34D399', fontWeight: '700', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                <Calculator size={11} color="#34D399" />
                                <span>Fórmula Lean:</span>
                            </div>
                            <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#E2E8F0', paddingLeft: '16px' }}>
                                {formula}
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <p style={{ color: '#CBD5E1', fontSize: '0.73rem', margin: '6px 0', lineHeight: '1.45', fontWeight: '400' }}>
                        {description}
                    </p>

                    {/* Target */}
                    {worldClassTarget && (
                        <div style={{ 
                            marginTop: '8px', 
                            padding: '6px 8px',
                            backgroundColor: 'rgba(120, 53, 15, 0.25)',
                            border: '1px solid rgba(245, 158, 11, 0.35)',
                            borderRadius: '8px',
                            fontSize: '0.7rem', 
                            fontWeight: '700', 
                            color: '#FCD34D', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            gap: '6px' 
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <Target size={13} color="#FCD34D" style={{ flexShrink: 0 }} />
                                <span>Meta Clase Mundial:</span>
                            </div>
                            <span style={{ 
                                fontFamily: 'monospace', 
                                backgroundColor: '#451A03', 
                                padding: '2px 6px', 
                                borderRadius: '4px', 
                                border: '1px solid #78350F', 
                                color: '#FEF3C7',
                                fontWeight: '800'
                            }}>
                                {worldClassTarget}
                            </span>
                        </div>
                    )}

                    {/* Consequence */}
                    {consequence && (
                        <div style={{ 
                            marginTop: '8px', 
                            fontSize: '0.68rem', 
                            color: '#94A3B8', 
                            borderTop: '1px solid #1E293B', 
                            paddingTop: '6px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '6px',
                            lineHeight: '1.4'
                        }}>
                            <AlertCircle size={13} color="#F87171" style={{ flexShrink: 0, marginTop: '2px' }} />
                            <div>
                                <strong style={{ color: '#FCA5A5' }}>Acción ante desvío: </strong> 
                                <span style={{ color: '#CBD5E1' }}>{consequence}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
