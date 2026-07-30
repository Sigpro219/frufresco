import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0; // Dynamic route

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clientId = searchParams.get('clientId');

        if (!clientId) {
            return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, serviceKey);

        // Fetch client profile to check parent_id or corporate parent status
        const { data: clientProfile } = await supabase
            .from('profiles')
            .select('id, parent_id, is_corporate_parent')
            .eq('id', clientId)
            .single();

        let targetProfileIds = [clientId];
        if (clientProfile?.parent_id) {
            targetProfileIds.push(clientProfile.parent_id);
        }
        if (clientProfile?.is_corporate_parent) {
            const { data: children } = await supabase
                .from('profiles')
                .select('id')
                .eq('parent_id', clientId);
            if (children && children.length > 0) {
                targetProfileIds.push(...children.map(c => c.id));
            }
        }

        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                id,
                sequence_id,
                created_at,
                delivery_date,
                subtotal,
                total,
                status,
                order_items(
                    id,
                    product_id,
                    quantity,
                    unit_price,
                    nickname,
                    products(id, name, name_en, unit_of_measure, image_url)
                )
            `)
            .in('profile_id', targetProfileIds)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) {
            console.error('Error fetching B2B orders from API:', error);
            return NextResponse.json({ orders: [] }, { status: 500 });
        }

        return NextResponse.json({ orders: orders || [] });
    } catch (err: any) {
        console.error('Unexpected error in B2B orders API:', err);
        return NextResponse.json({ orders: [] }, { status: 500 });
    }
}
