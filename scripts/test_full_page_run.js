const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

function formatSpaceLabel(spaces) {
    if (!spaces || spaces.length === 0) return 'S/A';
    if (spaces.length === 1) return String(spaces[0]);
    const sorted = [...spaces].sort((a, b) => a - b);
    const isContiguous = sorted.every((val, idx) => idx === 0 || val === sorted[idx - 1] + 1);
    if (isContiguous) {
        return `${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    return sorted.join(', ');
}

function calculateCratesAndSpaces(weightKg, avgKgPerCrate = 12.5, spaceCapacity = 36) {
    const effectiveWeight = Math.max(0, weightKg);
    const crates = Math.ceil(effectiveWeight / avgKgPerCrate);
    const spaces = Math.max(1, Math.ceil(crates / spaceCapacity));
    return { crates, spaces };
}

function deduceGeographicZone(order) {
    const raw = `${order.shipping_address || ''} ${order.neighborhood || ''} ${order.customer_name || ''} ${order.zone_name || ''}`.toLowerCase();
    if (raw.includes('chía') || raw.includes('chia') || raw.includes('cajicá') || raw.includes('cajica') || raw.includes('zipaquirá')) {
        return 'NORTE_SABANA';
    }
    if (raw.includes('usaquén') || raw.includes('usaquen') || raw.includes('calle 1') || raw.includes('cl. 1') || raw.includes('cedritos') || raw.includes('unicentro')) {
        return 'NORTE_BOGOTA';
    }
    if (raw.includes('suba') || raw.includes('colina') || raw.includes('titan') || raw.includes('titán') || raw.includes('calle 80') || raw.includes('cl 80') || raw.includes('cl. 80')) {
        return 'NOROCCIDENTE';
    }
    if (raw.includes('fontibón') || raw.includes('fontibon') || raw.includes('calle 26') || raw.includes('cl 26') || raw.includes('aeropuerto') || raw.includes('modelia') || raw.includes('salitre')) {
        return 'OCCIDENTE';
    }
    if (raw.includes('chapinero') || raw.includes('teusaquillo') || raw.includes('zona g') || raw.includes('zona t') || raw.includes('calle 72') || raw.includes('cl 72') || raw.includes('calle 85') || raw.includes('cl 85')) {
        return 'CENTRO_ORIENTE';
    }
    if (raw.includes('kennedy') || raw.includes('bosa') || raw.includes('américas') || raw.includes('americas')) {
        return 'SUROCCIDENTE';
    }
    if (raw.includes('soacha') || raw.includes('bosa') || raw.includes('ciudad bolívar') || raw.includes('usme')) {
        return 'SUR';
    }
    return 'CENTRO_GENERAL';
}

function parseDeliveryWindowMinutes(order) {
    const slot = (order.delivery_slot || '').toLowerCase();
    const manual = (order.manual_delivery_time || '').toLowerCase();
    if (manual.includes('am') || manual.includes('pm') || manual.includes(':')) {
        const timeMatch = manual.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/);
        if (timeMatch) {
            let hours = parseInt(timeMatch[1], 10);
            const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
            const ampm = timeMatch[3];
            if (ampm === 'pm' && hours < 12) hours += 12;
            if (ampm === 'am' && hours === 12) hours = 0;
            return { minutes: hours * 60 + minutes, label: order.manual_delivery_time || manual };
        }
    }
    if (slot.includes('5') && slot.includes('7')) return { minutes: 5 * 60, label: '05:00 - 07:00 AM' };
    if (slot.includes('6') && slot.includes('8')) return { minutes: 6 * 60, label: '06:00 - 08:00 AM' };
    if (slot.includes('7') && slot.includes('9')) return { minutes: 7 * 60, label: '07:00 - 09:00 AM' };
    if (slot.includes('8') && slot.includes('10')) return { minutes: 8 * 60, label: '08:00 - 10:00 AM' };
    if (slot.includes('9') && slot.includes('11')) return { minutes: 9 * 60, label: '09:00 - 11:00 AM' };
    if (slot.includes('10') && slot.includes('12')) return { minutes: 10 * 60, label: '10:00 - 12:00 PM' };
    if (slot.includes('tarde') || slot.includes('pm')) return { minutes: 14 * 60, label: '02:00 - 05:00 PM' };
    return { minutes: 7 * 60, label: 'Franja Estándar Mañana' };
}

async function ensureUniversalStagingSpaces(rawOrders, supabaseClient) {
    if (!rawOrders || rawOrders.length === 0) return {};
    const spacesMap = {};
    const occupiedSlots = new Set();
    const unallocatedOrders = [];

    rawOrders.forEach(o => {
        if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
            spacesMap[o.id] = o.warehouse_spaces;
            o.warehouse_spaces.forEach(slot => occupiedSlots.add(slot));
        } else {
            unallocatedOrders.push(o);
        }
    });

    if (unallocatedOrders.length === 0) return spacesMap;

    const rawInputs = unallocatedOrders.map(o => {
        const totalKg = Number(o.total_weight_kg) || 
            (o.order_items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.products?.weight_kg) || 1), 0);
        return {
            id: o.id,
            sequence_id: o.sequence_id,
            client_id: o.profile_id || o.profiles?.id,
            customer_name: o.customer_name || o.profiles?.contact_name,
            company_name: o.profiles?.company_name || o.customer_name || 'Cliente sin nombre',
            shipping_address: o.shipping_address || o.profiles?.address || '',
            neighborhood: o.profiles?.neighborhood || '',
            delivery_slot: o.delivery_slot || '',
            manual_delivery_time: o.manual_delivery_time || '',
            is_manual_delivery: o.is_manual_delivery || false,
            total_weight_kg: totalKg > 0 ? totalKg : 15,
            existing_spaces: []
        };
    });

    const enriched = rawInputs.map(input => {
        const zone = deduceGeographicZone(input);
        const { crates, spaces } = calculateCratesAndSpaces(input.total_weight_kg, 12.5, 36);
        const customerName = input.company_name || input.customer_name || 'Cliente sin nombre';
        const deliveryInfo = parseDeliveryWindowMinutes(input);
        return { raw: input, zone, customerName, deliveryInfo, crates, spacesNeeded: spaces };
    });

    enriched.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
        if (a.deliveryInfo.minutes !== b.deliveryInfo.minutes) return a.deliveryInfo.minutes - b.deliveryInfo.minutes;
        return b.raw.total_weight_kg - a.raw.total_weight_kg;
    });

    let currentCandidate = 1;
    const updatesToPersist = [];

    for (const item of enriched) {
        let assigned = [];
        while (assigned.length < item.spacesNeeded) {
            let allFree = true;
            for (let offset = 0; offset < item.spacesNeeded; offset++) {
                if (occupiedSlots.has(currentCandidate + offset)) {
                    allFree = false;
                    currentCandidate = currentCandidate + offset + 1;
                    break;
                }
            }
            if (allFree) {
                for (let offset = 0; offset < item.spacesNeeded; offset++) {
                    const slot = currentCandidate + offset;
                    assigned.push(slot);
                    occupiedSlots.add(slot);
                }
                currentCandidate += item.spacesNeeded;
            }
        }

        spacesMap[item.raw.id] = assigned;
        updatesToPersist.push({ id: item.raw.id, spaces: assigned });

        const foundOrder = rawOrders.find(o => o.id === item.raw.id);
        if (foundOrder) {
            foundOrder.warehouse_spaces = assigned;
        }
    }

    if (supabaseClient && updatesToPersist.length > 0) {
        await Promise.all(
            updatesToPersist.map(u => 
                supabaseClient.from('orders').update({ warehouse_spaces: u.spaces }).eq('id', u.id)
            )
        ).catch(err => {
            console.error('Error persistiendo:', err);
        });
    }

    return spacesMap;
}

async function testFullRun() {
  const selectedDate = '2026-10-24';
  const OPERATIONAL_STATUSES = ['pending_approval', 'pending', 'recibido', 'para_compra', 'approved', 'picking', 'shipped', 'delivered', 'completed'];

  const { data: rawOrders } = await supabase
    .from('orders')
    .select(`
        id, sequence_id, delivery_date, delivery_slot, shipping_address, warehouse_spaces, status, profile_id, type, logistics_data,
        profiles:profile_id(id, created_at, parent_id, company_name, contact_name, address, role, logistics_data),
        order_items(
            id, order_id, product_id, quantity, unit, nickname, variant_label, selected_options,
            products(id, name, sku, accounting_id, unit_of_measure, buying_team, category, weight_kg, parent_id)
        )
    `)
    .eq('delivery_date', selectedDate)
    .in('status', OPERATIONAL_STATUSES)
    .order('created_at', { ascending: true });

  console.log('Orders retrieved from DB:', rawOrders.length);

  await ensureUniversalStagingSpaces(rawOrders, supabase);

  const parsedOrders = rawOrders.map(o => {
    const spaceLabel = (o.warehouse_spaces && o.warehouse_spaces.length > 0)
        ? formatSpaceLabel(o.warehouse_spaces)
        : 'S/A';

    const firstSpace = (o.warehouse_spaces && o.warehouse_spaces.length > 0)
        ? o.warehouse_spaces[0]
        : 999;

    return {
      sequence_id: o.sequence_id,
      client: o.profiles?.company_name || o.profiles?.contact_name,
      spaces: o.warehouse_spaces,
      space_label: spaceLabel,
      first_space: firstSpace
    };
  });

  parsedOrders.sort((a, b) => a.first_space - b.first_space);

  const saCount = parsedOrders.filter(o => o.space_label === 'S/A').length;
  console.log('Total orders:', parsedOrders.length);
  console.log('Orders with S/A:', saCount);
  console.log('Orders with assigned spaces:', parsedOrders.length - saCount);

  console.log('\nTop 15 sorted orders:');
  parsedOrders.slice(0, 15).forEach(o => {
    console.log(`LUGAR: ${o.space_label.padEnd(6)} | FirstSpace: ${String(o.first_space).padEnd(3)} | #${o.sequence_id} - ${o.client}`);
  });

  console.log('\nLast 10 sorted orders:');
  parsedOrders.slice(-10).forEach(o => {
    console.log(`LUGAR: ${o.space_label.padEnd(6)} | FirstSpace: ${String(o.first_space).padEnd(3)} | #${o.sequence_id} - ${o.client}`);
  });
}

testFullRun();
