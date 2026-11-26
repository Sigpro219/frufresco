/**
 * Deterministic ($0 / 0-token) B2B Order Frequency & Silent-Client Anomaly Engine.
 * Crosses historical orders (56d), profile logistics_data.days/allowed_days, and recent order_drafts (48h).
 */

import { getBogotaWeekdayLong } from './bogotaDateParser';

export type FrequencyAnomalyStatus =
  | 'covered'
  | 'other_date_anomaly'
  | 'stuck_draft'
  | 'silent_missing';

export interface FrequencyRadarProfileInput {
  id: string;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  is_active?: boolean | null;
  role?: string | null;
  logistics_data?: Record<string, any> | null;
}

export interface FrequencyRadarOrderInput {
  id: string;
  sequence_id?: number | null;
  profile_id?: string | null;
  status?: string | null;
  delivery_date?: string | null;
  created_at?: string | null;
  total?: number | null;
  origin_source?: string | null;
}

export interface FrequencyRadarDraftInput {
  id: string;
  profile_id?: string | null;
  client_detected_name?: string | null;
  source_email?: string | null;
  email_subject?: string | null;
  status?: string | null;
  created_at?: string | null;
  extracted_items?: any[] | null;
}

export interface FrequencyRadarEntry {
  profileId: string;
  clientName: string;
  email: string | null;
  status: FrequencyAnomalyStatus;
  expectedReason: string;
  historicalHits: number;
  historicalWeeks: number;
  historicalRatePct: number;
  configuredInProfile: boolean;
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
    totalAnomalies: number;
  };
  anomalies: FrequencyRadarEntry[];
  covered: FrequencyRadarEntry[];
}

const EXCLUDED_ORDER_STATUSES = new Set(['cancelled', 'billing_only']);

function getIsoDayFromDateStr(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return 1;
  const jsDay = d.getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

function normalizeAllowedIsoDays(logisticsData: Record<string, any> | null | undefined): number[] {
  if (!logisticsData) return [];
  if (Array.isArray(logisticsData.allowed_days) && logisticsData.allowed_days.length > 0) {
    return logisticsData.allowed_days
      .map((d: any) => Number(d))
      .filter((d: number) => d >= 1 && d <= 7);
  }
  if (Array.isArray(logisticsData.days) && logisticsData.days.length > 0) {
    return logisticsData.days
      .map((d: any) => (Number(d) === 0 ? 7 : Number(d)))
      .filter((d: number) => d >= 1 && d <= 7);
  }
  return [];
}

function getIsoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
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
  const meta = items.find((i: any) => i && i.isMetadata);
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

  // Build 8 distinct weeks window strictly BEFORE targetDate
  const targetMs = new Date(`${targetDate}T12:00:00Z`).getTime();
  const cutoff36hMs = now.getTime() - 36 * 3600 * 1000;
  const cutoff30dMs = targetMs - 30 * 86400 * 1000;

  const validOrders = (recentOrders || []).filter(
    o => o.profile_id && o.delivery_date && !EXCLUDED_ORDER_STATUSES.has(String(o.status || '').toLowerCase())
  );

  // Index orders by profile
  const ordersByProfile = new Map<string, FrequencyRadarOrderInput[]>();
  for (const o of validOrders) {
    const pid = String(o.profile_id);
    if (!ordersByProfile.has(pid)) ordersByProfile.set(pid, []);
    ordersByProfile.get(pid)!.push(o);
  }

  // Index recent drafts (last 48h) by profile
  const draftsByProfile = new Map<string, FrequencyRadarDraftInput[]>();
  for (const d of recentDrafts || []) {
    if (!d.profile_id) continue;
    const pid = String(d.profile_id);
    if (!draftsByProfile.has(pid)) draftsByProfile.set(pid, []);
    draftsByProfile.get(pid)!.push(d);
  }

  // Determine how many distinct historical weeks exist in the dataset before targetDate
  const allHistWeeks = new Set<string>();
  for (const o of validOrders) {
    const dStr = String(o.delivery_date).slice(0, 10);
    if (dStr < targetDate) {
      allHistWeeks.add(getIsoWeekKey(dStr));
    }
  }
  const totalWindowWeeks = Math.max(1, Math.min(8, allHistWeeks.size || 6));

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

    // Historical orders before targetDate
    const histWeekdayWeeks = new Set<string>();
    const weekdaySubmitMinutes: number[] = [];
    let ordersLast30d = 0;

    for (const o of pOrders) {
      const dStr = String(o.delivery_date).slice(0, 10);
      const oMs = new Date(`${dStr}T12:00:00Z`).getTime();
      if (oMs >= cutoff30dMs && dStr < targetDate) {
        ordersLast30d++;
      }
      if (dStr < targetDate && getIsoDayFromDateStr(dStr) === targetIsoDay) {
        histWeekdayWeeks.add(getIsoWeekKey(dStr));
        if (o.created_at) {
          const mins = getBogotaMinutesOfDay(o.created_at);
          if (mins !== null) weekdaySubmitMinutes.push(mins);
        }
      }
    }

    const historicalHits = histWeekdayWeeks.size;
    const historicalRatePct = Math.round((historicalHits / totalWindowWeeks) * 100);

    // Habitual criterion: >= 50% of weeks (min 2 hits) OR configured in profile with >= 2 orders in last 30d
    const isHabitual =
      (historicalHits >= 2 && historicalRatePct >= 50) ||
      (configuredInProfile && ordersLast30d >= 2);

    if (!isHabitual) continue;

    const avgOrderTimeBogota =
      weekdaySubmitMinutes.length > 0
        ? formatMinutesAs12h(
            Math.round(weekdaySubmitMinutes.reduce((a, b) => a + b, 0) / weekdaySubmitMinutes.length)
          )
        : null;

    const clientName = p.company_name || p.contact_name || 'Cliente B2B';
    const expectedReason = configuredInProfile && historicalHits >= 2
      ? `${historicalHits}/${totalWindowWeeks} ${weekdayName}s + Ficha`
      : configuredInProfile
      ? `Ficha logística (${weekdayName})`
      : `${historicalHits}/${totalWindowWeeks} ${weekdayName}s (${historicalRatePct}%)`;

    // 1. Check if covered on targetDate
    const targetOrder = pOrders.find(o => String(o.delivery_date).slice(0, 10) === targetDate);
    if (targetOrder) {
      covered.push({
        profileId: pid,
        clientName,
        email: p.email || null,
        status: 'covered',
        expectedReason,
        historicalHits,
        historicalWeeks: totalWindowWeeks,
        historicalRatePct,
        configuredInProfile,
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

    // 2. Check if an order was created in the last 36h for a DIFFERENT delivery_date (e.g. #2312)
    const otherDateOrder = pOrders
      .filter(o => {
        const dStr = String(o.delivery_date).slice(0, 10);
        const crMs = o.created_at ? new Date(o.created_at).getTime() : 0;
        return dStr !== targetDate && crMs >= cutoff36hMs;
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

    if (otherDateOrder) {
      anomalies.push({
        profileId: pid,
        clientName,
        email: p.email || null,
        status: 'other_date_anomaly',
        expectedReason,
        historicalHits,
        historicalWeeks: totalWindowWeeks,
        historicalRatePct,
        configuredInProfile,
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

    // 3. Check if there is an unapproved pending draft in order_drafts
    const pendingDraft = pDrafts
      .filter(d => String(d.status || '').toLowerCase() === 'pending')
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];

    if (pendingDraft) {
      anomalies.push({
        profileId: pid,
        clientName,
        email: p.email || null,
        status: 'stuck_draft',
        expectedReason,
        historicalHits,
        historicalWeeks: totalWindowWeeks,
        historicalRatePct,
        configuredInProfile,
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

    // 4. Silent missing
    anomalies.push({
      profileId: pid,
      clientName,
      email: p.email || null,
      status: 'silent_missing',
      expectedReason,
      historicalHits,
      historicalWeeks: totalWindowWeeks,
      historicalRatePct,
      configuredInProfile,
      avgOrderTimeBogota,
    });
  }

  const priorityRank: Record<FrequencyAnomalyStatus, number> = {
    other_date_anomaly: 1,
    stuck_draft: 2,
    silent_missing: 3,
    covered: 4,
  };
  anomalies.sort((a, b) => {
    const diff = priorityRank[a.status] - priorityRank[b.status];
    if (diff !== 0) return diff;
    return b.historicalHits - a.historicalHits;
  });

  const otherDateAnomalyCount = anomalies.filter(a => a.status === 'other_date_anomaly').length;
  const stuckDraftCount = anomalies.filter(a => a.status === 'stuck_draft').length;
  const silentMissingCount = anomalies.filter(a => a.status === 'silent_missing').length;

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
      totalAnomalies: anomalies.length,
    },
    anomalies,
    covered,
  };
}
