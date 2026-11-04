'use client';

import React from 'react';
import { Check, CheckCircle2, Layers } from 'lucide-react';
import {
  PhysicalSheetType,
  TargetBalanceColumn,
  CatalogProductOption,
  ReconciledSheetRow,
  ArbitrationResolution
} from '@/lib/inventory/physical-sheet-parser';

interface PhysicalSheetStagingTableProps {
  sheetType: PhysicalSheetType;
  reconciledRows: ReconciledSheetRow[];
  filteredCatalog: CatalogProductOption[];
  onToggleSelect: (rowId: string, selected: boolean) => void;
  onProductChange: (rowId: string, newProductId: string) => void;
  onColChange: (rowId: string, newCol: TargetBalanceColumn) => void;
  onQtyChange: (rowId: string, newQty: number) => void;
  onResolutionChange: (rowId: string, resolution: ArbitrationResolution) => void;
}

export default function PhysicalSheetStagingTable({
  sheetType,
  reconciledRows,
  filteredCatalog,
  onToggleSelect,
  onProductChange,
  onColChange,
  onQtyChange,
  onResolutionChange
}: PhysicalSheetStagingTableProps) {
  if (reconciledRows.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#64748B',
          textAlign: 'center'
        }}
      >
        <Layers size={38} style={{ marginBottom: '0.6rem', opacity: 0.45 }} />
        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#94A3B8' }}>
          Mesa de Trabajo y Conciliación Lista
        </div>
        <p style={{ fontSize: '0.75rem', maxWidth: '420px', marginTop: '0.3rem' }}>
          Selecciona el tipo de planilla arriba, carga las fotos o PDF del turno a la izquierda y pulsa &laquo;Procesar Planilla Física con IA&raquo;.
        </p>
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
      <thead>
        <tr
          style={{
            backgroundColor: '#020617',
            color: '#94A3B8',
            textAlign: 'left',
            borderBottom: '1px solid #334155'
          }}
        >
          <th style={{ padding: '0.55rem', width: '32px' }}>
            <Check size={13} />
          </th>
          <th style={{ padding: '0.55rem' }}>Leído en Papel (Manuscrito)</th>
          <th style={{ padding: '0.55rem' }}>SKU Homologado (Catálogo FruFresco)</th>
          <th style={{ padding: '0.55rem', width: '110px' }}>Columna Destino</th>
          <th style={{ padding: '0.55rem', width: '105px', textAlign: 'right' }}>Cant. Papel</th>
          <th style={{ padding: '0.55rem', width: '230px' }}>Contraste OPS &amp; Arbitraje</th>
        </tr>
      </thead>
      <tbody>
        {reconciledRows.map(row => {
          const confColor = row.confidence >= 90 ? '#10B981' : row.confidence >= 70 ? '#F59E0B' : '#EF4444';
          return (
            <tr
              key={row.rowId}
              style={{
                borderBottom: '1px solid #1E293B',
                backgroundColor: row.conciliationStatus === 'discrepancy' ? 'rgba(245, 158, 11, 0.06)' : 'transparent',
                opacity: row.selected ? 1 : 0.55
              }}
            >
              <td style={{ padding: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={e => onToggleSelect(row.rowId, e.target.checked)}
                />
              </td>

              <td style={{ padding: '0.5rem' }}>
                <div style={{ fontWeight: 700, color: '#F1F5F9' }}>{row.rawProductName}</div>
                <div style={{ fontSize: '0.68rem', color: '#94A3B8', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <span>Leído: <strong>{row.rawQuantityText}</strong></span>
                  {row.rawPresentation && <span>· Pres: {row.rawPresentation}</span>}
                  {row.supplierName && <span style={{ color: '#38BDF8' }}>· Prov: {row.supplierName}</span>}
                  {row.unitCostPaid && <span style={{ color: '#34D399' }}>· ${row.unitCostPaid.toLocaleString('es-CO')}</span>}
                  {row.sourceNote && <span style={{ color: '#FBBF24' }}>· ({row.sourceNote})</span>}
                </div>
              </td>

              <td style={{ padding: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: confColor, flexShrink: 0 }}
                    title={`Confianza IA: ${row.confidence}%`}
                  />
                  <select
                    value={row.matchedProductId || ''}
                    onChange={e => onProductChange(row.rowId, e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: '#1E293B',
                      border: `1px solid ${row.matchedProductId ? '#334155' : '#EF4444'}`,
                      borderRadius: '6px',
                      padding: '0.3rem 0.45rem',
                      color: '#F8FAFC',
                      fontSize: '0.74rem'
                    }}
                  >
                    <option value="">-- Seleccionar SKU manualmente --</option>
                    {filteredCatalog.map(c => (
                      <option key={c.id} value={c.id}>
                        #{c.accounting_id || c.sku} — {c.name} ({c.unit_of_measure})
                      </option>
                    ))}
                  </select>
                </div>
              </td>

              <td style={{ padding: '0.5rem' }}>
                {sheetType === 'desperdicio' ? (
                  <select
                    value={row.targetColumn}
                    onChange={e => onColChange(row.rowId, e.target.value as TargetBalanceColumn)}
                    style={{
                      backgroundColor: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '6px',
                      padding: '0.28rem 0.4rem',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: row.targetColumn === 'Q' ? '#F87171' : '#FB923C'
                    }}
                  >
                    <option value="Q">Col Q · Avería</option>
                    <option value="R">Col R · Basura</option>
                  </select>
                ) : (
                  <span
                    style={{
                      fontSize: '0.71rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '6px',
                      backgroundColor: '#1E293B',
                      color: row.targetColumn === 'G' ? '#34D399' : '#38BDF8'
                    }}
                  >
                    Col {row.targetColumn} ({row.matchedUnit})
                  </span>
                )}
              </td>

              <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                <input
                  type="number"
                  step="0.01"
                  value={row.quantity}
                  onChange={e => onQtyChange(row.rowId, parseFloat(e.target.value))}
                  style={{
                    width: '88px',
                    textAlign: 'right',
                    backgroundColor: '#020617',
                    border: '1px solid #475569',
                    borderRadius: '6px',
                    padding: '0.3rem 0.45rem',
                    color: '#F8FAFC',
                    fontWeight: 800,
                    fontSize: '0.78rem'
                  }}
                />
              </td>

              <td style={{ padding: '0.5rem' }}>
                {row.conciliationStatus === 'new_entry' && (
                  <span style={{ color: '#34D399', fontSize: '0.71rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={13} /> Nuevo ingreso (OPS: 0)
                  </span>
                )}
                {row.conciliationStatus === 'matched_ops' && (
                  <span style={{ color: '#38BDF8', fontSize: '0.71rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <CheckCircle2 size={13} /> Conciliado con OPS ({row.opsCurrentValue})
                  </span>
                )}
                {row.conciliationStatus === 'discrepancy' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <span style={{ fontSize: '0.68rem', color: '#FBBF24', fontWeight: 700 }}>
                      OPS tiene: {row.opsCurrentValue} vs Papel: {row.quantity}
                    </span>
                    <div style={{ display: 'flex', gap: '0.3rem' }}>
                      <button
                        type="button"
                        onClick={() => onResolutionChange(row.rowId, 'use_sheet')}
                        style={{
                          padding: '0.18rem 0.45rem',
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: '1px solid #F59E0B',
                          backgroundColor: row.resolution === 'use_sheet' ? '#F59E0B' : 'transparent',
                          color: row.resolution === 'use_sheet' ? '#020617' : '#FBBF24'
                        }}
                      >
                        Usar Papel
                      </button>
                      <button
                        type="button"
                        onClick={() => onResolutionChange(row.rowId, 'keep_ops')}
                        style={{
                          padding: '0.18rem 0.45rem',
                          fontSize: '0.66rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          cursor: 'pointer',
                          border: '1px solid #475569',
                          backgroundColor: row.resolution === 'keep_ops' ? '#334155' : 'transparent',
                          color: '#CBD5E1'
                        }}
                      >
                        Mantener OPS
                      </button>
                    </div>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
