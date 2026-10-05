import test from 'node:test';
import assert from 'node:assert/strict';

// Helper de simulación heurística por capacidad (espejo del motor canónico)
function simulateCapacityAllocation(orders: any[], vehicles: any[]) {
    const assignments: Record<string, string[]> = {};
    vehicles.forEach(v => {
        assignments[v.id] = [];
    });

    // Agrupación por ubicación y cliente
    const grouped: Record<string, typeof orders> = {};
    orders.forEach(o => {
        const key = `${o.latitude || ''}_${o.longitude || ''}_${o.customer_name}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(o);
    });

    // Ordenar grupos: Prioridad Pareto (B2B primero), luego por masa total descendente
    const groups = Object.values(grouped).sort((a, b) => {
        const isB2BA = a.some(o => o.is_b2b);
        const isB2BB = b.some(o => o.is_b2b);
        if (isB2BA !== isB2BB) return isB2BB ? 1 : -1;

        const weightA = a.reduce((sum, o) => sum + o.total_weight_kg, 0);
        const weightB = b.reduce((sum, o) => sum + o.total_weight_kg, 0);
        return weightB - weightA;
    });

    groups.forEach(group => {
        const groupWeight = group.reduce((sum, o) => sum + o.total_weight_kg, 0);
        let bestVehicle: any = null;
        let minWeight = Infinity;

        vehicles.forEach(v => {
            const currentWeight = assignments[v.id].reduce((sum, id) => {
                const o = orders.find(ord => ord.id === id);
                return sum + (o?.total_weight_kg || 0);
            }, 0);

            if (currentWeight + groupWeight <= v.capacity_kg && currentWeight < minWeight) {
                minWeight = currentWeight;
                bestVehicle = v;
            }
        });

        // Solo se asigna si cabe dentro de la capacidad física del camión
        if (minWeight !== Infinity && bestVehicle) {
            group.forEach(order => {
                assignments[bestVehicle.id].push(order.id);
            });
        }
    });

    const assignedIds = new Set(Object.values(assignments).flat());
    const unassignedOrders = orders.filter(o => !assignedIds.has(String(o.id)));
    const skippedOrders = unassignedOrders.map(o => ({
        orderId: String(o.id),
        reasons: [{ code: 'DEMAND_EXCEEDS_VEHICLE_CAPACITY' }]
    }));

    return {
        assignments,
        unassignedOrders,
        skippedOrders
    };
}

test('Transport Capacity Stress: Flota Insuficiente vs Demanda Masiva', async (t) => {
    // Escenario: 1 solo furgón pequeño de 800 kg
    const vehicles = [
        { id: 'furgon-01', plate: 'WKL-100', capacity_kg: 800 }
    ];

    // 25 pedidos que suman 2.500 kg (Más del triple de la capacidad)
    const orders: any[] = [];
    for (let i = 1; i <= 25; i++) {
        const isB2B = i <= 10; // Primeros 10 son B2B
        orders.push({
            id: `ord-${i}`,
            customer_name: isB2B ? `Restaurante B2B #${i}` : `Hogar B2C #${i}`,
            is_b2b: isB2B,
            total_weight_kg: 100, // 25 pedidos * 100 kg = 2.500 kg
            latitude: 4.65 + (i * 0.001),
            longitude: -74.05 - (i * 0.001)
        });
    }

    await t.test('1. Nunca sobrecarga el vehículo por encima de su capacidad máxima', () => {
        const { assignments } = simulateCapacityAllocation(orders, vehicles);
        const assignedIds = assignments['furgon-01'];
        const totalAssignedWeight = assignedIds.reduce((sum, id) => {
            const o = orders.find(ord => ord.id === id);
            return sum + (o?.total_weight_kg || 0);
        }, 0);

        assert.ok(totalAssignedWeight <= vehicles[0].capacity_kg, `El peso asignado (${totalAssignedWeight}kg) excedió la capacidad (${vehicles[0].capacity_kg}kg)`);
        assert.equal(assignedIds.length, 8, 'Deben asignarse exactamente 8 pedidos de 100kg para alcanzar los 800kg exactos');
    });

    await t.test('2. Los pedidos que exceden la flota se reportan como skipped_orders', () => {
        const { unassignedOrders, skippedOrders } = simulateCapacityAllocation(orders, vehicles);
        assert.equal(unassignedOrders.length, 17, 'Deben quedar exactamente 17 pedidos sin asignar');
        assert.equal(skippedOrders.length, 17, 'El array skippedOrders debe reportar los 17 pedidos descartados');
        assert.equal(skippedOrders[0].reasons[0].code, 'DEMAND_EXCEEDS_VEHICLE_CAPACITY');
    });

    await t.test('3. Prioriza cuentas corporativas B2B sobre B2C (Pareto Priority)', () => {
        const { assignments } = simulateCapacityAllocation(orders, vehicles);
        const assignedIds = assignments['furgon-01'];
        const assignedOrders = orders.filter(o => assignedIds.includes(o.id));
        
        const b2bCount = assignedOrders.filter(o => o.is_b2b).length;
        assert.equal(b2bCount, 8, 'Los 8 cupos del camión deben ser otorgados a clientes B2B');
    });
});
