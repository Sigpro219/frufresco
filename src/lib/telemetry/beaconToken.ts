import crypto from 'crypto';

export const ACTIVE_BEACON_ROUTE_STATUSES = [
    'planning',
    'planned',
    'loading',
    'rectified',
    'in_transit',
    'assigned',
] as const;

export type ActiveBeaconRouteStatus = (typeof ACTIVE_BEACON_ROUTE_STATUSES)[number];

export interface BeaconTokenPayload {
    route_id: string;
    plate: string;
    exp: number;
}

export function isActiveBeaconRouteStatus(status?: string | null): boolean {
    if (!status) return false;
    return (ACTIVE_BEACON_ROUTE_STATUSES as readonly string[]).includes(status.trim().toLowerCase());
}

function getBeaconSecret(): string {
    const explicit = (process.env.GPS_BEACON_SECRET || '').trim();
    if (explicit) return explicit;
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().replace(/^["']|["']$/g, '');
    if (!serviceKey) {
        throw new Error('Missing GPS_BEACON_SECRET and SUPABASE_SERVICE_ROLE_KEY');
    }
    return crypto.createHash('sha256').update(`frufresco-gps-beacon-v1:${serviceKey}`).digest('hex');
}

export function signBeaconToken(params: {
    route_id: string;
    plate: string;
    ttlMs?: number;
}): { token: string; payload: BeaconTokenPayload } {
    const ttlMs = params.ttlMs ?? 16 * 60 * 60 * 1000;
    const payload: BeaconTokenPayload = {
        route_id: String(params.route_id).trim(),
        plate: String(params.plate).trim().toUpperCase(),
        exp: Date.now() + ttlMs,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', getBeaconSecret()).update(encoded).digest('base64url');
    return { token: `${encoded}.${sig}`, payload };
}

export function verifyBeaconToken(token?: string | null): {
    valid: boolean;
    reason?: 'missing' | 'malformed' | 'invalid_signature' | 'expired';
    payload?: BeaconTokenPayload;
} {
    if (!token || typeof token !== 'string') return { valid: false, reason: 'missing' };
    const parts = token.trim().split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { valid: false, reason: 'malformed' };
    }
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', getBeaconSecret()).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig, 'utf8');
    const expectedBuf = Buffer.from(expectedSig, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return { valid: false, reason: 'invalid_signature' };
    }
    try {
        const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as BeaconTokenPayload;
        if (!parsed?.route_id || !parsed?.plate || typeof parsed?.exp !== 'number') {
            return { valid: false, reason: 'malformed' };
        }
        if (parsed.exp <= Date.now()) {
            return { valid: false, reason: 'expired', payload: parsed };
        }
        return {
            valid: true,
            payload: {
                route_id: String(parsed.route_id).trim(),
                plate: String(parsed.plate).trim().toUpperCase(),
                exp: parsed.exp,
            },
        };
    } catch {
        return { valid: false, reason: 'malformed' };
    }
}
