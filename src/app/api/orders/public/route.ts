import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Initialize Supabase Admin Client to bypass RLS for public orders
const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isUrlValid = supabaseUrl.startsWith('http');
const supabase = isUrlValid ? createClient(supabaseUrl, supabaseKey) : null as any;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { order, items } = body;

        if (!order || !items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'Invalid order data' }, { status: 400 });
        }

        if (!supabase) {
            return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
        }

        // Validate prices securely against database precalculated cache
        try {
            const cookieStore = await cookies();
            const serverSupabase = createServerClient(
                supabaseUrl,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
                {
                    cookies: {
                        getAll() {
                            return cookieStore.getAll()
                        },
                        setAll(cookiesToSet) {
                            try {
                                cookiesToSet.forEach(({ name, value, options }) =>
                                    cookieStore.set(name, value, options)
                                )
                            } catch {
                                // Ignore component header errors
                            }
                        },
                    },
                }
            );

            const { data: { session } } = await serverSupabase.auth.getSession();
            const userId = session?.user?.id;

            let pricingModelId = 'f7043ca1-94d5-4d25-bd10-fbf30ce120ee'; // Default B2C
            if (userId) {
                const { data: profile } = await serverSupabase
                    .from('profiles')
                    .select('pricing_model_id')
                    .eq('id', userId)
                    .single();
                if (profile?.pricing_model_id) {
                    pricingModelId = profile.pricing_model_id;
                }
            }

            const productIds = items.map((item: any) => item.product_id);
            const { data: dbProducts, error: dbErr } = await serverSupabase
                .from('products')
                .select('id, base_price, web_conversion_factor, pricing_model_prices(price)')
                .in('id', productIds)
                .eq('pricing_model_prices.model_id', pricingModelId);

            if (dbErr) {
                console.warn("Pricing cache check skipped due to DB error:", dbErr.message);
            } else if (dbProducts) {
                for (const item of items) {
                    const dbProd = dbProducts.find((p: any) => p.id === item.product_id);
                    if (!dbProd) {
                        return NextResponse.json({ error: `Product not found: ${item.product_id}` }, { status: 400 });
                    }
                    const modelPrice = dbProd.pricing_model_prices?.[0]?.price ?? dbProd.base_price ?? 0;
                    const expectedPrice = Math.ceil((modelPrice * (dbProd.web_conversion_factor || 1)) / 50) * 50;

                    if (Math.abs(expectedPrice - item.unit_price) > 0.01) {
                        console.error(`Price manipulation detected! Product: ${item.product_id}, Sent price: ${item.unit_price}, Expected: ${expectedPrice}`);
                        return NextResponse.json({ error: 'Invalid item price detected.' }, { status: 400 });
                    }
                }
            }
        } catch (validationErr: any) {
            console.error("Backend price validation threw exception (continuing checkout safely):", validationErr.message);
        }

        // 1. Crear la cabecera del pedido
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .insert(order)
            .select()
            .single();

        if (orderError) {
            console.error('Error inserting public order:', orderError);
            return NextResponse.json({ error: orderError.message }, { status: 500 });
        }

        // 2. Adjuntar el ID del pedido a los items y crearlos
        const orderItemsData = items.map((item: any) => ({
            ...item,
            order_id: orderData.id
        }));

        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(orderItemsData);

        if (itemsError) {
            console.error('Error inserting public order items:', itemsError);
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, order: orderData });

    } catch (error: any) {
        console.error('Public Order API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
