const fs = require('fs');

const path = 'C:/Users/German Higuera/OneDrive/Documentos/Projects/frufresco/src/lib/stagingSpaceAllocator.ts';
let code = fs.readFileSync(path, 'utf8');

const funcCode = `

/**
 * Reacomoda y compacta las bahías de suelo en cascada continua al ajustar un pedido individual.
 * - Si reduce bahías (sobra espacio): libera los slots sobrantes y desplaza hacia abajo (slot - freedCount)
 *   todas las órdenes asignadas en posiciones posteriores, erradicando huecos vacíos en el suelo.
 * - Si amplía bahías (falta espacio): desplaza hacia arriba (slot + expandCount) todas las órdenes posteriores
 *   para abrir el hueco contiguo necesario, erradicando colisiones.
 */
export function adjustSpacesWithCascadingShift(
    prevMap: Record<string, number[]>,
    orderId: string,
    targetSpaces: number
): Record<string, number[]> {
    const currentAssigned = [...(prevMap[orderId] || [])].sort((a, b) => a - b);
    if (currentAssigned.length === targetSpaces) return prevMap;

    const newMap: Record<string, number[]> = {};

    if (currentAssigned.length === 0) {
        // Pedido sin asignación previa (S/A): asignarlo en el siguiente slot disponible al final
        const allOccupied = Object.values(prevMap).flat();
        const maxOccupied = allOccupied.length > 0 ? Math.max(...allOccupied) : 0;
        const assigned: number[] = [];
        for (let i = 1; i <= targetSpaces; i++) {
            assigned.push(maxOccupied + i);
        }
        return { ...prevMap, [orderId]: assigned };
    }

    const diff = targetSpaces - currentAssigned.length;

    if (diff < 0) {
        // REDUCCIÓN (sobra espacio, ej: de 2 a 1, diff = -1)
        const freedCount = Math.abs(diff);
        const kept = currentAssigned.slice(0, targetSpaces);
        const freed = currentAssigned.slice(targetSpaces);
        const minFreed = Math.min(...freed);

        newMap[orderId] = kept;

        Object.entries(prevMap).forEach(([id, slots]) => {
            if (id === orderId) return;
            if (!slots || slots.length === 0) {
                newMap[id] = slots;
                return;
            }
            // Si la orden está en o después del slot liberado, se desplaza hacia abajo
            if (Math.min(...slots) >= minFreed) {
                newMap[id] = slots.map(s => Math.max(1, s - freedCount));
            } else {
                newMap[id] = slots;
            }
        });
    } else {
        // EXPANSIÓN (falta espacio, ej: de 1 a 2, diff = +1)
        const expandCount = diff;
        const maxAssigned = Math.max(...currentAssigned);

        // Desplazar órdenes posteriores hacia arriba para abrir hueco
        Object.entries(prevMap).forEach(([id, slots]) => {
            if (id === orderId) return;
            if (!slots || slots.length === 0) {
                newMap[id] = slots;
                return;
            }
            if (Math.min(...slots) > maxAssigned) {
                newMap[id] = slots.map(s => s + expandCount);
            } else {
                newMap[id] = slots;
            }
        });

        const expanded = [...currentAssigned];
        for (let i = 1; i <= expandCount; i++) {
            expanded.push(maxAssigned + i);
        }
        newMap[orderId] = expanded;
    }

    return newMap;
}
`;

if (!code.includes('adjustSpacesWithCascadingShift')) {
  fs.writeFileSync(path, code.trimEnd() + funcCode, 'utf8');
  console.log('Appended adjustSpacesWithCascadingShift successfully');
} else {
  console.log('Already includes adjustSpacesWithCascadingShift');
}
