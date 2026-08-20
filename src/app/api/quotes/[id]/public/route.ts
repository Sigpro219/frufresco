import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');

export async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> | { id: string } }
) {
    try {
        const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
        const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const rawParams = await context.params;
        const id = rawParams?.id;
        if (!id) {
            return NextResponse.json({ error: 'ID de cotización requerido' }, { status: 400 });
        }

        // 1. Fetch App Settings
        const { data: sData } = await supabase.from('app_settings').select('*');
        const settingsMap: Record<string, string> = {};
        if (sData) {
            sData.forEach((s: any) => { settingsMap[s.key] = s.value; });
        }

        // 2. Fetch Quote using Service Role Key
        const { data: quote, error: qErr } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', id)
            .single();

        if (qErr || !quote) {
            return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
        }

        let lead = null;
        if (quote.lead_id) {
            const { data: lData } = await supabase
                .from('leads')
                .select('*')
                .eq('id', quote.lead_id)
                .maybeSingle();
            if (lData) lead = lData;
        }

        let clientInfo = null;
        if (quote.client_id) {
            const { data: cData } = await supabase
                .from('profiles')
                .select('company_name, contact_name, nit, phone, address')
                .eq('id', quote.client_id)
                .maybeSingle();
            if (cData) clientInfo = cData;
        }

        // 3. Fetch Items with category
        const { data: items } = await supabase
            .from('quote_items')
            .select('*, products(name, unit_of_measure, sku, category)')
            .eq('quote_id', id);

        return NextResponse.json({
            quote,
            lead,
            clientInfo,
            items: items || [],
            appSettings: settingsMap
        });
    } catch (err: any) {
        console.error('Error in public quote API:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
