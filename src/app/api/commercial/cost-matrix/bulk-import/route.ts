import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const sanitize = (val?: string) => (val || '').trim().replace(/^["']|["']$/g, '');
const supabaseUrl = sanitize(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseServiceKey = sanitize(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { updates, fileName, collaboratorName, collaboratorId } = body;

        if (!Array.isArray(updates) || updates.length === 0) {
            return NextResponse.json({ error: 'No se enviaron registros válidos para actualizar.' }, { status: 400 });
        }

        const nowIso = new Date().toISOString();
        const cleanUpdates = updates.map((item: any) => ({
            product_id: item.product_id,
            manual_cost: Number(item.manual_cost),
            updated_at: item.updated_at || nowIso,
            updated_by: item.updated_by || 'EXCEL-IMPORT',
            is_active: item.is_active !== undefined ? item.is_active : true
        })).filter((item: any) => item.product_id && !isNaN(item.manual_cost) && item.manual_cost > 0);

        if (cleanUpdates.length === 0) {
            return NextResponse.json({ error: 'Ninguno de los registros contiene product_id y costo válidos.' }, { status: 400 });
        }

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
        const file = fileName || 'Archivo Excel';

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
