import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Persiste tarifas directas en `pricing_model_prices` desde carga Excel administrativa,
 * evitando bloqueos RLS del cliente anon del navegador.
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization') || '';
        const token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token) {
            return NextResponse.json({ error: 'Sesión no autorizada' }, { status: 401 });
        }

        const supabaseAdmin = createAdminClient();
        const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !authData?.user) {
            return NextResponse.json({ error: 'Token de sesión inválido' }, { status: 401 });
        }

        const { data: callerProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, role, is_active')
            .eq('id', authData.user.id)
            .maybeSingle();

        const role = callerProfile?.role || '';
        if (!callerProfile || callerProfile.is_active === false || role === 'b2c_client' || role === 'b2b_client') {
            return NextResponse.json({ error: 'Permisos insuficientes para actualizar tarifas' }, { status: 403 });
        }

        const body = await req.json();
        const rows = Array.isArray(body?.rows) ? body.rows : [];
        if (rows.length === 0) {
            return NextResponse.json({ error: 'No se recibieron tarifas para guardar' }, { status: 400 });
        }

        const sanitized = rows
            .filter((r: any) => r?.model_id && r?.product_id && Number.isFinite(Number(r.price)) && Number(r.price) > 0)
            .map((r: any) => ({
                model_id: String(r.model_id),
                product_id: String(r.product_id),
                price: Math.round(Number(r.price)),
                updated_at: new Date().toISOString(),
            }));

        for (let i = 0; i < sanitized.length; i += 100) {
            const batch = sanitized.slice(i, i + 100);
            const { error } = await supabaseAdmin
                .from('pricing_model_prices')
                .upsert(batch, { onConflict: 'model_id,product_id' });
            if (error) throw error;
        }

        return NextResponse.json({ success: true, count: sanitized.length });
    } catch (err: any) {
        console.error('[API pricing-model-prices] Error:', err?.message || err);
        return NextResponse.json({ error: err?.message || 'Error guardando precios del modelo' }, { status: 500 });
    }
}
