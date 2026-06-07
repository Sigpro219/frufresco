import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const adminSupabase = createAdminClient();
        
        // Fetch all inventory stocks that are available and active (quantity > 0)
        const { data: stocks, error } = await adminSupabase
            .from('inventory_stocks')
            .select('product_id, quantity')
            .eq('status', 'available')
            .gt('quantity', 0)
            .limit(50000);

        if (error) {
            console.error('Error fetching inventory stocks via admin:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Aggregate stocks by product_id
        const stockMap: Record<string, number> = {};
        if (stocks) {
            stocks.forEach(s => {
                if (s.product_id) {
                    stockMap[s.product_id] = (stockMap[s.product_id] || 0) + (Number(s.quantity) || 0);
                }
            });
        }

        return NextResponse.json(stockMap);
    } catch (err: any) {
        console.error('Exception in inventory stocks route:', err.message);
        return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
    }
}
