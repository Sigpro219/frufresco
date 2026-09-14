/**
 * Motor de Asignación Geográfica de Bahías de Piso (1 a 150)
 * y Cubicaje de Canastillas para el Modo Manual de Bodega
 * 
 * Reglas de Negocio FruFresco:
 * - 150 Espacios físicos en el suelo de la nave central (Muelle).
 * - avg_kg_per_crate = 12.52 kg (estimación de volumen).
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
}

export interface StagingAllocatorConfig {
    avg_kg_per_crate?: number;   // Default: 12.52
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
    avgKgPerCrate: number = 12.52, 
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
    return `${sorted[0]}-${sorted[sorted.length - 1]}`;
}

/**
 * Parsea y normaliza la hora de entrega a minutos del día (0..1439)
 * para contrastar la asignación de bahías con la ventana horaria (LIFO de cargue)
 */
export function parseDeliveryWindowMinutes(order: OrderStagingInput): { minutes: number; label: string } {
    if (order.manual_delivery_time) {
        const parts = order.manual_delivery_time.split(':').map(Number);
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            return {
                minutes: parts[0] * 60 + parts[1],
                label: order.manual_delivery_time
            };
        }
    }

    const slot = (order.delivery_slot || '').trim();
    if (!slot) {
        return { minutes: 7 * 60, label: 'Flexible (07:00)' };
    }

    const matchTime = slot.match(/(\d{1,2}):(\d{2})/);
    if (matchTime) {
        const h = parseInt(matchTime[1], 10);
        const m = parseInt(matchTime[2], 10);
        return { minutes: h * 60 + m, label: slot };
    }

    const upper = slot.toUpperCase();
    if (upper.includes('MADRUGADA') || upper.includes('05:') || upper.includes('06:')) {
        return { minutes: 5 * 60 + 30, label: slot || 'Madrugada (05:30)' };
    }
    if (upper === 'AM' || upper.includes('MAÑANA')) {
        return { minutes: 7 * 60, label: 'AM (07:00)' };
    }
    if (upper === 'PM' || upper.includes('TARDE')) {
        return { minutes: 14 * 60, label: 'PM (14:00)' };
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
    const avgKg = config.avg_kg_per_crate || 12.52;
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
            space_label: formatSpaceLabel(assigned)
        });
    }

    return results;
}
