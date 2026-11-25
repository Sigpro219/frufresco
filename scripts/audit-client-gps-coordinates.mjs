#!/usr/bin/env node
/**
 * Auditoría Forense Solo-Lectura de Coordenadas GPS de Clientes (Escenario 477 §1.8)
 *
 * Uso:
 *   node scripts/audit-client-gps-coordinates.mjs --env=sandbox --dry-run
 *   node scripts/audit-client-gps-coordinates.mjs --env=prod --dry-run
 *   node scripts/audit-client-gps-coordinates.mjs --env=prod --max-api-calls=50 --throttle-ms=150
 *
 * REGLA INVIOLABLE: 100% SOLO LECTURA sobre BD. Jamás ejecuta INSERT/UPDATE/DELETE.
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const found = args.find(a => a.startsWith(`--${name}=`));
  return found ? found.split('=').slice(1).join('=') : def;
};
const envMode = getArg('env', 'sandbox'); // 'sandbox' | 'prod'
const dryRun = args.includes('--dry-run');
const parsedMaxCalls = parseInt(getArg('max-api-calls', '50'), 10);
const maxApiCalls = Number.isFinite(parsedMaxCalls) ? Math.max(0, parsedMaxCalls) : 50;
const throttleMs = Math.max(50, parseInt(getArg('throttle-ms', '150'), 10) || 150);

const envFile = envMode === 'prod' ? '.env.local' : '.env.sandbox';
if (!fs.existsSync(envFile)) {
  console.error(`Archivo de entorno no encontrado: ${envFile}`);
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error(`Faltan credenciales Supabase en ${envFile}`);
  process.exit(1);
}
if (envMode === 'sandbox' && (!supabaseUrl.includes('xqhjlfhjnnrmwvklppsh') || supabaseUrl.includes('csqurhdykbalvlnpowcz'))) {
  console.error('SAFETY ABORT: --env=sandbox no apunta a FruFrescoSandbox.');
  process.exit(1);
}

const googleApiKey = env.GOOGLE_MAPS_SERVER_KEY || env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const GENERIC_CENTROIDS = [
  { name: 'Bogota_Niza_Centroid', lat: 4.7109886, lng: -74.072092 },
  { name: 'Bogota_Centro_Centroid', lat: 4.6097, lng: -74.0817 }
];

const NIZA_SUBA_RE = /\b(NIZA|SUBA|PUENTE\s+LARGO|BULEVAR|CLL?\s*127|CALLE\s*127|KR?A?\s*7[0-2]|CARRERA\s*7[0-2])\b/i;

const EXTERNAL_MUNICIPALITIES = [
  'MELGAR', 'GIRARDOT', 'RICAURTE', 'CHIA', 'CHÍA', 'CAJICA', 'CAJICÁ',
  'COTA', 'FUNZA', 'MOSQUERA', 'SOACHA', 'ZIPAQUIRA', 'ZIPAQUIRÁ',
  'TOCANCIPA', 'TOCANCIPÁ', 'TENJO', 'LA CALERA', 'MADRID', 'FACATATIVA',
  'FACATATIVÁ', 'SIBATE', 'SIBATÉ', 'SOPO', 'SOPÓ', 'TABIO', 'FLANDES',
  'ANAPOIMA', 'MESITAS', 'FUSAGASUGA', 'FUSAGASUGÁ', 'VILLET', 'PISCILAGO', 'PEÑALISA', 'PENALISA'
];

const isInsideBogotaBox = (lat, lng) => lat >= 4.46 && lat <= 4.83 && lng >= -74.22 && lng <= -73.99;

const normalizeAddr = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

async function fetchAllRows(table, selectCols) {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await sb.from(table).select(selectCols).range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

const csvEscape = (v) => {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function geocodeCandidate(query) {
  if (!googleApiKey) return null;
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:CO&key=${googleApiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) return null;
  const r = data.results[0];
  const lat = Number(r.geometry?.location?.lat);
  const lng = Number(r.geometry?.location?.lng);
  const locType = r.geometry?.location_type || 'UNKNOWN';
  const isGeneric = GENERIC_CENTROIDS.some(c => Math.abs(lat - c.lat) < 0.0005 && Math.abs(lng - c.lng) < 0.0005);
  return { lat, lng, locType, formatted: r.formatted_address, isGeneric };
}

(async () => {
  console.log(`[GPS Audit] Entorno: ${envMode.toUpperCase()} (${supabaseUrl}) | dryRun=${dryRun} | maxApiCalls=${maxApiCalls}`);

  const profiles = await fetchAllRows(
    'profiles',
    'id, company_name, razon_social, contact_name, address, address_complement, city, municipality, department, role, latitude, longitude, geocoding_status, parent_id, is_active'
  );
  const orders = await fetchAllRows('orders', 'id, profile_id');
  const activeProfileIdsWithOrders = new Set(orders.map(o => o.profile_id).filter(Boolean));

  const clientProfiles = profiles.filter(p => {
    const role = String(p.role || '').toLowerCase();
    const isClientRole = ['b2b_client', 'b2c_client', 'client', ''].includes(role);
    return (isClientRole || activeProfileIdsWithOrders.has(p.id)) && p.is_active !== false;
  });

  // Detect duplicate coordinates across distinct normalized addresses
  const coordBuckets = new Map();
  for (const p of clientProfiles) {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) continue;
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const norm = normalizeAddr(p.address);
    if (!coordBuckets.has(key)) coordBuckets.set(key, new Set());
    if (norm) coordBuckets.get(key).add(norm);
  }

  const findings = [];
  let apiCallsUsed = 0;

  for (const p of clientProfiles) {
    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    const name = p.company_name || p.razon_social || p.contact_name || p.id;
    const address = p.address || '';
    const muni = p.municipality || p.city || '';
    const fullText = `${name} ${address} ${muni}`.toUpperCase();

    const reasons = [];
    let isNizaLegitWarning = false;

    if (!hasCoords) {
      reasons.push('SIN_GPS');
    } else {
      const hitCentroid = GENERIC_CENTROIDS.find(c => Math.abs(lat - c.lat) < 0.0005 && Math.abs(lng - c.lng) < 0.0005);
      if (hitCentroid) {
        if (hitCentroid.name === 'Bogota_Niza_Centroid' && NIZA_SUBA_RE.test(address)) {
          isNizaLegitWarning = true;
          reasons.push('POSIBLE_CENTROIDE_PERO_DIR_NIZA_SUBA');
        } else {
          reasons.push(`CENTROIDE_GENERICO:${hitCentroid.name}`);
        }
      }

      const matchedExtMuni = EXTERNAL_MUNICIPALITIES.find(m => fullText.includes(m));
      if (matchedExtMuni && isInsideBogotaBox(lat, lng)) {
        reasons.push(`MUNICIPIO_EXTERNO_EN_BOGOTA:${matchedExtMuni}`);
      }

      const cKey = `${lat.toFixed(5)},${lng.toFixed(5)}`;
      if ((coordBuckets.get(cKey)?.size || 0) > 1 && !hitCentroid) {
        reasons.push(`COORD_DUPLICADA_DISTINTA_DIR(${coordBuckets.get(cKey).size})`);
      }
    }

    if (reasons.length === 0) continue;

    let proposed = null;
    if (!dryRun && googleApiKey && apiCallsUsed < maxApiCalls && address.trim().length > 3) {
      const q = `${name}, ${address}, ${muni || 'Colombia'}, Colombia`;
      proposed = await geocodeCandidate(q);
      apiCallsUsed++;
      await sleep(throttleMs);
    }

    let classification = 'ROJO_DUDOSO_VALIDACION_HUMANA';
    if (isNizaLegitWarning && reasons.length === 1) {
      classification = 'AMARILLO_REVISION_RECOMENDADA';
    } else if (proposed && !proposed.isGeneric && proposed.locType !== 'APPROXIMATE') {
      classification = 'VERDE_PROPUESTA_ALTA_CONFIANZA';
    } else if (proposed && !proposed.isGeneric) {
      classification = 'AMARILLO_REVISION_RECOMENDADA';
    }

    findings.push({
      classification,
      has_orders: activeProfileIdsWithOrders.has(p.id) ? 'SI' : 'NO',
      profile_id: p.id,
      name,
      municipality: muni,
      address,
      geocoding_status: p.geocoding_status || '',
      current_lat: hasCoords ? lat : '',
      current_lng: hasCoords ? lng : '',
      current_maps_url: hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : '',
      reasons: reasons.join(' | '),
      proposed_lat: proposed?.lat ?? '',
      proposed_lng: proposed?.lng ?? '',
      proposed_loc_type: proposed?.locType ?? '',
      proposed_formatted: proposed?.formatted ?? '',
      proposed_maps_url: proposed ? `https://www.google.com/maps?q=${proposed.lat},${proposed.lng}` : ''
    });
  }

  // Sort: profiles with orders first, then ROJO -> AMARILLO -> VERDE
  const rank = { ROJO_DUDOSO_VALIDACION_HUMANA: 0, AMARILLO_REVISION_RECOMENDADA: 1, VERDE_PROPUESTA_ALTA_CONFIANZA: 2 };
  findings.sort((a, b) => {
    if (a.has_orders !== b.has_orders) return a.has_orders === 'SI' ? -1 : 1;
    return (rank[a.classification] ?? 9) - (rank[b.classification] ?? 9);
  });

  const outDir = path.join(process.cwd(), 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const dateTag = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `audit-client-gps-${envMode}-${dateTag}.csv`);

  const headers = [
    'clasificacion', 'tiene_pedidos', 'profile_id', 'cliente', 'municipio', 'direccion',
    'geocoding_status', 'lat_actual', 'lng_actual', 'link_maps_actual', 'motivo_alerta',
    'lat_propuesta', 'lng_propuesta', 'precision_propuesta', 'direccion_google', 'link_maps_propuesto'
  ];
  const rows = findings.map(f => [
    f.classification, f.has_orders, f.profile_id, f.name, f.municipality, f.address,
    f.geocoding_status, f.current_lat, f.current_lng, f.current_maps_url, f.reasons,
    f.proposed_lat, f.proposed_lng, f.proposed_loc_type, f.proposed_formatted, f.proposed_maps_url
  ].map(csvEscape).join(','));

  fs.writeFileSync(outPath, '\uFEFF' + [headers.join(','), ...rows].join('\r\n'), 'utf8');

  const counts = findings.reduce((acc, f) => {
    acc[f.classification] = (acc[f.classification] || 0) + 1;
    return acc;
  }, {});
  console.log(`[GPS Audit] Clientes evaluados: ${clientProfiles.length} | Sospechosos: ${findings.length} | Google API calls: ${apiCallsUsed}`);
  console.log('[GPS Audit] Resumen:', counts);
  console.log(`[GPS Audit] Reporte guardado en: ${outPath}`);
})();
