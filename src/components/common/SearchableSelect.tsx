'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, X, Plus } from 'lucide-react';

export interface SearchableSelectOption {
    value: string;
    label: string;
    sublabel?: string;
    badge?: string;
    icon?: React.ReactNode;
}

export interface SearchableSelectProps {
    value: string;
    onChange: (value: string) => void;
    onSelectComplete?: (value: string) => void;
    options: SearchableSelectOption[];
    placeholder?: string;
    searchPlaceholder?: string;
    disabled?: boolean;
    clearable?: boolean;
    className?: string;
    style?: React.CSSProperties;
    buttonStyle?: React.CSSProperties;
    dropdownStyle?: React.CSSProperties;
    size?: 'sm' | 'md';
    wrapOptions?: boolean;
    allowCustomValue?: boolean;
    autoFlip?: boolean;
}

function normalizeStr(text: string): string {
    return (text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export default function SearchableSelect({
    value,
    onChange,
    onSelectComplete,
    options,
    placeholder = '-- Seleccionar opción --',
    searchPlaceholder = 'Buscar...',
    disabled = false,
    clearable = false,
    className = '',
    style,
    buttonStyle,
    dropdownStyle,
    size = 'sm',
    wrapOptions = false,
    allowCustomValue = false,
    autoFlip = true
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const [openUpwards, setOpenUpwards] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const triggerButtonRef = useRef<HTMLButtonElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const optionsListRef = useRef<HTMLDivElement>(null);

    const selectedOption = useMemo(() => {
        return options.find(opt => opt.value === value);
    }, [options, value]);

    const filteredOptions = useMemo(() => {
        if (!searchQuery.trim()) return options;
        const query = normalizeStr(searchQuery);
        return options.filter(opt =>
            normalizeStr(opt.label).includes(query) ||
            (opt.sublabel && normalizeStr(opt.sublabel).includes(query)) ||
            (opt.badge && normalizeStr(opt.badge).includes(query))
        );
    }, [options, searchQuery]);

    // Keep highlightedIndex in bounds and reset to 0 when filtering
    useEffect(() => {
        setHighlightedIndex(0);
    }, [searchQuery]);

    useEffect(() => {
        if (isOpen) {
            const currentIdx = options.findIndex(opt => opt.value === value);
            setHighlightedIndex(currentIdx >= 0 ? currentIdx : 0);
        }
    }, [isOpen, options, value]);

    // Scroll highlighted option into view when navigating with arrows
    useEffect(() => {
        if (!isOpen || !optionsListRef.current) return;
        const optionEl = optionsListRef.current.querySelector(`[data-option-index="${highlightedIndex}"]`) as HTMLElement | null;
        if (optionEl) {
            optionEl.scrollIntoView({ block: 'nearest' });
        }
    }, [highlightedIndex, isOpen]);

    const selectOption = (optValue: string) => {
        onChange(optValue);
        setIsOpen(false);
        setSearchQuery('');
        if (onSelectComplete) {
            setTimeout(() => onSelectComplete(optValue), 0);
        } else {
            setTimeout(() => triggerButtonRef.current?.focus(), 0);
        }
    };

    // Handle outside clicks
    useEffect(() => {
        if (!isOpen) return;

        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        }

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                setIsOpen(false);
                setSearchQuery('');
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    // Auto-focus search input on open
    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [isOpen]);

    // Auto-flip upwards if not enough space below
    useEffect(() => {
        if (isOpen && autoFlip && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            if (spaceBelow < 250 && rect.top > 250) {
                setOpenUpwards(true);
            } else {
                setOpenUpwards(false);
            }
        }
    }, [isOpen, autoFlip]);

    const isSmall = size === 'sm';

    return (
        <div
            ref={containerRef}
            className={`relative ${className}`}
            style={{
                position: 'relative',
                width: '100%',
                ...style
            }}
        >
            {/* Trigger Button */}
            <button
                ref={triggerButtonRef}
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    setIsOpen(prev => !prev);
                    if (!isOpen) setSearchQuery('');
                }}
                onKeyDown={(e) => {
                    if (disabled) return;
                    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setIsOpen(true);
                        setSearchQuery('');
                    }
                }}
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    padding: isSmall ? '6px 10px' : '8px 12px',
                    fontSize: isSmall ? '0.73rem' : '0.78rem',
                    fontWeight: selectedOption ? '600' : '400',
                    color: selectedOption ? '#1E293B' : '#94A3B8',
                    backgroundColor: disabled ? '#F1F5F9' : '#FFFFFF',
                    border: isOpen ? '1px solid #0D7A57' : '1px solid #CBD5E1',
                    borderRadius: '8px',
                    outline: 'none',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    boxShadow: isOpen ? '0 0 0 2px rgba(13, 122, 87, 0.15)' : 'none',
                    transition: 'all 0.15s ease-in-out',
                    textAlign: 'left',
                    ...buttonStyle
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                    {selectedOption?.icon && (
                        <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                            {selectedOption.icon}
                        </span>
                    )}
                    <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: selectedOption ? '#0F172A' : '#94A3B8'
                    }}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                    {selectedOption?.badge && (
                        <span style={{
                            fontSize: '0.65rem',
                            fontWeight: '700',
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: '#E2E8F0',
                            color: '#475569',
                            flexShrink: 0
                        }}>
                            {selectedOption.badge}
                        </span>
                    )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    {clearable && selectedOption && !disabled && (
                        <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange('');
                                setSearchQuery('');
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2px',
                                borderRadius: '4px',
                                color: '#94A3B8',
                                cursor: 'pointer'
                            }}
                            title="Limpiar selección"
                        >
                            <X size={12} />
                        </span>
                    )}
                    <ChevronDown
                        size={14}
                        style={{
                            color: '#64748B',
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.15s ease'
                        }}
                    />
                </div>
            </button>

            {/* Dropdown Floating Menu */}
            {isOpen && (
                <div
                    style={{
                        position: 'absolute',
                        top: openUpwards ? 'auto' : 'calc(100% + 4px)',
                        bottom: openUpwards ? 'calc(100% + 4px)' : 'auto',
                        left: 0,
                        right: 0,
                        zIndex: 9999,
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        minWidth: '240px',
                        ...dropdownStyle
                    }}
                >
                    {/* Live Search Bar */}
                    <div style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #E2E8F0',
                        backgroundColor: '#F8FAFC',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                    }}>
                        <Search size={13} style={{ color: '#94A3B8', flexShrink: 0 }} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => {
                                const totalOptionsCount = filteredOptions.length + (allowCustomValue && searchQuery.trim() ? 1 : 0);
                                if (e.key === 'ArrowDown') {
                                    e.preventDefault();
                                    if (totalOptionsCount > 0) {
                                        setHighlightedIndex(prev => (prev + 1) % totalOptionsCount);
                                    }
                                } else if (e.key === 'ArrowUp') {
                                    e.preventDefault();
                                    if (totalOptionsCount > 0) {
                                        setHighlightedIndex(prev => (prev - 1 + totalOptionsCount) % totalOptionsCount);
                                    }
                                } else if (e.key === 'Enter' || e.key === 'Tab') {
                                    if (filteredOptions.length > 0 && highlightedIndex < filteredOptions.length) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        const targetOpt = filteredOptions[highlightedIndex] || filteredOptions[0];
                                        selectOption(targetOpt.value);
                                    } else if (allowCustomValue && searchQuery.trim()) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        selectOption(searchQuery.trim());
                                    } else if (e.key === 'Tab') {
                                        setIsOpen(false);
                                        setSearchQuery('');
                                    }
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setIsOpen(false);
                                    setSearchQuery('');
                                }
                            }}
                            placeholder={searchPlaceholder}
                            style={{
                                width: '100%',
                                border: 'none',
                                outline: 'none',
                                backgroundColor: 'transparent',
                                fontSize: '0.73rem',
                                color: '#1E293B',
                                padding: '2px 0'
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#94A3B8',
                                    cursor: 'pointer',
                                    padding: '2px',
                                    display: 'flex',
                                    alignItems: 'center'
                                }}
                            >
                                <X size={12} />
                            </button>
                        )}
                    </div>

                    {/* Options List */}
                    <div
                        ref={optionsListRef}
                        style={{
                            maxHeight: wrapOptions ? '280px' : '200px',
                            overflowY: 'auto',
                            padding: '4px'
                        }}
                    >
                        {filteredOptions.length === 0 ? (
                            <div style={{
                                padding: '12px 10px',
                                textAlign: 'center',
                                fontSize: '0.72rem',
                                color: '#94A3B8'
                            }}>
                                No se encontraron resultados {searchQuery ? `para "${searchQuery}"` : ''}
                            </div>
                        ) : (
                            filteredOptions.map((opt, idx) => {
                                const isSelected = opt.value === value;
                                const isHighlighted = idx === highlightedIndex;
                                return (
                                    <div
                                        key={opt.value}
                                        data-option-index={idx}
                                        onClick={() => selectOption(opt.value)}
                                        style={{
                                            display: 'flex',
                                            alignItems: wrapOptions ? 'flex-start' : 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            padding: wrapOptions ? '8px 10px' : '7px 9px',
                                            borderRadius: '6px',
                                            fontSize: '0.73rem',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected
                                                ? '#ECFDF5'
                                                : isHighlighted
                                                    ? '#F0FDF4'
                                                    : 'transparent',
                                            border: isHighlighted && !isSelected
                                                ? '1px solid #A7F3D0'
                                                : '1px solid transparent',
                                            color: isSelected || isHighlighted ? '#065F46' : '#334155',
                                            fontWeight: isSelected || isHighlighted ? '700' : '500',
                                            transition: 'background-color 0.1s'
                                        }}
                                        onMouseEnter={() => {
                                            setHighlightedIndex(idx);
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                                {opt.icon && (
                                                    <span style={{ display: 'inline-flex', flexShrink: 0, marginTop: '1px' }}>
                                                        {opt.icon}
                                                    </span>
                                                )}
                                                <span style={{
                                                    overflow: wrapOptions ? 'visible' : 'hidden',
                                                    textOverflow: wrapOptions ? 'clip' : 'ellipsis',
                                                    whiteSpace: wrapOptions ? 'normal' : 'nowrap',
                                                    lineHeight: '1.3'
                                                }}>
                                                    {opt.label}
                                                </span>
                                            </div>
                                            {opt.sublabel && (
                                                <span style={{
                                                    fontSize: '0.66rem',
                                                    color: isSelected || isHighlighted ? '#047857' : '#64748B',
                                                    overflow: wrapOptions ? 'visible' : 'hidden',
                                                    textOverflow: wrapOptions ? 'clip' : 'ellipsis',
                                                    whiteSpace: wrapOptions ? 'normal' : 'nowrap',
                                                    lineHeight: '1.35',
                                                    marginTop: '3px',
                                                    paddingLeft: (wrapOptions && opt.icon) ? '20px' : '0'
                                                }}>
                                                    {opt.sublabel}
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                            {opt.badge && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: '700',
                                                    padding: '1px 5px',
                                                    borderRadius: '4px',
                                                    backgroundColor: isSelected ? '#A7F3D0' : '#E2E8F0',
                                                    color: isSelected ? '#065F46' : '#475569'
                                                }}>
                                                    {opt.badge}
                                                </span>
                                            )}
                                            {isSelected && (
                                                <Check size={14} style={{ color: '#0D7A57' }} />
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}

                        {allowCustomValue && searchQuery.trim() && (
                            <div
                                data-option-index={filteredOptions.length}
                                onClick={() => selectOption(searchQuery.trim())}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '7px 9px',
                                    borderRadius: '6px',
                                    fontSize: '0.73rem',
                                    cursor: 'pointer',
                                    backgroundColor: highlightedIndex === filteredOptions.length ? '#F0FDF4' : '#F8FAFC',
                                    border: highlightedIndex === filteredOptions.length ? '1px solid #A7F3D0' : '1px dashed #CBD5E1',
                                    color: '#065F46',
                                    fontWeight: '700',
                                    marginTop: '4px'
                                }}
                                onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
                            >
                                <Plus size={13} style={{ color: '#0D7A57' }} />
                                <span>Asignar "{searchQuery.trim()}" (texto libre)</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
