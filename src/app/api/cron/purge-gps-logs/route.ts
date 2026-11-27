import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { isSandboxMode } from '@/lib/sandboxGuard';

export const dynamic = 'force-dynamic';

function isAuthorizedCron(req: NextRequest): boolean {
    const { searchParams } = new URL(req.url);
    const queryToken = searchParams.get('token');
    const authHeader = req.headers.get('authorization');
    const headerToken = authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7).trim()
        : null;
    const token = queryToken || headerToken;

    const cronSecret = process.env.CRON_SECRET;
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');

    if (cronSecret && token === cronSecret) return true;
    if (token && serviceKey && token === serviceKey) return true;
    if (!cronSecret && req.headers.get('x-vercel-cron')) return true;

    return false;
}

export async function GET(req: NextRequest) {
    if (isSandboxMode()) {
        return NextResponse.json(
            { success: true, skipped: true, sandbox: true, reason: 'GPS log purge disabled in Sandbox mode' },
            { status: 200 }
        );
    }

    if (!isAuthorizedCron(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const adminSupabase = createAdminClient();
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        // 1. Intentar llamar a la función RPC si existe
        const { data: rpcCount, error: rpcErr } = await adminSupabase.rpc('purge_stale_gps_logs');

        if (!rpcErr && typeof rpcCount === 'number') {
            return NextResponse.json({
                success: true,
                method: 'rpc',
                deleted_rows: rpcCount,
                purged_before: fortyEightHoursAgo,
                timestamp: new Date().toISOString()
            });
        }

        // 2. Fallback directo con DELETE query usando service_role (atraviesa RLS)
        const { count, error: delErr } = await adminSupabase
            .from('vehicle_gps_logs')
            .delete({ count: 'exact' })
            .lt('created_at', fortyEightHoursAgo);

        if (delErr) {
            throw delErr;
        }

        return NextResponse.json({
            success: true,
            method: 'direct_delete',
            deleted_rows: count ?? 0,
            purged_before: fortyEightHoursAgo,
            timestamp: new Date().toISOString()
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error purging old GPS logs';
        console.error('[Cron Purge GPS] Error in purge routine:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    return GET(req);
}
