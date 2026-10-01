import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
    try {
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

        // 1. Intentar llamar a la función RPC si existe
        const { data: rpcCount, error: rpcErr } = await supabase.rpc('purge_stale_gps_logs');

        if (!rpcErr && typeof rpcCount === 'number') {
            return NextResponse.json({
                success: true,
                method: 'rpc',
                deleted_rows: rpcCount,
                purged_before: fortyEightHoursAgo,
                timestamp: new Date().toISOString()
            });
        }

        // 2. Fallback directo con DELETE query
        const { error: delErr } = await supabase
            .from('vehicle_gps_logs')
            .delete()
            .lt('created_at', fortyEightHoursAgo);

        if (delErr) {
            console.warn('[Cron Purge GPS] Warning during purge:', delErr.message);
        }

        return NextResponse.json({
            success: true,
            method: 'direct_delete',
            purged_before: fortyEightHoursAgo,
            timestamp: new Date().toISOString()
        });
    } catch (err: any) {
        console.error('[Cron Purge GPS] Error in purge routine:', err);
        return NextResponse.json({ error: err.message || 'Error purging old GPS logs' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    return GET(req);
}
