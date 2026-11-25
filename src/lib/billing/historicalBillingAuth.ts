/**
 * Zero-Trust Allowlist for Historical Billing-Only Orders (Escenario 490).
 * Safe for both client and server usage.
 *
 * Strictly identifies authorized users by BOTH userId and normalized email.
 * Never accepts `role === 'sys_admin'` or wildcard `'*'`.
 */

export interface HistoricalBillingUserLike {
    id?: string | null;
    email?: string | null;
}

interface AllowedHistoricalBillingUser {
    readonly id: string;
    readonly email: string;
    readonly label: string;
}

export const HISTORICAL_BILLING_ALLOWLIST: readonly AllowedHistoricalBillingUser[] = [
    {
        id: '900c3fc2-1d9d-40b4-9506-d879a7a4147e',
        email: 'e.julissaa@gmail.com',
        label: 'Julissa',
    },
    {
        id: '429f975b-0e38-47ec-8e8d-f548051be8dd',
        email: 'angidailed94@gmail.com',
        label: 'Angied',
    },
] as const;

/**
 * Returns true ONLY if the user matches an explicit allowlist entry by both
 * userId and normalized email.
 */
export function canCreateHistoricalBillingOrder(
    user: HistoricalBillingUserLike | null | undefined
): boolean {
    if (!user) return false;

    const normalizedId = String(user.id || '').trim().toLowerCase();
    const normalizedEmail = String(user.email || '').trim().toLowerCase();

    if (!normalizedId || !normalizedEmail) return false;

    return HISTORICAL_BILLING_ALLOWLIST.some(
        (entry) => entry.id === normalizedId && entry.email === normalizedEmail
    );
}
