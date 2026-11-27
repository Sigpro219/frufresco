import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStaffBearer } from '@/lib/auth/verifyStaffBearer';
import { computeFrequencyRadar, fetchOrdersWindowPaginated } from '@/lib/orders/frequencyEngine';
import { addBogotaDays, getBogotaDateString } from '@/lib/dateUtils';

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase admin environment variables are missing');
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

export async function GET(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const auth = await verifyStaffBearer(req, supabaseAdmin);
    if (auth.ok === false) {
      return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const rawDate = searchParams.get('date');
    const now = new Date();
    const targetDate =
      rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : getBogotaDateString(now);

    const histStart = addBogotaDays(targetDate, -56);
    const cutoff48hIso = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();

    const [profilesRes, recentOrders, draftsRes] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, company_name, contact_name, email, role, is_active, logistics_data')
        .eq('role', 'b2b_client')
        .eq('is_active', true),
      fetchOrdersWindowPaginated(supabaseAdmin, histStart),
      supabaseAdmin
        .from('order_drafts')
        .select('id, profile_id, client_detected_name, source_email, email_subject, status, created_at, extracted_items')
        .gte('created_at', cutoff48hIso)
        .limit(250),
    ]);

    if (profilesRes.error) throw profilesRes.error;
    if (draftsRes.error) throw draftsRes.error;

    const result = computeFrequencyRadar({
      targetDate,
      profiles: profilesRes.data || [],
      recentOrders,
      recentDrafts: draftsRes.data || [],
      now,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error calculando radar de frecuencias';
    console.error('[GET /api/orders/frequency-radar] error:', err);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
