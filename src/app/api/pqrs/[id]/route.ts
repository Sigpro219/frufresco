import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_PQRS_DELETE_EMAILS = new Set([
    'admin@frufresco.com',
    'angidailed94@gmail.com'
]);

const ALLOWED_PQRS_DELETE_IDS = new Set([
    '77ef7895-cc19-4d3d-9f0b-774e9a032c6b',
    '429f975b-0e38-47ec-8e8d-f548051be8dd'
]);

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json({ error: 'Configuración de servidor incompleta' }, { status: 500 });
        }

        const authHeader = request.headers.get('authorization') || '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
        if (!token) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);
        const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
        if (authErr || !authData?.user) {
            return NextResponse.json({ error: 'Sesión inválida o expirada' }, { status: 401 });
        }

        const userEmail = (authData.user.email || '').trim().toLowerCase();
        const userId = authData.user.id;
        if (!ALLOWED_PQRS_DELETE_EMAILS.has(userEmail) && !ALLOWED_PQRS_DELETE_IDS.has(userId)) {
            return NextResponse.json(
                { error: 'Acceso denegado: solo admin@frufresco.com y angidailed94@gmail.com pueden eliminar PQRS.' },
                { status: 403 }
            );
        }

        const { id } = await context.params;
        if (!id) {
            return NextResponse.json({ error: 'ID de PQRS requerido' }, { status: 400 });
        }

        const { data: pqr, error: pqrErr } = await supabaseAdmin
            .from('customer_service_pqrs')
            .select('id, order_id, status, subject')
            .eq('id', id)
            .single();

        if (pqrErr || !pqr) {
            return NextResponse.json({ error: 'PQRS no encontrada' }, { status: 404 });
        }

        let deletedReturnsCount = 0;

        if (pqr.order_id) {
            const { data: order } = await supabaseAdmin
                .from('orders')
                .select('id, sequence_id, invoice_id')
                .eq('id', pqr.order_id)
                .single();

            if (order?.invoice_id) {
                return NextResponse.json(
                    { error: `El pedido #${order.sequence_id || ''} ya está facturado; no se puede eliminar la PQRS.` },
                    { status: 409 }
                );
            }

            const { data: replacementOrders } = await supabaseAdmin
                .from('orders')
                .select('id, sequence_id')
                .eq('logistics_data->>parent_order_id', pqr.order_id)
                .eq('logistics_data->>is_replacement', 'true');

            if (replacementOrders && replacementOrders.length > 0) {
                return NextResponse.json(
                    { error: `Existe un pedido de reposición vinculado (#${replacementOrders[0].sequence_id}); elimínalo o cancélalo primero.` },
                    { status: 409 }
                );
            }

            const shortId = pqr.id.slice(0, 8);
            const { data: byShortId } = await supabaseAdmin
                .from('billing_returns')
                .delete()
                .eq('order_id', pqr.order_id)
                .ilike('reason', `%#${shortId}%`)
                .select('id');

            deletedReturnsCount += byShortId?.length || 0;

            const { count: otherPqrsCount } = await supabaseAdmin
                .from('customer_service_pqrs')
                .select('*', { count: 'exact', head: true })
                .eq('order_id', pqr.order_id)
                .neq('id', pqr.id);

            if ((otherPqrsCount || 0) === 0 && (pqr.status === 'pending' || pqr.status === 'in_review')) {
                const { data: pendingRets } = await supabaseAdmin
                    .from('billing_returns')
                    .delete()
                    .eq('order_id', pqr.order_id)
                    .eq('status', 'pending_review')
                    .select('id');
                deletedReturnsCount += pendingRets?.length || 0;
            }
        }

        const { error: delErr } = await supabaseAdmin
            .from('customer_service_pqrs')
            .delete()
            .eq('id', pqr.id);

        if (delErr) {
            return NextResponse.json({ error: delErr.message }, { status: 500 });
        }

        console.info(`[PQRS_DELETE] PQR ${pqr.id} (order ${pqr.order_id || 'none'}) eliminada por ${userEmail} (${userId}). Returns limpios: ${deletedReturnsCount}`);

        return NextResponse.json({
            ok: true,
            deletedId: pqr.id,
            deletedReturnsCount
        });
    } catch (err: any) {
        return NextResponse.json({ error: err?.message || 'Error interno al eliminar PQRS' }, { status: 500 });
    }
}
