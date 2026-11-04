'use client';

import React, { useState, useEffect, useRef } from 'react';
import { X, Check, ArrowRight, RotateCcw, Ban, Sparkles, SlidersHorizontal, ArrowLeftRight } from 'lucide-react';

export type FilterOperator = 
    | 'equal'          // = Igual que
    | 'not_equal'      // != Diferente de
    | 'greater'        // > Mayor que
    | 'greater_equal'  // >= Mayor o igual que
    | 'less'           // < Menor que
    | 'less_equal'     // <= Menor o igual que
    | 'range'          // en rango de
    | 'blank'          // en blanco
    | 'with_values';   // con valores

export interface InventoryColumnFilterPopoverProps {
    colKey: string;
    colTitle: string;
    colSign?: string;
    currentValue: string;
    anchorRect: DOMRect | null;
    isOpen: boolean;
    onClose: () => void;
    onApplyFilter: (value: string) => void;
    onClearFilter: () => void;
}

export const parseFilterString = (filterStr: string) => {
    const raw = (filterStr || '').trim().toLowerCase();
    if (!raw) return { operator: null as FilterOperator | null, value: '', rangeMin: '', rangeMax: '' };
    if (raw === 'en blanco' || raw === 'blanco' || raw === 'vacío' || raw === 'vacio') {
        return { operator: 'blank' as FilterOperator, value: '', rangeMin: '', rangeMax: '' };
    }
    if (raw === 'con valores' || raw === 'con datos' || raw === 'lleno') {
        return { operator: 'with_values' as FilterOperator, value: '', rangeMin: '', rangeMax: '' };
    }
    if (raw.includes('..') || raw.includes(' a ')) {
        const parts = raw.includes('..') ? raw.split('..') : raw.split(' a ');
        return { 
            operator: 'range' as FilterOperator, 
            value: '', 
            rangeMin: parts[0]?.trim() || '', 
            rangeMax: parts[1]?.trim() || '' 
        };
    }
    if (raw.startsWith('>=')) return { operator: 'greater_equal' as FilterOperator, value: raw.substring(2).trim(), rangeMin: '', rangeMax: '' };
    if (raw.startsWith('<=')) return { operator: 'less_equal' as FilterOperator, value: raw.substring(2).trim(), rangeMin: '', rangeMax: '' };
    if (raw.startsWith('!=') || raw.startsWith('<>')) return { operator: 'not_equal' as FilterOperator, value: raw.replace(/^(!=|<>)/, '').trim(), rangeMin: '', rangeMax: '' };
    if (raw.startsWith('>')) return { operator: 'greater' as FilterOperator, value: raw.substring(1).trim(), rangeMin: '', rangeMax: '' };
    if (raw.startsWith('<')) return { operator: 'less' as FilterOperator, value: raw.substring(1).trim(), rangeMin: '', rangeMax: '' };
    if (raw.startsWith('=')) return { operator: 'equal' as FilterOperator, value: raw.substring(1).trim(), rangeMin: '', rangeMax: '' };
    
    // Si es un número sin operador
    return { operator: 'equal' as FilterOperator, value: raw, rangeMin: '', rangeMax: '' };
};

const OPERATORS_GRID: { id: FilterOperator; symbol: string; label: string }[] = [
    { id: 'greater', symbol: '>', label: 'Mayor que' },
    { id: 'greater_equal', symbol: '≥', label: 'Mayor o igual' },
    { id: 'equal', symbol: '=', label: 'Igual a' },
    { id: 'not_equal', symbol: '≠', label: 'Diferente de' },
    { id: 'less', symbol: '<', label: 'Menor que' },
    { id: 'less_equal', symbol: '≤', label: 'Menor o igual' },
];

export const InventoryColumnFilterPopover: React.FC<InventoryColumnFilterPopoverProps> = ({
    colKey,
    colTitle,
    colSign,
    currentValue,
    anchorRect,
    isOpen,
    onClose,
    onApplyFilter,
    onClearFilter
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [selectedOp, setSelectedOp] = useState<FilterOperator>('greater');
    const [numValue, setNumValue] = useState<string>('0');
    const [rangeMin, setRangeMin] = useState<string>('');
    const [rangeMax, setRangeMax] = useState<string>('');

    // Sincronizar estado interno cuando se abre con el valor actual
    useEffect(() => {
        if (isOpen) {
            const parsed = parseFilterString(currentValue);
            if (parsed.operator) {
                setSelectedOp(parsed.operator);
                if (parsed.operator === 'range') {
                    setRangeMin(parsed.rangeMin);
                    setRangeMax(parsed.rangeMax);
                } else if (parsed.operator !== 'blank' && parsed.operator !== 'with_values') {
                    setNumValue(parsed.value || '0');
                }
            } else {
                setSelectedOp('greater');
                setNumValue('0');
                setRangeMin('');
                setRangeMax('');
            }

            // Autofocus en el input tras renderizar
            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 60);
        }
    }, [isOpen, currentValue]);

    // Cerrar al hacer click afuera o presionar Escape
    useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !anchorRect) return null;

    // Cálculo de posición absoluta en viewport (Fixed)
    const popoverWidth = 295;
    const padding = 12;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.left;

    // Evitar desborde horizontal en extremos
    if (left + popoverWidth > window.innerWidth - padding) {
        left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) left = padding;

    // Si desborda por abajo, mostrarlo arriba
    const estimatedHeight = 360;
    if (top + estimatedHeight > window.innerHeight && anchorRect.top > estimatedHeight + 10) {
        top = anchorRect.top - estimatedHeight - 6;
    }

    // Acciones de aplicación directa
    const handleQuickAction = (op: 'blank' | 'with_values') => {
        if (op === 'blank') {
            onApplyFilter('en blanco');
        } else {
            onApplyFilter('con valores');
        }
        onClose();
    };

    const handleApplyOp = () => {
        if (selectedOp === 'blank') {
            onApplyFilter('en blanco');
            onClose();
            return;
        }
        if (selectedOp === 'with_values') {
            onApplyFilter('con valores');
            onClose();
            return;
        }
        if (selectedOp === 'range') {
            const min = rangeMin.trim();
            const max = rangeMax.trim();
            if (min !== '' && max !== '') {
                onApplyFilter(`${min}..${max}`);
            } else if (min !== '') {
                onApplyFilter(`>=${min}`);
            } else if (max !== '') {
                onApplyFilter(`<=${max}`);
            }
            onClose();
            return;
        }

        const val = numValue.trim() || '0';
        let prefix = '';
        switch (selectedOp) {
            case 'equal': prefix = '='; break;
            case 'not_equal': prefix = '!='; break;
            case 'greater': prefix = '>'; break;
            case 'greater_equal': prefix = '>='; break;
            case 'less': prefix = '<'; break;
            case 'less_equal': prefix = '<='; break;
        }
        onApplyFilter(`${prefix}${val}`);
        onClose();
    };

    const hasActiveFilter = currentValue && currentValue.trim().length > 0;
    
    // Limpieza de signo para evitar bug de doble paréntesis "( (-))"
    const cleanSign = (colSign || '').replace(/^\(+|\)+$/g, '').trim();

    return (
        <div
            ref={popoverRef}
            style={{
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                width: `${popoverWidth}px`,
                backgroundColor: '#0F172A',
                backgroundImage: 'linear-gradient(180deg, #1E293B 0%, #0F172A 100%)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                zIndex: 99999,
                fontFamily: 'var(--font-outfit), sans-serif',
                color: '#F8FAFC',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxSizing: 'border-box'
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Header del Popover */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(51, 65, 85, 0.8)', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                    <span style={{
                        backgroundColor: 'rgba(2, 132, 199, 0.2)',
                        color: '#38BDF8',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        fontSize: '0.70rem',
                        fontWeight: '800',
                        border: '1px solid rgba(56, 189, 248, 0.4)',
                        letterSpacing: '0.02em',
                        flexShrink: 0
                    }}>
                        Col. {colKey}
                    </span>
                    <span style={{ 
                        fontSize: '0.78rem', 
                        fontWeight: '700', 
                        color: '#F1F5F9', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap' 
                    }}>
                        {colTitle}
                    </span>
                    {cleanSign && (
                        <span style={{ 
                            fontSize: '0.68rem', 
                            color: cleanSign.includes('+') ? '#34D399' : (cleanSign.includes('-') ? '#F87171' : '#94A3B8'),
                            backgroundColor: 'rgba(255, 255, 255, 0.06)',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            fontWeight: '600',
                            flexShrink: 0
                        }}>
                            ({cleanSign})
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94A3B8',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px',
                        transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
                    <X size={15} />
                </button>
            </div>

            {/* Accesos Rápidos: En Blanco vs Con Valores */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                    type="button"
                    onClick={() => handleQuickAction('blank')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '6px 8px',
                        backgroundColor: currentValue.toLowerCase() === 'en blanco' ? '#047857' : 'rgba(30, 41, 59, 0.8)',
                        color: currentValue.toLowerCase() === 'en blanco' ? '#FFFFFF' : '#CBD5E1',
                        border: currentValue.toLowerCase() === 'en blanco' ? '1px solid #10B981' : '1px solid #334155',
                        borderRadius: '7px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                    title="Muestra registros en cero o vacíos"
                >
                    <Ban size={13} style={{ color: currentValue.toLowerCase() === 'en blanco' ? '#FFFFFF' : '#94A3B8' }} />
                    <span>En blanco</span>
                </button>
                <button
                    type="button"
                    onClick={() => handleQuickAction('with_values')}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '6px 8px',
                        backgroundColor: currentValue.toLowerCase() === 'con valores' ? '#0284C7' : 'rgba(30, 41, 59, 0.8)',
                        color: currentValue.toLowerCase() === 'con valores' ? '#FFFFFF' : '#CBD5E1',
                        border: currentValue.toLowerCase() === 'con valores' ? '1px solid #38BDF8' : '1px solid #334155',
                        borderRadius: '7px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                    }}
                    title="Muestra registros con valor distinto de cero"
                >
                    <Sparkles size={13} style={{ color: currentValue.toLowerCase() === 'con valores' ? '#FFFFFF' : '#38BDF8' }} />
                    <span>Con valores</span>
                </button>
            </div>

            {/* Grid Ergonómica de Operadores Numéricos (Sin barra de scroll fea) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '1px 2px' }}>
                    Condición Numérica
                </span>
                
                {/* 2 Columnas de Operadores Comunes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    {OPERATORS_GRID.map((op) => {
                        const isSelected = selectedOp === op.id;
                        return (
                            <button
                                key={op.id}
                                type="button"
                                onClick={() => {
                                    setSelectedOp(op.id);
                                    setTimeout(() => inputRef.current?.focus(), 30);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '5px 7px',
                                    backgroundColor: isSelected ? 'rgba(56, 189, 248, 0.16)' : 'rgba(30, 41, 59, 0.5)',
                                    border: isSelected ? '1px solid #0284C7' : '1px solid #334155',
                                    borderRadius: '6px',
                                    color: isSelected ? '#38BDF8' : '#E2E8F0',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.70rem',
                                    transition: 'all 0.12s ease'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '18px',
                                        height: '18px',
                                        backgroundColor: isSelected ? '#0284C7' : '#1E293B',
                                        color: isSelected ? '#FFFFFF' : '#94A3B8',
                                        borderRadius: '4px',
                                        fontSize: '0.74rem',
                                        fontWeight: '800',
                                        border: isSelected ? 'none' : '1px solid #475569'
                                    }}>
                                        {op.symbol}
                                    </span>
                                    <span style={{ fontWeight: isSelected ? '700' : '500' }}>{op.label}</span>
                                </div>
                                {isSelected && <Check size={12} style={{ color: '#38BDF8', flexShrink: 0 }} />}
                            </button>
                        );
                    })}
                </div>

                {/* Botón de Rango Completo */}
                <button
                    type="button"
                    onClick={() => {
                        setSelectedOp('range');
                        setTimeout(() => inputRef.current?.focus(), 30);
                    }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 8px',
                        backgroundColor: selectedOp === 'range' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(30, 41, 59, 0.5)',
                        border: selectedOp === 'range' ? '1px solid #0284C7' : '1px solid #334155',
                        borderRadius: '6px',
                        color: selectedOp === 'range' ? '#38BDF8' : '#CBD5E1',
                        cursor: 'pointer',
                        fontSize: '0.70rem',
                        transition: 'all 0.12s ease',
                        marginTop: '1px'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '18px',
                            height: '18px',
                            backgroundColor: selectedOp === 'range' ? '#0284C7' : '#1E293B',
                            color: selectedOp === 'range' ? '#FFFFFF' : '#94A3B8',
                            borderRadius: '4px',
                            border: selectedOp === 'range' ? 'none' : '1px solid #475569'
                        }}>
                            <ArrowLeftRight size={11} />
                        </span>
                        <span style={{ fontWeight: selectedOp === 'range' ? '700' : '500' }}>En rango de valores (Mín..Máx)</span>
                    </div>
                    {selectedOp === 'range' && <Check size={12} style={{ color: '#38BDF8' }} />}
                </button>
            </div>

            {/* Sección de Entrada de Valores y Botón Aplicar */}
            {selectedOp !== 'blank' && selectedOp !== 'with_values' && (
                <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.8)', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedOp === 'range' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                            <div>
                                <label style={{ fontSize: '0.62rem', color: '#94A3B8', display: 'block', marginBottom: '2px', fontWeight: '600' }}>Desde (Mín)</label>
                                <input
                                    ref={inputRef}
                                    type="number"
                                    step="any"
                                    value={rangeMin}
                                    onChange={e => setRangeMin(e.target.value)}
                                    placeholder="0"
                                    onKeyDown={e => e.key === 'Enter' && handleApplyOp()}
                                    style={{
                                        width: '100%',
                                        height: '28px',
                                        backgroundColor: '#1E293B',
                                        border: '1px solid #475569',
                                        borderRadius: '6px',
                                        color: '#FFFFFF',
                                        padding: '0 8px',
                                        fontSize: '0.78rem',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.62rem', color: '#94A3B8', display: 'block', marginBottom: '2px', fontWeight: '600' }}>Hasta (Máx)</label>
                                <input
                                    type="number"
                                    step="any"
                                    value={rangeMax}
                                    onChange={e => setRangeMax(e.target.value)}
                                    placeholder="100"
                                    onKeyDown={e => e.key === 'Enter' && handleApplyOp()}
                                    style={{
                                        width: '100%',
                                        height: '28px',
                                        backgroundColor: '#1E293B',
                                        border: '1px solid #475569',
                                        borderRadius: '6px',
                                        color: '#FFFFFF',
                                        padding: '0 8px',
                                        fontSize: '0.78rem',
                                        outline: 'none',
                                        boxSizing: 'border-box'
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                                <label style={{ fontSize: '0.62rem', color: '#94A3B8', fontWeight: '700' }}>
                                    Valor a comparar ({OPERATORS_GRID.find(o => o.id === selectedOp)?.symbol})
                                </label>
                            </div>
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input
                                        ref={inputRef}
                                        type="number"
                                        step="any"
                                        value={numValue}
                                        onChange={e => setNumValue(e.target.value)}
                                        placeholder="0"
                                        onKeyDown={e => e.key === 'Enter' && handleApplyOp()}
                                        style={{
                                            width: '100%',
                                            height: '28px',
                                            backgroundColor: '#1E293B',
                                            border: '1px solid #475569',
                                            borderRadius: '6px',
                                            color: '#FFFFFF',
                                            padding: '0 8px',
                                            fontSize: '0.80rem',
                                            fontWeight: '700',
                                            outline: 'none',
                                            boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                                {/* Atajos rápidos de número */}
                                {['0', '1', '10', '50'].map(val => (
                                    <button
                                        key={val}
                                        type="button"
                                        onClick={() => {
                                            setNumValue(val);
                                            setTimeout(() => inputRef.current?.focus(), 20);
                                        }}
                                        style={{
                                            height: '28px',
                                            padding: '0 7px',
                                            backgroundColor: numValue === val ? '#0284C7' : '#334155',
                                            border: numValue === val ? '1px solid #38BDF8' : '1px solid rgba(255,255,255,0.06)',
                                            borderRadius: '6px',
                                            color: numValue === val ? '#FFFFFF' : '#CBD5E1',
                                            fontSize: '0.70rem',
                                            fontWeight: '700',
                                            cursor: 'pointer',
                                            transition: 'all 0.12s ease'
                                        }}
                                    >
                                        {val}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Botón Principal Aplicar */}
                    <button
                        type="button"
                        onClick={handleApplyOp}
                        style={{
                            height: '30px',
                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '7px',
                            fontWeight: '700',
                            fontSize: '0.78rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            marginTop: '2px',
                            boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span>Aplicar Filtro</span>
                        <ArrowRight size={14} />
                    </button>
                </div>
            )}

            {/* Footer con opción de Limpiar */}
            {hasActiveFilter && (
                <div style={{ borderTop: '1px solid rgba(51, 65, 85, 0.8)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: '#10B981', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                        Activo: {currentValue}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onClearFilter();
                            onClose();
                        }}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#F87171',
                            fontSize: '0.70rem',
                            fontWeight: '700',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 5px',
                            borderRadius: '4px',
                            transition: 'all 0.12s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <RotateCcw size={11} />
                        <span>Quitar filtro</span>
                    </button>
                </div>
            )}
        </div>
    );
};
