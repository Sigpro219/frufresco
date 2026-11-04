function adjustSpacesWithCascadingShift(prevMap, orderId, targetSpaces) {
  const currentAssigned = [...(prevMap[orderId] || [])].sort((a, b) => a - b);
  if (currentAssigned.length === targetSpaces) return prevMap;

  const newMap = {};

  if (currentAssigned.length === 0) {
    // S/A -> asignar al final
    const allOccupied = Object.values(prevMap).flat();
    const maxOccupied = allOccupied.length > 0 ? Math.max(...allOccupied) : 0;
    const assigned = [];
    for (let i = 1; i <= targetSpaces; i++) assigned.push(maxOccupied + i);
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
      // Si la orden está después de los espacios liberados, se desplaza hacia abajo
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

// Test cases
const testMap = {
  'ord-A': [40, 41],
  'ord-B': [42, 43], // Aldimark
  'ord-C': [44],
  'ord-D': [45, 46]
};

console.log('--- TEST REDUCCIÓN (Aldimark de 2 a 1) ---');
const res1 = adjustSpacesWithCascadingShift(testMap, 'ord-B', 1);
console.log('Original:', testMap);
console.log('Resultado:', res1);

console.log('\n--- TEST EXPANSIÓN (ord-C de 1 a 3) ---');
const res2 = adjustSpacesWithCascadingShift(res1, 'ord-C', 3);
console.log('Resultado tras expansión:', res2);
