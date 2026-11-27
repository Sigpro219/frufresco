/**
 * Deterministic ($0 / 0-token) B2B Order Frequency & Silent-Client Anomaly Engine (v2).
 * Uses strictly paginated 8-week (56d) historical orders, progressive denominator up to 8 weeks,
 * forward-only other_date_anomaly (delivery_date > targetDate), and Bogotá +30m overdue clock.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addBogotaDays, getBogotaDateString, parseBogotaDate } from '@/lib/dateUtils';
import { getBogotaWeekdayLong } from './bogotaDateParser';

export type FrequencyAnomalyStatus =
  | 'covered'
  | 'other_date_anomaly'
  | 'stuck_draft'
  | 'silent_missing';

export interface ProfileLogisticsData {
  allowed_days?: number[];
  days?: number[];
  [key: string]: unknown;
}

export interface FrequencyRadarProfileInput {
  id: string;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  is_active?: boolean | null;
  role?: string | null;
  logistics_data?: ProfileLogisticsData | null;
}

export interface OrderLogisticsData {
  is_off_agreement_split?: boolean;
  [key: string]: unknown;
}

export interface FrequencyRadarOrderInput {
  id: string;
  sequence_id?: number | null;
  profile_id?: string | null;
  status?: string | null;
  delivery_date?: string | null;
  created_at?: string | null;
  total?: number | null;
  total_weight_kg?: number | null;
  origin_source?: string | null;
  purchase_order_number?: string | null;
  warehouse_spaces?: string[] | null;
  logistics_data?: OrderLogisticsData | null;
}

export interface DraftExtractedItemLike {
  isMetadata?: boolean;
  deliveryDate?: string | null;
  orderId?: string | null;
  order_id?: string | null;
  attachments?: Array<{ orderId?: string | null; order_id?: string | null }>;
  [key: string]: unknown;
}

export interface FrequencyRadarDraftInput {
  id: string;
  profile_id?: string | null;
  client_detected_name?: string | null;
  source_email?: string | null;
  email_subject?: string | null;
  status?: string | null;
  created_at?: string | null;
  extracted_items?: DraftExtractedItemLike[] | null;
}

export interface FrequencyRadarEntry {
  profileId: string;
  clientName: string;
  email: string | null;
  status: FrequencyAnomalyStatus;
  isOverdue: boolean;
  expectedReason: string;
  historicalHits: number;
  historicalWeeks: number;
  historicalRatePct: number;
  configuredInProfile: boolean;
  avgOrderTimeMinutes: number | null;
  avgOrderTimeBogota: string | null;
  targetOrder?: {
    id: string;
    sequenceId: number | null;
    status: string | null;
    total: number;
  };
  otherDateOrder?: {
    id: string;
    sequenceId: number | null;
    deliveryDate: string;
    status: string | null;
    createdAt: string;
  };
  pendingDraft?: {
    id: string;
    subject: string;
    extractedDeliveryDate: string | null;
    createdAt: string;
  };
}

export interface FrequencyRadarResult {
  targetDate: string;
  weekdayName: string;
  targetIsoDay: number;
  summary: {
    habitualCount: number;
    coveredCount: number;
    otherDateAnomalyCount: number;
    stuckDraftCount: number;
    silentMissingCount: number;
    overdueSilentMissingCount: number;
    inWindowCount: number;
    totalAnomalies: number;
    urgentAnomaliesCount: number;
  };
  anomalies: FrequencyRadarEntry[];
  covered: FrequencyRadarEntry[];
}

const EXCLUDED_ORDER_STATUSES = new Set(['cancelled', 'billing_only']);

const WEEKDAY_PLURALS: Record<number, string> = {
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábados',
  7: 'domingos',
};

/**
 * PostgREST-safe paginated fetcher for orders in [startDate, ...],
 * ordered deterministically by `id ASC` to bypass max_rows=1000 truncation.
 */
export async function fetchOrdersWindowPaginated(
  supabaseAdmin: SupabaseClient,
  startDate: string,
  selectColumns = 'id, sequence_id, profile_id, status, delivery_date, created_at, total, origin_source'
): Promise<FrequencyRadarOrderInput[]> {
  const PAGE_SIZE = 1000;
  const allRows: FrequencyRadarOrderInput[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(selectColumns)
      .gte('delivery_date', startDate)
      .not('status', 'in', '(cancelled,billing_only)')
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    const rawList: unknown[] = Array.isArray(data) ? data : [];
    const rows: FrequencyRadarOrderInput[] = [];
    for (const item of rawList) {
      if (item && typeof item === 'object' && 'id' in item) {
        rows.push(item as FrequencyRadarOrderInput);
      }
    }
    allRows.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
    if (from >= 20000) break;
  }

  return allRows;
}

function getIsoDayFromDateStr(dateStr: string): number {
  const d = parseBogotaDate(dateStr);
  if (Number.isNaN(d.getTime())) return 1;
  const jsDay = d.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

function normalizeAllowedIsoDays(logisticsData: ProfileLogisticsData | null | undefined): number[] {
  if (!logisticsData) return [];
  if (Array.isArray(logisticsData.allowed_days) && logisticsData.allowed_days.length > 0) {
    return logisticsData.allowed_days
      .map(d => Number(d))
      .filter(d => d >= 1 && d <= 7);
  }
  if (Array.isArray(logisticsData.days) && logisticsData.days.length > 0) {
    return logisticsData.days
      .map(d => (Number(d) === 0 ? 7 : Number(d)))
      .filter(d => d >= 1 && d <= 7);
  }
  return [];
}

function getBogotaMinutesOfDay(isoTimestamp: string): number | null {
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  const parts = d
    .toLocaleTimeString('en-GB', { timeZone: 'America/Bogota', hour12: false, hour: '2-digit', minute: '2-digit' })
    .split(':');
  if (parts.length < 2) return null;
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatMinutesAs12h(mins: number): string {
  const h24 = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function getDraftExtractedDeliveryDate(draft: FrequencyRadarDraftInput): string | null {
  const items = Array.isArray(draft.extracted_items) ? draft.extracted_items : [];
  const meta = items.find(i => Boolean(i && i.isMetadata));
  const raw = meta?.deliveryDate || null;
  return typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : null;
}

export function computeFrequencyRadar(params: {
  targetDate: string;
  profiles: FrequencyRadarProfileInput[];
  recentOrders: FrequencyRadarOrderInput[];
  recentDrafts: FrequencyRadarDraftInput[];
  now?: Date;
}): FrequencyRadarResult {
  const { targetDate, profiles, recentOrders, recentDrafts, now = new Date() } = params;
  const targetIsoDay = getIsoDayFromDateStr(targetDate);
  const weekdayName = getBogotaWeekdayLong(targetDate);
  const weekdayPlural = WEEKDAY_PLURALS[targetIsoDay] || weekdayName;

  const todayBogota = getBogotaDateString(now);
  const tomorrowBogota = addBogotaDays(todayBogota, 1);
  const nowBogotaMinutes = getBogotaMinutesOfDay(now.toISOString()) ?? 0;

  const expectedPriorDates = new Set<string>();
  for (let w = 1; w <= 8; w++) {
    expectedPriorDates.add(addBogotaDays(targetDate, -7 * w));
  }
  const activePriorDates = new Set<string>();
  for (const o of recentOrders || []) {
    if (!o.delivery_date || EXCLUDED_ORDER_STATUSES.has(String(o.status || '').toLowerCase())) continue;
    const dStr = String(o.delivery_date).slice(0, 10);
    if (expectedPriorDates.has(dStr)) activePriorDates.add(dStr);
  }
  const totalWindowWeeks = Math.max(2, activePriorDates.size);

  const cutoff36hMs = now.getTime() - 36 * 3600 * 1000;

  const validOrders = (recentOrders || []).filter(
    o => o.profile_id && o.delivery_date && !EXCLUDED_ORDER_STATUSES.has(String(o.status || '').toLowerCase())
  );

  const ordersByProfile = new Map<string, FrequencyRadarOrderInput[]>();
  for (const o of validOrders) {
    const pid = String(o.profile_id);
    if (!ordersByProfile.has(pid)) ordersByProfile.set(pid, []);
    ordersByProfile.get(pid)!.push(o);
  }

  const draftsByProfile = new Map<string, FrequencyRadarDraftInput[]>();
  for (const d of recentDrafts || []) {
    if (!d.profile_id) continue;
    const pid = String(d.profile_id);
    if (!draftsByProfile.has(pid)) draftsByProfile.set(pid, []);
    draftsByProfile.get(pid)!.push(d);
  }

  const anomalies: FrequencyRadarEntry[] = [];
  const covered: FrequencyRadarEntry[] = [];

  for (const p of profiles || []) {
    if (p.is_active === false) continue;
    const role = String(p.role || '').toLowerCase();
    if (role && role !== 'b2b_client') continue;

    const pid = p.id;
    const pOrders = ordersByProfile.get(pid) || [];
    const pDrafts = draftsByProfile.get(pid) || [];
    const allowedIsoDays = normalizeAllowedIsoDays(p.logistics_data);
    const configuredInProfile = allowedIsoDays.includes(targetIsoDay);

    const matchedPriorDates = new Set<string>();
    const weekdaySubmitMinutes: number[] = [];

    for (const o of pOrders) {
      const dStr = String(o.delivery_date).slice(0, 10);
      if (expectedPriorDates.has(dStr)) {
        matchedPriorDates.add(dStr);
        if (o.created_at) {
          const mins = getBogotaMinutesOfDay(o.created_at);
          if (mins !== null) weekdaySubmitMinutes.push(mins);
        }
      }
    }

    const historicalHits = matchedPriorDates.size;
    const historicalRatePct = Math.round((historicalHits / totalWindowWeeks) * 100);
    const minRequiredHits = totalWindowWeeks >= 6 ? Math.ceil(totalWindowWeeks * 0.75) : Math.max(2, totalWindowWeeks - 1);

    if (historicalHits < minRequiredHits) continue;

    const avgOrderTimeMinutes =
      weekdaySubmitMinutes.length > 0
        ? Math.round(weekdaySubmitMinutes.reduce((a, b) => a + b, 0) / weekdaySubmitMinutes.length)
        : null;
    const avgOrderTimeBogota =
      avgOrderTimeMinutes !== null ? formatMinutesAs12h(avgOrderTimeMinutes) : null;

    const clientName = p.company_name || p.contact_name || 'Cliente B2B';
    const expectedReason = `${historicalHits}/${totalWindowWeeks} ${weekdayPlural} (${historicalRatePct}%)`;

    const targetOrder = pOrders.find(o => String(o.delivery_date).slice(0, 10) === targetDate);
    if (targetOrder) {
      covered.push({
        profileId: pid,
        clientName,
        email: p.email || null,
        status: 'covered',
        isOverdue: false,
        expectedReason,
        historicalHits,
        historicalWeeks: totalWindowWeeks,
        historicalRatePct,
        configuredInProfile,
        avgOrderTimeMinutes,
        avgOrderTimeBogota,
        targetOrder: {
          id: targetOrder.id,
          sequenceId: targetOrder.sequence_id ?? null,
          status: targetOrder.status ?? null,
          total: Number(targetOrder.total) || 0,
        },
      });
      continue;
    }

    const otherDateOrder = pOrders
      .filter(o => {
        const dStr = String(o.delivery_date).slice(0, 10);
        const crMs = o.created_at ? new Date(o.created_at).getTime() : 0;
        return dStr > targetDate && crMs >= cutoff36hMs;
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

    if (otherDateOrder) {
      anomalies.push({
        profileId: pid,
        clientName,
        email: p.email || null,
        status: 'other_date_anomaly',
        isOverdue: true,
        expectedReason,
        historicalHits,
        historicalWeeks: totalWindowWeeks,
        historicalRatePct,
        configuredInProfile,
        avgOrderTimeMinutes,
        avgOrderTimeBogota,
        otherDateOrder: {
          id: otherDateOrder.id,
          sequenceId: otherDateOrder.sequence_id ?? null,
          deliveryDate: String(otherDateOrder.delivery_date).slice(0, 10),
          status: otherDateOrder.status ?? null,
          createdAt: String(otherDateOrder.created_at || ''),
        },
      });
      continue;
    }

    const pendingDraft = pDrafts
      .filter(d => String(d.status || '').toLowerCase() === 'pending')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

    if (pendingDraft) {
      anomalies.push({
        profileId: pid,
        clientName,
        email: p.email || null,
        status: 'stuck_draft',
        isOverdue: true,
        expectedReason,
        historicalHits,
        historicalWeeks: totalWindowWeeks,
        historicalRatePct,
        configuredInProfile,
        avgOrderTimeMinutes,
        avgOrderTimeBogota,
        pendingDraft: {
          id: pendingDraft.id,
          subject: pendingDraft.email_subject || 'Sin asunto',
          extractedDeliveryDate: getDraftExtractedDeliveryDate(pendingDraft),
          createdAt: String(pendingDraft.created_at || ''),
        },
      });
      continue;
    }

    let isOverdue = false;
    if (targetDate <= todayBogota) {
      isOverdue = true;
    } else if (targetDate > tomorrowBogota) {
      isOverdue = false;
    } else {
      isOverdue =
        avgOrderTimeMinutes !== null &&
        nowBogotaMinutes >= Math.min(1439, avgOrderTimeMinutes + 30);
    }

    anomalies.push({
      profileId: pid,
      clientName,
      email: p.email || null,
      status: 'silent_missing',
      isOverdue,
      expectedReason,
      historicalHits,
      historicalWeeks: totalWindowWeeks,
      historicalRatePct,
      configuredInProfile,
      avgOrderTimeMinutes,
      avgOrderTimeBogota,
    });
  }

  const priorityRank = (e: FrequencyRadarEntry): number => {
    if (e.status === 'other_date_anomaly') return 1;
    if (e.status === 'stuck_draft') return 2;
    if (e.status === 'silent_missing' && e.isOverdue) return 3;
    if (e.status === 'silent_missing') return 4;
    return 5;
  };
  anomalies.sort((a, b) => {
    const diff = priorityRank(a) - priorityRank(b);
    if (diff !== 0) return diff;
    return b.historicalHits - a.historicalHits;
  });

  const otherDateAnomalyCount = anomalies.filter(a => a.status === 'other_date_anomaly').length;
  const stuckDraftCount = anomalies.filter(a => a.status === 'stuck_draft').length;
  const silentMissingCount = anomalies.filter(a => a.status === 'silent_missing').length;
  const overdueSilentMissingCount = anomalies.filter(
    a => a.status === 'silent_missing' && a.isOverdue
  ).length;
  const inWindowCount = anomalies.filter(
    a => a.status === 'silent_missing' && !a.isOverdue
  ).length;
  const urgentAnomaliesCount = otherDateAnomalyCount + stuckDraftCount + overdueSilentMissingCount;

  return {
    targetDate,
    weekdayName,
    targetIsoDay,
    summary: {
      habitualCount: anomalies.length + covered.length,
      coveredCount: covered.length,
      otherDateAnomalyCount,
      stuckDraftCount,
      silentMissingCount,
      overdueSilentMissingCount,
      inWindowCount,
      totalAnomalies: anomalies.length,
      urgentAnomaliesCount,
    },
    anomalies,
    covered,
  };
}
