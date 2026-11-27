import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isSandboxMode } from '@/lib/sandboxGuard';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Genera la firma de integridad SHA256 requerida por Wompi leyendo el total real desde BD.
 * Estructura: cadena = referencia + monto_en_centavos + moneda + secreto_de_integridad
 */
export async function POST(request: Request) {
    try {
        const { reference, currency = 'COP' } = await request.json();

        if (!reference || typeof reference !== 'string' || !UUID_RE.test(reference.trim())) {
            return NextResponse.json(
                { error: 'Referencia de pedido inválida.' },
                { status: 400 }
            );
        }

        const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
        const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
        if (!supabaseUrl.startsWith('http') || !supabaseKey) {
            return NextResponse.json({ error: 'Conexión a base de datos no disponible.' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, total, payment_status, status')
            .eq('id', reference.trim())
            .maybeSingle();

        if (orderError || !order) {
            return NextResponse.json({ error: 'Pedido no encontrado.' }, { status: 404 });
        }

        if (order.payment_status === 'Pagado') {
            return NextResponse.json({ error: 'Este pedido ya fue pagado.' }, { status: 409 });
        }

        const amountInCents = Math.round(Number(order.total) * 100);
        if (!Number.isFinite(amountInCents) || amountInCents <= 0) {
            return NextResponse.json({ error: 'El monto del pedido debe ser mayor a $0.' }, { status: 422 });
        }

        const sandbox = isSandboxMode();
        const rawIntegritySecret = sanitize(process.env.WOMPI_INTEGRITY_SECRET);
        const publicKey = sanitize(process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY);

        if (!sandbox && (!rawIntegritySecret || !publicKey)) {
            return NextResponse.json(
                { error: 'La pasarela de pagos Wompi está en activación. Por favor usa Pago Contra Entrega o intenta más tarde.' },
                { status: 503 }
            );
        }

        const integritySecret = rawIntegritySecret || 'test_integrity_secret_sandbox';
        const signatureString = `${order.id}${amountInCents}${currency}${integritySecret}`;
        const hash = crypto
            .createHash('sha256')
            .update(signatureString)
            .digest('hex');

        return NextResponse.json({
            hash,
            publicKey: publicKey || null,
            amountInCents,
            currency,
            sandbox
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Error interno';
        console.error('Integrity Hash Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
