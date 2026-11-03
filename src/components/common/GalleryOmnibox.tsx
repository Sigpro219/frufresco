'use client';

import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface GalleryOmniboxProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  filteredCount?: number;
  totalCount?: number;
  style?: React.CSSProperties;
  className?: string;
  autoFocus?: boolean;
}

/**
 * Superbuscador Omnibox Universal FruFresco
 * Estandarizado para Galerías y Consolas Operativas (SDD Escenario 57).
 * Utiliza arquitectura de estilos inline industriales para garantizar renderizado
 * 100% predecible y pixel-perfect sin depender de frameworks CSS externos.
 */
export const GalleryOmnibox: React.FC<GalleryOmniboxProps> = ({
  value,
  onChange,
  placeholder = 'Buscar por nombre, código, sku, etiqueta o #ID...',
  filteredCount,
  totalCount,
  style = {},
  autoFocus = false,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atajo universal '/' para enfocar el buscador (fuera de inputs/textareas)
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      minWidth: '280px',
      maxWidth: '460px',
      width: '100%',
      ...style
    }}>
      {/* Icono Lupa */}
      <div style={{
        position: 'absolute',
        left: '11px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#94A3B8',
        pointerEvents: 'none'
      }}>
        <Search size={15} />
      </div>

      {/* Input de Búsqueda */}
      <input
        ref={inputRef}
        type="text"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          height: '38px',
          boxSizing: 'border-box',
          paddingLeft: '32px',
          paddingRight: value.trim() ? (filteredCount !== undefined ? '110px' : '36px') : (totalCount !== undefined ? '80px' : '32px'),
          paddingTop: '0.45rem',
          paddingBottom: '0.45rem',
          backgroundColor: '#F8FAFC',
          color: '#0F172A',
          fontSize: '0.8rem',
          fontWeight: '500',
          borderRadius: '10px',
          border: '1px solid #CBD5E1',
          outline: 'none',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
          transition: 'all 0.15s ease'
        }}
        onFocus={(e) => {
          e.currentTarget.style.backgroundColor = '#FFFFFF';
          e.currentTarget.style.borderColor = '#0D7A57';
          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(13, 122, 87, 0.12)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.backgroundColor = '#F8FAFC';
          e.currentTarget.style.borderColor = '#CBD5E1';
          e.currentTarget.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.03)';
        }}
      />

      {/* Telemetría Reactiva y Botón Limpiar */}
      <div style={{
        position: 'absolute',
        right: '8px',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '5px'
      }}>
        {value.trim() ? (
          <>
            {filteredCount !== undefined && totalCount !== undefined && (
              <span style={{
                fontSize: '0.68rem',
                fontWeight: '800',
                color: '#065F46',
                backgroundColor: '#ECFDF5',
                border: '1px solid #A7F3D0',
                padding: '0.15rem 0.45rem',
                borderRadius: '6px',
                userSelect: 'none',
                fontVariantNumeric: 'tabular-nums'
              }}>
                {filteredCount} de {totalCount}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                onChange('');
                inputRef.current?.focus();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94A3B8',
                borderRadius: '4px'
              }}
              title="Limpiar búsqueda"
              onMouseEnter={(e) => { e.currentTarget.style.color = '#0F172A'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; }}
            >
              <X size={13} />
            </button>
          </>
        ) : (
          totalCount !== undefined && (
            <span style={{
              fontSize: '0.68rem',
              fontWeight: '700',
              color: '#64748B',
              backgroundColor: '#FFFFFF',
              border: '1px solid #E2E8F0',
              padding: '0.12rem 0.42rem',
              borderRadius: '6px',
              userSelect: 'none',
              fontVariantNumeric: 'tabular-nums'
            }}>
              {totalCount} total
            </span>
          )
        )}
      </div>
    </div>
  );
};

/**
 * Normalizador fonético universal para búsquedas en español (SDD Escenario 57 / EFE-1):
 * - Insensible a acentos / tildes (normalización NFD)
 * - Insensible a mayúsculas
 * - Tolerancia fonética a seseo y equivalencia Z <-> S (tuza <-> tusa, zapote <-> sapote, cebolla <-> sebolla)
 */
export const normalizeSearchText = (str: string): string => {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ce/g, 'se')
    .replace(/ci/g, 'si')
    .replace(/z/g, 's')
    .trim();
};

/**
 * Función utilitaria universal para evaluar si un registro coincide con la búsqueda multi-criterio:
 * - Insensible a acentos / tildes (normalización NFD)
 * - Insensible a mayúsculas y seseo fonético (Z <-> S)
 * - Soporte de prefijo #ID para búsqueda exacta
 * - Búsqueda multi-palabra con AND (todas las palabras deben estar)
 * - Soporte de comas como OR (palabra1, palabra2)
 */
export function matchesUniversalSearch<T = any>(
  itemOrFields: T | (string | number | null | undefined)[],
  query: string,
  fieldExtractor?: (item: T) => (string | number | null | undefined)[],
  idExtractor?: (item: T) => string | number | null | undefined
): boolean {
  const trimmed = (query || '').trim();
  if (!trimmed) return true;

  // 1. Coincidencia exacta por #ID (ej: #1002, #15)
  if (trimmed.startsWith('#')) {
    const targetId = trimmed.slice(1).trim().toLowerCase();
    if (idExtractor && typeof itemOrFields === 'object' && !Array.isArray(itemOrFields)) {
      const itemId = String(idExtractor(itemOrFields as T) ?? '').toLowerCase();
      if (itemId === targetId || itemId.endsWith(targetId)) return true;
    }
  }

  // Extraer campos normalizados
  let rawFields: (string | number | null | undefined)[] = [];
  if (Array.isArray(itemOrFields)) {
    rawFields = itemOrFields;
  } else if (typeof fieldExtractor === 'function') {
    rawFields = fieldExtractor(itemOrFields as T);
  } else if (typeof itemOrFields === 'object' && itemOrFields !== null) {
    rawFields = Object.values(itemOrFields as any);
  }

  const normalizedFields = rawFields
    .filter((f) => f !== null && f !== undefined)
    .map((f) => normalizeSearchText(String(f)));

  // 2. Soporte para comas (OR de expresiones)
  const orSegments = trimmed.split(',').map((s) => s.trim()).filter(Boolean);

  return orSegments.some((segment) => {
    // 3. Multi-término AND por espacio
    const terms = segment.split(/\s+/).filter(Boolean).map(normalizeSearchText);
    return terms.every((term) =>
      normalizedFields.some((fieldStr) => fieldStr.includes(term))
    );
  });
}
