'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileWarning,
  MailWarning,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { FrequencyRadarEntry, FrequencyRadarResult } from '@/lib/orders/frequencyEngine';

interface FrequencyRadarDrawerProps {
  targetDate: string;
  onCountChange?: (urgentCount: number) => void;
  openTrigger?: number;
}

type FilterTab = 'urgent' | 'other_date_anomaly' | 'stuck_draft' | 'silent_missing' | 'covered';

export default function FrequencyRadarDrawer({
  targetDate,
  onCountChange,
  openTrigger = 0,
}: FrequencyRadarDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FrequencyRadarResult | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('urgent');
  const [search, setSearch] = useState('');

  const fetchRadar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError('Sesión expirada');
        return;
      }
      const dateParam = /^\d{4}-\d{2}-\d{2}$/.test(targetDate) ? `?date=${targetDate}` : '';
      const res = await fetch(`/api/orders/frequency-radar${dateParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Error cargando radar de frecuencias');
      }
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error consultando radar');
    } finally {
      setLoading(false);
    }
  }, [targetDate]);

  useEffect(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      fetchRadar();
    }
  }, [targetDate, fetchRadar]);

  const filteredEntries = useMemo(() => {
    if (!data) return [];
    let list: FrequencyRadarEntry[] = [];
    if (activeTab === 'covered') {
      list = data.covered;
    } else if (activeTab === 'urgent') {
      list = data.anomalies.filter(a => a.isOverdue);
    } else {
      list = data.anomalies.filter(a => a.status === activeTab);
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(item =>
      `${item.clientName} ${item.email || ''} ${item.expectedReason}`.toLowerCase().includes(q)
    );
  }, [data, activeTab, search]);

  const urgentCount = data?.summary.urgentAnomaliesCount ?? 0;
  const hasCritical = (data?.summary.otherDateAnomalyCount ?? 0) > 0;

  useEffect(() => {
    onCountChange?.(urgentCount);
  }, [urgentCount, onCountChange]);

  useEffect(() => {
    if (openTrigger > 0) {
      setIsOpen(true);
      fetchRadar();
    }
  }, [openTrigger, fetchRadar]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true);
          fetchRadar();
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '0.35rem 0.7rem',
          borderRadius: '8px',
          border: hasCritical
            ? '1px solid #FCA5A5'
            : urgentCount > 0
            ? '1px solid #FCD34D'
            : '1px solid #CBD5E1',
          backgroundColor: hasCritical
            ? '#FEF2F2'
            : urgentCount > 0
            ? '#FFFBEB'
            : '#F8FAFC',
          color: hasCritical ? '#B91C1C' : urgentCount > 0 ? '#B45309' : '#334155',
          fontSize: '0.78rem',
          fontWeight: 700,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        title="Radar determinístico de clientes habituales (>= 75% en 8 semanas)"
      >
        <Activity size={14} />
        <span>Radar Frecuencias</span>
        <span
          style={{
            padding: '1px 6px',
            borderRadius: '999px',
            backgroundColor: hasCritical ? '#DC2626' : urgentCount > 0 ? '#D97706' : '#10B981',
            color: '#FFFFFF',
            fontSize: '0.7rem',
            fontWeight: 800,
          }}
        >
          {loading ? '...' : urgentCount}
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 110,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              width: 'min(540px, 96vw)',
              height: '100%',
              backgroundColor: '#FFFFFF',
              boxShadow: '-8px 0 30px rgba(15, 23, 42, 0.18)',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>
                  <Activity size={18} color="#0D7A57" />
                  <span>Radar de Frecuencias y Silencios</span>
                </div>
                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                  Corte: <strong>{data?.weekdayName ? `${data.weekdayName.toUpperCase()} ` : ''}{data?.targetDate || targetDate}</strong> · ≥75% en 8 sem · 0 tokens
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  type="button"
                  onClick={fetchRadar}
                  disabled={loading}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#334155',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.76rem',
                    fontWeight: 700,
                  }}
                >
                  <RefreshCw size={13} /> Actualizar
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  style={{
                    padding: '6px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    backgroundColor: '#FFFFFF',
                    color: '#475569',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Summary KPIs */}
            {data && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '8px',
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid #E2E8F0',
                }}
              >
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#991B1B' }}>OTRA FECHA</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#DC2626' }}>{data.summary.otherDateAnomalyCount}</div>
                </div>
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400E' }}>BORRADOR</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#D97706' }}>{data.summary.stuckDraftCount}</div>
                </div>
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#FFF7ED', border: '1px solid #FED7AA' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9A3412' }}>VENCIDOS (+30m)</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#EA580C' }}>{data.summary.overdueSilentMissingCount}</div>
                  <div style={{ fontSize: '0.64rem', color: '#64748B', fontWeight: 600 }}>+{data.summary.inWindowCount} en ventana</div>
                </div>
                <div style={{ padding: '8px', borderRadius: '8px', backgroundColor: '#ECFDF5', border: '1px solid #A7F3D0' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#065F46' }}>CUBIERTOS</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#059669' }}>{data.summary.coveredCount}</div>
                </div>
              </div>
            )}

            {/* Tabs + Search */}
            <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {(
                  [
                    ['urgent', `Urgentes (${data?.summary.urgentAnomaliesCount ?? 0})`],
                    ['other_date_anomaly', `Otra Fecha (${data?.summary.otherDateAnomalyCount ?? 0})`],
                    ['stuck_draft', `Borradores (${data?.summary.stuckDraftCount ?? 0})`],
                    ['silent_missing', `Faltan (${data?.summary.silentMissingCount ?? 0})`],
                    ['covered', `Cubiertos (${data?.summary.coveredCount ?? 0})`],
                  ] as [FilterTab, string][]
                ).map(([tabKey, label]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setActiveTab(tabKey)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '999px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: activeTab === tabKey ? '1px solid #0D7A57' : '1px solid #CBD5E1',
                      backgroundColor: activeTab === tabKey ? '#0D7A57' : '#FFFFFF',
                      color: activeTab === tabKey ? '#FFFFFF' : '#334155',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} color="#64748B" style={{ position: 'absolute', left: '10px' }} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filtrar sede o correo..."
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: '8px',
                    border: '1px solid #CBD5E1',
                    fontSize: '0.8rem',
                    outline: 'none',
                  }}
                />
              </div>
            </div>

            {/* Body (Strictly Informational) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.85rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {error && (
                <div style={{ padding: '10px', borderRadius: '8px', backgroundColor: '#FEF2F2', color: '#B91C1C', fontSize: '0.8rem', fontWeight: 600 }}>
                  {error}
                </div>
              )}
              {!loading && filteredEntries.length === 0 && !error && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748B', fontSize: '0.85rem' }}>
                  Sin registros en esta categoría para {data?.targetDate || targetDate}.
                </div>
              )}
              {filteredEntries.map(entry => {
                const isOtherDate = entry.status === 'other_date_anomaly';
                const isStuck = entry.status === 'stuck_draft';
                const isCovered = entry.status === 'covered';
                const isSilentInWindow = entry.status === 'silent_missing' && !entry.isOverdue;

                const borderColor = isOtherDate
                  ? '#FCA5A5'
                  : isStuck
                  ? '#FCD34D'
                  : isCovered
                  ? '#A7F3D0'
                  : isSilentInWindow
                  ? '#CBD5E1'
                  : '#FED7AA';
                const bg = isOtherDate
                  ? '#FEF2F2'
                  : isStuck
                  ? '#FFFBEB'
                  : isCovered
                  ? '#F0FDF4'
                  : isSilentInWindow
                  ? '#F8FAFC'
                  : '#FFF7ED';

                return (
                  <div
                    key={entry.profileId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1px solid ${borderColor}`,
                      backgroundColor: bg,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                      <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#0F172A' }}>{entry.clientName}</div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 800, color: '#334155', whiteSpace: 'nowrap' }}>
                        {isOtherDate && <AlertTriangle size={13} color="#DC2626" />}
                        {isStuck && <MailWarning size={13} color="#D97706" />}
                        {entry.status === 'silent_missing' && (
                          <FileWarning size={13} color={entry.isOverdue ? '#EA580C' : '#64748B'} />
                        )}
                        {isCovered && <CheckCircle2 size={13} color="#059669" />}
                        {entry.expectedReason}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                      {entry.status === 'silent_missing' && (
                        <span
                          style={{
                            padding: '1px 7px',
                            borderRadius: '999px',
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            backgroundColor: entry.isOverdue ? '#FFEDD5' : '#E2E8F0',
                            color: entry.isOverdue ? '#9A3412' : '#475569',
                          }}
                        >
                          {entry.isOverdue ? 'Vencido (+30m)' : 'En ventana'}
                        </span>
                      )}
                      {entry.avgOrderTimeBogota && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> Hora habitual: <strong>{entry.avgOrderTimeBogota}</strong>
                        </span>
                      )}
                      {entry.email && <span>{entry.email}</span>}
                    </div>

                    {isOtherDate && entry.otherDateOrder && (
                      <div style={{ marginTop: '6px', fontSize: '0.76rem', fontWeight: 700, color: '#991B1B' }}>
                        Pedido #{entry.otherDateOrder.sequenceId} quedó para el <strong>{entry.otherDateOrder.deliveryDate}</strong> ({entry.otherDateOrder.status})
                      </div>
                    )}
                    {isStuck && entry.pendingDraft && (
                      <div style={{ marginTop: '6px', fontSize: '0.76rem', fontWeight: 700, color: '#92400E' }}>
                        Borrador sin aprobar: &quot;{entry.pendingDraft.subject}&quot; (fecha ext: {entry.pendingDraft.extractedDeliveryDate || 'N/D'})
                      </div>
                    )}
                    {isCovered && entry.targetOrder && (
                      <div style={{ marginTop: '6px', fontSize: '0.76rem', fontWeight: 700, color: '#065F46' }}>
                        Cubierto con Pedido #{entry.targetOrder.sequenceId} ({entry.targetOrder.status})
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
