'use client';

import React from 'react';
import {
  Wallet,
  CreditCard,
  TrendingUp,
  Navigation,
  CheckCircle2,
  Printer,
  ArrowUpDown,
  AlertTriangle,
  MapPin,
  ShoppingCart,
} from 'lucide-react';

export type BuyerSortMode = 'route' | 'alerts' | 'alpha';

export interface NextRouteTaskInfo {
  id: string;
  productName: string;
  accountingId?: number | string | null;
  pendingQty: number;
  unit: string;
  warehouseLocation?: string | null;
  puesto?: string | null;
  hasAlert?: boolean;
}

export interface BuyerCashBarProps {
  receivedCash: number;
  spentCash: number;
  creditTotal: number;
  hasActiveBudget?: boolean;
  budgetStatus?: string | null;
  completedCount: number;
  totalCount: number;
  nextTask: NextRouteTaskInfo | null;
  onBuyNextTask?: (taskId: string) => void;
  sortMode: BuyerSortMode;
  onSortModeChange: (mode: BuyerSortMode) => void;
  onOpenPrintVoucher: () => void;
  buyerName?: string | null;
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

export default function BuyerCashBar({
  receivedCash,
  spentCash,
  creditTotal,
  hasActiveBudget = false,
  budgetStatus,
  completedCount,
  totalCount,
  nextTask,
  onBuyNextTask,
  sortMode,
  onSortModeChange,
  onOpenPrintVoucher,
  buyerName,
}: BuyerCashBarProps) {
  const balanceInHand = receivedCash - spentCash;
  const remainingCount = Math.max(0, totalCount - completedCount);
  const progressPct = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;
  const isTurnComplete = totalCount > 0 && completedCount === totalCount;
  const toReturnCash = receivedCash - spentCash;

  const sortOptions: Array<{ key: BuyerSortMode; label: string }> = [
    { key: 'route', label: 'Mi Ruta Habitual' },
    { key: 'alerts', label: 'Alertas' },
    { key: 'alpha', label: 'A-Z' },
  ];

  const locationParts = [
    nextTask?.warehouseLocation ? `Bodega ${nextTask.warehouseLocation}` : null,
    nextTask?.puesto ? `Puesto ${nextTask.puesto}` : null,
  ].filter(Boolean);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '16px',
      }}
    >
      {/* Bloque superior: Caja en vivo + Crédito CxP */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
        }}
      >
        {/* Caja Efectivo */}
        <div
          style={{
            backgroundColor: '#0F172A',
            color: '#FFFFFF',
            borderRadius: '14px',
            padding: '14px 16px',
            border: balanceInHand < 0 ? '2px solid #EF4444' : '1px solid #1E293B',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.12)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wallet size={18} color="#34D399" />
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', color: '#94A3B8', textTransform: 'uppercase' }}>
                Caja Efectivo
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '999px',
                backgroundColor: hasActiveBudget ? 'rgba(16, 185, 129, 0.18)' : 'rgba(245, 158, 11, 0.18)',
                color: hasActiveBudget ? '#34D399' : '#FBBF24',
              }}
            >
              {hasActiveBudget ? (budgetStatus === 'authorized' ? 'Autorizada' : 'Activa') : 'Sin base hoy'}
            </span>
          </div>

          <div
            style={{
              fontSize: '24px',
              fontWeight: 900,
              color: balanceInHand < 0 ? '#FCA5A5' : '#FFFFFF',
              lineHeight: 1.1,
              marginBottom: '8px',
            }}
          >
            {formatCop(balanceInHand)}
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#94A3B8', marginLeft: '8px' }}>
              Saldo en Mano
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '12px',
              color: '#CBD5E1',
              borderTop: '1px solid rgba(148, 163, 184, 0.2)',
              paddingTop: '8px',
            }}
          >
            <span>
              Recibido: <strong style={{ color: '#FFFFFF' }}>{formatCop(receivedCash)}</strong>
            </span>
            <span>
              Gastado: <strong style={{ color: '#FCA5A5' }}>{formatCop(spentCash)}</strong>
            </span>
          </div>
        </div>

        {/* Crédito Hoy (CxP) */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            color: '#0F172A',
            borderRadius: '14px',
            padding: '14px 16px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CreditCard size={18} color="#4F46E5" />
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.04em', color: '#475569', textTransform: 'uppercase' }}>
                Crédito Hoy (CxP)
              </span>
            </div>
            {buyerName ? (
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748B' }}>
                {buyerName}
              </span>
            ) : null}
          </div>

          <div style={{ fontSize: '24px', fontWeight: 900, color: '#312E81', lineHeight: 1.1, marginBottom: '8px' }}>
            {formatCop(creditTotal)}
          </div>

          <div style={{ fontSize: '12px', color: '#64748B', borderTop: '1px solid #F1F5F9', paddingTop: '8px' }}>
            Acumulado separado de compras a crédito (no descuenta efectivo).
          </div>
        </div>
      </div>

      {/* Barra de progreso del turno */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '12px',
          padding: '12px 16px',
          border: '1px solid #E2E8F0',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} color={isTurnComplete ? '#059669' : '#0284C7'} />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A' }}>
              {completedCount} / {totalCount} listos · Te faltan {remainingCount}
            </span>
          </div>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 900,
              color: isTurnComplete ? '#059669' : '#0284C7',
            }}
          >
            {progressPct}%
          </span>
        </div>

        <div
          style={{
            width: '100%',
            height: '10px',
            backgroundColor: '#E2E8F0',
            borderRadius: '999px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              backgroundColor: isTurnComplete ? '#10B981' : '#0EA5E9',
              borderRadius: '999px',
              transition: 'width 0.25s ease',
            }}
          />
        </div>
      </div>

      {/* Tarjeta Siguiente en tu Ruta OR Cierre de Turno 100% */}
      {isTurnComplete ? (
        <div
          style={{
            backgroundColor: '#ECFDF5',
            border: '2px solid #10B981',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={24} color="#059669" />
            <div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#065F46' }}>
                Cierre de Turno 100%
              </div>
              <div style={{ fontSize: '12px', color: '#047857', fontWeight: 600 }}>
                Todas las compras del turno están completadas. Cuadre final listo para entrega:
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '8px',
            }}
          >
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px 12px', border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: '11px', color: '#047857', fontWeight: 700 }}>Recibido</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#064E3B' }}>{formatCop(receivedCash)}</div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px 12px', border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: '11px', color: '#047857', fontWeight: 700 }}>Gastado Efectivo</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#064E3B' }}>{formatCop(spentCash)}</div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px 12px', border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: '11px', color: '#047857', fontWeight: 700 }}>A Devolver</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: toReturnCash < 0 ? '#B91C1C' : '#064E3B' }}>
                {formatCop(toReturnCash)}
              </div>
            </div>
            <div style={{ backgroundColor: '#FFFFFF', borderRadius: '10px', padding: '10px 12px', border: '1px solid #A7F3D0' }}>
              <div style={{ fontSize: '11px', color: '#4338CA', fontWeight: 700 }}>Crédito</div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#312E81' }}>{formatCop(creditTotal)}</div>
            </div>
          </div>
        </div>
      ) : nextTask ? (
        <div
          style={{
            backgroundColor: '#FFFBEB',
            border: '2px solid #F59E0B',
            borderRadius: '14px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px', flex: '1 1 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Navigation size={15} color="#B45309" />
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Siguiente en tu Ruta
              </span>
              {nextTask.hasAlert ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#B91C1C',
                    backgroundColor: '#FEE2E2',
                    padding: '2px 7px',
                    borderRadius: '999px',
                  }}
                >
                  <AlertTriangle size={12} /> Alerta
                </span>
              ) : null}
            </div>

            <div style={{ fontSize: '16px', fontWeight: 900, color: '#0F172A' }}>
              {nextTask.accountingId ? `#${nextTask.accountingId} ` : ''}
              {nextTask.productName}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 700, color: '#78350F' }}>
              <span>
                Faltan {formatQty(nextTask.pendingQty)} {nextTask.unit}
              </span>
              {locationParts.length > 0 ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#92400E' }}>
                  <MapPin size={13} /> {locationParts.join(' · ')}
                </span>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={() => onBuyNextTask?.(nextTask.id)}
            style={{
              minHeight: '52px',
              padding: '0 24px',
              backgroundColor: '#059669',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 900,
              letterSpacing: '0.03em',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 10px rgba(5, 150, 105, 0.25)',
            }}
          >
            <ShoppingCart size={18} />
            COMPRAR
          </button>
        </div>
      ) : null}

      {/* Barra inferior: Selector de orden + Comprobante Imprimible */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: '#475569', marginRight: '4px' }}>
            <ArrowUpDown size={14} /> Orden:
          </span>
          {sortOptions.map((opt) => {
            const active = sortMode === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => onSortModeChange(opt.key)}
                style={{
                  minHeight: '40px',
                  padding: '0 14px',
                  borderRadius: '10px',
                  border: active ? '2px solid #0F172A' : '1px solid #CBD5E1',
                  backgroundColor: active ? '#0F172A' : '#FFFFFF',
                  color: active ? '#FFFFFF' : '#334155',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onOpenPrintVoucher}
          style={{
            minHeight: '44px',
            padding: '0 16px',
            borderRadius: '10px',
            border: '1px solid #0F172A',
            backgroundColor: '#FFFFFF',
            color: '#0F172A',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Printer size={16} />
          Comprobante Imprimible
        </button>
      </div>
    </div>
  );
}
