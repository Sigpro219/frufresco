import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { verifySessionAndPermission } from '@/lib/auth';
import { sanitizeGpsImei } from '@/lib/telemetry/apps360';

export const dynamic = 'force-dynamic';

const CreateKitSchema = z.object({
    label: z.string().trim().min(2, 'Etiqueta mínima 2 caracteres').max(30),
    imei: z.string().trim().min(10, 'IMEI inválido').max(25),
    provider: z.enum(['apps360', 'webhook']).optional().default('apps360'),
    notes: z.string().trim().max(200).optional()
});

const PatchKitSchema = z.object({
    id: z.string().uuid('ID de kit inválido'),
    label: z.string().trim().min(2).max(30).optional(),
    imei: z.string().trim().min(10).max(25).optional(),
    provider: z.enum(['apps360', 'webhook']).optional(),
    is_active: z.boolean().optional(),
    notes: z.string().trim().max(200).nullable().optional()
});

async function clearVehiclesForKit(adminSupabase: ReturnType<typeof createAdminClient>, kitId: string) {
    const { data: assigned } = await adminSupabase
        .from('fleet_vehicles')
        .select('id, tracking_source')
        .eq('gps_kit_id', kitId);

    for (const veh of assigned || []) {
        await adminSupabase
            .from('fleet_vehicles')
            .update({
                gps_kit_id: null,
                gps_imei: null,
                ...(veh.tracking_source === 'hardware_gps' ? { last_gps_sync: null } : {})
            })
            .eq('id', veh.id);
    }
}

export async function GET(req: NextRequest) {
    let auth = await verifySessionAndPermission(req, 'admin.transport.edit');
    if (!auth.authorized) {
        auth = await verifySessionAndPermission(req, 'admin.transport');
    }
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 403 });
    }

    try {
        const adminSupabase = createAdminClient();
        const [{ data: kits, error: kErr }, { data: vehicles }] = await Promise.all([
            adminSupabase.from('portable_gps_kits').select('*').order('label', { ascending: true }),
            adminSupabase.from('fleet_vehicles').select('id, plate, gps_kit_id').not('gps_kit_id', 'is', null)
        ]);

        if (kErr) {
            if (kErr.code === '42P01') {
                return NextResponse.json({ success: true, kits: [], migration_pending: true });
            }
            throw kErr;
        }

        const vehicleByKitId = new Map((vehicles || []).map(v => [v.gps_kit_id, { id: v.id, plate: v.plate }]));
        const enriched = (kits || []).map(k => ({
            ...k,
            assigned_vehicle: vehicleByKitId.get(k.id) || null
        }));

        return NextResponse.json({ success: true, kits: enriched });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error listando kits GPS';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const auth = await verifySessionAndPermission(req, 'admin.transport.edit');
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error || 'No tienes permiso para crear kits GPS.' }, { status: 403 });
    }

    try {
        const raw = await req.json().catch(() => null);
        const parsed = CreateKitSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message || 'Datos inválidos para el kit GPS.' },
                { status: 400 }
            );
        }

        const cleanImei = sanitizeGpsImei(parsed.data.imei);
        if (!cleanImei) {
            return NextResponse.json({ error: 'El IMEI debe tener entre 10 y 20 dígitos numéricos.' }, { status: 400 });
        }

        const adminSupabase = createAdminClient();
        const { data, error } = await adminSupabase
            .from('portable_gps_kits')
            .insert([{
                label: parsed.data.label.toUpperCase(),
                imei: cleanImei,
                provider: parsed.data.provider,
                notes: parsed.data.notes || null,
                is_active: true
            }])
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Ya existe un kit con esa etiqueta o IMEI.' }, { status: 409 });
            }
            throw error;
        }

        return NextResponse.json({ success: true, kit: data }, { status: 201 });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error creando kit GPS';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function PATCH(req: NextRequest) {
    const auth = await verifySessionAndPermission(req, 'admin.transport.edit');
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error || 'No tienes permiso para editar kits GPS.' }, { status: 403 });
    }

    try {
        const raw = await req.json().catch(() => null);
        const parsed = PatchKitSchema.safeParse(raw);
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Datos inválidos.' }, { status: 400 });
        }

        const adminSupabase = createAdminClient();
        const updates: Record<string, string | boolean | null> = {
            updated_at: new Date().toISOString()
        };

        if (parsed.data.label !== undefined) updates.label = parsed.data.label.toUpperCase();
        if (parsed.data.provider !== undefined) updates.provider = parsed.data.provider;
        if (parsed.data.is_active !== undefined) updates.is_active = parsed.data.is_active;
        if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;
        if (parsed.data.imei !== undefined) {
            const cleanImei = sanitizeGpsImei(parsed.data.imei);
            if (!cleanImei) {
                return NextResponse.json({ error: 'El IMEI debe tener entre 10 y 20 dígitos numéricos.' }, { status: 400 });
            }
            updates.imei = cleanImei;
        }

        if (parsed.data.is_active === false) {
            await clearVehiclesForKit(adminSupabase, parsed.data.id);
        }

        const { data, error } = await adminSupabase
            .from('portable_gps_kits')
            .update(updates)
            .eq('id', parsed.data.id)
            .select()
            .single();

        if (error) {
            if (error.code === '23505') {
                return NextResponse.json({ error: 'Ya existe otro kit con esa etiqueta o IMEI.' }, { status: 409 });
            }
            throw error;
        }

        if (updates.imei && parsed.data.is_active !== false) {
            await adminSupabase
                .from('fleet_vehicles')
                .update({ gps_imei: String(updates.imei) })
                .eq('gps_kit_id', parsed.data.id);
        }

        return NextResponse.json({ success: true, kit: data });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error actualizando kit GPS';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const auth = await verifySessionAndPermission(req, 'admin.transport.edit');
    if (!auth.authorized) {
        return NextResponse.json({ error: auth.error || 'No tienes permiso para eliminar kits GPS.' }, { status: 403 });
    }

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        if (!id || !z.string().uuid().safeParse(id).success) {
            return NextResponse.json({ error: 'ID de kit inválido.' }, { status: 400 });
        }

        const adminSupabase = createAdminClient();
        await clearVehiclesForKit(adminSupabase, id);

        const { error } = await adminSupabase
            .from('portable_gps_kits')
            .delete()
            .eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Error eliminando kit GPS';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
