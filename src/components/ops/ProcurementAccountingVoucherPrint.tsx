'use client';

import React from 'react';
import { Printer, X, Banknote, CreditCard, FileText } from 'lucide-react';

export interface VoucherPurchaseRow {
  id: string;
  productName: string;
  accountingId?: number | string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalCost: number;
  paymentMethod: 'cash' | 'credit' | string;
  paymentCondition?: string | null;
  providerName: string;
  providerTaxId?: string | null;
  warehouseLocation?: string | null;
  puesto?: string | null;
  createdAt?: string | null;
}

export interface ProcurementAccountingVoucherPrintProps {
  isOpen: boolean;
  onClose: () => void;
  targetDate: string;
  buyerName: string;
  receivedCash?: number;
  purchases: VoucherPurchaseRow[];
}

function formatCop(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  const formatted = Math.round(abs)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return safe < 0 ? `-$${formatted}` : `$${formatted}`;
}

function formatQty(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (safe % 1 === 0) {
    return safe.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  const [intPart, decPart] = safe.toFixed(2).split('.');
  const cleanDec = (decPart || '').replace(/0+$/, '');
  const intFmt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return cleanDec ? `${intFmt},${cleanDec}` : intFmt;
}

function VoucherSectionTable({
  title,
  rows,
  totalAmount,
  isCredit,
}: {
  title: string;
  rows: VoucherPurchaseRow[];
  totalAmount: number;
  isCredit: boolean;
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          backgroundColor: isCredit ? '#EEF2FF' : '#ECFDF5',
          border: `1px solid ${isCredit ? '#C7D2FE' : '#A7F3D0'}`,
          borderRadius: '8px 8px 0 0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '13px', color: '#0F172A' }}>
          {isCredit ? <CreditCard size={16} color="#4338CA" /> : <Banknote size={16} color="#047857" />}
          <span>{title} ({rows.length})</span>
        </div>
        <div style={{ fontWeight: 900, fontSize: '14px', color: isCredit ? '#312E81' : '#065F46' }}>
          Subtotal: {formatCop(totalAmount)}
        </div>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: '14px 12px',
            border: '1px solid #E2E8F0',
            borderTop: 'none',
            borderRadius: '0 0 8px 8px',
            fontSize: '12px',
            color: '#64748B',
            fontStyle: 'italic',
          }}
        >
          Sin registros en esta modalidad para la jornada.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12px',
              border: '1px solid #CBD5E1',
              borderTop: 'none',
            }}
          >
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', color: '#334155', textAlign: 'left' }}>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800 }}>#ID</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800 }}>Producto</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800 }}>Proveedor / Ubicación</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800, textAlign: 'right' }}>Cant.</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800, textAlign: 'right' }}>V. Unit.</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800, textAlign: 'right' }}>Total</th>
                <th style={{ padding: '8px', borderBottom: '1px solid #CBD5E1', fontWeight: 800 }}>Condición</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const locParts = [
                  row.warehouseLocation ? `Bod. ${row.warehouseLocation}` : null,
                  row.puesto ? `Pto. ${row.puesto}` : null,
                ].filter(Boolean);
                const condLabel = isCredit
                  ? (row.paymentCondition || 'CRÉDITO')
                  : (row.paymentCondition || 'CONTADO / EFECTIVO');

                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>
                      {row.accountingId ? `#${row.accountingId}` : '—'}
                    </td>
                    <td style={{ padding: '8px', fontWeight: 700, color: '#0F172A' }}>
                      {row.productName}
                    </td>
                    <td style={{ padding: '8px', color: '#1E293B' }}>
                      <div style={{ fontWeight: 700 }}>{row.providerName}</div>
                      <div style={{ fontSize: '11px', color: '#64748B' }}>
                        {row.providerTaxId ? `NIT/CC: ${row.providerTaxId}` : 'Sin NIT/CC'}
                        {locParts.length > 0 ? ` · ${locParts.join(' · ')}` : ''}
                      </div>
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatQty(row.quantity)} {row.unit}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {formatCop(row.unitPrice)}
                    </td>
                    <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800, color: '#0F172A' }}>
                      {formatCop(row.totalCost)}
                    </td>
                    <td style={{ padding: '8px', fontSize: '11px', fontWeight: 700, color: isCredit ? '#3730A3' : '#065F46' }}>
                      {condLabel}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProcurementAccountingVoucherPrint({
  isOpen,
  onClose,
  targetDate,
  buyerName,
  receivedCash = 0,
  purchases,
}: ProcurementAccountingVoucherPrintProps) {
  if (!isOpen) return null;

  const cashRows = purchases.filter((p) => p.paymentMethod !== 'credit');
  const creditRows = purchases.filter((p) => p.paymentMethod === 'credit');

  const cashTotal = cashRows.reduce((acc, r) => acc + (Number(r.totalCost) || 0), 0);
  const creditTotal = creditRows.reduce((acc, r) => acc + (Number(r.totalCost) || 0), 0);
  const grandTotal = cashTotal + creditTotal;
  const toReturn = receivedCash - cashTotal;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <style jsx global>{`
        @media print {
          @page {
            size: letter portrait;
            margin: 1cm;
          }
          body * {
            visibility: hidden !important;
          }
          .procurement-voucher-print-area,
          .procurement-voucher-print-area * {
            visibility: visible !important;
          }
          .procurement-voucher-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div
        className="procurement-voucher-print-area"
        style={{
          width: '100%',
          maxWidth: '920px',
          maxHeight: '92vh',
          overflowY: 'auto',
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
          color: '#0F172A',
        }}
      >
        {/* Barra superior de acciones (no se imprime) */}
        <div
          className="no-print"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            paddingBottom: '14px',
            marginBottom: '16px',
            borderBottom: '1px solid #E2E8F0',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={20} color="#0F172A" />
            <span style={{ fontSize: '16px', fontWeight: 900 }}>
              Vista Previa — Comprobante Contable de Compras
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => window.print()}
              style={{
                minHeight: '44px',
                padding: '0 18px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#0F172A',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Printer size={16} />
              Imprimir Comprobante
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '10px',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#334155',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <X size={16} />
              Cerrar
            </button>
          </div>
        </div>

        {/* Encabezado imprimible */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            marginBottom: '18px',
            paddingBottom: '12px',
            borderBottom: '2px solid #0F172A',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '18px', fontWeight: 900, color: '#0F172A' }}>
              COMPROBANTE CONTABLE DE COMPRAS EN PLAZA
            </div>
            <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px' }}>
              Fecha de jornada: <strong>{targetDate}</strong> · Comprador: <strong>{buyerName || 'Comprador'}</strong>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '11px', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
              Total Compras Jornada
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: '#0F172A' }}>
              {formatCop(grandTotal)}
            </div>
          </div>
        </div>

        {/* Resumen financiero */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <div style={{ padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>Base Efectivo Recibida</div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#0F172A' }}>{formatCop(receivedCash)}</div>
          </div>
          <div style={{ padding: '10px 12px', border: '1px solid #A7F3D0', borderRadius: '8px', backgroundColor: '#ECFDF5' }}>
            <div style={{ fontSize: '11px', color: '#047857', fontWeight: 700 }}>Total Efectivo</div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#065F46' }}>{formatCop(cashTotal)}</div>
          </div>
          <div style={{ padding: '10px 12px', border: '1px solid #CBD5E1', borderRadius: '8px', backgroundColor: '#F8FAFC' }}>
            <div style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>Saldo / A Devolver</div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: toReturn < 0 ? '#B91C1C' : '#0F172A' }}>{formatCop(toReturn)}</div>
          </div>
          <div style={{ padding: '10px 12px', border: '1px solid #C7D2FE', borderRadius: '8px', backgroundColor: '#EEF2FF' }}>
            <div style={{ fontSize: '11px', color: '#4338CA', fontWeight: 700 }}>Total Crédito (CxP)</div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#312E81' }}>{formatCop(creditTotal)}</div>
          </div>
        </div>

        {/* Sección Efectivo */}
        <VoucherSectionTable
          title="Compras en Efectivo"
          rows={cashRows}
          totalAmount={cashTotal}
          isCredit={false}
        />

        {/* Sección Crédito */}
        <VoucherSectionTable
          title="Compras a Crédito"
          rows={creditRows}
          totalAmount={creditTotal}
          isCredit={true}
        />

        {/* Firmas de cuadre */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '32px',
            marginTop: '36px',
            paddingTop: '12px',
          }}
        >
          <div style={{ borderTop: '1px solid #64748B', paddingTop: '6px', fontSize: '12px', color: '#334155', textAlign: 'center' }}>
            Firma Comprador ({buyerName || 'Comprador'})
          </div>
          <div style={{ borderTop: '1px solid #64748B', paddingTop: '6px', fontSize: '12px', color: '#334155', textAlign: 'center' }}>
            Recibido Tesorería / Contabilidad
          </div>
        </div>
      </div>
    </div>
  );
}
