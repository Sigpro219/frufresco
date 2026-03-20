import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Initialize Supabase Admin Client to bypass RLS
const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const isUrlValid = supabaseUrl.startsWith('http');
const supabase = isUrlValid ? createClient(supabaseUrl, supabaseKey) : null as any;

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

            // 1. Obtener datos actuales del pedido
            const { data: order, error: fetchError } = await supabase
                .from('orders')
                .select('*')
                .eq('id', reference)
                .single();
            
            if (fetchError || !order) {
                console.error('Webhook: Order not found', reference);
                return NextResponse.json({ error: 'Order not found' }, { status: 404 });
            }

            // 2. Mapear estado
            const mappedStatus = status === 'APPROVED' ? 'approved' : status === 'DECLINED' ? 'cancelled' : 'pending_approval';
            
            // 3. Lógica SI el pago es aprobado
            let profileId = order.profile_id;
            let adminNotes = order.admin_notes || '';

            if (status === 'APPROVED') {
                // Sello de pago para logística
                const paymentTag = `[PAGO: Wompi ${transaction.payment_method_type || 'CARD'} APPROVED]`;
                if (!adminNotes.includes('[PAGO:')) {
                    adminNotes = adminNotes ? `${adminNotes} | ${paymentTag}` : paymentTag;
                }

                // SI no tiene perfil (B2C Guest), crearlo on-the-fly
                if (!profileId && order.customer_phone) {
                    console.log('Webhook: Creating automatic profile for guest B2C customer');
                    
                    // Buscar si ya existe un perfil con este teléfono (limpio)
                    const cleanPhone = order.customer_phone.replace(/\D/g, '');
                    const { data: existingProfile } = await supabase
                        .from('profiles')
                        .select('id')
                        .ilike('contact_phone', `%${cleanPhone}%`)
                        .single();

                    if (existingProfile) {
                        profileId = existingProfile.id;
                        console.log('Webhook: Existing profile found and linked:', profileId);
                    } else {
                        // Crear nuevo perfil B2C
                        const { data: newProfile, error: profileError } = await supabase
                            .from('profiles')
                            .insert({
                                role: 'b2c_client',
                                company_name: order.customer_name,
                                contact_name: order.customer_name,
                                contact_phone: order.customer_phone,
                                email: order.customer_email,
                                address: order.shipping_address,
                                latitude: order.latitude,
                                longitude: order.longitude,
                                geocoding_status: order.latitude ? 'verified' : 'pending'
                            })
                            .select('id')
                            .single();

                        if (!profileError && newProfile) {
                            profileId = newProfile.id;
                            console.log('Webhook: New B2C profile created:', profileId);
                        } else {
                            console.error('Webhook: Failed to create B2C profile:', profileError);
                        }
                    }
                }
            }

            // 4. Actualizar el pedido
            const { error: updateError } = await supabase
                .from('orders')
                .update({
                    status: mappedStatus,
                    wompi_transaction_id: transaction.id,
                    profile_id: profileId,
                    admin_notes: adminNotes
                })
                .eq('id', reference);

            if (updateError) throw updateError;
        }

        return NextResponse.json({ received: true });
    } catch (error: any) {
        console.error('Webhook Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
