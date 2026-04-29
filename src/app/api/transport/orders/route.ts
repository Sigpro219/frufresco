import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        let query = supabase.from('orders').select('*').eq('status', 'approved');

        if (date) {
            query = query.eq('delivery_date', date);
        }

        const { data, error } = await query;

        if (error) throw error;

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error fetching admin orders:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
