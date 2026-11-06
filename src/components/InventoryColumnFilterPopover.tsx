'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    X,
    Check,
    ArrowRight,
    RotateCcw,
    Ban,
    Sparkles,
    ArrowLeftRight,
    ArrowUpAZ,
    ArrowDownZA,
    ArrowDownWideNarrow,
    ArrowUpNarrowWide,
    Layers,
    FolderTree,
    GitBranch,
    Box,
    Tag,
    Hash,
    TrendingUp,
    TrendingDown
} from 'lucide-react';

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

export interface CellFilterOption {
    value: string;
    label: string;
    fullLabel: string;
    count: number;
    badgeBg?: string;
    badgeText?: string;
}

export type HierarchyFilterType = 'ALL' | 'PARENTS_ONLY' | 'CHILDREN_ONLY' | 'INDEPENDENTS_ONLY';

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
    // Ordenamiento por columna
    sortDirection?: 'asc' | 'desc' | null;
    onApplySort?: (dir: 'asc' | 'desc' | null) => void;
    // Opciones especializadas para Columna C (Célula)
    cellOptions?: CellFilterOption[];
    selectedCells?: string[];
    onChangeSelectedCells?: (cells: string[]) => void;
    // Opciones especializadas para Columna D (Producto: Jerarquía P/H y Unidad)
    hierarchyFilter?: HierarchyFilterType;
    onChangeHierarchyFilter?: (h: HierarchyFilterType) => void;
    hierarchyCounts?: {
        all: number;
        parents: number;
        children: number;
        independents: number;
    };
    unitOptions?: { unit: string; count: number }[];
    selectedUnit?: string;
    onChangeSelectedUnit?: (unit: string) => void;
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
    onClearFilter,
    sortDirection = null,
    onApplySort,
    cellOptions = [],
    selectedCells = [],
    onChangeSelectedCells,
    hierarchyFilter = 'ALL',
    onChangeHierarchyFilter,
    hierarchyCounts,
    unitOptions = [],
    selectedUnit = 'ALL',
    onChangeSelectedUnit
}) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const [selectedOp, setSelectedOp] = useState<FilterOperator>('greater');
    const [numValue, setNumValue] = useState<string>('0');
    const [rangeMin, setRangeMin] = useState<string>('');
    const [rangeMax, setRangeMax] = useState<string>('');
    const [idInput, setIdInput] = useState<string>('');
    const [productSearchInput, setProductSearchInput] = useState<string>('');

    useEffect(() => {
        if (isOpen) {
            if (colKey === 'id') {
                setIdInput(currentValue || '');
                setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                }, 50);
                return;
            }
            if (colKey === 'product') {
                setProductSearchInput(currentValue || '');
                setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                }, 50);
                return;
            }
            if (colKey === 'cell') {
                return;
            }

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

            setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 60);
        }
    }, [isOpen, currentValue, colKey]);

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

    const popoverWidth = colKey === 'product' ? 330 : (colKey === 'cell' ? 310 : 305);
    const padding = 12;
    let top = anchorRect.bottom + 6;
    let left = anchorRect.left;

    if (left + popoverWidth > window.innerWidth - padding) {
        left = window.innerWidth - popoverWidth - padding;
    }
    if (left < padding) left = padding;

    const estimatedHeight = colKey === 'product' ? 430 : 390;
    if (top + estimatedHeight > window.innerHeight && anchorRect.top > estimatedHeight + 10) {
        top = anchorRect.top - estimatedHeight - 6;
    }

    const handleQuickAction = (preset: 'blank' | 'with_values' | 'positive' | 'negative') => {
        if (preset === 'blank') onApplyFilter('en blanco');
        else if (preset === 'with_values') onApplyFilter('con valores');
        else if (preset === 'positive') onApplyFilter('>0');
        else if (preset === 'negative') onApplyFilter('<0');
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

    const hasActiveFilter = (currentValue && currentValue.trim().length > 0) ||
        (colKey === 'cell' && selectedCells.length > 0) ||
        (colKey === 'product' && (hierarchyFilter !== 'ALL' || (selectedUnit && selectedUnit !== 'ALL')));

    const cleanSign = (colSign || '').replace(/^\(+|\)+$/g, '').trim();

    const toggleCellSelection = (cellValue: string) => {
        if (!onChangeSelectedCells) return;
        if (cellValue === 'ALL') {
            onChangeSelectedCells([]);
            return;
        }
        const exists = selectedCells.includes(cellValue);
        if (exists) {
            onChangeSelectedCells(selectedCells.filter(c => c !== cellValue));
        } else {
            onChangeSelectedCells([...selectedCells, cellValue]);
        }
    };

    return (
        <div
            ref={popoverRef}
            style={{
                position: 'fixed',
                top: `${top}px`,
                left: `${left}px`,
                width: `${popoverWidth}px`,
                backgroundColor: '#FFFFFF',
                border: '1.5px solid #CBD5E1',
                borderRadius: '12px',
                boxShadow: '0 20px 30px -5px rgba(15, 23, 42, 0.25), 0 8px 12px -6px rgba(15, 23, 42, 0.15)',
                zIndex: 99999,
                fontFamily: 'var(--font-outfit), sans-serif',
                color: '#0F172A',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                boxSizing: 'border-box'
            }}
            onClick={e => e.stopPropagation()}
        >
            {/* Header del Popover (Alto Contraste) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                    <span style={{
                        backgroundColor: '#0F172A',
                        color: '#FFFFFF',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        fontSize: '0.68rem',
                        fontWeight: '800',
                        letterSpacing: '0.02em',
                        flexShrink: 0
                    }}>
                        {colKey === 'id' ? 'Col. B' : colKey === 'cell' ? 'Col. C' : colKey === 'product' ? 'Col. D' : `Col. ${colKey}`}
                    </span>
                    <span style={{ 
                        fontSize: '0.80rem', 
                        fontWeight: '800', 
                        color: '#0F172A', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap' 
                    }}>
                        {colTitle}
                    </span>
                    {cleanSign && (
                        <span style={{ 
                            fontSize: '0.68rem', 
                            color: cleanSign.includes('+') ? '#047857' : (cleanSign.includes('-') ? '#B91C1C' : '#475569'),
                            backgroundColor: cleanSign.includes('+') ? '#D1FAE5' : (cleanSign.includes('-') ? '#FEE2E2' : '#F1F5F9'),
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontWeight: '800',
                            flexShrink: 0
                        }}>
                            ({cleanSign})
                        </span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: '#F1F5F9',
                        border: '1px solid #CBD5E1',
                        color: '#334155',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '6px'
                    }}
                    title="Cerrar (Esc)"
                >
                    <X size={14} strokeWidth={2.5} />
                </button>
            </div>

            {/* SECCIÓN DE ORDENAMIENTO 1-CLIC (Disponible en todas las columnas) */}
            {onApplySort && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {colKey === 'product' || colKey === 'cell' ? 'Orden Alfabético' : colKey === 'id' ? 'Orden por Código Contable' : 'Ordenar Valores de Columna'}
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {colKey === 'product' || colKey === 'cell' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApplySort(sortDirection === 'asc' ? null : 'asc');
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '7px 8px',
                                        backgroundColor: sortDirection === 'asc' ? '#0D7A57' : '#F8FAFC',
                                        color: sortDirection === 'asc' ? '#FFFFFF' : '#0F172A',
                                        border: sortDirection === 'asc' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <ArrowUpAZ size={15} strokeWidth={2.3} />
                                    <span>Ordenar A → Z</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApplySort(sortDirection === 'desc' ? null : 'desc');
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '7px 8px',
                                        backgroundColor: sortDirection === 'desc' ? '#0D7A57' : '#F8FAFC',
                                        color: sortDirection === 'desc' ? '#FFFFFF' : '#0F172A',
                                        border: sortDirection === 'desc' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <ArrowDownZA size={15} strokeWidth={2.3} />
                                    <span>Ordenar Z → A</span>
                                </button>
                            </>
                        ) : colKey === 'id' ? (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApplySort(sortDirection === 'asc' ? null : 'asc');
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '7px 8px',
                                        backgroundColor: sortDirection === 'asc' ? '#0D7A57' : '#F8FAFC',
                                        color: sortDirection === 'asc' ? '#FFFFFF' : '#0F172A',
                                        border: sortDirection === 'asc' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <ArrowUpNarrowWide size={15} strokeWidth={2.3} />
                                    <span>Menor a Mayor (1→999)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApplySort(sortDirection === 'desc' ? null : 'desc');
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '7px 8px',
                                        backgroundColor: sortDirection === 'desc' ? '#0D7A57' : '#F8FAFC',
                                        color: sortDirection === 'desc' ? '#FFFFFF' : '#0F172A',
                                        border: sortDirection === 'desc' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <ArrowDownWideNarrow size={15} strokeWidth={2.3} />
                                    <span>Mayor a Menor (999→1)</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApplySort(sortDirection === 'desc' ? null : 'desc');
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '7px 8px',
                                        backgroundColor: sortDirection === 'desc' ? '#0D7A57' : '#F8FAFC',
                                        color: sortDirection === 'desc' ? '#FFFFFF' : '#0F172A',
                                        border: sortDirection === 'desc' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                    title="Pone primero los valores más altos de esta columna"
                                >
                                    <ArrowDownWideNarrow size={15} strokeWidth={2.3} />
                                    <span>Mayor a menor (↓)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onApplySort(sortDirection === 'asc' ? null : 'asc');
                                        onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px',
                                        padding: '7px 8px',
                                        backgroundColor: sortDirection === 'asc' ? '#0D7A57' : '#F8FAFC',
                                        color: sortDirection === 'asc' ? '#FFFFFF' : '#0F172A',
                                        border: sortDirection === 'asc' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                        borderRadius: '7px',
                                        fontSize: '0.73rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                    title="Pone primero los valores más bajos o negativos de esta columna"
                                >
                                    <ArrowUpNarrowWide size={15} strokeWidth={2.3} />
                                    <span>Menor a mayor (↑)</span>
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* MODO 1: COLUMNA C (CÉLULA DE TRABAJO - SELECCIÓN SIN DIGITAR) */}
            {colKey === 'cell' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Filtrar por Célula (1 Clic)
                        </span>
                        {selectedCells.length > 0 && (
                            <button
                                type="button"
                                onClick={() => onChangeSelectedCells && onChangeSelectedCells([])}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#0D7A57',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                Mostrar Todas
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '230px', overflowY: 'auto' }}>
                        {cellOptions.map(opt => {
                            const isAll = opt.value === 'ALL';
                            const isChecked = isAll ? selectedCells.length === 0 : selectedCells.includes(opt.value);
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => {
                                        toggleCellSelection(opt.value);
                                        if (isAll) onClose();
                                    }}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '7px 10px',
                                        backgroundColor: isChecked ? '#ECFDF5' : '#F8FAFC',
                                        border: isChecked ? '1.5px solid #059669' : '1px solid #E2E8F0',
                                        borderRadius: '8px',
                                        color: isChecked ? '#065F46' : '#0F172A',
                                        cursor: 'pointer',
                                        fontSize: '0.76rem',
                                        fontWeight: isChecked ? '800' : '600',
                                        textAlign: 'left',
                                        transition: 'all 0.12s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                        <span style={{
                                            width: '16px',
                                            height: '16px',
                                            borderRadius: '4px',
                                            backgroundColor: isChecked ? '#059669' : '#FFFFFF',
                                            border: isChecked ? 'none' : '1.5px solid #94A3B8',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: '#FFFFFF',
                                            flexShrink: 0
                                        }}>
                                            {isChecked && <Check size={11} strokeWidth={3} />}
                                        </span>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {opt.label}
                                        </span>
                                    </div>
                                    <span style={{
                                        padding: '2px 7px',
                                        borderRadius: '999px',
                                        fontSize: '0.68rem',
                                        fontWeight: '800',
                                        backgroundColor: isChecked ? '#059669' : '#E2E8F0',
                                        color: isChecked ? '#FFFFFF' : '#334155'
                                    }}>
                                        {opt.count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* MODO 2: COLUMNA D (PRODUCTO: JERARQUÍA PADRE/HIJO + UNIDAD + TEXTO) */}
            {colKey === 'product' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                    {/* Filtro de Jerarquía en 1 Clic */}
                    {onChangeHierarchyFilter && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Filtrar por Tipo de Jerarquía (Sin digitar)
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                                {[
                                    { id: 'ALL' as HierarchyFilterType, label: 'Todos', badge: '', count: hierarchyCounts?.all, icon: <Layers size={13} /> },
                                    { id: 'PARENTS_ONLY' as HierarchyFilterType, label: 'Solo Padres', badge: 'P', badgeColor: '#4F46E5', count: hierarchyCounts?.parents, icon: <FolderTree size={13} /> },
                                    { id: 'CHILDREN_ONLY' as HierarchyFilterType, label: 'Con Hijos', badge: 'H', badgeColor: '#0D7A57', count: hierarchyCounts?.children, icon: <GitBranch size={13} /> },
                                    { id: 'INDEPENDENTS_ONLY' as HierarchyFilterType, label: 'Independientes', badge: '1:1', badgeColor: '#475569', count: hierarchyCounts?.independents, icon: <Box size={13} /> }
                                ].map(item => {
                                    const active = hierarchyFilter === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                onChangeHierarchyFilter(item.id);
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '6px 8px',
                                                backgroundColor: active ? '#ECFDF5' : '#F8FAFC',
                                                border: active ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                                borderRadius: '7px',
                                                color: active ? '#065F46' : '#0F172A',
                                                fontSize: '0.72rem',
                                                fontWeight: active ? '800' : '700',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                {item.badge ? (
                                                    <span style={{
                                                        backgroundColor: item.badgeColor,
                                                        color: '#FFFFFF',
                                                        fontSize: '0.60rem',
                                                        fontWeight: '800',
                                                        padding: '1px 4px',
                                                        borderRadius: '3px'
                                                    }}>
                                                        {item.badge}
                                                    </span>
                                                ) : item.icon}
                                                <span>{item.label}</span>
                                            </div>
                                            {typeof item.count === 'number' && (
                                                <span style={{ fontSize: '0.65rem', fontWeight: '800', color: active ? '#047857' : '#64748B' }}>
                                                    {item.count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Filtro por Unidad de Medida en 1 Clic */}
                    {onChangeSelectedUnit && unitOptions.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Filtrar por Unidad de Medida
                            </span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => onChangeSelectedUnit('ALL')}
                                    style={{
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        border: selectedUnit === 'ALL' ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                        backgroundColor: selectedUnit === 'ALL' ? '#059669' : '#F8FAFC',
                                        color: selectedUnit === 'ALL' ? '#FFFFFF' : '#334155',
                                        fontSize: '0.69rem',
                                        fontWeight: '800',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Todas
                                </button>
                                {unitOptions.map(u => {
                                    const active = selectedUnit === u.unit;
                                    return (
                                        <button
                                            key={u.unit}
                                            type="button"
                                            onClick={() => onChangeSelectedUnit(active ? 'ALL' : u.unit)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                border: active ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                                backgroundColor: active ? '#ECFDF5' : '#F8FAFC',
                                                color: active ? '#065F46' : '#0F172A',
                                                fontSize: '0.69rem',
                                                fontWeight: active ? '800' : '600',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <span>{u.unit}</span>
                                            <span style={{ fontSize: '0.62rem', color: active ? '#047857' : '#64748B', fontWeight: '800' }}>
                                                ({u.count})
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Búsqueda de texto por nombre de producto */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Contiene texto en el nombre
                        </span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <input
                                ref={inputRef}
                                type="text"
                                value={productSearchInput}
                                onChange={e => setProductSearchInput(e.target.value)}
                                placeholder="Ej: Tomate, Papa, Fresas..."
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        onApplyFilter(productSearchInput.trim());
                                        onClose();
                                    }
                                }}
                                style={{
                                    flex: 1,
                                    height: '30px',
                                    backgroundColor: '#FFFFFF',
                                    border: '1.5px solid #94A3B8',
                                    borderRadius: '6px',
                                    color: '#0F172A',
                                    padding: '0 8px',
                                    fontSize: '0.78rem',
                                    fontWeight: '700',
                                    outline: 'none'
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    onApplyFilter(productSearchInput.trim());
                                    onClose();
                                }}
                                style={{
                                    height: '30px',
                                    padding: '0 12px',
                                    backgroundColor: '#0D7A57',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    fontWeight: '800',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer'
                                }}
                            >
                                Filtrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODO 3: COLUMNA B (ID PRODUCTO: EXACTO, LISTA O RANGO) */}
            {colKey === 'id' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                    <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Filtrar por ID Contable (Exacto, Varios o Rango)
                    </span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={idInput}
                        onChange={e => setIdInput(e.target.value)}
                        placeholder="Ej: 15 o 1, 5, 12 o 1..50"
                        onKeyDown={e => {
                            if (e.key === 'Enter') {
                                onApplyFilter(idInput.trim());
                                onClose();
                            }
                        }}
                        style={{
                            width: '100%',
                            height: '32px',
                            backgroundColor: '#FFFFFF',
                            border: '1.5px solid #94A3B8',
                            borderRadius: '6px',
                            color: '#0F172A',
                            padding: '0 10px',
                            fontSize: '0.80rem',
                            fontWeight: '800',
                            outline: 'none',
                            boxSizing: 'border-box'
                        }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
                        {['1..50', '51..150', '151..300', '>300'].map(preset => (
                            <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                    onApplyFilter(preset);
                                    onClose();
                                }}
                                style={{
                                    padding: '5px 4px',
                                    backgroundColor: currentValue === preset ? '#ECFDF5' : '#F8FAFC',
                                    border: currentValue === preset ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                    borderRadius: '5px',
                                    color: currentValue === preset ? '#065F46' : '#334155',
                                    fontSize: '0.68rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                #{preset}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            onApplyFilter(idInput.trim());
                            onClose();
                        }}
                        style={{
                            height: '30px',
                            background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '7px',
                            fontWeight: '800',
                            fontSize: '0.76rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <span>Aplicar Filtro ID</span>
                        <ArrowRight size={14} />
                    </button>
                </div>
            )}

            {/* MODO 4: COLUMNAS NUMÉRICAS E..X */}
            {colKey !== 'cell' && colKey !== 'product' && colKey !== 'id' && (
                <>
                    {/* Accesos Rápidos en 1 Clic: Con Datos, En Blanco, Positivos (>0), Negativos (<0) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Filtros Rápidos (1 Clic)
                        </span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                            <button
                                type="button"
                                onClick={() => handleQuickAction('with_values')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    padding: '6px 8px',
                                    backgroundColor: currentValue.toLowerCase() === 'con valores' ? '#0D7A57' : '#F8FAFC',
                                    color: currentValue.toLowerCase() === 'con valores' ? '#FFFFFF' : '#0F172A',
                                    border: currentValue.toLowerCase() === 'con valores' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                    borderRadius: '7px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                                title="Muestra solo filas con movimiento distinto de cero"
                            >
                                <Sparkles size={13} style={{ color: currentValue.toLowerCase() === 'con valores' ? '#FFFFFF' : '#0D7A57' }} />
                                <span>Con datos (≠ 0)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickAction('blank')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    padding: '6px 8px',
                                    backgroundColor: currentValue.toLowerCase() === 'en blanco' ? '#0D7A57' : '#F8FAFC',
                                    color: currentValue.toLowerCase() === 'en blanco' ? '#FFFFFF' : '#0F172A',
                                    border: currentValue.toLowerCase() === 'en blanco' ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                    borderRadius: '7px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                                title="Muestra registros en cero o sin movimiento"
                            >
                                <Ban size={13} style={{ color: currentValue.toLowerCase() === 'en blanco' ? '#FFFFFF' : '#64748B' }} />
                                <span>En cero (= 0)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickAction('positive')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    padding: '6px 8px',
                                    backgroundColor: currentValue.trim() === '>0' ? '#0D7A57' : '#F8FAFC',
                                    color: currentValue.trim() === '>0' ? '#FFFFFF' : '#065F46',
                                    border: currentValue.trim() === '>0' ? '1.5px solid #065F46' : '1px solid #A7F3D0',
                                    borderRadius: '7px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                <TrendingUp size={13} />
                                <span>Positivos (&gt; 0)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleQuickAction('negative')}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '5px',
                                    padding: '6px 8px',
                                    backgroundColor: currentValue.trim() === '<0' ? '#DC2626' : '#FEF2F2',
                                    color: currentValue.trim() === '<0' ? '#FFFFFF' : '#991B1B',
                                    border: currentValue.trim() === '<0' ? '1.5px solid #991B1B' : '1px solid #FECACA',
                                    borderRadius: '7px',
                                    fontSize: '0.72rem',
                                    fontWeight: '800',
                                    cursor: 'pointer'
                                }}
                            >
                                <TrendingDown size={13} />
                                <span>Negativos (&lt; 0)</span>
                            </button>
                        </div>
                    </div>

                    {/* Grid de Operadores Numéricos */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.64rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Condición Personalizada
                        </span>
                        
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
                                            backgroundColor: isSelected ? '#ECFDF5' : '#F8FAFC',
                                            border: isSelected ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                            borderRadius: '6px',
                                            color: isSelected ? '#065F46' : '#0F172A',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.71rem'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '18px',
                                                height: '18px',
                                                backgroundColor: isSelected ? '#059669' : '#E2E8F0',
                                                color: isSelected ? '#FFFFFF' : '#0F172A',
                                                borderRadius: '4px',
                                                fontSize: '0.74rem',
                                                fontWeight: '800'
                                            }}>
                                                {op.symbol}
                                            </span>
                                            <span style={{ fontWeight: isSelected ? '800' : '600' }}>{op.label}</span>
                                        </div>
                                        {isSelected && <Check size={12} style={{ color: '#059669', flexShrink: 0 }} />}
                                    </button>
                                );
                            })}
                        </div>

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
                                backgroundColor: selectedOp === 'range' ? '#ECFDF5' : '#F8FAFC',
                                border: selectedOp === 'range' ? '1.5px solid #059669' : '1px solid #CBD5E1',
                                borderRadius: '6px',
                                color: selectedOp === 'range' ? '#065F46' : '#0F172A',
                                cursor: 'pointer',
                                fontSize: '0.71rem',
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
                                    backgroundColor: selectedOp === 'range' ? '#059669' : '#E2E8F0',
                                    color: selectedOp === 'range' ? '#FFFFFF' : '#0F172A',
                                    borderRadius: '4px'
                                }}>
                                    <ArrowLeftRight size={11} />
                                </span>
                                <span style={{ fontWeight: selectedOp === 'range' ? '800' : '600' }}>En rango de valores (Mín..Máx)</span>
                            </div>
                            {selectedOp === 'range' && <Check size={12} style={{ color: '#059669' }} />}
                        </button>
                    </div>

                    {/* Entrada de Valores y Botón Aplicar */}
                    {selectedOp !== 'blank' && selectedOp !== 'with_values' && (
                        <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {selectedOp === 'range' ? (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.64rem', color: '#475569', display: 'block', marginBottom: '2px', fontWeight: '700' }}>Desde (Mín)</label>
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
                                                height: '30px',
                                                backgroundColor: '#FFFFFF',
                                                border: '1.5px solid #94A3B8',
                                                borderRadius: '6px',
                                                color: '#0F172A',
                                                padding: '0 8px',
                                                fontSize: '0.80rem',
                                                fontWeight: '800',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.64rem', color: '#475569', display: 'block', marginBottom: '2px', fontWeight: '700' }}>Hasta (Máx)</label>
                                        <input
                                            type="number"
                                            step="any"
                                            value={rangeMax}
                                            onChange={e => setRangeMax(e.target.value)}
                                            placeholder="100"
                                            onKeyDown={e => e.key === 'Enter' && handleApplyOp()}
                                            style={{
                                                width: '100%',
                                                height: '30px',
                                                backgroundColor: '#FFFFFF',
                                                border: '1.5px solid #94A3B8',
                                                borderRadius: '6px',
                                                color: '#0F172A',
                                                padding: '0 8px',
                                                fontSize: '0.80rem',
                                                fontWeight: '800',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label style={{ fontSize: '0.64rem', color: '#475569', fontWeight: '700', display: 'block', marginBottom: '3px' }}>
                                        Valor a comparar ({OPERATORS_GRID.find(o => o.id === selectedOp)?.symbol})
                                    </label>
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
                                                    height: '30px',
                                                    backgroundColor: '#FFFFFF',
                                                    border: '1.5px solid #94A3B8',
                                                    borderRadius: '6px',
                                                    color: '#0F172A',
                                                    padding: '0 8px',
                                                    fontSize: '0.82rem',
                                                    fontWeight: '800',
                                                    outline: 'none',
                                                    boxSizing: 'border-box'
                                                }}
                                            />
                                        </div>
                                        {['0', '1', '10', '50'].map(val => (
                                            <button
                                                key={val}
                                                type="button"
                                                onClick={() => {
                                                    setNumValue(val);
                                                    setTimeout(() => inputRef.current?.focus(), 20);
                                                }}
                                                style={{
                                                    height: '30px',
                                                    padding: '0 8px',
                                                    backgroundColor: numValue === val ? '#0D7A57' : '#F1F5F9',
                                                    border: numValue === val ? '1.5px solid #065F46' : '1px solid #CBD5E1',
                                                    borderRadius: '6px',
                                                    color: numValue === val ? '#FFFFFF' : '#0F172A',
                                                    fontSize: '0.72rem',
                                                    fontWeight: '800',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                {val}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={handleApplyOp}
                                style={{
                                    height: '32px',
                                    background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '7px',
                                    fontWeight: '800',
                                    fontSize: '0.78rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.25)'
                                }}
                            >
                                <span>Aplicar Filtro</span>
                                <ArrowRight size={14} />
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Footer con opción de Limpiar Filtro y Orden */}
            {(hasActiveFilter || sortDirection) && (
                <div style={{ borderTop: '1px solid #E2E8F0', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.68rem', color: '#047857', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10B981' }} />
                        {sortDirection ? `Orden ${sortDirection === 'asc' ? '↑ Asc' : '↓ Desc'}` : 'Filtro activo'}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            onClearFilter();
                            if (onApplySort) onApplySort(null);
                            if (colKey === 'cell' && onChangeSelectedCells) onChangeSelectedCells([]);
                            if (colKey === 'product') {
                                if (onChangeHierarchyFilter) onChangeHierarchyFilter('ALL');
                                if (onChangeSelectedUnit) onChangeSelectedUnit('ALL');
                            }
                            onClose();
                        }}
                        style={{
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            color: '#DC2626',
                            fontSize: '0.70rem',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '5px'
                        }}
                    >
                        <RotateCcw size={11} strokeWidth={2.5} />
                        <span>Restablecer columna</span>
                    </button>
                </div>
            )}
        </div>
    );
};
