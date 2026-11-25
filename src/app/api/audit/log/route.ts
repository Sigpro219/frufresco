import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyStaffBearer, insertAuditLogSafe } from '@/lib/auth/verifyStaffBearer';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Credenciales de Supabase no configuradas en el entorno');
    }
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const auth = await verifyStaffBearer(req, supabaseAdmin);
        if ('error' in auth) {
            return NextResponse.json({ error: auth.error }, { status: auth.status });
        }

        const body = await req.json();
        const { action, module, collaborator_id, details } = body;

        if (!action || !module) {
            return NextResponse.json({ error: 'Action and module are required' }, { status: 400 });
        }

        const { data, error } = await insertAuditLogSafe(supabaseAdmin, {
            action,
            module,
            collaboratorName: auth.actorName,
            collaboratorId: collaborator_id || auth.userId,
            details: details || {},
        });

        if (error) {
            console.error('[Audit API] Error inserting audit log:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, log: data?.[0] });
    } catch (err: any) {
        console.error('[Audit API] Exception:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
