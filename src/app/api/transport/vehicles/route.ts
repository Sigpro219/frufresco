import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifySessionAndPermission } from '@/lib/auth';
import { normalizeFleetOwnership } from '@/lib/transport/fleetOwnership';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        // 1. Validar sesión y permisos del usuario (admite tanto Bearer token como cookies)
        let auth = await verifySessionAndPermission(request, 'admin.transport.edit');
        if (!auth.authorized) {
            auth = await verifySessionAndPermission(request, 'admin.transport');
        }
        if (!auth.authorized) {
            return NextResponse.json(
                { error: auth.error || 'No tienes permisos para modificar la flota de transporte.' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { action, vehicleId, vehicleData, odometer, driverId, status, kitId } = body;

        const adminSupabase = createAdminClient();

        // 2. Acción: ACTUALIZAR VEHÍCULO COMPLETO
        if (action === 'update') {
            if (!vehicleId) {
                return NextResponse.json({ error: 'Falta el ID del vehículo a actualizar.' }, { status: 400 });
            }
            if (!vehicleData) {
                return NextResponse.json({ error: 'Faltan los datos del formulario de vehículo.' }, { status: 400 });
            }

            const plate = String(vehicleData.plate || '').trim().toUpperCase();
            if (!plate) {
                return NextResponse.json({ error: 'La placa es obligatoria.' }, { status: 400 });
            }

            // Validar que la placa no esté asignada a otro vehículo
            const { data: duplicate } = await adminSupabase
                .from('fleet_vehicles')
                .select('id, plate')
                .eq('plate', plate)
                .neq('id', vehicleId)
                .maybeSingle();

            if (duplicate) {
                return NextResponse.json(
                    { error: `La placa ${plate} ya se encuentra registrada en otro vehículo de la flota.` },
                    { status: 400 }
                );
            }

            // Consultar datos actuales para detectar si varió el odómetro
            const { data: currentV } = await adminSupabase
                .from('fleet_vehicles')
                .select('current_odometer')
                .eq('id', vehicleId)
                .maybeSingle();

            const newOdometer = Number(vehicleData.current_odometer) || 0;
            const odometerChanged = !currentV || currentV.current_odometer !== newOdometer;

            const updatePayload: Record<string, any> = {
                plate,
                brand: String(vehicleData.brand || '').trim(),
                model: String(vehicleData.model || '').trim(),
                vehicle_type: normalizeFleetOwnership(vehicleData.vehicle_type),
                capacity_kg: Number(vehicleData.capacity_kg) || 0,
                max_crates_capacity: parseInt(String(vehicleData.max_crates_capacity)) || 0,
                current_odometer: newOdometer
            };

            if (odometerChanged) {
                updatePayload.last_odometer_update = new Date().toISOString();
            }

            const { data, error } = await adminSupabase
                .from('fleet_vehicles')
                .update(updatePayload)
                .eq('id', vehicleId)
                .select()
                .single();

            if (error) {
                console.error('[API /api/transport/vehicles] Error en update:', error);
                return NextResponse.json({ error: error.message || 'Error al actualizar vehículo en base de datos.' }, { status: 500 });
            }

            return NextResponse.json({ success: true, vehicle: data });
        }

        // 3. Acción: CREAR VEHÍCULO
        if (action === 'create') {
            if (!vehicleData) {
                return NextResponse.json({ error: 'Faltan los datos del nuevo vehículo.' }, { status: 400 });
            }

            const plate = String(vehicleData.plate || '').trim().toUpperCase();
            if (!plate) {
                return NextResponse.json({ error: 'La placa es obligatoria.' }, { status: 400 });
            }

            const { data: duplicate } = await adminSupabase
                .from('fleet_vehicles')
                .select('id')
                .eq('plate', plate)
                .maybeSingle();

            if (duplicate) {
                return NextResponse.json(
                    { error: `La placa ${plate} ya existe en la flota.` },
                    { status: 400 }
                );
            }

            const insertPayload = {
                plate,
                brand: String(vehicleData.brand || '').trim(),
                model: String(vehicleData.model || '').trim(),
                vehicle_type: normalizeFleetOwnership(vehicleData.vehicle_type),
                capacity_kg: Number(vehicleData.capacity_kg) || 1000,
                max_crates_capacity: parseInt(String(vehicleData.max_crates_capacity)) || 0,
                current_odometer: Number(vehicleData.current_odometer) || 0,
                status: 'available',
                last_odometer_update: new Date().toISOString()
            };

            const { data, error } = await adminSupabase
                .from('fleet_vehicles')
                .insert([insertPayload])
                .select()
                .single();

            if (error) {
                console.error('[API /api/transport/vehicles] Error en create:', error);
                return NextResponse.json({ error: error.message || 'Error al registrar vehículo.' }, { status: 500 });
            }

            return NextResponse.json({ success: true, vehicle: data }, { status: 201 });
        }

        // 4. Acción: ACTUALIZAR ODÓMETRO
        if (action === 'update_odometer') {
            if (!vehicleId) {
                return NextResponse.json({ error: 'Falta el ID del vehículo.' }, { status: 400 });
            }

            const { error } = await adminSupabase
                .from('fleet_vehicles')
                .update({
                    current_odometer: Number(odometer) || 0,
                    last_odometer_update: new Date().toISOString()
                })
                .eq('id', vehicleId);

            if (error) {
                console.error('[API /api/transport/vehicles] Error actualizando odómetro:', error);
                return NextResponse.json({ error: error.message || 'Error al actualizar kilometraje.' }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        // 5. Acción: ASIGNAR CONDUCTOR
        if (action === 'assign_driver') {
            if (!vehicleId) {
                return NextResponse.json({ error: 'Falta el ID del vehículo.' }, { status: 400 });
            }

            const { error } = await adminSupabase
                .from('fleet_vehicles')
                .update({ driver_id: driverId || null })
                .eq('id', vehicleId);

            if (error) {
                console.error('[API /api/transport/vehicles] Error asignando conductor:', error);
                return NextResponse.json({ error: error.message || 'Error al asignar conductor.' }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        // 6. Acción: ACTUALIZAR ESTADO DEL VEHÍCULO
        if (action === 'update_status') {
            if (!vehicleId || !status) {
                return NextResponse.json({ error: 'Faltan parámetros de estado o vehículo.' }, { status: 400 });
            }

            const validStatuses = ['available', 'on_route', 'maintenance', 'inactive'];
            if (!validStatuses.includes(status)) {
                return NextResponse.json({ error: 'Estado de vehículo no válido.' }, { status: 400 });
            }

            const { error } = await adminSupabase
                .from('fleet_vehicles')
                .update({ status })
                .eq('id', vehicleId);

            if (error) {
                console.error('[API /api/transport/vehicles] Error actualizando estado:', error);
                return NextResponse.json({ error: error.message || 'Error al actualizar estado del vehículo.' }, { status: 500 });
            }

            return NextResponse.json({ success: true });
        }

        // 7. Acción: ELIMINAR VEHÍCULO
        if (action === 'delete') {
            if (!vehicleId) {
                return NextResponse.json({ error: 'Falta el ID del vehículo a eliminar.' }, { status: 400 });
            }

            // Limpiar mantenimientos programados asociados antes de borrar
            await adminSupabase
                .from('maintenance_schedules')
                .delete()
                .eq('vehicle_id', vehicleId);

            const { data, error } = await adminSupabase
                .from('fleet_vehicles')
                .delete()
                .eq('id', vehicleId)
                .select()
                .maybeSingle();

            if (error) {
                console.error('[API /api/transport/vehicles] Error eliminando vehículo:', error);
                return NextResponse.json({ error: error.message || 'Error al eliminar vehículo en base de datos.' }, { status: 500 });
            }

            return NextResponse.json({ success: true, deleted: data });
        }

        // 8. Acción: ASIGNAR / LIBERAR KIT GPS PORTÁTIL
        if (action === 'assign_gps_kit') {
            const strictAuth = await verifySessionAndPermission(request, 'admin.transport.edit');
            if (!strictAuth.authorized) {
                return NextResponse.json(
                    { error: strictAuth.error || 'Se requiere permiso admin.transport.edit para asignar kits GPS.' },
                    { status: 403 }
                );
            }
            if (!vehicleId || typeof vehicleId !== 'string') {
                return NextResponse.json({ error: 'Falta el ID del vehículo.' }, { status: 400 });
            }

            const { data: targetVehicle, error: targetErr } = await adminSupabase
                .from('fleet_vehicles')
                .select('id, plate, gps_imei, gps_kit_id, tracking_source')
                .eq('id', vehicleId)
                .maybeSingle();

            if (targetErr) throw targetErr;
            if (!targetVehicle) {
                return NextResponse.json({ error: 'Vehículo no encontrado.' }, { status: 404 });
            }

            if (!kitId) {
                if (targetVehicle.gps_kit_id) {
                    const { error: clearErr } = await adminSupabase
                        .from('fleet_vehicles')
                        .update({
                            gps_kit_id: null,
                            gps_imei: null,
                            ...(targetVehicle.tracking_source === 'hardware_gps' ? { last_gps_sync: null } : {})
                        })
                        .eq('id', targetVehicle.id);
                    if (clearErr) throw clearErr;
                }
                return NextResponse.json({ success: true, unassigned: true });
            }

            if (targetVehicle.gps_imei && !targetVehicle.gps_kit_id) {
                return NextResponse.json(
                    { error: `El vehículo ${targetVehicle.plate} ya tiene un GPS fijo instalado y no admite kit portátil.` },
                    { status: 409 }
                );
            }

            const { data: kit, error: kitErr } = await adminSupabase
                .from('portable_gps_kits')
                .select('id, label, imei, is_active')
                .eq('id', String(kitId))
                .maybeSingle();

            if (kitErr) throw kitErr;
            if (!kit) {
                return NextResponse.json({ error: 'Kit GPS portátil no encontrado.' }, { status: 404 });
            }
            if (!kit.is_active) {
                return NextResponse.json({ error: `El kit ${kit.label} está inactivo.` }, { status: 400 });
            }

            const { data: prevOwners } = await adminSupabase
                .from('fleet_vehicles')
                .select('id, tracking_source')
                .neq('id', targetVehicle.id)
                .or(`gps_kit_id.eq.${kit.id},gps_imei.eq.${kit.imei}`);

            for (const prev of prevOwners || []) {
                await adminSupabase
                    .from('fleet_vehicles')
                    .update({
                        gps_kit_id: null,
                        gps_imei: null,
                        ...(prev.tracking_source === 'hardware_gps' ? { last_gps_sync: null } : {})
                    })
                    .eq('id', prev.id);
            }

            const { error: assignErr } = await adminSupabase
                .from('fleet_vehicles')
                .update({
                    gps_kit_id: kit.id,
                    gps_imei: kit.imei
                })
                .eq('id', targetVehicle.id);

            if (assignErr) throw assignErr;

            return NextResponse.json({ success: true, kit_label: kit.label, plate: targetVehicle.plate });
        }

        return NextResponse.json({ error: `Acción '${action}' no reconocida.` }, { status: 400 });
    } catch (err: any) {
        console.error('[API /api/transport/vehicles] Excepción no controlada:', err);
        return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
    }
}
