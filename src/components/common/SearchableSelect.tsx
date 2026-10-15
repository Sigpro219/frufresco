'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';

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
    options,
    placeholder = '-- Seleccionar opción --',
    searchPlaceholder = 'Buscar...',
    disabled = false,
    clearable = false,
    className = '',
    style,
    buttonStyle,
    dropdownStyle,
    size = 'sm'
}: SearchableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

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
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (disabled) return;
                    setIsOpen(prev => !prev);
                    if (!isOpen) setSearchQuery('');
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
                        top: 'calc(100% + 4px)',
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
                    <div style={{
                        maxHeight: '200px',
                        overflowY: 'auto',
                        padding: '4px'
                    }}>
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
                            filteredOptions.map(opt => {
                                const isSelected = opt.value === value;
                                return (
                                    <div
                                        key={opt.value}
                                        onClick={() => {
                                            onChange(opt.value);
                                            setIsOpen(false);
                                            setSearchQuery('');
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '8px',
                                            padding: '7px 9px',
                                            borderRadius: '6px',
                                            fontSize: '0.73rem',
                                            cursor: 'pointer',
                                            backgroundColor: isSelected ? '#ECFDF5' : 'transparent',
                                            color: isSelected ? '#065F46' : '#334155',
                                            fontWeight: isSelected ? '700' : '500',
                                            transition: 'background-color 0.1s'
                                        }}
                                        onMouseEnter={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = '#F1F5F9';
                                        }}
                                        onMouseLeave={(e) => {
                                            if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                                        }}
                                    >
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {opt.icon && (
                                                    <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                                                        {opt.icon}
                                                    </span>
                                                )}
                                                <span style={{
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    {opt.label}
                                                </span>
                                            </div>
                                            {opt.sublabel && (
                                                <span style={{
                                                    fontSize: '0.65rem',
                                                    color: isSelected ? '#047857' : '#64748B',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
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
                    </div>
                </div>
            )}
        </div>
    );
}
