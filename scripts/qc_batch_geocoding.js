const fs = require('fs');
const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const [k, ...v] = line.split('=');
  if (k && v.length > 0) env[k.trim()] = v.join('=').trim().replace(/^['"]|['"]$/g, '');
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const googleKey = env['NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

function fetchGeocode(address) {
  return new Promise((resolve) => {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${googleKey}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ status: 'ERROR', error_message: e.message });
        }
      });
    }).on('error', (err) => {
      resolve({ status: 'ERROR', error_message: err.message });
    });
  });
}

async function run() {
  console.log('=== 🛰️ INICIANDO MOTOR DE GEOCODIFICACIÓN QC FRUFRESCO ===\n');
  
  // 1. Obtener todas las sucursales y clientes operativos sin GPS
  const { data: clients, error } = await supabase
    .from('profiles')
    .select('id, company_name, razon_social, nit, address, municipality, city, department, is_corporate_parent, parent_id, latitude, longitude')
    .eq('role', 'b2b_client')
    .or('is_corporate_parent.is.null,is_corporate_parent.eq.false')
    .or('latitude.is.null,longitude.is.null');

  if (error) {
    console.error('Error al consultar profiles:', error);
    return;
  }

  console.log('Total de clientes/sucursales operativas sin GPS a procesar:', clients.length);

  const autoApproved = [];
  const manualReview = [];

  for (let i = 0; i < clients.length; i++) {
    const client = clients[i];
    const rawAddress = (client.address || '').trim();
    const city = (client.municipality || client.city || 'Bogotá').trim();
    const fullQuery = rawAddress ? `${rawAddress}, ${city}, Colombia` : '';

    if (!rawAddress || rawAddress.length < 4) {
      manualReview.push({
        id: client.id,
        name: client.company_name,
        nit: client.nit,
        address: rawAddress || 'SIN DIRECCIÓN REGISTRADA',
        city: city,
        reason: 'Dirección vacía o no registrada en el perfil',
        googleAddress: 'N/A',
        precision: 'N/A',
        googleMapsUrl: 'N/A'
      });
      continue;
    }

    // Delay 100ms
    await new Promise(r => setTimeout(r, 100));

    const geoResult = await fetchGeocode(fullQuery);

    if (geoResult.status === 'OK' && geoResult.results && geoResult.results.length > 0) {
      const best = geoResult.results[0];
      const locType = best.geometry?.location_type; // 'ROOFTOP', 'RANGE_INTERPOLATED', 'GEOMETRIC_CENTER', 'APPROXIMATE'
      const lat = best.geometry?.location?.lat;
      const lng = best.geometry?.location?.lng;
      const formatted = best.formatted_address;
      const isPartial = best.partial_match === true;

      // REGLA QC: 100% Certeza (ROOFTOP sin ambigüedades)
      if (locType === 'ROOFTOP' && lat && lng) {
        // Actualizar Supabase
        const { error: updErr } = await supabase
          .from('profiles')
          .update({
            latitude: lat,
            longitude: lng,
            geocoding_status: 'verified'
          })
          .eq('id', client.id);

        if (!updErr) {
          autoApproved.push({
            id: client.id,
            name: client.company_name,
            nit: client.nit,
            originalAddress: rawAddress,
            city: city,
            formattedAddress: formatted,
            lat: lat,
            lng: lng,
            precision: 'ROOFTOP (100% Predio Exacto)'
          });
          console.log(`[🟢 ROOFTOP AUTO-GUARDADO] ${client.company_name} -> Lat: ${lat}, Lng: ${lng}`);
        } else {
          console.error('Error actualizando Supabase:', updErr);
        }
      } else {
        // No es ROOFTOP (ej. RANGE_INTERPOLATED, GEOMETRIC_CENTER, APPROXIMATE)
        let reason = `Precisión ${locType} (No es predio exacto)`;
        if (locType === 'APPROXIMATE') reason = 'Google solo ubicó el barrio o localidad general (falta placa)';
        if (locType === 'GEOMETRIC_CENTER') reason = 'Centro de vía/rotonda o complejo comercial sin local específico';
        if (locType === 'RANGE_INTERPOLATED') reason = 'Aproximación en la cuadra (Revisar número de portón exacto)';

        manualReview.push({
          id: client.id,
          name: client.company_name,
          nit: client.nit,
          address: rawAddress,
          city: city,
          reason: reason,
          googleAddress: formatted,
          precision: locType,
          googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`
        });
        console.log(`[🟡 REQUIERE REVISIÓN] ${client.company_name} -> Tipo: ${locType} | Formatted: ${formatted}`);
      }
    } else {
      manualReview.push({
        id: client.id,
        name: client.company_name,
        nit: client.nit,
        address: rawAddress,
        city: city,
        reason: 'Google no encontró la dirección (ZERO_RESULTS)',
        googleAddress: 'No encontrada',
        precision: 'NINGUNA',
        googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullQuery)}`
      });
      console.log(`[🔴 NO ENCONTRADA] ${client.company_name} -> ${rawAddress}`);
    }
  }

  // Guardar resultados
  if (!fs.existsSync('scripts')) fs.mkdirSync('scripts');
  fs.writeFileSync('scripts/qc_results.json', JSON.stringify({ autoApproved, manualReview }, null, 2));

  console.log('\n=== 📊 RESULTADO DEL PROCESO QC ===');
  console.log('✅ Sucursales con GPS asignado con 100% Certeza (ROOFTOP):', autoApproved.length);
  console.log('⚠️ Sucursales pendientes de revisión manual:', manualReview.length);
}

run();
