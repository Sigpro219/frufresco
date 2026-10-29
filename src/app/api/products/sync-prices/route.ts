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

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && token === cronSecret) return true;
    if (token && token === supabaseServiceKey) return true;

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!cronSecret && token && token === anonKey) return true;

    // Soporte nativo para Vercel Cron cuando no se exige CRON_SECRET externo
    const vercelCronHeader = request.headers.get('x-vercel-cron');
    if (!cronSecret && vercelCronHeader) return true;

    return false;
}

async function handleSync(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const isMidnightCron = searchParams.get('cron') === 'midnight' || Boolean(request.headers.get('x-vercel-cron'));
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const result = await batchRecalculateAndSyncPrices(supabase, undefined, {
            isMidnightCron,
            freezeDailyCost: true
        });

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || 'Error sincronizando modelos de precios'
            }, { status: 500 });
        }

        if (isMidnightCron) {
            try {
                await supabase.from('audit_logs').insert([{
                    action: 'MIDNIGHT_COST_FREEZE_CRON',
                    module: 'COMMERCIAL',
                    collaborator_name: 'Sistema Cron Medianoche',
                    details: {
                        products_processed: result.processed,
                        models_updated: result.modelsUpdated ?? 0,
                        frozen_costs_count: result.frozenCostsCount ?? 0,
                        executed_at: new Date().toISOString()
                    }
                }]);
            } catch (auditErr) {
                console.warn('Cron audit log notice:', auditErr);
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: new Date().toISOString(),
            is_midnight_cron: isMidnightCron,
            products_processed: result.processed,
            models_updated: result.modelsUpdated,
            frozen_costs_count: result.frozenCostsCount,
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
