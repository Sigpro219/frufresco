import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recalculateAndSyncProductPrices, batchRecalculateAndSyncPrices } from '@/lib/pricingUtils';
import { revalidatePath } from 'next/cache';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { productId, explicitCost, productIds } = body;

        if (!productId && (!Array.isArray(productIds) || productIds.length === 0)) {
            return NextResponse.json({ error: 'Debes proporcionar un productId o una lista de productIds.' }, { status: 400 });
        }

        // Caso 1: Sincronización masiva de lista de productos
        if (Array.isArray(productIds) && productIds.length > 0) {
            const batchRes = await batchRecalculateAndSyncPrices(supabaseAdmin, productIds);
            
            // Revalidar rutas del catálogo
            try {
                revalidatePath('/');
                revalidatePath('/products');
                revalidatePath('/admin/commercial');
            } catch (revErr) {
                console.warn('[Sync API] Revalidation notice:', revErr);
            }

            return NextResponse.json({
                success: batchRes.success,
                processed: batchRes.processed,
                error: batchRes.error
            });
        }

        // Caso 2: Sincronización individual de un producto
        const numericCost = explicitCost !== undefined && explicitCost !== null && !isNaN(Number(explicitCost)) && Number(explicitCost) > 0
            ? Number(explicitCost)
            : null;

        const syncRes = await recalculateAndSyncProductPrices(supabaseAdmin, productId, numericCost);

        if (!syncRes.success) {
            console.error('[Sync API] Sync error for product:', productId, syncRes.error);
            return NextResponse.json({ success: false, error: syncRes.error }, { status: 500 });
        }

        // Revalidar la página del producto específico y el catálogo
        try {
            revalidatePath(`/products/${productId}`);
            revalidatePath('/');
            revalidatePath('/products');
            revalidatePath('/admin/commercial');
        } catch (revErr) {
            console.warn('[Sync API] Revalidation notice:', revErr);
        }

        return NextResponse.json({
            success: true,
            productId,
            hogarPrice: syncRes.hogarPrice,
            updatesCount: syncRes.updatesCount
        });
    } catch (err: any) {
        console.error('[Sync API] Unexpected error:', err);
        return NextResponse.json({ success: false, error: err?.message || 'Internal Server Error' }, { status: 500 });
    }
}
