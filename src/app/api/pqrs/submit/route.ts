import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const serviceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabase = (supabaseUrl && serviceKey) ? createClient(supabaseUrl, serviceKey) : null;

// Esquema Zod de Validación Estricta (Zero-Trust Contract)
const pqrsSubmissionSchema = z.object({
    order_id: z.string().uuid("Identificador de pedido inválido (debe ser formato UUID)"),
    report_type: z.enum(['product', 'general']).default('product'),
    item_id: z.string().optional().nullable(),
    product_id: z.string().optional().nullable(),
    product_name: z.string().optional().nullable(),
    reason: z.string().min(2, "El motivo de la novedad es requerido"),
    affected_qty: z.number().positive("La cantidad afectada debe ser mayor a cero").optional().nullable(),
    unit: z.string().optional().nullable(),
    description: z.string().min(5, "La descripción debe tener al menos 5 caracteres"),
    contact_name: z.string().optional().nullable().default(''),
    contact_phone: z.string().optional().nullable().default(''),
    resolution_preference: z.enum(['reposicion', 'nota_credito', 'revision']).default('reposicion'),
    photo_base64: z.string().optional().nullable()
});

export async function POST(request: NextRequest) {
    try {
        if (!supabase) {
            return NextResponse.json({ error: 'Configuración de base de datos no disponible' }, { status: 500 });
        }

        const body = await request.json().catch(() => null);
        if (!body) {
            return NextResponse.json({ error: 'Cuerpo de solicitud JSON no válido o vacío' }, { status: 400 });
        }

        // 1. Validación de Esquemas Zod en Backend
        const parseResult = pqrsSubmissionSchema.safeParse(body);
        if (!parseResult.success) {
            const issues = parseResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
            return NextResponse.json({ error: `Validación fallida: ${issues}` }, { status: 400 });
        }

        const payload = parseResult.data;

        // 2. Validar existencia del pedido en base de datos
        const { data: order, error: orderErr } = await supabase
            .from('orders')
            .select('id, sequence_id, profile_id, delivery_date, shipping_address, profiles:profile_id(id, company_name, contact_name)')
            .eq('id', payload.order_id)
            .maybeSingle();

        if (orderErr || !order) {
            return NextResponse.json({ error: 'El pedido especificado no existe o no pudo ser verificado' }, { status: 404 });
        }

        // 3. Validación Server-Side Estricta de Productos Despachados (Zero-Trust Anti-Falsificación)
        let resolvedProdName = payload.product_name || 'Producto Despachado';
        let resolvedUnit = payload.unit || 'und';
        let targetProductId = payload.product_id || null;

        if (payload.report_type === 'product') {
            if (!payload.product_id && !payload.item_id) {
                return NextResponse.json({ error: 'Debe especificar el producto o ítem despachado para reclamos de producto' }, { status: 400 });
            }

            const { data: orderItems, error: itemsErr } = await supabase
                .from('order_items')
                .select('id, product_id, quantity, unit, nickname, products(id, name, unit_of_measure)')
                .eq('order_id', order.id);

            if (itemsErr) {
                console.error('Error fetching order_items in PQRS submit:', itemsErr);
                return NextResponse.json({ error: 'Error al verificar los ítems del pedido' }, { status: 500 });
            }

            const matchedItem = (orderItems || []).find(itm => 
                (payload.item_id && itm.id === payload.item_id) || 
                (payload.product_id && itm.product_id === payload.product_id)
            );

            if (!matchedItem) {
                return NextResponse.json({ 
                    error: 'Violación de integridad: El producto seleccionado no pertenece a los ítems despachados en este pedido' 
                }, { status: 400 });
            }

            const maxDispatchedQty = Number(matchedItem.quantity || 0);
            const claimedQty = Number(payload.affected_qty || 0);

            if (claimedQty <= 0) {
                return NextResponse.json({ error: 'La cantidad afectada debe ser mayor a cero' }, { status: 400 });
            }

            if (claimedQty > maxDispatchedQty) {
                return NextResponse.json({ 
                    error: `La cantidad reclamada (${claimedQty}) excede el volumen total despachado en la remisión (${maxDispatchedQty} ${matchedItem.unit || ''})` 
                }, { status: 400 });
            }

            targetProductId = matchedItem.product_id;
            const pObj = Array.isArray(matchedItem.products) ? matchedItem.products[0] : matchedItem.products;
            resolvedProdName = pObj?.name || matchedItem.nickname || resolvedProdName;
            resolvedUnit = matchedItem.unit || pObj?.unit_of_measure || resolvedUnit;
        }

        // 4. Procesamiento y Subida de Fotografía
        let uploadedPhotoUrl: string | null = null;
        if (payload.photo_base64 && typeof payload.photo_base64 === 'string') {
            try {
                const matches = payload.photo_base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                const mimeType = matches ? matches[1] : 'image/jpeg';
                const base64Data = matches ? matches[2] : payload.photo_base64;
                const buffer = Buffer.from(base64Data, 'base64');
                const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
                const fileName = `pqrs_${order.id}_${Date.now()}.${ext}`;

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
                        console.warn('Storage upload error (continuing with null photo):', uploadErr, fallbackErr);
                    }
                }
            } catch (imgErr) {
                console.error('Error decoding/uploading PQRS photo:', imgErr);
            }
        }

        // 5. Inserción verificada en billing_returns
        const friendlyOrderRef = order.sequence_id ? `#REM-${order.sequence_id}` : `#${order.id.slice(0, 8)}`;
        const prefLabel = payload.resolution_preference === 'nota_credito'
            ? 'Nota Crédito en Factura'
            : payload.resolution_preference === 'reposicion'
                ? 'Reposición Física Express'
                : 'Revisión por Interventoría';

        if (payload.report_type === 'product' && targetProductId) {
            const { error: brErr } = await supabase.from('billing_returns').insert({
                order_id: order.id,
                product_id: targetProductId,
                quantity_returned: Number(payload.affected_qty || 0),
                reason: `[PQRS Móvil - Pref: ${prefLabel}] ${payload.reason}: ${payload.description.trim()}`,
                photo_url: uploadedPhotoUrl,
                status: 'pending_review'
            });

            if (brErr) {
                console.error('CRITICAL: Error inserting billing_returns:', brErr);
                // Si la tabla billing_returns falla, se reporta en logs pero no aborta para no perder el ticket de servicio
            }
        }

        // 6. Inserción en customer_service_pqrs (Torre de Control de Calidad)
        const subject = payload.report_type === 'product'
            ? `[Garantía Móvil] Reclamo en ${resolvedProdName} - Pedido ${friendlyOrderRef}`
            : `[Garantía Móvil] Novedad General de Entrega - Pedido ${friendlyOrderRef}`;

        const fullDescription = [
            `📋 Radicación Oficial vía Portal Móvil / QR de Remisión`,
            `• Pedido: ${friendlyOrderRef} (Fecha entrega: ${order.delivery_date || 'N/A'})`,
            `• Contacto de radicación: ${payload.contact_name || 'No especificado'} (Tel: ${payload.contact_phone || 'No especificado'})`,
            `• Preferencia de compensación: ${prefLabel}`,
            payload.report_type === 'product'
                ? `• Producto afectado: ${resolvedProdName}\n• Motivo: ${payload.reason}\n• Cantidad: ${payload.affected_qty || 0} ${resolvedUnit}\n• Explicación: ${payload.description.trim()}`
                : `• Tipo: Novedad General de Entrega\n• Motivo: ${payload.reason}\n• Explicación: ${payload.description.trim()}`
        ].join('\n');

        const { data: pqrData, error: pqrErr } = await supabase
            .from('customer_service_pqrs')
            .insert({
                client_id: order.profile_id || null,
                order_id: order.id,
                type: 'reclamo',
                category: payload.report_type === 'product' ? 'producto' : 'entrega',
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
            affected_qty: payload.affected_qty,
            unit: resolvedUnit,
            reason: payload.reason,
            photo_url: uploadedPhotoUrl,
            resolution_preference: prefLabel,
            created_at: pqrData?.created_at || new Date().toISOString()
        });

    } catch (err: any) {
        console.error('Unexpected error in /api/pqrs/submit:', err);
        return NextResponse.json({ error: err.message || 'Error interno al radicar PQRS' }, { status: 500 });
    }
}
