/**
 * FruFresco ERP/TMS - Telemetry & GPS M2M Connector
 * Integración con plataforma satelital apps-360.online (GPS-Server.net Engine v4.5)
 * SPEC.md v1.9.75 - Dominio de Transporte
 */

export interface NormalizedTelemetry {
    plate: string;
    imei?: string;
    latitude: number;
    longitude: number;
    speed: number;
    heading: number;
    ignition_status: boolean;
    odometer_km?: number;
    last_gps_sync: string;
    tracking_source: 'hardware_gps' | 'mobile_app';
}

export interface Apps360RawObject {
    imei?: string;
    name?: string;
    plate?: string;
    lat?: number | string;
    lng?: number | string;
    speed?: number | string;
    course?: number | string;
    altitude?: number | string;
    odometer?: number | string;
    dt_server?: string;
    dt_tracker?: string;
    params?: {
        acc?: string | number | boolean;
        ignition?: string | number | boolean;
        [key: string]: any;
    };
    [key: string]: any;
}

/**
 * Normaliza los datos crudos del API de GPS-Server.net a la estructura de FruFresco
 */
export function normalizeApps360Object(obj: Apps360RawObject): NormalizedTelemetry | null {
    const rawLat = typeof obj.lat === 'string' ? parseFloat(obj.lat) : obj.lat;
    const rawLng = typeof obj.lng === 'string' ? parseFloat(obj.lng) : obj.lng;

    if (rawLat === undefined || rawLng === undefined || isNaN(rawLat) || isNaN(rawLng)) {
        return null;
    }

    const plate = (obj.plate || obj.name || '').trim().toUpperCase();
    if (!plate) return null;

    const speed = typeof obj.speed === 'string' ? parseFloat(obj.speed) : (obj.speed || 0);
    const heading = typeof obj.course === 'string' ? parseFloat(obj.course) : (obj.course || 0);
    
    // Extracción de estado de ignición (ACC)
    let isIgnitionOn = true;
    if (obj.params?.acc !== undefined) {
        isIgnitionOn = obj.params.acc === '1' || obj.params.acc === 1 || obj.params.acc === true;
    } else if (obj.params?.ignition !== undefined) {
        isIgnitionOn = obj.params.ignition === '1' || obj.params.ignition === 1 || obj.params.ignition === true;
    }

    // Odómetro si viene reportado
    const odometer = obj.odometer ? (typeof obj.odometer === 'string' ? parseFloat(obj.odometer) : obj.odometer) : undefined;

    return {
        plate,
        imei: obj.imei,
        latitude: rawLat,
        longitude: rawLng,
        speed: Math.max(0, isNaN(speed) ? 0 : speed),
        heading: Math.max(0, Math.min(360, isNaN(heading) ? 0 : heading)),
        ignition_status: isIgnitionOn,
        odometer_km: odometer && !isNaN(odometer) ? odometer : undefined,
        last_gps_sync: obj.dt_tracker ? new Date(obj.dt_tracker).toISOString() : new Date().toISOString(),
        tracking_source: 'hardware_gps'
    };
}

/**
 * Consulta la API REST oficial de apps-360.online y obtiene el estado en vivo de todos los vehículos
 */
export async function fetchApps360Fleet(apiKey?: string, baseUrl?: string): Promise<NormalizedTelemetry[]> {
    const key = apiKey || process.env.APPS360_API_KEY || process.env.NEXT_PUBLIC_APPS360_API_KEY;
    const host = baseUrl || process.env.APPS360_BASE_URL || 'https://plataforma.apps-360.online';

    if (!key) {
        console.warn('[Telemetry Apps-360] No API Key provided in environment (APPS360_API_KEY)');
        return [];
    }

    try {
        const url = `${host}/api/api.php?api=user&key=${encodeURIComponent(key)}&cmd=USER_GET_OBJECTS`;
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            next: { revalidate: 0 } // No cache para telemetría
        });

        if (!res.ok) {
            throw new Error(`Apps-360 API error HTTP ${res.status}: ${res.statusText}`);
        }

        const data = await res.json();
        const rawObjects: Apps360RawObject[] = Array.isArray(data) ? data : (data.objects || Object.values(data) || []);

        const normalized: NormalizedTelemetry[] = [];
        for (const raw of rawObjects) {
            if (raw && typeof raw === 'object') {
                const norm = normalizeApps360Object(raw);
                if (norm) normalized.push(norm);
            }
        }

        return normalized;
    } catch (err: any) {
        console.error('[Telemetry Apps-360] Failed to fetch fleet telemetry:', err.message);
        throw err;
    }
}
