import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { batchRecalculateAndSyncPrices, applyProductUnitConversion } from '@/lib/pricingUtils';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
    const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
    const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL || '');
    const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '');
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Credenciales de Supabase no configuradas en el entorno');
    }
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(req: NextRequest) {
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const body = await req.json();
        const { updates, fileName, collaboratorName, collaboratorId } = body;

        if (!Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ error: 'No se enviaron registros válidos para actualizar.' }, { status: 400 });
        }

        const nowIso = new Date().toISOString();
        const rawUpdates = updates.map((item: any) => ({
            product_id: item.product_id,
            manual_cost: Number(item.manual_cost),
            updated_at: item.updated_at || nowIso,
            updated_by: item.updated_by || 'EXCEL-IMPORT',
            is_active: item.is_active !== undefined ? item.is_active : true
        })).filter((item: any) => item.product_id && !isNaN(item.manual_cost) && item.manual_cost > 0);

        // Deduplicar por product_id conservando la última fila del Excel para evitar error 21000 en ON CONFLICT DO UPDATE
        const dedupedMap = new Map<string, any>();
        for (const item of rawUpdates) {
            dedupedMap.set(item.product_id, item);
        }

        // Consultar catálogo activo, conversiones y matriz actual para:
        // 1) Preservar el costo previo en el historial de matriz (`commercial_cost_matrix_history`) para COMPRA 2..8
        // 2) Propagar automáticamente el nuevo costo de padres a sus hijos derivados (`parent_id`)
        const [
            { data: allProducts },
            { data: conversions },
            { data: currentMatrix },
            { data: existingHistRow }
        ] = await Promise.all([
            supabaseAdmin.from('products').select('id, parent_id, unit_of_measure, is_active').eq('is_active', true),
            supabaseAdmin.from('product_conversions').select('product_id, from_unit, to_unit, conversion_factor'),
            supabaseAdmin.from('commercial_cost_matrix').select('product_id, manual_cost, updated_at, updated_by'),
            supabaseAdmin.from('app_settings').select('value').eq('key', 'commercial_cost_matrix_history').maybeSingle()
        ]);

        const prodMap = new Map<string, any>((allProducts || []).map((p: any) => [p.id, p]));
        const currentMatrixMap = new Map<string, any>((currentMatrix || []).map((m: any) => [m.product_id, m]));
        let parsedExistingHist: Record<string, Array<{ price: number; date: string; source: string }>> = {};
        if (existingHistRow?.value) {
            try {
                const rawVal = typeof existingHistRow.value === 'string' ? JSON.parse(existingHistRow.value) : existingHistRow.value;
                if (rawVal && typeof rawVal === 'object') {
                    parsedExistingHist = { ...rawVal };
                }
            } catch {
                parsedExistingHist = {};
            }
        }
        const historyMap: Record<string, Array<{ price: number; date: string; source: string }>> = parsedExistingHist;

        // Propagar de Padre a Hijo (parent_id) para los hijos que no vinieron explícitamente en el Excel
        for (const p of (allProducts || [])) {
            if (!p.parent_id || dedupedMap.has(p.id)) continue;
            const parentUpdate = dedupedMap.get(p.parent_id);
            if (!parentUpdate) continue;
            const parentProd = prodMap.get(p.parent_id);
            const convertedCost = applyProductUnitConversion(
                Number(parentUpdate.manual_cost),
                p.id,
                parentProd?.unit_of_measure,
                p.unit_of_measure,
                conversions || []
            );
            if (convertedCost > 0) {
                dedupedMap.set(p.id, {
                    product_id: p.id,
                    manual_cost: convertedCost,
                    updated_at: parentUpdate.updated_at || nowIso,
                    updated_by: parentUpdate.updated_by || 'EXCEL-IMPORT',
                    is_active: true
                });
            }
        }

        const cleanUpdates = Array.from(dedupedMap.values());

        if (cleanUpdates.length === 0) {
            return NextResponse.json({ error: 'Ninguno de los registros contiene product_id y costo válidos.' }, { status: 400 });
        }

        // Archivar el costo anterior vigente en `commercial_cost_matrix_history` antes de sobrescribir
        for (const upd of cleanUpdates) {
            const prev = currentMatrixMap.get(upd.product_id);
            if (prev && Number(prev.manual_cost) > 0 && prev.updated_at) {
                const prevPrice = Math.round(Number(prev.manual_cost));
                const prevDate = String(prev.updated_at);
                const newDateDay = String(upd.updated_at || nowIso).slice(0, 10);
                const prevDateDay = prevDate.slice(0, 10);
                if (prevDateDay !== newDateDay || Math.abs(prevPrice - Math.round(Number(upd.manual_cost))) >= 1) {
                    if (!Array.isArray(historyMap[upd.product_id])) {
                        historyMap[upd.product_id] = [];
                    }
                    const alreadyRecorded = historyMap[upd.product_id].some(
                        h => Math.abs(h.price - prevPrice) < 1 && String(h.date).slice(0, 10) === prevDateDay
                    );
                    if (!alreadyRecorded) {
                        historyMap[upd.product_id].unshift({
                            price: prevPrice,
                            date: prevDate,
                            source: prev.updated_by || 'EXCEL-IMPORT'
                        });
                        historyMap[upd.product_id].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                        historyMap[upd.product_id] = historyMap[upd.product_id].slice(0, 7);
                    }
                }
            }
        }

        await supabaseAdmin.from('app_settings').upsert({
            key: 'commercial_cost_matrix_history',
            value: historyMap,
            description: 'Historial de cargas de Matriz Comercial para trazabilidad COMPRA 2..8 sin contaminar órdenes de compra'
        }, { onConflict: 'key' });

        // Upsert in batches of 100 using supabaseAdmin (bypasses RLS limits)
        let updatedCount = 0;
        const BATCH_SIZE = 100;
        for (let i = 0; i < cleanUpdates.length; i += BATCH_SIZE) {
            const batch = cleanUpdates.slice(i, i + BATCH_SIZE);
            const { error: upsertError } = await supabaseAdmin
                .from('commercial_cost_matrix')
                .upsert(batch, { onConflict: 'product_id' });

            if (upsertError) {
                console.error('[Bulk Import Cost Matrix] Error in batch:', upsertError);
                return NextResponse.json({ 
                    error: `Error al actualizar matriz en BD: ${upsertError.message}` 
                }, { status: 500 });
            }
            updatedCount += batch.length;
        }

        const file = fileName || 'Archivo Excel';

        // Propagar inmediatamente los nuevos costos a los modelos de precios y catálogo de venta
        // (SDD v1.9.319: No se insertan compras ficticias de 1 Kg en `purchases`; `commercial_cost_matrix` gobierna por fecha)
        const productIds = cleanUpdates.map((item: any) => item.product_id);
        try {
            await batchRecalculateAndSyncPrices(supabaseAdmin, productIds);
        } catch (syncErr) {
            console.warn('[Bulk Import Cost Matrix] Pricing sync warning:', syncErr);
        }

        // Resolve valid collaborator_id for foreign key constraint in audit_logs (references collaborators.id)
        let validCollabId = null;
        if (collaboratorId) {
            const { data: collab } = await supabaseAdmin
                .from('collaborators')
                .select('id')
                .eq('id', collaboratorId)
                .maybeSingle();
            if (collab) {
                validCollabId = collab.id;
            }
        }

        const colName = collaboratorName || 'Administrador Comercial';

        // Insert audit log automatically with safe FK fallback
        let { error: auditError } = await supabaseAdmin
            .from('audit_logs')
            .insert([{
                action: 'BULK_IMPORT_COST_MATRIX',
                module: 'COMMERCIAL',
                collaborator_name: colName,
                collaborator_id: validCollabId,
                details: {
                    file_name: file,
                    products_updated: updatedCount,
                    summary: `Carga masiva de ${updatedCount} productos en Matriz de Costos desde ${file}`
                }
            }]);

        if (auditError && auditError.code === '23503') {
            const retry = await supabaseAdmin
                .from('audit_logs')
                .insert([{
                    action: 'BULK_IMPORT_COST_MATRIX',
                    module: 'COMMERCIAL',
                    collaborator_name: colName,
                    collaborator_id: null,
                    details: {
                        file_name: file,
                        products_updated: updatedCount,
                        summary: `Carga masiva de ${updatedCount} productos en Matriz de Costos desde ${file}`
                    }
                }]);
            auditError = retry.error;
        }

        if (auditError) {
            console.warn('[Bulk Import Cost Matrix] Warning: Could not write audit log:', auditError);
        }

        return NextResponse.json({
            success: true,
            count: updatedCount,
            message: `Se actualizaron exitosamente ${updatedCount} productos en la matriz de costos.`
        });
    } catch (err: any) {
        console.error('[Bulk Import Cost Matrix] Unhandled exception:', err);
        return NextResponse.json({ error: err.message || 'Error interno del servidor' }, { status: 500 });
    }
}
