/**
 * Motor de Asignación Geográfica de Bahías de Piso (1 a 150)
 * y Cubicaje de Canastillas para el Modo Manual de Bodega
 * 
 * Reglas de Negocio FruFresco:
 * - 150 Espacios físicos en el suelo de la nave central (Muelle).
 * - avg_kg_per_crate = 12.5 kg (estimación de volumen).
 * - space_capacity = 36 canastillas apilables por bahía.
 * - Asignación contigua por zona geográfica para que clientes del mismo camión queden juntos.
 */

export interface OrderStagingInput {
    id: string;
    sequence_id?: number | string;
    client_id?: string;
    customer_name?: string;
    company_name?: string;
    shipping_address?: string;
    neighborhood?: string;
    zone_id?: string;
    zone_name?: string;
    lat?: number | null;
    lng?: number | null;
    total_weight_kg: number;
    existing_spaces?: number[];
    delivery_slot?: string;
    manual_delivery_time?: string;
    is_manual_delivery?: boolean;
    clientType?: 'hogar' | 'institucional';
    delivery_restrictions?: string | null;
    logistics_data?: any;
    profile_logistics_data?: any;
}

export interface StagingAllocationResult {
    order_id: string;
    sequence_id?: number | string;
    customer_name: string;
    shipping_address: string;
    zone_name: string;
    delivery_window_label?: string;
    total_weight_kg: number;
    estimated_crates: number;
    spaces_needed: number;
    assigned_spaces: number[];
    space_label: string; // "21" o "4-5" o "1-3"
    clientType?: 'hogar' | 'institucional';
}

export interface StagingAllocatorConfig {
    avg_kg_per_crate?: number;   // Default: 12.5
    space_capacity?: number;     // Default: 36
    max_spaces?: number;         // Default: 150
}

/**
 * Normaliza y deduce la zona geográfica principal a partir de dirección o zona
 */
export function deduceGeographicZone(order: OrderStagingInput): string {
    if (order.zone_name) return order.zone_name.trim();
    if (order.zone_id) return order.zone_id.trim();

    const addr = (order.shipping_address || '').toUpperCase();
    const neigh = (order.neighborhood || '').toUpperCase();
    const full = `${addr} ${neigh}`;

    if (full.includes('GIRARDOT') || full.includes('RICAURTE') || full.includes('MELGAR') || full.includes('ANAPOIMA') || full.includes('LA MESA')) {
        return '1. Corredor Foráneo (Suroccidente)';
    }
    if (full.includes('FONTIBON') || full.includes('FONTIBÓN') || full.includes('MODELIA') || full.includes('SALITRE') || full.includes('AEROPUERTO') || full.includes('ENGATIVA') || full.includes('ENGATIVÁ') || full.includes('CALLE 26')) {
        return '2. Corredor Occidente (Fontibón / Salitre)';
    }
    if (full.includes('TEUSAQUILLO') || full.includes('PALERMO') || full.includes('GALERIAS') || full.includes('GALERÍAS') || full.includes('CENTRO') || full.includes('CANDELARIA') || full.includes('MACARENA') || full.includes('CRA 7')) {
        return '3. Corredor Centro (Teusaquillo / Centro)';
    }
    if (full.includes('CHAPINERO') || full.includes('ZONA G') || full.includes('CALLE 72') || full.includes('CALLE 85') || full.includes('CALLE 93') || full.includes('PARQUE 93') || full.includes('ROSALES')) {
        return '4. Corredor Chapinero / Zona T';
    }
    if (full.includes('SUBA') || full.includes('USAQUEN') || full.includes('USAQUÉN') || full.includes('SANTA BARBARA') || full.includes('CEDRITOS') || full.includes('COLINA') || full.includes('CHIA') || full.includes('CHÍA') || full.includes('AUTONORTE')) {
        return '5. Corredor Norte (Suba / Usaquén / Sabana)';
    }
    if (full.includes('KENNEDY') || full.includes('BOSA') || full.includes('AMERICAS') || full.includes('AMÉRICAS') || full.includes('TUNAL') || full.includes('SUR')) {
        return '6. Corredor Sur (Kennedy / Bosa)';
    }

    return '7. Zona Metropolitana General';
}

/**
 * Calcula canastillas y cantidad de bahías necesarias para un pedido
 */
export function calculateCratesAndSpaces(
    weightKg: number, 
    avgKgPerCrate: number = 12.5, 
    spaceCapacity: number = 36
): { crates: number; spaces: number } {
    const safeWeight = Math.max(0, weightKg);
    const crates = Math.max(1, Math.ceil(safeWeight / avgKgPerCrate));
    const spaces = Math.max(1, Math.ceil(crates / spaceCapacity));
    return { crates, spaces };
}

/**
 * Genera el label formateado de espacio: "21" o "4-5" o "1-3"
 */
export function formatSpaceLabel(spaces: number[]): string {
    if (!spaces || spaces.length === 0) return 'S/A';
    if (spaces.length === 1) return `${spaces[0]}`;
    const sorted = [...spaces].sort((a, b) => a - b);
    const isContiguous = sorted.every((val, idx) => idx === 0 || val === sorted[idx - 1] + 1);
    if (isContiguous) {
        return `${sorted[0]}-${sorted[sorted.length - 1]}`;
    }
    return sorted.join(', ');
}

/**
 * Parsea y normaliza la hora de entrega a minutos del día (0..1439)
 * para contrastar la asignación de bahías con la ventana horaria (LIFO de cargue)
 */
function normalizeTimeTo24h(timeStr: string, ampm?: string): string {
    const parts = timeStr.trim().split(':');
    let h = parseInt(parts[0], 10);
    let m = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    if (isNaN(m)) m = 0;
    if (ampm) {
        const isPm = ampm.toLowerCase() === 'pm';
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseDeliveryWindowMinutes(order: OrderStagingInput): { minutes: number; label: string } {
    // 1. Prioridad: Hora manual pactada en el pedido
    if (order.manual_delivery_time) {
        const parts = order.manual_delivery_time.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return {
                minutes: parts[0] * 60 + parts[1],
                label: order.manual_delivery_time
            };
        }
    }

    // 2. Restricción Logística estructurada del cliente (logistics_data.windows / start_time / end_time)
    const logData = order.profile_logistics_data || order.logistics_data;
    if (logData?.start_time && logData?.end_time) {
        const [sh, sm] = logData.start_time.split(':').map(Number);
        return {
            minutes: (!isNaN(sh) ? sh * 60 : 7 * 60) + (!isNaN(sm) ? sm : 0),
            label: `${logData.start_time} - ${logData.end_time}`
        };
    }
    if (Array.isArray(logData?.windows) && logData.windows.length > 0 && logData.windows[0]?.startTime && logData.windows[0]?.endTime) {
        const [sh, sm] = logData.windows[0].startTime.split(':').map(Number);
        return {
            minutes: (!isNaN(sh) ? sh * 60 : 7 * 60) + (!isNaN(sm) ? sm : 0),
            label: `${logData.windows[0].startTime} - ${logData.windows[0].endTime}`
        };
    }

    // 3. Restricción Logística en texto libre (delivery_restrictions)
    const rawRestr = order.delivery_restrictions;
    if (rawRestr && typeof rawRestr === 'string' && rawRestr.trim() !== '' && rawRestr.trim() !== '[]') {
        const matchRange = rawRestr.match(/(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*(?:-|a|hasta)\s*(\d{1,2}(?::\d{2})?)\s*(am|pm)?/i);
        if (matchRange) {
            const startStr = normalizeTimeTo24h(matchRange[1], matchRange[2]);
            const endStr = normalizeTimeTo24h(matchRange[3], matchRange[4] || matchRange[2]);
            const [sh, sm] = startStr.split(':').map(Number);
            return {
                minutes: sh * 60 + (sm || 0),
                label: `${startStr} - ${endStr}`
            };
        }
    }

    // 4. Fallback a delivery_slot del pedido si no hay restricción
    const slot = (order.delivery_slot || '').trim();
    if (!slot) {
        return { minutes: 7 * 60, label: '07:00 AM (Flexible)' };
    }

    const matchTime = slot.match(/(\d{1,2}):(\d{2})/);
    if (matchTime) {
        const h = parseInt(matchTime[1], 10);
        const m = parseInt(matchTime[2], 10);
        return { minutes: h * 60 + m, label: slot };
    }

    const upper = slot.toUpperCase();
    if (upper.includes('MADRUGADA') || upper.includes('05:') || upper.includes('06:')) {
        return { minutes: 5 * 60 + 30, label: slot || '05:30 AM' };
    }
    if (upper === 'AM' || upper.includes('MAÑANA')) {
        return { minutes: 7 * 60, label: '07:00 AM (Flexible)' };
    }
    if (upper === 'PM' || upper.includes('TARDE')) {
        return { minutes: 14 * 60, label: '02:00 PM (Flexible)' };
    }

    return { minutes: 7 * 60, label: slot };
}

/**
 * Algoritmo determinístico de asignación de bahías en suelo (1 a 150)
 * con clusterización por zona geográfica y ventanas de entrega para Modo Manual
 */
export function allocateStagingSpacesGeographically(
    orders: OrderStagingInput[],
    config: StagingAllocatorConfig = {}
): StagingAllocationResult[] {
    const avgKg = config.avg_kg_per_crate || 12.5;
    const capacity = config.space_capacity || 36;
    const maxSpaces = config.max_spaces || 150;

    // 1. Enriquecer cada pedido con su zona calculada, ventana horaria y cubicaje
    const enriched = orders.map(o => {
        const zone = deduceGeographicZone(o);
        const { crates, spaces } = calculateCratesAndSpaces(o.total_weight_kg, avgKg, capacity);
        const customerName = o.company_name || o.customer_name || 'Cliente sin nombre';
        const deliveryInfo = parseDeliveryWindowMinutes(o);
        return {
            raw: o,
            zone,
            customerName,
            deliveryInfo,
            crates,
            spacesNeeded: spaces
        };
    });

    // 2. Ordenar por Clúster Geográfico, luego por Ventana de Entrega (temprana primero para LIFO), y luego por volumen
    enriched.sort((a, b) => {
        if (a.zone !== b.zone) {
            return a.zone.localeCompare(b.zone);
        }
        if (a.deliveryInfo.minutes !== b.deliveryInfo.minutes) {
            return a.deliveryInfo.minutes - b.deliveryInfo.minutes;
        }
        // Dentro de la misma ventana, los clientes más grandes primero para consolidar estiba
        return b.raw.total_weight_kg - a.raw.total_weight_kg;
    });

    // 3. Asignación secuencial de bahías contiguas en suelo (1..150)
    let currentSlot = 1;
    const results: StagingAllocationResult[] = [];

    for (const item of enriched) {
        let assigned: number[] = [];

        if (currentSlot + item.spacesNeeded - 1 <= maxSpaces) {
            for (let i = 0; i < item.spacesNeeded; i++) {
                assigned.push(currentSlot + i);
            }
            currentSlot += item.spacesNeeded;
        } else {
            // Si sobrepasa 150, se asigna en zona de rebose (150+)
            for (let i = 0; i < item.spacesNeeded; i++) {
                assigned.push(currentSlot + i);
            }
            currentSlot += item.spacesNeeded;
        }

        results.push({
            order_id: item.raw.id,
            sequence_id: item.raw.sequence_id,
            customer_name: item.customerName,
            shipping_address: item.raw.shipping_address || 'Sin dirección',
            zone_name: item.zone,
            delivery_window_label: item.deliveryInfo.label,
            total_weight_kg: item.raw.total_weight_kg,
            estimated_crates: item.crates,
            spaces_needed: item.spacesNeeded,
            assigned_spaces: assigned,
            space_label: formatSpaceLabel(assigned),
            clientType: item.raw.clientType
        });
    }

    return results;
}

/**
 * Garantiza que cada orden en una tanda tenga asignadas bahías físicas de muelle (1..150)
 * según su cubicaje real de carga (12.5 kg/canastilla, 36 canastillas/bahía) y clúster geográfico.
 * - Si una orden ya tiene bahías válidas asignadas en DB, las respeta.
 * - Para las órdenes sin bahías asignadas, busca los slots contiguos libres evitando colisiones
 *   con las bahías ya ocupadas.
 * - Si se suministra supabaseClient, persiste inmediatamente los cambios en Supabase.
 * - Muta el campo `warehouse_spaces` de los objetos rawOrders para que la vista renderice al instante.
 */
export async function ensureUniversalStagingSpaces(
    rawOrders: any[],
    supabaseClient?: any
): Promise<Record<string, number[]>> {
    if (!rawOrders || rawOrders.length === 0) return {};

    const spacesMap: Record<string, number[]> = {};
    const occupiedSlots = new Set<number>();
    const unallocatedOrders: any[] = [];

    // 1. Identificar bahías ya ocupadas y separar órdenes sin bahía
    rawOrders.forEach(o => {
        if (Array.isArray(o.warehouse_spaces) && o.warehouse_spaces.length > 0) {
            spacesMap[o.id] = o.warehouse_spaces;
            o.warehouse_spaces.forEach((slot: number) => occupiedSlots.add(slot));
        } else {
            unallocatedOrders.push(o);
        }
    });

    if (unallocatedOrders.length === 0) {
        return spacesMap;
    }

    // 2. Preparar inputs para las órdenes no asignadas
    const rawInputs: OrderStagingInput[] = unallocatedOrders.map(o => {
        const totalKg = Number(o.total_weight_kg) || 
            (o.order_items || []).reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.products?.weight_kg) || 1), 0);
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

    // 3. Enriquecer con zona geográfica, ventana LIFO y cálculo volumétrico
    const enriched = rawInputs.map(input => {
        const zone = deduceGeographicZone(input);
        const { crates, spaces } = calculateCratesAndSpaces(input.total_weight_kg, 12.5, 36);
        const customerName = input.company_name || input.customer_name || 'Cliente sin nombre';
        const deliveryInfo = parseDeliveryWindowMinutes(input);
        return {
            raw: input,
            zone,
            customerName,
            deliveryInfo,
            crates,
            spacesNeeded: spaces
        };
    });

    enriched.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
        if (a.deliveryInfo.minutes !== b.deliveryInfo.minutes) return a.deliveryInfo.minutes - b.deliveryInfo.minutes;
        return b.raw.total_weight_kg - a.raw.total_weight_kg;
    });

    // 4. Asignar slots libres contiguos evitando colisión con occupiedSlots
    let currentCandidate = 1;
    const updatesToPersist: { id: string; spaces: number[] }[] = [];

    for (const item of enriched) {
        let assigned: number[] = [];
        
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

        // Mutar en memoria para visualización reactiva inmediata
        const foundOrder = rawOrders.find(o => o.id === item.raw.id);
        if (foundOrder) {
            foundOrder.warehouse_spaces = assigned;
        }
    }

    // 5. Persistir atómicamente en Supabase si se suministra el cliente
    if (supabaseClient && updatesToPersist.length > 0) {
        Promise.all(
            updatesToPersist.map(u => 
                supabaseClient.from('orders').update({ warehouse_spaces: u.spaces }).eq('id', u.id)
            )
        ).catch(err => {
            console.error('Error persistiendo auto-asignación universal de bahías:', err);
        });
    }

    return spacesMap;
}
