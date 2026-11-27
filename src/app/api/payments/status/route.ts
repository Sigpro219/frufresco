import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isSandboxMode } from '@/lib/sandboxGuard';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isUrlValid = supabaseUrl.startsWith('http');
const supabase = isUrlValid ? createClient(supabaseUrl, supabaseKey) : (null as any);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const id = (searchParams.get('id') || '').trim();

    if (!id) {
        return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    try {
        if (!supabase) {
            return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
        }

        // Branch A: UUID (Simulador Sandbox o consulta directa por Order ID)
        if (UUID_RE.test(id)) {
            const { data: order, error } = await supabase
                .from('orders')
                .select('id, sequence_id, created_at, status, payment_status, payment_method, total, delivery_date')
                .eq('id', id)
                .maybeSingle();

            if (error || !order) {
                return NextResponse.json({ status: 'NOT_FOUND' }, { status: 404 });
            }

            let wompiStatus = 'PENDING';
            const lowerStatus = String(order.status || '').toLowerCase();
            if (order.payment_status === 'Pagado' || lowerStatus === 'approved' || lowerStatus === 'paid') {
                wompiStatus = 'APPROVED';
            } else if (order.payment_status === 'Rechazado' || lowerStatus === 'cancelled' || lowerStatus === 'declined') {
                wompiStatus = 'DECLINED';
            } else if (lowerStatus === 'error') {
                wompiStatus = 'ERROR';
            }

            return NextResponse.json({
                data: {
                    status: wompiStatus,
                    amount_in_cents: Math.round(Number(order.total || 0) * 100),
                    currency: 'COP',
                    reference: order.id,
                    order_id: order.id,
                    order_sequence: order.sequence_id,
                    order_created_at: order.created_at,
                    delivery_date: order.delivery_date || null,
                    payment_method_type: order.payment_method || 'WOMPI'
                }
            });
        }

        // Branch B: ID de transacción real de Wompi (ej. 12345-170000-99999)
        const publicKey = sanitize(process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY);
        const useWompiSandbox = publicKey.startsWith('pub_test_') || isSandboxMode();
        const wompiBase = useWompiSandbox
            ? 'https://sandbox.wompi.co/v1/transactions/'
            : 'https://production.wompi.co/v1/transactions/';

        let wompiTx: any = null;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const wompiRes = await fetch(`${wompiBase}${encodeURIComponent(id)}`, {
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (wompiRes.ok) {
                const json = await wompiRes.json();
                wompiTx = json?.data || null;
            }
        } catch (fetchErr) {
            console.warn('Wompi status lookup timeout/error (degrading to PENDING):', fetchErr);
        }

        if (!wompiTx) {
            return NextResponse.json({
                data: {
                    status: 'PENDING',
                    amount_in_cents: 0,
                    currency: 'COP',
                    reference: '',
                    order_id: '',
                    order_sequence: 0,
                    order_created_at: '',
                    delivery_date: null,
                    payment_method_type: 'ONLINE'
                }
            });
        }

        const txStatus = String(wompiTx.status || 'PENDING').toUpperCase();
        const reference = String(wompiTx.reference || '').trim();
        const txAmountCents = Number(wompiTx.amount_in_cents || 0);
        const paymentMethodType = String(wompiTx.payment_method_type || 'ONLINE');

        let order: any = null;
        if (UUID_RE.test(reference)) {
            const { data: foundOrder } = await supabase
                .from('orders')
                .select('id, sequence_id, created_at, status, payment_status, total, delivery_date, admin_notes')
                .eq('id', reference)
                .maybeSingle();
            order = foundOrder;

            // Sincronización idempotente si Wompi ya aprobó antes de que llegue el webhook
            if (order && txStatus === 'APPROVED' && order.payment_status !== 'Pagado') {
                const expectedCents = Math.round(Number(order.total || 0) * 100);
                if (txAmountCents === expectedCents) {
                    const paymentTag = `[PAGO: Wompi ${paymentMethodType} APPROVED | ID: ${id}]`;
                    const existingNotes = String(order.admin_notes || '');
                    const updatedNotes = existingNotes.includes(`ID: ${id}`)
                        ? existingNotes
                        : (existingNotes ? `${existingNotes} | ${paymentTag}` : paymentTag);

                    await supabase
                        .from('orders')
                        .update({
                            payment_status: 'Pagado',
                            status: order.status === 'cancelled' ? 'pending_approval' : order.status,
                            admin_notes: updatedNotes
                        })
                        .eq('id', order.id);
                }
            }
        }

        return NextResponse.json({
            data: {
                status: txStatus,
                amount_in_cents: txAmountCents || Math.round(Number(order?.total || 0) * 100),
                currency: wompiTx.currency || 'COP',
                reference,
                order_id: order?.id || reference,
                order_sequence: order?.sequence_id || 0,
                order_created_at: order?.created_at || new Date().toISOString(),
                delivery_date: order?.delivery_date || null,
                payment_method_type: paymentMethodType
            }
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
