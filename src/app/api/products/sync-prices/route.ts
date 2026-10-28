import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { batchRecalculateAndSyncPrices } from '@/lib/pricingUtils';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function isAuthorized(request: Request): boolean {
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const token = queryToken || headerToken;
    if (!token) return false;

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && token === cronSecret) return true;
    if (token === supabaseServiceKey) return true;

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!cronSecret && token === anonKey) return true;

    return false;
}

async function handleSync(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const result = await batchRecalculateAndSyncPrices(supabase);

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || 'Error sincronizando modelos de precios'
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            products_processed: result.processed,
            message: `Sincronización canónica completada sobre ${result.processed} productos en pricing_model_prices (SDD §7.11.A / DT-01).`
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Internal Server Error';
        console.error('Pricing Sync Error:', error);
        return NextResponse.json({
            success: false,
            error: msg
        }, { status: 500 });
    }
}

export async function GET(request: Request) {
    return handleSync(request);
}

export async function POST(request: Request) {
    return handleSync(request);
}
