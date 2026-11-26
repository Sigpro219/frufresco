export type FleetOwnership = 'Propio' | 'Tercero';

export function normalizeFleetOwnership(val?: string | null): FleetOwnership {
    return String(val || '').toLowerCase().includes('tercero') ? 'Tercero' : 'Propio';
}

export function isThirdPartyVehicle(val?: string | null): boolean {
    return normalizeFleetOwnership(val) === 'Tercero';
}
