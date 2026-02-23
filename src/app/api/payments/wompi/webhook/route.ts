import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase Admin Client to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Fallback to Anon key if Service key is missing (though RLS might block it), 
// but primarily expect Service Key for webhooks.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Webhook para recibir notificaciones de eventos de Wompi
 * Documentación: https://docs.wompi.co/docs/es/eventos
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { data, event, signature, timestamp } = body;
        const transaction = data.transaction;

        // 1. VALIDACIÓN DE FIRMA (Opcional pero recomendado para producción)
        // Por ahora lo dejamos documentado para que el usuario pueda activarlo con su EVENTS_SECRET
        /*
        const eventsSecret = process.env.WOMPI_EVENTS_SECRET;
        const message = `${transaction.id}${transaction.status}${transaction.amount_in_cents}${timestamp}${eventsSecret}`;
        const expectedSignature = crypto.createHash('sha256').update(message).digest('hex');
        if (signature.checksum !== expectedSignature) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
        */

        if (event === 'transaction.updated') {
            const status = transaction.status; // APPROVED, DECLINED, VOIDED, ERROR
            const reference = transaction.reference; // Nuestro Order ID

            console.log(`Wompi Webhook: Order ${reference} status updated to ${status}`);

            // 2. ACTUALIZAR ESTADO EN SUPABASE
            const mappedStatus = status === 'APPROVED' ? 'approved' : status === 'DECLINED' ? 'cancelled' : 'pending_approval';

            const { error } = await supabase
                .from('orders')
                .update({
                    status: mappedStatus,
                    wompi_transaction_id: transaction.id
                })
                .eq('id', reference);

            if (error) throw error;
        }

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
