import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = (supabaseUrl && serviceKey) ? createClient(supabaseUrl, serviceKey) : null;

export async function POST(request: NextRequest) {
    try {
        if (!supabase) {
            return NextResponse.json({ error: 'Configuración de base de datos no disponible' }, { status: 500 });
        }

        const body = await request.json();
        const {
            order_id,
            report_type = 'product',
            item_id,
            product_id,
            product_name,
            reason,
            affected_qty,
            unit,
            description,
            contact_name,
            contact_phone,
            resolution_preference = 'reposicion',
            photo_base64
        } = body;

        if (!order_id) {
            return NextResponse.json({ error: 'El identificador del pedido es obligatorio' }, { status: 400 });
        }

        if (!description || !description.trim()) {
            return NextResponse.json({ error: 'La descripción de lo ocurrido es obligatoria' }, { status: 400 });
        }

        // 1. Validar existencia del pedido
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('id, sequence_id, profile_id, delivery_date, shipping_address, profiles:profile_id(id, company_name, contact_name)')
            .eq('id', order_id)
            .maybeSingle();

        if (orderErr || !order) {
            return NextResponse.json({ error: 'El pedido especificado no existe o no pudo ser verificado' }, { status: 404 });
        }

        // 2. Procesamiento de Fotografía (si viene en base64)
        let uploadedPhotoUrl: string | null = null;
        if (photo_base64 && typeof photo_base64 === 'string') {
            try {
                const matches = photo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                const mimeType = matches ? matches[1] : 'image/jpeg';
                const base64Data = matches ? matches[2] : photo_base64;
                const buffer = Buffer.from(base64Data, 'base64');
                const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
                const fileName = `pqrs_${order.id}_${Date.now()}.${ext}`;

                // Intentar subir a delivery-evidence o fallback a evidence-photos
                const { error: uploadErr } = await supabase.storage
                    .from('delivery-evidence')
                    .upload(fileName, buffer, { contentType: mimeType, upsert: true });

                if (!uploadErr) {
                    const { data: { publicUrl } } = supabase.storage
                        .from('delivery-evidence')
                        .getPublicUrl(fileName);
                    uploadedPhotoUrl = publicUrl;
                } else {
                    const { error: fallbackErr } = await supabase.storage
                        .from('evidence-photos')
                        .upload(fileName, buffer, { contentType: mimeType, upsert: true });

                    if (!fallbackErr) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('evidence-photos')
                            .getPublicUrl(fileName);
                        uploadedPhotoUrl = publicUrl;
                    } else {
                        console.warn('Storage upload error:', uploadErr, fallbackErr);
                    }
                }
            } catch (imgErr) {
                console.error('Error decoding/uploading PQRS photo:', imgErr);
            }
        }

        // 3. Inserción en billing_returns si es novedad de producto
        const resolvedProdName = product_name || 'Producto Despachado';
        const friendlyOrderRef = order.sequence_id ? `#REM-${order.sequence_id}` : `#${order.id.slice(0, 8)}`;
        const prefLabel = resolution_preference === 'nota_credito'
            ? 'Nota Crédito en Factura'
            : resolution_preference === 'reposicion'
                ? 'Reposición Física Express'
                : 'Revisión por Interventoría';

        if (report_type === 'product' && product_id) {
            try {
                await supabase.from('billing_returns').insert({
                    order_id: order.id,
                    product_id: product_id,
                    quantity_returned: Number(affected_qty || 0),
                    reason: `[PQRS Móvil - Pref: ${prefLabel}] ${reason || 'Avería'}: ${description.trim()}`,
                    photo_url: uploadedPhotoUrl,
                    status: 'pending_review'
                });
            } catch (brErr) {
                console.warn('Error inserting billing_returns (continuing):', brErr);
            }
        }

        // 4. Inserción en customer_service_pqrs (Torre de Control)
        const subject = report_type === 'product'
            ? `[Garantía Móvil] Reclamo en ${resolvedProdName} - Pedido ${friendlyOrderRef}`
            : `[Garantía Móvil] Novedad General de Entrega - Pedido ${friendlyOrderRef}`;

        const fullDescription = [
            `📋 Radicación Oficial vía Portal Móvil / QR de Remisión`,
            `• Pedido: ${friendlyOrderRef} (Fecha entrega: ${order.delivery_date || 'N/A'})`,
            `• Contacto de radicación: ${contact_name || 'No especificado'} (Tel: ${contact_phone || 'No especificado'})`,
            `• Preferencia de compensación: ${prefLabel}`,
            report_type === 'product'
                ? `• Producto afectado: ${resolvedProdName}\n• Motivo: ${reason || 'Avería'}\n• Cantidad: ${affected_qty || 0} ${unit || 'unidades'}\n• Explicación: ${description.trim()}`
                : `• Tipo: Novedad General de Entrega\n• Motivo: ${reason || 'Novedad'}\n• Explicación: ${description.trim()}`
        ].join('\n');

        const { data: pqrData, error: pqrErr } = await supabase
            .from('customer_service_pqrs')
            .insert({
                client_id: order.profile_id || null,
                order_id: order.id,
                type: 'reclamo',
                category: report_type === 'product' ? 'producto' : 'entrega',
                priority: 'high',
                subject: subject,
                description: fullDescription,
                primary_photo_url: uploadedPhotoUrl,
                status: 'pending'
            })
            .select('id, created_at')
            .single();

        if (pqrErr) {
            console.error('Error inserting customer_service_pqrs:', pqrErr);
            return NextResponse.json({ error: 'Error al generar el ticket formal de servicio: ' + pqrErr.message }, { status: 500 });
        }

        const ticketCode = `PQR-2026-${order.sequence_id || Math.floor(1000 + Math.random() * 9000)}-${(pqrData?.id || Date.now().toString()).slice(-4).toUpperCase()}`;

        return NextResponse.json({
            success: true,
            ticket_code: ticketCode,
            pqr_id: pqrData?.id,
            product_name: resolvedProdName,
            affected_qty: affected_qty,
            unit: unit,
            reason: reason,
            photo_url: uploadedPhotoUrl,
            resolution_preference: prefLabel,
            created_at: pqrData?.created_at || new Date().toISOString()
        });

    } catch (err: any) {
        console.error('Unexpected error in /api/pqrs/submit:', err);
        return NextResponse.json({ error: err.message || 'Error interno al radicar PQRS' }, { status: 500 });
    }
}
