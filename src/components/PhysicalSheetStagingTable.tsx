'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Info,
  Calculator,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Search,
  X
} from 'lucide-react';
import {
  PhysicalSheetType,
  TargetBalanceColumn,
  CatalogProductOption,
  ReconciledSheetRow,
  ArbitrationResolution
} from '@/lib/inventory/physical-sheet-parser';

type SortField = 'rawName' | 'matchedProduct' | 'quantity' | null;
type SortOrder = 'asc' | 'desc';

function normalizePhoneticSpanish(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/z/g, 's')
    .replace(/ce/g, 'se')
    .replace(/ci/g, 'si')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface PhysicalSheetStagingTableProps {
  sheetType: PhysicalSheetType;
  reconciledRows: ReconciledSheetRow[];
  filteredCatalog: CatalogProductOption[];
  onToggleSelect: (rowId: string, selected: boolean) => void;
  onToggleSelectAll: (selected: boolean) => void;
  onProductChange: (rowId: string, newProductId: string) => void;
  onColChange: (rowId: string, newCol: TargetBalanceColumn) => void;
  onQtyChange: (rowId: string, newQty: number) => void;
  onResolutionChange: (rowId: string, resolution: ArbitrationResolution) => void;
  onAddManualRow: () => void;
  onDeleteRow: (rowId: string) => void;
}

function evaluateMathExpression(raw: string): number {
  const cleaned = String(raw || '').trim().replace(/,/g, '.').replace(/^[+=]/, '');
  if (!cleaned) return 0;
  if (/^[\d.+\-*/()\s]+$/.test(cleaned)) {
    try {
      const tokens = cleaned.match(/(\d+(?:\.\d+)?|[+\-*/()])/g);
      if (!tokens) return parseFloat(cleaned) || 0;
      const evaluated = Function(`"use strict"; return (${tokens.join('')});`)();
      if (typeof evaluated === 'number' && Number.isFinite(evaluated)) {
        return Math.max(0, Math.round(evaluated * 100) / 100);
      }
    } catch {
      return Math.max(0, parseFloat(cleaned) || 0);
    }
  }
  return Math.max(0, parseFloat(cleaned) || 0);
}

export default function PhysicalSheetStagingTable({
  sheetType,
  reconciledRows,
  filteredCatalog,
  onToggleSelect,
  onToggleSelectAll,
  onProductChange,
  onColChange,
  onQtyChange,
  onResolutionChange,
  onAddManualRow,
  onDeleteRow
}: PhysicalSheetStagingTableProps) {
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
  const [rowFilterQuery, setRowFilterQuery] = useState<string>('');
  const [showFormulaTooltip, setShowFormulaTooltip] = useState<boolean>(false);
  const [activeDropdownRowIndex, setActiveDropdownRowIndex] = useState<number | null>(null);
  const [activeRowSearchQuery, setActiveRowSearchQuery] = useState<string | null>(null);
  const [focusedDropdownItemIndex, setFocusedDropdownItemIndex] = useState<number>(0);
  const [rawQtyDrafts, setRawQtyDrafts] = useState<Record<string, string>>({});

  // Ciclo Tri-Estado Inviolable: Neutral (null) -> Ascendente ('asc') -> Descendente ('desc') -> Neutral (null)
  const handleToggleSort = (field: Exclude<SortField, null>) => {
    if (sortField !== field) {
      setSortField(field);
      setSortOrder('asc');
    } else if (sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      setSortField(null);
      setSortOrder('asc');
    }
  };

  const displayRows = useMemo(() => {
    let base = reconciledRows;
    const qRaw = rowFilterQuery.trim();
    if (qRaw) {
      if (qRaw.startsWith('#')) {
        const idTarget = qRaw.slice(1).trim().toLowerCase();
        base = base.filter(r => String(r.matchedAccountingId || '').toLowerCase() === idTarget);
      } else if (qRaw.toLowerCase() === '@sinmatch' || qRaw.toLowerCase() === '@alerta') {
        base = base.filter(r => !r.matchedProductId || r.conciliationStatus === 'discrepancy');
      } else {
        const tokens = normalizePhoneticSpanish(qRaw).split(' ').filter(Boolean);
        base = base.filter(r => {
          const haystack = normalizePhoneticSpanish(
            `${r.rawProductName} ${r.matchedProductName} ${r.matchedAccountingId} ${r.supplierName || ''}`
          );
          return tokens.every(t => haystack.includes(t));
        });
      }
    }

    if (!sortField) return base;

    return [...base].sort((a, b) => {
      if (sortField === 'quantity') {
        const numA = Number(a.quantity) || 0;
        const numB = Number(b.quantity) || 0;
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }
      const valA =
        sortField === 'rawName'
          ? a.rawProductName || a.matchedProductName || ''
          : a.matchedProductName || a.rawProductName || '';
      const valB =
        sortField === 'rawName'
          ? b.rawProductName || b.matchedProductName || ''
          : b.matchedProductName || b.rawProductName || '';
      const cmp = valA.localeCompare(valB, 'es', { sensitivity: 'base', numeric: true });
      return sortOrder === 'asc' ? cmp : -cmp;
    });
  }, [reconciledRows, rowFilterQuery, sortField, sortOrder]);

  const eligiblePositiveRows = reconciledRows.filter(r => r.quantity > 0 && Boolean(r.matchedProductId));
  const allSelected =
    eligiblePositiveRows.length > 0 && eligiblePositiveRows.every(r => r.selected);

  // Protocolo 4.1 estandar-galerias-frufresco: Tolerancia Fonética Z<->S, Multi-Token no contiguo y prioridad (ID) +8000 pts
  const getScoredProductsForQuery = (query: string): CatalogProductOption[] => {
    const qRaw = (query || '').trim();
    if (!qRaw) return filteredCatalog.slice(0, 25);

    const parenMatch = qRaw.match(/\((\d+)\)/);
    const explicitId = parenMatch ? parenMatch[1] : qRaw.startsWith('#') ? qRaw.slice(1).trim() : null;
    const normQ = normalizePhoneticSpanish(qRaw);
    const queryTokens = normQ.split(' ').filter(Boolean);

    const scored = filteredCatalog
      .map(p => {
        const accRaw = String(p.accounting_id || p.sku || '').trim().toLowerCase();
        const normName = normalizePhoneticSpanish(p.name || '');
        const normHaystack = `${normName} ${accRaw}`;
        let score = 0;

        if (explicitId && accRaw === explicitId.toLowerCase()) {
          score += 8000;
        }
        if (accRaw === qRaw.toLowerCase()) score += 1200;
        else if (accRaw.startsWith(qRaw.toLowerCase())) score += 600;

        if (normName === normQ) score += 1000;
        else if (normName.startsWith(normQ)) score += 500;
        else if (normName.includes(normQ)) score += 250;

        if (queryTokens.length > 0 && queryTokens.every(tok => normHaystack.includes(tok))) {
          score += 180 + queryTokens.length * 25;
        }

        return { p, score };
      })
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(x => x.p);
    return scored;
  };

  const scrollToRow = (idx: number) => {
    const rowEl = document.getElementById(`physical-staged-row-${idx}`);
    const container = document.getElementById('physical-staged-scroll-container');
    if (rowEl && container) {
      const rowTop = rowEl.offsetTop;
      container.scrollTo({ top: Math.max(0, rowTop - 75), behavior: 'smooth' });
    }
  };

  const stickyThBase: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 30,
    backgroundColor: '#F8FAFC',
    borderBottom: '2px solid #E2E8F0',
    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
    fontSize: '0.71rem',
    fontWeight: 800,
    color: '#475569',
    letterSpacing: '0.04em',
    userSelect: 'none'
  };

  return (
    <div
      id="physical-staged-scroll-container"
      style={{ flex: 1, minWidth: '460px', padding: 0, overflowY: 'auto', height: '100%', position: 'relative', scrollBehavior: 'smooth', backgroundColor: '#FFFFFF' }}
    >
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, textAlign: 'left', position: 'relative' }}>
        <thead>
          <tr>
            <th style={{ ...stickyThBase, padding: '0.55rem 0.45rem', textAlign: 'center', width: '36px' }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={e => onToggleSelectAll(e.target.checked)}
                style={{ transform: 'scale(1.15)', cursor: 'pointer' }}
              />
            </th>
            <th
              onClick={() => handleToggleSort('rawName')}
              title="Clic para ordenar: Ascendente (A→Z) → Descendente (Z→A) → Orden natural del documento"
              style={{ ...stickyThBase, padding: '0.55rem 0.85rem', textAlign: 'left', width: '32%', cursor: 'pointer' }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: sortField === 'rawName' ? '#059669' : '#475569' }}>
                <span>NOMBRE EN DOCUMENTO</span>
                {sortField === 'rawName' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                ) : (
                  <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
                )}
              </div>
            </th>
            <th
              style={{ ...stickyThBase, padding: '0.45rem 0.65rem', textAlign: 'left', width: '40%' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div
                  onClick={() => handleToggleSort('matchedProduct')}
                  title="Clic para ordenar por Producto Homologado (Tri-Estado)"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: sortField === 'matchedProduct' ? '#059669' : '#475569', whiteSpace: 'nowrap' }}
                >
                  <span>TU PRODUCTO (ID)</span>
                  {sortField === 'matchedProduct' ? (
                    sortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                  ) : (
                    <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
                  )}
                </div>
                <div
                  onClick={e => e.stopPropagation()}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#FFFFFF', border: '1px solid #CBD5E1', borderRadius: '7px', padding: '2px 7px', flex: 1, maxWidth: '185px' }}
                >
                  <Search size={11} color="#64748B" />
                  <input
                    type="text"
                    value={rowFilterQuery}
                    onChange={e => setRowFilterQuery(e.target.value)}
                    placeholder="Filtrar #ID, @sinmatch..."
                    style={{ border: 'none', outline: 'none', fontSize: '0.68rem', fontWeight: 700, color: '#0F172A', width: '100%', backgroundColor: 'transparent' }}
                  />
                  {rowFilterQuery && (
                    <button
                      type="button"
                      onClick={() => setRowFilterQuery('')}
                      style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', display: 'flex', color: '#94A3B8' }}
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              </div>
            </th>
            <th
              onClick={() => handleToggleSort('quantity')}
              title="Clic para ordenar por Cantidad (Menor→Mayor → Mayor→Menor → Natural)"
              style={{ ...stickyThBase, padding: '0.55rem 0.65rem', textAlign: 'center', width: '28%', cursor: 'pointer' }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', position: 'relative', color: sortField === 'quantity' ? '#059669' : '#475569' }}>
                <span>CANT. / COL</span>
                {sortField === 'quantity' ? (
                  sortOrder === 'asc' ? <ArrowUp size={12} strokeWidth={2.5} /> : <ArrowDown size={12} strokeWidth={2.5} />
                ) : (
                  <ArrowUpDown size={11} style={{ opacity: 0.4 }} />
                )}
                <div
                  style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                  onMouseEnter={() => setShowFormulaTooltip(true)}
                  onMouseLeave={() => setShowFormulaTooltip(false)}
                  onClick={e => {
                    e.stopPropagation();
                    setShowFormulaTooltip(prev => !prev);
                  }}
                >
                  <div
                    style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#EFF6FF', border: '1px solid #93C5FD', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Info size={11} color="#2563EB" />
                  </div>
                  {showFormulaTooltip && (
                    <div
                      style={{ position: 'absolute', top: '100%', right: '-12px', marginTop: '8px', width: '250px', backgroundColor: '#1E293B', color: '#FFFFFF', padding: '10px 12px', borderRadius: '10px', fontSize: '0.72rem', lineHeight: 1.45, textAlign: 'left', zIndex: 9999, boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.4)', border: '1px solid #334155', fontWeight: 'normal' }}
                    >
                      <div style={{ fontWeight: 800, color: '#60A5FA', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Calculator size={13} color="#60A5FA" />
                        <span>Fórmulas rápidas tipo Excel</span>
                      </div>
                      <div style={{ backgroundColor: '#0F172A', padding: '5px 8px', borderRadius: '6px', fontFamily: 'monospace', color: '#38BDF8', fontSize: '0.7rem' }}>
                        <div><strong style={{ color: '#FCD34D' }}>408+70</strong> → <strong>478</strong></div>
                        <div><strong style={{ color: '#FCD34D' }}>+900/24</strong> → <strong>37.5</strong></div>
                        <div><strong style={{ color: '#FCD34D' }}>10+5+2,5</strong> → <strong>17.5</strong></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </th>
          </tr>
        </thead>

        <tbody>
          {displayRows.map((row, idx) => {
            const isConfidenceHigh = row.confidence >= 90;
            const isActiveRow = activeDropdownRowIndex === idx;
            const currentInputVal =
              isActiveRow && activeRowSearchQuery !== null
                ? activeRowSearchQuery
                : row.matchedProductId
                ? `${row.matchedProductName} (${row.matchedAccountingId})`
                : '';

            const draftQty =
              rawQtyDrafts[row.rowId] !== undefined ? rawQtyDrafts[row.rowId] : String(row.quantity);

            return (
              <tr
                key={row.rowId}
                id={`physical-staged-row-${idx}`}
                style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: isActiveRow ? '#FFFFFF' : row.conciliationStatus === 'discrepancy' ? '#FFFBEB' : row.matchedProductId ? isConfidenceHigh ? '#FFFFFF' : '#FEFCE8' : '#FFF7ED', boxShadow: isActiveRow ? '0 10px 25px -4px rgba(37, 99, 235, 0.16)' : 'none', borderLeft: isActiveRow ? '4px solid #2563EB' : '4px solid transparent', zIndex: isActiveRow ? 20 : 1, position: 'relative', transition: 'all 0.15s ease' }}
              >
                <td style={{ padding: '0.45rem 0.45rem', textAlign: 'center', width: '36px', borderBottom: '1px solid #F1F5F9' }}>
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={e => onToggleSelect(row.rowId, e.target.checked)}
                    style={{ transform: 'scale(1.15)', cursor: 'pointer' }}
                  />
                </td>

                {/* COLUMNA 1: NOMBRE EN DOCUMENTO + PÍLDORAS IGUAL A PEDIDOS */}
                <td style={{ padding: '0.45rem 0.85rem', width: '32%', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: isActiveRow ? '0.9rem' : '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                    {row.rawProductName || 'Ítem manual'}
                  </div>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748B', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <span
                      style={{ backgroundColor: '#FFFBEB', color: '#B45309', border: '1.5px solid #FBBF24', padding: '1px 7px', borderRadius: '6px', fontWeight: 900 }}
                    >
                      {row.rawQuantityText || `${row.quantity} ${row.matchedUnit}`}
                    </span>

                    {row.matchedProductId ? (
                      <span
                        style={{ backgroundColor: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', padding: '1px 6px', borderRadius: '6px', fontSize: '0.67rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <CheckCircle2 size={11} color="#15803D" /> {row.confidence}%
                      </span>
                    ) : (
                      <span
                        style={{ backgroundColor: '#FEE2E2', color: '#B91C1C', border: '1px solid #FCA5A5', padding: '1px 6px', borderRadius: '6px', fontSize: '0.67rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                      >
                        <AlertCircle size={11} color="#B91C1C" /> Sin Match
                      </span>
                    )}

                    {row.conciliationStatus === 'matched_ops' && (
                      <span style={{ backgroundColor: '#E0F2FE', color: '#0369A1', border: '1px solid #BAE6FD', padding: '1px 6px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: 800 }}>
                        OPS: {row.opsCurrentValue}
                      </span>
                    )}
                    {row.supplierName && (
                      <span style={{ backgroundColor: '#F1F5F9', color: '#334155', padding: '1px 6px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: 700 }}>
                        Prov: {row.supplierName}
                      </span>
                    )}
                    {row.unitCostPaid && (
                      <span style={{ backgroundColor: '#ECFDF5', color: '#047857', padding: '1px 6px', borderRadius: '6px', fontSize: '0.66rem', fontWeight: 800 }}>
                        ${row.unitCostPaid.toLocaleString('es-CO')}
                      </span>
                    )}
                  </div>

                  {row.conciliationStatus === 'discrepancy' && (
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#B45309' }}>
                        OPS ({row.opsCurrentValue}) vs Papel ({row.quantity}):
                      </span>
                      <button
                        type="button"
                        onClick={() => onResolutionChange(row.rowId, 'use_sheet')}
                        style={{ padding: '1px 6px', fontSize: '0.64rem', fontWeight: 800, borderRadius: '4px', cursor: 'pointer', border: '1px solid #D97706', backgroundColor: row.resolution === 'use_sheet' ? '#D97706' : '#FFFFFF', color: row.resolution === 'use_sheet' ? '#FFFFFF' : '#B45309' }}
                      >
                        Usar Papel
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolutionChange(row.rowId, 'keep_ops')}
                        style={{ padding: '1px 6px', fontSize: '0.64rem', fontWeight: 800, borderRadius: '4px', cursor: 'pointer', border: '1px solid #CBD5E1', backgroundColor: row.resolution === 'keep_ops' ? '#334155' : '#FFFFFF', color: row.resolution === 'keep_ops' ? '#FFFFFF' : '#475569' }}
                      >
                        Mantener OPS
                      </button>
                    </div>
                  )}
                </td>

                {/* COLUMNA 2: BUSCADOR INTERACTIVO DE PRODUCTO (IDÉNTICO A PEDIDOS) */}
                <td style={{ padding: '0.4rem 0.65rem', position: 'relative', width: '40%', borderBottom: '1px solid #F1F5F9' }}>
                  <input
                    id={`physical-sku-input-${idx}`}
                    type="text"
                    placeholder="Buscar ID contable o producto..."
                    autoComplete="off"
                    value={currentInputVal}
                    onFocus={e => {
                      e.target.select();
                      setActiveDropdownRowIndex(idx);
                      setFocusedDropdownItemIndex(0);
                      setActiveRowSearchQuery(null);
                      scrollToRow(idx);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        setActiveDropdownRowIndex(prev => (prev === idx ? null : prev));
                        setActiveRowSearchQuery(null);
                      }, 200);
                    }}
                    onChange={e => {
                      setActiveDropdownRowIndex(idx);
                      setFocusedDropdownItemIndex(0);
                      setActiveRowSearchQuery(e.target.value);
                    }}
                    onKeyDown={e => {
                      const query = activeRowSearchQuery !== null ? activeRowSearchQuery : row.matchedProductName || '';
                      const scoredList = getScoredProductsForQuery(query);
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        if (scoredList.length > 0) {
                          setFocusedDropdownItemIndex(prev => Math.min(prev + 1, scoredList.length - 1));
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setFocusedDropdownItemIndex(prev => Math.max(prev - 1, 0));
                      } else if (e.key === 'Enter' || e.key === 'Tab') {
                        const chosen = scoredList[focusedDropdownItemIndex];
                        if (chosen) {
                          e.preventDefault();
                          onProductChange(row.rowId, chosen.id);
                          setActiveDropdownRowIndex(null);
                          setActiveRowSearchQuery(null);
                          const qtyInput = document.getElementById(`physical-qty-input-${idx}`) as HTMLInputElement | null;
                          if (qtyInput) {
                            qtyInput.focus();
                            qtyInput.select();
                          }
                        }
                      } else if (e.key === 'Escape') {
                        setActiveDropdownRowIndex(null);
                        setActiveRowSearchQuery(null);
                      }
                    }}
                    style={{ width: '100%', padding: isActiveRow ? '8px 11px' : '7px 10px', borderRadius: '9px', border: isActiveRow ? '2px solid #2563EB' : row.matchedProductId ? isConfidenceHigh ? '1.5px solid #E2E8F0' : '1.5px solid #FCD34D' : '1.5px solid #F97316', fontSize: '0.84rem', fontWeight: 800, color: '#0F172A', backgroundColor: row.matchedProductId ? '#FFFFFF' : '#FFFBEB', outline: 'none', boxShadow: isActiveRow ? '0 0 0 3px rgba(37, 99, 235, 0.15)' : '0 1px 2px rgba(0,0,0,0.04)' }}
                  />

                  {isActiveRow && (() => {
                    const query = activeRowSearchQuery !== null ? activeRowSearchQuery : '';
                    const scoredList = getScoredProductsForQuery(query);
                    if (scoredList.length === 0) return null;
                    return (
                      <div
                        style={{ position: 'absolute', top: '100%', marginTop: '4px', left: 0, right: 0, minWidth: '380px', zIndex: 9999, backgroundColor: '#FFFFFF', borderRadius: '12px', boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.25)', border: '1px solid #CBD5E1', maxHeight: '260px', overflowY: 'auto' }}
                      >
                        {scoredList.map((p, pIdx) => {
                          const isFocused = pIdx === focusedDropdownItemIndex;
                          return (
                            <div
                              key={p.id}
                              onMouseDown={e => {
                                e.preventDefault();
                                onProductChange(row.rowId, p.id);
                                setActiveDropdownRowIndex(null);
                                setActiveRowSearchQuery(null);
                                const qtyInput = document.getElementById(`physical-qty-input-${idx}`) as HTMLInputElement | null;
                                if (qtyInput) {
                                  qtyInput.focus();
                                  qtyInput.select();
                                }
                              }}
                              onMouseEnter={() => setFocusedDropdownItemIndex(pIdx)}
                              style={{ padding: '0.65rem 0.9rem', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', borderLeft: isFocused ? '4px solid #2563EB' : '4px solid transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isFocused ? '#DBEAFE' : '#FFFFFF' }}
                            >
                              <span style={{ fontWeight: isFocused ? 900 : 700, color: isFocused ? '#1E3A8A' : '#0F172A', fontSize: '0.84rem' }}>
                                {p.name}{' '}
                                <span style={{ fontSize: '0.78rem', color: isFocused ? '#2563EB' : '#64748B', fontWeight: 600 }}>
                                  (ID: {p.accounting_id || p.sku})
                                </span>
                              </span>
                              <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#047857', backgroundColor: '#ECFDF5', padding: '2px 7px', borderRadius: '6px' }}>
                                {p.unit_of_measure}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </td>

                {/* COLUMNA 3: CANTIDAD CON FÓRMULAS EXCEL + DESTINO SÁBANA */}
                <td style={{ padding: '0.4rem 0.65rem', textAlign: 'center', width: '28%', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <input
                      id={`physical-qty-input-${idx}`}
                      type="text"
                      value={draftQty}
                      onFocus={e => {
                        e.target.select();
                        scrollToRow(idx);
                      }}
                      onChange={e => {
                        const rawVal = e.target.value;
                        setRawQtyDrafts(prev => ({ ...prev, [row.rowId]: rawVal }));
                      }}
                      onBlur={e => {
                        const val = evaluateMathExpression(e.currentTarget.value);
                        onQtyChange(row.rowId, val);
                        setRawQtyDrafts(prev => {
                          const next = { ...prev };
                          delete next[row.rowId];
                          return next;
                        });
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const val = evaluateMathExpression(e.currentTarget.value);
                          onQtyChange(row.rowId, val);
                          setRawQtyDrafts(prev => {
                            const next = { ...prev };
                            delete next[row.rowId];
                            return next;
                          });
                          const nextSku = document.getElementById(`physical-sku-input-${idx + 1}`) as HTMLInputElement | null;
                          if (nextSku) {
                            nextSku.focus();
                            nextSku.select();
                            scrollToRow(idx + 1);
                          }
                        }
                      }}
                      style={{ width: '78px', padding: '7px 8px', borderRadius: '8px', border: '2px solid #E2E8F0', textAlign: 'center', fontWeight: 800, fontSize: '0.92rem', color: '#0F172A', backgroundColor: '#FFFFFF' }}
                    />

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                      <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>
                        {row.matchedUnit}
                      </span>
                      {sheetType === 'desperdicio' || sheetType === 'pedidos_desperdicio' ? (
                        <select
                          value={row.targetColumn}
                          onChange={e => onColChange(row.rowId, e.target.value as TargetBalanceColumn)}
                          style={{ padding: '1px 5px', borderRadius: '5px', border: '1px solid #CBD5E1', fontSize: '0.66rem', fontWeight: 800, backgroundColor: row.targetColumn === 'Q' ? '#FEF2F2' : '#FFF7ED', color: row.targetColumn === 'Q' ? '#B91C1C' : '#C2410C', cursor: 'pointer' }}
                        >
                          <option value="Q">Col Q (Desp)</option>
                          <option value="R">Col R (Bas)</option>
                        </select>
                      ) : (
                        <span
                          style={{ fontSize: '0.65rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', backgroundColor: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}
                        >
                          Col {row.targetColumn}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteRow(row.rowId)}
                      title="Eliminar fila"
                      style={{ border: 'none', background: 'transparent', color: '#94A3B8', cursor: 'pointer', padding: '4px' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Botón para Agregar Ítem Manual en la Mesa de Trabajo (Idéntico a Pedidos) */}
      <div style={{ padding: '0.85rem 1rem', display: 'flex', justifyContent: 'center', backgroundColor: '#F8FAFC', borderTop: '1.5px dashed #CBD5E1' }}>
        <button
          type="button"
          onClick={onAddManualRow}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '10px', border: '1.5px dashed #0D9488', backgroundColor: '#F0FDFA', color: '#0F766E', fontSize: '0.84rem', fontWeight: 800, cursor: 'pointer' }}
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>+ Agregar Ítem Manual a la Mesa de Trabajo</span>
        </button>
      </div>

      <div style={{ height: '240px', pointerEvents: 'none' }} />
    </div>
  );
}
