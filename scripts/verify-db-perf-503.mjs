import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_APP_SETTINGS_KEYS = [
    'friogan_storefront_mode',
    'store_status',
    'cutoff_hour_public',
    'min_order_hogar',
    'delivery_fee',
    'store_vacation_config',
    'global_banner',
    'global_banner_en',
    'contact_phone',
    'enable_b2b_lead_capture',
    'app_logo_url',
    'hero_image_url',
    'home_catalog_title',
    'home_featured_title',
    'scarcity_locked_skus',
];

function loadEnv() {
    const envPath = path.join(process.cwd(), '.env.local');
    const raw = fs.readFileSync(envPath, 'utf8');
    const get = (k) => {
        const m = raw.match(new RegExp(`^${k}=(.+)$`, 'm'));
        return m ? m[1].trim().replace(/^["']|["']$/g, '') : '';
    };
    return {
        url: get('NEXT_PUBLIC_SUPABASE_URL'),
        anonKey: get('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        serviceKey: get('SUPABASE_SERVICE_ROLE_KEY'),
    };
}

async function timedFetch(url, headers) {
    const t0 = performance.now();
    const res = await fetch(url, { headers });
    const text = await res.text();
    const ms = Math.round(performance.now() - t0);
    const bytes = Buffer.byteLength(text, 'utf8');
    return { status: res.status, ms, bytes, text };
}

async function main() {
    const { url, anonKey, serviceKey } = loadEnv();
    if (!url || !anonKey || !serviceKey) {
        console.error('Faltan credenciales en .env.local');
        process.exit(1);
    }

    const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
    const anonHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };

    // 1. Auth health & basic profile query
    const authRes = await timedFetch(`${url}/auth/v1/health`, { apikey: anonKey });
    const profRes = await timedFetch(`${url}/rest/v1/profiles?select=id&limit=1`, serviceHeaders);

    // 2. app_settings: Full vs Public Filtered
    const fullSettings = await timedFetch(`${url}/rest/v1/app_settings?select=key,value`, serviceHeaders);
    const inList = PUBLIC_APP_SETTINGS_KEYS.map(k => `"${k}"`).join(',');
    const filteredSettings = await timedFetch(
        `${url}/rest/v1/app_settings?select=key,value&key=in.(${encodeURIComponent(inList)})`,
        anonHeaders
    );

    const fullKb = +(fullSettings.bytes / 1024).toFixed(2);
    const filteredKb = +(filteredSettings.bytes / 1024).toFixed(2);
    const reductionPct = fullSettings.bytes > 0
        ? +(((fullSettings.bytes - filteredSettings.bytes) / fullSettings.bytes) * 100).toFixed(1)
        : 0;

    // 3. CommercialUnifiedDashboard query check (iva_rate instead of tax_rate)
    const commQuery = await timedFetch(
        `${url}/rest/v1/orders?select=id,sequence_id,order_items(id,product_id,products(id,name,accounting_id,unit_of_measure,iva_rate))&limit=5`,
        serviceHeaders
    );

    // 4. Storefront products query check
    const prodQuery = await timedFetch(
        `${url}/rest/v1/products?select=id,name,iva_rate&is_active=eq.true&show_on_web=eq.true&limit=500`,
        serviceHeaders
    );

    console.log('=== Escenario 503 — Benchmark Read-Only Supabase ===');
    console.table([
        { check: 'auth/v1/health', status: authRes.status, ms: authRes.ms, kb: +(authRes.bytes / 1024).toFixed(2) },
        { check: 'profiles (1 row)', status: profRes.status, ms: profRes.ms, kb: +(profRes.bytes / 1024).toFixed(2) },
        { check: 'app_settings SIN filtro (antes)', status: fullSettings.status, ms: fullSettings.ms, kb: fullKb },
        { check: 'app_settings FILTRADA 15 keys (ahora)', status: filteredSettings.status, ms: filteredSettings.ms, kb: filteredKb },
        { check: 'orders + products.iva_rate (fix 42703)', status: commQuery.status, ms: commQuery.ms, kb: +(commQuery.bytes / 1024).toFixed(2) },
        { check: 'products storefront (limit 500)', status: prodQuery.status, ms: prodQuery.ms, kb: +(prodQuery.bytes / 1024).toFixed(2) },
    ]);
    console.log(`Reduccion payload app_settings: ${fullKb} KB -> ${filteredKb} KB (-${reductionPct}%)`);

    const failed = [authRes, profRes, filteredSettings, commQuery, prodQuery].some(r => r.status !== 200);
    if (failed) {
        console.error('Al menos una consulta fallo con HTTP != 200.');
        process.exit(1);
    }
    if (filteredKb > 15) {
        console.error(`app_settings filtrada excede 15 KB (${filteredKb} KB)`);
        process.exit(1);
    }
    console.log('ALL CHECKS PASSED (EXIT 0)');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
