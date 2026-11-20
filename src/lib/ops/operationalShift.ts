/**
 * Contrato de Turno Operativo Diario (Ciclo de Vida & Modo Espejo vs Digital Nativo).
 * SDD Escenario 468.
 */

export type OperationalShiftMode = 'manual_mirror' | 'digital_native';
export type OperationalShiftStatus = 'open' | 'closed';

const CLIENT_ROLES = new Set(['b2b_client', 'b2c_client', 'client']);

/**
 * Canonical staff gate (SPEC.md Escenario 477 §4 C2).
 * Never trusts profile_type === 'employee' alone because B2B/B2C clients carry it in legacy profiles.
 */
export function isOperationalStaffProfile(
    profile?: { role?: string | null } | null
): boolean {
    const role = (profile?.role || '').trim().toLowerCase();
    return Boolean(role) && !CLIENT_ROLES.has(role);
}

export interface OperationalShiftState {
    id?: string;
    shift_date: string;
    mode: OperationalShiftMode;
    status: OperationalShiftStatus;
    opened_by?: string | null;
    closed_by?: string | null;
    closed_at?: string | null;
    notes?: string | null;
    source?: 'operational_shifts' | 'app_settings';
}

export async function fetchActiveShiftClient(): Promise<OperationalShiftState | null> {
    try {
        const res = await fetch('/api/ops/shifts', { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        return json?.shift || null;
    } catch {
        return null;
    }
}
