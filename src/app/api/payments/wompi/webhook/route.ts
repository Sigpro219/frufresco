import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isSandboxMode } from '@/lib/sandboxGuard';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isUrlValid = supabaseUrl.startsWith('http');
const supabase = isUrlValid ? createClient(supabaseUrl, supabaseKey) : (null as any);

function resolveNestedPath(obj: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

/**
 * Webhook oficial para eventos de Wompi (con validación criptográfica SHA-256 + timingSafeEqual).
 * Documentación: https://docs.wompi.co/docs/es/eventos
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { data, event, signature, timestamp } = body;
        const transaction = data?.transaction;

        if (!transaction) {
            return NextResponse.json({ error: 'Missing transaction payload' }, { status: 400 });
        }

        // 1. Validación criptográfica obligatoria fuera de Sandbox
        if (!isSandboxMode()) {
            const eventsSecret = sanitize(process.env.WOMPI_EVENTS_SECRET);
            const checksum = typeof signature?.checksum === 'string' ? signature.checksum.trim() : '';
            const properties: unknown = signature?.properties;

            if (!eventsSecret || !checksum || !Array.isArray(properties) || timestamp === undefined || timestamp === null) {
                return NextResponse.json({ error: 'Invalid or missing Wompi event signature' }, { status: 401 });
            }

            if (!/^[0-9a-f]{64}$/i.test(checksum)) {
                return NextResponse.json({ error: 'Malformed Wompi signature checksum' }, { status: 401 });
            }

            const concatenatedProps = properties
                .map((prop) => String(resolveNestedPath(data, String(prop)) ?? ''))
                .join('');
            const message = `${concatenatedProps}${String(timestamp)}${eventsSecret}`;
            const expectedHex = crypto.createHash('sha256').update(message).digest('hex');

            const providedBuf = Buffer.from(checksum.toLowerCase(), 'hex');
            const expectedBuf = Buffer.from(expectedHex.toLowerCase(), 'hex');

            if (providedBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(providedBuf, expectedBuf)) {
                return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
            }
        }

        if (event === 'transaction.updated') {
            const txStatus = String(transaction.status || '').toUpperCase(); // APPROVED, DECLINED, VOIDED, ERROR
            const reference = String(transaction.reference || '').trim();
            const txId = String(transaction.id || '').trim();

            if (!supabase) {
                return NextResponse.json({ error: 'Database connection not available' }, { status: 500 });
            }

            const { data: order, error: fetchError } = await supabase
                .from('orders')
                .select('*')
                .eq('id', reference)
                .maybeSingle();

            if (fetchError || !order) {
                console.error('Webhook: Order not found', reference);
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }

            // Idempotencia: nunca degradar ni cancelar un pedido ya pagado
            if (order.payment_status === 'Pagado' && txStatus !== 'APPROVED') {
                return NextResponse.json({ received: true, ignored: 'already_paid' });
            }

            let nextStatus = order.status || 'pending_approval';
            let nextPaymentStatus = order.payment_status || 'Pendiente';
            let profileId = order.profile_id;
            let adminNotes = order.admin_notes || '';
            const methodLabel = transaction.payment_method_type || 'ONLINE';

            if (txStatus === 'APPROVED') {
                nextPaymentStatus = 'Pagado';
                if (order.status === 'cancelled') {
                    nextStatus = 'pending_approval';
                }

                const paymentTag = `[PAGO: Wompi ${methodLabel} APPROVED | ID: ${txId}]`;
                if (!adminNotes.includes(`ID: ${txId}`)) {
                    adminNotes = adminNotes ? `${adminNotes} | ${paymentTag}` : paymentTag;
                }

                const notes = order.special_notes || '';
                const nameMatch = notes.match(/\[(?:CLIENTE|COMPRADOR\s*\/\s*FACTURACIÓN|DESTINATARIO\s*\/\s*RECIBE\s*EN\s*PUERTA):\s*(.*?)\s*\|/i);
                const phoneMatch = notes.match(/Tel:\s*(.*?)\s*\|/i);
                const emailMatch = notes.match(/Email:\s*(.*?)(?:\]|\s*\|)/i);
                const idMatch = notes.match(/ID:\s*(.*?)(?:\]|\s*\|)/i);

                const extractedName = nameMatch ? nameMatch[1].trim() : 'Cliente Web';
                const extractedPhone = phoneMatch ? phoneMatch[1].trim() : null;
                const extractedEmail = emailMatch ? emailMatch[1].trim() : null;
                const extractedId = idMatch ? idMatch[1].trim() : null;

                if (!profileId && extractedPhone) {
                    const cleanPhone = extractedPhone.replace(/\D/g, '');
                    if (cleanPhone.length >= 7) {
                        const { data: existingProfile } = await supabase
                            .from('profiles')
                            .select('id')
                            .ilike('contact_phone', `%${cleanPhone}%`)
                            .limit(1)
                            .maybeSingle();

                        if (existingProfile) {
                            profileId = existingProfile.id;
                        } else {
                            const guestId = crypto.randomUUID();
                            const { data: newProfile, error: profileError } = await supabase
                                .from('profiles')
                                .insert({
                                    id: guestId,
                                    role: 'b2c_client',
                                    company_name: extractedName,
                                    contact_name: extractedName,
                                    phone: extractedPhone,
                                    contact_phone: extractedPhone,
                                    email: extractedEmail,
                                    address: order.shipping_address,
                                    latitude: order.latitude,
                                    longitude: order.longitude,
                                    geocoding_status: order.latitude ? 'verified' : 'pending',
                                    document_type: 'remission',
                                    remission_with_prices: true,
                                    nit: extractedId,
                                    delivery_restrictions: '08:00 a 19:00'
                                })
                                .select('id')
                                .single();

                            if (!profileError && newProfile) {
                                profileId = newProfile.id;
                            } else {
                                console.error('Webhook: Failed to create B2C profile:', profileError);
                            }
                        }
                    }
                }
            } else if (txStatus === 'DECLINED' || txStatus === 'VOIDED' || txStatus === 'ERROR') {
                nextStatus = 'cancelled';
                nextPaymentStatus = 'Rechazado';
                const rejectTag = `[PAGO: Wompi ${methodLabel} ${txStatus} | ID: ${txId}]`;
                if (!adminNotes.includes(`ID: ${txId}`)) {
                    adminNotes = adminNotes ? `${adminNotes} | ${rejectTag}` : rejectTag;
                }
            }

            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    status: nextStatus,
                    payment_status: nextPaymentStatus,
                    profile_id: profileId,
                    admin_notes: adminNotes
                })
                .eq('id', reference);

            if (updateError) throw updateError;
        }

        return NextResponse.json({ received: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
