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

        // Fetch active agreement for clientId
        const { data: quotes, error } = await supabase
            .from('quotes')
            .select(`
                *,
                pricing_models!model_id(name),
                quote_items(
                    *,
                    products(id, name, name_en, unit_of_measure, image_url, base_price, sku, category, is_active)
                )
            `)
            .eq('client_id', clientId)
            .eq('status', 'agreement')
            .order('created_at', { ascending: false });

        if (error) {
            // Fallback retry without pricing_models join if FK relation is missing
            const { data: fallbackQuotes } = await supabase
                .from('quotes')
                .select(`
                    *,
                    quote_items(
                        *,
                        products(id, name, name_en, unit_of_measure, image_url, base_price, sku, category, is_active)
                    )
                `)
                .eq('client_id', clientId)
                .eq('status', 'agreement')
                .order('created_at', { ascending: false });

            const activeQuotes = fallbackQuotes || [];
            const pricesMap: Record<string, number> = {};

            if (activeQuotes.length > 0 && activeQuotes[0].quote_items) {
                activeQuotes[0].quote_items.forEach((qi: any) => {
                    if (qi.product_id && qi.unit_price) {
                        pricesMap[qi.product_id] = Number(qi.unit_price);
                    }
                });
            }

            return NextResponse.json({ agreements: activeQuotes, pricesMap });
        }

        const activeQuotes = quotes || [];
        const pricesMap: Record<string, number> = {};

        if (activeQuotes.length > 0 && activeQuotes[0].quote_items) {
            activeQuotes[0].quote_items.forEach((qi: any) => {
                if (qi.product_id && qi.unit_price) {
                    pricesMap[qi.product_id] = Number(qi.unit_price);
                }
            });
        }

        return NextResponse.json({ agreements: activeQuotes, pricesMap });
    } catch (err: any) {
        console.error('Unexpected error in B2B agreements API:', err);
        return NextResponse.json({ agreements: [], pricesMap: {} }, { status: 500 });
    }
}
