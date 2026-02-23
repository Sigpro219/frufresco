import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Admin Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    try {
        const { data, error } = await supabase
            .from('orders')
            .select('status, total, delivery_date')
            .eq('wompi_transaction_id', id)
            .single();

        if (error) {
            console.error('Error fetching order status:', error);
            // If checking real wompi sandbox, we might fallback here, but for now strict DB check
            return NextResponse.json({ status: 'NOT_FOUND' }, { status: 404 });
        }

        // Map internal status back to Wompi-like status for the frontend
        let wompiStatus = 'PENDING';
        if (data.status === 'approved') wompiStatus = 'APPROVED';
        else if (data.status === 'cancelled' || data.status === 'declined') wompiStatus = 'DECLINED';
        else if (data.status === 'error') wompiStatus = 'ERROR';

        return NextResponse.json({
            data: {
                status: wompiStatus,
                amount_in_cents: data.total * 100, // Approximate
                currency: 'COP',
                reference: id
            }
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
