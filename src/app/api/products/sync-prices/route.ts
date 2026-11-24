import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { batchRecalculateAndSyncPrices } from '@/lib/pricingUtils';
import { isSandboxMode } from '@/lib/sandboxGuard';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

async function isAuthorized(request: Request, supabaseAdmin: any): Promise<boolean> {
    const { searchParams } = new URL(request.url);
    const queryToken = searchParams.get('token');
    const authHeader = request.headers.get('Authorization');
    const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;
    const token = queryToken || headerToken;

    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && token === cronSecret) return true;
    if (token && supabaseServiceKey && token === supabaseServiceKey) return true;

    // Soporte nativo para Vercel Cron cuando no se exige CRON_SECRET externo
    const vercelCronHeader = request.headers.get('x-vercel-cron');
    if (!cronSecret && vercelCronHeader) return true;

    // Autorizar sesiones administrativas autenticadas vía Supabase Bearer JWT
    if (headerToken && supabaseAdmin) {
        try {
            const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(headerToken);
            if (!userErr && userData?.user?.id) {
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('role, is_active')
                    .eq('id', userData.user.id)
                    .maybeSingle();
                const normRole = String(profile?.role || '').trim().toLowerCase();
                if (profile && profile.is_active !== false && normRole && !['b2c_client', 'b2b_client', 'client'].includes(normRole)) {
                    return true;
                }
            }
        } catch {
            // fall through to unauthorized
        }
    }

    return false;
}

async function handleSync(request: Request) {
    const { searchParams } = new URL(request.url);
    const isMidnightCron = searchParams.get('cron') === 'midnight' || Boolean(request.headers.get('x-vercel-cron'));

    if (isSandboxMode() && isMidnightCron) {
        return NextResponse.json(
            { success: true, skipped: true, sandbox: true, reason: 'Nocturnal pricing sync disabled in Sandbox mode' },
            { status: 200 }
        );
    }

    if (!supabaseUrl || !supabaseServiceKey) {
        return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!(await isAuthorized(request, supabase))) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        let productIds: string[] | undefined = undefined;
        if (request.method === 'POST') {
            try {
                const body = await request.json();
                if (Array.isArray(body?.productIds)) {
                    const filtered = body.productIds.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
                    if (body.productIds.length > 0 && filtered.length === 0) {
                        return NextResponse.json({ error: 'productIds inválidos' }, { status: 400 });
                    }
                    if (filtered.length > 0) {
                        productIds = filtered;
                    }
                }
            } catch {
                // body opcional
            }
        }

        const result = await batchRecalculateAndSyncPrices(supabase, productIds, {
            isMidnightCron,
            freezeDailyCost: isMidnightCron
        });

        if (!result.success) {
            return NextResponse.json({
                success: false,
                error: result.error || 'Error sincronizando modelos de precios'
            }, { status: 500 });
        }

        try {
            revalidatePath('/');
            revalidatePath('/products');
        } catch (revErr) {
            console.warn('RevalidatePath notice in sync-prices:', revErr);
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
