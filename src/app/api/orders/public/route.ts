import { NextResponse } from 'next/server';
import { resolvePricingModelId, CLIENTES_HOGAR_ID, GENERAL_INSTITUCIONAL_ID } from '@/lib/pricingUtils';
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

            let pricingModelId = (order.type === 'b2c_client') 
                ? CLIENTES_HOGAR_ID 
                : GENERAL_INSTITUCIONAL_ID;

            if (userId) {
                const { data: profile } = await serverSupabase
                    .from('profiles')
                    .select('id, role, profile_type, company_name, pricing_model_id, parent_id, parent:parent_id(pricing_model_id)')
                    .eq('id', userId)
                    .single();
                if (profile) {
                    pricingModelId = resolvePricingModelId(profile);
                }
            }

            const productIds = items.map((item: any) => item.product_id);
            const { data: dbProducts, error: dbErr } = await supabase
                .from('products')
                .select('id, base_price, web_conversion_factor, unit_of_measure, pricing_model_prices(price, model_id)')
                .in('id', productIds);

            if (dbErr) {
                console.warn("Pricing cache check skipped due to DB error:", dbErr.message);
            } else if (dbProducts) {
                for (const item of items) {
                    const dbProd = dbProducts.find((p: any) => p.id === item.product_id);
                    if (!dbProd) {
                        return NextResponse.json({ error: `Product not found: ${item.product_id}` }, { status: 400 });
                    }
                    const isLibraUnit = !!(item.unit && (item.unit.toLowerCase().includes('libra') || item.unit.toLowerCase().includes('500g')));
                    const isKgProd = (dbProd.unit_of_measure || '').toLowerCase() === 'kg';
                    const unitFactor = (isLibraUnit && isKgProd) ? 0.5 : (dbProd.web_conversion_factor || 1);

                    const allowedPrices = [
                        Math.ceil(((dbProd.base_price || 0) * unitFactor) / 50) * 50
                    ];
                    if (dbProd.pricing_model_prices) {
                        for (const p of dbProd.pricing_model_prices) {
                            if (p.price > 0) {
                                allowedPrices.push(Math.ceil((p.price * unitFactor) / 50) * 50);
                            }
                        }
                    }

                    const isPriceValid = item.unit_price === 0 || allowedPrices.some(ap => ap > 0 && Math.abs(ap - item.unit_price) <= 0.01);

                    if (!isPriceValid) {
                        console.error(`Price manipulation detected! Product: ${item.product_id}, Sent price: ${item.unit_price}, Allowed prices:`, allowedPrices);
                        return NextResponse.json({ error: 'Invalid item price detected.' }, { status: 400 });
                    }
                }
            }
        } catch (validationErr: any) {
            console.error("Backend price validation threw exception (continuing checkout safely):", validationErr.message);
        }

        // Calculate total weight for the order
        let calculatedWeight = 0;
        try {
            const productIds = items.map((item: any) => item.product_id);
            const { data: weightProds } = await supabase
                .from('products')
                .select('id, weight_kg, unit_of_measure')
                .in('id', productIds);
            
            if (weightProds) {
                for (const item of items) {
                    const dbProd = weightProds.find((p: any) => p.id === item.product_id);
                    if (dbProd) {
                        const qtyNum = parseFloat(item.quantity?.toString() || '0');
                        const w = dbProd.weight_kg || (dbProd.unit_of_measure?.toLowerCase() === 'kg' ? 1 : 0);
                        calculatedWeight += (qtyNum * w);
                    }
                }
            }
        } catch (weightErr) {
            console.error('Error calculating weight in public order api:', weightErr);
        }
        // Ensure profile_id is a valid UUID or null
        if (order.profile_id && (typeof order.profile_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(order.profile_id))) {
            order.profile_id = null;
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
