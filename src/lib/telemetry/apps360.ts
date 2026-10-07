/**
 * FruFresco ERP/TMS - Telemetry & GPS M2M Connector
 * Integración con plataforma satelital apps-360.online (GPSWOX / GPS-Server Engine)
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

export interface Apps360RawDevice {
    id?: number | string;
    name?: string;
    plate_number?: string;
    lat?: number | string;
    lng?: number | string;
    speed?: number | string;
    course?: number | string;
    altitude?: number | string;
    time?: string;
    online?: string;
    device_data?: {
        id?: number | string;
        imei?: string;
        plate_number?: string;
        name?: string;
        [key: string]: any;
    };
    sensors?: Array<{
        id?: number;
        type?: string;
        name?: string;
        value?: any;
        val?: any;
    }>;
    params?: {
        acc?: string | number | boolean;
        ignition?: string | number | boolean;
        [key: string]: any;
    };
    [key: string]: any;
}

/**
 * Extrae y limpia la placa vehicular colombiana (ej. 'WFW369', 'WFW-369', 'Camión 1 WFW369' -> 'WFW369')
 */
export function extractCleanPlate(rawStr: string): string | null {
    if (!rawStr) return null;
    const cleanStr = rawStr.toUpperCase().trim();
    // Búsqueda de patrón de placa colombiana estándar (3 letras y 3 números)
    const match = cleanStr.match(/[A-Z]{3}[-\s]?[0-9]{3}/);
    if (match) {
        return match[0].replace(/[-\s]/g, '');
    }
    // Si no coincide con regex estricto, retornar texto alfanumérico limpio si tiene longitud válida
    const alphanumeric = cleanStr.replace(/[^A-Z0-9]/g, '');
    return alphanumeric.length >= 5 ? alphanumeric : null;
}

/**
 * Normaliza los datos crudos del API de GPSWOX / Apps-360 a la estructura canónica de FruFresco
 */
export function normalizeApps360Device(obj: Apps360RawDevice): NormalizedTelemetry | null {
    const rawLat = typeof obj.lat === 'string' ? parseFloat(obj.lat) : obj.lat;
    const rawLng = typeof obj.lng === 'string' ? parseFloat(obj.lng) : obj.lng;

    if (rawLat === undefined || rawLng === undefined || isNaN(rawLat) || isNaN(rawLng)) {
        return null;
    }

    // Extracción robusta de placa (device_data.plate_number > plate_number > name > plate)
    const candidateName = obj.device_data?.plate_number || obj.plate_number || obj.name || (obj as any).plate || '';
    const plate = extractCleanPlate(candidateName);
    if (!plate) return null;

    const speed = typeof obj.speed === 'string' ? parseFloat(obj.speed) : (obj.speed || 0);
    const heading = typeof obj.course === 'string' ? parseFloat(obj.course) : (obj.course || 0);
    
    // Extracción de estado de ignición (ACC):
    // 1. Revisar sensores de GPSWOX
    let isIgnitionOn = true;
    if (Array.isArray(obj.sensors) && obj.sensors.length > 0) {
        const accSensor = obj.sensors.find(s => {
            const t = (s.type || '').toLowerCase();
            const n = (s.name || '').toLowerCase();
            return t === 'acc' || t === 'ignition' || n.includes('motor') || n.includes('ignici') || n.includes('acc');
        });
        if (accSensor) {
            const rawVal = accSensor.val !== undefined ? accSensor.val : accSensor.value;
            const strVal = String(rawVal || '').toLowerCase().trim();
            isIgnitionOn = rawVal === true || rawVal === 1 || rawVal === '1' || strVal === 'on' || strVal === 'true';
        }
    } else if (obj.params?.acc !== undefined) {
        isIgnitionOn = obj.params.acc === '1' || obj.params.acc === 1 || obj.params.acc === true;
    } else if (obj.params?.ignition !== undefined) {
        isIgnitionOn = obj.params.ignition === '1' || obj.params.ignition === 1 || obj.params.ignition === true;
    }

    // Odómetro si viene reportado en sensores o en el objeto raíz
    let odometer: number | undefined;
    if (Array.isArray(obj.sensors)) {
        const odoSensor = obj.sensors.find(s => (s.type || '').toLowerCase() === 'odometer' || (s.name || '').toLowerCase().includes('od'));
        if (odoSensor && odoSensor.val !== undefined) {
            odometer = typeof odoSensor.val === 'string' ? parseFloat(odoSensor.val) : odoSensor.val;
        }
    }
    if (odometer === undefined && (obj as any).odometer !== undefined) {
        const rawOdo = (obj as any).odometer;
        odometer = typeof rawOdo === 'string' ? parseFloat(rawOdo) : rawOdo;
    }

    const imei = obj.device_data?.imei || (obj as any).imei;
    let lastGpsSync = new Date().toISOString();
    if (obj.timestamp && typeof obj.timestamp === 'number') {
        lastGpsSync = new Date(obj.timestamp * 1000).toISOString();
    } else if (obj.time || (obj as any).dt_tracker || (obj as any).dt_server) {
        const rawTime = obj.time || (obj as any).dt_tracker || (obj as any).dt_server;
        try {
            lastGpsSync = new Date(rawTime).toISOString();
        } catch (_) {}
    }

    return {
        plate,
        imei,
        latitude: rawLat,
        longitude: rawLng,
        speed: Math.max(0, isNaN(speed) ? 0 : speed),
        heading: Math.max(0, Math.min(360, isNaN(heading) ? 0 : heading)),
        ignition_status: isIgnitionOn,
        odometer_km: odometer && !isNaN(odometer) ? odometer : undefined,
        last_gps_sync: lastGpsSync,
        tracking_source: 'hardware_gps'
    };
}

// Token en memoria para reutilizar sesión durante el ciclo de vida del servidor
let cachedUserApiHash: { hash: string; expiresAt: number } | null = null;

/**
 * Autentica contra la API REST moderna de Apps-360 (GPSWOX Engine) y obtiene el user_api_hash
 */
export async function loginApps360(email?: string, password?: string, baseUrl?: string): Promise<string | null> {
    const userEmail = email || process.env.APPS360_EMAIL;
    const userPass = password || process.env.APPS360_PASSWORD || 'Gps123456';
    const host = baseUrl || process.env.APPS360_BASE_URL || 'https://plataforma.apps-360.online';

    if (!userEmail || !userPass) {
        return null;
    }

    // Reutilizar token si aún es válido
    if (cachedUserApiHash && cachedUserApiHash.expiresAt > Date.now()) {
        return cachedUserApiHash.hash;
    }

    try {
        const res = await fetch(`${host}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ email: userEmail.trim(), password: userPass.trim() }),
            next: { revalidate: 0 }
        });

        if (!res.ok) {
            console.warn(`[Apps-360 Login] Falló autenticación HTTP ${res.status}: ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        if (data.status === 1 && data.user_api_hash) {
            cachedUserApiHash = {
                hash: data.user_api_hash,
                expiresAt: Date.now() + 24 * 60 * 60 * 1000 // Cache 24 horas
            };
            return data.user_api_hash;
        } else {
            console.warn(`[Apps-360 Login] Credenciales no aceptadas:`, data.message || data);
            return null;
        }
    } catch (err: any) {
        console.error(`[Apps-360 Login] Error de conexión:`, err.message);
        return null;
    }
}

/**
 * Consulta la API REST oficial de apps-360.online y obtiene el estado en vivo de todos los vehículos
 */
export async function fetchApps360Fleet(userHashOrKey?: string, baseUrl?: string): Promise<NormalizedTelemetry[]> {
    const host = baseUrl || process.env.APPS360_BASE_URL || 'https://plataforma.apps-360.online';
    
    // 1. Obtener clave/hash: parámetro directo, env user_api_hash, env api_key o login automático
    let apiHash = userHashOrKey || process.env.APPS360_USER_API_HASH || process.env.APPS360_API_KEY || process.env.NEXT_PUBLIC_APPS360_API_KEY;

    if (!apiHash) {
        // Intento de auto-login usando APPS360_EMAIL y APPS360_PASSWORD
        apiHash = await loginApps360(undefined, undefined, host) || undefined;
    }

    if (!apiHash) {
        console.warn('[Telemetry Apps-360] No se pudo autenticar (configure APPS360_USER_API_HASH o APPS360_EMAIL y APPS360_PASSWORD)');
        return [];
    }

    try {
        // 2. Consulta de dispositivos mediante endpoint GPSWOX (/api/get_devices)
        const devicesUrl = `${host}/api/get_devices?user_api_hash=${encodeURIComponent(apiHash)}`;
        const res = await fetch(devicesUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            },
            next: { revalidate: 0 } // Cero cache para telemetría en vivo
        });

        if (res.ok) {
            const data = await res.json();
            const normalized: NormalizedTelemetry[] = [];

            // GPSWOX devuelve los dispositivos dentro de grupos: [ { items: [ device1, device2 ] } ] o un array plano
            const extractItems = (input: any): any[] => {
                if (Array.isArray(input)) {
                    const items: any[] = [];
                    for (const entry of input) {
                        if (entry && Array.isArray(entry.items)) {
                            items.push(...entry.items);
                        } else if (entry && typeof entry === 'object') {
                            items.push(entry);
                        }
                    }
                    return items;
                } else if (input && Array.isArray(input.items)) {
                    return input.items;
                }
                return [];
            };

            const deviceList = extractItems(data);
            for (const dev of deviceList) {
                if (dev && typeof dev === 'object') {
                    const norm = normalizeApps360Device(dev);
                    if (norm) normalized.push(norm);
                }
            }

            return normalized;
        }

        // 3. Fallback retrocompatible con GPS-Server.net clásico (/api/api.php)
        const legacyUrl = `${host}/api/api.php?api=user&key=${encodeURIComponent(apiHash)}&cmd=USER_GET_OBJECTS`;
        const legacyRes = await fetch(legacyUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            next: { revalidate: 0 }
        });

        if (legacyRes.ok) {
            const data = await legacyRes.json();
            const rawObjects = Array.isArray(data) ? data : (data.objects || Object.values(data) || []);
            const normalized: NormalizedTelemetry[] = [];
            for (const raw of rawObjects) {
                if (raw && typeof raw === 'object') {
                    const norm = normalizeApps360Device(raw);
                    if (norm) normalized.push(norm);
                }
            }
            return normalized;
        }

        throw new Error(`Apps-360 API error HTTP ${res.status}: ${res.statusText}`);
    } catch (err: any) {
        console.error('[Telemetry Apps-360] Error obteniendo telemetría satelital:', err.message);
        throw err;
    }
}
