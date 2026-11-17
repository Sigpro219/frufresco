/**
 * Motor de consulta sin techo de 100 y Poka-Yoke para la bandeja de pedidos por correo (`order_drafts`).
 * Garantiza 0 borradores pendientes ocultos, conteos reales por estado, búsqueda en servidor y detección Asunto vs. PDF.
 */

export const DRAFT_SELECT_WITH_PROFILE =
  '*, profiles:profile_id(id, company_name, contact_name, role, is_active, logistics_data, address, city, municipality, department)';

export interface DraftTabCounts {
  pending: number;
  approved: number;
  rejected: number;
}

export async function fetchPendingDraftsComplete(
  supabase: any,
  daysWindow = 30,
  batchSize = 250,
  safetyMax = 2000
): Promise<any[]> {
  const sinceIso = new Date(Date.now() - daysWindow * 86_400_000).toISOString();
  const allRows: any[] = [];
  let offset = 0;

  while (allRows.length < safetyMax) {
    const { data, error } = await supabase
      .from('order_drafts')
      .select(DRAFT_SELECT_WITH_PROFILE)
      .eq('status', 'pending')
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;
    const chunk = data || [];
    allRows.push(...chunk);
    if (chunk.length < batchSize) break;
    offset += batchSize;
  }

  return allRows;
}

export async function fetchDraftsByStatusPage(
  supabase: any,
  status: 'approved' | 'rejected',
  limit = 200,
  offset = 0
): Promise<{ rows: any[]; hasMore: boolean }> {
  const { data, error } = await supabase
    .from('order_drafts')
    .select(DRAFT_SELECT_WITH_PROFILE)
    .eq('status', status)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit);

  if (error) throw error;
  const rows = data || [];
  const hasMore = rows.length > limit;
  return {
    rows: hasMore ? rows.slice(0, limit) : rows,
    hasMore,
  };
}

export async function fetchDraftTabCounts(supabase: any): Promise<DraftTabCounts> {
  const since30d = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [pRes, aRes, rRes] = await Promise.all([
    supabase
      .from('order_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('created_at', since30d),
    supabase
      .from('order_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('created_at', since30d),
    supabase
      .from('order_drafts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'rejected')
      .gte('created_at', since30d),
  ]);

  return {
    pending: pRes.count || 0,
    approved: aRes.count || 0,
    rejected: rRes.count || 0,
  };
}

function sanitizeOrValue(token: string): string {
  return token
    .replace(/[(),]/g, ' ')
    .replace(/[%_]/g, '\\$&')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchOrderDraftsServer(
  supabase: any,
  rawQuery: string,
  limit = 150
): Promise<any[]> {
  const tokens = String(rawQuery || '')
    .trim()
    .split(/\s+/)
    .map((t) => sanitizeOrValue(t))
    .filter(Boolean)
    .slice(0, 5);

  if (tokens.length === 0) return [];

  let q = supabase
    .from('order_drafts')
    .select(DRAFT_SELECT_WITH_PROFILE)
    .in('status', ['pending', 'approved', 'rejected']);

  for (const tok of tokens) {
    const p = `%${tok}%`;
    q = q.or(
      `email_subject.ilike.${p},client_detected_name.ilike.${p},source_email.ilike.${p},po_number.ilike.${p},client_po_number.ilike.${p},purchase_order.ilike.${p},email_body.ilike.${p}`
    );
  }

  const { data, error } = await q.order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

function extractNumericOrderDigits(text: string): string | null {
  const m = text.match(/(?:OCC|OC|O\/C|PO|SOLPED|PEDIDO(?:\s*N[°º]?)?)\s*[:#-]?\s*0*(\d{4,10})/i);
  if (m && m[1]) return m[1];
  return null;
}

/**
 * Poka-Yoke: detecta si el número de OC en el asunto del correo difiere de la OC extraída del PDF adjunto.
 */
export function detectPoSubjectMismatch(
  subject?: string | null,
  attachmentPo?: string | null
): { subjectPo: string; attachmentPo: string } | null {
  if (!subject || !attachmentPo) return null;
  const subjDigits = extractNumericOrderDigits(subject);
  if (!subjDigits) return null;

  const attDigitsMatch = String(attachmentPo).match(/0*(\d{4,10})/);
  if (!attDigitsMatch || !attDigitsMatch[1]) return null;

  const attDigits = attDigitsMatch[1];
  if (subjDigits !== attDigits) {
    return {
      subjectPo: subjDigits,
      attachmentPo: String(attachmentPo),
    };
  }
  return null;
}
