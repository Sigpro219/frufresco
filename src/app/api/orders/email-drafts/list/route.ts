import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    try {
        const supabaseAdmin = createAdminClient();

        const { data, error } = await supabaseAdmin
            .from('order_drafts')
            .select('id, profile_id, client_detected_name, source_email, email_subject, extracted_items, status, created_at')
            .in('status', ['pending', 'approved', 'rejected'])
            .order('created_at', { ascending: false })
            .limit(80);

        if (error) {
            console.error('[API Drafts List] Error querying order_drafts:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ drafts: data || [] });
    } catch (err: any) {
        console.error('[API Drafts List] Server exception:', err);
        return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
    }
}
