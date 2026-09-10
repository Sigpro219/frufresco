import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, module, collaborator_name, collaborator_id, details } = body;

        if (!action || !module) {
            return NextResponse.json({ error: 'Action and module are required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin.from('audit_logs').insert([{
            action,
            module,
            collaborator_name: collaborator_name || 'Administrador FruFresco',
            collaborator_id: collaborator_id || null,
            details: details || {}
        }]).select();

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
