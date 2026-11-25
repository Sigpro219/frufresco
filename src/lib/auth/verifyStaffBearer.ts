import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffAuthResult =
    | {
          ok: true;
          userId: string;
          actorName: string;
          actorEmail: string | null;
          role: string;
      }
    | {
          ok: false;
          status: 401 | 403;
          error: string;
      };

const NON_STAFF_ROLES = new Set(['', 'b2b_client', 'b2c_client', 'client']);

/**
 * Verifies Authorization: Bearer <access_token> against Supabase Auth and ensures
 * the caller is an active internal staff user (rejecting anonymous or client roles).
 */
export async function verifyStaffBearer(
    req: Request,
    supabaseAdmin: SupabaseClient
): Promise<StaffAuthResult> {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';

    if (!token) {
        return { ok: false, status: 401, error: 'Token de sesión requerido' };
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const authUser = userData?.user;
    if (userErr || !authUser) {
        return { ok: false, status: 401, error: 'Sesión inválida o expirada' };
    }

    const { data: actorProfile } = await supabaseAdmin
        .from('profiles')
        .select('id, role, contact_name, company_name, email, is_active')
        .eq('id', authUser.id)
        .maybeSingle();

    const normalizedRole = String(actorProfile?.role || '').trim().toLowerCase();
    if (!actorProfile || actorProfile.is_active === false || NON_STAFF_ROLES.has(normalizedRole)) {
        return { ok: false, status: 403, error: 'Acceso denegado: requiere rol administrativo activo' };
    }

    const actorName =
        actorProfile.contact_name ||
        actorProfile.company_name ||
        authUser.email ||
        actorProfile.email ||
        'Staff FruFresco';

    return {
        ok: true,
        userId: authUser.id,
        actorName,
        actorEmail: authUser.email || actorProfile.email || null,
        role: normalizedRole,
    };
}

/**
 * Inserts an audit_logs entry safely handling the collaborators(id) FK (code 23503).
 */
export async function insertAuditLogSafe(
    supabaseAdmin: SupabaseClient,
    params: {
        action: string;
        module: string;
        collaboratorName: string;
        collaboratorId?: string | null;
        details?: Record<string, any>;
    }
): Promise<{ data: any; error: any }> {
    let validCollabId: string | null = null;
    if (params.collaboratorId) {
        const { data: collab } = await supabaseAdmin
            .from('collaborators')
            .select('id')
            .eq('id', params.collaboratorId)
            .maybeSingle();
        if (collab) {
            validCollabId = collab.id;
        }
    }

    const baseRow = {
        action: params.action,
        module: params.module,
        collaborator_name: params.collaboratorName || 'Staff FruFresco',
        details: params.details || {},
    };

    let { data, error } = await supabaseAdmin
        .from('audit_logs')
        .insert([{ ...baseRow, collaborator_id: validCollabId }])
        .select();

    if (error && error.code === '23503') {
        const retry = await supabaseAdmin
            .from('audit_logs')
            .insert([{ ...baseRow, collaborator_id: null }])
            .select();
        data = retry.data;
        error = retry.error;
    }

    return { data, error };
}
