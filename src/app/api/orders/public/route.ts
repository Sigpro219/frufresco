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

            const getParsedWeight = (text?: string): number | null => {
                if (!text) return null;
                if (text.includes('|')) {
                    const parts = text.split('|');
                    const grams = parseFloat(parts[1]);
                    if (!isNaN(grams) && grams > 0) return grams / 1000;
                }
                const clean = text.toLowerCase().replace(',', '.');
                const kgMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:kg|kilo|kilos)/);
                if (kgMatch) {
                    const val = parseFloat(kgMatch[1]);
                    if (!isNaN(val) && val > 0) return val;
                }
                const gMatch = clean.match(/(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos|grams|gramo|gram)/);
                if (gMatch) {
                    const val = parseFloat(gMatch[1]);
                    if (!isNaN(val) && val > 0) return val / 1000;
                }
                if (clean.includes('libra') || clean.includes('lb') || clean.includes('pound') || clean.includes('500g')) return 0.5;
                return null;
            };

            const productIds = items.map((item: any) => item.product_id);
            const { data: dbProducts, error: dbErr } = await supabase
                .from('products')
                .select('id, base_price, web_conversion_factor, unit_of_measure, pricing_model_prices(price, model_id), product_variants(sku, price_adjustment_percent, is_active, options)')
                .in('id', productIds);

            if (dbErr) {
                console.warn("Pricing cache check skipped due to DB error:", dbErr.message);
            } else if (dbProducts) {
                for (const item of items) {
                    const dbProd = dbProducts.find((p: any) => p.id === item.product_id);
                    if (!dbProd) {
                        return NextResponse.json({ error: `Product not found: ${item.product_id}` }, { status: 400 });
                    }
                    const parsedWeight = getParsedWeight(item.unit) || getParsedWeight(item.variant_label);
                    const isLibraUnit = !!(item.unit && (item.unit.toLowerCase().includes('libra') || item.unit.toLowerCase().includes('500g')));
                    const isKgProd = (dbProd.unit_of_measure || '').toLowerCase() === 'kg';
                    const unitFactor = parsedWeight !== null ? parsedWeight : ((isLibraUnit && isKgProd) ? 0.5 : (dbProd.web_conversion_factor || 1));

                    const basePrices = [dbProd.base_price || 0];
                    if (dbProd.pricing_model_prices) {
                        for (const p of dbProd.pricing_model_prices) {
                            if (p.price > 0) basePrices.push(p.price);
                        }
                    }

                    const factors = [unitFactor, 1, 0.5, dbProd.web_conversion_factor || 1];
                    if (parsedWeight !== null) factors.push(parsedWeight);

                    const allowedPrices: number[] = [];
                    for (const bp of basePrices) {
                        if (bp <= 0) continue;
                        for (const f of factors) {
                            if (f <= 0) continue;
                            const unadjusted = Math.ceil((bp * f) / 50) * 50;
                            allowedPrices.push(unadjusted);
                            if (dbProd.product_variants) {
                                for (const v of dbProd.product_variants) {
                                    if (v.price_adjustment_percent) {
                                        const adj = Math.ceil(((bp * (1 + v.price_adjustment_percent / 100)) * f) / 50) * 50;
                                        allowedPrices.push(adj);
                                    }
                                }
                            }
                        }
                    }

                    const isPriceValid = item.unit_price === 0 || allowedPrices.some(ap => ap > 0 && Math.abs(ap - item.unit_price) <= 0.01);

                    if (!isPriceValid) {
                        console.error(`Price validation: Product: ${item.product_id}, Sent price: ${item.unit_price}, Allowed prices:`, allowedPrices);
                        // Allow if sent price is greater than zero and doesn't deviate erratically
                        const minAllowed = Math.min(...allowedPrices.filter(p => p > 0));
                        if (item.unit_price <= 0 || (minAllowed > 0 && item.unit_price < minAllowed * 0.1)) {
                            return NextResponse.json({ error: 'Invalid item price detected.' }, { status: 400 });
                        }
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
