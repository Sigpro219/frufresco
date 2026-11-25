/**
 * Shared pure GPS hygiene, display time window resolution, Google Polyline decoding,
 * and Google Maps direction chunking utilities (Escenario 493).
 *
 * Safe for both client components and server API routes (zero Node/DOM dependencies).
 */

export const BODEGA_CENTRAL = { lat: 4.633653, lng: -74.160647 } as const;

const GENERIC_BOGOTA_CENTROIDS = [
  { lat: 4.7109886, lng: -74.072092 },
  { lat: 4.6097, lng: -74.0817 },
] as const;

const GENERIC_CENTROID_TOLERANCE_DEG = 0.0005;
const SAME_SITE_TOLERANCE_DEG = 0.0001;
const MAX_GOOGLE_MAPS_STOPS_PER_CHUNK = 10;

export type GpsClassificationStatus =
  | 'valid'
  | 'missing'
  | 'generic_centroid'
  | 'out_of_bounds';

export interface GpsClassificationResult {
  status: GpsClassificationStatus;
  lat?: number;
  lng?: number;
  reason?: string;
}

/**
 * Classifies an order's GPS coordinates into 'valid', 'missing', 'generic_centroid', or 'out_of_bounds'.
 */
export function classifyOrderGps(lat: unknown, lng: unknown): GpsClassificationResult {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') {
    return { status: 'missing', reason: 'Sin coordenadas GPS' };
  }

  const parsedLat = typeof lat === 'number' ? lat : parseFloat(String(lat));
  const parsedLng = typeof lng === 'number' ? lng : parseFloat(String(lng));

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng) || parsedLat === 0 || parsedLng === 0) {
    return { status: 'missing', reason: 'Sin coordenadas GPS' };
  }

  const isGenericCentroid = GENERIC_BOGOTA_CENTROIDS.some(
    (c) =>
      Math.abs(parsedLat - c.lat) <= GENERIC_CENTROID_TOLERANCE_DEG &&
      Math.abs(parsedLng - c.lng) <= GENERIC_CENTROID_TOLERANCE_DEG
  );

  if (isGenericCentroid) {
    return {
      status: 'generic_centroid',
      lat: parsedLat,
      lng: parsedLng,
      reason: 'Coordenada genérica de Bogotá (centroide)',
    };
  }

  if (parsedLat < 3.5 || parsedLat > 6.0 || parsedLng < -75.5 || parsedLng > -73.0) {
    return {
      status: 'out_of_bounds',
      lat: parsedLat,
      lng: parsedLng,
      reason: 'Coordenadas fuera de cobertura Bogotá/Sabana',
    };
  }

  return {
    status: 'valid',
    lat: parsedLat,
    lng: parsedLng,
  };
}

export type OrderDisplaySlotType = 'manual' | 'profile' | 'segment_default';

export interface OrderDisplayWindow {
  startTime: string;
  endTime: string;
  displayLabel: string;
  slotType: OrderDisplaySlotType;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Resolves an order's canonical delivery time window following the 4-level hierarchy:
 * 1) Manual delivery time (+/- margin, default 60 min)
 * 2) Manual logistics_data.windows[0]
 * 3) Client profile logistics_data.windows[0] (B2B and B2C)
 * 4) Persistent segment default (B2B vs B2C from logistic_parameters)
 */
export function resolveOrderDisplayWindow(
  order: any,
  params: Record<string, any> = {}
): OrderDisplayWindow {
  if (order?.is_manual_delivery && order?.manual_delivery_time) {
    const [mh, mm] = String(order.manual_delivery_time).split(':').map(Number);
    if (
      Number.isInteger(mh) &&
      Number.isInteger(mm) &&
      mh >= 0 &&
      mh < 24 &&
      mm >= 0 &&
      mm < 60
    ) {
      const rawMargin = Number(order.manual_delivery_margin);
      const margin = Number.isFinite(rawMargin) && rawMargin > 0 ? rawMargin : 60;
      const sM = Math.max(0, mh * 60 + mm - margin);
      const eM = Math.min(1439, mh * 60 + mm + margin);
      const startTime = `${pad2(Math.floor(sM / 60))}:${pad2(sM % 60)}`;
      const endTime = `${pad2(Math.floor(eM / 60))}:${pad2(eM % 60)}`;
      return {
        startTime,
        endTime,
        displayLabel: `${startTime} - ${endTime}`,
        slotType: 'manual',
      };
    }
  }

  if (order?.is_manual_delivery && order?.logistics_data?.windows?.[0]) {
    const win = order.logistics_data.windows[0];
    const startTime = win?.startTime || win?.start;
    const endTime = win?.endTime || win?.end;
    if (startTime && endTime) {
      const s = String(startTime);
      const e = String(endTime);
      return {
        startTime: s,
        endTime: e,
        displayLabel: `${s} - ${e}`,
        slotType: 'manual',
      };
    }
  }

  if (order?.profiles?.logistics_data?.windows?.[0]) {
    const win = order.profiles.logistics_data.windows[0];
    const startTime = win?.startTime || win?.start;
    const endTime = win?.endTime || win?.end;
    if (startTime && endTime) {
      const s = String(startTime);
      const e = String(endTime);
      return {
        startTime: s,
        endTime: e,
        displayLabel: `${s} - ${e}`,
        slotType: 'profile',
      };
    }
  }

  const isB2B =
    !!order?.is_b2b ||
    (order?.type?.toLowerCase().includes('b2b') ?? false) ||
    order?.profiles?.role === 'b2b_client' ||
    order?.profiles?.role === 'b2b';

  const startTime = isB2B
    ? String(params?.b2b_default_window_start || '06:00')
    : String(params?.b2c_default_window_start || '10:00');
  const endTime = isB2B
    ? String(params?.b2b_default_window_end || '10:00')
    : String(params?.b2c_default_window_end || '14:00');

  return {
    startTime,
    endTime,
    displayLabel: `${startTime} - ${endTime}`,
    slotType: 'segment_default',
  };
}

/**
 * Pure JS decoder for Google Encoded Polyline Algorithm Format (1e5 precision).
 */
export function decodeGooglePolyline(encoded: string): Array<{ lat: number; lng: number }> {
  if (!encoded) return [];
  const points: Array<{ lat: number; lng: number }> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    if (index >= encoded.length) break;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

export interface GoogleMapsDirectionStop {
  lat: number;
  lng: number;
  label?: string;
}

export interface GoogleMapsDirectionChunk {
  label: string;
  url: string;
  stopCount: number;
  fromIndex: number;
  toIndex: number;
}

/**
 * Deduplicates consecutive same-site stops and partitions them into chained
 * Google Maps Directions URLs of at most 10 unique stops each (origin + up to 9 waypoints + destination).
 * Chunk 1 starts at BODEGA_CENTRAL; subsequent chunks start at the previous chunk's last stop.
 */
export function buildGoogleMapsDirectionChunks(
  stops: Array<GoogleMapsDirectionStop>
): Array<GoogleMapsDirectionChunk> {
  const uniqueStops: Array<GoogleMapsDirectionStop> = [];

  for (const stop of stops) {
    if (
      !stop ||
      !Number.isFinite(stop.lat) ||
      !Number.isFinite(stop.lng) ||
      stop.lat === 0 ||
      stop.lng === 0
    ) {
      continue;
    }

    const prev = uniqueStops[uniqueStops.length - 1];
    if (
      prev &&
      Math.abs(prev.lat - stop.lat) <= SAME_SITE_TOLERANCE_DEG &&
      Math.abs(prev.lng - stop.lng) <= SAME_SITE_TOLERANCE_DEG
    ) {
      continue;
    }

    uniqueStops.push(stop);
  }

  if (uniqueStops.length === 0) {
    return [];
  }

  const totalChunks = Math.ceil(uniqueStops.length / MAX_GOOGLE_MAPS_STOPS_PER_CHUNK);
  const chunks: Array<GoogleMapsDirectionChunk> = [];

  for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
    const offset = chunkIdx * MAX_GOOGLE_MAPS_STOPS_PER_CHUNK;
    const chunkStops = uniqueStops.slice(offset, offset + MAX_GOOGLE_MAPS_STOPS_PER_CHUNK);

    const origin = chunkIdx === 0 ? BODEGA_CENTRAL : uniqueStops[offset - 1];
    const destination = chunkStops[chunkStops.length - 1];
    const waypoints = chunkStops.slice(0, -1);

    const originStr = `${origin.lat},${origin.lng}`;
    const destStr = `${destination.lat},${destination.lng}`;
    const waypointsParam =
      waypoints.length > 0
        ? `&waypoints=${encodeURIComponent(waypoints.map((w) => `${w.lat},${w.lng}`).join('|'))}`
        : '';

    const fromIndex = offset + 1;
    const toIndex = offset + chunkStops.length;
    const label =
      totalChunks === 1
        ? `Ruta (${fromIndex}-${toIndex})`
        : `Tramo ${chunkIdx + 1} (${fromIndex}-${toIndex})`;

    chunks.push({
      label,
      url: `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}${waypointsParam}&travelmode=driving`,
      stopCount: chunkStops.length,
      fromIndex,
      toIndex,
    });
  }

  return chunks;
}
