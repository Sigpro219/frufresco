import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET(request: Request) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { searchParams } = new URL(request.url);
        const clientId = searchParams.get('clientId');

        if (!clientId) {
            return NextResponse.json({ error: 'clientId parameter is required' }, { status: 400 });
        }

        // Fetch profiles if hierarchy check is needed
        const { data: clientProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, parent_id')
            .eq('id', clientId)
            .single();

        const clientIds = [clientId];
        if (clientProfile?.parent_id) {
            clientIds.push(clientProfile.parent_id);
        }

        const { data: orders, error } = await supabaseAdmin
            .from('orders')
            .select(`
                *,
                profile:profiles(company_name, nit, address),
                order_items(
                    id,
                    product_id,
                    quantity,
                    unit_price,
                    unit,
                    nickname,
                    products(id, name, name_en, unit_of_measure, sku)
                )
            `)
            .in('profile_id', clientIds)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            console.error('Error fetching B2B invoices:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ invoices: orders || [] });
    } catch (err: any) {
        console.error('B2B Invoices API exception:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
