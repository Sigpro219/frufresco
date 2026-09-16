import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { verifySessionAndPermission } from '@/lib/auth';

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
        const { action, vehicleId, vehicleData, odometer, driverId, status } = body;

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
                vehicle_type: String(vehicleData.vehicle_type || 'Furgón').trim(),
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
                vehicle_type: String(vehicleData.vehicle_type || 'Furgón').trim(),
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

        return NextResponse.json({ error: `Acción '${action}' no reconocida.` }, { status: 400 });
    } catch (err: any) {
        console.error('[API /api/transport/vehicles] Excepción no controlada:', err);
        return NextResponse.json({ error: err.message || 'Error interno del servidor.' }, { status: 500 });
    }
}
